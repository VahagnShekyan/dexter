/**
 * Fact resolver.
 *
 * Given a CompanyFacts payload and a requested set of periods, walk a
 * GAAP concept map and return the best matching fact for each
 * (concept, period) pair.
 *
 * "Best matching" rules:
 *   1. Period match: for `instant` concepts, fact.end === period.endDate;
 *      for `duration` concepts, fact.start === period.startDate AND
 *      fact.end === period.endDate.
 *   2. Form preference: when a period has multiple facts (e.g. an annual
 *      number reported in both a 10-K and a later 10-K/A amendment), pick
 *      the one filed most recently — this captures restatements.
 *   3. Tag-order preference: if the first tag in a concept's `tags` list
 *      yields nothing for any of the requested periods, fall through to
 *      the next tag. Different companies report under different tag names.
 */

import type { CompanyFacts, XbrlFact } from './companyfacts.js';
import type { ConceptMap, GaapConcept } from './gaap/types.js';

export interface RequestedPeriod {
  /** Period end date, YYYY-MM-DD. */
  endDate: string;
  /** Period start date, YYYY-MM-DD. Required for duration concepts. */
  startDate?: string;
  /** Fiscal period label ("FY", "Q1", "Q2", "Q3", "Q4"). */
  fiscalPeriod: string;
  /** Fiscal year. */
  fiscalYear: number;
}

export interface ResolvedField {
  field: string;
  value: number | null;
  /** Sign-adjusted value if the concept declares `sign: 'negate'`. */
  fact: XbrlFact | null;
  /** The tag that produced this value (for debugging). */
  resolvedTag: string | null;
}

/**
 * Resolve all concepts in a map for a single period.
 * Missing fields return `value: null` rather than being omitted, so the
 * output schema is stable across periods.
 */
export function resolveConceptsForPeriod(
  facts: CompanyFacts,
  conceptMap: ConceptMap,
  period: RequestedPeriod,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const concept of conceptMap) {
    const resolved = resolveOneConcept(facts, concept, period);
    out[concept.field] = resolved.value;
  }
  return out;
}

/**
 * Resolve a single concept for a single period.
 *
 * Walks the tag list in order. For each tag, looks for a fact matching
 * the requested period — first tag with a hit wins. Critically: a tag
 * having OTHER data (different period) does NOT short-circuit the walk.
 * This is what lets us survive companies that migrate between tag names
 * mid-history (e.g. NVDA: RevenueFromContract... → Revenues in FY2024).
 */
export function resolveOneConcept(
  facts: CompanyFacts,
  concept: GaapConcept,
  period: RequestedPeriod,
): ResolvedField {
  const taxonomyFacts = facts.facts[concept.taxonomy];
  if (!taxonomyFacts) {
    return { field: concept.field, value: null, fact: null, resolvedTag: null };
  }

  for (const tag of concept.tags) {
    const conceptData = taxonomyFacts[tag];
    if (!conceptData) continue;

    const unitFacts = conceptData.units[concept.unit];
    if (!unitFacts || unitFacts.length === 0) continue;

    const candidates = unitFacts.filter((fact) => matchesPeriod(fact, period, concept.periodType));
    if (candidates.length === 0) continue;

    // Pick the most recently filed fact (handles restatements)
    const winner = candidates.reduce((best, cur) =>
      Date.parse(cur.filed) > Date.parse(best.filed) ? cur : best,
    );

    const value = concept.sign === 'negate' ? -winner.val : winner.val;
    return { field: concept.field, value, fact: winner, resolvedTag: tag };
  }

  return { field: concept.field, value: null, fact: null, resolvedTag: null };
}

function matchesPeriod(
  fact: XbrlFact,
  period: RequestedPeriod,
  periodType: 'duration' | 'instant',
): boolean {
  if (fact.end !== period.endDate) return false;
  if (periodType === 'instant') return true;
  // Duration: also require the start date to match
  return fact.start === period.startDate;
}

