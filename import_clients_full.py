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

    # Flex column detection (supports both clients.xlsx and acm.xlsx)
    code_col = None
    name_col = None
    secteur_col = None
    localite_col = None

    for c in df.columns:
        cl = str(c).lower()
        if not code_col and ("client" in cl or "code" in cl):
            if "nom" not in cl and "name" not in cl:
                code_col = c
        if not name_col and ("nom" in cl or "name" in cl or "client" in cl):
            if "code" not in cl:
                name_col = c
        if not secteur_col and ("role" in cl or "secteur" in cl):
            secteur_col = c
        if not localite_col and ("tourne" in cl or "localit" in cl):
            localite_col = c

    if not code_col or not name_col:
        print("[ERROR] Could not find 'Client Code' or 'Client Nom' columns.")
        return False

    print(f"  Code column: {repr(code_col)}")
    print(f"  Name column: {repr(name_col)}")
    print(f"  Secteur column: {repr(secteur_col)}")
    print(f"  Localité column: {repr(localite_col)}")
    print()

    # Build the row list
    rows = []
    for idx, row in df.iterrows():
        code = _clean(row[code_col])
        name = _clean(row[name_col])
        secteur = _clean(row[secteur_col], default="NON DEFINI") if secteur_col else "NON DEFINI"
        localite = _clean(row[localite_col], default="") if localite_col else ""

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
