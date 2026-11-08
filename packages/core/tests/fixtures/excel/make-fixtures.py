# Builds the Excel test files. Run by hand, not in CI: python3 make-fixtures.py
# openpyxl writes the workbook, then LibreOffice opens and saves it as .xlsx, .xls and
# .ods, as a real user's program would, working out and saving every formula result.
import csv
import datetime as dt
import os
import shutil
import subprocess
import tempfile

from openpyxl import Workbook

HERE = os.path.dirname(os.path.abspath(__file__))
ROWS = [
    # number, date, customer, net, vat, paid
    ("101", dt.date(2026, 3, 13), "Ann Example", 100.00, 20.00, "Yes"),
    # 3 April: as text this could be 4 March, as a date cell it can't
    ("102", dt.date(2026, 4, 3), "Bob Example", 80.00, 16.00, "No"),
    ("103", dt.date(2026, 4, 17), "Cat Example", 55.50, 11.10, "Yes"),
    ("104", dt.date(2026, 5, 2), "Dan Example", 1250.00, 250.00, "No"),
    ("105", dt.date(2026, 5, 20), "Eve Example", 40.00, 8.00, "Yes"),
    ("106", dt.date(2026, 6, 9), "Ann Example", 310.00, 62.00, "No"),
]
HEADERS = ["Inv No", "Date", "Customer", "Net", "VAT", "Total", "Paid?"]


def invoices(book, title):
    sheet = book.active
    sheet.title = title
    sheet["A1"] = "Dave's Plumbing - Invoices 2026"
    sheet.merge_cells("A1:G1")
    sheet.append([])
    sheet.append(HEADERS)
    for i, (number, day, customer, net, vat, paid) in enumerate(ROWS, start=4):
        sheet.append([number, day, customer, net, vat, f"=D{i}+E{i}", paid])
        sheet[f"B{i}"].number_format = "DD/MM/YYYY"
        for col in "DEF":
            sheet[f"{col}{i}"].number_format = '"£"#,##0.00'
    last = 3 + len(ROWS)
    sheet.append(["", "", "TOTAL", f"=SUM(D4:D{last})", f"=SUM(E4:E{last})", f"=SUM(F4:F{last})", ""])
    return sheet


def save_all(book, stem, folder):
    raw = os.path.join(folder, f"{stem}-openpyxl.xlsx")
    book.save(raw)
    for kind, name in [("xlsx", "xlsx"), ("xls", "xls"), ("ods", "ods")]:
        out = tempfile.mkdtemp()
        subprocess.run(
            ["soffice", "--headless", "--calc", "--convert-to", kind, "--outdir", out, raw],
            check=True,
            capture_output=True,
        )
        produced = os.path.join(out, f"{stem}-openpyxl.{name}")
        shutil.move(produced, os.path.join(HERE, f"{stem}.{name}"))
    return raw


# 1. one sheet of invoices
book = Workbook()
invoices(book, "Invoices")
work = tempfile.mkdtemp()
raw = save_all(book, "invoices", work)
# the openpyxl file has formulas but no saved results, as a file made by a program can
shutil.copy(raw, os.path.join(HERE, "no-saved-results.xlsx"))

# 2. invoices, plus a notes sheet with data, an empty sheet and a hidden working sheet
book = Workbook()
invoices(book, "2026")
notes = book.create_sheet("Notes")
notes.append(["Van MOT due in April"])
notes.append(["Ring the merchant about the account"])
book.create_sheet("Sheet3")
workings = book.create_sheet("Workings")
workings.append(["scratch", 1, 2, 3])
workings.sheet_state = "hidden"
save_all(book, "several-sheets", work)

# 3. the same invoices as a CSV, with dates typed day first and totals worked out
with open(os.path.join(HERE, "invoices.csv"), "w", newline="") as f:
    out = csv.writer(f)
    out.writerow(["Dave's Plumbing - Invoices 2026"])
    out.writerow([])
    out.writerow(HEADERS)
    for number, day, customer, net, vat, paid in ROWS:
        out.writerow([number, day.strftime("%d/%m/%Y"), customer, f"{net:.2f}", f"{vat:.2f}", f"{net + vat:.2f}", paid])
    out.writerow(["", "", "TOTAL", f"{sum(r[3] for r in ROWS):.2f}", f"{sum(r[4] for r in ROWS):.2f}", f"{sum(r[3] + r[4] for r in ROWS):.2f}", ""])
print("done")
