# Jobber client import and export: findings

- Date: 2026-11-02
- Source: Jobber developer test account (UK, Europe/London, VAT 20%)
- Data: 30 fake clients imported by CSV, then exported by CSV

## Export format

- File name pattern: `Jobber Clients 1 of 1.csv`. Large exports may be split into several files.
- Dates are `DD/MM/YYYY` (e.g. `02/11/2026`), even though the app displays `Nov 2, 2026`.
- Each client has a stable `J-ID` (e.g. `158087529_163990362`). Use it to identify clients, not the display name.
- `Display Name` is the person or the company, depending on `Is Company?`.
- Booleans are lowercase: `true` / `false`.
- Empty values appear as both `""` and nothing (`,,`).
- Address headers use `Service ...` and `Billing ...`, and say `Zip code` even on UK accounts.
- Phone and email headers are plural (`Main Phone #s`, `E-mails`), so cells may hold several values.

## Data quality inside Jobber

1. Postcodes are stored exactly as typed (`wn71ef`, `wn5 8yz`).
2. Country is stored as typed (`UK` and `United Kingdom` both appear).
3. Text can be stored in phone fields (`Evenings` in `Mobile Phone #s`).
4. The import silently dropped mapped columns: a "Customer Since" date and a "Town" column were lost with no warning.
5. The import's automatic column matching guessed confidently wrong (contact time mapped to a phone field; town mapped to billing while street and postcode went to the property address).

## Rules for TradeReports

- Normalise postcodes (upper case, single space, extract the district such as `WN7`).
- Normalise country names (`UK`, `GB`, `United Kingdom`, `England`).
- Validate values by type, not by column name.
- Identify clients by `J-ID` when present.
- Accept both empty styles and any case of true/false.
- Accept several export files of the same type and warn if one of a numbered set is missing.
- Always report which columns were not used.
- Never force a column match; show confidence and real value previews.
