/**
 * SEC EDGAR HTTP client.
 *
 * SEC requires every request to identify the user via a User-Agent header
 * containing a contact email. Reads `EDGAR_USER_AGENT` from env; falls back
 * to a sensible default with a warning.
 *
 * Includes a soft rate limiter (max 8 concurrent requests in flight at a
 * time) and a retry on 429 with exponential backoff. The SEC documented
 * fair-use limit is 10 req/sec from a single IP.
 */

import { logger } from '../../../../utils/logger.js';

const DEFAULT_USER_AGENT = 'Dexter Research Agent dexter@example.com';

const MAX_CONCURRENT = 8;
const RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [500, 1500, 4000];

let warnedAboutDefault = false;
function getUserAgent(): string {
  const ua = (process.env.EDGAR_USER_AGENT || '').trim();
  if (ua) return ua;
  if (!warnedAboutDefault) {
    logger.warn(
      '[EDGAR] EDGAR_USER_AGENT not set — using default. Set it to "Your Name your-email@example.com" to comply with SEC fair-use policy.',
    );
    warnedAboutDefault = true;
  }
  return DEFAULT_USER_AGENT;
}

// ---------------------------------------------------------------------------
// Concurrency limiter
// ---------------------------------------------------------------------------

let inFlight = 0;
const queue: Array<() => void> = [];

function acquire(): Promise<void> {
  if (inFlight < MAX_CONCURRENT) {
    inFlight++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    queue.push(() => {
      inFlight++;
      resolve();
    });
  });
}

function release(): void {
  inFlight--;
  const next = queue.shift();
  if (next) next();
}

// ---------------------------------------------------------------------------
// Fetch with retry
// ---------------------------------------------------------------------------

export interface EdgarFetchOptions {
  /** Accept header — JSON for /api/, html/text for /Archives/. */
  accept?: string;
  /** Skip the User-Agent (only for tests). */
  skipUserAgent?: boolean;
}

/**
 * Fetch a URL from data.sec.gov or www.sec.gov.
 * Returns the Response object — caller is responsible for parsing.
 */
export async function edgarFetch(url: string, opts: EdgarFetchOptions = {}): Promise<Response> {
  await acquire();
  try {
    let lastError: unknown = null;
    for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': opts.skipUserAgent ? '' : getUserAgent(),
            'Accept': opts.accept ?? 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
        });

        if (response.status === 429) {
          const wait = RETRY_BACKOFF_MS[attempt] ?? 4000;
          logger.warn(`[EDGAR] 429 from ${url} — backing off ${wait}ms (attempt ${attempt + 1}/${RETRY_ATTEMPTS})`);
          await sleep(wait);
          continue;
        }

        if (!response.ok && response.status >= 500 && attempt < RETRY_ATTEMPTS - 1) {
          const wait = RETRY_BACKOFF_MS[attempt] ?? 4000;
          logger.warn(`[EDGAR] ${response.status} from ${url} — retry in ${wait}ms`);
          await sleep(wait);
          continue;
        }

        return response;
      } catch (err) {
        lastError = err;
        if (attempt < RETRY_ATTEMPTS - 1) {
          const wait = RETRY_BACKOFF_MS[attempt] ?? 4000;
          logger.warn(`[EDGAR] network error on ${url} — retry in ${wait}ms`);
          await sleep(wait);
          continue;
        }
      }
    }

    if (lastError) throw lastError;
    throw new Error(`[EDGAR] failed after ${RETRY_ATTEMPTS} attempts: ${url}`);
  } finally {
    release();
  }
}

/**
 * Fetch JSON from EDGAR. Throws on non-2xx responses.
 */
export async function edgarFetchJson<T>(url: string): Promise<T> {
  const response = await edgarFetch(url, { accept: 'application/json' });
  if (!response.ok) {
    throw new Error(`[EDGAR] ${response.status} ${response.statusText} for ${url}`);
  }
  return (await response.json()) as T;
}

/**
 * Fetch a text body (for filing HTML/XML).
 */
export async function edgarFetchText(url: string, accept = 'text/html'): Promise<string> {
  const response = await edgarFetch(url, { accept });
  if (!response.ok) {
    throw new Error(`[EDGAR] ${response.status} ${response.statusText} for ${url}`);
  }
  return await response.text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
