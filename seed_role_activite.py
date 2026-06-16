"""Apply the activite (SOM|VMM|SOM VMM) + type_role (PREV|CNV) mapping
provided by the agency.

    python seed_role_activite.py            # apply
    python seed_role_activite.py --dry-run  # preview
    python seed_role_activite.py --reset    # wipe activite + type_role first
    python seed_role_activite.py --add-new  # also create vendeurs not yet in DB

For vendeurs that exist in the DB but are NOT in this new list,
the script leaves their activite/type_role untouched.
"""
import argparse

import db_manager


# (raw_secteur_with_suffix, vendeur, type_role)
# The activite (channel) is derived from the SOM/VMM suffix on the secteur.
ROWS = [
    ('AGADIR HAY EL MOHAMADI SOM',     'Y59 EL GHANMI MOHAMED',     'PREV'),
    ('AGADIR HAY EL MOHAMADI VMM',     'O42 BENOUALLAD MY ZAKARIA', 'PREV'),
    ('TIZNIT SOM VMM',                 'O30 BOUDHOUR MBAREK',       'CNV'),
    ('CENTRE VILLE VMM',               'T45 FAICAL GOUIZID',        'CNV'),
    ('CENTRE VILLE SOM',               'I03 EL OUAHMI ACHRAF',      'PREV'),
    ('AGADIR HAY SALAM SOM',           'D45 OUARSSASSA YASSINE',    'PREV'),
    ('AGADIR HAY SALAM VMM',           'Y60 ATOUAOU AIMAD',         'PREV'),
    ('GUELMIM SOM VMM',                'JJ2 EL ASERY YOUSSEF',      'CNV'),
    ('TANTAN SOM VMM',                 '485 NAMOUSS ABDESSAMAD',    'CNV'),
    ('BOUIZAKARN SOM',                 'J23 ACHTOUK LAHOUCINE',     'CNV'),
    # T. DET 2 AGADIR is intentionally left as VIDE.
    ('AGADIR TIKIOUINE VMM',           'T96 EL HADI BOUBAKER',      'PREV'),
    ('AGADIR TIKIOUINE VMM',           'O88 OUAZIZ ABDELLATIF',     'PREV'),
    ('AGADIR TIKIOUINE SOM',           'D86 ACHAOUI AZIZ',          'PREV'),
    ('AGADIR EXTERIEUR SOM VMM',       'T89 AKNOUN MOHAMED',        'CNV'),
    ('OULED TEIMA SOM VMM',            'J78 LASRI EL HOUCINE',      'CNV'),
    ('INZEGANE VMM',                   'K91 BAIZ MOHAMED',          'PREV'),
    ('INZEGANE SOM',                   'E14 BOUMDIANE MOHAMED',     'PREV'),
    ('AIT MELLOUL SOM',                'F78 GHOUSMI MOURAD',        'PREV'),
    ('AIT MELLOUL VMM',                'E60 BOUALLALI FARID',       'PREV'),
    ('TAROUDANT SOM VMM',              'D48 IBACH MOHAMED',         'CNV'),
    ('TAROUDANTE EXT IDAOUTANANE',     'K60 ELHAOUZI RACHID',       'CNV'),
]


def derive_activite(raw_secteur):
    """Return SOM / VMM / SOM VMM based on the suffix of the raw
    secteur label. Empty string if no SOM/VMM is present (e.g.
    TAROUDANTE EXT IDAOUTANANE which covers both without a suffix)."""
    s = (raw_secteur or '').upper()
    has_som = 'SOM' in s
    has_vmm = 'VMM' in s
    if has_som and has_vmm:
        return 'SOM VMM'
    if has_som:
        return 'SOM'
    if has_vmm:
        return 'VMM'
    return ''


