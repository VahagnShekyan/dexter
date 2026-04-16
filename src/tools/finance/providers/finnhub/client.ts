/**
 * Finnhub HTTP client.
 *
 * Free tier: 60 requests/minute. We enforce a soft local limit of 50/min
 * to leave headroom and treat 429 with a long backoff.
 *
 * Auth: `FINNHUB_API_KEY` env var. Passed as `?token=` query param.
 */

import { logger } from '../../../../utils/logger.js';

const BASE_URL = 'https://finnhub.io/api/v1';
const RATE_LIMIT_PER_MIN = 50;

let warnedAboutKey = false;
function getApiKey(): string {
  const key = (process.env.FINNHUB_API_KEY || '').trim();
  if (!key && !warnedAboutKey) {
    logger.warn('[Finnhub] FINNHUB_API_KEY not set — calls will return 401.');
    warnedAboutKey = true;
  }
  return key;
}

// ---------------------------------------------------------------------------
// Sliding-window rate limiter
// ---------------------------------------------------------------------------

const callLog: number[] = [];
async function takeSlot(): Promise<void> {
  const now = Date.now();
  while (callLog.length > 0 && now - callLog[0] > 60_000) callLog.shift();
  if (callLog.length >= RATE_LIMIT_PER_MIN) {
    const wait = 60_000 - (now - callLog[0]) + 50;
    await sleep(wait);
    return takeSlot();
  }
  callLog.push(Date.now());
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Public fetch
// ---------------------------------------------------------------------------

export interface FinnhubResponse<T> {
  data: T;
  url: string;
}

export async function finnhubGet<T>(
  endpoint: string,
  params: Record<string, string | number | undefined> = {},
): Promise<FinnhubResponse<T>> {
  await takeSlot();
  const key = getApiKey();

  const url = new URL(`${BASE_URL}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.append(k, String(v));
  }
  if (key) url.searchParams.append('token', key);

  // Build the citation URL without the token
  const citationUrl = url.toString().replace(/([?&])token=[^&]+/, '$1');

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json' },
      });
      if (response.status === 429) {
        const wait = 5000 * (attempt + 1);
        logger.warn(`[Finnhub] 429 rate limit — backing off ${wait}ms`);
        await sleep(wait);
        continue;
      }
      if (!response.ok) {
        throw new Error(`[Finnhub] ${response.status} ${response.statusText} for ${endpoint}`);
      }
      const data = (await response.json()) as T;
      return { data, url: citationUrl };
    } catch (err) {
      lastError = err;
      if (attempt < 2) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
    }
  }
  if (lastError) throw lastError;
  throw new Error(`[Finnhub] failed after retries: ${endpoint}`);
}
