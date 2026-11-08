import { describe, expect, it } from 'vitest';
import { readSheet } from '../src/layout';
import { convertSpreadsheet } from '../src/general/invoices';
import { askQuestions, emptyAnswers, type Answers } from '../src/general/questions';
import { moneyOwed } from '../src/reports/owed';

const options = { businessId: 'test', file: 'my-invoices.csv' };
const header = 'Ref,When,Customer,Net,VAT,Total,Paid?';
const columns: Answers['columns'] = {
  invoiceNumber: 'Ref',
  date: 'When',
  customer: 'Customer',
  net: 'Net',
  vat: 'VAT',
  gross: 'Total',
  status: 'Paid?',
};
const status: Answers['status'] = { yes: 'paid', no: 'unpaid', part: 'part paid', '?': 'ignore' };
const convert = (rows: string[], answers: Partial<Answers> = {}) =>
  convertSpreadsheet(
    readSheet([header, ...rows].join('\n')),
    // dates like 03/03/2026 fit both orders, so the order is one of the answers
    { ...emptyAnswers(), columns, status, dateOrder: 'day-first', ...answers },
    options,
  );
const messages = (result: ReturnType<typeof convert>) => result.issues.map((i) => i.message);

describe('convertSpreadsheet', () => {
  const result = convert([
    'A1,03/03/2026,Ann Example,100.00,20.00,120.00,Yes',
    'A2,14/03/2026,Bob Example,80.00,16.00,96.00,No',
  ]);
  const [first, second] = result.records;

  it('turns each row into an invoice', () => {
    expect(result.records.map((r) => r.number)).toEqual(['A1', 'A2']);
    expect(result.issues).toEqual([]);
    expect(first).toMatchObject({
      customerName: 'Ann Example',
      issueDate: '2026-03-03',
      grossPence: 12000,
      taxPence: 2000,
      netPence: { origin: 'stated', value: 10000 },
      source: { tool: 'spreadsheet', file: 'my-invoices.csv', rows: [2] },
    });
  });

  it("marks paid and owed as worked out from the user's answer, not stated", () => {
    expect(first?.status).toEqual({
      origin: 'derived',
      value: 'paid',
      rule: 'you said "Yes" means paid',
    });
    expect(first?.duePence.value).toBe(0);
    expect(second?.status.value).toBe('unpaid');
    expect(second?.duePence.value).toBe(9600);
  });

  it('feeds the money owed report like any other source', () => {
    expect(moneyOwed(result.records, '2026-04-01').owedPence).toBe(9600);
  });
});

describe('checks', () => {
  it('flags an invoice number used twice and keeps both', () => {
    const result = convert([
      'A1,03/03/2026,Ann,100.00,20.00,120.00,Yes',
      'A1,04/03/2026,Bob,50.00,10.00,60.00,No',
    ]);
    expect(result.records).toHaveLength(2);
    expect(messages(result)).toContain(
      'Invoice number A1 is used on rows 2 and 3. Both are kept. Check whether one should have a different number.',
    );
  });

  it('flags net plus VAT that does not make the total', () => {
    const result = convert(['A1,03/03/2026,Ann,450.00,90.00,560.00,Yes']);
    expect(result.issues[0]?.kind).toBe('totals-do-not-add-up');
    expect(result.records[0]?.netPence.value).toBeNull();
  });

  it('leaves an impossible date blank and says so', () => {
    const result = convert(['A1,31/04/2026,Ann,100.00,20.00,120.00,Yes']);
    expect(result.records[0]?.issueDate).toBeNull();
    expect(messages(result)).toContain(
      'A1 (row 2): "31/04/2026" is not a real date, so the date was left blank.',
    );
  });

  it('uses the year the user gave for a date written without one', () => {
    const result = convert(['A1,29th July,Ann,100.00,20.00,120.00,Yes'], {
      years: { '29th July': 2025 },
    });
    expect(result.records[0]?.issueDate).toBe('2025-07-29');
  });

  it('leaves out a row with no invoice number or no readable total, and says why', () => {
    const result = convert([
      ',03/03/2026,Ann,100.00,20.00,120.00,Yes',
      'A2,03/03/2026,Bob,100.00,20.00,TBC,Yes',
      'A3,03/03/2026,Cat,100.00,20.00,120.00,Yes',
    ]);
    expect(result.records.map((r) => r.number)).toEqual(['A3']);
    expect(messages(result)).toEqual([
      'Row 2 has no invoice number, so it was left out.',
      'A2 (row 3): the total "TBC" is not an amount, so the invoice was left out.',
    ]);
  });

  it('flags a missing customer but keeps the invoice', () => {
    const result = convert(['A1,03/03/2026,,100.00,20.00,120.00,Yes']);
    expect(result.records[0]?.customerName).toBeNull();
    expect(messages(result)).toContain('A1 (row 2) has no customer.');
  });
});

