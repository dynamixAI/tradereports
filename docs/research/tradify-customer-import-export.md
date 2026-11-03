# Tradify: customer import and export

**Date:** 3 November 2026
**Account:** Tradify free trial (Plus plan features), UK settings, VAT 20% exclusive
**Data:** fake clients only (`example.com` emails, `07700 900xxx` numbers)

## Why we tested this

TradeReports reads exports from job management software. Before trusting any
number built from a Tradify file, we need to know how Tradify stores what users
put in, and what it quietly changes or loses on the way.

We used the same files we imported into Jobber, so the two tools can be compared.

## Method

1. Imported `jobber-test-clients.csv` (25 rows, Jobber-style headers) through
   Customers → Options → Import Customer From File.
2. Imported `jobber-test-clients-odd-columns.csv` (5 rows, unusual headers).
3. Opened customer records to check what was stored.
4. Exported all customers to CSV and compared the result with the input.

## Findings: import

### 1. No suggested column matches

Every column must be dragged by hand. Tradify suggested nothing, even for
near-identical names such as `E-mail Address` → `Email Address` or
`City` → `Physical Address City`.

During the test, a phone column was dropped into the wrong field and nothing
flagged it. Mistakes like this will appear in real users' data.

### 2. One column per field, no joining

Dropping `Last name` onto a field that already held `First name` replaced it
rather than joining them. Tradify has `Customer Name` and `Contact Name` but no
first/last name split, so anyone moving from Jobber has to merge the names in a
spreadsheet first or accept half a name.

### 3. Duplicate names are silently merged (data loss)

Tradify matches customers by **Customer Name**. With `Last name` used as the
Customer Name, three surnames appeared twice in the file:

| Customer Name | Kept  | Lost                                    |
| ------------- | ----- | --------------------------------------- |
| Mock          | Will  | Frank (and his company, Frank Mock Ltd) |
| Example       | Xena  | Dev                                     |
| Sample        | Yusuf | Ben                                     |

- 25 rows went in, 22 customers came out.
- The **later row overwrote the earlier one completely**, including custom fields
  (Frank's `TRUE` company flag became Will's `FALSE`).
- This happened **within one file**, not only against existing customers.
- No warning, no error, and the audit line only says "Entered By … on … at …".
  Nothing records that a merge happened.

### 4. One bad row rejects the whole file

With `Business` as the Customer Name, 4 of 5 rows had a blank required value.
The import failed with:

> 1 Error occurred for the following reasons:
> The file format is incorrect. The Business field cannot be empty.

- Nothing was imported, including the one valid row.
- The message says "file format", which is misleading. It does not say which rows failed.
- Jobber, by contrast, gives a per-row import log.

### 5. Values are stored as typed

- Postcodes keep their original case and spacing: `wn71ef`, `wn5 8yz`.
- Country is not standardised: `UK` and `United Kingdom` both exist in one account.
- Custom fields store everything as text. `28/06/2023` is not a date.
- There is no "customer since" field, so that history ends up in free text.

### 6. Defaults are added silently

Every imported customer gets Pricing Level `Standard Markup`, Tax `Exclusive`,
Document Theme `Standard Theme` and delivery methods `Link With Tracking`.

### 7. Extra columns

There are four `Custom` text fields for columns with no proper home (we used
them for Tags, Is Company?, Customer Since and Comments). Columns not matched
are dropped without a report.

## Findings: export

Fixture: `packages/core/tests/fixtures/tradify/customers-export.csv`

| Item              | What we saw                                                   |
| ----------------- | ------------------------------------------------------------- |
| Encoding          | ASCII, no BOM                                                 |
| Line endings      | Windows (CRLF)                                                |
| Quoting           | Only some cells: Email Address, Tradify Id, Created On        |
| Columns           | 33; names match the import field names exactly                |
| Unique ID         | `Tradify Id` (UUID), stable across exports                    |
| Address           | Returned split into parts, though shown as one line on screen |
| Empty values      | Truly blank (Jobber uses `-`, `""` or blank)                  |
| Created On        | `2026-11-03 21:35`: no seconds, no time zone                  |
| Yes/No values     | `Archived` uses `No`; custom fields kept our `TRUE`/`FALSE`   |
| Misleading header | `Amounts` holds the tax method (`Exclusive`), not money       |
| Row order         | Alphabetical by Customer Name                                 |
| Personal data     | The user's name from the audit line is **not** exported       |

The three merged customers (Frank, Dev, Ben) are absent from the export, and
nothing in the file shows they ever existed.

## Tradify vs Jobber

| Behaviour               | Tradify                            | Jobber                                           |
| ----------------------- | ---------------------------------- | ------------------------------------------------ |
| Suggests column matches | Never                              | Yes, sometimes confidently wrong                 |
| Joins name columns      | No                                 | Has first/last fields                            |
| Duplicate names         | Silently merged, later row wins    | Both imported                                    |
| One invalid row         | Whole file rejected, vague message | Per-row log                                      |
| Postcode / country      | Kept as typed                      | Kept as typed                                    |
| Unmatched columns       | Dropped; 4 custom text fields      | Dropped                                          |
| Customer ID in export   | `Tradify Id` (UUID)                | J-ID                                             |
| Date in export          | `2026-11-03 21:35`                 | `Nov 03, 2026` (reports), `DD/MM/YYYY` (clients) |
| Empty values            | Blank                              | `-`, `""` or blank                               |

## What this means for TradeReports

1. **Recognise the source by its headers.** A file containing `Tradify Id` and
   `Customer Name` is a Tradify customer export.
2. **Link records by `Tradify Id`, never by name.** Names are not unique, and
   Tradify itself has shown what goes wrong when they're treated as unique.
3. **Pre-import check (possible feature):** before a user imports into Tradify,
   list duplicate names, blank required cells (with row numbers), and columns
   that will be dropped.
4. **Count check:** compare row counts between the file a user imported and the
   export they get back, and explain any difference.
5. **Clean before grouping:** standardise postcodes (upper case, one space) and
   countries before any area or location report.
6. **Don't trust field names alone:** check what values look like (for example,
   `07…` is a UK mobile number even when it sits in `Phone Number`).
7. **Treat custom fields as text** unless the user confirms a type.
8. **Read CRLF, partial quoting and both Yes/No styles.**

## Open questions

- Does the Email field accept several addresses separated by commas? The form
  shows "Separate with commas" near it. To check in a later export.
- Are `Created On` times in the account time zone? The account was set to
  Dublin; that matches London in winter but not in all cases.
- Can Lite and Pro plans export customers? The trial only shows Plus features.
- How do quote, job and invoice exports link back to `Tradify Id`?
