/** Allowed employer business entity types (registration + profile). */
export const BUSINESS_ENTITY_TYPES = [
  'Professional',
  'Partnership Firm',
  'LLP',
  'Private Limited',
  'Public Firm',
];

export function isValidBusinessEntityType(value) {
  return BUSINESS_ENTITY_TYPES.includes(String(value || '').trim());
}