// ---------------------------------------------------------------------------
// Period discovery
// ---------------------------------------------------------------------------

/**
 * Walk all of a company's reported facts and produce the canonical list of
 * (fiscalYear, fiscalPeriod, startDate, endDate) tuples that have any
 * data at all. Used to know which periods we can assemble a statement for.
 *
 * We anchor on a "spine" concept that every company files reliably — for
 * income statements, that's `Revenues` / `RevenueFromContract...`. For
 * balance sheets, `Assets`. For cash flow, `NetCashProvidedByUsedIn...`.
 *
 * Dedup rules:
 *   The same period appears in multiple filings — once in its original
 *   10-K/Q, then again as comparative data in every subsequent 10-K/Q.
 *   Each occurrence carries the FORM's `fy`/`fp`, not the period's. We
 *   dedupe by the actual period tuple `(start_date, end_date)` and pull
 *   the metadata `fy`/`fp` from the EARLIEST-filed occurrence (i.e. the
 *   period's own original report, where form-fy matches period-fy).
 */
export function discoverPeriods(
  facts: CompanyFacts,
  spineConcept: GaapConcept,
  options: { period: 'annual' | 'quarterly' },
): RequestedPeriod[] {
  const taxonomyFacts = facts.facts[spineConcept.taxonomy];
  if (!taxonomyFacts) return [];

  // Aggregate facts across ALL spine tags — companies migrate between
  // tag names over time (e.g. NVDA used `RevenueFromContract...` through
  // FY2022 then switched to `Revenues` in FY2024). Stopping at the first
  // tag with data would miss whichever half of history uses the other tag.
  const unitFacts: XbrlFact[] = [];
  for (const tag of spineConcept.tags) {
    const concept = taxonomyFacts[tag];
    if (!concept) continue;
    const candidate = concept.units[spineConcept.unit];
    if (candidate && candidate.length > 0) {
      unitFacts.push(...candidate);
    }
  }
  if (unitFacts.length === 0) return [];

  // Filter to the right fiscal-period flavor.
  const wantedFp =
    options.period === 'annual'
      ? new Set(['FY'])
      : new Set(['Q1', 'Q2', 'Q3', 'Q4']);

  // For quarterly periods: filter to facts whose duration is roughly one
  // quarter. The same `RevenueFromContract...` tag also reports YTD/cumulative
  // ranges (e.g. 6-month, 9-month, full-year facts are often present in a
  // 10-Q under fp=Q2/Q3/FY). We want only the discrete quarter (~91 days).
  const isQuarterly = options.period === 'quarterly';

  // (start_date, end_date) → earliest-filed representative fact
  const byPeriod = new Map<string, XbrlFact>();
  for (const fact of unitFacts) {
    if (!wantedFp.has(fact.fp)) continue;
    if (!fact.end) continue;
    if (spineConcept.periodType === 'duration' && !fact.start) continue;

    if (isQuarterly && spineConcept.periodType === 'duration') {
      const days = (Date.parse(fact.end) - Date.parse(fact.start!)) / 86400000;
      if (days < 75 || days > 105) continue;
    }
    if (options.period === 'annual' && spineConcept.periodType === 'duration') {
      const days = (Date.parse(fact.end) - Date.parse(fact.start!)) / 86400000;
      if (days < 350 || days > 380) continue;
    }

    const key = `${fact.start ?? ''}|${fact.end}`;
    const existing = byPeriod.get(key);
    if (!existing || Date.parse(fact.filed) < Date.parse(existing.filed)) {
      byPeriod.set(key, fact);
    }
  }

  const periods: RequestedPeriod[] = [];
  for (const fact of byPeriod.values()) {
    periods.push({
      endDate: fact.end,
      startDate: fact.start,
      fiscalPeriod: fact.fp,
      fiscalYear: fact.fy,
    });
  }

  // Most recent first
  periods.sort((a, b) => b.endDate.localeCompare(a.endDate));
  return periods;
}