describe('paid status', () => {
  it('leaves the amount owed unknown when part paid, never guessing', () => {
    const invoice = convert(['A1,03/03/2026,Ann,100.00,20.00,120.00,part']).records[0];
    expect(invoice?.status.value).toBe('unpaid');
    expect(invoice?.paidPence.value).toBeNull();
    expect(invoice?.duePence.value).toBeNull();
  });

  it('leaves the status unknown when the user said to ignore a value', () => {
    expect(
      convert(['A1,03/03/2026,Ann,100.00,20.00,120.00,?']).records[0]?.status.value,
    ).toBeNull();
  });

  it('leaves the status unknown when the file has no paid column', () => {
    const invoice = convert(['A1,03/03/2026,Ann,100.00,20.00,120.00,Yes'], {
      columns: { ...columns, status: null },
    }).records[0];
    expect(invoice?.status).toEqual({ origin: 'unknown', value: null, reason: 'no paid column' });
  });
});

describe('VAT', () => {
  it('treats a file with no VAT column as not VAT registered', () => {
    const invoice = convert(['A1,03/03/2026,Ann,,,320.00,Yes'], {
      columns: { ...columns, net: null, vat: null },
    }).records[0];
    expect(invoice?.taxPence).toBe(0);
    expect(invoice?.netPence).toEqual({
      origin: 'derived',
      value: 32000,
      rule: 'no VAT column, so net equals total',
    });
  });

  it('works out net from total and VAT when there is no net column', () => {
    const invoice = convert(['A1,03/03/2026,Ann,,20.00,120.00,Yes'], {
      columns: { ...columns, net: null },
    }).records[0];
    expect(invoice?.netPence).toEqual({ origin: 'derived', value: 10000, rule: 'total minus VAT' });
  });

  it('reads a VAT-inclusive file, where the net column already holds the total', () => {
    const invoice = convert(['A1,03/03/2026,Ann,120.00,20.00,120.00,Yes']).records[0];
    expect(invoice?.taxMode.value).toBe('inclusive');
    expect(invoice?.netPence.value).toBe(10000);
  });
});

describe('unanswered questions', () => {
  it('converts nothing until every question is answered', () => {
    const result = convertSpreadsheet(
      readSheet([header, 'A1,03/03/2026,Ann,100.00,20.00,120.00,Yes'].join('\n')),
      emptyAnswers(),
      options,
    );
    expect(result.records).toEqual([]);
    expect(result.issues[0]?.message).toMatch(/questions are still to answer/);
  });
});

describe('repairs', () => {
  const rows = [
    'A1,03/03/2026,Ann,100.00,20.00,120.00,Yes',
    'A2,14/03/2026,Bob,80.00,16.00,96.00,No',
    'A3,15/03/2026,Cat,50.00,10.00,60.00,Yes',
    'A4,16/03/2026,Dan,40.00,8.00,48.00,No',
    // the net was typed into the date column by mistake
    'A5,£380.00,Eve,,76.00,456.00,No',
  ];
  const table = readSheet([header, ...rows].join('\n'));
  const base = { ...emptyAnswers(), columns, status, dateOrder: 'day-first' as const };
  const id = 'move:6:When:Net';

  it('uses an accepted repair, notes it, and marks the net as worked out', () => {
    const result = convertSpreadsheet(table, { ...base, repairs: { [id]: 'accept' } }, options);
    const fixed = result.records[4];
    expect(fixed?.netPence).toEqual({
      origin: 'derived',
      value: 38000,
      rule: 'you moved £380.00 from When to Net on row 6',
    });
    expect(result.issues.map((i) => i.message)).toContain(
      'Repaired: you moved £380.00 from When to Net on row 6.',
    );
  });

  it('converts without the repair when it is not answered, and does not wait for it', () => {
    const result = convertSpreadsheet(table, base, options);
    expect(result.records).toHaveLength(5);
    expect(result.records[4]?.netPence.value).toBe(38000);
    expect(result.records[4]?.netPence.origin).toBe('derived');
    // worked out as total minus VAT, as the net cell is empty, and the bad date is flagged
    expect(result.records[4]?.netPence).toMatchObject({ rule: 'total minus VAT' });
  });
});

