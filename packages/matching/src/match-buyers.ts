import type { Buyer, Match, NegotiatedDeal, Property } from '../../domain/src/types.ts';

function isEligible(property: Property, deal: NegotiatedDeal, buyer: Buyer): boolean {
  return buyer.buyBox.states.includes(property.state)
    && buyer.buyBox.propertyTypes.includes(property.propertyType)
    && buyer.buyBox.strategies.includes(deal.strategy)
    && buyer.buyBox.maxPurchaseCents >= deal.assignmentPriceCents;
}

function scoreBuyer(buyer: Buyer): number {
  const proofOfFunds = buyer.evidence.proofOfFundsVerified ? 20 : 0;
  const closings = Math.min(20, Math.max(0, buyer.evidence.historicalClosings));
  const speed = buyer.evidence.typicalClosingDays <= 14 ? 10 : buyer.evidence.typicalClosingDays <= 21 ? 5 : 0;
  return 50 + proofOfFunds + closings + speed;
}

export function matchBuyers(property: Property, deal: NegotiatedDeal, buyers: Buyer[]): Match[] {
  return buyers
    .filter((buyer) => isEligible(property, deal, buyer))
    .map((buyer) => ({
      buyerId: buyer.id,
      fitScore: scoreBuyer(buyer),
      reasons: [
        'state-compatible',
        'property-type-compatible',
        'strategy-compatible',
        'price-compatible',
      ],
    }))
    .sort((a, b) => b.fitScore - a.fitScore || a.buyerId.localeCompare(b.buyerId));
}
