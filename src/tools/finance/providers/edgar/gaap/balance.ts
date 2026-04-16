/**
 * Balance sheet GAAP concept mapping.
 *
 * All balance sheet concepts are `instant` — they snapshot a single date.
 */

import type { ConceptMap } from './types.js';

export const BALANCE_SHEET: ConceptMap = [
  // --- Current assets --------------------------------------------------
  {
    field: 'cash_and_equivalents',
    taxonomy: 'us-gaap',
    tags: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
      'Cash',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'short_term_investments',
    taxonomy: 'us-gaap',
    tags: [
      'ShortTermInvestments',
      'MarketableSecuritiesCurrent',
      'AvailableForSaleSecuritiesCurrent',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'cash_and_short_term_investments',
    taxonomy: 'us-gaap',
    tags: ['CashCashEquivalentsAndShortTermInvestments'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'accounts_receivable',
    taxonomy: 'us-gaap',
    tags: [
      'AccountsReceivableNetCurrent',
      'ReceivablesNetCurrent',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'inventory',
    taxonomy: 'us-gaap',
    tags: ['InventoryNet'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'prepaid_expenses',
    taxonomy: 'us-gaap',
    tags: [
      'PrepaidExpenseCurrent',
      'PrepaidExpenseAndOtherAssetsCurrent',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'other_current_assets',
    taxonomy: 'us-gaap',
    tags: ['OtherAssetsCurrent'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'current_assets',
    taxonomy: 'us-gaap',
    tags: ['AssetsCurrent'],
    periodType: 'instant',
    unit: 'USD',
  },

  // --- Non-current assets ----------------------------------------------
  {
    field: 'property_plant_and_equipment',
    taxonomy: 'us-gaap',
    tags: [
      'PropertyPlantAndEquipmentNet',
      'PropertyPlantAndEquipmentAndFinanceLeaseRightOfUseAssetAfterAccumulatedDepreciationAndAmortization',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'goodwill',
    taxonomy: 'us-gaap',
    tags: ['Goodwill'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'intangible_assets',
    taxonomy: 'us-gaap',
    tags: [
      'IntangibleAssetsNetExcludingGoodwill',
      'FiniteLivedIntangibleAssetsNet',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'goodwill_and_intangible_assets',
    taxonomy: 'us-gaap',
    tags: ['IntangibleAssetsNetIncludingGoodwill'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'long_term_investments',
    taxonomy: 'us-gaap',
    tags: [
      'LongTermInvestments',
      'MarketableSecuritiesNoncurrent',
      'AvailableForSaleSecuritiesNoncurrent',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'other_non_current_assets',
    taxonomy: 'us-gaap',
    tags: ['OtherAssetsNoncurrent'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'non_current_assets',
    taxonomy: 'us-gaap',
    tags: ['AssetsNoncurrent'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'total_assets',
    taxonomy: 'us-gaap',
    tags: ['Assets'],
    periodType: 'instant',
    unit: 'USD',
  },

  // --- Current liabilities --------------------------------------------
  {
    field: 'accounts_payable',
    taxonomy: 'us-gaap',
    tags: [
      'AccountsPayableCurrent',
      'AccountsPayableTradeCurrent',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'deferred_revenue',
    taxonomy: 'us-gaap',
    tags: [
      'ContractWithCustomerLiabilityCurrent', // ASC 606
      'DeferredRevenueCurrent',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'short_term_debt',
    taxonomy: 'us-gaap',
    tags: [
      'LongTermDebtCurrent',
      'DebtCurrent',
      'ShortTermBorrowings',
      'CommercialPaper',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'other_current_liabilities',
    taxonomy: 'us-gaap',
    tags: ['OtherLiabilitiesCurrent'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'current_liabilities',
    taxonomy: 'us-gaap',
    tags: ['LiabilitiesCurrent'],
    periodType: 'instant',
    unit: 'USD',
  },

  // --- Non-current liabilities ----------------------------------------
  {
    field: 'long_term_debt',
    taxonomy: 'us-gaap',
    tags: [
      'LongTermDebtNoncurrent',
      'LongTermDebt',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'deferred_revenue_non_current',
    taxonomy: 'us-gaap',
    tags: [
      'ContractWithCustomerLiabilityNoncurrent',
      'DeferredRevenueNoncurrent',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'deferred_tax_liabilities',
    taxonomy: 'us-gaap',
    tags: [
      'DeferredTaxLiabilitiesNoncurrent',
      'DeferredIncomeTaxLiabilitiesNet',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'other_non_current_liabilities',
    taxonomy: 'us-gaap',
    tags: ['OtherLiabilitiesNoncurrent'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'non_current_liabilities',
    taxonomy: 'us-gaap',
    tags: ['LiabilitiesNoncurrent'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'total_liabilities',
    taxonomy: 'us-gaap',
    tags: ['Liabilities'],
    periodType: 'instant',
    unit: 'USD',
  },

  // --- Total debt aggregation -----------------------------------------
  {
    field: 'total_debt',
    taxonomy: 'us-gaap',
    tags: ['LongTermDebt'], // resolver also computes from short+long if missing
    periodType: 'instant',
    unit: 'USD',
  },

  // --- Equity ---------------------------------------------------------
  {
    field: 'common_stock',
    taxonomy: 'us-gaap',
    tags: [
      'CommonStockValue',
      'CommonStocksIncludingAdditionalPaidInCapital',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'retained_earnings',
    taxonomy: 'us-gaap',
    tags: ['RetainedEarningsAccumulatedDeficit'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'accumulated_other_comprehensive_income',
    taxonomy: 'us-gaap',
    tags: ['AccumulatedOtherComprehensiveIncomeLossNetOfTax'],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'treasury_stock',
    taxonomy: 'us-gaap',
    tags: [
      'TreasuryStockValue',
      'TreasuryStockCommonValue',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'shareholders_equity',
    taxonomy: 'us-gaap',
    tags: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'minority_interest',
    taxonomy: 'us-gaap',
    tags: [
      'MinorityInterest',
    ],
    periodType: 'instant',
    unit: 'USD',
  },
  {
    field: 'total_liabilities_and_equity',
    taxonomy: 'us-gaap',
    tags: ['LiabilitiesAndStockholdersEquity'],
    periodType: 'instant',
    unit: 'USD',
  },

  // --- Shares outstanding ---------------------------------------------
  {
    field: 'shares_outstanding',
    taxonomy: 'dei',
    tags: ['EntityCommonStockSharesOutstanding'],
    periodType: 'instant',
    unit: 'shares',
  },
];
