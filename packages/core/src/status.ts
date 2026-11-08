import { readYesNo } from './clean';

// What a paid-status cell says, whatever words were used: "paid 30/1", "Paid (cleared)",
// "unpaid - texted", "Overdue (reminder sent)". Only a suggestion: the user confirms what
// each word means before any figure uses it (ADR 0006).
export type StatusReading = 'paid' | 'unpaid' | 'part paid' | 'method' | null;

// checked in this order, so "not paid" and "part paid" are never read as "paid"
const PART = /\b(part[ -]?paid|part[ -]?payment|deposit (paid|received)|partial)\b/i;
const UNPAID =
  /\b(unpaid|not paid|not yet paid|outstanding|overdue|owed|owes|owing|due|past due|pending|awaiting|chased|chasing|to chase|late)\b/i;
const PAID = /\b(paid|settled|cleared|received|in full|done)\b/i;
// how it was paid; says it was paid, but a blank may mean either
const METHOD = /\b(bank|cash|card|bacs|cheque|transfer|faster payment|in hand)\b/i;

export function readStatus(text: string | null): StatusReading {
  if (!text) return null;
  const cell = text.trim();
  if (cell === '') return null;
  // ticks and crosses, as people mark a list; a plain x is left alone, as some use it for done
  if (/^[✓✔☑✅]/u.test(cell)) return 'paid';
  if (/^[✗✘❌]/u.test(cell)) return 'unpaid';
  const yesNo = readYesNo(cell);
  if (yesNo.origin !== 'unknown') return yesNo.value ? 'paid' : 'unpaid';
  if (PART.test(cell)) return 'part paid';
  if (UNPAID.test(cell)) return 'unpaid';
  if (PAID.test(cell)) return 'paid';
  if (METHOD.test(cell)) return 'method';
  return null;
}
