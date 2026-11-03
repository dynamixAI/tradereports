# Problem discovery and market research

- Dates: 30 October – 2 November 2026
- Author: Pius Ajamma (DynamixAI)
- Status: Complete for version 1 decision; open questions listed at the end

## 1. Why this research was done

Earlier projects started from what I thought people wanted. This time the aim was to start from problems people actually describe, check whether they are already solved, and only then decide what to build.

## 2. Method

| Source                                  | How it was used                                                                                                                | Strengths                                                                  | Weaknesses                                                                       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| LinkedIn                                | Post searches for complaint phrases, then a second pass filtering out sellers and looking for workarounds people were proud of | Shows where money is already being spent; easy to find people by job title | Most posts come from agencies, VAs and software vendors selling a fix            |
| Reddit                                  | Read via web search and by pasting threads manually (the browser extension blocks Reddit)                                      | People describe problems in their own words                                | Personalised results skew towards job hunting; many threads are jokes or venting |
| Review sites (G2, Capterra, Trustpilot) | Read 1–3 star themes for software in each industry                                                                             | Shows what paying users still struggle with                                | Summaries, not full reviews; some vendors publish biased comparisons             |
| Vendor documentation                    | Checked export formats and API access                                                                                          | Facts rather than opinions                                                 | Docs can be out of date; must confirm with real exports                          |

Rules applied:

- Ignore posts whose main purpose is selling.
- Treat a problem as stronger when it appears in several unrelated places.
- Look for implied pain: things people built or tolerated, not just complaints.
- Before building, check whether a tool already solves it.

## 3. What was found

### LinkedIn, first pass (mostly sellers)

- Reporting the same work to several funders in different formats (charity sector).
- Retyping data between systems: orders, PDFs, weekly reports rebuilt in Excel.
- UK small business admin overload.
- Tradespeople chasing quotes and payments (already a crowded market).

### LinkedIn, second pass (practitioners only)

- A People Operations Manager built a desktop app that turns a recruiting system's weekly export into the report leadership wants. Most of the work was cleaning messy exports (title rows, duplicates, ambiguous dates).
- An insurance accountant shared the Excel techniques he needs to survive monthly reconciliations (Power Query, XLOOKUP, macros).
- A senior data analyst noted that managers never ask for dashboards; they ask whether a number is right, why it changed and who to call.
- A doctor built a rota tool because hospital rotas live in clunky spreadsheets.
- A nonprofit COO built a free form plus spreadsheet for maintenance requests because no budget existed for a proper system.

### Reddit and forums

- An accountant spending six hours every Friday matching purchase orders, invoices and delivery receipts.
- Owners copying QuickBooks or Xero reports into spreadsheets every week.
- A seller reconciling Shopify and Amazon orders by hand every morning.
- A nonprofit accountant spending 6–8 hours a month rebuilding funder reports in Excel.

### Everyday UK life threads (r/AskUK, r/AskBrits)

- NHS dentist access was the top complaint, but the root cause is a shortage with waitlists, not a findability problem. Dropped.
- Splitting shared grocery orders fairly; partly solved by Splitwise.
- Losing track of contract renewals and mid-contract price rises; partly solved by budgeting apps.
- Job application tracking was already solved (Huntr, Teal).

## 4. Leads and verdicts

| Lead                                                  | Evidence strength                | Already solved?                 | Verdict                          |
| ----------------------------------------------------- | -------------------------------- | ------------------------------- | -------------------------------- |
| Exporting data and rebuilding the same report by hand | Strong, many independent sources | Partly, depends on the software | Pursue, narrowed (see section 7) |
| Charity funder reporting                              | Medium, mostly consultants       | Some tools exist                | Keep as a later option           |
| Messages scattered across apps                        | Weak to medium                   | Unified inboxes exist           | Watch                            |
| Splitting shared costs                                | Medium                           | Splitwise                       | Not now                          |
| Contract renewals and price rises                     | Medium                           | Budgeting apps                  | Not now                          |
| NHS dentist access                                    | Strong pain                      | Not a software problem          | Dropped                          |
| Job application tracking                              | Medium                           | Yes                             | Dropped                          |

## 5. Competitor mapping for the leading problem

| Area                                    | Main tools                                         | Finding                                   |
| --------------------------------------- | -------------------------------------------------- | ----------------------------------------- |
| E-commerce to accounting reconciliation | A2X, Link My Books, Taxomate                       | Mature and well rated. Avoid.             |
| Reports from Xero or QuickBooks         | Syft (now free with qualifying Xero plans), Fathom | Largely solved and cheap. Avoid.          |
| General app-to-spreadsheet connectors   | Coupler.io                                         | Works well; only minor complaints. Avoid. |

