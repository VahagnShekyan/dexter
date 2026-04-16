/**
 * CoinGeckoProvider — crypto prices (free, no key required).
 *
 * CoinGecko's public API uses CoinGecko coin IDs (e.g. "bitcoin"), not
 * the BTC/ETH symbols our tool surface uses. We resolve symbol → ID via
 * the /coins/list endpoint, cached in-memory.
 *
 * Free tier: ~30 req/min. Soft local limiter set to 25/min.
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

export class NotImplementedByCoinGecko extends Error {
  constructor(method: string) {
    super(`[CoinGecko] '${method}' is not implemented by CoinGeckoProvider`);
    this.name = 'NotImplementedByCoinGecko';
  }
}

const BASE_URL = 'https://api.coingecko.com/api/v3';
const RATE_LIMIT_PER_MIN = 25;

const callLog: number[] = [];
async function takeSlot(): Promise<void> {
  const now = Date.now();
  while (callLog.length > 0 && now - callLog[0] > 60_000) callLog.shift();
  if (callLog.length >= RATE_LIMIT_PER_MIN) {
    const wait = 60_000 - (now - callLog[0]) + 50;
    await new Promise((resolve) => setTimeout(resolve, wait));
    return takeSlot();
  }
  callLog.push(Date.now());
}

async function geckoGet<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<{ data: T; url: string }> {
  await takeSlot();
  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.append(k, String(v));
  const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) {
    throw new Error(`[CoinGecko] ${response.status} ${response.statusText} for ${endpoint}`);
  }
  return { data: (await response.json()) as T, url: url.toString() };
}

// ---------------------------------------------------------------------------
// Symbol → CoinGecko ID resolver
// ---------------------------------------------------------------------------

interface CoinListEntry {
  id: string;
  symbol: string;
  name: string;
}

let coinListCache: CoinListEntry[] | null = null;
let coinListFetchedAt = 0;

async function getCoinList(): Promise<CoinListEntry[]> {
  const fresh = Date.now() - coinListFetchedAt < 24 * 60 * 60 * 1000;
  if (coinListCache && fresh) return coinListCache;
  logger.info('[CoinGecko] fetching /coins/list');
  const { data } = await geckoGet<CoinListEntry[]>('/coins/list');
  coinListCache = data;
  coinListFetchedAt = Date.now();
  return data;
}

/**
 * CoinGecko ticker symbols collide (many meme tokens share BTC/ETH/SOL).
 * Hardcode the canonical IDs for the top symbols so we resolve to the
 * actual major asset rather than a same-symbol meme token.
 */
const CANONICAL_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  USDT: 'tether',
  USDC: 'usd-coin',
  BNB: 'binancecoin',
  SOL: 'solana',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  AVAX: 'avalanche-2',
  TRX: 'tron',
  DOT: 'polkadot',
  MATIC: 'matic-network',
  LINK: 'chainlink',
  LTC: 'litecoin',
  BCH: 'bitcoin-cash',
  XLM: 'stellar',
  ATOM: 'cosmos',
  UNI: 'uniswap',
  ETC: 'ethereum-classic',
  FIL: 'filecoin',
  NEAR: 'near',
  APT: 'aptos',
  ARB: 'arbitrum',
  OP: 'optimism',
  SHIB: 'shiba-inu',
};

async function symbolToId(symbol: string): Promise<string> {
  const upper = symbol.toUpperCase();
  if (CANONICAL_IDS[upper]) return CANONICAL_IDS[upper];
  const list = await getCoinList();
  const entry = list.find((c) => c.symbol.toLowerCase() === symbol.toLowerCase());
  if (!entry) throw new Error(`[CoinGecko] unknown crypto symbol '${symbol}'`);
  return entry.id;
}

/**
 * Parse a "BTC-USD" / "ETH-USD" / "BTC-ETH" ticker into a base CoinGecko
 * coin id and a quote currency. Quote crypto-to-crypto is approximated by
 * fetching USD prices for both legs and dividing.
 */
