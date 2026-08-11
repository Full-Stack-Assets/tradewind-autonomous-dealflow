import type { LeadScore, Property } from './types.ts';

export function scoreLead(property: Property): LeadScore {
  const assessed = property.assessedValueCents;
  const mortgage = property.estimatedMortgageBalanceCents;
  const equityRatio = assessed <= 0 || mortgage === undefined
    ? undefined
    : Math.max(0, (assessed - mortgage) / assessed);

  const equityProxy = equityRatio === undefined ? 0 : equityRatio >= 0.5 ? 35 : equityRatio >= 0.3 ? 20 : 0;
  const absenteeOwner = property.ownerMailingState !== property.state ? 20 : 0;
  const vacancy = property.vacancyIndicator === true;
  const distress = property.distressIndicator === true;
  const vacancyDistress = vacancy && distress ? 30 : vacancy || distress ? 15 : 0;
  const targetState = property.state === 'MA' || property.state === 'RI' ? 15 : 0;
  const total = equityProxy + absenteeOwner + vacancyDistress + targetState;

  return {
    total,
    qualified: total >= 60,
    components: { equityProxy, absenteeOwner, vacancyDistress, targetState },
  };
}
