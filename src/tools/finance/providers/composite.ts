/**
 * CompositeProvider — per-method routing across the free providers.
 *
 * Each method routes to the cheapest provider that supports it. If the
 * primary fails (network, missing key, NotImplemented), we fall through
 * the secondary chain, ultimately landing on FinancialDatasetsProvider
 * if it has a key configured. If nothing has a key, we let the error
 * surface so the caller knows what to fix.
 *
 * Routing table:
 *   fundamentals          → Edgar → FDatasets
 *   filings + insiders    → Edgar → FDatasets
 *   prices + news + EPS   → Finnhub → FDatasets
 *   key ratios snapshot   → Finnhub → FDatasets
 *   crypto                → CoinGecko → FDatasets
 *   screener              → FMP → FDatasets
 *   historical key ratios → FDatasets (no free equivalent yet)
 *   segmented revenues    → FDatasets (Edgar XBRL segments TODO)
 */

import { logger } from '../../../utils/logger.js';
import { CoinGeckoProvider } from './coingecko/provider.js';
import { EdgarProvider } from './edgar/provider.js';
import { FinancialDatasetsProvider } from './financialdatasets.js';
import { FinnhubProvider } from './finnhub/provider.js';
import { FmpProvider } from './fmp/provider.js';
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

/**
 * Walk a chain of providers, calling `fn` on each until one succeeds.
 * Errors from earlier providers are logged and the chain continues.
 */
async function tryChain<T>(
  label: string,
  chain: DataProvider[],
  fn: (p: DataProvider) => Promise<T>,
): Promise<T> {
  let lastErr: unknown = null;
  for (const provider of chain) {
    try {
      return await fn(provider);
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`[Composite] ${label}: '${provider.name}' failed (${msg}) — trying next`);
    }
  }
  if (lastErr) throw lastErr;
  throw new Error(`[Composite] ${label}: no providers in chain`);
}

export class CompositeProvider implements DataProvider {
  readonly name = 'composite';

  private readonly edgar = new EdgarProvider();
  private readonly finnhub = new FinnhubProvider();
  private readonly fmp = new FmpProvider();
  private readonly coingecko = new CoinGeckoProvider();
  private readonly fdatasets: DataProvider;

  constructor() {
    // Only include FDatasets in the fallback chain if the key is set, so
    // unconfigured users see real errors rather than silent fallbacks.
    this.fdatasets = (process.env.FINANCIAL_DATASETS_API_KEY || '').trim()
      ? new FinancialDatasetsProvider()
      : new EmptyFallbackProvider();
  }

  // --- Fundamentals → Edgar primary -------------------------------------

  getIncomeStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    return tryChain('getIncomeStatements', [this.edgar, this.fdatasets], (p) => p.getIncomeStatements(input));
  }
  getBalanceSheets(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    return tryChain('getBalanceSheets', [this.edgar, this.fdatasets], (p) => p.getBalanceSheets(input));
  }
  getCashFlowStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    return tryChain('getCashFlowStatements', [this.edgar, this.fdatasets], (p) =>
      p.getCashFlowStatements(input),
    );
  }
  getAllFinancialStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    return tryChain('getAllFinancialStatements', [this.edgar, this.fdatasets], (p) =>
      p.getAllFinancialStatements(input),
    );
  }

  // --- Filings + insiders → Edgar primary -------------------------------

  getFilings(input: FilingsInput): Promise<ProviderResult<unknown>> {
    return tryChain('getFilings', [this.edgar, this.fdatasets], (p) => p.getFilings(input));
  }
  getFilingItems(input: FilingItemsInput): Promise<ProviderResult<unknown>> {
    return tryChain('getFilingItems', [this.edgar, this.fdatasets], (p) => p.getFilingItems(input));
  }
  getFilingItemTypes(): Promise<FilingItemTypes> {
    return tryChain('getFilingItemTypes', [this.edgar, this.fdatasets], (p) => p.getFilingItemTypes());
  }
  getInsiderTrades(input: InsiderTradesInput): Promise<ProviderResult<unknown>> {
    return tryChain('getInsiderTrades', [this.edgar, this.fdatasets], (p) => p.getInsiderTrades(input));
  }

  // --- Prices + news + earnings + estimates → Finnhub primary -----------

  getStockPriceSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    return tryChain('getStockPriceSnapshot', [this.finnhub, this.fdatasets], (p) =>
      p.getStockPriceSnapshot(input),
    );
  }
  getStockPrices(input: StockPricesInput): Promise<ProviderResult<unknown>> {
    return tryChain('getStockPrices', [this.finnhub, this.fdatasets], (p) => p.getStockPrices(input));
  }
  getStockTickers(): Promise<ProviderResult<unknown>> {
    return tryChain('getStockTickers', [this.finnhub, this.fdatasets], (p) => p.getStockTickers());
  }
  getNews(input: NewsInput): Promise<ProviderResult<unknown>> {
    return tryChain('getNews', [this.finnhub, this.fdatasets], (p) => p.getNews(input));
  }
  getEarnings(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    return tryChain('getEarnings', [this.finnhub, this.fdatasets], (p) => p.getEarnings(input));
  }
  getAnalystEstimates(input: AnalystEstimatesInput): Promise<ProviderResult<unknown>> {
    return tryChain('getAnalystEstimates', [this.finnhub, this.fdatasets], (p) =>
      p.getAnalystEstimates(input),
    );
  }
  getKeyRatiosSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    return tryChain('getKeyRatiosSnapshot', [this.finnhub, this.fdatasets], (p) =>
      p.getKeyRatiosSnapshot(input),
    );
  }

  // --- Crypto → CoinGecko primary ---------------------------------------

  getCryptoPriceSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    return tryChain('getCryptoPriceSnapshot', [this.coingecko, this.fdatasets], (p) =>
      p.getCryptoPriceSnapshot(input),
    );
  }
  getCryptoPrices(input: CryptoPricesInput): Promise<ProviderResult<unknown>> {
    return tryChain('getCryptoPrices', [this.coingecko, this.fdatasets], (p) => p.getCryptoPrices(input));
  }
  getCryptoTickers(): Promise<ProviderResult<unknown>> {
    return tryChain('getCryptoTickers', [this.coingecko, this.fdatasets], (p) => p.getCryptoTickers());
  }

  // --- Screener → FMP primary -------------------------------------------

  getScreenerFilters(): Promise<Record<string, unknown>> {
    return tryChain('getScreenerFilters', [this.fmp, this.fdatasets], (p) => p.getScreenerFilters());
  }
  screenStocks(input: ScreenerInput): Promise<ProviderResult<unknown>> {
    return tryChain('screenStocks', [this.fmp, this.fdatasets], (p) => p.screenStocks(input));
  }

  // --- Historical ratios + segments → FDatasets only (for now) ----------

  getHistoricalKeyRatios(input: HistoricalKeyRatiosInput): Promise<ProviderResult<unknown>> {
    return tryChain('getHistoricalKeyRatios', [this.fdatasets], (p) => p.getHistoricalKeyRatios(input));
  }
  getSegmentedRevenues(input: SegmentedRevenuesInput): Promise<ProviderResult<unknown>> {
    return tryChain('getSegmentedRevenues', [this.fdatasets], (p) => p.getSegmentedRevenues(input));
  }
}