async function resolveTicker(ticker: string): Promise<{ id: string; quote: string; isCryptoQuote: boolean; quoteId?: string }> {
  const [baseSym, quoteSymRaw] = ticker.split('-');
  if (!baseSym || !quoteSymRaw) {
    throw new Error(`[CoinGecko] invalid ticker '${ticker}' — expected e.g. 'BTC-USD'`);
  }
  const id = await symbolToId(baseSym);
  if (quoteSymRaw.toLowerCase() === 'usd') {
    return { id, quote: 'usd', isCryptoQuote: false };
  }
  const quoteId = await symbolToId(quoteSymRaw);
  return { id, quote: quoteSymRaw.toLowerCase(), isCryptoQuote: true, quoteId };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class CoinGeckoProvider implements DataProvider {
  readonly name = 'coingecko';

  async getCryptoPriceSnapshot(input: { ticker: string }): Promise<ProviderResult<unknown>> {
    const ticker = input.ticker.toUpperCase();
    const r = await resolveTicker(ticker);
    if (r.isCryptoQuote) {
      const { data, url } = await geckoGet<Record<string, { usd: number; usd_24h_vol: number }>>('/simple/price', {
        ids: `${r.id},${r.quoteId}`,
        vs_currencies: 'usd',
        include_24hr_vol: 'true',
      });
      const baseUsd = data[r.id]?.usd ?? 0;
      const quoteUsd = data[r.quoteId!]?.usd ?? 1;
      return {
        data: {
          ticker,
          price: quoteUsd ? baseUsd / quoteUsd : null,
          close: quoteUsd ? baseUsd / quoteUsd : null,
          volume: data[r.id]?.usd_24h_vol,
        },
        sources: [url],
      };
    }
    const { data, url } = await geckoGet<Record<string, { usd: number; usd_24h_vol: number; usd_market_cap: number }>>(
      '/simple/price',
      { ids: r.id, vs_currencies: 'usd', include_24hr_vol: 'true', include_market_cap: 'true' },
    );
    const entry = data[r.id] ?? { usd: 0, usd_24h_vol: 0, usd_market_cap: 0 };
    return {
      data: {
        ticker,
        price: entry.usd,
        close: entry.usd,
        volume: entry.usd_24h_vol,
        market_cap: entry.usd_market_cap,
      },
      sources: [url],
    };
  }

  async getCryptoPrices(input: CryptoPricesInput): Promise<ProviderResult<unknown>> {
    const ticker = input.ticker.toUpperCase();
    const r = await resolveTicker(ticker);
    // Compute days from start_date to end_date
    const start = Math.floor(new Date(input.start_date + 'T00:00:00Z').getTime() / 1000);
    const end = Math.floor(new Date(input.end_date + 'T23:59:59Z').getTime() / 1000);
    const { data, url } = await geckoGet<{
      prices: [number, number][]; // [unix_ms, price]
      total_volumes: [number, number][];
    }>(`/coins/${r.id}/market_chart/range`, {
      vs_currency: r.isCryptoQuote ? 'usd' : r.quote,
      from: start,
      to: end,
    });
    let priceSeries = data.prices;
    if (r.isCryptoQuote) {
      // Fetch quote series too, then divide
      const { data: q } = await geckoGet<{ prices: [number, number][] }>(
        `/coins/${r.quoteId}/market_chart/range`,
        { vs_currency: 'usd', from: start, to: end },
      );
      const quoteByMs = new Map(q.prices.map(([t, p]) => [t, p]));
      priceSeries = priceSeries
        .map(([t, p]) => {
          const qp = quoteByMs.get(t) ?? quoteByMs.get(t - 60_000) ?? null;
          return qp ? ([t, p / qp] as [number, number]) : null;
        })
        .filter((v): v is [number, number] => v !== null);
    }
    const volByMs = new Map(data.total_volumes.map(([t, v]) => [t, v]));
    const rows = priceSeries.map(([ts, price]) => ({
      ticker,
      date: new Date(ts).toISOString().slice(0, 10),
      close: price,
      open: price,
      high: price,
      low: price,
      volume: volByMs.get(ts) ?? null,
    }));
    return { data: rows, sources: [url] };
  }

  async getCryptoTickers(): Promise<ProviderResult<unknown>> {
    const list = await getCoinList();
    const tickers = list.slice(0, 200).map((c) => ({
      ticker: `${c.symbol.toUpperCase()}-USD`,
      name: c.name,
      coin_id: c.id,
    }));
    return { data: tickers, sources: [`${BASE_URL}/coins/list`] };
  }

  // --- Not implemented (handled by other providers) ---------------------

  getIncomeStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getIncomeStatements');
  }
  getBalanceSheets(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getBalanceSheets');
  }
  getCashFlowStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getCashFlowStatements');
  }
  getAllFinancialStatements(_input: FinancialStatementsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getAllFinancialStatements');
  }
  getFilings(_input: FilingsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getFilings');
  }
  getFilingItems(_input: FilingItemsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getFilingItems');
  }
  getFilingItemTypes(): Promise<FilingItemTypes> {
    throw new NotImplementedByCoinGecko('getFilingItemTypes');
  }
  getKeyRatiosSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getKeyRatiosSnapshot');
  }
  getHistoricalKeyRatios(_input: HistoricalKeyRatiosInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getHistoricalKeyRatios');
  }
  getAnalystEstimates(_input: AnalystEstimatesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getAnalystEstimates');
  }
  getEarnings(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getEarnings');
  }
  getSegmentedRevenues(_input: SegmentedRevenuesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getSegmentedRevenues');
  }
  getStockPriceSnapshot(_input: { ticker: string }): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getStockPriceSnapshot');
  }
  getStockPrices(_input: StockPricesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getStockPrices');
  }
  getStockTickers(): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getStockTickers');
  }
  getInsiderTrades(_input: InsiderTradesInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getInsiderTrades');
  }
  getNews(_input: NewsInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('getNews');
  }
  getScreenerFilters(): Promise<Record<string, unknown>> {
    throw new NotImplementedByCoinGecko('getScreenerFilters');
  }
  screenStocks(_input: ScreenerInput): Promise<ProviderResult<unknown>> {
    throw new NotImplementedByCoinGecko('screenStocks');
  }
}
