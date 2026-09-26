import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { IP_COUNTRY_PHONE_DIALS } from '@/lib/ipRegions';

/** Dial code → ISO 3166-1 alpha-2 for libphonenumber defaultCountry. */
export const PHONE_DIAL_TO_COUNTRY = Object.fromEntries(
  IP_COUNTRY_PHONE_DIALS.map((row) => [row.dial, row.iso2]),
);

/** Phone dial dropdown — same countries as Country / Region catalog (+ dial). */
export const PHONE_DIAL_OPTIONS = IP_COUNTRY_PHONE_DIALS.map((row) => ({
  value: row.dial,
  label: `${row.country} (${row.dial})`,
}));

/** Legacy dials that may still be stored from the old phone dropdown. */
const LEGACY_PHONE_DIAL_TO_COUNTRY = {
  '+1': 'US',
  '+44': 'GB',
  '+65': 'SG',
  '+971': 'AE',
  '+61': 'AU',
};

function resolveDefaultCountry(dial) {
  return PHONE_DIAL_TO_COUNTRY[dial] || LEGACY_PHONE_DIAL_TO_COUNTRY[dial] || 'IN';
}

/**
 * Options for a dial `<select>`, ensuring a stored legacy dial still appears if present.
 * @param {string|null|undefined} currentDial
 */
export function phoneDialOptionsFor(currentDial) {
  const dial = String(currentDial || '').trim();
  if (!dial || PHONE_DIAL_OPTIONS.some((o) => o.value === dial)) {
    return PHONE_DIAL_OPTIONS;
  }
  return [{ value: dial, label: `Other (${dial})` }, ...PHONE_DIAL_OPTIONS];
}

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
  const defaultCountry = resolveDefaultCountry(dial);

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

/** Required phone. */
export function validateRequiredPhone(phone, phoneCountryCode) {
  if (!String(phone || '').trim()) {
    return { ok: false, error: 'Mobile phone is required' };
  }
  const check = validateOptionalPhone(phone, phoneCountryCode);
  if (!check.ok) {
    return {
      ok: false,
      error: 'Please enter a correct phone number for the selected country code.',
    };
  }
  return check;
}