def normalize_type_role(value):
    if not value:
        return ''
    v = str(value).strip().upper()
    if v in ('PREV', 'PRÉ-VENDEUR', 'PRE-VENDEUR', 'PRÉVENDEUR', 'PREVENDEUR'):
        return 'PREV'
    if v in ('CNV', 'CONVENTIONNEL', 'CONV'):
        return 'CNV'
    return v


def build_mapping():
    out = []
    for raw, vendeur, type_role in ROWS:
        out.append({
            'raw_secteur': raw,
            'vendeur': vendeur,
            'activite': derive_activite(raw),
            'type_role': normalize_type_role(type_role),
        })
    return out


def apply(reset=False, dry_run=False, add_new=False):
    db_manager.init_db()
    if reset and not dry_run:
        import sqlite3
        conn = sqlite3.connect(db_manager.DB_PATH)
        conn.execute("UPDATE fdv SET role = '', type_role = ''")
        conn.commit()
        conn.close()
        print("[reset] activite and type_role wiped on every row.")

    mapping = build_mapping()
    print(f"[map] {len(mapping)} vendeur entries")

    updated, already_ok, missing, created = 0, 0, 0, 0
    for entry in mapping:
        v = entry['vendeur']
        existing = db_manager.get_fdv_by_vendeur(v)
        if existing is None:
            if not add_new:
                missing += 1
                if dry_run:
                    print(f"  [skip] {v}  activite={entry['activite']}  type_role={entry['type_role']}  (no row, --add-new not set)")
                continue
            if dry_run:
                print(f"  [create] {v}  secteur={entry['raw_secteur']}  activite={entry['activite']}  type_role={entry['type_role']}")
                created += 1
                continue
            new_id = db_manager.create_fdv({
                'vendeur': v,
                'role': entry['activite'],
                'type_role': entry['type_role'],
                'activite': 'ACTIF',
                'secteur': entry['raw_secteur'].rsplit(' ', 1)[0] if ' ' in entry['raw_secteur'] else entry['raw_secteur'],
                'telephone': '',
                'whatsapp': '',
                'notes': '',
            })
            created += 1
            print(f"  [create] id={new_id}  {v}  activite={entry['activite']}  type_role={entry['type_role']}")
            continue

        # Compare only the two fields we manage.
        cur_activite = (existing.get('role') or '').strip()
        cur_type_role = (existing.get('type_role') or '').strip()
        target_activite = entry['activite']
        target_type_role = entry['type_role']
        if cur_activite == target_activite and cur_type_role == target_type_role:
            already_ok += 1
            if dry_run:
                print(f"  [ok]    {v}  activite={target_activite}  type_role={target_type_role}")
            continue

        if dry_run:
            print(f"  [update] {v}  activite '{cur_activite}' -> '{target_activite}'   "
                  f"type_role '{cur_type_role}' -> '{target_type_role}'")
            updated += 1
            continue

        db_manager.update_fdv(existing['id'], {
            'vendeur': existing['vendeur'],
            'role': target_activite,
            'type_role': target_type_role,
            'activite': existing.get('activite', 'ACTIF'),
            'secteur': existing.get('secteur', ''),
            'telephone': existing.get('telephone', ''),
            'whatsapp': existing.get('whatsapp', ''),
            'recrutement': existing.get('recrutement', ''),
            'notes': existing.get('notes', ''),
        })
        updated += 1
        print(f"  [update] {v}  activite={target_activite}  type_role={target_type_role}")

    print(f"\n[summary] updated={updated}  already_ok={already_ok}  "
          f"created={created}  missing={missing}")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Apply activite + type_role mapping.")
    p.add_argument("--reset", action="store_true", help="Wipe activite + type_role first")
    p.add_argument("--dry-run", action="store_true", help="Print what would happen")
    p.add_argument("--add-new", action="store_true",
                   help="Also add vendeurs from the list that aren't in the FDV yet")
    args = p.parse_args()
    apply(reset=args.reset, dry_run=args.dry_run, add_new=args.add_new)
