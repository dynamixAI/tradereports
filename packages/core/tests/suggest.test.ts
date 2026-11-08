import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readCsv } from '../src/csv';
import { readSheet } from '../src/layout';
import { suggestColumns, type Field } from '../src/suggest';

const fixture = (path: string) =>
  readFileSync(new URL(`./fixtures/${path}`, import.meta.url), 'utf8');
const suggest = (text: string) => suggestColumns(readSheet(text));
const best = (text: string, field: Field) => suggest(text).fields[field].best;

describe('suggestions for real files', () => {
  it("matches Dave's home-made sheet", () => {
    const { fields, missing } = suggest(fixture('homemade/dave-invoices.csv'));
    expect(fields.invoiceNumber.best).toBe('Inv No');
    expect(fields.date.best).toBe('Date');
    expect(fields.customer.best).toBe('Customer');
    expect(fields.net.best).toBe('Net');
    expect(fields.vat.best).toBe('VAT');
    expect(fields.gross.best).toBe('Total');
    expect(fields.status.best).toBe('Paid?');
    expect(missing).toEqual([]);
  });

  it('matches the Jobber invoices report as if it were unknown', () => {
    const { fields } = suggestColumns(readCsv(fixture('jobber/invoices-report.csv')));
    expect(fields.invoiceNumber.best).toBe('Invoice #');
    expect(fields.customer.best).toBe('Client name');
    expect(fields.net.best).toBe('Pre-tax total ($)');
    expect(fields.vat.best).toBe('Tax amount ($)');
    // Total and Balance hold the same numbers; the header name breaks the tie
    expect(fields.gross.best).toBe('Total ($)');
    expect(fields.status.best).toBe('Status');
  });

  it('never picks a due date or paid date as the invoice date', () => {
    const { fields } = suggest(fixture('homemade/dave-invoices.csv'));
    expect(fields.date.candidates.map((c) => c.header)).toContain('Due Date');
    expect(fields.date.best).not.toBe('Due Date');
  });
});

describe('the arithmetic finds net, VAT and total whatever they are called', () => {
  const sheet = [
    'Ref,Who,P,Q,R',
    'X1,Ann Example,100.00,20.00,120.00',
    'X2,Bob Example,80.00,16.00,96.00',
    'X3,Ann Example,55.50,11.10,66.60',
    'X4,Cat Example,300.00,60.00,360.00',
  ].join('\n');

  it('works out which is which from the numbers alone', () => {
    const { fields } = suggest(sheet);
    expect([fields.net.best, fields.vat.best, fields.gross.best]).toEqual(['P', 'Q', 'R']);
    expect(fields.gross.candidates[0]?.evidence).toContain('Equals P + Q on 4 of 4 rows.');
    expect(fields.vat.candidates[0]?.evidence).toContain('Is 20% of P on 4 of 4 rows.');
  });

  it('works with the columns in any order', () => {
    const shuffled = [
      'R,Who,Q,Ref,P',
      '120.00,Ann Example,20.00,X1,100.00',
      '96.00,Bob Example,16.00,X2,80.00',
      '66.60,Ann Example,11.10,X3,55.50',
      '360.00,Cat Example,60.00,X4,300.00',
    ].join('\n');
    const { fields } = suggest(shuffled);
    expect([fields.net.best, fields.vat.best, fields.gross.best]).toEqual(['P', 'Q', 'R']);
  });

  it('still finds them when one row does not add up', () => {
    const wrong = sheet.replace('80.00,16.00,96.00', '80.00,16.00,99.00');
    const { fields } = suggest(wrong);
    expect(fields.gross.best).toBe('R');
    expect(fields.gross.candidates[0]?.evidence).toContain('Equals P + Q on 3 of 4 rows.');
  });

  it('handles 5% VAT', () => {
    const fivePercent = [
      'Ref,Who,A,B,C',
      'X1,Ann,100.00,5.00,105.00',
      'X2,Bob,40.00,2.00,42.00',
      'X3,Cat,60.00,3.00,63.00',
    ].join('\n');
    expect(suggest(fivePercent).fields.vat.best).toBe('B');
  });
});

describe('a business that is not VAT registered', () => {
  const sheet = [
    'Job no,Customer,Labour,Materials,Charged,Paid?',
    'J1,Ann Example,120,200,320,Yes',
    'J2,Bob Example,85,60,145,No',
    'J3,Cat Example,400,280,680,Yes',
    'J4,Ann Example,65,30,95,No',
  ].join('\n');

  it('does not mistake labour plus materials for net plus VAT', () => {
    const result = suggest(sheet);
    expect(result.fields.vat.best).toBeNull();
    expect(result.fields.net.best).toBeNull();
    expect(result.vatFound).toBe(false);
  });

  it('takes the column that adds up the others as the total', () => {
    const { fields } = suggest(sheet);
    expect(fields.gross.best).toBe('Charged');
    expect(fields.gross.candidates[0]?.evidence).toContain(
      'Equals Labour + Materials on 4 of 4 rows.',
    );
  });
});

