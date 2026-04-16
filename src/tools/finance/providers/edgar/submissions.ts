/**
 * SEC EDGAR submissions endpoint.
 *
 *   https://data.sec.gov/submissions/CIK{cik}.json
 *
 * Returns the company's filing history. Recent filings are inline; older
 * filings are split into supplementary files we may need to fetch on demand.
 *
 * The wire format is column-oriented (parallel arrays). We zip them into
 * per-filing rows for downstream use.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { dexterPath } from '../../../../utils/paths.js';
import { logger } from '../../../../utils/logger.js';
import { edgarFetchJson } from './client.js';
import { tickerToCik } from './tickers.js';

const SUBMISSIONS_URL = (cik: string) =>
  `https://data.sec.gov/submissions/CIK${cik}.json`;
const ARCHIVES_BASE = (cik: string) =>
  `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}`;
const SUBMISSIONS_CACHE_DIR = dexterPath('cache/edgar/submissions');
const SUBMISSIONS_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface SubmissionsRecent {
  accessionNumber: string[];
  filingDate: string[];
  reportDate: string[];
  acceptanceDateTime: string[];
  form: string[];
  primaryDocument: string[];
  primaryDocDescription: string[];
  fileNumber?: string[];
  isXBRL?: number[];
}

interface SubmissionsAdditionalFile {
  name: string;
  filingFrom: string;
  filingTo: string;
}

interface SubmissionsResponse {
  cik: string;
  name: string;
  tickers: string[];
  exchanges?: string[];
  sic?: string;
  sicDescription?: string;
  filings: {
    recent: SubmissionsRecent;
    files?: SubmissionsAdditionalFile[];
  };
}

export interface FilingRecord {
  accession_number: string;
  filing_date: string;
  report_date: string;
  filing_type: string;
  primary_document: string;
  primary_document_description: string;
  filing_url: string;
  index_url: string;
}

interface DiskCachedSubmissions {
  fetchedAt: string;
  data: SubmissionsResponse;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const memoryCache = new Map<string, DiskCachedSubmissions>();

function cachePath(cik: string): string {
  return join(SUBMISSIONS_CACHE_DIR, `CIK${cik}.json`);
}

function readDiskCache(cik: string): DiskCachedSubmissions | null {
  const path = cachePath(cik);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as DiskCachedSubmissions;
    if (!parsed.fetchedAt || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDiskCache(cik: string, entry: DiskCachedSubmissions): void {
  try {
    mkdirSync(dirname(cachePath(cik)), { recursive: true });
    writeFileSync(cachePath(cik), JSON.stringify(entry));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn(`[EDGAR] failed to write submissions cache for CIK${cik}: ${msg}`);
  }
}

function isFresh(entry: DiskCachedSubmissions): boolean {
  const age = Date.now() - Date.parse(entry.fetchedAt);
  return Number.isFinite(age) && age < SUBMISSIONS_CACHE_TTL_MS;
}

// ---------------------------------------------------------------------------
// Fetch + zip
// ---------------------------------------------------------------------------

async function getSubmissions(ticker: string): Promise<SubmissionsResponse> {
  const cik = await tickerToCik(ticker);
  const inMem = memoryCache.get(cik);
  if (inMem && isFresh(inMem)) return inMem.data;
  const fromDisk = readDiskCache(cik);
  if (fromDisk && isFresh(fromDisk)) {
    memoryCache.set(cik, fromDisk);
    return fromDisk.data;
  }
  logger.info(`[EDGAR] fetching submissions for ${ticker} (CIK${cik})`);
  const data = await edgarFetchJson<SubmissionsResponse>(SUBMISSIONS_URL(cik));
  const entry: DiskCachedSubmissions = { fetchedAt: new Date().toISOString(), data };
  writeDiskCache(cik, entry);
  memoryCache.set(cik, entry);
  return data;
}

/**
 * Convert a column-oriented `recent` block + CIK into a list of filing rows
 * with absolute URLs.
 */
function zipFilings(cik: string, recent: SubmissionsRecent): FilingRecord[] {
  const cikInt = parseInt(cik, 10);
  const rows: FilingRecord[] = [];
  const n = recent.accessionNumber?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const accn = recent.accessionNumber[i];
    if (!accn) continue;
    const accnNoHyphen = accn.replace(/-/g, '');
    const primary = recent.primaryDocument[i] ?? '';
    rows.push({
      accession_number: accn,
      filing_date: recent.filingDate[i] ?? '',
      report_date: recent.reportDate[i] ?? '',
      filing_type: recent.form[i] ?? '',
      primary_document: primary,
      primary_document_description: recent.primaryDocDescription[i] ?? '',
      filing_url: `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accnNoHyphen}/${primary}`,
      index_url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=&dateb=&owner=include&count=40`,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ListFilingsOptions {
  /** Filter to one or more form types (e.g. ["10-K", "10-Q"]). */
  formTypes?: string[];
  /** Maximum rows to return. */
  limit?: number;
}

export interface ListedFilings {
  rows: FilingRecord[];
  source: string;
}

export async function listFilings(ticker: string, opts: ListFilingsOptions = {}): Promise<ListedFilings> {
  const cik = await tickerToCik(ticker);
  const submissions = await getSubmissions(ticker);
  let rows = zipFilings(cik, submissions.filings.recent);

  if (opts.formTypes && opts.formTypes.length > 0) {
    const wanted = new Set(opts.formTypes.map((s) => s.toUpperCase()));
    rows = rows.filter((r) => wanted.has(r.filing_type.toUpperCase()));
  }
  if (opts.limit !== undefined) rows = rows.slice(0, opts.limit);

  return { rows, source: SUBMISSIONS_URL(cik) };
}

/** Resolve an accession number to its filing primary document URL + CIK. */
export async function findFilingByAccession(
  ticker: string,
  accession: string,
): Promise<FilingRecord | null> {
  const cik = await tickerToCik(ticker);
  const submissions = await getSubmissions(ticker);
  const rows = zipFilings(cik, submissions.filings.recent);
  return rows.find((r) => r.accession_number === accession) ?? null;
}

/** Reset all caches. */
export function resetSubmissionsCache(): void {
  memoryCache.clear();
}

export const _internal = { ARCHIVES_BASE };
