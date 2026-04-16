/**
 * SEC EDGAR companyfacts fetcher.
 *
 * Endpoint: https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json
 *
 * Returns ALL XBRL facts a company has ever reported, across the entire
 * `dei` and `us-gaap` taxonomies. Files can be 5-30MB. Cached on disk for
 * 24h since fundamentals change at most quarterly.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { dexterPath } from '../../../../utils/paths.js';
import { logger } from '../../../../utils/logger.js';
import { edgarFetchJson } from './client.js';
import { tickerToCik } from './tickers.js';

const COMPANYFACTS_URL = (cik: string) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
const FACTS_CACHE_DIR = dexterPath('cache/edgar/companyfacts');
const FACTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Companyfacts response shape
// ---------------------------------------------------------------------------

/** A single reported data point. */
export interface XbrlFact {
  /** Period start (only present for duration concepts). */
  start?: string;
  /** Period end. */
  end: string;
  /** Reported value. */
  val: number;
  /** Accession number of the filing this came from. */
  accn: string;
  /** Fiscal year. */
  fy: number;
  /** Fiscal period: "FY" / "Q1" / "Q2" / "Q3" / "Q4". */
  fp: string;
  /** Filing form: "10-K" / "10-Q" / "8-K" / etc. */
  form: string;
  /** Date the filing was submitted (YYYY-MM-DD). */
  filed: string;
  /** Frame ID for cross-company comparisons (e.g. "CY2023Q4I"). */
  frame?: string;
}

export interface XbrlConcept {
  label?: string;
  description?: string;
  /** Map of unit name → array of facts. e.g. { "USD": [...], "shares": [...] } */
  units: Record<string, XbrlFact[]>;
}

export interface CompanyFacts {
  cik: number;
  entityName: string;
  facts: {
    'us-gaap'?: Record<string, XbrlConcept>;
    dei?: Record<string, XbrlConcept>;
    srt?: Record<string, XbrlConcept>;
  };
}

interface DiskCachedFacts {
  fetchedAt: string;
  facts: CompanyFacts;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, DiskCachedFacts>();

function cachePath(cik: string): string {
  return join(FACTS_CACHE_DIR, `CIK${cik}.json`);
}

function readDiskCache(cik: string): DiskCachedFacts | null {
  const path = cachePath(cik);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as DiskCachedFacts;
    if (!parsed.fetchedAt || !parsed.facts) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDiskCache(cik: string, entry: DiskCachedFacts): void {
  try {
    mkdirSync(dirname(cachePath(cik)), { recursive: true });
    writeFileSync(cachePath(cik), JSON.stringify(entry));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[EDGAR] failed to write companyfacts cache for CIK${cik}: ${msg}`);
  }
}

function isFresh(entry: DiskCachedFacts): boolean {
  const age = Date.now() - Date.parse(entry.fetchedAt);
  return Number.isFinite(age) && age < FACTS_CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch the full companyfacts JSON for a ticker.
 * Cached in memory for the process lifetime; on disk for 24h.
 */
export async function getCompanyFacts(ticker: string): Promise<CompanyFacts> {
  const cik = await tickerToCik(ticker);

  const inMem = memoryCache.get(cik);
  if (inMem && isFresh(inMem)) return inMem.facts;

  const fromDisk = readDiskCache(cik);
  if (fromDisk && isFresh(fromDisk)) {
    memoryCache.set(cik, fromDisk);
    return fromDisk.facts;
  }

  const url = COMPANYFACTS_URL(cik);
  logger.info(`[EDGAR] fetching companyfacts for ${ticker} (CIK${cik})`);
  const facts = await edgarFetchJson<CompanyFacts>(url);
  const entry: DiskCachedFacts = { fetchedAt: new Date().toISOString(), facts };
  writeDiskCache(cik, entry);
  memoryCache.set(cik, entry);
  return facts;
}

/** Construct the canonical URL for a companyfacts response (used as citation). */
export async function companyFactsUrl(ticker: string): Promise<string> {
  const cik = await tickerToCik(ticker);
  return COMPANYFACTS_URL(cik);
}

/** Reset all caches — used by tests. */
export function resetCompanyFactsCache(): void {
  memoryCache.clear();
}
