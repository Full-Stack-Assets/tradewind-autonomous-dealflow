import type { Buyer, SourceRecord } from '../packages/domain/src/types.ts';

export const syntheticPropertySource: SourceRecord = {
  sourceId: 'synthetic-ma-001',
  sourceType: 'synthetic_fixture',
  retrievedAt: '2026-08-11T15:55:00.000Z',
  synthetic: true,
  parcelId: 'SYN-MA-0001',
  address1: '101 Example Street',
  city: 'New Bedford',
  state: 'MA',
  postalCode: '02740',
  propertyType: 'single_family',
  assessedValueCents: 30_000_000,
  estimatedMortgageBalanceCents: 10_000_000,
  ownerName: 'Synthetic Seller',
  ownerMailingState: 'NH',
  vacancyIndicator: true,
  distressIndicator: true,
};

export const syntheticBuyers: Buyer[] = [
  {
    id: 'buyer-001',
    schemaVersion: '1',
    createdAt: '2026-08-11T16:00:00.000Z',
    displayName: 'Synthetic South Coast Buyer',
    buyBox: {
      states: ['MA'],
      propertyTypes: ['single_family'],
      strategies: ['wholesale', 'flip'],
      maxPurchaseCents: 27_500_000,
    },
    evidence: {
      proofOfFundsVerified: true,
      historicalClosings: 12,
      typicalClosingDays: 10,
    },
  },
  {
    id: 'buyer-002',
    schemaVersion: '1',
    createdAt: '2026-08-11T16:00:00.000Z',
    displayName: 'Synthetic Low-Cap Buyer',
    buyBox: {
      states: ['MA'],
      propertyTypes: ['single_family'],
      strategies: ['wholesale'],
      maxPurchaseCents: 20_000_000,
    },
    evidence: {
      proofOfFundsVerified: true,
      historicalClosings: 20,
      typicalClosingDays: 7,
    },
  },
  {
    id: 'buyer-003',
    schemaVersion: '1',
    createdAt: '2026-08-11T16:00:00.000Z',
    displayName: 'Synthetic Rhode Island Buyer',
    buyBox: {
      states: ['RI'],
      propertyTypes: ['single_family'],
      strategies: ['wholesale'],
      maxPurchaseCents: 35_000_000,
    },
    evidence: {
      proofOfFundsVerified: true,
      historicalClosings: 8,
      typicalClosingDays: 14,
    },
  },
];
