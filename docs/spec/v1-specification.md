# TradeReports — Version 1 Specification

Oct 31, 2026 · DynamixAI

> Snapshot of the live spec, taken 8 November 2026. The live version, with its two diagrams, is the Claude doc: https://claude.ai/artifact/HirdWKQq5eucT7KpGWeqSm

## Summary

TradeReports turns the exports small trade businesses download from their job software (Jobber, Tradify), or the Excel spreadsheets they keep themselves, into checked, plain-English numbers they currently rebuild by hand in Excel. Version 1 is a free, browser-only tool: drop in an export or a spreadsheet, see a data check, then the key numbers and the lists behind them.

**The problem.** Jobber exports one CSV report at a time, with no report that joins record types, so owners paste exports into workbooks of SUMIFS and VLOOKUP to get revenue by crew, jobs done vs invoiced, and who owes what ([Adeocode](https://www.adeocode.com/blog/how-to-export-data-from-jobber/)). Capterra reviewers consistently flag Jobber's limited, inflexible reporting ([Capterra](https://www.capterra.com/p/127994/Jobber/reviews/6220386/)). Jobber's own help tells users to export quotes to a spreadsheet to calculate their conversion rate ([Jobber Help](https://help.getjobber.com/hc/en-us/articles/18551924609815-Quotes-Report)).

**What that looks like.** Tradify users and spreadsheet keepers face the same rebuild. Picture a Sunday night: a plumber with four vans has three exports open beside a spreadsheet he has kept since 2019, and he wants one answer, who owes him money. The software says an invoice is still owed; he knows it was paid in cash in March. A draft he never sent shows as 12 days late. The same customer is "Dave Smith" on one invoice and "D. Smith" on the next, so their money sits in two places. Two hours later he has a number he doesn't trust, and he still hasn't chased anyone. (An illustrative example, built from gaps that testing the real exports showed.)

**The promise.** The numbers you were rebuilding by hand, done for you and checked, without your data leaving your computer.

**What makes it more than a dashboard.** It cleans the exports, links files Jobber keeps apart, checks the data and says what is wrong, calculates the numbers, explains each one, and hands back clean data in Excel.

## Update, 8 November 2026: what is built

As of Nov 8, 2026, the engine behind version 1 is built and tested (1,836 automated tests, all passing); the web page is next. The plan below is the 31 October version; the table shows where the build went further or differently.

| Area                | Plan on 31 October                     | Built by 8 November                                                                                                                                                                                                                                   | Why it changed                                                                                  |
| ------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sources             | Jobber only; Tradify "later"           | Jobber and Tradify, every export (invoices, quotes, jobs, clients, visits), plus home-made spreadsheets as CSV, .xlsx, .xls or .ods                                                                                                                   | Many small trades keep their own sheet, and testing Tradify cost little once the engine existed |
| Column matching     | Known header names, then a dropdown    | Suggestions from the values and the arithmetic (net + VAT = total), not just the names; the user confirms every match ([ADR 0006](https://github.com/dynamixAI/tradereports/blob/main/docs/adr/0006-column-matching.md))                              | Home-made headers range from "net\_val" to "Col E"; names alone fail                            |
| Repairs             | Not planned                            | Proposed, never applied: values in the wrong column, swapped or shifted values, the same customer typed two ways, amounts paid written in notes ([ADR 0007](https://github.com/dynamixAI/tradereports/blob/main/docs/adr/0007-repair-suggestions.md)) | Blind test files were full of these slips                                                       |
| Excel               | Download clean data only               | Reads .xlsx, .xls and .ods with SheetJS, pinned in the project ([ADR 0008](https://github.com/dynamixAI/tradereports/blob/main/docs/adr/0008-excel-reader.md)); the clean-data download is still to build                                             | Saving as CSV first is a step users get wrong                                                   |
| Remembered settings | Column matches only, never client data | Saved answers per spreadsheet, so next month only asks what is new; the app will ask before saving, and leave customer names out unless the user ticks to include them                                                                                | Answers can include customer names ("Davod Smith is David Smith")                               |
| Prebuilt numbers    | Six, listed below                      | Built: money owed and overdue, finished work not yet invoiced, income by month and VAT quarter, top and lapsed customers, data health. Not built yet: quote win rate, quote to cash, areas, revenue by crew                                           | The first four answer "what is wrong and who to chase"                                          |

Every number keeps how it is known: read from the file, worked out (with the rule), or unknown with a reason. An unknown amount is never shown as zero.

## What testing Jobber and Tradify showed

Real exports from test accounts, filled with fake data, showed that neither tool's exports can be trusted as they come. Each gap is worked around in the converter or flagged in the data check; details are in the project's `docs/research` notes.

| Tool    | Gap found                                                                      | Why it matters                                                      |
| ------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Jobber  | Paid invoices still show their full balance                                    | "Who owes what" from Balance alone would count paid invoices        |
| Jobber  | A draft invoice can show "Late by"                                             | Drafts look like overdue debt                                       |
| Jobber  | Money headers say "($)" on a UK account                                        | Header names can't be relied on for currency                        |
| Jobber  | Every "Marked paid date" was the import date                                   | Payment dates are unreliable, so cash-basis VAT can't be worked out |
| Jobber  | A quote's "Subtotal" is before discount; an invoice's "Pre-tax total" is after | The same word means different amounts in different files            |
| Jobber  | The jobs report left out job 1                                                 | Exports can be incomplete without saying so                         |
| Tradify | Customers with the same name are merged on import, without asking              | Money ends up on the wrong customer                                 |
| Tradify | One blank cell rejects a whole import file                                     | A small slip blocks everything                                      |
| Tradify | Exports have one row per line item, so invoice totals repeat                   | Adding up the rows counts invoices several times                    |
| Tradify | The invoice export has no status column                                        | Drafts look like money owed                                         |
| Tradify | No column says whether prices include VAT                                      | It has to be worked out from how the totals add up                  |
| Tradify | The quote export swaps the price and cost labels                               | Profit would come out wrong                                         |
| Tradify | Quotes link to invoices only through jobs                                      | Quote to cash needs the jobs export too                             |

The testing also answered two of the open questions further down: UK Jobber accounts show "($)" in money headers, and Jobber writes dates as "Nov 03, 2026".

## Who it is for

Version 1 targets UK trade and repair businesses with roughly 3 to 15 staff that run on Jobber or Tradify, or on a spreadsheet of their own.

- **Primary user:** the owner or office manager who rebuilds reports in Excel each week or month.
- **Secondary user:** an in-house or freelance data analyst or bookkeeper working for that business.
- **Their situation:** Jobber runs the day-to-day work, but anything beyond basic reports means exporting CSVs and rebuilding the numbers by hand.
- **What they want in 10 seconds:** what is wrong, and who to chase.

## Scenario: a plumbing repairs company

A data analyst at a small plumbing repairs company answers five questions from two Jobber exports: the invoices report and the quotes report, all columns.

| Question                            | Data used                                                                                | How it is worked out                                                          | What they see                                                                                           | Prebuilt or custom                            |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1. Which clients had a discount?    | Invoices: Client name, Discount, Total, Issued date                                      | Keep invoices with Discount above £0, group by client                         | "14 clients got discounts this quarter, totalling £1,240 (4% of revenue)" + list per client             | Custom table at first; prebuilt if often used |
| 2. Which clients owe money?         | Invoices: Balance, Due date, Client name                                                 | Keep Balance above £0, days overdue from Due date, buckets 0–30 / 31–60 / 60+ | "£6,420 unpaid, £2,100 is 60+ days overdue" + clients sorted by most overdue                            | Prebuilt (default key number)                 |
| 3. Where are we gaining clients?    | Invoices: Service postcode, Client name, Issued date                                     | Postcode district (e.g. WN5), distinct clients this period vs last            | "Growing: WN5 (+6), WN3 (+4)" + table and bar chart                                                     | Prebuilt (Areas view)                         |
| 4. Where are we losing clients?     | Same as question 3                                                                       | Same, sorted by largest fall                                                  | "Shrinking: BL5 (−5), WN1 (−3)"                                                                         | Prebuilt (Areas view)                         |
| 5. What happened to quotes we sent? | Quotes: Client, Status, Sent date, Converted date, Job number; Invoices: Job #s, Balance | Follow each sent quote to job, invoice and payment through job numbers        | "120 sent → 46 won (38%) → 41 invoiced → 33 paid" + lists of unwon quotes and won-but-not-invoiced jobs | Prebuilt (Quote to cash view)                 |

All figures above are illustrative. Questions 3 and 4 show "too few to tell" for areas with fewer than 5 clients, because a change from 2 clients to 1 is not meaningful. Question 5 depends on the quotes export carrying a job number column; if it does not, matching falls back to client name and date and the data check says so.

## How it works

_Diagram: TradeReports data flow (3 inputs, 4 steps, 5 outputs). See the live doc._

Every file passes the same four steps inside the browser, and the check in step 4 is shown before any number appears.

## Inputs

Version 1 reads Jobber and Tradify exports, or one home-made spreadsheet (CSV, .xlsx, .xls or .ods). For Jobber, that is two exports downloaded with "All columns", plus an optional third.

| Export                                                                                         | Columns used                                                                                                                                                                                               | Required?                                     |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| [Invoices report](https://help.getjobber.com/hc/en-us/articles/17291337236247-Invoices-Report) | Invoice #, Client name, Service ZIP/postal code, Created date, Issued date, Due date, Marked paid date, Days to paid, Visits assigned to, Job #s, Status, Line items, Total, Balance, Discount, Tax amount | Yes                                           |
| [Quotes report](https://help.getjobber.com/hc/en-us/articles/18551924609815-Quotes-Report)     | Quote #, Client name, Status, Sent date, Converted date, Total, Job number (to confirm)                                                                                                                    | Yes                                           |
| [Visits report](https://help.getjobber.com/en/articles/visits-report/)                         | Job #, Date, Client name, Assigned to, Total, Time tracked                                                                                                                                                 | Optional (booked-ahead and work-done numbers) |

**Known quirks from Jobber's documentation:**

- "Job #s" can hold several job numbers in one cell, so invoices and jobs are not always one-to-one.
- "Line items" is text with quantity and price in brackets and needs parsing.
- Money column headers show "($)" even on UK accounts (confirmed by testing).
- Users may export only selected columns, so any column can be missing.

**Open item:** done in November: headers, the date format ("Nov 03, 2026") and the currency label were confirmed from real exports.

## Data check and preparation

No number is shown until the files pass a check, and every problem found is shown to the user rather than silently fixed or dropped.

1. **Recognise the file.** Detect whether a file is the invoices, quotes or visits export from its headers.
2. **Match columns.** Suggest which column is which from the header, the values and the arithmetic (net + VAT = total), with the evidence shown; the user confirms every match. With their permission, remember the answers for that spreadsheet, leaving customer names out unless they choose to include them.
3. **Clean values.**
   - Dates: detect DD/MM vs MM/DD from the whole column; flag the file if it stays ambiguous.
   - Money: strip £, $ and commas; brackets become negatives.
   - Rows: drop title rows, footer rows, Jobber's totals line and blank rows, and count them.
   - Duplicates: flag the same invoice or quote number appearing twice.
   - Postcodes: upper-case, fix spacing, take the district (e.g. "wn5 9xx" becomes WN5).
4. **Link files.** Split multi-value "Job #s" cells, then link quotes to invoices by job number. Report how many matched and list the ones that did not.
5. **Show the trust summary.** Rows loaded and skipped with reasons, totals compared with Jobber's own report total, unmatched records, and warnings such as past visit prices that look changed after a price increase ([Jobber Community](https://community.getjobber.com/discussions/insights-reporting/visits-report-bug/2219)).

Example trust summary:

> ✅ 312 invoices loaded · ⚠️ 4 skipped (missing amount) · ✅ Total £48,210 matches Jobber · ⚠️ 9 jobs have no matching invoice (view)

## Prebuilt insights

Version 1 ships six prebuilt numbers, each written as a sentence with its comparison, each with a "How is this calculated?" link showing the formula and the rows used.

| Insight                          | Calculation                                                                       | Needs                              | Caveat shown                                                                         | Default?           |
| -------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ | ------------------ |
| Who owes what                    | Sum of Balance where Balance > 0, grouped by days past Due date: 0–30, 31–60, 60+ | Invoices                           | Uses balance at export time                                                          | Yes                |
| Work not yet invoiced            | Jobs won (from quotes) or visited with no linked invoice; sum of their value      | Quotes, Invoices (Visits optional) | Depends on job-number matching                                                       | Yes                |
| Quote win rate                   | Quotes converted ÷ quotes sent, this period vs last                               | Quotes                             | Excludes drafts never sent                                                           | Yes                |
| Quote to cash                    | Counts at each step: sent → won → invoiced → paid                                 | Quotes, Invoices                   | Matching rate shown                                                                  | Yes                |
| Areas gaining and losing clients | Distinct clients per postcode district, this period vs last                       | Invoices                           | "Too few to tell" below 5 clients; multi-address invoices use earliest job's address | No (in Areas view) |
| Revenue by crew member           | Invoice Total split across "Visits assigned to" names                             | Invoices                           | Shared invoices split equally unless the user picks another rule                     | No                 |

Periods default to this month vs last month; the user can switch to week, quarter or a custom range.

## When the answer is not prebuilt

Three layers cover questions the prebuilt numbers do not, from quickest to most flexible.

1. **Build-your-own table.** Pick a measure, a grouping and filters.
   - Measures: total invoiced, total unpaid, total discount, number of invoices, number of clients, average days to pay.
   - Group by: client, crew member, postcode district, month, status, service (from line items).
   - Filters: date range, status, discount above £0, balance above £0.
   - Example: "total discount, grouped by client, discount above £0" answers scenario question 1.
2. **Download clean data to Excel.** One workbook with the cleaned invoices, quotes and the linked quote-to-invoice table, plus a sheet of rows skipped and why.
3. **Request a report.** A short form: "What did you want to see?" Requests go to a simple inbox; the most requested become the next prebuilt numbers.

## Screen layout

_Diagram: Version 1 screen, top to bottom (illustrative figures). See the live doc._

An owner glancing for 10 seconds should know what is wrong and who to chase; clicking any number opens the list behind it. Figures shown are illustrative.

## Privacy and technical approach

All processing happens in the user's browser; files are never uploaded, which is stated plainly on the page.

| Part                | Choice                                                           | Why                                                                                       |
| ------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Page                | One static HTML page with JavaScript                             | No server to run or secure; free to host                                                  |
| Hosting             | GitHub Pages                                                     | Free, simple, ties to the dynamixAI GitHub                                                |
| CSV reading         | A CSV parsing library (e.g. Papa Parse)                          | Handles quotes, commas and encodings in messy exports                                     |
| Charts              | A small chart library (e.g. Chart.js)                            | Simple bar and line charts only                                                           |
| Excel download      | SheetJS Community Edition 0.20.3, pinned in the project          | Reads .xlsx, .xls and .ods now, and will build the download, all in the browser           |
| Remembered settings | Browser storage, wrapped so the page works without it            | Saved only if the user agrees; customer names left out unless they choose to include them |
| Analytics           | None that sees file contents; at most an anonymous count of uses | Keeps the privacy promise honest                                                          |

Streamlit is not used, because it sends files to a server and breaks the "never leaves your computer" promise.

## Scope

Version 1 is deliberately small; anything below waits until people are using it.

**Version 1.5 (once used):**

- **Choose what I see:** a checklist of all numbers, defaults pre-ticked, choice remembered.
- **Create dashboard:** pick numbers and tables, lay them out on one page, download as PDF or image to share.
- Profit per job or crew, with wage rates entered by the user and timesheets imported.

**Later (only with clear demand):**

- Connecting to Jobber through its API so no manual export is needed.
- Scheduled reports by email.
- ServiceM8, Xero, QuickBooks and other software (Tradify moved into version 1).
- Accounts, logins and payments.
- An "ask a question" AI box (conflicts with the privacy promise; needs a design that keeps data local).

## Risks, competition and open questions

The biggest unknown is whether an existing Jobber add-on already covers these numbers well.

| Risk                                                                                                                               | Why it matters                                                                                                                              | What to do                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Crew Insight, a reporting app in Jobber's marketplace ([Jobber Community](https://community.getjobber.com/tag/reports))            | May already offer these insights                                                                                                            | Check its features, price and reviews before building                                |
| Jobber's own Report Scheduler emails reports on a schedule ([Jobber Help](https://help.getjobber.com/en/articles/reports-basics/)) | Weakens "someone clicks export every time"                                                                                                  | Lead with linking, checking and plain-English numbers, not scheduling                |
| Custom report services (e.g. Adeocode) and early connectors                                                                        | Same problem, different approach                                                                                                            | Stay free, self-serve and private                                                    |
| Export format changes                                                                                                              | Column matching breaks                                                                                                                      | Keep header variants in one list; the dropdown fallback catches the rest             |
| Low willingness to pay                                                                                                             | Excel templates for trades sell for about £8–15 ([NextGen Templates](https://nextgentemplates.com/home-services-business-template-8-hvac/)) | Version 1 is free; test value first                                                  |
| Few UK Jobber users                                                                                                                | Market may be small in the UK                                                                                                               | Tradify and home-made spreadsheets now widen the market; track where users come from |

**Open questions:**

- [ ] Does the quotes export include a job number column?
- [x] Do UK accounts show £ or $ in headers, and which date format?

  Answered by testing: "($)" even on a UK account, and dates as "Nov 03, 2026".

- [ ] Does Jobber already show a clear "needs invoicing" list? If so, reposition that number.

## Success measures and next steps

Version 1 succeeds if about 10 different businesses use it within 4 weeks of sharing it, and at least 3 come back a second time.

**Signals to watch:** files loaded, return visits, report requests, and replies to community posts.

**Next steps:**

- [ ] Check Crew Insight and other Jobber reporting apps
- [x] Create a Jobber developer test account and add sample jobs, quotes, invoices and visits
- [x] Export real CSVs and confirm headers, dates and currency
- [x] Build fake sample files from those headers for testing
- [ ] Build the data check, then the six prebuilt numbers, then the custom table and Excel download

  By 8 November: the data check, two of the six numbers (who owes what, work not yet invoiced), and three not in the original list (income by VAT quarter, customers, data health). Still to do: quote win rate, quote to cash, areas, revenue by crew, the custom table and the Excel download.

- [ ] Share in UK trades Facebook groups, r/Plumbing, r/electricians and the Jobber community
- [ ] Review usage and requests after 4 weeks; decide go, change or stop
- [ ] Build the web page: drop a file, answer the questions, see the numbers and the rows behind them
