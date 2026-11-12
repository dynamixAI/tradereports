# TradeReports

Turns the exports from trade job software, and the spreadsheets tradespeople keep themselves, into checked, plain-English business numbers — without your data ever leaving your computer.

> **Status:** early development (pre-release). The engine that reads, checks and reports on the files is built and tested; the web page you use it through is next. Not ready for real use yet.

## The problem

Small trade businesses (plumbers, electricians, heating and repair firms) run their work in job management software such as Jobber or Tradify, or in a spreadsheet they've kept for years. When they need answers the built-in reports don't give, they export CSV files and rebuild the numbers by hand in Excel: who owes what, work finished but not invoiced, how much came in each VAT quarter, which customers matter most.

TradeReports does that work for them, and checks the data first. Testing Jobber and Tradify showed why the checking matters: paid invoices that still show a balance, drafts that look like money owed, customers with the same name merged without asking, and exports with one row per line item so totals repeat.

## What it does

1. **Reads the files** — Jobber and Tradify exports (invoices, quotes, jobs, clients, visits), and home-made spreadsheets as CSV, Excel (.xlsx, .xls) or LibreOffice (.ods).
2. **Works out a home-made sheet** — finds the header row under any titles, leaves out totals, subtotals and notes, and suggests which column is which from the values and the arithmetic, not just the names. You confirm every match.
3. **Suggests repairs, never makes them** — a value in the wrong column, two values swapped, a row shifted by a stray cell, the same customer typed two ways, an amount paid written in a note. Each one comes with its evidence, and nothing changes unless you say yes.
4. **Checks the data** — duplicate invoice numbers, totals that don't add up, impossible dates, missing values, and drafts that may not be real debt.
5. **Links the files** — quotes to jobs to invoices, by reference, not by name.
6. **Shows the key numbers** — money owed and overdue, finished work not yet billed, income by month and VAT quarter, top and lapsed customers, and how healthy the data is.
7. **Explains every number** — which rows went into it, and whether each figure was read from the file, worked out, or is unknown. An unknown amount is never shown as zero.
8. **Remembers your answers** for the same spreadsheet next time, so you're only asked about what's new.

## Privacy and security

- Everything runs **in your browser**. Files are never uploaded to a server.
- No accounts and no tracking of file contents.
- A strict Content Security Policy blocks the page from sending data anywhere, except anonymous totals to our GoatCounter address.
- How saved answers are kept on your device will be decided with the web app, so that nothing about your customers is stored without your say-so.
- See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Supported files

| Source                                        | Status                                                          |
| --------------------------------------------- | --------------------------------------------------------------- |
| Jobber                                        | Engine built: invoices, quotes, one-off jobs, visits, clients   |
| Tradify                                       | Engine built: invoices, quotes, jobs, customers                 |
| Your own spreadsheet (CSV, .xlsx, .xls, .ods) | Engine built: you confirm the columns once, and it's remembered |
| Xero, QuickBooks                              | Planned                                                         |

TradeReports is an independent project and is not affiliated with or endorsed by Jobber, Tradify or any other software vendor.

## How it's tested

- Real exports from Jobber and Tradify test accounts, filled with fake data.
- Pattern tests written from scratch for each rule, including cases that must _not_ be changed.
- Hundreds of generated spreadsheets with known true totals and mistakes planted at known places.
- Blind rounds: spreadsheets made by someone else with a separate answer key, checked by hand before each feature was merged. The last round is kept as a regression suite in CI.
- Excel, .xls and .ods files saved by LibreOffice must give the same invoices as their CSV.

## Tech stack

- TypeScript, React and Vite
- Vitest for tests
- ESLint and Prettier for code quality
- Papa Parse for CSV, SheetJS Community Edition for Excel (pinned in `vendor/`, see ADR 0008)
- GitHub Actions for CI, Dependabot and CodeQL for security checks

## Project structure

```
packages/core   the engine: read, clean, suggest, repair, link, check, report (built)
packages/data   repositories: the only code that stores or fetches data (planned)
apps/web        the browser app (next)
apps/api        reserved for a future server
docs/adr        architecture decision records
docs/research   what testing Jobber and Tradify showed
vendor          pinned third-party packages
```

## Roadmap

- [x] Project setup: tooling, CI and security checks
- [x] Jobber and Tradify: converters for every export, with their gaps handled
- [x] Linking and data checks
- [x] Reports: money owed, unbilled work, income and VAT quarters, customers, data health
- [x] Home-made spreadsheets: layout, column suggestions, questions and conversion
- [x] Repair suggestions (ADR 0007)
- [x] Saved answers for the same spreadsheet
- [x] Excel and LibreOffice files (ADR 0008)
- [ ] Web interface
- [ ] Hardening and first public release

## Contributing

Work happens on branches with pull requests into `main`. Every pull request must pass formatting, linting, type checks and tests.

## Licence

To be decided.
