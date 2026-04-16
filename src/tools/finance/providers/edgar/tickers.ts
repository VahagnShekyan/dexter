/**
 * Ticker → CIK resolver.
 *
 * SEC publishes the full ticker→CIK mapping at company_tickers.json.
 * It's small (~1MB, ~10K entries) and changes infrequently. We fetch
 * it once per process and cache to disk for 24h.
 *
 * EDGAR endpoints expect a 10-digit zero-padded CIK string.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { dexterPath } from '../../../../utils/paths.js';
import { logger } from '../../../../utils/logger.js';
import { edgarFetchJson } from './client.js';

const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const TICKER_CACHE_PATH = dexterPath('cache/edgar/company_tickers.json');
const TICKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

/** Raw shape: { "0": { cik_str, ticker, title }, "1": { ... }, ... } */
type TickersResponse = Record<string, TickerEntry>;

interface DiskCache {
  fetchedAt: string;
  byTicker: Record<string, { cik: string; name: string }>;
}

let memoryCache: DiskCache | null = null;

/**
 * Return the loaded ticker map, fetching/refreshing if needed.
 * Idempotent — safe to call many times.
 */
async function loadTickers(): Promise<DiskCache> {
  if (memoryCache && isCacheFresh(memoryCache)) return memoryCache;

  // Try disk cache first
  const fromDisk = readDiskCache();
  if (fromDisk && isCacheFresh(fromDisk)) {
    memoryCache = fromDisk;
    return fromDisk;
  }

  // Fetch from SEC
  logger.info('[EDGAR] fetching company_tickers.json');
  const raw = await edgarFetchJson<TickersResponse>(TICKERS_URL);
  const byTicker: Record<string, { cik: string; name: string }> = {};
  for (const entry of Object.values(raw)) {
    if (!entry || typeof entry.ticker !== 'string') continue;
    const cik = String(entry.cik_str).padStart(10, '0');
    byTicker[entry.ticker.toUpperCase()] = { cik, name: entry.title };
  }

  const cache: DiskCache = { fetchedAt: new Date().toISOString(), byTicker };
  writeDiskCache(cache);
  memoryCache = cache;
  return cache;
}

function isCacheFresh(cache: DiskCache): boolean {
  const age = Date.now() - Date.parse(cache.fetchedAt);
  return Number.isFinite(age) && age < TICKER_CACHE_TTL_MS;
}

function readDiskCache(): DiskCache | null {
  if (!existsSync(TICKER_CACHE_PATH)) return null;
  try {
    const parsed = JSON.parse(readFileSync(TICKER_CACHE_PATH, 'utf-8')) as DiskCache;
    if (!parsed.fetchedAt || !parsed.byTicker) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDiskCache(cache: DiskCache): void {
  try {
    mkdirSync(dirname(TICKER_CACHE_PATH), { recursive: true });
    writeFileSync(TICKER_CACHE_PATH, JSON.stringify(cache));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[EDGAR] failed to write ticker cache: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Look up the 10-digit zero-padded CIK for a ticker. Throws if unknown. */
export async function tickerToCik(ticker: string): Promise<string> {
  const upper = ticker.trim().toUpperCase();
  const cache = await loadTickers();
  const entry = cache.byTicker[upper];
  if (!entry) {
    throw new Error(`[EDGAR] unknown ticker: ${ticker}`);
  }
  return entry.cik;
}

/** Look up the registered company name for a ticker. Throws if unknown. */
export async function tickerToCompanyName(ticker: string): Promise<string> {
  const upper = ticker.trim().toUpperCase();
  const cache = await loadTickers();
  const entry = cache.byTicker[upper];
  if (!entry) throw new Error(`[EDGAR] unknown ticker: ${ticker}`);
  return entry.name;
}

/** Reset all caches — used by tests. */
export function resetTickerCache(): void {
  memoryCache = null;
}
