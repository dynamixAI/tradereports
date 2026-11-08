import { derived, stated, unknown, type Address, type Known, type Phone } from './model';

// UK postcode: outward code (area + district), a space, inward code (sector + unit)
const POSTCODE = /^([A-Z]{1,2}\d[A-Z\d]?) ?(\d[A-Z]{2})$/;

// names people type for the UK; only these are mapped, anything else stays as typed
const UK_NAMES = new Set(['uk', 'u.k.', 'united kingdom', 'gb', 'great britain', 'britain']);

// "wn71ef" -> "WN7 1EF"; a value that isn't a UK postcode is left unknown, not guessed
export function cleanPostcode(text: string | null): Known<string> {
  if (!text) return unknown('no postcode');
  const squashed = text.toUpperCase().replace(/\s+/g, '');
  const match = POSTCODE.exec(squashed);
  if (!match) return unknown(`"${text}" is not a UK postcode`);
  const tidy = `${match[1]} ${match[2]}`;
  return tidy === text ? stated(tidy) : derived(tidy, `tidied from "${text}"`);
}

export function cleanCountry(text: string | null): Known<string> {
  if (!text) return unknown('no country');
  if (text === 'United Kingdom') return stated(text);
  if (UK_NAMES.has(text.trim().toLowerCase())) {
    return derived('United Kingdom', `"${text}" read as United Kingdom`);
  }
  return stated(text);
}

export function buildAddress(parts: {
  street: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
  country: string | null;
}): Address | null {
  if (Object.values(parts).every((part) => part === null)) return null;
  return {
    street: parts.street,
    city: parts.city,
    region: parts.region,
    postcodeAsTyped: parts.postcode,
    postcode: cleanPostcode(parts.postcode),
    countryAsTyped: parts.country,
    country: cleanCountry(parts.country),
  };
}

// One cell may hold several numbers. Returns the phones it could read and the
// pieces it couldn't, so the caller can report them.
export function readPhones(text: string | null): { phones: Phone[]; rejected: string[] } {
  const phones: Phone[] = [];
  const rejected: string[] = [];
  if (!text) return { phones, rejected };
  for (const piece of text.split(/[,;/]/)) {
    const trimmed = piece.trim();
    if (trimmed === '') continue;
    // keep digits, and turn +44 into a leading 0
    const digits = trimmed.replace(/^\+44\s*(\(0\))?/, '0').replace(/[\s().-]/g, '');
    if (/^0\d{9,10}$/.test(digits)) {
      phones.push({ number: digits, kind: digits.startsWith('07') ? 'mobile' : 'landline' });
    } else {
      rejected.push(trimmed);
    }
  }
  return { phones, rejected };
}

// One cell may hold several addresses: "a@x.com, b@x.com"
export function readEmails(text: string | null): { emails: string[]; rejected: string[] } {
  const emails: string[] = [];
  const rejected: string[] = [];
  if (!text) return { emails, rejected };
  for (const piece of text.split(/[,;\s]+/)) {
    if (piece === '') continue;
    if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(piece)) emails.push(piece.toLowerCase());
    else rejected.push(piece);
  }
  return { emails, rejected };
}

// Yes/no words seen in real exports: Jobber "true"/"false", Tradify "TRUE"/"FALSE"/"Yes"/"No"
export function readYesNo(text: string | null): Known<boolean> {
  if (!text) return unknown('empty');
  const word = text.trim().toLowerCase();
  if (word === 'true' || word === 'yes') return stated(true);
  if (word === 'false' || word === 'no') return stated(false);
  return unknown(`"${text}" is not yes or no`);
}

// "02/11/2026" -> "2026-11-02". UK accounts write the day first.
export function readUkDate(text: string | null): string | null {
  if (!text) return null;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  return `${match[3]}-${match[2]}-${match[1]}`;
}
