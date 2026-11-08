# ADR 0006: Column matching for unknown files

**Status:** Proposed
**Date:** 8 November 2026

## Context

TradeReports recognises Jobber and Tradify exports by their headers (ADR 0005). Users will
also bring home-made spreadsheets and exports from other tools, with headers we have never
seen.

Testing showed both ways the big tools get column matching wrong:

- Jobber guessed confidently and was sometimes wrong. Its clients export still holds
  "Mornings" in mobile phone fields from a wrong guess at import.
- Tradify suggested nothing at all, not even `E-mail Address` for `Email Address`, and a
  careful tester still put a mobile number in the landline field.

Home-made spreadsheets add layout problems: title rows above the headers, a Total row at
the bottom, dates stored day-first or month-first, and paid status shown only by colour.

## Decision

### 1. Match to the shared model, starting with invoices

Unknown files are matched to the fields of a shared record (ADR 0005). Invoices come
first, because every money report depends on them.

| Field          | Needed? | Unlocks                           |
| -------------- | ------- | --------------------------------- |
| Invoice number | Yes     | Counting each invoice once        |
| Customer       | Yes     | By-customer reports               |
| Total          | Yes     | Any money figure                  |
| Issue date     | No      | Income by month, VAT by quarter   |
| Due date       | No      | Overdue and age bands             |
| Net, VAT       | No      | Figures before VAT                |
| Paid, Due      | No      | Who owes me money                 |
| Status         | No      | Drafts left out                   |
| Job number     | No      | Linking to jobs and unbilled work |

A missing optional field makes its values `unknown`, and each report says what it can't
work out ("Overdue can't be worked out: there's no due date column").

### 2. Three kinds of evidence

Each suggestion is built from evidence, and the evidence is shown to the user.

1. **Header name.** A list of common names per field (`Inv No`, `Invoice #`, `Ref`), compared
   after lower-casing and removing spaces, punctuation and currency labels.
2. **Values.** The share of non-empty cells that read as money, dates, UK postcodes, UK phone
   numbers, emails, yes/no words, or unique IDs. For example: "Tel: 98% are UK mobiles."
3. **Arithmetic across columns.** Checks such as net + VAT = total, and total − paid = due,
   on at least 90% of rows. This is what tells one money column from another.

### 3. When a suggestion is allowed

- A column is only suggested for a field when its values support it. A header name alone is
  never enough: "Phone" full of "Mornings" is not suggested as a phone.
- Money columns are told apart by the arithmetic, not by their names.
- One column per field and one field per column. If two columns fit a field equally well,
  both are shown and the user picks.
- **Nothing is matched without the user confirming.** Any column can be left unmatched.
- Columns left unmatched are listed, so nothing is dropped silently.

### 4. Dates

- A column whose day values go above 12 shows its order (`25/03/2026` must be day first).
- If every value fits both orders, the user is asked once, and the answer is saved.
- Excel's date serial numbers (such as `45963`) are recognised and converted.

### 5. Status words

Words in a status column are listed with their counts, and the user maps each one to a
shared status ("Sent" means unpaid, "Done" means paid). A word that isn't mapped becomes
`unknown` and is reported, as with Jobber and Tradify.

### 6. Layout before matching

Before columns are matched:

- The header row is found: the first row that looks like labels with data below it.
  Rows above it are reported and skipped.
- Rows that look like totals (first cell says "Total", or the values add up the rows above)
  are reported and left out.
- Blank spacer columns are ignored.

### 7. Saved matchings become profiles

A confirmed matching is saved as a **profile**: the file's headers, the column for each
field, the date order and the status words. The next file with the same headers is
recognised like a Jobber or Tradify export, and the user can still review it.

Profiles stay on the user's computer (ADR 0001). They hold column names and settings, never
the data itself.

## Consequences

**Good**

- Any spreadsheet can use the same reports as Jobber and Tradify.
- Users see why each column was suggested, so a wrong suggestion is easy to spot.
- The checks that catch Jobber's and Tradify's mistakes protect home-made files too.

**Costs**

- More to build than either tool's approach: value scanning, arithmetic checks and a
  confirmation screen.
- The first upload of a new layout takes the user a minute to confirm.
- Status words and date order sometimes need a question the user has to answer.

## Not decided here

- Reading Excel files directly (a separate ADR on choosing a safe library).
- Matching for quotes, jobs and customers. They follow the same rules once invoices work.
- The design of the confirmation screen.
