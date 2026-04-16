/**
 * GAAP concept mapping types.
 *
 * Each canonical field maps to an ordered list of XBRL concept tags.
 * The resolver picks the first tag that has data for the requested period.
 *
 * Order matters — list the most specific / most current tag first,
 * then historical aliases / older tag names. Example: revenue went from
 * `Revenues` (older) to `RevenueFromContractWithCustomerExcludingAssessedTax`
 * (post-ASC 606, 2018+) and we want both to resolve.
 */

/** XBRL period type. Drives which units key to read. */
export type PeriodType = 'duration' | 'instant';

/** Sign convention for the resolved value. */
export type SignConvention = 'asReported' | 'negate';

export interface GaapConcept {
  /** Canonical output field name (e.g. `revenue`). */
  field: string;

  /** XBRL taxonomy — almost always `us-gaap`, occasionally `dei`. */
  taxonomy: 'us-gaap' | 'dei' | 'srt';

  /** Ordered list of XBRL tag names. First match wins. */
  tags: readonly string[];

  /** Period type for the underlying concept. */
  periodType: PeriodType;

  /** XBRL units key — `USD`, `shares`, `USD/shares`, `pure`, etc. */
  unit: 'USD' | 'shares' | 'USD/shares' | 'pure';

  /**
   * Sign convention. `asReported` returns the value verbatim; `negate`
   * flips the sign (used for things like CapEx — XBRL reports investing
   * outflows as positive, but downstream code expects negative).
   */
  sign?: SignConvention;
}

export type ConceptMap = readonly GaapConcept[];
