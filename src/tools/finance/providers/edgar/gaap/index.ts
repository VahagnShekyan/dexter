/**
 * GAAP concept maps — index.
 *
 * Each statement type has an ordered list of concepts. The fact resolver
 * (../facts.ts) walks the list in order and picks the first concept that
 * has a matching fact for the requested period.
 */

export type { ConceptMap, GaapConcept, PeriodType, SignConvention } from './types.js';
export { INCOME_STATEMENT } from './income.js';
export { BALANCE_SHEET } from './balance.js';
export { CASH_FLOW } from './cashflow.js';
