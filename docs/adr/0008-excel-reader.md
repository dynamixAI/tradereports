# 0008. Excel reader

- Status: Accepted
- Date: 2026-11-08

## Context

Most home-made spreadsheets are kept in Excel or LibreOffice, not saved as CSV. Asking a
tradesperson to "Save as CSV" first is a step many will get wrong, and it can change the data:
Excel writes dates in the computer's own format when saving a CSV, which is how US-style dates
get into UK sheets.

Everything after reading the file (layout, suggestions, questions, repairs, conversion) already
works on rows of text. So the Excel reader only has to turn a workbook into those rows, without
losing or changing anything, in the browser, with nothing sent anywhere.

## Options considered

|                     | SheetJS Community Edition                                                                        | read-excel-file                      | ExcelJS                           | Write our own                            |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------ | --------------------------------- | ---------------------------------------- |
| Formats read        | .xlsx, .xls, .ods and more                                                                       | .xlsx only                           | .xlsx only                        | .xlsx only                               |
| Licence             | Apache 2.0                                                                                       | MIT                                  | MIT                               | ours                                     |
| Upkeep              | Released 0.20.3 (July 2024); still being worked on in 2026                                       | Small, single maintainer             | Reported stalled since 2023       | us                                       |
| Size in the browser | Large (around 900 KB), can be loaded only when needed                                            | Small                                | Large (around 250 KB gzipped)     | Small                                    |
| How to install      | From the SheetJS CDN, not npm: the npm copy is stuck at 0.18.5 with two high-severity advisories | npm                                  | npm                               | none                                     |
| Fit                 | Reading values is its main job                                                                   | Reading, with a schema we don't need | Mostly for writing and formatting | Full control, but a lot of work and risk |

Things that matter for us whichever is chosen:

- **Old .xls files** are still common with sole traders who have used the same sheet for years,
  and **.ods** is what LibreOffice saves. Only SheetJS reads both.
- **Dates** are stored in Excel as numbers. The reader must hand them over in one unambiguous
  form, not as the computer's local date format.
- **Formulas**: the value Excel last worked out is stored in the file and is what we want. A
  file made by a program may have no stored value, which must be flagged, not read as empty.
- **Several sheets** in one workbook: the user must choose which one, if it isn't obvious.
- **Merged cells** hold their value in the top-left cell only, which our layout reader already
  handles as title rows and spacer cells.

## Decision

Use **SheetJS Community Edition 0.20.3**, installed from the SheetJS CDN tarball and **kept in the
repository** (`vendor/xlsx-0.20.3.tgz`), pinned to that exact version. Never the npm copy.

How it is used:

1. **Loaded only when an Excel file is opened**, so CSV users never download it.
2. **Each sheet becomes rows of text** and goes through the same path as a CSV, so every check
   and test we have applies to Excel files too.
3. **Dates are read as dates and written as `YYYY-MM-DD`**, which our date reader already reads
   without asking the order. Amounts are written as plain numbers.
4. **Stored formula results are used.** A formula with no stored result is reported as a problem
   with the cell named, never turned into an empty value.
5. **Several sheets:** empty sheets are skipped; if more than one has data, the user is asked
   which one, with each sheet's name and size. A saved profile remembers the answer.
6. **Password-protected files** are reported in plain words; we don't try to open them.

## Consequences

- One reader for .xlsx, .xls and .ods, in the browser, with nothing uploaded.
- Dependabot cannot update a vendored tarball, so upgrades are done by hand: check the SheetJS
  release notes, replace the tarball, and run the full test suite. That suits a pinned,
  security-sensitive dependency anyway.
- The tarball adds 2.3 MB to the repository.
- SheetJS does not pass on which sheets are hidden in .ods files (it does for .xlsx and .xls),
  so a hidden .ods sheet with data is offered as a choice rather than skipped.
- Tests use real .xlsx, .xls and .ods files made in LibreOffice from our regression fixtures, so
  the same answers must come out of a spreadsheet as out of its CSV.