Conclusion: the common versions of the problem (accounting and e-commerce data) are served. The gap is more likely in industry-specific software with weak reporting and no big connectors.

## 6. Industry software review scan

| Industry                 | Software              | Reporting and export signal                                                                              | Verdict                |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| Trades and field service | Jobber, Tradify       | Reviewers repeatedly cite limited, inflexible reporting; deeper analysis means exporting to spreadsheets | Strongest              |
| Gyms and studios         | Glofox, Mindbody      | Shallow reports and in some cases data cannot be exported at all                                         | Avoid (no data access) |
| Recruitment              | Bullhorn              | Mixed; third-party plugin market already exists                                                          | Medium                 |
| Charity case management  | Charitylog, Lamplight | Complaints mainly from a competitor's comparison pages                                                   | Unreliable evidence    |
| Salons                   | Phorest, Fresha       | Mixed                                                                                                    | Weak                   |
| Care homes, schools      | Various, Arbor        | Little evidence; Arbor offers BI connections                                                             | Weak                   |

## 7. Data access check (trades software)

| Software  | Access                                                                             | Verdict  |
| --------- | ---------------------------------------------------------------------------------- | -------- |
| Jobber    | Public GraphQL API, developer centre, 90-day test accounts, CSV exports per report | Best     |
| ServiceM8 | Public API with owner-generated keys                                               | Good     |
| Fergus    | Public API with personal tokens, thin docs                                         | Usable   |
| Tradify   | No public API; CSV downloads of reports and exports                                | CSV only |
| Commusoft | API not publicly documented                                                        | Hard     |

A third-party explainer on Jobber exports reports: one CSV per report, no bulk export, no report joining record types, and nothing scheduled. Businesses past about five crews paste exports into workbooks of lookups to rebuild revenue by crew, jobs done versus invoiced, and who owes what.

## 8. Decision

Build **TradeReports** version 1: a free, browser-only tool for small UK trade businesses that turns Jobber (then Tradify) CSV exports into checked, plain-English numbers, with no data leaving the user's computer.

Why this choice:

- Strong, repeated evidence that people rebuild these reports by hand.
- Specific gap: exports that need cleaning and linking, which the software does not do.
- Data can get out (CSV, and an API later).
- Fits my skills: data cleaning, linking, checking and reporting.
- A privacy-first, browser-only design suits small businesses wary of uploading client data.

Delivery approach: rather than cold messaging owners for interviews, release a small free tool and measure what people actually use.

## 9. Risks and open questions

- Crew Insight, a reporting app in Jobber's marketplace, may already cover these numbers. To check.
- Jobber's own Report Scheduler emails reports automatically, weakening the "manual export" point. Lead with cleaning, linking and checking instead.
- Jobber already tracks a "requires invoicing" job status, so the "work not yet invoiced" number must add value (total value, age).
- Willingness to pay may be low (trade Excel templates sell for about £8–15).
- The UK share of Jobber users is unknown; Tradify may be as common among small UK firms.

## 10. Lessons on process

- Most online content about problems is written by people selling solutions. Useful for spotting markets, not for understanding users.
- Workarounds people built themselves are the strongest evidence of real pain.
- Always check whether a problem is already solved before building.
- Real data beats assumptions: test-account experiments overturned several guesses (see `jobber-client-import-export.md`).

## Sources

- Jobber reviews summary, Capterra: https://www.capterra.com/p/127994/Jobber/reviews/6220386/
- Tradify reviews analysis: https://checkthat.ai/brands/tradify/reviews
- How to export data from Jobber, Adeocode: https://www.adeocode.com/blog/how-to-export-data-from-jobber/
- Jobber Developer Center: https://developer.getjobber.com/docs/getting_started/
- Jobber reports basics (Report Scheduler): https://help.getjobber.com/en/articles/reports-basics/
- Jobber community, reports discussions: https://community.getjobber.com/tag/reports
- Glofox reviews summary: https://vibefam.com/what-glofox-users-actually-say-on-capterra-2026/
- Syft for Xero: https://apps.xero.com/uk/app/syft/reviews
- A2X and Link My Books comparison, Capterra UK: https://www.capterra.co.uk/compare/173271/184768/a2x-accounting/vs/link-my-books
- Coupler.io reviews, G2: https://www.g2.com/products/coupler-io
- Tradify CSV downloads: https://help.tradifyhq.com/hc/en-us/articles/44122008198937-Download-Reports-and-Exports-in-a-CSV-file-type
- ServiceM8 authentication: https://developer.servicem8.com/docs/authentication.md
- Fergus API report card: https://supergood.ai/api-report-card/fergus
- Commusoft API report card: https://supergood.ai/api-report-card/commusoft
