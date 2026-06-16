"""Apply the agence's vendeur → secteur mapping.

Source: the master "agence / ville / produit" table provided by
the user. SOM and VMM suffixes are stripped from the secteur
name (a vendeur assigned to "AGADIR HAY SALAM SOM" and another
assigned to "AGADIR HAY SALAM VMM" both end up with
secteur = "AGADIR HAY SALAM").

Run after `seed_fdv.py`:

    python seed_secteurs.py            # apply the mapping
    python seed_secteurs.py --reset    # wipe all secteurs first
    python seed_secteurs.py --dry-run  # print what would happen
    python seed_secteurs.py --add-new  # also add vendeurs from
                                       # the list that don't have
                                       # a phone number yet
"""
import argparse
import re
import sys

import db_manager


# Master mapping: (raw_secteur, vendeur_label).
# "raw_secteur" still has the SOM/VMM suffix so we can derive the
# SOM/VMM/SOM VMM channel if needed in the future.
RAW_MAP = [
    ('AGADIR HAY EL MOHAMADI SOM',     'Y59 EL GHANMI MOHAMED'),
    ('AGADIR HAY EL MOHAMADI VMM',     'O42 BENOUALLAD MY ZAKARIA'),
    ('TIZNIT SOM VMM',                 'O30 BOUDHOUR MBAREK'),
    ('CENTRE VILLE VMM',               'T45 FAICAL GOUIZID'),
    ('CENTRE VILLE SOM',               'I03 EL OUAHMI ACHRAF'),
    ('AGADIR HAY SALAM SOM',           'D45 OUARSSASSA YASSINE'),
    ('AGADIR HAY SALAM VMM',           'Y60 ATOUAOU AIMAD'),
    ('GUELMIM SOM VMM',                'JJ2 EL ASERY YOUSSEF'),
    ('TANTAN SOM VMM',                 '485 NAMOUSS ABDESSAMAD'),
    ('BOUIZAKARN SOM',                 'J23 ACHTOUK LAHOUCINE'),
    # T. DET 2 AGADIR is intentionally left as VIDE.
    ('AGADIR TIKIOUINE VMM',           'O88 OUAZIZ ABDELLATIF'),
    ('AGADIR TIKIOUINE SOM',           'D86 ACHAOUI AZIZ'),
    ('AGADIR EXTERIEUR SOM VMM',       'T89 AKNOUN MOHAMED'),
    ('OULED TEIMA SOM VMM',            'J78 LASRI EL HOUCINE'),
    ('INZEGANE VMM',                   'K91 BAIZ MOHAMED'),
    ('INZEGANE SOM',                   'E14 BOUMDIANE MOHAMED'),
    ('AIT MELLOUL SOM',                'F78 GHOUSMI MOURAD'),
    ('AIT MELLOUL VMM',                'E60 BOUALLALI FARID'),
    ('TAROUDANT SOM VMM',              'D48 IBACH MOHAMED'),
    ('TAROUDANTE EXT IDAOUTANANE',     'K60 ELHAOUZI RACHID'),
]


def clean_secteur(raw):
    """Strip trailing SOM / VMM / "SOM VMM" from a secteur name."""
    s = (raw or '').strip()
    # Remove any combination of SOM and VMM tokens, plus
    # connecting spaces, repeated.
    while True:
        cleaned = re.sub(r'(\s+SOM(\s+VMM)?|\s+VMM(\s+SOM)?|\s+SOM|\s+VMM)\s*$', '', s, flags=re.IGNORECASE)
        if cleaned == s:
            return s
        s = cleaned


def derive_channel(raw):
    """Return the channel label: 'SOM', 'VMM' or 'SOM+VMM'."""
    upper = (raw or '').upper()
    has_som = 'SOM' in upper
    has_vmm = 'VMM' in upper
    if has_som and has_vmm:
        return 'SOM+VMM'
    if has_som:
        return 'SOM'
    if has_vmm:
        return 'VMM'
    return ''


def build_mapping():
    """Return {vendeur: (secteur_clean, channel)}."""
    out = {}
    for raw_secteur, vendeur in RAW_MAP:
        secteur = clean_secteur(raw_secteur)
        channel = derive_channel(raw_secteur)
        out[vendeur] = (secteur, channel)
    return out


def apply(reset: bool = False, dry_run: bool = False, add_new: bool = False):
    db_manager.init_db()
    if reset and not dry_run:
        import sqlite3
        conn = sqlite3.connect(db_manager.DB_PATH)
        conn.execute("UPDATE fdv SET secteur = ''")
        conn.commit()
        conn.close()
        print("[reset] all secteurs wiped.")

    mapping = build_mapping()
    print(f"[map] {len(mapping)} vendeur -> secteur pairs")

    # Show what the cleaned secteurs look like.
    if dry_run:
        print("\n[cleaned secteurs]")
        for raw, _ in RAW_MAP:
            print(f"  {raw!r:42s} -> {clean_secteur(raw)!r}")

    updated, already_ok, missing, created = 0, 0, 0, 0

    for vendeur, (secteur, channel) in mapping.items():
        existing = db_manager.get_fdv_by_vendeur(vendeur)
        if existing is None:
            if not add_new:
                missing += 1
                if dry_run:
                    print(f"  [skip] {vendeur}  ->  {secteur}  ({channel})  (no row, --add-new not set)")
                continue
            # Create with empty phone — user can fill it in later.
            if dry_run:
                print(f"  [create] {vendeur}  ->  {secteur}  ({channel})")
                created += 1
                continue
            new_id = db_manager.create_fdv({
                "vendeur": vendeur,
                "role": "",
                "type_role": "",
                "activite": "ACTIF",
                "secteur": secteur,
                "telephone": "",
                "whatsapp": "",
                "notes": f"Channel: {channel}" if channel else "",
            })
            created += 1
            print(f"  [create] {vendeur}  ->  {secteur}  ({channel})  id={new_id}")
            continue

        if existing.get("secteur") == secteur:
            already_ok += 1
            if dry_run:
                print(f"  [ok]    {vendeur}  ->  {secteur}")
            continue

        if dry_run:
            print(f"  [update] {vendeur}  '{existing.get('secteur')}' -> '{secteur}'  ({channel})")
            updated += 1
            continue

        # Preserve existing notes; append the channel tag if it's new.
        notes = existing.get("notes", "") or ""
        tag = f"Channel: {channel}"
        if tag not in notes:
            notes = (notes + " | " + tag) if notes else tag
        db_manager.update_fdv(existing["id"], {
            "vendeur": vendeur,
            "role": existing.get("role", ""),
            "type_role": existing.get("type_role", ""),
            "activite": existing.get("activite", "ACTIF"),
            "secteur": secteur,
            "telephone": existing.get("telephone", ""),
            "whatsapp": existing.get("whatsapp", ""),
            "recrutement": existing.get("recrutement", ""),
            "notes": notes,
        })
        updated += 1
        print(f"  [update] {vendeur}  '{existing.get('secteur')}' -> '{secteur}'  ({channel})")

    print(f"\n[summary] updated={updated}  already_ok={already_ok}  "
          f"created={created}  missing={missing}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Apply vendeur → secteur mapping.")
    p.add_argument("--reset", action="store_true", help="Wipe all secteurs first")
    p.add_argument("--dry-run", action="store_true", help="Print what would happen")
    p.add_argument("--add-new", action="store_true",
                   help="Also add vendeurs from the list that aren't in the FDV yet")
    args = p.parse_args()
    apply(reset=args.reset, dry_run=args.dry_run, add_new=args.add_new)
