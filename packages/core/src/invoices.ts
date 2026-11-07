import type { CsvTable } from './csv';
import { detectFile } from './detect';
import { convertJobberInvoices } from './jobber/invoices';
import type { ConvertResult, Invoice } from './model';
import { convertTradifyInvoices } from './tradify/invoices';

export interface InvoiceFileOptions {
  businessId: string;
  file: string;
  // YYYY-MM-DD
  today: string;
}

// Recognise an invoice file and send it to the right converter.
export function convertInvoiceFile(
  table: CsvTable,
  options: InvoiceFileOptions,
): ConvertResult<Invoice> {
  const detection = detectFile(table.headers);
  const match = detection.match;

  if (match?.kind === 'invoices' && match.tool === 'tradify') {
    return convertTradifyInvoices(table, options);
  }
  if (match?.kind === 'invoices' && match.tool === 'jobber') {
    return convertJobberInvoices(table, options);
  }

  // a known file of the wrong kind, or nothing we know
  const message = match ? `${detection.message} It isn't an invoice file.` : detection.message;
  return { records: [], issues: [{ kind: 'missing-column', rows: [1], message }] };
}
