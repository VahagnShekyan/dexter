/**
 * Statement assembly.
 *
 * Combines the period discoverer + concept resolver into the final
 * statement objects that match the Financial Datasets output shape.
 *
 * Output schema per row (matches what the existing formatters expect):
 *   {
 *     ticker, report_period, calendar_date, fiscal_period, fiscal_year,
 *     <all fields from the concept map>,
 *   }
 *
 * Date filters mirror the legacy API: report_period_gt / _gte / _lt / _lte.
 */

import type { FinancialStatementsInput } from '../types.js';
import type { CompanyFacts } from './companyfacts.js';
import { getCompanyFacts, companyFactsUrl } from './companyfacts.js';
import {
  discoverPeriods,
  resolveConceptsForPeriod,
  type RequestedPeriod,
} from './facts.js';
import { BALANCE_SHEET, CASH_FLOW, INCOME_STATEMENT } from './gaap/index.js';
import type { ConceptMap, GaapConcept } from './gaap/types.js';

// ---------------------------------------------------------------------------
// Spines — the anchor concepts used to discover what periods exist
// ---------------------------------------------------------------------------

const INCOME_SPINE: GaapConcept = INCOME_STATEMENT.find((c) => c.field === 'revenue')!;
const BALANCE_SPINE: GaapConcept = BALANCE_SHEET.find((c) => c.field === 'total_assets')!;
const CASHFLOW_SPINE: GaapConcept = CASH_FLOW.find(
  (c) => c.field === 'net_cash_flow_from_operations',
)!;

// ---------------------------------------------------------------------------
// Filtering & paging
// ---------------------------------------------------------------------------

function applyDateFilters(
  periods: RequestedPeriod[],
  input: FinancialStatementsInput,
): RequestedPeriod[] {
  let out = periods;
  if (input.report_period_gt) out = out.filter((p) => p.endDate > input.report_period_gt!);
  if (input.report_period_gte) out = out.filter((p) => p.endDate >= input.report_period_gte!);
  if (input.report_period_lt) out = out.filter((p) => p.endDate < input.report_period_lt!);
  if (input.report_period_lte) out = out.filter((p) => p.endDate <= input.report_period_lte!);
  return out;
}

function applyLimit(periods: RequestedPeriod[], limit: number | undefined): RequestedPeriod[] {
  const n = limit ?? 4;
  return periods.slice(0, n);
}

// ---------------------------------------------------------------------------
// TTM rollup (income / cashflow only — balance sheet TTM === latest snapshot)
// ---------------------------------------------------------------------------

/**
 * Build TTM (trailing-twelve-month) rows by summing the last 4 quarters
 * ending at each quarterly period. Returns a row per quarter end with
 * field values summed from that quarter and the 3 preceding quarters.
 *
 * Only used for `period: 'ttm'` requests on income/cashflow statements.
 */
function rollupTtm(
  facts: CompanyFacts,
  conceptMap: ConceptMap,
  ticker: string,
): Record<string, unknown>[] {
  const allQuarters = discoverPeriods(facts, INCOME_SPINE, { period: 'quarterly' });
  if (allQuarters.length < 4) return [];

  // Sort oldest-first for the rolling window
  const ordered = [...allQuarters].sort((a, b) => a.endDate.localeCompare(b.endDate));
  const rows: Record<string, unknown>[] = [];

  for (let i = 3; i < ordered.length; i++) {
    const window = ordered.slice(i - 3, i + 1);
    const last = window[window.length - 1];
    const summed: Record<string, number | null> = {};

    for (const concept of conceptMap) {
      // EPS, dividends_per_share, shares are not summable across periods.
      // Skip them — TTM rows leave them null. (Per-share TTM is computed
      // by callers as TTM-net-income / latest-shares if needed.)
      if (concept.unit === 'USD/shares' || concept.unit === 'shares') {
        summed[concept.field] = null;
        continue;
      }
      let total = 0;
      let anyPresent = false;
      for (const period of window) {
        const partial = resolveConceptsForPeriod(facts, [concept], period);
        const val = partial[concept.field];
        if (val !== null && val !== undefined) {
          total += val;
          anyPresent = true;
        }
      }
      summed[concept.field] = anyPresent ? total : null;
    }

    rows.push({
      ticker: ticker.toUpperCase(),
      report_period: last.endDate,
      calendar_date: last.endDate,
      fiscal_period: 'TTM',
      fiscal_year: last.fiscalYear,
      ...summed,
    });
  }

  // Most recent first
  rows.sort((a, b) => String(b.report_period).localeCompare(String(a.report_period)));
  return rows;
}

