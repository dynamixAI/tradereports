# Jobber quotes, invoices and report exports: findings

- Dates: 2026-11-02 to 2026-11-03
- Source: Jobber developer test account (UK, Europe/London, VAT 20%)
- Data: 30 imported quotes, 40 imported invoices, and 4 quote → job chains created by hand
- Files: Invoices, Quotes, One-off jobs and Visits reports, exported with all columns
- Related: `jobber-client-import-export.md`

## Test cases created by hand

| Quote | Job | Visit | Invoice | Purpose |
| --- | --- | --- | --- | --- |
| #130 (Grace) | #1 | Completed, dated the next day | #2041 (draft) | Full chain; also a future-dated visit |
| #114 (Frank) | #2 | Completed | None | Finished but not invoiced ("Requires invoicing") |
| #122 (Sam) | #3 | Completed | #2042 (draft) | Full chain |
| #104 (Chloe) | #4 | Completed | None | Job status "Action Required" |

Quote #116 (Sam) was imported as Approved and never converted, which gives a natural "won but not scheduled" case.

## Importing quotes and invoices

- Imports must use Jobber's sample-file headers exactly.
- Quotes can be imported as Draft, Awaiting Response or Approved. Invoices as Draft, Sent or Paid.
- Import dates must be ISO (`2025-01-30`), while exports use other formats.
- Quote line items use a UNIT price; invoice line items use a TOTAL price.
- Jobber's own sample file contains a line break inside a cell, so a CSV reader must handle multi-line cells.
- The import asks the user to map every blank cell ("Cells with no data") to a value or "Do not import", even for unused columns.
- Existing tax rates are matched by name (`VAT` mapped to `VAT (20.0%) (Default)`).
- Quotes cannot be backdated: every imported quote takes the import date. Invoices keep their issued and due dates.
- Jobber keeps an import log: every row with a status (Matched, Created, Failed), a reason ("Found existing client by email") and a Revert Data option.
- All 40 invoices matched existing clients by email; no duplicates were created.

## How Jobber's own screens count things

- "Conversion rate" counts quotes converted into jobs, not quotes approved. It showed 0% with 14 approved quotes.
- "Sent" excluded quotes imported as Approved.
- "Invoice payment time" showed 110 days (residential) and 118 (commercial), inflated because imported paid invoices are marked paid on the import date.
- Job status "Archived" means completed and invoiced, not deleted or inactive.

## File names

- Reports: `Invoices_Report_1_of_1_2026-11-03.csv` (type, part number, export date).
- Clients: `Jobber Clients 1 of 1.csv` (a different pattern).
- Browsers add ` (1)` to repeated downloads, and users may rename files.
- Detect the file type from headers, never from the name.

## Formats

- Report dates are `Nov 03, 2026`; the client export used `02/11/2026`. Two formats from one account.
- Empty values appear as `-`, `""` and blank.
- Money headers say `($)` on a UK account; values are plain decimals (`2160.0`, `160.83`).
- Line items differ per report:
  - invoices and quotes: `Hot water cylinder replacement (2, £1800.00)`
  - jobs: `Leak Repair, Mixer tap` (no quantities or prices)
  - visits: `Leak Repair (1)`
- `Late by` is text with units (`1 day`, `49 days`).
- `Time tracked` is `0:00` in visits and `0.0` in jobs.
- Status case differs between import and export (`Awaiting Response` vs `Awaiting response`).

## Links between records

- Quotes report: `Job #s`
- Jobs report: `Quote #` and `Invoice #s`
- Invoices report: `Job #s`
- Quote, job and invoice numbers are separate series (101+, 1+, 2001+).
- Invoices imported directly are not linked to any job or quote.

## Data quality traps

1. Invoices imported as Paid keep a full balance (Status Paid, Balance equal to Total). Never use Balance alone to decide what is owed.
2. On VAT-inclusive invoices, `Pre-tax total` equals `Total`. Net revenue must be `Total - Tax amount`.
3. Draft invoices can have issued and due dates and show `Late by`. Exclude drafts from overdue.
4. Imported invoices have no service address, only billing. Area analysis must fall back to the billing postcode.
5. `Marked paid date` is the import date for imported paid invoices, so payment times are inflated.
6. Imported quotes all share the import date as their drafted and approved dates.
7. A job whose only visit was dated the next day did not appear in the one-off jobs or visits reports, even after re-exporting. Every exported row was dated today or earlier, so these reports probably exclude future-dated records. Not confirmed.
8. Jobber allowed that visit to be marked completed, and the job closed, before the visit's own date.
9. Because exports can cover different date ranges, records linked from one file can be missing from another (invoice #2041 points to job #1, which is not in the jobs file).

## Useful extras

- The jobs report includes costs, profit and profit %.
- Quotes include drafted, sent, approved, converted and archived dates, so quote ageing is possible for real (non-imported) data.
- Discounts are applied before VAT: (190 - 50) × 1.2 = 168.

## Rules for TradeReports

- Decide "owed" from Status plus Balance, and flag mismatches.
- Calculate net revenue as Total minus Tax amount.
- Exclude drafts from overdue and sent totals.
- Fall back from service to billing address.
- Treat `-`, `""` and blank as empty.
- Parse both date formats and both time-tracked formats, and `Late by`.
- Parse line items with a separate rule per report type.
- Compare statuses case-insensitively, and translate them (Archived means done, not removed).
- Show two win rates with clear labels: approved ÷ sent, and converted ÷ sent.
- Flag records whose dates all fall on one day as likely imported history.
- Flag visits completed with a future date.
- Check links across files and warn when linked records are missing, suggesting the exports may cover different date ranges.
- Treat blank cells as blank automatically; only ask about values that are not recognised.
- Report results per row with a reason, like Jobber's import log.
