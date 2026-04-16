/**
 * Provider parity harness.
 *
 * Runs the same set of test calls against two providers and reports
 * field-level drift. Used to validate the composite/edgar/finnhub stack
 * against the legacy FinancialDatasetsProvider before flipping the
 * default `DATA_PROVIDER` env var.
 *
 * Usage:
 *   bun run src/evals/provider-parity.ts
 *   bun run src/evals/provider-parity.ts --baseline fdatasets --candidate composite --tickers AAPL,MSFT
 */

import { CompositeProvider } from '../tools/finance/providers/composite.js';
import { EdgarProvider } from '../tools/finance/providers/edgar/provider.js';
import { FinancialDatasetsProvider } from '../tools/finance/providers/financialdatasets.js';
import { FinnhubProvider } from '../tools/finance/providers/finnhub/provider.js';
import { FmpProvider } from '../tools/finance/providers/fmp/provider.js';
import { CoinGeckoProvider } from '../tools/finance/providers/coingecko/provider.js';
import type { DataProvider } from '../tools/finance/providers/types.js';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

interface Args {
  baseline: string;
  candidate: string;
  tickers: string[];
  tolerancePct: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    baseline: 'fdatasets',
    candidate: 'composite',
    tickers: ['AAPL', 'MSFT', 'NVDA'],
    tolerancePct: 1, // 1% relative drift allowed by default
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--baseline') out.baseline = argv[++i];
    else if (a === '--candidate') out.candidate = argv[++i];
    else if (a === '--tickers') out.tickers = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--tolerance') out.tolerancePct = parseFloat(argv[++i]);
  }
  return out;
}

function buildProvider(name: string): DataProvider {
  switch (name) {
    case 'fdatasets': return new FinancialDatasetsProvider();
    case 'edgar': return new EdgarProvider();
    case 'finnhub': return new FinnhubProvider();
    case 'fmp': return new FmpProvider();
    case 'coingecko': return new CoinGeckoProvider();
    case 'composite': return new CompositeProvider();
    default: throw new Error(`unknown provider: ${name}`);
  }
}

// ---------------------------------------------------------------------------
// Diff utilities
// ---------------------------------------------------------------------------

interface FieldDrift {
  ticker: string;
  method: string;
  period: string;
  field: string;
  baseline: unknown;
  candidate: unknown;
  driftPct: number | null;
}

function asNumberOrNull(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function diffRow(
  baseline: Record<string, unknown>,
  candidate: Record<string, unknown>,
  context: { ticker: string; method: string; period: string },
  tolerancePct: number,
): FieldDrift[] {
  const out: FieldDrift[] = [];
  // Diff every field in either side
  const keys = new Set<string>([...Object.keys(baseline), ...Object.keys(candidate)]);
  for (const key of keys) {
    if (key === 'ticker' || key === 'fiscal_period' || key === 'fiscal_year' || key === 'calendar_date') continue;
    const b = baseline[key];
    const c = candidate[key];
    const bn = asNumberOrNull(b);
    const cn = asNumberOrNull(c);

    if (bn === null && cn === null) continue;
    if (bn === null || cn === null) {
      out.push({ ...context, field: key, baseline: b, candidate: c, driftPct: null });
      continue;
    }
    if (bn === 0 && cn === 0) continue;

    const denom = Math.max(Math.abs(bn), Math.abs(cn));
    const driftPct = denom === 0 ? 0 : (Math.abs(bn - cn) / denom) * 100;
    if (driftPct > tolerancePct) {
      out.push({ ...context, field: key, baseline: b, candidate: c, driftPct });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Test cases — pairs of (label, fn) per ticker
// ---------------------------------------------------------------------------

interface TestCase {
  label: string;
  /** Returns an array of rows + a row-key extractor for matching. */
  run: (provider: DataProvider, ticker: string) => Promise<{
    method: string;
    rows: Record<string, unknown>[];
    keyOf: (row: Record<string, unknown>) => string;
  }>;
}

const TEST_CASES: TestCase[] = [
  {
    label: 'income statements (annual, last 3)',
    run: async (provider, ticker) => {
      const r = await provider.getIncomeStatements({ ticker, period: 'annual', limit: 3 });
      return {
        method: 'getIncomeStatements',
        rows: Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [],
        keyOf: (row) => String(row.report_period ?? ''),
      };
    },
  },
  {
    label: 'balance sheets (annual, last 3)',
    run: async (provider, ticker) => {
      const r = await provider.getBalanceSheets({ ticker, period: 'annual', limit: 3 });
      return {
        method: 'getBalanceSheets',
        rows: Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [],
        keyOf: (row) => String(row.report_period ?? ''),
      };
    },
  },
  {
    label: 'cash flow (annual, last 3)',
    run: async (provider, ticker) => {
      const r = await provider.getCashFlowStatements({ ticker, period: 'annual', limit: 3 });
      return {
        method: 'getCashFlowStatements',
        rows: Array.isArray(r.data) ? (r.data as Record<string, unknown>[]) : [],
        keyOf: (row) => String(row.report_period ?? ''),
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseline = buildProvider(args.baseline);
  const candidate = buildProvider(args.candidate);

  console.log(`# Provider parity report`);
  console.log(`# baseline=${baseline.name}  candidate=${candidate.name}  tolerance=${args.tolerancePct}%`);
  console.log(`# tickers=${args.tickers.join(',')}`);
  console.log();

  const allDrifts: FieldDrift[] = [];

  for (const ticker of args.tickers) {
    for (const tc of TEST_CASES) {
      try {
        const [b, c] = await Promise.all([tc.run(baseline, ticker), tc.run(candidate, ticker)]);
        const candidateByKey = new Map(c.rows.map((row) => [c.keyOf(row), row] as const));

        let comparedRows = 0;
        for (const baseRow of b.rows) {
          const key = b.keyOf(baseRow);
          const candRow = candidateByKey.get(key);
          if (!candRow) continue;
          comparedRows++;
          const drifts = diffRow(baseRow, candRow, {
            ticker, method: c.method, period: key,
          }, args.tolerancePct);
          allDrifts.push(...drifts);
        }
        console.log(`[OK] ${ticker} / ${tc.label}: ${comparedRows} matched rows`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.log(`[ERR] ${ticker} / ${tc.label}: ${msg}`);
      }
    }
  }

  console.log();
  console.log(`# Drift report (${allDrifts.length} fields outside tolerance)`);
  if (allDrifts.length === 0) {
    console.log('PASS — no drift detected');
    return;
  }
  console.log('| ticker | method | period | field | baseline | candidate | drift% |');
  console.log('|--------|--------|--------|-------|----------|-----------|--------|');
  for (const d of allDrifts.slice(0, 200)) {
    console.log(
      `| ${d.ticker} | ${d.method} | ${d.period} | ${d.field} | ${String(d.baseline)} | ${String(d.candidate)} | ${
        d.driftPct === null ? 'null-mismatch' : d.driftPct.toFixed(2)
      } |`,
    );
  }
  if (allDrifts.length > 200) console.log(`... and ${allDrifts.length - 200} more rows`);
  process.exitCode = 1;
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
