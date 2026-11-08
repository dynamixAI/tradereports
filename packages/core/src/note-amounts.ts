import { pounds } from './invoice-checks';
import { parseMoney } from './money';

// Amounts written in a note (ADR 0007): "£1,000 paid towards £2,160", "balance £400 due",
// "50% deposit". Only read for invoices the user said are part paid, and only proposed;
// nothing is used until the user accepts it.

export interface NoteAmount {
  paidPence: number;
  duePence: number;
  // the note it was read from, and why
  note: string;
  evidence: string[];
}

const PAID = /^(paid|pd|received|recvd|rec'd|rcvd|deposit|down|upfront|up-front|cleared)$/i;
const DUE = /^(outstanding|due|balance|bal|remaining|left|owes|owed|owing|still|unpaid)$/i;
// how many words either side of an amount a keyword may be
const REACH = 3;

interface Token {
  text: string;
  // pence, or a share of the total for "50%"
  pence: number | null;
  share: number | null;
}

// Split a note into words, reading "£1,000", "1000", "1,000.00" and "50%" as amounts.
// A number touching a slash is part of a date ("30/1"), and long digit runs are phones.
function tokens(note: string): Token[] {
  return (
    note
      // "£ 500" -> "£500"; a comma between words is a gap, one inside "£1,000" is not
      .replace(/([£$])\s+/g, '$1')
      .replace(/,(\s|$)/g, ' ')
      .split(/[\s;:()!?]+/)
      .filter((word) => word !== '')
      .map((word) => {
        const text = word.replace(/[.-]+$/, '');
        const percent = /^(\d{1,3})%$/.exec(text);
        if (percent) return { text, pence: null, share: Number(percent[1]) / 100 };
        if (/\//.test(text) || /^\d{6,}$/.test(text.replace(/,/g, ''))) {
          return { text, pence: null, share: null };
        }
        const pence = /^£?\d[\d,]*(\.\d{1,2})?$/.test(text) ? parseMoney(text) : null;
        return { text, pence, share: null };
      })
  );
}

// The amount paid and owed that a note gives for an invoice of this total, or null when
// the note gives none, or gives amounts that don't fit.
export function readNoteAmount(note: string, grossPence: number): NoteAmount | null {
  const words = tokens(note);
  const paid = new Set<number>();
  const due = new Set<number>();

  words.forEach((word, index) => {
    const amount = word.pence ?? (word.share !== null ? Math.round(grossPence * word.share) : null);
    if (amount === null || amount <= 0) return;
    // the total itself, or more than it, says nothing about what was paid
    if (amount >= grossPence) return;
    const near = words
      .slice(Math.max(0, index - REACH), index + REACH + 1)
      .map((w) => w.text.toLowerCase());
    const isPaid = near.some((w) => PAID.test(w));
    const isDue = near.some((w) => DUE.test(w));
    // "deposit 500, balance 700 due" puts both words near each amount; the nearest wins
    if (isPaid && isDue) {
      const distance = (pattern: RegExp) =>
        Math.min(
          ...words
            .map((w, i) => (pattern.test(w.text) ? Math.abs(i - index) : Infinity))
            .filter((d) => Number.isFinite(d)),
        );
      if (distance(PAID) <= distance(DUE)) paid.add(amount);
      else due.add(amount);
    } else if (isPaid) paid.add(amount);
    else if (isDue) due.add(amount);
  });

  // two different amounts for the same thing: can't tell which, so suggest nothing
  if (paid.size > 1 || due.size > 1) return null;
  const [paidAmount] = [...paid];
  const [dueAmount] = [...due];

  if (paidAmount !== undefined && dueAmount !== undefined) {
    if (paidAmount + dueAmount !== grossPence) return null;
    return {
      paidPence: paidAmount,
      duePence: dueAmount,
      note,
      evidence: [
        `The note says ${pounds(paidAmount)} paid and ${pounds(dueAmount)} still owed, which add up to the total ${pounds(grossPence)}.`,
      ],
    };
  }
  if (paidAmount !== undefined) {
    return {
      paidPence: paidAmount,
      duePence: grossPence - paidAmount,
      note,
      evidence: [
        `The note says ${pounds(paidAmount)} paid, which leaves ${pounds(grossPence - paidAmount)} of the ${pounds(grossPence)} total owed.`,
      ],
    };
  }
  if (dueAmount !== undefined) {
    return {
      paidPence: grossPence - dueAmount,
      duePence: dueAmount,
      note,
      evidence: [
        `The note says ${pounds(dueAmount)} still owed, so ${pounds(grossPence - dueAmount)} of the ${pounds(grossPence)} total was paid.`,
      ],
    };
  }
  return null;
}
