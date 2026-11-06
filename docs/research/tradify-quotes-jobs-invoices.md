# Tradify: quotes, jobs and invoices

**Date:** 5 November 2026
**Account:** Tradify free trial (Plus plan features), UK settings, VAT 20%
**Data:** fake customers from the customer import test

## Why we tested this

Quotes, jobs and invoices are where the money is. Before TradeReports can say
"who owes you money" or "how many quotes became paid work", we need to know how
Tradify records each stage, how the stages link, and what its exports leave out.

## Import is not possible

Tradify can import customers, sites, suppliers, price-list items and supplier
bills. It cannot import quotes, jobs or invoices
([supported file format](https://help.tradifyhq.com/hc/en-us/articles/24261088558233-Supported-File-Format-for-Importing-Data-into-Tradify)).

A business moving to Tradify starts with no invoice history. Its old figures
stay in the previous tool's exports. A tool that reads both is useful here.

## Method

Four records, each built to test one edge case:

| #   | Customer         | Records                                                               | Tests                             |
| --- | ---------------- | --------------------------------------------------------------------- | --------------------------------- |
| 1   | Test (Alice)     | QT00001 → JB00001 → IV00001 (50%, paid) + IV00002 (remaining, unpaid) | Linking, deposits, VAT inclusive  |
| 2   | Mock (Will)      | QT00002, 10% discount, accepted, no job                               | Discounts, won work not started   |
| 3   | Fake (Emma)      | JB00002 (no quote) → IV00003, backdated, £50 part-paid                | Overdue, part payment, backdating |
| 4   | Fauxname (Bella) | IV00004 draft, 3 × £33.33 + one line with no VAT                      | Rounding, mixed VAT, drafts       |

All four were then exported. Fixtures (real name replaced with "Test Plumber"):

- `packages/core/tests/fixtures/tradify/quotes-export.csv`
- `packages/core/tests/fixtures/tradify/jobs-export.csv`
- `packages/core/tests/fixtures/tradify/invoices-export.csv`

## Findings: in the app

### Quotes

- Numbers use a prefix and padding: `QT00001`. Jobber uses plain numbers. IDs
  must be read as text.
- Statuses: Draft → Awaiting Acceptance → Accepted / Declined / Cancelled. The
  screen badge says "Approved" for Awaiting Acceptance. Jobber uses "Approved"
  to mean the customer said yes. Each source needs its own status dictionary,
  built from export values.
- A new quote defaulted to tax **Inclusive**, although the customer record said
  Exclusive. The same price can mean different totals depending on which screen
  set the tax method.
- Each line has Cost, Markup, Discount and Gross Profit. Gross profit is worked
  out before VAT and after discount. **Markup ignores the discount** (QT00002:
  113.33% markup on the pre-discount price, while gross profit uses the
  discounted price).
- Accepting a quote asks whether to create a job. It is optional.

### Jobs

- Numbers: `JB00001`.
- **Address depends on how the job was made.** A job created directly copied
  the customer's address, contact and custom fields. A job created from a quote
  copied none of them.
- Two categories come pre-filled with different meanings: Category #1 is
  priority (Low / Normal / High), Category #2 is job type (Service /
  Installation / Call-out). Businesses can edit both lists.
- Status shows "Unassigned", which describes staff, not progress.

### Invoices

- Numbers: `IV00001`. A draft also gets a number.
- Four ways to create one: Time & Materials, From Quote, Miscellaneous, From
  Template.
- From a quote there are five options: entire amount, line items, percentage,
  fixed amount, remaining amount. **One quote can have several invoices.**
- "Group quote line items into a single line" is **on by default**. The invoice
  then shows one line such as "50% of quote QT00001". Service detail survives
  only on the quote.
- Tax method follows the quote, not the customer.
- Approved invoices show "Unpaid" even if never sent. A Delivery column records
  Sent / Unsent.
- **Dates can be changed after approval.** An invoice entered on 5 November was
  backdated to 1 October and became Overdue straight away.
- A part-paid overdue invoice stays "Overdue". There is no part-paid status.
- Payments are a list (amount, date, reference, method, account). Paid and Due
  agree with the total, unlike Jobber's export.
- VAT on 3 × £33.33 was £20.00: rounded per line, not per unit.
- The line Tax Rate column is hidden by default. Labels are "20% VAT" and
  "No VAT" (Jobber: "VAT (20.0%)").

## Findings: in the exports

### All three files

- **One row per line item.** Document totals repeat on every line. Summing the
  Total column double counts (invoices: £658.98 instead of £468.99).
- Dates are ISO (`2026-10-01`); Entered On has a time (`2026-11-05 14:31`).
- Quantities have four decimals (`1.0000`).
- "Customer Email Address(es)" can hold several addresses.
- Alice's email is blank in every export, though her customer record has one.
  Cause not yet known.
- Entered By holds the user's full name. Scrub before saving any fixture.
- Quoting is partial: emails, dates, negative numbers and some text are quoted.

### Invoices export

- **No status column.** Paid can be worked out (Due = 0) and overdue too
  (Due > 0 and due date passed). **Drafts cannot be identified**: IV00004 shows
  £189.99 Due with nothing marking it as a draft.
- **No column says inclusive or exclusive.** Subtotal includes VAT on inclusive
  invoices and excludes it on exclusive ones. Inclusive can be inferred when
  Subtotal = Total and Tax > 0.
- No payment dates or methods, so time-to-pay cannot be calculated.
- Has Jobs; no quote number. The quote appears only inside line text.
- Line Number starts at 0 for invoices made from a quote, 1 for others.

### Quotes export

- Has Status (Accepted etc.) and Jobs.
- **Misleading headers:** "Line Unit Price" holds the selling price and "Line
  Unit Sell Price" holds the cost.
- Header names differ from the invoice file: "Quote No" vs "Invoice Number",
  "Customer Name" vs "Customer".

### Jobs export

- **No money columns** (no totals, cost or profit; Jobber's jobs report has
  profit).
- No quote or invoice numbers.
- Address is one joined string, but with latitude, longitude and Google Place
  Id when filled.
- Custom field headers are "Custom #1"; the customer export uses "Custom 1".

## How the files link

| File      | Links to                                          |
| --------- | ------------------------------------------------- |
| Quotes    | Job (`Jobs`)                                      |
| Invoices  | Job (`Jobs`)                                      |
| Jobs      | nothing                                           |
| Customers | nothing (`Tradify Id` is not used in other files) |

Quote ↔ invoice links only through a job. An invoice without a job (IV00004)
links to nothing. Customers are named, not referenced by ID, so the duplicate
name problem from the customer import carries into every file.

## What this means for TradeReports

1. Group line rows by document number before adding totals.
2. Work out invoice status from Paid, Due and Due Date; warn that drafts cannot
   be told apart, and ask the user to confirm unexpected debts.
3. Work out the tax method per invoice before using Subtotal.
4. Link quote → job → invoice; report invoices and quotes that link to nothing.
5. Check "fully billed" by adding all invoices for a quote, not one.
6. Take service detail from quote lines, money from invoices.
7. Calculate margin from discounted amount and cost; do not trust Markup.
8. Check price and cost columns against line totals before trusting headers.
9. Use the customer's address when a job address is empty, and say so.
10. Keep one header list per file type in the Tradify profile.

## Open questions

- Why is Alice's email blank in every export?
- Does Lite or Pro allow these exports? The trial shows Plus features.
- Do cancelled or declined documents appear in exports?
- What do Signed Off By / Signed Off On look like for a completed job?
