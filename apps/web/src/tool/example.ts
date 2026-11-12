// "See an example": a full report from made-up files, so people can see what the
// tool does before using their own. Nothing here is saved or counted as a report.
import invoices from './fixtures/example/invoices.csv?raw';
import quotes from './fixtures/example/quotes.csv?raw';
import jobs from './fixtures/example/jobs.csv?raw';
import visits from './fixtures/example/visits.csv?raw';
import customers from './fixtures/example/customers.csv?raw';
import { addUpload, emptyTool, type ToolState } from './files';
import { emptyMemory } from './memory';
import { readUpload } from './readUpload';

// the example is always worked out on this day, so its figures never drift
export const EXAMPLE_DATE = '2026-11-05';

const FILES: [string, string][] = [
  ['example-invoices.csv', invoices],
  ['example-quotes.csv', quotes],
  ['example-jobs.csv', jobs],
  ['example-visits.csv', visits],
  ['example-customers.csv', customers],
];

export async function exampleTool(): Promise<ToolState> {
  let state = emptyTool({ name: 'Example Plumbing and Heating', stagger: 1 }, emptyMemory());
  for (const [name, text] of FILES) {
    state = addUpload(state, await readUpload(name, new TextEncoder().encode(text)));
  }
  return { ...state, step: 'report', example: true };
}