describe('same customer', () => {
  const rows = [
    'A1,15/03/2026,David Smith,100.00,20.00,120.00,Yes',
    'A2,16/03/2026,David Smith,80.00,16.00,96.00,No',
    'A3,17/03/2026,Grace Holt,50.00,10.00,60.00,Yes',
    'A4,18/03/2026,Davod Smith,40.00,8.00,48.00,No',
  ];
  const table = readSheet([header, ...rows].join('\n'));
  const base = { ...emptyAnswers(), columns, status };

  it('uses one name when the user says two spellings are the same customer', () => {
    const result = convertSpreadsheet(
      table,
      { ...base, names: { 'name:Davod Smith': 'same' } },
      options,
    );
    expect(result.records.map((r) => r.customerName)).toEqual([
      'David Smith',
      'David Smith',
      'Grace Holt',
      'David Smith',
    ]);
    expect(result.issues.map((i) => i.message)).toContain(
      'Same customer: you said "Davod Smith" is "David Smith".',
    );
  });

  it('keeps them apart when the question is not answered', () => {
    const result = convertSpreadsheet(table, base, options);
    expect(result.records[3]?.customerName).toBe('Davod Smith');
  });
});

describe('one name, two customers', () => {
  const twinHeader = 'Ref,When,Customer,Postcode,Total,Paid?';
  const table = readSheet(
    [
      twinHeader,
      'A1,15/03/2026,David Braithwaite,CA8 2DD,120.00,Yes',
      'A2,16/03/2026,David Braithwaite,CA8 2DD,96.00,No',
      'A3,17/03/2026,Grace Holt,M4 1NP,60.00,Yes',
      'A4,18/03/2026,David Braithwaite,CA11 7EE,48.50,No',
    ].join('\n'),
  );
  const answers = {
    ...emptyAnswers(),
    columns: {
      invoiceNumber: 'Ref',
      date: 'When',
      customer: 'Customer',
      net: null,
      vat: null,
      gross: 'Total',
      status: 'Paid?',
    },
    status,
  };

  it('labels each customer by postcode when the user says they are different', () => {
    const result = convertSpreadsheet(
      table,
      { ...answers, names: { 'split:David Braithwaite': 'separate' } },
      options,
    );
    expect(result.records.map((r) => r.customerName)).toEqual([
      'David Braithwaite (CA8 2DD)',
      'David Braithwaite (CA8 2DD)',
      'Grace Holt',
      'David Braithwaite (CA11 7EE)',
    ]);
  });

  it('keeps one name when the question is not answered', () => {
    const result = convertSpreadsheet(table, answers, options);
    expect(new Set(result.records.map((r) => r.customerName))).toEqual(
      new Set(['David Braithwaite', 'Grace Holt']),
    );
  });
});

describe('amounts in notes', () => {
  const noteHeader = 'Ref,When,Customer,Total,Paid?,Notes';
  const table = readSheet(
    [
      noteHeader,
      'A1,15/03/2026,Ann,120.00,Yes,',
      'A2,16/03/2026,Bob,2160.00,part,£1000 paid towards the rewire',
      'A3,17/03/2026,Cat,60.00,No,',
    ].join('\n'),
  );
  const answers = {
    ...emptyAnswers(),
    columns: {
      invoiceNumber: 'Ref',
      date: 'When',
      customer: 'Customer',
      net: null,
      vat: null,
      gross: 'Total',
      status: 'Paid?',
    },
    status,
  };

  it('asks about the amount in the note of a part-paid invoice', () => {
    const questions = askQuestions(table, answers).filter((q) => q.kind === 'note-amount');
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatchObject({ id: 'paid:3', row: 3 });
  });

  it('uses it once accepted, and counts the rest as owed', () => {
    const result = convertSpreadsheet(
      table,
      { ...answers, repairs: { 'paid:3': 'accept' } },
      options,
    );
    const invoice = result.records[1];
    expect(invoice?.paidPence).toEqual({
      origin: 'derived',
      value: 100000,
      rule: 'you confirmed the note "£1000 paid towards the rewire" means £1,000.00 paid',
    });
    expect(invoice?.duePence.value).toBe(116000);
    expect(moneyOwed(result.records, '2026-04-01').owedPence).toBe(116000 + 6000);
  });

  it('leaves the amount owed unknown when not accepted', () => {
    const result = convertSpreadsheet(table, answers, options);
    expect(result.records[1]?.duePence.value).toBeNull();
  });
});
