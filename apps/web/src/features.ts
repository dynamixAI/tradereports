// the results the tool gives, with made-up example figures for the landing page
export interface Feature {
  label: string;
  value: number;
  money: boolean;
}

export const EXAMPLE_FEATURES: readonly Feature[] = [
  { label: 'Money owed', value: 6420, money: true },
  { label: 'Overdue 60+ days', value: 2100, money: true },
  { label: 'Not invoiced', value: 1850, money: true },
  { label: 'Income this month', value: 12480, money: true },
  { label: 'VAT this quarter', value: 3140, money: true },
  { label: 'Top customer', value: 4200, money: true },
  { label: 'Customers gone quiet', value: 7, money: false },
  { label: 'Problems found', value: 14, money: false },
];

// whole pounds with commas, e.g. £6,420
export function formatValue(value: number, money: boolean): string {
  const n = Math.round(value).toLocaleString('en-GB');
  return money ? `£${n}` : n;
}
