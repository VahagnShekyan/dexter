/**
 * FinnhubProvider — equity prices, news, earnings, estimates, key ratios.
 *
 * Output shapes match Financial Datasets envelopes so the downstream
 * formatters and tools don't need provider-specific code paths.
 *
 * Coverage: all market-data methods + key ratios snapshot.
 * Not implemented: fundamentals (use EdgarProvider), screener (use FmpProvider),
 * crypto (use CoinGeckoProvider), filing item bodies (use EdgarProvider).
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
import { finnhubGet } from './client.js';

export class NotImplementedByFinnhub extends Error {
  constructor(method: string) {
    super(`[Finnhub] '${method}' is not implemented by FinnhubProvider`);
    this.name = 'NotImplementedByFinnhub';
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function dateToUnix(yyyyMmDd: string): number {
  return Math.floor(new Date(yyyyMmDd + 'T00:00:00Z').getTime() / 1000);
}

function unixToDate(unix: number): string {
  return new Date(unix * 1000).toISOString().slice(0, 10);
}

const RESOLUTION_MAP: Record<string, string> = {
  day: 'D',
  week: 'W',
  month: 'M',
  year: 'M', // Finnhub doesn't offer annual; downsample monthly
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class FinnhubProvider implements DataProvider {
  readonly name = 'finnhub';

  // --- Equity prices -----------------------------------------------------

  async getStockPriceSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    const ticker = input.ticker.trim().toUpperCase();
    const { data, url } = await finnhubGet<{
      c: number; h: number; l: number; o: number; pc: number; t: number;
    }>('/quote', { symbol: ticker });
    return {
      data: {
        ticker,
        price: data.c,
        close: data.c,
        open: data.o,
        high: data.h,
        low: data.l,
        previous_close: data.pc,
        date: data.t ? unixToDate(data.t) : undefined,
      },
      sources: [url],
    };
  }

  async getStockPrices(input: StockPricesInput): Promise<ProviderResult<unknown>> {
    const ticker = input.ticker.trim().toUpperCase();
    const resolution = RESOLUTION_MAP[input.interval] ?? 'D';
    const { data, url } = await finnhubGet<{
      c: number[]; h: number[]; l: number[]; o: number[]; t: number[]; v: number[]; s: string;
    }>('/stock/candle', {
      symbol: ticker,
      resolution,
      from: dateToUnix(input.start_date),
      to: dateToUnix(input.end_date),
    });
    if (data.s !== 'ok' || !Array.isArray(data.t)) {
      return { data: [], sources: [url] };
    }
    const rows = data.t.map((unix, i) => ({
      ticker,
      date: unixToDate(unix),
      open: data.o[i],
      high: data.h[i],
      low: data.l[i],
      close: data.c[i],
      volume: data.v[i],
    }));
    return { data: rows, sources: [url] };
  }

  async getStockTickers(): Promise<ProviderResult<unknown>> {
    const { data, url } = await finnhubGet<Array<{ symbol: string; description: string; type: string }>>(
      '/stock/symbol',
      { exchange: 'US' },
    );
    const tickers = data
      .filter((s) => s.type === 'Common Stock' || s.type === 'EQS')
      .map((s) => ({ ticker: s.symbol, name: s.description }));
    return { data: tickers, sources: [url] };
  }

  // --- News --------------------------------------------------------------

  async getNews(input: NewsInput): Promise<ProviderResult<unknown>> {
    const limit = Math.min(input.limit ?? 5, 10);
    if (input.ticker) {
      const ticker = input.ticker.trim().toUpperCase();
      // Finnhub company-news requires a date range — use last 30 days
      const today = new Date();
      const monthAgo = new Date(Date.now() - 30 * 86400 * 1000);
      const { data, url } = await finnhubGet<Array<{
        category: string; datetime: number; headline: string; source: string;
        summary: string; url: string;
      }>>('/company-news', {
        symbol: ticker,
        from: monthAgo.toISOString().slice(0, 10),
        to: today.toISOString().slice(0, 10),
      });
      const rows = data.slice(0, limit).map((n) => ({
        title: n.headline,
        source: n.source,
        date: unixToDate(n.datetime),
        url: n.url,
        summary: n.summary,
        ticker,
      }));
      return { data: rows, sources: [url] };
    }
    // Broad market news
    const { data, url } = await finnhubGet<Array<{
      category: string; datetime: number; headline: string; source: string;
      summary: string; url: string;
    }>>('/news', { category: 'general' });
    const rows = data.slice(0, limit).map((n) => ({
      title: n.headline,
      source: n.source,
      date: unixToDate(n.datetime),
      url: n.url,
      summary: n.summary,
    }));
    return { data: rows, sources: [url] };
  }

  // --- Earnings + estimates ---------------------------------------------

  async getEarnings(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    const ticker = input.ticker.trim().toUpperCase();
    const { data, url } = await finnhubGet<Array<{
      actual: number; estimate: number; period: string; quarter: number;
      revenueActual: number; revenueEstimate: number; surprise: number;
      surprisePercent: number; symbol: string; year: number;
    }>>('/stock/earnings', { symbol: ticker });
    const latest = data?.[0];
    if (!latest) return { data: {}, sources: [url] };
    return {
      data: {
        ticker,
        report_period: latest.period,
        eps: latest.actual,
        eps_estimate: latest.estimate,
        revenue: latest.revenueActual,
        revenue_estimate: latest.revenueEstimate,
        eps_surprise:
          latest.estimate ? (latest.actual - latest.estimate) / Math.abs(latest.estimate) : null,
        revenue_surprise:
          latest.revenueEstimate
            ? (latest.revenueActual - latest.revenueEstimate) / Math.abs(latest.revenueEstimate)
            : null,
      },
      sources: [url],
    };
  }

  async getAnalystEstimates(input: AnalystEstimatesInput): Promise<ProviderResult<unknown>> {
    const ticker = input.ticker.trim().toUpperCase();
    const period = input.period === 'quarterly' ? 'quarterly' : 'annual';
    const { data, url } = await finnhubGet<Array<{
      epsAvg: number; epsHigh: number; epsLow: number; numberAnalysts: number;
      period: string; revenueAvg: number; revenueHigh: number; revenueLow: number;
      symbol: string;
    }>>('/stock/eps-estimate', { symbol: ticker, freq: period === 'quarterly' ? 'quarterly' : 'annual' });
    const rows = (data ?? []).map((e) => ({
      report_period: e.period,
      estimated_eps_avg: e.epsAvg,
      estimated_eps_high: e.epsHigh,
      estimated_eps_low: e.epsLow,
      estimated_revenue_avg: e.revenueAvg,
      estimated_revenue_high: e.revenueHigh,
      estimated_revenue_low: e.revenueLow,
      number_of_analysts: e.numberAnalysts,
      ticker,
    }));
    return { data: rows, sources: [url] };
  }

  // --- Key ratios snapshot ----------------------------------------------

  async getKeyRatiosSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    const ticker = input.ticker.trim().toUpperCase();
    const { data, url } = await finnhubGet<{ metric?: Record<string, number> }>(
      '/stock/metric',
      { symbol: ticker, metric: 'all' },
    );
    const m = data.metric ?? {};
    return {
      data: {
        ticker,
        market_cap: m['marketCapitalization'] ? m['marketCapitalization'] * 1_000_000 : null,
        pe_ratio: m['peNormalizedAnnual'] ?? m['peTTM'] ?? null,
        pb_ratio: m['pbAnnual'] ?? m['pbQuarterly'] ?? null,
        ps_ratio: m['psTTM'] ?? null,
        eps: m['epsAnnual'] ?? m['epsTTM'] ?? null,
        dividend_yield: m['dividendYieldIndicatedAnnual']
          ? m['dividendYieldIndicatedAnnual'] / 100
          : null,
        gross_margin: m['grossMarginAnnual'] ? m['grossMarginAnnual'] / 100 : null,
        operating_margin: m['operatingMarginAnnual'] ? m['operatingMarginAnnual'] / 100 : null,
        net_margin: m['netProfitMarginAnnual'] ? m['netProfitMarginAnnual'] / 100 : null,
        roe: m['roeRfy'] ? m['roeRfy'] / 100 : null,
        roa: m['roaRfy'] ? m['roaRfy'] / 100 : null,
        roic: m['roiAnnual'] ? m['roiAnnual'] / 100 : null,
        debt_to_equity: m['totalDebt/totalEquityAnnual'] ?? null,
        current_ratio: m['currentRatioAnnual'] ?? null,
        quick_ratio: m['quickRatioAnnual'] ?? null,
        revenue_growth_rate: m['revenueGrowthTTMYoy'] ? m['revenueGrowthTTMYoy'] / 100 : null,
        earnings_growth_rate: m['epsGrowthTTMYoy'] ? m['epsGrowthTTMYoy'] / 100 : null,
        '52_week_high': m['52WeekHigh'] ?? null,
        '52_week_low': m['52WeekLow'] ?? null,
        beta: m['beta'] ?? null,
      },
      sources: [url],
    };
  }

  // --- Not implemented (handled by other providers) ---------------------

  getIncomeStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getIncomeStatements');
  }
  getBalanceSheets(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getBalanceSheets');
  }
  getCashFlowStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getCashFlowStatements');
  }
  getAllFinancialStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getAllFinancialStatements');
  }
  getFilings(_input: FilingsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getFilings');
  }
  getFilingItems(_input: FilingItemsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getFilingItems');
  }
  getFilingItemTypes(): Promise<FilingItemTypes> {
    throw new NotImplementedByFinnhub('getFilingItemTypes');
  }
  getHistoricalKeyRatios(_input: HistoricalKeyRatiosInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getHistoricalKeyRatios');
  }
  getSegmentedRevenues(_input: SegmentedRevenuesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getSegmentedRevenues');
  }
  getCryptoPriceSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getCryptoPriceSnapshot');
  }
  getCryptoPrices(_input: CryptoPricesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getCryptoPrices');
  }
  getCryptoTickers(): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getCryptoTickers');
  }
  getInsiderTrades(_input: InsiderTradesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('getInsiderTrades');
  }
  getScreenerFilters(): Promise<Record<string, unknown>> {
    throw new NotImplementedByFinnhub('getScreenerFilters');
  }
  screenStocks(_input: ScreenerInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByFinnhub('screenStocks');
  }
}
