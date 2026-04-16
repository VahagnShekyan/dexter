/**
 * Income statement GAAP concept mapping.
 *
 * Field names match the Financial Datasets income statement output so that
 * tools/formatters/downstream consumers don't need to change.
 *
 * Tag-order rationale:
 *   1. Most-specific / current ASC tags first (e.g. ASC 606 revenue concept)
 *   2. Then standard tags
 *   3. Then deprecated / pre-2018 tags
 *
 * "Full" mapping: covers the canonical Financial Datasets income statement
 * fields. Add new fields by appending here — the resolver reads this list
 * directly and downstream code picks them up automatically.
 */

import type { ConceptMap } from './types.js';

export const INCOME_STATEMENT: ConceptMap = [
  // --- Top line --------------------------------------------------------
  {
    field: 'revenue',
    taxonomy: 'us-gaap',
    tags: [
      'RevenueFromContractWithCustomerExcludingAssessedTax', // ASC 606, 2018+
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'Revenues',
      'SalesRevenueNet',
      'SalesRevenueGoodsNet',
      'SalesRevenueServicesNet',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'cost_of_revenue',
    taxonomy: 'us-gaap',
    tags: [
      'CostOfRevenue',
      'CostOfGoodsAndServicesSold',
      'CostOfGoodsSold',
      'CostOfServices',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'gross_profit',
    taxonomy: 'us-gaap',
    tags: ['GrossProfit'],
    periodType: 'duration',
    unit: 'USD',
  },

  // --- Operating expenses ---------------------------------------------
  {
    field: 'operating_expense',
    taxonomy: 'us-gaap',
    tags: [
      'OperatingExpenses',
      'CostsAndExpenses',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'research_and_development',
    taxonomy: 'us-gaap',
    tags: ['ResearchAndDevelopmentExpense'],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'selling_general_and_administrative_expenses',
    taxonomy: 'us-gaap',
    tags: [
      'SellingGeneralAndAdministrativeExpense',
      'SellingGeneralAndAdministrativeExpenses',
      'GeneralAndAdministrativeExpense',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'selling_expense',
    taxonomy: 'us-gaap',
    tags: ['SellingExpense', 'MarketingAndAdvertisingExpense'],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'general_and_administrative_expense',
    taxonomy: 'us-gaap',
    tags: ['GeneralAndAdministrativeExpense'],
    periodType: 'duration',
    unit: 'USD',
  },

  // --- Operating income / EBIT ----------------------------------------
  {
    field: 'operating_income',
    taxonomy: 'us-gaap',
    tags: [
      'OperatingIncomeLoss',
      'IncomeLossFromContinuingOperationsBeforeInterestExpenseInterestIncomeIncomeTaxesExtraordinaryItemsNoncontrollingInterestsNet',
    ],
    periodType: 'duration',
    unit: 'USD',
  },

  // --- Non-operating items --------------------------------------------
  {
    field: 'interest_expense',
    taxonomy: 'us-gaap',
    tags: [
      'InterestExpense',
      'InterestExpenseDebt',
      'InterestExpenseBorrowings',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'interest_income',
    taxonomy: 'us-gaap',
    tags: [
      'InterestIncomeOperating',
      'InvestmentIncomeInterest',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'other_income_expense',
    taxonomy: 'us-gaap',
    tags: [
      'OtherNonoperatingIncomeExpense',
      'NonoperatingIncomeExpense',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'income_before_tax',
    taxonomy: 'us-gaap',
    tags: [
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
      'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'income_tax_expense',
    taxonomy: 'us-gaap',
    tags: [
      'IncomeTaxExpenseBenefit',
      'CurrentIncomeTaxExpenseBenefit',
    ],
    periodType: 'duration',
    unit: 'USD',
  },

  // --- Bottom line ----------------------------------------------------
  {
    field: 'net_income',
    taxonomy: 'us-gaap',
    tags: [
      'NetIncomeLoss',
      'ProfitLoss',
      'NetIncomeLossAvailableToCommonStockholdersBasic',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'net_income_attributable_to_noncontrolling_interest',
    taxonomy: 'us-gaap',
    tags: [
      'NetIncomeLossAttributableToNoncontrollingInterest',
      'MinorityInterestInNetIncomeLossOfConsolidatedEntities',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'preferred_dividends',
    taxonomy: 'us-gaap',
    tags: [
      'PreferredStockDividendsAndOtherAdjustments',
      'PreferredStockDividends',
    ],
    periodType: 'duration',
    unit: 'USD',
  },

  // --- Per-share ------------------------------------------------------
  {
    field: 'earnings_per_share',
    taxonomy: 'us-gaap',
    tags: ['EarningsPerShareBasic'],
    periodType: 'duration',
    unit: 'USD/shares',
  },
  {
    field: 'earnings_per_share_diluted',
    taxonomy: 'us-gaap',
    tags: ['EarningsPerShareDiluted'],
    periodType: 'duration',
    unit: 'USD/shares',
  },
  {
    field: 'weighted_average_shares',
    taxonomy: 'us-gaap',
    tags: ['WeightedAverageNumberOfSharesOutstandingBasic'],
    periodType: 'duration',
    unit: 'shares',
  },
  {
    field: 'weighted_average_shares_diluted',
    taxonomy: 'us-gaap',
    tags: [
      'WeightedAverageNumberOfDilutedSharesOutstanding',
      'WeightedAverageNumberOfSharesOutstandingDilutedAdjustedForCommonStockEquivalents',
    ],
    periodType: 'duration',
    unit: 'shares',
  },
  {
    field: 'dividends_per_common_share',
    taxonomy: 'us-gaap',
    tags: [
      'CommonStockDividendsPerShareDeclared',
      'CommonStockDividendsPerShareCashPaid',
    ],
    periodType: 'duration',
    unit: 'USD/shares',
  },
];
