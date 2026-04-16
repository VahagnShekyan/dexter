/**
 * FmpProvider — Financial Modeling Prep, screener only.
 *
 * Free tier: 250 requests/day. We use FMP exclusively for stock screening
 * since EDGAR doesn't provide a screener and Finnhub free tier doesn't
 * either. Other methods throw NotImplementedByFmp.
 *
 * Auth: `FMP_API_KEY` env var.
 */

import { logger } from '../../../../utils/logger.js';
import type {
  AnalystEstimatesInput,
  CryptoPricesInput,
  DataProvider,
  FilingItemTypes,
  FilingItemsInput,
  FilingsInput,
  FinancialStatementsInput,
  HistoricalKeyRatiosInput,
  InsiderTradesInput,
  NewsInput,
  ProviderResult,
  ScreenerInput,
  SegmentedRevenuesInput,
  StockPricesInput,
} from '../types.js';

export class NotImplementedByFmp extends Error {
  constructor(method: string) {
    super(`[FMP] '${method}' is not implemented by FmpProvider`);
    this.name = 'NotImplementedByFmp';
  }
}

const BASE_URL = 'https://financialmodelingprep.com/stable';

let warnedAboutKey = false;
function getApiKey(): string {
  const key = (process.env.FMP_API_KEY || '').trim();
  if (!key && !warnedAboutKey) {
    logger.warn('[FMP] FMP_API_KEY not set — calls will return 401.');
    warnedAboutKey = true;
  }
  return key;
}

// ---------------------------------------------------------------------------
// Static screener filter catalog
// ---------------------------------------------------------------------------

/**
 * FMP doesn't expose a metric-discovery endpoint on the free tier, so we
 * publish the catalog ourselves. Includes the fields the legacy router
 * prompt teaches the LLM to use.
 */
const SCREENER_FILTERS: Record<string, unknown> = {
  metrics: [
    { field: 'marketCapMoreThan', label: 'Market cap >', type: 'number' },
    { field: 'marketCapLowerThan', label: 'Market cap <', type: 'number' },
    { field: 'priceMoreThan', label: 'Price >', type: 'number' },
    { field: 'priceLowerThan', label: 'Price <', type: 'number' },
    { field: 'betaMoreThan', label: 'Beta >', type: 'number' },
    { field: 'betaLowerThan', label: 'Beta <', type: 'number' },
    { field: 'volumeMoreThan', label: 'Volume >', type: 'number' },
    { field: 'volumeLowerThan', label: 'Volume <', type: 'number' },
    { field: 'dividendMoreThan', label: 'Dividend >', type: 'number' },
    { field: 'dividendLowerThan', label: 'Dividend <', type: 'number' },
    { field: 'sector', label: 'Sector', type: 'string', values: [
      'Communication Services', 'Consumer Cyclical', 'Consumer Defensive', 'Energy',
      'Financial Services', 'Healthcare', 'Industrials', 'Basic Materials',
      'Real Estate', 'Technology', 'Utilities',
    ]},
    { field: 'industry', label: 'Industry', type: 'string' },
    { field: 'country', label: 'Country', type: 'string' },
    { field: 'exchange', label: 'Exchange', type: 'string', values: ['NYSE', 'NASDAQ', 'AMEX'] },
    { field: 'isEtf', label: 'Is ETF', type: 'boolean' },
    { field: 'isFund', label: 'Is fund', type: 'boolean' },
    { field: 'isActivelyTrading', label: 'Actively trading', type: 'boolean' },
  ],
  notes: 'FMP screener supports range filters per field (e.g. marketCapMoreThan + marketCapLowerThan).',
};

// ---------------------------------------------------------------------------
// Filter translation
// ---------------------------------------------------------------------------

/**
 * Translate a generic ScreenerInput.filters into FMP's per-field query
 * params (FMP uses *MoreThan / *LowerThan suffixes rather than operators).
 */
function translateFilters(input: ScreenerInput): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of input.filters) {
    const field = f.field;
    if (f.operator === 'gt' || f.operator === 'gte') {
      out[`${field}MoreThan`] = String(f.value);
    } else if (f.operator === 'lt' || f.operator === 'lte') {
      out[`${field}LowerThan`] = String(f.value);
    } else if (f.operator === 'eq') {
      // FMP screener uses raw field for sector/industry/exchange/country
      out[field] = String(f.value);
    } else if (f.operator === 'in' && Array.isArray(f.value)) {
      // FMP doesn't support `in` directly — pick the first; downstream LLM
      // can re-call with a different value. (Composite router can fan out.)
      out[field] = String((f.value as unknown[])[0] ?? '');
    }
  }
  if (input.limit !== undefined) out.limit = String(input.limit);
  return out;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class FmpProvider implements DataProvider {
  readonly name = 'fmp';

  async getScreenerFilters(): Promise<Record<string, unknown>> {
    return SCREENER_FILTERS;
  }

  async screenStocks(input: ScreenerInput): Promise<ProviderResult<unknown>> {
    const params = translateFilters(input);
    const url = new URL(`${BASE_URL}/company-screener`);
    for (const [k, v] of Object.entries(params)) url.searchParams.append(k, v);
    const apiKey = getApiKey();
    if (apiKey) url.searchParams.append('apikey', apiKey);

    const citationUrl = url.toString().replace(/([?&])apikey=[^&]+/, '$1');

    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`[FMP] ${response.status} ${response.statusText} for /company-screener`);
    }
    const data = (await response.json()) as Array<Record<string, unknown>>;
    return { data: { results: data, count: data.length }, sources: [citationUrl] };
  }

  // --- Not implemented (handled by other providers) ---------------------

  getIncomeStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getIncomeStatements');
  }
  getBalanceSheets(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getBalanceSheets');
  }
  getCashFlowStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getCashFlowStatements');
  }
  getAllFinancialStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getAllFinancialStatements');
  }
  getFilings(_input: FilingsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getFilings');
  }
  getFilingItems(_input: FilingItemsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getFilingItems');
  }
  getFilingItemTypes(): Promise<FilingItemTypes> {
    throw new NotImplementedByFmp('getFilingItemTypes');
  }
  getKeyRatiosSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getKeyRatiosSnapshot');
  }
  getHistoricalKeyRatios(_input: HistoricalKeyRatiosInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getHistoricalKeyRatios');
  }
  getAnalystEstimates(_input: AnalystEstimatesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getAnalystEstimates');
  }
  getEarnings(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getEarnings');
  }
  getSegmentedRevenues(_input: SegmentedRevenuesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getSegmentedRevenues');
  }
  getStockPriceSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getStockPriceSnapshot');
  }
  getStockPrices(_input: StockPricesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getStockPrices');
  }
  getStockTickers(): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getStockTickers');
  }
  getCryptoPriceSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getCryptoPriceSnapshot');
  }
  getCryptoPrices(_input: CryptoPricesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getCryptoPrices');
  }
  getCryptoTickers(): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getCryptoTickers');
  }
  getInsiderTrades(_input: InsiderTradesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getInsiderTrades');
  }
  getNews(_input: NewsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFmp('getNews');
  }
}
