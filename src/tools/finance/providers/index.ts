/**
 * Provider selection.
 *
 * Reads `DATA_PROVIDER` from env. Defaults to `fdatasets` so existing
 * deployments keep their current behavior until the toggle is flipped.
 *
 *   fdatasets  → FinancialDatasetsProvider (default, current behavior)
 *   composite  → CompositeProvider (free stack, added in step 7)
 *   edgar      → EdgarProvider only (added in step 2)
 *   finnhub    → FinnhubProvider only (added in step 4)
 *   fmp        → FmpProvider only (added in step 5)
 *
 * Unknown values fall back to `fdatasets` with a warning.
 */

import { logger } from '../../../utils/logger.js';
import { FinancialDatasetsProvider } from './financialdatasets.js';
import type { DataProvider } from './types.js';

export type ProviderName = 'fdatasets' | 'composite' | 'edgar' | 'finnhub' | 'fmp';

const DEFAULT_PROVIDER: ProviderName = 'fdatasets';

let cachedProvider: DataProvider | null = null;

function build(name: ProviderName): DataProvider {
  switch (name) {
    case 'fdatasets':
      return new FinancialDatasetsProvider();
    case 'composite':
    case 'edgar':
    case 'finnhub':
    case 'fmp':
      // Not yet implemented — wired up in later steps of the migration.
      logger.warn(`[providers] '${name}' provider not yet implemented; falling back to fdatasets`);
      return new FinancialDatasetsProvider();
  }
}

function resolveName(): ProviderName {
  const raw = (process.env.DATA_PROVIDER || '').trim().toLowerCase();
  if (!raw) return DEFAULT_PROVIDER;
  if (raw === 'fdatasets' || raw === 'composite' || raw === 'edgar' || raw === 'finnhub' || raw === 'fmp') {
    return raw;
  }
  logger.warn(`[providers] unknown DATA_PROVIDER='${raw}'; falling back to '${DEFAULT_PROVIDER}'`);
  return DEFAULT_PROVIDER;
}

/**
 * Get the active data provider singleton.
 * Reads `DATA_PROVIDER` env on first call; subsequent calls return the cached instance.
 */
export function getProvider(): DataProvider {
  if (cachedProvider) return cachedProvider;
  const name = resolveName();
  cachedProvider = build(name);
  return cachedProvider;
}

/** Reset the cached provider — used by tests when switching providers mid-run. */
export function resetProvider(): void {
  cachedProvider = null;
}

export type { DataProvider } from './types.js';
export * from './types.js';
