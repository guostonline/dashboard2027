"""Import ALL clients from clients.xlsx (including duplicates) into the
`clients_full` table, with Vendeur SOM / Vendeur VMM mapped from Secteur
and `is_repeat` flagged when the same code appears more than once.

Usage:
    python import_clients_full.py [path_to_excel]
"""

import os
import sys
import pandas as pd

import db_manager

DEFAULT_PATH = "clients.xlsx"


def _clean(val, default=""):
    if pd.isna(val) or val is None:
        return default
    s = str(val).strip()
    if s.lower() in ("nan", "none", "null", ""):
        return default
    return s


def import_all(file_path):
    if not os.path.exists(file_path):
        print(f"[ERROR] File not found: {file_path}")
        return False

    print(f"Reading: {file_path}")
    df = pd.read_excel(file_path)
    print(f"Rows: {len(df)} | Columns: {list(df.columns)}")

    # Identify the locality column regardless of encoding mojibake
    localite_col = None
    for c in df.columns:
        cl = c.lower()
        if "ocalit" in cl or "localite" in cl:
            localite_col = c
            break

    required = ["Secteur", "Client", "Nom"]
    if localite_col is None:
        print("[ERROR] Could not find a 'Localité' column in the file.")
        return False
    for r in required:
        if r not in df.columns:
            print(f"[ERROR] Missing required column: {r}")
            return False

    print(f"  Localité column: {repr(localite_col)}")
    print()

    # Build the row list
    rows = []
    for idx, row in df.iterrows():
        code = _clean(row["Client"])
        name = _clean(row["Nom"])
        secteur = _clean(row["Secteur"], default="NON DEFINI")
        localite = _clean(row[localite_col], default="")

        if not code or not name:
            continue

        mapping = db_manager.SECTEUR_VENDEUR_MAP.get(
            secteur, {"som": "NON ASSIGNE", "vmm": "NON ASSIGNE"}
        )
        rows.append(
            {
                "code": code,
                "name": name,
                "secteur": secteur,
                "localite": localite,
                "vendeur_som": mapping["som"],
                "vendeur_vmm": mapping["vmm"],
                "is_repeat": 0,  # filled in next pass
                "row_index": int(idx),
            }
        )

    # Compute DONT REPETE flag: same code appears more than once
    code_counts = {}
    for r in rows:
        code_counts[r["code"]] = code_counts.get(r["code"], 0) + 1
    for r in rows:
        r["is_repeat"] = 1 if code_counts[r["code"]] > 1 else 0

    # Wipe and re-insert
    db_manager.clear_clients_full()
    inserted = db_manager.insert_clients_full(rows)

    repeats = sum(1 for r in rows if r["is_repeat"])
    print("=" * 60)
    print(f"Total rows:           {len(rows)}")
    print(f"Inserted:             {inserted}")
    print(f"Codes appearing >1x:  {sum(1 for c in code_counts.values() if c > 1)}")
    print(f"Rows marked RÉPÉTÉ:   {repeats}")
    print("=" * 60)
    print("Distribution by secteur:")
    sect_counts = {}
    for r in rows:
        sect_counts[r["secteur"]] = sect_counts.get(r["secteur"], 0) + 1
    for s, c in sorted(sect_counts.items(), key=lambda x: -x[1]):
        print(f"  {s:15s}  {c}")
    print("=" * 60)

    return True


if __name__ == "__main__":
    db_manager.init_db()
    file_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    ok = import_all(file_path)
    sys.exit(0 if ok else 1)
