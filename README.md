# TradeReports

Turns the exports from trade job software into checked, plain-English business numbers — without your data ever leaving your computer.

> **Status:** early development (pre-release). Not ready for real use yet.

## The problem

Small trade businesses (plumbers, electricians, heating and repair firms) run their work in job management software such as Jobber or Tradify. When they need answers the built-in reports don't give, they export CSV files and rebuild the numbers by hand in Excel: who owes what, work finished but not invoiced, how many quotes turn into paid jobs, which areas are growing.

TradeReports does that work for them, and checks the data first.

## What version 1 will do

1. **Read the exports** — drop in the invoices and quotes CSVs (visits optional).
2. **Check the data** — match columns, clean dates, £ amounts and postcodes, flag duplicates and missing values, and compare totals with the source software.
3. **Link the files** — connect quotes to jobs to invoices, and show anything that doesn't match.
4. **Show the key numbers as sentences** — for example: "£6,420 unpaid, £2,100 is 60+ days overdue".
5. **Explain every number** — how it was calculated and which rows went into it.
6. **Let you go further** — build your own table, or download clean, linked data to Excel.

## Privacy and security

- Everything runs **in your browser**. Files are never uploaded to a server.
- No accounts, no tracking of file contents, no client data in links or browser storage.
- A strict Content Security Policy blocks the page from sending data anywhere.
- See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Supported software

| Software       | Status                             |
| -------------- | ---------------------------------- |
| Jobber         | Planned for version 1              |
| Tradify        | Planned for version 1              |
| Other software | Planned: map your own columns once |

TradeReports is an independent project and is not affiliated with or endorsed by Jobber, Tradify or any other software vendor.

## Tech stack

- TypeScript, React and Vite
- Vitest for tests
- ESLint and Prettier for code quality
- GitHub Actions for CI, Dependabot and CodeQL for security checks

## Project structure

```
packages/core   pure logic: parse, clean, link, check, insights
packages/data   repositories: the only code that stores or fetches data
apps/web        the browser app
apps/api        reserved for a future server
docs/adr        architecture decision records
```

## Roadmap

- [ ] Project setup: tooling, CI and security checks
- [ ] Core engine: column matching and cleaning
- [ ] Linking and data check
- [ ] Prebuilt insights
- [ ] Web interface
- [ ] Hardening and first public release

## Contributing

Work happens on branches with pull requests into `main`. Every pull request must pass tests, linting and type checks.

## Licence

To be decided.
