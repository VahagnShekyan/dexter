/**
 * Financial Datasets provider.
 *
 * Thin adapter over the legacy `api.ts` client. Preserves the existing
 * behavior (cache TTLs, `stripFieldsDeep`, error semantics) so the
 * provider toggle is a true zero-change rollout for existing users.
 *
 * When the toggle defaults flip to `composite`, this adapter stays for
 * one release as a fallback, then is deleted along with `api.ts`.
 */

import { api, stripFieldsDeep } from '../api.js';
import { TTL_15M, TTL_1H, TTL_6H, TTL_24H } from '../utils.js';
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
} from './types.js';

const REDUNDANT_FINANCIAL_FIELDS = ['accession_number', 'currency', 'period'] as const;
const REDUNDANT_INSIDER_FIELDS = ['issuer'] as const;

let cachedItemTypes: FilingItemTypes | null = null;
let cachedScreenerFilters: Record<string, unknown> | null = null;

/** Wrap an unwrapped payload + URL into the standard provider envelope. */
function envelope<T>(data: T, url: string): ProviderResult<T> {
  return { data, sources: [url] };
}

export class FinancialDatasetsProvider implements DataProvider {
  readonly name = 'financialdatasets';

  // --- Fundamentals ------------------------------------------------------

  async getIncomeStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/financials/income-statements/', input as Record<string, string | number | undefined>, {
      cacheable: true,
      ttlMs: TTL_24H,
    });
    return envelope(stripFieldsDeep(data.income_statements || {}, REDUNDANT_FINANCIAL_FIELDS), url);
  }

  async getBalanceSheets(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/financials/balance-sheets/', input as Record<string, string | number | undefined>, {
      cacheable: true,
      ttlMs: TTL_24H,
    });
    return envelope(stripFieldsDeep(data.balance_sheets || {}, REDUNDANT_FINANCIAL_FIELDS), url);
  }

  async getCashFlowStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/financials/cash-flow-statements/', input as Record<string, string | number | undefined>, {
      cacheable: true,
      ttlMs: TTL_24H,
    });
    return envelope(stripFieldsDeep(data.cash_flow_statements || {}, REDUNDANT_FINANCIAL_FIELDS), url);
  }

  async getAllFinancialStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/financials/', input as Record<string, string | number | undefined>, {
      cacheable: true,
      ttlMs: TTL_24H,
    });
    return envelope(stripFieldsDeep(data.financials || {}, REDUNDANT_FINANCIAL_FIELDS), url);
  }

  // --- Filings -----------------------------------------------------------

  async getFilings(input: FilingsInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/filings/', input as Record<string, string | number | string[] | undefined>);
    return envelope(data.filings || [], url);
  }

  async getFilingItems(input: FilingItemsInput): Promise<ProviderResult<unknown>> {
    // Legacy API expects singular `item`, not `items`
    const params: Record<string, string | string[] | undefined> = {
      ticker: input.ticker.toUpperCase(),
      filing_type: input.filing_type,
      accession_number: input.accession_number,
      item: input.items,
    };
    const { data, url } = await api.get('/filings/items/', params, { cacheable: true, ttlMs: TTL_24H });
    return envelope(data, url);
  }

  async getFilingItemTypes(): Promise<FilingItemTypes> {
    if (cachedItemTypes) return cachedItemTypes;
    const response = await fetch('https://api.financialdatasets.ai/filings/items/types/');
    if (!response.ok) {
      throw new Error(`[Financial Datasets API] Failed to fetch filing item types: ${response.status}`);
    }
    cachedItemTypes = (await response.json()) as FilingItemTypes;
    return cachedItemTypes;
  }

  // --- Ratios ------------------------------------------------------------

  async getKeyRatiosSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/financial-metrics/snapshot/', { ticker: input.ticker.trim().toUpperCase() }, {
      cacheable: true,
      ttlMs: TTL_1H,
    });
    return envelope(data.snapshot || {}, url);
  }

  async getHistoricalKeyRatios(input: HistoricalKeyRatiosInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/financial-metrics/', input as Record<string, string | number | undefined>, {
      cacheable: true,
      ttlMs: TTL_6H,
    });
    return envelope(stripFieldsDeep(data.financial_metrics || [], REDUNDANT_FINANCIAL_FIELDS), url);
  }

  // --- Estimates / earnings ----------------------------------------------

  async getAnalystEstimates(input: AnalystEstimatesInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/analyst-estimates/', input as Record<string, string | number | undefined>, {
      cacheable: true,
      ttlMs: TTL_6H,
    });
    return envelope(data.analyst_estimates || [], url);
  }

  async getEarnings(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/earnings', { ticker: input.ticker.trim().toUpperCase() }, {
      cacheable: true,
      ttlMs: TTL_24H,
    });
    return envelope(data.earnings || {}, url);
  }

  // --- Segments ----------------------------------------------------------

  async getSegmentedRevenues(input: SegmentedRevenuesInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/financials/segmented-revenues/', input as Record<string, string | number | undefined>, {
      cacheable: true,
      ttlMs: TTL_24H,
    });
    return envelope(stripFieldsDeep(data.segmented_revenues || {}, REDUNDANT_FINANCIAL_FIELDS), url);
  }

  // --- Equity prices -----------------------------------------------------

  async getStockPriceSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/prices/snapshot/', { ticker: input.ticker.trim().toUpperCase() });
    return envelope(data.snapshot || {}, url);
  }

  async getStockPrices(input: StockPricesInput): Promise<ProviderResult<unknown>> {
    const params = {
      ticker: input.ticker.trim().toUpperCase(),
      interval: input.interval,
      start_date: input.start_date,
      end_date: input.end_date,
    };
    const endDate = new Date(input.end_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, url } = await api.get('/prices/', params, { cacheable: endDate < today });
    return envelope(data.prices || [], url);
  }

  async getStockTickers(): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/prices/snapshot/tickers/', {}, { cacheable: true, ttlMs: TTL_24H });
    return envelope(data.tickers || [], url);
  }

  // --- Crypto prices -----------------------------------------------------

  async getCryptoPriceSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/crypto/prices/snapshot/', { ticker: input.ticker });
    return envelope(data.snapshot || {}, url);
  }

  async getCryptoPrices(input: CryptoPricesInput): Promise<ProviderResult<unknown>> {
    const endDate = new Date(input.end_date + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data, url } = await api.get('/crypto/prices/', input as Record<string, string | number | undefined>, {
      cacheable: endDate < today,
    });
    return envelope(data.prices || [], url);
  }

  async getCryptoTickers(): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.get('/crypto/prices/tickers/', {}, { cacheable: true, ttlMs: TTL_24H });
    return envelope(data.tickers || [], url);
  }

  // --- Insider trades ----------------------------------------------------

  async getInsiderTrades(input: InsiderTradesInput): Promise<ProviderResult<unknown>> {
    const params: Record<string, string | number | undefined> = {
      ...input,
      ticker: input.ticker.toUpperCase(),
    };
    const { data, url } = await api.get('/insider-trades/', params, { cacheable: true, ttlMs: TTL_1H });
    return envelope(stripFieldsDeep(data.insider_trades || [], REDUNDANT_INSIDER_FIELDS), url);
  }

  // --- News --------------------------------------------------------------

  async getNews(input: NewsInput): Promise<ProviderResult<unknown>> {
    const params: Record<string, string | number | undefined> = {
      ticker: input.ticker?.trim().toUpperCase(),
      limit: input.limit !== undefined ? Math.min(input.limit, 10) : undefined,
    };
    const { data, url } = await api.get('/news', params, { cacheable: true, ttlMs: TTL_15M });
    return envelope((data.news as unknown[]) || [], url);
  }

  // --- Screener ----------------------------------------------------------

  async getScreenerFilters(): Promise<Record<string, unknown>> {
    if (cachedScreenerFilters) return cachedScreenerFilters;
    const { data } = await api.get('/financials/search/screener/filters/', {});
    cachedScreenerFilters = data;
    return data;
  }

  async screenStocks(input: ScreenerInput): Promise<ProviderResult<unknown>> {
    const { data, url } = await api.post('/financials/search/screener/', {
      filters: input.filters,
      currency: input.currency,
      limit: input.limit,
    });
    return envelope(data, url);
  }
}
