/**
 * Data provider abstraction.
 *
 * Every finance tool in this codebase routes through this interface,
 * so the underlying data source is swappable without touching tool
 * definitions, schemas, or downstream formatting.
 *
 * Method names and inputs mirror the legacy Financial Datasets endpoints
 * one-to-one. Output shapes match the unwrapped payloads the legacy code
 * passed to `formatToolResult` — i.e. the value of `data.income_statements`,
 * `data.snapshot`, etc., not the wrapping object.
 */

// ============================================================================
// Shared shapes
// ============================================================================

/** Standard envelope returned by every provider method. */
export interface ProviderResult<T> {
  data: T;
  /** Source URLs for citation. May contain one or more entries. */
  sources: string[];
}

// ============================================================================
// Inputs
// ============================================================================

export interface FinancialStatementsInput {
  ticker: string;
  period: 'annual' | 'quarterly' | 'ttm';
  limit?: number;
  report_period_gt?: string;
  report_period_gte?: string;
  report_period_lt?: string;
  report_period_lte?: string;
}

export interface FilingsInput {
  ticker: string;
  filing_type?: Array<'10-K' | '10-Q' | '8-K'>;
  limit?: number;
}

export interface FilingItemsInput {
  ticker: string;
  filing_type: '10-K' | '10-Q' | '8-K';
  accession_number: string;
  /** Optional list of section names. Omit for all items. */
  items?: string[];
}

export interface FilingItemType {
  name: string;
  title: string;
  description: string;
}

export interface FilingItemTypes {
  '10-K': FilingItemType[];
  '10-Q': FilingItemType[];
}

export interface HistoricalKeyRatiosInput {
  ticker: string;
  period: 'annual' | 'quarterly' | 'ttm';
  limit?: number;
  report_period?: string;
  report_period_gt?: string;
  report_period_gte?: string;
  report_period_lt?: string;
  report_period_lte?: string;
}

export interface AnalystEstimatesInput {
  ticker: string;
  period: 'annual' | 'quarterly';
}

export interface SegmentedRevenuesInput {
  ticker: string;
  period: 'annual' | 'quarterly';
  limit?: number;
}

export interface StockPricesInput {
  ticker: string;
  interval: 'day' | 'week' | 'month' | 'year';
  start_date: string;
  end_date: string;
}

export interface CryptoPricesInput {
  ticker: string;
  interval: 'minute' | 'day' | 'week' | 'month' | 'year';
  interval_multiplier: number;
  start_date: string;
  end_date: string;
}

export interface InsiderTradesInput {
  ticker: string;
  limit?: number;
  filing_date?: string;
  filing_date_gte?: string;
  filing_date_lte?: string;
  filing_date_gt?: string;
  filing_date_lt?: string;
  name?: string;
}

export interface NewsInput {
  ticker?: string;
  limit?: number;
}

export interface ScreenerFilter {
  field: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'in';
  value: number | string | number[] | string[];
}

export interface ScreenerInput {
  filters: ScreenerFilter[];
  currency?: string;
  limit?: number;
}

// ============================================================================
// DataProvider interface
// ============================================================================

export interface DataProvider {
  /** Provider identifier — used in logs and the provider-parity diff harness. */
  readonly name: string;

  // --- Fundamentals --------------------------------------------------------

  getIncomeStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>>;
  getBalanceSheets(input: FinancialStatementsInput): Promise<ProviderResult<unknown>>;
  getCashFlowStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>>;
  getAllFinancialStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>>;

  // --- Filings -------------------------------------------------------------

  getFilings(input: FilingsInput): Promise<ProviderResult<unknown>>;
  getFilingItems(input: FilingItemsInput): Promise<ProviderResult<unknown>>;
  getFilingItemTypes(): Promise<FilingItemTypes>;

  // --- Ratios --------------------------------------------------------------

  getKeyRatiosSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>>;
  getHistoricalKeyRatios(input: HistoricalKeyRatiosInput): Promise<ProviderResult<unknown>>;

  // --- Estimates / earnings ------------------------------------------------

  getAnalystEstimates(input: AnalystEstimatesInput): Promise<ProviderResult<unknown>>;
  getEarnings(input: { ticker: string }): Promise<ProviderResult<unknown>>;

  // --- Segments ------------------------------------------------------------

  getSegmentedRevenues(input: SegmentedRevenuesInput): Promise<ProviderResult<unknown>>;

  // --- Equity prices -------------------------------------------------------

  getStockPriceSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>>;
  getStockPrices(input: StockPricesInput): Promise<ProviderResult<unknown>>;
  getStockTickers(): Promise<ProviderResult<unknown>>;

  // --- Crypto prices -------------------------------------------------------

  getCryptoPriceSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>>;
  getCryptoPrices(input: CryptoPricesInput): Promise<ProviderResult<unknown>>;
  getCryptoTickers(): Promise<ProviderResult<unknown>>;

  // --- Insider trades ------------------------------------------------------

  getInsiderTrades(input: InsiderTradesInput): Promise<ProviderResult<unknown>>;

  // --- News ----------------------------------------------------------------

  getNews(input: NewsInput): Promise<ProviderResult<unknown>>;

  // --- Screener ------------------------------------------------------------

  getScreenerFilters(): Promise<Record<string, unknown>>;
  screenStocks(input: ScreenerInput): Promise<ProviderResult<unknown>>;
}
