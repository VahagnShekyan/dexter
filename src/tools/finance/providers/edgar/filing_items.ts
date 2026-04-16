/**
 * Filing item extraction.
 *
 * Fetches a filing's primary HTML document from the SEC archives and
 * splits it into "items" — the canonical 10-K / 10-Q / 8-K sections.
 *
 * 10-K items: Item 1, 1A, 1B, 1C, 2..., 7, 7A, 8, 9, 9A, 9B, 10..15
 * 10-Q items: Part 1 Item 1..4, Part 2 Item 1..6
 * 8-K items: Item 1.01, 1.02, ..., 9.01
 *
 * Approach:
 *   1. Fetch HTML, strip tags to plain text (preserving line breaks)
 *   2. Find each item header via regex anchored to start of line
 *   3. Slice text between consecutive headers
 *
 * This won't be perfect on every filing — older or unusual filings may
 * confuse the heuristic. The composite router falls back to fdatasets
 * for items we can't extract.
 */

import { findFilingByAccession } from './submissions.js';
import { edgarFetchText } from './client.js';

// ---------------------------------------------------------------------------
// HTML → text
// ---------------------------------------------------------------------------

function htmlToText(html: string): string {
  return html
    // Drop scripts/styles/inline data
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    // Block-level tags become newlines
    .replace(/<\/(div|p|tr|h\d|li|br|hr|table|section)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // Strip remaining tags
    .replace(/<[^>]+>/g, ' ')
    // Decode common entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    // Collapse runs of whitespace per-line
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Item header detection
// ---------------------------------------------------------------------------

interface ItemHeader {
  /** Canonical name, e.g. "Item-1A" or "Part-1,Item-2". */
  name: string;
  /** Index in the source text where this header starts. */
  offset: number;
  /** Length of the matched header line. */
  length: number;
}

const TEN_K_PATTERN = /^\s*item\s+(\d+[a-c]?)\b[\.\:\s]*(.{0,200})$/gim;
const TEN_Q_PATTERN = /^\s*(part\s+(?:i{1,3}|iv|v|[12345]))\b[\.\s\:\-]*item\s+(\d+[a-c]?)\b[\.\s\:\-]*(.{0,200})$/gim;
const EIGHT_K_PATTERN = /^\s*item\s+(\d+\.\d+)\b[\.\s\:\-]*(.{0,200})$/gim;

function romanToInt(s: string): number {
  const m: Record<string, number> = { i: 1, ii: 2, iii: 3, iv: 4, v: 5 };
  return m[s.toLowerCase()] ?? parseInt(s, 10);
}

function findHeaders10K(text: string): ItemHeader[] {
  const out: ItemHeader[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(TEN_K_PATTERN)) {
    const num = match[1].toUpperCase();
    const name = `Item-${num}`;
    // First occurrence is the table-of-contents entry; second is the section.
    // Always take the LAST occurrence so the slice covers the actual section.
    seen.add(name);
    out.push({ name, offset: match.index ?? 0, length: match[0].length });
  }
  // Keep only the last occurrence of each name
  const lastByName = new Map<string, ItemHeader>();
  for (const h of out) lastByName.set(h.name, h);
  return [...lastByName.values()].sort((a, b) => a.offset - b.offset);
}

function findHeaders10Q(text: string): ItemHeader[] {
  const out: ItemHeader[] = [];
  for (const match of text.matchAll(TEN_Q_PATTERN)) {
    const partRaw = match[1].toLowerCase().replace(/^part\s+/, '');
    const partNum = romanToInt(partRaw);
    const itemNum = match[2].toUpperCase();
    const name = `Part-${partNum},Item-${itemNum}`;
    out.push({ name, offset: match.index ?? 0, length: match[0].length });
  }
  const lastByName = new Map<string, ItemHeader>();
  for (const h of out) lastByName.set(h.name, h);
  return [...lastByName.values()].sort((a, b) => a.offset - b.offset);
}

function findHeaders8K(text: string): ItemHeader[] {
  const out: ItemHeader[] = [];
  for (const match of text.matchAll(EIGHT_K_PATTERN)) {
    const name = `Item-${match[1]}`;
    out.push({ name, offset: match.index ?? 0, length: match[0].length });
  }
  const lastByName = new Map<string, ItemHeader>();
  for (const h of out) lastByName.set(h.name, h);
  return [...lastByName.values()].sort((a, b) => a.offset - b.offset);
}

function sliceItems(text: string, headers: ItemHeader[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const start = headers[i].offset + headers[i].length;
    const end = i + 1 < headers.length ? headers[i + 1].offset : text.length;
    out[headers[i].name] = text.slice(start, end).trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public extractor
// ---------------------------------------------------------------------------

export interface ExtractedFiling {
  ticker: string;
  filing_type: '10-K' | '10-Q' | '8-K';
  accession_number: string;
  filing_url: string;
  items: Record<string, string>;
}

export async function extractFilingItems(
  ticker: string,
  filingType: '10-K' | '10-Q' | '8-K',
  accession: string,
  wantedItems?: string[],
): Promise<ExtractedFiling> {
  const filing = await findFilingByAccession(ticker, accession);
  if (!filing) {
    throw new Error(`[EDGAR] no filing matches ticker=${ticker} accession=${accession}`);
  }
  if (filing.filing_type !== filingType) {
    throw new Error(
      `[EDGAR] filing ${accession} is ${filing.filing_type}, not ${filingType}`,
    );
  }

  const html = await edgarFetchText(filing.filing_url, 'text/html');
  const text = htmlToText(html);

  const headers =
    filingType === '10-K'
      ? findHeaders10K(text)
      : filingType === '10-Q'
        ? findHeaders10Q(text)
        : findHeaders8K(text);

  let items = sliceItems(text, headers);

  if (wantedItems && wantedItems.length > 0) {
    const wanted = new Set(wantedItems);
    items = Object.fromEntries(Object.entries(items).filter(([k]) => wanted.has(k)));
  }

  return {
    ticker: ticker.toUpperCase(),
    filing_type: filingType,
    accession_number: accession,
    filing_url: filing.filing_url,
    items,
  };
}

// ---------------------------------------------------------------------------
// Static item type catalog
// ---------------------------------------------------------------------------

import type { FilingItemTypes } from '../types.js';

/**
 * Canonical 10-K / 10-Q items per Form 10-K and 10-Q regulations.
 * Falls back to a static list to avoid depending on Financial Datasets.
 */
export const STATIC_FILING_ITEM_TYPES: FilingItemTypes = {
  '10-K': [
    { name: 'Item-1', title: 'Business', description: "Overview of the company's operations." },
    { name: 'Item-1A', title: 'Risk Factors', description: 'Material risks affecting the company.' },
    { name: 'Item-1B', title: 'Unresolved Staff Comments', description: 'Outstanding SEC staff comments.' },
    { name: 'Item-1C', title: 'Cybersecurity', description: 'Cybersecurity risk management and governance.' },
    { name: 'Item-2', title: 'Properties', description: 'Material properties owned or leased.' },
    { name: 'Item-3', title: 'Legal Proceedings', description: 'Material litigation.' },
    { name: 'Item-4', title: 'Mine Safety Disclosures', description: 'Mine Safety and Health Administration disclosures.' },
    { name: 'Item-5', title: 'Market for Registrant\u2019s Common Equity', description: 'Stock-related disclosures and repurchases.' },
    { name: 'Item-6', title: '[Reserved]', description: 'Formerly Selected Financial Data; reserved as of 2021.' },
    { name: 'Item-7', title: "Management's Discussion and Analysis", description: 'MD&A of financial condition and results.' },
    { name: 'Item-7A', title: 'Quantitative and Qualitative Disclosures About Market Risk', description: 'Market risk exposure disclosures.' },
    { name: 'Item-8', title: 'Financial Statements and Supplementary Data', description: 'Audited financial statements.' },
    { name: 'Item-9', title: 'Changes in and Disagreements with Accountants', description: 'Auditor changes.' },
    { name: 'Item-9A', title: 'Controls and Procedures', description: 'Disclosure controls and ICFR effectiveness.' },
    { name: 'Item-9B', title: 'Other Information', description: 'Material info not previously disclosed in 8-Ks.' },
    { name: 'Item-9C', title: 'Disclosure Regarding Foreign Jurisdictions', description: 'HFCAA-related disclosures.' },
    { name: 'Item-10', title: 'Directors, Executive Officers and Corporate Governance', description: 'Governance disclosures.' },
    { name: 'Item-11', title: 'Executive Compensation', description: 'Compensation discussion and tables.' },
    { name: 'Item-12', title: 'Security Ownership', description: 'Security ownership of certain beneficial owners and management.' },
    { name: 'Item-13', title: 'Certain Relationships and Related Transactions', description: 'Related-party transactions.' },
    { name: 'Item-14', title: 'Principal Accountant Fees and Services', description: 'Auditor fees.' },
    { name: 'Item-15', title: 'Exhibits and Financial Statement Schedules', description: 'Exhibit list and supporting schedules.' },
  ],
  '10-Q': [
    { name: 'Part-1,Item-1', title: 'Financial Statements', description: 'Unaudited financial statements.' },
    { name: 'Part-1,Item-2', title: "Management's Discussion and Analysis", description: 'Quarterly MD&A.' },
    { name: 'Part-1,Item-3', title: 'Quantitative and Qualitative Disclosures About Market Risk', description: 'Quarterly market risk update.' },
    { name: 'Part-1,Item-4', title: 'Controls and Procedures', description: 'Disclosure controls update.' },
    { name: 'Part-2,Item-1', title: 'Legal Proceedings', description: 'Legal updates since last 10-K.' },
    { name: 'Part-2,Item-1A', title: 'Risk Factors', description: 'Material changes from 10-K risk factors.' },
    { name: 'Part-2,Item-2', title: 'Unregistered Sales of Equity Securities', description: 'Equity issuances and repurchases.' },
    { name: 'Part-2,Item-3', title: 'Defaults Upon Senior Securities', description: 'Securities defaults.' },
    { name: 'Part-2,Item-4', title: 'Mine Safety Disclosures', description: 'MSHA disclosures.' },
    { name: 'Part-2,Item-5', title: 'Other Information', description: 'Material info not previously disclosed.' },
    { name: 'Part-2,Item-6', title: 'Exhibits', description: 'Quarterly exhibit list.' },
  ],
};
