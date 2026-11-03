// optional minus, optional currency symbol, optional minus, digits with commas, optional decimals
const MONEY_PATTERN = /^(-)?([£$€])?(-)?(\d[\d,]*)(?:\.(\d+))?$/;

// commas must be thousands separators, e.g. 1,234 or 12,345,678
const THOUSANDS_PATTERN = /^\d{1,3}(,\d{3})+$/;

/**
 * Turns money text from an export into whole pence.
 * Returns null if the text isn't a clear, valid amount.
 */
export function parseMoney(text: string): number | null {
  let value = text.trim();
  if (value === '') return null;

  // accounts often show negatives in brackets, e.g. (£20.00)
  let negative = false;
  if (value.startsWith('(') && value.endsWith(')')) {
    negative = true;
    value = value.slice(1, -1).trim();
  }

  const match = MONEY_PATTERN.exec(value);
  if (!match) return null;

  const [, minusBefore, , minusAfter, wholeText, fractionText = ''] = match;
  if (wholeText === undefined) return null;

  // allow one minus sign at most, and never together with brackets
  const hasMinus = Boolean(minusBefore) || Boolean(minusAfter);
  if (minusBefore && minusAfter) return null;
  if (hasMinus && negative) return null;
  if (hasMinus) negative = true;

  if (wholeText.includes(',') && !THOUSANDS_PATTERN.test(wholeText)) return null;
  const pounds = Number(wholeText.replaceAll(',', ''));

  // take pence from the first two decimal digits, round using the third
  const decimals = fractionText.padEnd(3, '0');
  let pence = pounds * 100 + Number(decimals.slice(0, 2));
  if (Number(decimals.charAt(2)) >= 5) pence += 1;

  // refuse amounts too large to store exactly
  if (!Number.isSafeInteger(pence)) return null;

  // avoid returning -0 for amounts like "-£0.00"
  return negative && pence !== 0 ? -pence : pence;
}
