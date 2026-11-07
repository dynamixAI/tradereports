# ADR 0005: Canonical data model and source profiles

**Status:** Accepted
**Date:** 6 November 2026

## Context

TradeReports reads exports from more than one job management tool. Testing
Jobber and Tradify with fake data showed that the same idea is stored in
different shapes, under different names, and sometimes not at all:

- Jobber report dates look like `Nov 03, 2026`; Tradify uses `2026-11-03`.
- Jobber writes `-` for empty; Tradify leaves cells blank.
- Tradify exports one row per line item and repeats document totals on every
  row. Summing the Total column double counts.
- Tradify's invoice export has no status column. Drafts cannot be told apart
  from unpaid invoices.
- Neither tool states VAT inclusive or exclusive in a column on every file.
- Tradify's quote export labels the selling price "Line Unit Price" and the
  cost "Line Unit Sell Price".
- "Approved" means "the customer said yes" in Jobber and "ready to send" on
  Tradify's screen.
- Jobber keeps a full balance on imported paid invoices.
- Tradify links quotes and invoices only through jobs, and refers to customers
  by name, which is not unique.

See `docs/research/` for the full findings.

If reports are built directly on each tool's columns, every report has to know
every tool's quirks, and a mistake in one place gives a confident wrong number.

## Decision

### 1. One canonical model

Every source is converted into the same set of records before any check or
report runs. Reports only ever read the canonical model.

| Record   | Holds                                                                    |
| -------- | ------------------------------------------------------------------------ |
| Customer | name, contact, emails, phones, address                                   |
| Quote    | number, customer, dates, status, tax mode, totals, lines, linked jobs    |
| Job      | number, customer, address, categories, dates, linked quotes and invoices |
| Invoice  | number, customer, dates, status, tax mode, totals, paid, due, lines      |
| Payment  | invoice, amount, date, method                                            |
| Line     | description, quantity, unit price, unit cost, tax rate, net amount       |

Every record also carries its `businessId` (ADR 0002) and a `source` block:
the tool, the file, and the row numbers it came from, so any number can be
traced back to the user's file.

### 2. Values and units

- Money is stored in integer pence (`parseMoney`). No floating point totals.
- Each document stores net, tax and gross separately, plus its `taxMode`:
  `inclusive`, `exclusive` or `unknown`.
- Quantities are numbers (Tradify exports `1.0000`).
- Dates are calendar dates (`YYYY-MM-DD`); times are kept only where the source
  gives them, without guessing a time zone.
- Document numbers and IDs are text, never numbers (`QT00001`, `0042`).
- Postcodes and countries keep the raw value and a cleaned value
  (`wn71ef` → `WN7 1EF`; `UK` → `United Kingdom`).

### 3. Stated, derived or unknown

Many fields can be read from the file, worked out from other fields, or not
known at all. Each such field records which:

- `stated`: read directly from a column.
- `derived`: worked out by a named rule, for example invoice status from paid,
  due and due date, or tax mode from subtotal, tax and total.
- `unknown`: neither possible. Stored as `null`, never guessed.

The user sees which numbers rest on derived or unknown values. Unknown never
silently becomes zero.

### 4. Canonical statuses

| Record  | Statuses                                                                     |
| ------- | ---------------------------------------------------------------------------- |
| Quote   | `draft`, `awaiting_response`, `accepted`, `declined`, `cancelled`, `unknown` |
| Invoice | `draft`, `unpaid`, `overdue`, `paid`, `cancelled`, `unknown`                 |

Each source maps its own words to these. A source word with no mapping becomes
`unknown` and is reported, not forced into the nearest status.

### 5. Linking

- Link by the source's own IDs and numbers (Jobber J-ID, Tradify Id, document
  numbers).
- Matching by name is a last resort, flagged as a warning, and never used when
  two customers share a name.
- Links can be one-to-many: one quote can have several invoices.
- Records that link to nothing (an invoice with no job) are reported, not
  dropped.

### 6. Source profiles

Each tool and file kind has a profile, kept as data and tested against the
fixtures. A profile holds:

- **Detection:** the header set that identifies the file (for example
  `Tradify Id` + `Customer Name` = Tradify customers).
- **Column map:** source header → canonical field.
- **Value rules:** date format, empty markers, Yes/No words, status dictionary,
  tax rate labels.
- **Shape:** one row per document, or one row per line with repeated totals
  (group by document number before summing).
- **Known quirks with a check:** for example, verify which column is price and
  which is cost by testing `quantity × price = line amount`; if neither fits,
  stop and ask.

A file that matches no profile goes to the manual column matching screen, which suggests matches only when the values support them (for example "98% of values are UK mobile numbers") and lets the user confirm or leave a column unmatched. The
user's matches can be saved as a new profile.

### 7. Checks before numbers

After conversion, and before any report, a check step runs and lists issues in
plain English with row numbers: duplicate names, totals that do not add up,
unknown statuses, missing links, drafts that may be counted as owed, and so on.
Reports show their numbers with any related issues beside them.

## Consequences

**Good**

- Reports are written once and work for every supported tool.
- Adding a new tool means writing a profile and fixtures, not new reports.
- Every number can be traced back to rows in the user's file.
- Quirks are tested, so a tool changing its export breaks a test, not a
  user's figures.

**Costs**

- A conversion layer to build and test before the first report.
- Some fields will often be `unknown` (for example Tradify draft invoices), and
  the interface must explain that clearly.
- Profiles need updating when tools change their exports.

## Not decided here

- Storage of the model in a database (ADR 0003).
- How users fix or confirm issues in the interface.
- Which reports come first.