describe('a good name is not enough', () => {
  it('does not take a column of counts called Total as the total', () => {
    const sheet = [
      'Ref,Customer,Total jobs,Amount',
      'X1,Ann Example,1,120.00',
      'X2,Bob Example,2,96.50',
      'X3,Cat Example,3,72.25',
    ].join('\n');
    expect(best(sheet, 'gross')).toBe('Amount');
  });

  it('does not take a column of descriptions called Customer notes as the customer', () => {
    const sheet = [
      'Ref,Customer notes,Client,Amount',
      'X1,rang twice about the boiler,Ann Example,120.00',
      'X2,wants it done before Friday,Bob Example,96.50',
      'X3,rang twice about the boiler,Ann Example,72.25',
    ].join('\n');
    expect(best(sheet, 'customer')).toBe('Client');
  });

  it('does not take invoice numbers counting up as money', () => {
    const sheet = [
      'INV,CUSTOMER,CHARGE',
      '201,Ann Example,320',
      '202,Bob Example,145',
      '203,Cat Example,680',
      '204,Dan Example,95',
    ].join('\n');
    const { fields } = suggest(sheet);
    expect(fields.invoiceNumber.best).toBe('INV');
    expect(fields.gross.best).toBe('CHARGE');
  });
});

describe('paid or not, and how', () => {
  it('prefers a column that says whether it was paid over one that says how', () => {
    const sheet = [
      'Ref,Customer,Amount,how paid,paid?',
      'X1,Ann,120.00,Bank,Yes',
      'X2,Bob,96.50,,No',
      'X3,Cat,72.25,Cash,Yes',
      'X4,Dan,50.00,,No',
    ].join('\n');
    expect(best(sheet, 'status')).toBe('paid?');
  });
});

describe('one money column', () => {
  it('is the total, even with a name that says nothing', () => {
    const sheet = ['Ref,Who,Box 7', 'X1,Ann,120.00', 'X2,Bob,96.50', 'X3,Cat,72.25'].join('\n');
    const gross = suggest(sheet).fields.gross;
    expect(gross.best).toBe('Box 7');
    expect(gross.candidates[0]?.evidence).toContain('The only column of money amounts.');
  });
});

describe('ties and gaps', () => {
  it('leaves a tie for the user instead of picking one', () => {
    const sheet = [
      'Ref,Business,Contact,Amount',
      'X1,Acme Lettings,Ann Example,120.00',
      'X2,Hill Homes,Bob Example,96.50',
      'X3,Acme Lettings,Cat Example,72.25',
    ].join('\n');
    const customer = suggest(sheet).fields.customer;
    expect(customer.best).toBeNull();
    expect(customer.tie).toBe(true);
    expect(
      customer.candidates
        .slice(0, 2)
        .map((c) => c.header)
        .sort(),
    ).toEqual(['Business', 'Contact']);
  });

  it('uses each column for one field only', () => {
    const { fields } = suggest(fixture('homemade/dave-invoices.csv'));
    const chosen = Object.values(fields)
      .map((field) => field.best)
      .filter((header) => header !== null);
    expect(new Set(chosen).size).toBe(chosen.length);
  });

  it('lists required fields it could not find', () => {
    const sheet = ['Date,Amount', '01/03/2026,120.00', '04/03/2026,96.00'].join('\n');
    expect(suggest(sheet).missing).toEqual(['invoiceNumber', 'customer']);
  });

  it('copes with an empty table', () => {
    expect(suggest('Ref,Customer,Total').missing).toEqual(['invoiceNumber', 'customer', 'gross']);
  });
});

describe('invoice numbers', () => {
  it.each([
    ['letters and numbers', ['NSH-26-001', 'NSH-26-002', 'NSH-26-003']],
    ['plain numbers', ['1041', '1042', '1043']],
    ['with a duplicate, as people make', ['H095', 'H096', 'H096', 'H098', 'H099']],
  ])('finds %s', (_name, refs) => {
    const sheet = [
      'Number,Who,Amount',
      ...refs.map((ref, i) => `${ref},Customer ${i % 2},${(100 + i * 7).toFixed(2)}`),
    ].join('\n');
    expect(best(sheet, 'invoiceNumber')).toBe('Number');
  });

  it('does not take an address with a house number as an invoice number', () => {
    const sheet = [
      'Ref,Address,Amount',
      'X1,12 High Street,120.00',
      'X2,3 Mill Lane,96.50',
      'X3,40 Park Road,72.25',
    ].join('\n');
    expect(best(sheet, 'invoiceNumber')).toBe('Ref');
  });
});

describe('status', () => {
  it.each([
    ['yes and no', ['Yes', 'no', 'Y', 'N']],
    ['paid words', ['Paid', 'Unpaid', 'paid', 'Outstanding']],
    ['how paid', ['Bank', 'Cash', 'Due', 'Bank']],
  ])('finds a column of %s', (_name, words) => {
    const sheet = [
      'Ref,Customer,Amount,Settled',
      ...words.map((word, i) => `X${i},Customer ${i},${(50 + i).toFixed(2)},${word}`),
    ].join('\n');
    expect(best(sheet, 'status')).toBe('Settled');
  });
});
