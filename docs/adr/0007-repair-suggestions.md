# 0007. Repair suggestions

- Status: Accepted
- Date: 2026-11-08

## Context

Home-made spreadsheets contain values in the wrong place and small typing mistakes. The blind
test rounds found real examples:

- a net amount (£380.00) typed into the phone column, leaving the net column blank
- a phone number and a postcode swapped on one row
- the same customer typed in different ways ("Dave Smith", " dave smith", "Davod Smith")
- a part payment written in a note ("£1,000 paid towards £2,160") instead of a column
- invoice numbers used twice, and totals that do not equal net + VAT

Today these are found and flagged, or not found at all. Tradify shows what not to do: it merges
customers with the same name without asking, and money ends up on the wrong customer.

## Decision

TradeReports **proposes** repairs. It never applies one without the user's confirmation.

### Rules

1. **Nothing changes without confirmation.** A repair is a suggestion with its evidence, shown
   to the user, who accepts or rejects it.
2. **The original is always kept.** Repairs are a layer on top of the file. Any figure that
   uses a repaired cell is marked `derived`, with the repair as its rule ("you moved £380.00
   from Phone to Net on row 13").
3. **Only values that identify themselves are moved.** An email, a UK phone number, a UK
   postcode, an amount with £ or pence, and a date can be recognised wherever they are. Free
   text (names, job descriptions) cannot, so it is never moved on its own. It can only go back
   into a text column as half of a swap, when the other half identifies itself (an email in
   the customer column, with the customer's name in the email column).
4. **Similar repairs can be confirmed together** ("14 names have extra spaces: tidy all /
   review each / leave"). **Name typos are always confirmed one at a time**, as each one is a
   judgement about whether two customers are the same person.
5. **Rejected repairs are remembered** and not suggested again for the same file (saved with
   the answers, ADR 0006 and the coming saved profiles).

### Kinds of repair

| Kind                   | What is spotted                                                                                                    | What is proposed                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Misplaced value        | A cell whose kind does not fit its column but fits another column that is empty on that row                        | Move it there                                                                               |
| Swapped values         | Two cells on a row that each fit the other's column, or a self-identifying value swapped with text                 | Swap them                                                                                   |
| Swapped amounts        | A row where the sum that holds on most rows (net + VAT = total) fails, and swapping two of its cells makes it hold | Swap them                                                                                   |
| Duplicate value        | The same email or phone in two columns of a row, one of them the right column                                      | Remove the copy, and look along the row for what belongs in the emptied cell                |
| Shifted row            | Several cells in a row that each fit the column next to theirs                                                     | Shift the row back by one                                                                   |
| Tidy text              | Extra spaces, different capitals, curly apostrophes, "Mr." against "Mr"                                            | Use the tidy form when comparing; change the value only if the user accepts                 |
| Possible same customer | Names that differ by symbols or a small typo                                                                       | Treat as one customer, if the user says so                                                  |
| Amount in a note       | "£1,000 paid" in a status or notes cell of a part-paid invoice                                                     | Use it as the amount paid                                                                   |
| Conflicts              | Duplicate invoice numbers; net + VAT not equal to the total                                                        | Flag only, with choices (keep both / renumber; which figure is right). Never fixed silently |

### Spotting possible same customers

Several methods were weighed:

- **Strip symbols, then compare** (`dav;id` becomes `david`): good for stray symbols, blind to
  real typos.
- **Edit distance** (letters to change: `davod` to `david` is 1): good for typos, unsafe on short
  names, so the limit grows with the name's length.
- **Sounds-alike codes** (Soundex and similar): built for American names and give many false
  matches, so not used.
- **Evidence from other columns**: the same phone, email or postcode makes a match much more
  likely; a different postcode makes it less likely.

The decision is a mix: strip symbols, then edit distance with a length-based limit, then the
other columns to rank how strongly the match is suggested. For example: _"'Davod Smith' (row 14)
may be 'David Smith': 1 letter different, same phone number. Same customer?"_

## Options considered

- **A. Fix automatically.** Fast, but changes money and customers without the user knowing. The
  Tradify merge problem. Rejected.
- **B. Flag only.** Safe, but leaves the user to fix everything by hand in their own file.
- **C. Propose with evidence, confirm, keep the original.** Chosen. Safe like B, nearly as quick
  as A once similar repairs are confirmed together.

## Consequences

- The engine gains a repair layer between reading the layout and converting, with the same
  question-and-answer shape as column matching, so the screen shows repairs like any other
  question.
- Every repair is traceable: what moved, from where, on which row, and who confirmed it.
- Some mistakes stay flagged rather than repaired, because only the user knows which figure is
  right. That is on purpose.
- Tests follow the same pattern as before: pattern tests written from scratch, generated files
  with mistakes planted at known places, and blind rounds with an answer key.
