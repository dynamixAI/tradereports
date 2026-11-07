import { derived, stated, unknown, type ConvertIssue, type Known, type TaxMode } from './model';

// Neither Jobber nor Tradify says whether prices include VAT, so work it out from
// how the totals add up. `netName` is what the source calls the pre-VAT figure.
export function workOutTax(
  number: string,
  net: number,
  tax: number,
  total: number,
  netName: string,
  rowNumbers: number[],
  issues: ConvertIssue[],
): { taxMode: Known<TaxMode>; net: Known<number> } {
  if (tax === 0 && net === total) {
    return {
      taxMode: unknown('no VAT on this invoice, so inclusive and exclusive look the same'),
      net: derived(total, 'no VAT, so net equals total'),
    };
  }
  // on inclusive invoices both tools put the VAT-inclusive total in the "net" column
  if (net === total) {
    return {
      taxMode: derived('inclusive', `${netName} equals total and VAT is above zero`),
      net: derived(total - tax, 'total minus VAT'),
    };
  }
  if (net + tax === total) {
    return {
      taxMode: derived('exclusive', `${netName} plus VAT equals total`),
      net: stated(net),
    };
  }
  issues.push({
    kind: 'totals-do-not-add-up',
    rows: rowNumbers,
    message: `${number}: ${netName} ${pounds(net)}, VAT ${pounds(tax)} and total ${pounds(total)} don't fit together either way.`,
  });
  return {
    taxMode: unknown(`${netName}, VAT and total don't add up`),
    net: unknown(`${netName}, VAT and total don't add up`),
  };
}

// pence to "£12.34" for messages
export function pounds(pence: number): string {
  const sign = pence < 0 ? '-' : '';
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`;
}