// ---------------------------------------------------------------------------
// Fallback when no FDatasets key is available
// ---------------------------------------------------------------------------

class EmptyFallbackProvider implements DataProvider {
  readonly name = 'no-fallback';
  private fail(method: string): never {
    throw new Error(
      `[Composite] no fallback available for '${method}' — set FINANCIAL_DATASETS_API_KEY to enable, or supply the relevant free-provider key.`,
    );
  }
  getIncomeStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> { return this.fail('getIncomeStatements'); }
  getBalanceSheets(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> { return this.fail('getBalanceSheets'); }
  getCashFlowStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> { return this.fail('getCashFlowStatements'); }
  getAllFinancialStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> { return this.fail('getAllFinancialStatements'); }
  getFilings(_input: FilingsInput): Promise<ProviderResult<unknown>> { return this.fail('getFilings'); }
  getFilingItems(_input: FilingItemsInput): Promise<ProviderResult<unknown>> { return this.fail('getFilingItems'); }
  getFilingItemTypes(): Promise<FilingItemTypes> { return this.fail('getFilingItemTypes'); }
  getKeyRatiosSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> { return this.fail('getKeyRatiosSnapshot'); }
  getHistoricalKeyRatios(_input: HistoricalKeyRatiosInput): Promise<ProviderResult<unknown>> { return this.fail('getHistoricalKeyRatios'); }
  getAnalystEstimates(_input: AnalystEstimatesInput): Promise<ProviderResult<unknown>> { return this.fail('getAnalystEstimates'); }
  getEarnings(_input: { ticker: string }): Promise<ProviderResult<unknown>> { return this.fail('getEarnings'); }
  getSegmentedRevenues(_input: SegmentedRevenuesInput): Promise<ProviderResult<unknown>> { return this.fail('getSegmentedRevenues'); }
  getStockPriceSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> { return this.fail('getStockPriceSnapshot'); }
  getStockPrices(_input: StockPricesInput): Promise<ProviderResult<unknown>> { return this.fail('getStockPrices'); }
  getStockTickers(): Promise<ProviderResult<unknown>> { return this.fail('getStockTickers'); }
  getCryptoPriceSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> { return this.fail('getCryptoPriceSnapshot'); }
  getCryptoPrices(_input: CryptoPricesInput): Promise<ProviderResult<unknown>> { return this.fail('getCryptoPrices'); }
  getCryptoTickers(): Promise<ProviderResult<unknown>> { return this.fail('getCryptoTickers'); }
  getInsiderTrades(_input: InsiderTradesInput): Promise<ProviderResult<unknown>> { return this.fail('getInsiderTrades'); }
  getNews(_input: NewsInput): Promise<ProviderResult<unknown>> { return this.fail('getNews'); }
  getScreenerFilters(): Promise<Record<string, unknown>> { return this.fail('getScreenerFilters'); }
  screenStocks(_input: ScreenerInput): Promise<ProviderResult<unknown>> { return this.fail('screenStocks'); }
}
