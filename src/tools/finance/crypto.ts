import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getProvider } from './providers/index.js';
import { formatToolResult } from '../types.js';

const CryptoPriceSnapshotInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The crypto ticker symbol to fetch the price snapshot for. For example, 'BTC-USD' for Bitcoin."
    ),
});

export const getCryptoPriceSnapshot = new DynamicStructuredTool({
  name: 'get_crypto_price_snapshot',
  description: `Fetches the most recent price snapshot for a specific cryptocurrency, including the latest price, trading volume, and other open, high, low, and close price data. Ticker format: use 'CRYPTO-USD' for USD prices (e.g., 'BTC-USD') or 'CRYPTO-CRYPTO' for crypto-to-crypto prices (e.g., 'BTC-ETH' for Bitcoin priced in Ethereum).`,
  schema: CryptoPriceSnapshotInputSchema,
  func: async (input) => {
    const { data, sources } = await getProvider().getCryptoPriceSnapshot({ ticker: input.ticker });
    return formatToolResult(data, sources);
  },
});

const CryptoPricesInputSchema = z.object({
  ticker: z
    .string()
    .describe(
      "The crypto ticker symbol to fetch aggregated prices for. For example, 'BTC-USD' for Bitcoin."
    ),
  interval: z
    .enum(['minute', 'day', 'week', 'month', 'year'])
    .default('day')
    .describe("The time interval for price data. Defaults to 'day'."),
  interval_multiplier: z
    .number()
    .default(1)
    .describe('Multiplier for the interval. Defaults to 1.'),
  start_date: z.string().describe('Start date in YYYY-MM-DD format. Required.'),
  end_date: z.string().describe('End date in YYYY-MM-DD format. Required.'),
});

export const getCryptoPrices = new DynamicStructuredTool({
  name: 'get_crypto_prices',
  description: `Retrieves historical price data for a cryptocurrency over a specified date range, including open, high, low, close prices, and volume. Ticker format: use 'CRYPTO-USD' for USD prices (e.g., 'BTC-USD') or 'CRYPTO-CRYPTO' for crypto-to-crypto prices (e.g., 'BTC-ETH' for Bitcoin priced in Ethereum).`,
  schema: CryptoPricesInputSchema,
  func: async (input) => {
    const { data, sources } = await getProvider().getCryptoPrices(input);
    return formatToolResult(data, sources);
  },
});

export const getCryptoTickers = new DynamicStructuredTool({
  name: 'get_available_crypto_tickers',
  description: `Retrieves the list of available cryptocurrency tickers that can be used with the crypto price tools.`,
  schema: z.object({}),
  func: async () => {
    const { data, sources } = await getProvider().getCryptoTickers();
    return formatToolResult(data, sources);
  },
});