// ---------------------------------------------------------------------------
// Statement builders
// ---------------------------------------------------------------------------

function buildRows(
  facts: CompanyFacts,
  conceptMap: ConceptMap,
  spine: GaapConcept,
  input: FinancialStatementsInput,
): Record<string, unknown>[] {
  // TTM income/cashflow takes its own path — sum quarters
  if (input.period === 'ttm' && spine !== BALANCE_SPINE) {
    const rows = rollupTtm(facts, conceptMap, input.ticker);
    const filtered = applyDateFilters(
      rows.map((r) => ({
        endDate: String(r.report_period),
        fiscalPeriod: 'TTM',
        fiscalYear: Number(r.fiscal_year),
      })),
      input,
    );
    const keep = new Set(filtered.map((p) => p.endDate));
    return applyLimit(
      rows.filter((r) => keep.has(String(r.report_period))),
      input.limit,
    ).map((r) => r); // already correctly shaped
  }

  // Annual / quarterly — discover from the spine, resolve per period
  const periodMode: 'annual' | 'quarterly' = input.period === 'annual' ? 'annual' : 'quarterly';
  const allPeriods = discoverPeriods(facts, spine, { period: periodMode });
  const filtered = applyLimit(applyDateFilters(allPeriods, input), input.limit);

  return filtered.map((period) => ({
    ticker: input.ticker.toUpperCase(),
    report_period: period.endDate,
    calendar_date: period.endDate,
    fiscal_period: period.fiscalPeriod,
    fiscal_year: period.fiscalYear,
    ...resolveConceptsForPeriod(facts, conceptMap, period),
  }));
}

// ---------------------------------------------------------------------------
// Public assembly functions
// ---------------------------------------------------------------------------

export interface AssembledStatements {
  rows: Record<string, unknown>[];
  source: string;
}

export async function assembleIncomeStatements(
  input: FinancialStatementsInput,
): Promise<AssembledStatements> {
  const facts = await getCompanyFacts(input.ticker);
  const rows = buildRows(facts, INCOME_STATEMENT, INCOME_SPINE, input);
  const source = await companyFactsUrl(input.ticker);
  return { rows, source };
}

export async function assembleBalanceSheets(
  input: FinancialStatementsInput,
): Promise<AssembledStatements> {
  const facts = await getCompanyFacts(input.ticker);
  // Balance sheets are instant — TTM === latest snapshot, treat as quarterly
  // and let the limit filter pick the most recent.
  const effectiveInput: FinancialStatementsInput =
    input.period === 'ttm' ? { ...input, period: 'quarterly', limit: 1 } : input;
  const rows = buildRows(facts, BALANCE_SHEET, BALANCE_SPINE, effectiveInput);
  const source = await companyFactsUrl(input.ticker);
  return { rows, source };
}

export async function assembleCashFlowStatements(
  input: FinancialStatementsInput,
): Promise<AssembledStatements> {
  const facts = await getCompanyFacts(input.ticker);
  const rows = buildRows(facts, CASH_FLOW, CASHFLOW_SPINE, input);
  const source = await companyFactsUrl(input.ticker);
  return { rows, source };
}

/**
 * Assemble all three statements at once. Returns the same envelope shape
 * as the legacy `/financials/` endpoint:
 *   { income_statements: [...], balance_sheets: [...], cash_flow_statements: [...] }
 */
export async function assembleAllStatements(input: FinancialStatementsInput): Promise<{
  data: {
    income_statements: Record<string, unknown>[];
    balance_sheets: Record<string, unknown>[];
    cash_flow_statements: Record<string, unknown>[];
  };
  source: string;
}> {
  const facts = await getCompanyFacts(input.ticker);
  const balanceInput: FinancialStatementsInput =
    input.period === 'ttm' ? { ...input, period: 'quarterly', limit: 1 } : input;

  return {
    data: {
      income_statements: buildRows(facts, INCOME_STATEMENT, INCOME_SPINE, input),
      balance_sheets: buildRows(facts, BALANCE_SHEET, BALANCE_SPINE, balanceInput),
      cash_flow_statements: buildRows(facts, CASH_FLOW, CASHFLOW_SPINE, input),
    },
    source: await companyFactsUrl(input.ticker),
  };
}
