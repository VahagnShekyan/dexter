/**
 * SEC Form 4 insider-trade extraction.
 *
 * Form 4 filings are Forms 3, 4, and 5 — beneficial ownership reports.
 * We list them via the submissions API filtered to form="4", then for
 * each one fetch the primary XML document and pull out non-derivative
 * transactions (open-market buys/sells of the company's own stock).
 *
 * The XML schema is well-defined (`http://www.sec.gov/edgar/ownership/`).
 * We do a lightweight regex extraction rather than pulling in a full XML
 * parser — Form 4 docs are small (~2-10KB) and the fields we need are
 * unambiguous string captures.
 */

import { edgarFetchText } from './client.js';
import { listFilings, type FilingRecord } from './submissions.js';

export interface InsiderTrade {
  ticker: string;
  filing_date: string;
  transaction_date: string;
  full_name: string;
  officer_title: string | null;
  is_director: boolean;
  is_officer: boolean;
  is_ten_percent_owner: boolean;
  transaction_type: 'buy' | 'sell' | 'other';
  transaction_code: string;
  shares: number | null;
  price_per_share: number | null;
  shares_owned_after: number | null;
  security_title: string | null;
  filing_url: string;
  accession_number: string;
}

// ---------------------------------------------------------------------------
// XML extraction helpers — uses String.match/matchAll, no RegExp.exec
// ---------------------------------------------------------------------------

function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function tagAll(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'gi');
  const out: string[] = [];
  for (const m of xml.matchAll(re)) out.push(m[1].trim());
  return out;
}

function valueOf(xml: string, name: string): string | null {
  const block = tag(xml, name);
  if (!block) return null;
  return tag(block, 'value') ?? block.trim();
}

function numberOf(xml: string, name: string): number | null {
  const v = valueOf(xml, name);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function boolOf(xml: string, name: string): boolean {
  const v = valueOf(xml, name);
  if (!v) return false;
  return v === '1' || v.toLowerCase() === 'true';
}

function classifyTransaction(code: string): 'buy' | 'sell' | 'other' {
  // P = open-market purchase, S = open-market sale.
  // M, A, F, C, G, J, V etc. are exercises, awards, withholding, etc.
  if (code === 'P') return 'buy';
  if (code === 'S') return 'sell';
  return 'other';
}

// ---------------------------------------------------------------------------
// Per-filing parser
// ---------------------------------------------------------------------------

function parseForm4Xml(
  xml: string,
  ticker: string,
  filing: FilingRecord,
): InsiderTrade[] {
  const reportingOwner = tag(xml, 'reportingOwner') ?? '';
  const name = tag(reportingOwner, 'rptOwnerName') ?? '';
  const relationship = tag(reportingOwner, 'reportingOwnerRelationship') ?? '';

  const isDirector = boolOf(relationship, 'isDirector');
  const isOfficer = boolOf(relationship, 'isOfficer');
  const isTenPct = boolOf(relationship, 'isTenPercentOwner');
  const officerTitle = valueOf(relationship, 'officerTitle');

  // Each <nonDerivativeTransaction> is one trade; <nonDerivativeHolding>
  // is post-transaction position only (no shares moved). We want trades.
  const transactions = tagAll(xml, 'nonDerivativeTransaction');
  const trades: InsiderTrade[] = [];

  for (const tx of transactions) {
    const securityTitle = valueOf(tx, 'securityTitle');
    const txDate = valueOf(tx, 'transactionDate') ?? '';
    const amounts = tag(tx, 'transactionAmounts') ?? '';
    const shares = numberOf(amounts, 'transactionShares');
    const price = numberOf(amounts, 'transactionPricePerShare');
    const code = valueOf(amounts, 'transactionAcquiredDisposedCode') ?? '';
    const txCoding = tag(tx, 'transactionCoding') ?? '';
    const txCode = valueOf(txCoding, 'transactionCode') ?? '';
    const postAmounts = tag(tx, 'postTransactionAmounts') ?? '';
    const ownedAfter = numberOf(postAmounts, 'sharesOwnedFollowingTransaction');

    trades.push({
      ticker: ticker.toUpperCase(),
      filing_date: filing.filing_date,
      transaction_date: txDate,
      full_name: name,
      officer_title: officerTitle,
      is_director: isDirector,
      is_officer: isOfficer,
      is_ten_percent_owner: isTenPct,
      // Prefer the transaction-code classification; fall back to A/D code
      transaction_type:
        classifyTransaction(txCode) !== 'other'
          ? classifyTransaction(txCode)
          : code === 'A'
            ? 'buy'
            : code === 'D'
              ? 'sell'
              : 'other',
      transaction_code: txCode,
      shares,
      price_per_share: price,
      shares_owned_after: ownedAfter,
      security_title: securityTitle,
      filing_url: filing.filing_url,
      accession_number: filing.accession_number,
    });
  }

  return trades;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface InsiderQuery {
  ticker: string;
  limit?: number;
  filing_date?: string;
  filing_date_gte?: string;
  filing_date_lte?: string;
  filing_date_gt?: string;
  filing_date_lt?: string;
  /** Filter by insider name (case-insensitive substring match). */
  name?: string;
}

export interface InsiderResult {
  trades: InsiderTrade[];
  source: string;
}

export async function fetchInsiderTrades(query: InsiderQuery): Promise<InsiderResult> {
  // List all Form 4 filings, then narrow by date filters
  const { rows: filings, source } = await listFilings(query.ticker, {
    formTypes: ['4'],
    limit: 200,
  });

  const filtered = filings.filter((f) => {
    if (query.filing_date && f.filing_date !== query.filing_date) return false;
    if (query.filing_date_gte && f.filing_date < query.filing_date_gte) return false;
    if (query.filing_date_lte && f.filing_date > query.filing_date_lte) return false;
    if (query.filing_date_gt && f.filing_date <= query.filing_date_gt) return false;
    if (query.filing_date_lt && f.filing_date >= query.filing_date_lt) return false;
    return true;
  });

  // Fetch + parse the most recent N filings (each filing contains 1+ trades)
  const limit = query.limit ?? 10;
  const target = filtered.slice(0, Math.min(filtered.length, Math.max(limit, 20)));

  const trades: InsiderTrade[] = [];
  for (const filing of target) {
    if (trades.length >= limit) break;
    try {
      // primary_document is typically the XSL-rendered HTML at e.g.
      //   .../xslF345X06/form4.xml
      // The raw XML lives at the same dir with the xsl prefix stripped.
      const xmlUrl = filing.filing_url.replace(/\/xsl[^/]*\//, '/');
      const xml = await edgarFetchText(xmlUrl, 'application/xml');
      const parsed = parseForm4Xml(xml, query.ticker, filing);
      for (const trade of parsed) {
        if (query.name) {
          if (!trade.full_name.toLowerCase().includes(query.name.toLowerCase())) continue;
        }
        trades.push(trade);
        if (trades.length >= limit) break;
      }
    } catch {
      // Skip filings whose primary doc isn't parseable Form 4 XML
      continue;
    }
  }

  return { trades, source };
}
