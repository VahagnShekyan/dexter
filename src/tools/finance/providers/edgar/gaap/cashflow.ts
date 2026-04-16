/**
 * Cash flow statement GAAP concept mapping.
 *
 * All cash flow concepts are `duration` — they cover a period.
 *
 * CapEx note: XBRL `PaymentsToAcquirePropertyPlantAndEquipment` is reported
 * as a positive number (cash outflow shown as a positive payment amount).
 * Downstream code expects CapEx as a positive value too, so we keep
 * `sign: 'asReported'`. The `free_cash_flow` derivation subtracts CapEx.
 */

import type { ConceptMap } from './types.js';

export const CASH_FLOW: ConceptMap = [
  // --- Operating activities -------------------------------------------
  {
    field: 'net_cash_flow_from_operations',
    taxonomy: 'us-gaap',
    tags: [
      'NetCashProvidedByUsedInOperatingActivities',
      'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'depreciation_and_amortization',
    taxonomy: 'us-gaap',
    tags: [
      'DepreciationDepletionAndAmortization',
      'DepreciationAndAmortization',
      'Depreciation',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'share_based_compensation',
    taxonomy: 'us-gaap',
    tags: [
      'ShareBasedCompensation',
      'StockBasedCompensation',
    ],
    periodType: 'duration',
    unit: 'USD',
  },

  // --- Investing activities -------------------------------------------
  {
    field: 'capital_expenditure',
    taxonomy: 'us-gaap',
    tags: [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PaymentsToAcquireProductiveAssets',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'business_acquisitions',
    taxonomy: 'us-gaap',
    tags: [
      'PaymentsToAcquireBusinessesNetOfCashAcquired',
      'PaymentsToAcquireBusinessesGross',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'investment_purchases',
    taxonomy: 'us-gaap',
    tags: [
      'PaymentsToAcquireInvestments',
      'PaymentsToAcquireMarketableSecurities',
      'PaymentsToAcquireAvailableForSaleSecurities',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'investment_sales_and_maturities',
    taxonomy: 'us-gaap',
    tags: [
      'ProceedsFromSaleOfInvestments',
      'ProceedsFromMaturitiesPrepaymentsAndCallsOfAvailableForSaleSecurities',
      'ProceedsFromSaleAndMaturityOfMarketableSecurities',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'net_cash_flow_from_investing',
    taxonomy: 'us-gaap',
    tags: [
      'NetCashProvidedByUsedInInvestingActivities',
      'NetCashProvidedByUsedInInvestingActivitiesContinuingOperations',
    ],
    periodType: 'duration',
    unit: 'USD',
  },

  // --- Financing activities -------------------------------------------
  {
    field: 'debt_issuance',
    taxonomy: 'us-gaap',
    tags: [
      'ProceedsFromIssuanceOfLongTermDebt',
      'ProceedsFromIssuanceOfDebt',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'debt_repayment',
    taxonomy: 'us-gaap',
    tags: [
      'RepaymentsOfLongTermDebt',
      'RepaymentsOfDebt',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'dividends_paid',
    taxonomy: 'us-gaap',
    tags: [
      'PaymentsOfDividends',
      'PaymentsOfDividendsCommonStock',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'share_repurchases',
    taxonomy: 'us-gaap',
    tags: [
      'PaymentsForRepurchaseOfCommonStock',
      'PaymentsForRepurchaseOfEquity',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'share_issuance',
    taxonomy: 'us-gaap',
    tags: [
      'ProceedsFromIssuanceOfCommonStock',
      'ProceedsFromStockOptionsExercised',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'net_cash_flow_from_financing',
    taxonomy: 'us-gaap',
    tags: [
      'NetCashProvidedByUsedInFinancingActivities',
      'NetCashProvidedByUsedInFinancingActivitiesContinuingOperations',
    ],
    periodType: 'duration',
    unit: 'USD',
  },

  // --- Reconciliation -------------------------------------------------
  {
    field: 'effect_of_exchange_rate_changes',
    taxonomy: 'us-gaap',
    tags: [
      'EffectOfExchangeRateOnCashAndCashEquivalents',
      'EffectOfExchangeRateOnCashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
  {
    field: 'net_change_in_cash',
    taxonomy: 'us-gaap',
    tags: [
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseIncludingExchangeRateEffect',
      'CashAndCashEquivalentsPeriodIncreaseDecrease',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalentsPeriodIncreaseDecreaseExcludingExchangeRateEffect',
    ],
    periodType: 'duration',
    unit: 'USD',
  },
];
