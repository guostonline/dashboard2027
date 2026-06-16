"""Seed the FDV (Force De Vente) table with the agency's sales roster.

Usage:
    python seed_fdv.py            # insert new rows + update existing ones
    python seed_fdv.py --reset    # wipe the table first
    python seed_fdv.py --dry-run  # print what would be done

The phone numbers come from the agency's phone book. Each row
gets:
    - vendeur : the full label (e.g. "E14 BOUMDIANE MOHAMED")
    - role    : defaults to "Vendeur" (you can edit later in the UI)
    - activite: "ACTIF" by default
    - secteur : empty by default
    - telephone / whatsapp : from the phone book
    - recrutement : empty
    - notes : empty

The seed is **idempotent**: re-running it won't create duplicates
because `vendeur` is UNIQUE. Existing rows have their phone number
updated so the phone book stays the single source of truth.
"""
import argparse
import sys

import db_manager

# Phone book — only for the vendeurs that have a known number.
# Vendeurs added later via seed_secteurs.py --add-new won't appear
# here until their phone number is provided.
PHONE_BOOK = {
    'E14 BOUMDIANE MOHAMED':    '+212 631996727',
    'K91 BAIZ MOHAMED':         '+212 626-508898',
    'F78 GHOUSMI MOURAD':       '+212 677-529149',
    'E60 BOUALLALI FARID':      '+212 659-071044',
    'T89 AKNOUN MOHAMED':       '+212 696-362296',
    'D48 IBACH MOHAMED':        '+212 654-076929',
    'K60 ELHAOUZI RACHID':      '+212 707-744529',
    'D86 ACHAOUI AZIZ':         '+212 699-363894',
    'D45 OUARSSASSA YASSINE':   '+212 601-571544',
    'Y60 ATOUAOU AIMAD':        '+212 670-524910',
    'Y59 EL GHANMI MOHAMED':    '+212 668-399702',
    '485 NAMOUSS ABDESSAMAD':   '+212 664-782591',
    'T45 FAICAL GOUIZID':       '+212 641-894845',
}

# Map vendeur -> secteur when known.
SECTEUR_MAP = {
    'F78 GHOUSMI MOURAD':      'Ait Melloul',
    'E14 BOUMDIANE MOHAMED':   'Inzegan',
    'K91 BAIZ MOHAMED':        'Inzegan',
    'D86 ACHAOUI AZIZ':        'Tikiouine',
    'T96 EL HADI BOUBAKER':    'Tikiouine',
}

# Map vendeur -> role (job activity) when known.
ROLE_MAP = {
    'Y59 EL GHANMI MOHAMED':   'One by One',
    'CHAKIB ELFIL':            'Pré-vendeur Chakib',
}

DEFAULT_ROLE = 'Vendeur'


def seed(reset: bool = False, dry_run: bool = False):
    db_manager.init_db()
    if reset and not dry_run:
        # Wipe the table first.
        import sqlite3, os
        conn = sqlite3.connect(db_manager.DB_PATH)
        conn.execute("DELETE FROM fdv")
        conn.execute("DELETE FROM sqlite_sequence WHERE name='fdv'")
        conn.commit()
        conn.close()
        print("[reset] fdv table wiped.")

    created, updated, skipped = 0, 0, 0
    for vendeur, phone in PHONE_BOOK.items():
        existing = db_manager.get_fdv_by_vendeur(vendeur)
        data = {
            "vendeur": vendeur,
            "role": existing.get("role", "") if existing else ROLE_MAP.get(vendeur, DEFAULT_ROLE),
            "type_role": existing.get("type_role", "") if existing else "",
            "activite": "ACTIF",
            "secteur": SECTEUR_MAP.get(vendeur, ""),
            "telephone": phone,
            "whatsapp": phone,
            "recrutement": existing.get("recrutement", "") if existing else "",
            "notes": existing.get("notes", "") if existing else "",
        }
        if dry_run:
            action = "UPDATE" if existing else "CREATE"
            print(f"  {action:6s} {vendeur:35s} -> {phone}")
            continue
        if existing:
            db_manager.update_fdv(existing["id"], data)
            updated += 1
        else:
            db_manager.create_fdv(data)
            created += 1

    print(f"[done] created={created}  updated={updated}  total={len(PHONE_BOOK)}")
    print(f"[stats] {db_manager.get_fdv_stats()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed the FDV table.")
    parser.add_argument("--reset", action="store_true", help="Wipe the table first")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen")
    args = parser.parse_args()
    seed(reset=args.reset, dry_run=args.dry_run)
