import { parsePhoneNumberFromString } from 'libphonenumber-js';

/** Dial code → ISO 3166-1 alpha-2 for libphonenumber defaultCountry. */
export const PHONE_DIAL_TO_COUNTRY = {
  '+91': 'IN',
  '+1': 'US',
  '+44': 'GB',
  '+65': 'SG',
  '+971': 'AE',
  '+61': 'AU',
};

/**
 * Optional phone: blank is OK. Non-blank must be valid for the dial-code country.
 * @param {string|null|undefined} phone
 * @param {string|null|undefined} phoneCountryCode e.g. '+91'
 * @returns {{ ok: true, e164?: string|null } | { ok: false, error: string }}
 */
export function validateOptionalPhone(phone, phoneCountryCode) {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return { ok: true, e164: null };

  const dial = String(phoneCountryCode || '').trim() || '+91';
  const defaultCountry = PHONE_DIAL_TO_COUNTRY[dial] || 'IN';

  // Prefer national number + country; also accept E.164 already including dial.
  let parsed = parsePhoneNumberFromString(trimmed, defaultCountry);
  if (!parsed?.isValid() && trimmed.startsWith('+')) {
    parsed = parsePhoneNumberFromString(trimmed);
  }
  if (!parsed?.isValid()) {
    return {
      ok: false,
      error: 'Please enter a correct phone number for the selected country code, or leave it blank.',
    };
  }
  return { ok: true, e164: parsed.format('E.164') };
}
