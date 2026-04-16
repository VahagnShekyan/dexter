import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { getProvider } from './providers/index.js';
import { formatToolResult } from '../types.js';

export const STOCK_PRICE_DESCRIPTION = `
Fetches current stock price snapshots for equities, including open, high, low, close prices, volume, and market cap.
`.trim();

const StockPriceInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol to fetch current price for. For example, 'AAPL' for Apple."),
});

export const getStockPrice = new DynamicStructuredTool({
  name: 'get_stock_price',
  description:
    'Fetches the current stock price snapshot for an equity ticker, including open, high, low, close prices, volume, and market cap.',
  schema: StockPriceInputSchema,
  func: async (input) => {
    const { data, sources } = await getProvider().getStockPriceSnapshot({ ticker: input.ticker });
    return formatToolResult(data, sources);
  },
});

const StockPricesInputSchema = z.object({
  ticker: z
    .string()
    .describe("The stock ticker symbol to fetch historical prices for. For example, 'AAPL' for Apple."),
  interval: z
    .enum(['day', 'week', 'month', 'year'])
    .default('day')
    .describe("The time interval for price data. Defaults to 'day'."),
  start_date: z.string().describe('Start date in YYYY-MM-DD format. Required.'),
  end_date: z.string().describe('End date in YYYY-MM-DD format. Required.'),
});

export const getStockPrices = new DynamicStructuredTool({
  name: 'get_stock_prices',
  description:
    'Retrieves historical price data for a stock over a specified date range, including open, high, low, close prices and volume.',
  schema: StockPricesInputSchema,
  func: async (input) => {
    const { data, sources } = await getProvider().getStockPrices(input);
    return formatToolResult(data, sources);
  },
});

export const getStockTickers = new DynamicStructuredTool({
  name: 'get_available_stock_tickers',
  description: 'Retrieves the list of available stock tickers that can be used with the stock price tools.',
  schema: z.object({}),
  func: async () => {
    const { data, sources } = await getProvider().getStockTickers();
    return formatToolResult(data, sources);
  },
});
