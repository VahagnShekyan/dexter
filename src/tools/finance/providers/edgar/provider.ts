/**
 * EdgarProvider — SEC EDGAR-backed implementation of the DataProvider interface.
 *
 * Step 2 scope: fundamentals only (income / balance / cashflow / all).
 * Other methods throw `NotImplementedByEdgar` — the CompositeProvider added
 * in step 7 will route those to the appropriate provider (Finnhub, FMP, etc.).
 */

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
import {
  assembleAllStatements,
  assembleBalanceSheets,
  assembleCashFlowStatements,
  assembleIncomeStatements,
} from './statements.js';
import { listFilings } from './submissions.js';
import { extractFilingItems, STATIC_FILING_ITEM_TYPES } from './filing_items.js';
import { fetchInsiderTrades } from './insiders.js';

/** Thrown when EdgarProvider is asked for data it doesn't yet implement. */
export class NotImplementedByEdgar extends Error {
  constructor(method: string) {
    super(`[EDGAR] '${method}' is not implemented by EdgarProvider yet`);
    this.name = 'NotImplementedByEdgar';
  }
}

export class EdgarProvider implements DataProvider {
  readonly name = 'edgar';

  // --- Fundamentals (implemented) ----------------------------------------

  async getIncomeStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    const { rows, source } = await assembleIncomeStatements(input);
    return { data: rows, sources: [source] };
  }

  async getBalanceSheets(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    const { rows, source } = await assembleBalanceSheets(input);
    return { data: rows, sources: [source] };
  }

  async getCashFlowStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    const { rows, source } = await assembleCashFlowStatements(input);
    return { data: rows, sources: [source] };
  }

  async getAllFinancialStatements(input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    const { data, source } = await assembleAllStatements(input);
    return { data, sources: [source] };
  }

  // --- Filings (implemented) --------------------------------------------

  async getFilings(input: FilingsInput): Promise<ProviderResult<unknown>> {
    const { rows, source } = await listFilings(input.ticker, {
      formTypes: input.filing_type,
      limit: input.limit ?? 10,
    });
    return { data: rows, sources: [source] };
  }

  async getFilingItems(input: FilingItemsInput): Promise<ProviderResult<unknown>> {
    const extracted = await extractFilingItems(
      input.ticker,
      input.filing_type,
      input.accession_number,
      input.items,
    );
    return { data: extracted, sources: [extracted.filing_url] };
  }

  async getFilingItemTypes(): Promise<FilingItemTypes> {
    return STATIC_FILING_ITEM_TYPES;
  }

  // --- Insider trades (implemented) -------------------------------------

  async getInsiderTrades(input: InsiderTradesInput): Promise<ProviderResult<unknown>> {
    const { trades, source } = await fetchInsiderTrades(input);
    return { data: trades, sources: [source] };
  }

  // --- Not implemented (filled in by later steps) ------------------------
  getKeyRatiosSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getKeyRatiosSnapshot');
  }
  getHistoricalKeyRatios(_input: HistoricalKeyRatiosInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getHistoricalKeyRatios');
  }
  getAnalystEstimates(_input: AnalystEstimatesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getAnalystEstimates');
  }
  getEarnings(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getEarnings');
  }
  getSegmentedRevenues(_input: SegmentedRevenuesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getSegmentedRevenues');
  }
  getStockPriceSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getStockPriceSnapshot');
  }
  getStockPrices(_input: StockPricesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getStockPrices');
  }
  getStockTickers(): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getStockTickers');
  }
  getCryptoPriceSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getCryptoPriceSnapshot');
  }
  getCryptoPrices(_input: CryptoPricesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getCryptoPrices');
  }
  getCryptoTickers(): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getCryptoTickers');
  }
  getNews(_input: NewsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('getNews');
  }
  getScreenerFilters(): Promise<Record<string, unknown>> {
    throw new NotImplementedByEdgar('getScreenerFilters');
  }
  screenStocks(_input: ScreenerInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByEdgar('screenStocks');
  }
}
