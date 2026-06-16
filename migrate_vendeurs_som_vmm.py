"""
DEPRECATED: this script targeted the legacy `clients` table, which has been
removed.  Vendeur SOM and Vendeur VMM are now derived from `secteur` at
import time by `import_clients_full.py` (see SECTEUR_VENDEUR_MAP in
db_manager.py).  No migration is required.
"""
import sys
print("[DEPRECATED] migrate_vendeurs_som_vmm.py targets the legacy `clients`\n"
      "           table, which has been removed. Vendeur SOM/VMM are derived\n"
      "           from `secteur` by import_clients_full.py. No migration needed.")
sys.exit(0)

import os
import sqlite3
import openpyxl

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "database.db")
XLSX_PATH = os.path.join(ROOT, "clients.xlsx")
SHEET = "Secteurs & localités"


def load_mapping(xlsx_path: str) -> dict:
    """Return {(secteur, localité): (som, vmm)} from the Excel sheet."""
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws = wb[SHEET]
    mapping: dict = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        secteur, localite, _count, som, vmm = row
        if not secteur or not localite:
            continue
        key = (str(secteur).strip(), str(localite).strip())
        mapping[key] = (
            str(som).strip() if som else None,
            str(vmm).strip() if vmm else None,
        )
    return mapping


def ensure_column(conn: sqlite3.Connection) -> None:
    """Add vendeur_vmm column if it doesn't exist (idempotent)."""
    cur = conn.cursor()
    cur.execute("PRAGMA table_info(clients)")
    cols = {row[1] for row in cur.fetchall()}
    if "vendeur_vmm" not in cols:
        cur.execute("ALTER TABLE clients ADD COLUMN vendeur_vmm TEXT")
        conn.commit()
        print("+ Added column: vendeur_vmm")
    else:
        print("= Column vendeur_vmm already present")


def migrate() -> None:
    mapping = load_mapping(XLSX_PATH)
    print(f"Loaded {len(mapping)} (secteur, localité) -> (SOM, VMM) entries from Excel")

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        ensure_column(conn)

        cur = conn.cursor()
        cur.execute("SELECT id, secteur, address, vendeur, vendeur_vmm FROM clients")
        rows = cur.fetchall()
        print(f"Found {len(rows)} clients in database")

        som_updated = 0
        vmm_updated = 0
        som_skipped_no_match = 0
        vmm_skipped_no_match = 0

        for row in rows:
            key = ((row["secteur"] or "").strip(), (row["address"] or "").strip())
            entry = mapping.get(key)
            if not entry:
                som_skipped_no_match += 1
                vmm_skipped_no_match += 1
                continue
            som, vmm = entry

            new_som = som if som else row["vendeur"]
            new_vmm = vmm if vmm else row["vendeur_vmm"]

            if new_som != row["vendeur"]:
                cur.execute("UPDATE clients SET vendeur = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                            (new_som, row["id"]))
                som_updated += 1
            if new_vmm != row["vendeur_vmm"]:
                cur.execute("UPDATE clients SET vendeur_vmm = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                            (new_vmm, row["id"]))
                vmm_updated += 1

        conn.commit()

        print()
        print(f"Updated vendeur  (SOM) : {som_updated}")
        print(f"Updated vendeur_vmm     : {vmm_updated}")
        print(f"Unmatched (no Excel row): {som_skipped_no_match} (clients)")

        # Final summary
        cur.execute("""
            SELECT vendeur, COUNT(*) AS n
            FROM clients
            WHERE vendeur IS NOT NULL AND vendeur != ''
            GROUP BY vendeur
            ORDER BY vendeur
        """)
        print()
        print("Vendeur (SOM) distribution:")
        for r in cur.fetchall():
            print(f"  {r['vendeur']:<35} {r['n']:>5}")

        cur.execute("""
            SELECT vendeur_vmm, COUNT(*) AS n
            FROM clients
            WHERE vendeur_vmm IS NOT NULL AND vendeur_vmm != ''
            GROUP BY vendeur_vmm
            ORDER BY vendeur_vmm
        """)
        print()
        print("Vendeur (VMM) distribution:")
        for r in cur.fetchall():
            print(f"  {r['vendeur_vmm']:<35} {r['n']:>5}")
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
