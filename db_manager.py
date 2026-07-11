import sqlite3
import os

import datetime
import calendar

def get_dynamic_workdays(date_str):
    today = datetime.date.today()
    try:
        report_date = datetime.datetime.strptime(date_str, "%Y-%m-%d").date()
    except Exception:
        report_date = today
        
    year = report_date.year
    month = report_date.month
    
    _, total_days_in_month = calendar.monthrange(year, month)
    
    total_workdays = 0
    for d in range(1, total_days_in_month + 1):
        curr_date = datetime.date(year, month, d)
        if curr_date.weekday() != 6:
            total_workdays += 1
            
    if today.year > year or (today.year == year and today.month > month):
        elapsed_workdays = total_workdays
    elif today.year < year or (today.year == year and today.month < month):
        elapsed_workdays = 0
    else:
        elapsed_workdays = 0
        for d in range(1, today.day):
            curr_date = datetime.date(year, month, d)
            if curr_date.weekday() != 6:
                elapsed_workdays += 1
                
    remaining_workdays = max(0, total_workdays - elapsed_workdays)
    
    return {
        "total": total_workdays,
        "elapsed": elapsed_workdays,
        "rest": remaining_workdays
    }

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# Mapping Secteur -> Vendeur SOM / Vendeur VMM
SECTEUR_VENDEUR_MAP = {
    "Ait melloul": {
        "som": "F78 GHOUSMI MOURAD",
        "vmm": "F78 GHOUSMI MOURAD",
    },
    "Inzegan": {
        "som": "E14 BOUMDIANE MOHAMED",
        "vmm": "K91 BAIZ MOHAMED",
    },
    "Tikiouine": {
        "som": "D86 ACHAOUI AZIZ",
        "vmm": "T96 EL HADI BOUBAKER",
    },
}


def init_db():
    """Initialize database with proper tables"""
    conn = get_db_connection()
    cursor = conn.cursor()

    print("Creating database tables...")

    # 1. Quantitative data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quantitative_data (
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        famille TEXT NOT NULL,
        real INTEGER DEFAULT 0,
        obj INTEGER DEFAULT 0,
        percent REAL DEFAULT 0.0,
        real_2025 INTEGER DEFAULT 0,
        h_2024 INTEGER DEFAULT 0,
        h_pct REAL DEFAULT 0.0,
        encours INTEGER DEFAULT 0,
        obj_mois INTEGER DEFAULT 0,
        raf INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (date, vendeur, famille)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quantitative_date ON quantitative_data(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quantitative_vendeur ON quantitative_data(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quantitative_famille ON quantitative_data(famille)")

    # 2. Qualitative data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS qualitative_data (
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        clt_programme INTEGER DEFAULT 0,
        clt_facture INTEGER DEFAULT 0,
        acm REAL DEFAULT 0.0,
        tsm REAL DEFAULT 0.0,
        line REAL DEFAULT 0.0,
        raf_tsm INTEGER DEFAULT 0,
        raf_acm INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (date, vendeur)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_qualitative_date ON qualitative_data(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_qualitative_vendeur ON qualitative_data(vendeur)")

    # 3. Focus VMM data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_vmm_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        secteur TEXT NOT NULL,
        dn_fin_mai REAL DEFAULT 0.0,
        obj_juin REAL DEFAULT 0.0,
        nb_clients INTEGER DEFAULT 0,
        obj_acm INTEGER DEFAULT 0,
        percent REAL DEFAULT 0.0,
        realise REAL DEFAULT 0.0,
        rest REAL DEFAULT 0.0,
        jour_rest INTEGER DEFAULT 0,
        rest_jour REAL DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, vendeur, secteur)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_vmm_date ON focus_vmm_data(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_vmm_vendeur ON focus_vmm_data(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_vmm_secteur ON focus_vmm_data(secteur)")

    # 4. Focus SOM data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_som_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        secteur TEXT NOT NULL,
        glace_ht REAL DEFAULT 0.0,
        ttc REAL DEFAULT 0.0,
        percent REAL DEFAULT 0.0,
        realise REAL DEFAULT 0.0,
        rest REAL DEFAULT 0.0,
        rest_jour REAL DEFAULT 0.0,
        jour_rest INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, vendeur, secteur)
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_som_date ON focus_som_data(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_som_vendeur ON focus_som_data(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_som_secteur ON focus_som_data(secteur)")

    # 5. Settings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS settings (
        date TEXT PRIMARY KEY,
        rest_days INTEGER DEFAULT 20,
        exclude_families TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_settings_date ON settings(date)")

    # 6. File metadata
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS file_metadata (
        date TEXT PRIMARY KEY,
        file_name TEXT,
        file_size INTEGER,
        file_content BLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 7. Clients (full) - stores ALL rows from clients.xlsx, including duplicates.
    #    `is_repeat` is computed on import (OUI when the same `code` appears
    #    in more than one row in the source Excel).
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clients_full (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        secteur TEXT NOT NULL,
        localite TEXT NOT NULL DEFAULT '',
        vendeur_som TEXT NOT NULL DEFAULT '',
        vendeur_vmm TEXT NOT NULL DEFAULT '',
        is_repeat INTEGER NOT NULL DEFAULT 0,
        row_index INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_full_code ON clients_full(code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_full_secteur ON clients_full(secteur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_full_localite ON clients_full(localite)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_full_vendeur_som ON clients_full(vendeur_som)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_full_vendeur_vmm ON clients_full(vendeur_vmm)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_full_is_repeat ON clients_full(is_repeat)")

    # 8. FDV (Force De Vente) - the sales-force roster. One row per
    #    vendeur with their sector, contact info, status, etc. The
    #    dashboard's "FDV" tab reads and edits this table.
    #    `role`        = "Activité" channel: SOM | VMM | SOM VMM
    #    `type_role`   = "Role" profile: PREV (pré-vendeur) | CNV (conventionnel)
    #    `activite`    = "État" status: ACTIF, CONGE, REMPLACER, MALADE, SUSPENDU
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS fdv (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendeur TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL DEFAULT '',
        type_role TEXT NOT NULL DEFAULT '',
        activite TEXT NOT NULL DEFAULT 'ACTIF',
        secteur TEXT NOT NULL DEFAULT '',
        telephone TEXT NOT NULL DEFAULT '',
        whatsapp TEXT NOT NULL DEFAULT '',
        recrutement TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fdv_vendeur ON fdv(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fdv_secteur ON fdv(secteur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fdv_activite ON fdv(activite)")

    # 9. Focus weekly rankings (representative-level details)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_rankings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_date TEXT NOT NULL,
        focus_type TEXT NOT NULL,
        rank INTEGER,
        agence TEXT,
        secteur TEXT,
        representative TEXT,
        deviation REAL,
        cdz TEXT,
        UNIQUE(upload_date, focus_type, representative)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_rankings_date ON focus_rankings(upload_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_rankings_type ON focus_rankings(focus_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_rankings_rep ON focus_rankings(representative)")

    # 10. Focus CDZ rankings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_cdz_rankings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_date TEXT NOT NULL,
        focus_type TEXT NOT NULL,
        rank INTEGER,
        cdz TEXT,
        agence TEXT,
        deviation REAL,
        UNIQUE(upload_date, focus_type, cdz)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_cdz_rank_date ON focus_cdz_rankings(upload_date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_cdz_rank_type ON focus_cdz_rankings(focus_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_cdz_rank_cdz ON focus_cdz_rankings(cdz)")

    # 11. Focus static objectives from Focus.xlsx
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_objectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        focus_type TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        secteur TEXT NOT NULL,
        number_client INTEGER DEFAULT 0,
        obj_acm REAL DEFAULT 0.0,
        obj_juin REAL DEFAULT 0.0,
        glace_ht REAL DEFAULT 0.0,
        ttc REAL DEFAULT 0.0,
        UNIQUE(focus_type, vendeur)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_objectives_type ON focus_objectives(focus_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_objectives_vendeur ON focus_objectives(vendeur)")

    # 11b. Focus Names table (stores dynamic focus names like BECHAMEL, PESCADA ALGERIENNE)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_names (
        focus_type TEXT PRIMARY KEY,
        focus_name TEXT NOT NULL
    )
    """)

    # 12. Stock data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        act_code TEXT NOT NULL,
        site TEXT NOT NULL,
        soc TEXT NOT NULL,
        fournisseur TEXT NOT NULL,
        gamme TEXT NOT NULL,
        famille TEXT NOT NULL,
        produit TEXT NOT NULL,
        designation TEXT NOT NULL,
        statut TEXT NOT NULL,
        stk_qte INTEGER DEFAULT 0,
        source TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(date, site, soc, produit)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_date ON stock(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_produit ON stock(produit)")

    # 13. Stock favorites table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock_favorites (
        produit TEXT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # Lightweight migrations for older DBs (must run BEFORE the
    # indexes that depend on the new columns).
    cursor.execute("PRAGMA table_info(fdv)")
    fdv_cols = {row[1] for row in cursor.fetchall()}
    if "role" not in fdv_cols:
        cursor.execute("ALTER TABLE fdv ADD COLUMN role TEXT NOT NULL DEFAULT ''")
    if "type_role" not in fdv_cols:
        cursor.execute("ALTER TABLE fdv ADD COLUMN type_role TEXT NOT NULL DEFAULT ''")
    if "cdz" not in fdv_cols:
        cursor.execute("ALTER TABLE fdv ADD COLUMN cdz TEXT NOT NULL DEFAULT ''")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fdv_role ON fdv(role)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fdv_type_role ON fdv(type_role)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fdv_cdz ON fdv(cdz)")

    # Migration for file_content column in file_metadata
    cursor.execute("PRAGMA table_info(file_metadata)")
    meta_cols = {row[1] for row in cursor.fetchall()}
    if "file_content" not in meta_cols:
        cursor.execute("ALTER TABLE file_metadata ADD COLUMN file_content BLOB")

    # Migration for converting HT to TTC in quantitative_data
    cursor.execute("SELECT COUNT(*) FROM quantitative_data WHERE famille = 'C.A (ht)'")
    if cursor.fetchone()[0] > 0:
        print("[MIGRATION] Migrating database quantitative_data from HT to TTC...")
        # Rename 'C.A (ht)' to 'C.A (TTC)'
        cursor.execute("UPDATE quantitative_data SET famille = 'C.A (TTC)' WHERE famille = 'C.A (ht)'")
        # Multiply all currency columns by 1.2
        cursor.execute("""
            UPDATE quantitative_data
            SET real = ROUND(real * 1.2),
                obj = ROUND(obj * 1.2),
                real_2025 = ROUND(real_2025 * 1.2),
                h_2024 = ROUND(h_2024 * 1.2),
                encours = ROUND(encours * 1.2),
                obj_mois = ROUND(obj_mois * 1.2),
                raf = ROUND(raf * 1.2)
        """)

    # 14. Anomalies table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        type_anomali TEXT NOT NULL,
        commentaire TEXT,
        tag TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    try:
        cursor.execute("ALTER TABLE anomalies ADD COLUMN commentaire TEXT")
    except Exception:
        pass
    try:
        cursor.execute("ALTER TABLE anomalies ADD COLUMN tag TEXT")
    except Exception:
        pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_date ON anomalies(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_anomalies_vendeur ON anomalies(vendeur)")

    # 15. Tasks and Subtasks tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        creator TEXT DEFAULT 'me',
        assignee_type TEXT NOT NULL,
        assignee TEXT NOT NULL,
        date TEXT NOT NULL,
        priority TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Start',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS subtasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    )
    """)

    conn.commit()
    conn.close()
    print("[OK] Database tables created successfully!")


def save_file_metadata(date, file_name, file_size):
    """Save file metadata"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO file_metadata (date, file_name, file_size)
        VALUES (?, ?, ?)
    """, (date, file_name, file_size))
    conn.commit()
    conn.close()

def get_file_metadata(date):
    """Get file metadata"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_name, file_size FROM file_metadata WHERE date = ?", (date,))
    row = cursor.fetchone()
    conn.close()
    if row:
        return {"file_name": row["file_name"], "file_size": row["file_size"]}
    return None

def save_quantitative_data(date, data_dict):
    """Save quantitative data as separate columns"""
    conn = get_db_connection()
    cursor = conn.cursor()

    for q in data_dict:
        if q.get("famille"):
            cursor.execute("""
            INSERT OR REPLACE INTO quantitative_data
            (date, vendeur, famille, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                date,
                q.get("vendeur", ""),
                q.get("famille", ""),
                q.get("real", 0),
                q.get("obj", 0),
                q.get("percent", 0.0),
                q.get("real_2025", 0),
                q.get("h_2024", 0),
                q.get("h_pct", 0.0),
                q.get("encours", 0),
                q.get("obj_mois", 0),
                q.get("raf", 0)
            ))

    conn.commit()
    conn.close()

def get_quantitative_data(date, exclude_families=None):
    """Get quantitative data from column-based table"""
    if exclude_families is None:
        exclude_families = []
    else:
        exclude_families = list(exclude_families)
    
    if "MISWAK" not in [f.strip().upper() for f in exclude_families]:
        exclude_families.append("MISWAK")

    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
    SELECT vendeur, famille, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf
    FROM quantitative_data
    WHERE date = ?
    """
    params = [date]

    if exclude_families and exclude_families:
        placeholders = ",".join(["?" for _ in exclude_families])
        query += f" AND famille NOT IN ({placeholders})"
        params.extend(exclude_families)

    query += " ORDER BY vendeur, famille"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    # Convert to list of dicts
    return [dict(row) for row in rows]

def save_qualitative_data(date, data):
    """Save qualitative data from table"""
    conn = get_db_connection()
    cursor = conn.cursor()

    if data:
        cursor.execute("""
        INSERT OR REPLACE INTO qualitative_data
        (date, vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            date,
            data.get("vendeur", ""),
            data.get("clt_programme", 0),
            data.get("clt_facture", 0),
            data.get("acm", 0.0),
            data.get("tsm", 0.0),
            data.get("line", 0.0),
            data.get("raf_tsm", 0),
            data.get("raf_acm", 0)
        ))

    conn.commit()
    conn.close()

def get_qualitative_data(date):
    """Get qualitative data from column-based table"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
    SELECT vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm
    FROM qualitative_data
    WHERE date = ?
    """, (date,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]

def save_focus_vmm_data(date, data_list):
    """Save focus VMM data as separate columns"""
    conn = get_db_connection()
    cursor = conn.cursor()

    for f in data_list:
        if f.get("vendeur") and f.get("secteur"):
            cursor.execute("""
            INSERT OR REPLACE INTO focus_vmm_data
            (date, vendeur, secteur, dn_fin_mai, obj_juin, nb_clients, obj_acm, percent, realise, rest, jour_rest, rest_jour)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                date,
                f.get("vendeur", ""),
                f.get("secteur", ""),
                f.get("dn_fin_mai", 0.0),
                f.get("obj_juin", 0.0),
                f.get("nb_clients", 0),
                f.get("obj_acm", 0),
                f.get("percent", 0.0),
                f.get("realise", 0.0),
                f.get("rest", 0.0),
                f.get("jour_rest", 0),
                f.get("rest_jour", 0.0)
            ))

    conn.commit()
    conn.close()

def get_focus_vmm_data(date, exclude_families=None):
    """Get focus VMM data from rankings and objectives tables instead of legacy sheet table"""
    conn = get_db_connection()
    cursor = conn.cursor()

    dyn_days = get_dynamic_workdays(date)
    jour_rest = dyn_days["rest"]

    # Get unique vendeurs to exclude based on exclude_families
    vendeurs_exclude = set()
    if exclude_families and exclude_families:
        family_vendeurs_query = """
        SELECT DISTINCT vendeur FROM quantitative_data
        WHERE date = ? AND famille IN ({})
        """.format(",".join(["?" for _ in exclude_families]))
        family_vendeurs_params = [date] + exclude_families
        family_vendeurs_cursor = conn.cursor()
        family_vendeurs_cursor.execute(family_vendeurs_query, family_vendeurs_params)
        for row in family_vendeurs_cursor.fetchall():
            if row["vendeur"]:
                vendeurs_exclude.add(row["vendeur"].strip().upper())

    # Find latest date in focus_rankings that is <= date, fallback to latest
    cursor.execute("SELECT DISTINCT upload_date FROM focus_rankings ORDER BY upload_date DESC")
    dates = [row[0] for row in cursor.fetchall()]
    if not dates:
        conn.close()
        return []

    target_date = dates[0]
    for d in dates:
        if d <= date:
            target_date = d
            break

    # Now query the rankings for this target_date
    cursor.execute("""
        SELECT representative as vendeur, secteur, deviation as percent
        FROM focus_rankings
        WHERE upload_date = ? AND focus_type = 'TOMATE_FRITO'
    """, (target_date,))
    rankings = [dict(r) for r in cursor.fetchall()]

    # Query objectives
    cursor.execute("""
        SELECT vendeur, secteur, obj_acm, number_client as nb_clients, obj_juin
        FROM focus_objectives
        WHERE focus_type = 'TOMATE_FRITO'
    """)
    objectives = [dict(o) for o in cursor.fetchall()]
    conn.close()

    # Map objectives by vendeur code
    objs_by_code = {}
    for o in objectives:
        if o['vendeur']:
            code = o['vendeur'].split()[0].upper()
            objs_by_code[code] = o

    merged_list = []
    for r in rankings:
        v_name = r['vendeur']
        if not v_name:
            continue
        v_upper = v_name.strip().upper()
        
        # Check exclusion
        is_excluded = False
        for ex in vendeurs_exclude:
            if ex in v_upper:
                is_excluded = True
                break
        if is_excluded:
            continue

        code = v_name.split()[0].upper()
        obj = objs_by_code.get(code)

        # Calculate realise and rest
        obj_acm = obj['obj_acm'] if obj else 0.0
        dev = r['percent'] or 0.0
        realise = (1.0 + dev) * obj_acm if obj_acm > 0 else 0.0
        rest = obj_acm - realise

        merged_list.append({
            "vendeur": v_name,
            "secteur": r["secteur"],
            "dn_fin_mai": 0.0,
            "obj_juin": obj["obj_juin"] if obj else 0.0,
            "nb_clients": obj["nb_clients"] if obj else 0,
            "obj_acm": obj_acm,
            "percent": dev,
            "realise": realise,
            "rest": rest,
            "jour_rest": jour_rest,
            "rest_jour": rest / float(jour_rest) if (rest > 0 and jour_rest > 0) else 0.0
        })

    # Add virtual representative 'AUTRE' with averages of focus metrics
    if merged_list:
        avg_vmm = {
            "vendeur": "AUTRE",
            "secteur": "AUTRES SECTEURS",
            "dn_fin_mai": 0.0,
            "obj_juin": sum(x["obj_juin"] for x in merged_list) / len(merged_list),
            "nb_clients": int(sum(x["nb_clients"] for x in merged_list) / len(merged_list)),
            "obj_acm": sum(x["obj_acm"] for x in merged_list) / len(merged_list),
            "percent": sum(x["percent"] for x in merged_list) / len(merged_list),
            "realise": sum(x["realise"] for x in merged_list) / len(merged_list),
            "rest": sum(x["rest"] for x in merged_list) / len(merged_list),
            "jour_rest": jour_rest,
            "rest_jour": sum(x["rest_jour"] for x in merged_list) / len(merged_list)
        }
        merged_list.append(avg_vmm)

    return merged_list

def save_focus_som_data(date, data_list):
    """Save focus SOM data as separate columns"""
    conn = get_db_connection()
    cursor = conn.cursor()

    for f in data_list:
        if f.get("vendeur") and f.get("secteur"):
            cursor.execute("""
            INSERT OR REPLACE INTO focus_som_data
            (date, vendeur, secteur, glace_ht, ttc, percent, realise, rest, rest_jour, jour_rest)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                date,
                f.get("vendeur", ""),
                f.get("secteur", ""),
                f.get("glace_ht", 0.0),
                f.get("ttc", 0.0),
                f.get("percent", 0.0),
                f.get("realise", 0.0),
                f.get("rest", 0.0),
                f.get("rest_jour", 0.0),
                f.get("jour_rest", 0)
            ))

    conn.commit()
    conn.close()

def get_focus_som_data(date, exclude_families=None):
    """Get focus SOM data from rankings and objectives tables instead of legacy sheet table"""
    conn = get_db_connection()
    cursor = conn.cursor()

    dyn_days = get_dynamic_workdays(date)
    jour_rest = dyn_days["rest"]

    # Get unique vendeurs to exclude based on exclude_families
    vendeurs_exclude = set()
    if exclude_families and exclude_families:
        family_vendeurs_query = """
        SELECT DISTINCT vendeur FROM quantitative_data
        WHERE date = ? AND famille IN ({})
        """.format(",".join(["?" for _ in exclude_families]))
        family_vendeurs_params = [date] + exclude_families
        family_vendeurs_cursor = conn.cursor()
        family_vendeurs_cursor.execute(family_vendeurs_query, family_vendeurs_params)
        for row in family_vendeurs_cursor.fetchall():
            if row["vendeur"]:
                vendeurs_exclude.add(row["vendeur"].strip().upper())

    # Find latest date in focus_rankings that is <= date, fallback to latest
    cursor.execute("SELECT DISTINCT upload_date FROM focus_rankings ORDER BY upload_date DESC")
    dates = [row[0] for row in cursor.fetchall()]
    if not dates:
        conn.close()
        return []

    target_date = dates[0]
    for d in dates:
        if d <= date:
            target_date = d
            break

    # Now query the rankings for this target_date
    cursor.execute("""
        SELECT representative as vendeur, secteur, deviation as percent
        FROM focus_rankings
        WHERE upload_date = ? AND focus_type = 'GLACE'
    """, (target_date,))
    rankings = [dict(r) for r in cursor.fetchall()]

    # Query objectives
    cursor.execute("""
        SELECT vendeur, secteur, ttc, glace_ht
        FROM focus_objectives
        WHERE focus_type = 'GLACE'
    """)
    objectives = [dict(o) for o in cursor.fetchall()]
    conn.close()

    # Map objectives by vendeur code
    objs_by_code = {}
    for o in objectives:
        if o['vendeur']:
            code = o['vendeur'].split()[0].upper()
            objs_by_code[code] = o

    merged_list = []
    for r in rankings:
        v_name = r['vendeur']
        if not v_name:
            continue
        v_upper = v_name.strip().upper()
        
        # Check exclusion
        is_excluded = False
        for ex in vendeurs_exclude:
            if ex in v_upper:
                is_excluded = True
                break
        if is_excluded:
            continue

        code = v_name.split()[0].upper()
        obj = objs_by_code.get(code)

        # Calculate realise and rest
        ttc = obj['ttc'] if obj else 0.0
        dev = r['percent'] or 0.0
        realise = (1.0 + dev) * ttc if ttc > 0 else 0.0
        rest = ttc - realise

        merged_list.append({
            "vendeur": v_name,
            "secteur": r["secteur"],
            "glace_ht": obj["glace_ht"] if obj else 0.0,
            "ttc": ttc,
            "percent": dev,
            "realise": realise,
            "rest": rest,
            "jour_rest": jour_rest,
            "rest_jour": rest / float(jour_rest) if (rest > 0 and jour_rest > 0) else 0.0
        })

    # Add virtual representative 'AUTRE' with averages of focus metrics
    if merged_list:
        avg_som = {
            "vendeur": "AUTRE",
            "secteur": "AUTRES SECTEURS",
            "glace_ht": sum(x["glace_ht"] for x in merged_list) / len(merged_list),
            "ttc": sum(x["ttc"] for x in merged_list) / len(merged_list),
            "percent": sum(x["percent"] for x in merged_list) / len(merged_list),
            "realise": sum(x["realise"] for x in merged_list) / len(merged_list),
            "rest": sum(x["rest"] for x in merged_list) / len(merged_list),
            "jour_rest": jour_rest,
            "rest_jour": sum(x["rest_jour"] for x in merged_list) / len(merged_list)
        }
        merged_list.append(avg_som)

    return merged_list

def save_settings(date, rest_days, exclude_families):
    """Save settings for a specific date"""
    conn = get_db_connection()
    cursor = conn.cursor()
    exclude_str = str(exclude_families) if exclude_families else None

    cursor.execute("""
    INSERT OR REPLACE INTO settings (date, rest_days, exclude_families)
    VALUES (?, ?, ?)
    """, (date, rest_days, exclude_str))
    conn.commit()
    conn.close()

def get_settings(date):
    """Get settings for a specific date"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT rest_days, exclude_families FROM settings WHERE date = ?", (date,))
    row = cursor.fetchone()
    conn.close()

    if row:
        try:
            exclude_families = eval(row["exclude_families"]) if row["exclude_families"] else []
        except Exception:
            exclude_families = []
        return {
            "rest_days": row["rest_days"],
            "exclude_families": exclude_families
        }
    return None

def get_all_suivi_dates():
    """Get all dates with data"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Get dates from quantitative data
    cursor.execute("""
    SELECT DISTINCT date FROM quantitative_data
    ORDER BY date DESC
    """)

    dates = [row["date"] for row in cursor.fetchall()]

    conn.close()
    return dates

def get_workdays_info(rest_days, date_str=None):
    from data_processor import calculate_calendar_workdays
    
    if date_str:
        try:
            dynamic_days = calculate_calendar_workdays(date_str)
            total = dynamic_days["total"]
            elapsed = dynamic_days["elapsed"]
            rest = dynamic_days["rest"]
            
            # Respect manual override if it is not the default fallback (20) and differs from dynamic calculation
            if rest_days is not None:
                try:
                    custom_rest = int(rest_days)
                    if custom_rest != 20 and custom_rest != rest:
                        rest = custom_rest
                        elapsed = max(0, total - rest)
                except ValueError:
                    pass
            return {"elapsed": elapsed, "total": total, "rest": rest}
        except Exception as e:
            print(f"Error in dynamic get_workdays_info: {e}")

    total = 24
    # Always compute elapsed from total - rest_days for accuracy
    elapsed = max(0, total - int(rest_days))
    return {"elapsed": elapsed, "total": total, "rest": rest_days}

def get_all_suivi_data_records():
    """Get one record per date (bulk-fetched)."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT DISTINCT date FROM quantitative_data ORDER BY date ASC")
    dates = [row["date"] for row in cursor.fetchall()]

    if not dates:
        conn.close()
        return []

    # Bulk fetch all 4 tables in 4 queries instead of 4*N
    placeholders = ",".join(["?" for _ in dates])

    cursor.execute(
        f"SELECT vendeur, famille, real, obj, percent, real_2025, h_2024, h_pct, "
        f"encours, obj_mois, raf, date FROM quantitative_data WHERE date IN ({placeholders})",
        dates,
    )
    quant_rows = cursor.fetchall()

    cursor.execute(
        f"SELECT vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm, date "
        f"FROM qualitative_data WHERE date IN ({placeholders})",
        dates,
    )
    qual_rows = cursor.fetchall()

    cursor.execute(
        f"SELECT vendeur, secteur, dn_fin_mai, obj_juin, nb_clients, obj_acm, percent, "
        f"realise, rest, jour_rest, rest_jour, date FROM focus_vmm_data WHERE date IN ({placeholders})",
        dates,
    )
    vmm_rows = cursor.fetchall()

    cursor.execute(
        f"SELECT vendeur, secteur, glace_ht, ttc, percent, realise, rest, rest_jour, "
        f"jour_rest, date FROM focus_som_data WHERE date IN ({placeholders})",
        dates,
    )
    som_rows = cursor.fetchall()

    cursor.execute(
        f"SELECT date, rest_days, exclude_families FROM settings WHERE date IN ({placeholders})",
        dates,
    )
    settings_rows = {row["date"]: row for row in cursor.fetchall()}

    conn.close()

    # Bucket rows by date once
    from collections import defaultdict
    quant_by_date = defaultdict(list)
    for r in quant_rows:
        quant_by_date[r["date"]].append(r)

    qual_by_date = defaultdict(list)
    for r in qual_rows:
        qual_by_date[r["date"]].append(r)

    vmm_by_date = defaultdict(list)
    for r in vmm_rows:
        vmm_by_date[r["date"]].append(r)

    som_by_date = defaultdict(list)
    for r in som_rows:
        som_by_date[r["date"]].append(r)

    records = []
    for date in dates:
        # Group quantitative by (vendeur, famille) and sum the metrics
        grouped_quant = {}
        for q in quant_by_date.get(date, []):
            key = f"{q['vendeur']}_{q['famille']}"
            if key not in grouped_quant:
                grouped_quant[key] = {
                    "vendeur": q["vendeur"],
                    "famille": q["famille"],
                    "real": q["real"],
                    "obj": q["obj"],
                    "percent": q["percent"],
                    "real_2025": q["real_2025"],
                    "h_2024": q["h_2024"],
                    "h_pct": q["h_pct"],
                    "encours": q["encours"],
                    "obj_mois": q["obj_mois"],
                    "raf": q["raf"],
                }
            else:
                g = grouped_quant[key]
                g["real"] += q["real"]
                g["obj"] += q["obj"]
                g["percent"] = (g["real"] / g["obj"] - 1.0) * 100 if g["obj"] > 0 else 0
                g["real_2025"] += q["real_2025"]
                g["h_2024"] += q["h_2024"]
                g["h_pct"] = (g["h_2024"] / q["obj"] * 100) if q["obj"] > 0 else 0
                g["encours"] += q["encours"]
                g["obj_mois"] += q["obj_mois"]
                g["raf"] += q["raf"]

        quant_list = list(grouped_quant.values())

        s = settings_rows.get(date)
        if s:
            rest_days = s["rest_days"] or 20
            try:
                exclude_families = eval(s["exclude_families"]) if s["exclude_families"] else []
            except Exception:
                exclude_families = []
        else:
            rest_days = 20
            exclude_families = []

        records.append({
            "date": date,
            "data": {
                "quantitative": quant_list,
                "qualitative": list(qual_by_date.get(date, [])),
                "focus_vmm": list(vmm_by_date.get(date, [])),
                "focus_som": list(som_by_date.get(date, [])),
                "workdays": get_workdays_info(rest_days, date),
                "exclude_families": exclude_families,
                "all_families": list({q["famille"] for q in quant_list if q["famille"]}),
            },
        })

    return records

def get_full_data(date):
    """Get complete data for a date"""
    # Get settings first to retrieve exclude_families
    settings = get_settings(date)
    if settings:
        rest_days = settings.get("rest_days") or 20
        exclude_families = settings.get("exclude_families") or []
    else:
        rest_days = 20
        exclude_families = []

    quant_data = get_quantitative_data(date, exclude_families)
    qual_data = get_qualitative_data(date)
    vmm_data = get_focus_vmm_data(date, exclude_families)
    som_data = get_focus_som_data(date, exclude_families)

    # Group quantitative data by vendeur and famille
    grouped_quant = {}
    for q in quant_data:
        key = f"{q['vendeur']}_{q['famille']}"
        if key not in grouped_quant:
            grouped_quant[key] = {
                "vendeur": q["vendeur"],
                "famille": q["famille"],
                "real": q["real"],
                "obj": q["obj"],
                "percent": q["percent"],
                "real_2025": q["real_2025"],
                "h_2024": q["h_2024"],
                "h_pct": q["h_pct"],
                "encours": q["encours"],
                "obj_mois": q["obj_mois"],
                "raf": q["raf"]
            }
        else:
            grouped_quant[key]["real"] += q["real"]
            grouped_quant[key]["obj"] += q["obj"]
            grouped_quant[key]["percent"] = (grouped_quant[key]["real"] / grouped_quant[key]["obj"] - 1.0) * 100 if grouped_quant[key]["obj"] > 0 else 0
            grouped_quant[key]["real_2025"] += q["real_2025"]
            grouped_quant[key]["h_2024"] += q["h_2024"]
            grouped_quant[key]["h_pct"] = (grouped_quant[key]["h_2024"] / q["obj"] * 100) if q["obj"] > 0 else 0
            grouped_quant[key]["encours"] += q["encours"]
            grouped_quant[key]["obj_mois"] += q["obj_mois"]
            grouped_quant[key]["raf"] += q["raf"]

    qual_list = []
    if qual_data:
        if isinstance(qual_data, list):
            qual_list = qual_data
        else:
            qual_list = [qual_data]

    return {
        "quantitative": list(grouped_quant.values()),
        "qualitative": qual_list,
        "focus_vmm": vmm_data,
        "focus_som": som_data,
        "workdays": get_workdays_info(rest_days, date),
        "exclude_families": exclude_families,
        "all_families": list(set(q["famille"] for q in quant_data if q["famille"]))
    }


def get_suivi_data(date):
    """Backward-compatible alias for get_full_data"""
    return get_full_data(date)


def save_suivi_data(date, data):
    """Save full suivi payload to the database, splitting into the column tables."""
    if not data:
        return False

    quantitative = data.get("quantitative") or []
    qualitative = data.get("qualitative") or []
    focus_vmm = data.get("focus_vmm") or []
    focus_som = data.get("focus_som") or []

    # Clear old records for this date to avoid orphaned rows
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM quantitative_data WHERE date = ?", (date,))
        cursor.execute("DELETE FROM qualitative_data WHERE date = ?", (date,))
        cursor.execute("DELETE FROM focus_vmm_data WHERE date = ?", (date,))
        cursor.execute("DELETE FROM focus_som_data WHERE date = ?", (date,))
        conn.commit()
    except Exception as e:
        print(f"Error clearing old data for {date}: {e}")
    finally:
        conn.close()

    try:
        if quantitative:
            save_quantitative_data(date, quantitative)
        if qualitative:
            for q in qualitative:
                save_qualitative_data(date, q)
        if focus_vmm:
            save_focus_vmm_data(date, focus_vmm)
        if focus_som:
            save_focus_som_data(date, focus_som)
        return True
    except Exception as e:
        print(f"Error saving suivi data: {e}")
        return False


def get_suivi_settings(date):
    """Backward-compatible alias for get_settings"""
    return get_settings(date)


def save_suivi_settings(date, rest_days, exclude_families):
    """Backward-compatible alias for save_settings"""
    return save_settings(date, rest_days, exclude_families)

def save_suivi_file(date, file_name, file_content):
    """Save raw file content"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT OR REPLACE INTO file_metadata (date, file_name, file_size, file_content)
        VALUES (?, ?, ?, ?)
    """, (date, file_name, len(file_content), sqlite3.Binary(file_content)))
    conn.commit()
    conn.close()

def get_suivi_file(date):
    """Get raw file content"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT file_name, file_content FROM file_metadata WHERE date = ?", (date,))
    row = cursor.fetchone()
    conn.close()
    if row and row["file_name"]:
        content = row["file_content"] if row["file_content"] else b""
        return content, row["file_name"]
    return None, None


# ------------------------------------------------------------------
# Clients Full (raw client list with duplicates)
# ------------------------------------------------------------------

def clear_clients_full():
    """Wipe the clients_full table (used on re-import)."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM clients_full")
    cursor.execute("DELETE FROM sqlite_sequence WHERE name='clients_full'")
    conn.commit()
    conn.close()


def reset_all_database_tables():
    """Drop all tables and recreate them to reset the database completely"""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    tables = [
        "quantitative_data",
        "qualitative_data",
        "focus_vmm_data",
        "focus_som_data",
        "settings",
        "file_metadata",
        "clients_full",
        "fdv"
    ]
    
    for table in tables:
        cursor.execute(f"DROP TABLE IF EXISTS {table}")
        
    conn.commit()
    conn.close()
    
    # Re-initialize tables
    init_db()
    return True


def reset_specific_tables(tables_to_reset):
    """Drop specific tables and recreate them"""
    valid_tables = {
        "quantitative_data",
        "qualitative_data",
        "focus_vmm_data",
        "focus_som_data",
        "settings",
        "file_metadata",
        "clients_full",
        "fdv"
    }
    conn = get_db_connection()
    cursor = conn.cursor()
    
    for table in tables_to_reset:
        if table in valid_tables:
            cursor.execute(f"DROP TABLE IF EXISTS [{table}]")
            
    conn.commit()
    conn.close()
    
    # Re-initialize tables
    init_db()
    return True




def insert_clients_full(rows):
    """Bulk-insert rows into clients_full.

    Each row dict must contain: code, name, secteur, localite,
    vendeur_som, vendeur_vmm, is_repeat, row_index
    """
    if not rows:
        return 0
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.executemany(
        """INSERT INTO clients_full
           (code, name, secteur, localite, vendeur_som, vendeur_vmm, is_repeat, row_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        [
            (
                r.get("code", ""),
                r.get("name", ""),
                r.get("secteur", ""),
                r.get("localite", ""),
                r.get("vendeur_som", ""),
                r.get("vendeur_vmm", ""),
                1 if r.get("is_repeat") else 0,
                r.get("row_index", 0),
            )
            for r in rows
        ],
    )
    conn.commit()
    conn.close()
    return len(rows)


def get_clients_full(
    search=None,
    secteurs=None,
    localites=None,
    vendeurs_som=None,
    vendeurs_vmm=None,
    is_repeat=None,
    unique=False,
    sort_by="row_index",
    sort_dir="ASC",
    page=1,
    per_page=25,
):
    """List clients_full with server-side filtering, search, sorting and pagination.

    `is_repeat` accepts: None (all), 1 (only repeats), 0 (only unique).
    `unique` (bool) returns one row per `code` (the row with the smallest `id`).
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    where_parts = []
    params = []

    if search:
        like = f"%{search.strip()}%"
        where_parts.append("(code LIKE ? OR name LIKE ? OR localite LIKE ?)")
        params.extend([like, like, like])

    if secteurs:
        placeholders = ",".join(["?" for _ in secteurs])
        where_parts.append(f"secteur IN ({placeholders})")
        params.extend(secteurs)

    if localites:
        placeholders = ",".join(["?" for _ in localites])
        where_parts.append(f"localite IN ({placeholders})")
        params.extend(localites)

    if vendeurs_som:
        placeholders = ",".join(["?" for _ in vendeurs_som])
        where_parts.append(f"vendeur_som IN ({placeholders})")
        params.extend(vendeurs_som)

    if vendeurs_vmm:
        placeholders = ",".join(["?" for _ in vendeurs_vmm])
        where_parts.append(f"vendeur_vmm IN ({placeholders})")
        params.extend(vendeurs_vmm)

    if is_repeat is not None:
        where_parts.append("is_repeat = ?")
        params.append(1 if is_repeat else 0)

    where_clause = "WHERE " + " AND ".join(where_parts) if where_parts else ""

    # When `unique=True`, group by code and pick one representative row
    # (the one with the smallest id) for each code.
    if unique:
        # Aggregate the matching rows and keep the earliest one per code.
        # We use a subquery to find min(id) for each code under the filter,
        # then join back to fetch the full row.
        if where_parts:
            inner_where = where_clause
            outer_where = "WHERE id IN (SELECT MIN(id) FROM clients_full " + inner_where + " GROUP BY code)"
            count_query = (
                f"SELECT COUNT(*) AS c FROM (SELECT code FROM clients_full "
                f"{inner_where} GROUP BY code)"
            )
            count_params = list(params)
        else:
            outer_where = ""
            count_query = "SELECT COUNT(DISTINCT code) AS c FROM clients_full"
            count_params = []
    else:
        outer_where = ""
        count_query = f"SELECT COUNT(*) AS c FROM clients_full {where_clause}"
        count_params = list(params)

    cursor.execute(count_query, count_params)
    total = cursor.fetchone()["c"]

    # Whitelist of sortable columns to avoid SQL injection
    sort_columns = {
        "code": "code",
        "name": "name",
        "secteur": "secteur",
        "localite": "localite",
        "vendeur_som": "vendeur_som",
        "vendeur_vmm": "vendeur_vmm",
        "is_repeat": "is_repeat",
        "row_index": "row_index",
    }
    sort_col = sort_columns.get(sort_by, "row_index")
    sort_direction = "DESC" if (sort_dir or "").upper() == "DESC" else "ASC"

    # Paginated rows
    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 25), 500))
    offset = (page - 1) * per_page

    if unique:
        if where_parts:
            list_query = (
                f"SELECT id, code, name, secteur, localite, vendeur_som, vendeur_vmm, "
                f"is_repeat, row_index FROM clients_full "
                f"WHERE id IN (SELECT MIN(id) FROM clients_full {where_clause} GROUP BY code) "
                f"ORDER BY {sort_col} {sort_direction}, id {sort_direction} "
                f"LIMIT ? OFFSET ?"
            )
        else:
            list_query = (
                f"SELECT id, code, name, secteur, localite, vendeur_som, vendeur_vmm, "
                f"is_repeat, row_index FROM clients_full "
                f"WHERE id IN (SELECT MIN(id) FROM clients_full GROUP BY code) "
                f"ORDER BY {sort_col} {sort_direction}, id {sort_direction} "
                f"LIMIT ? OFFSET ?"
            )
    else:
        list_query = (
            f"SELECT id, code, name, secteur, localite, vendeur_som, vendeur_vmm, "
            f"is_repeat, row_index FROM clients_full {where_clause} "
            f"ORDER BY {sort_col} {sort_direction}, id {sort_direction} "
            f"LIMIT ? OFFSET ?"
        )
    cursor.execute(list_query, params + [per_page, offset])
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()

    return {
        "rows": rows,
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": max(1, (total + per_page - 1) // per_page),
    }


def get_clients_full_filters():
    """Return distinct values for each filterable field."""
    conn = get_db_connection()
    cursor = conn.cursor()

    def distinct(col):
        cursor.execute(
            f"SELECT DISTINCT {col} AS v FROM clients_full "
            f"WHERE {col} IS NOT NULL AND {col} != '' "
            f"ORDER BY {col} COLLATE NOCASE ASC"
        )
        return [r["v"] for r in cursor.fetchall()]

    result = {
        "secteurs": distinct("secteur"),
        "localites": distinct("localite"),
        "vendeurs_som": distinct("vendeur_som"),
        "vendeurs_vmm": distinct("vendeur_vmm"),
    }
    conn.close()
    return result


def get_clients_full_stats():
    """Return summary statistics for the clients_full table."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) AS c FROM clients_full")
    total = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) AS c FROM clients_full WHERE is_repeat = 1")
    repeats = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(DISTINCT code) AS c FROM clients_full")
    unique_codes = cursor.fetchone()["c"]

    cursor.execute(
        "SELECT secteur, COUNT(*) AS c FROM clients_full "
        "GROUP BY secteur ORDER BY c DESC"
    )
    by_secteur = [dict(r) for r in cursor.fetchall()]

    cursor.execute(
        "SELECT vendeur_som, vendeur_vmm, COUNT(*) AS c FROM clients_full "
        "GROUP BY vendeur_som, vendeur_vmm ORDER BY c DESC"
    )
    by_vendeur = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "total": total,
        "repeats": repeats,
        "unique": total - repeats,
        "unique_codes": unique_codes,
        "by_secteur": by_secteur,
        "by_vendeur": by_vendeur,
    }


# ------------------------------------------------------------------
# FDV (Force De Vente) - sales force roster
# ------------------------------------------------------------------

def get_fdv_list(search=None, secteur=None, activite=None, role=None, type_role=None, cdz=None,
                 sort_by='vendeur', sort_dir='ASC'):
    """Return the FDV roster with optional filtering / sorting."""
    conn = get_db_connection()
    cursor = conn.cursor()

    where_parts = []
    params = []
    if search:
        like = f"%{search.strip()}%"
        where_parts.append(
            "(vendeur LIKE ? OR telephone LIKE ? OR whatsapp LIKE ? "
            "OR secteur LIKE ? OR notes LIKE ? OR recrutement LIKE ? "
            "OR role LIKE ? OR type_role LIKE ? OR cdz LIKE ?)"
        )
        params.extend([like, like, like, like, like, like, like, like, like])
    if secteur:
        where_parts.append("secteur = ?")
        params.append(secteur)
    if activite:
        where_parts.append("activite = ?")
        params.append(activite)
    if role:
        where_parts.append("role = ?")
        params.append(role)
    if type_role:
        where_parts.append("type_role = ?")
        params.append(type_role)
    if cdz:
        where_parts.append("cdz = ?")
        params.append(cdz)

    where_clause = "WHERE " + " AND ".join(where_parts) if where_parts else ""

    sort_columns = {
        "vendeur": "vendeur",
        "role": "role",
        "type_role": "type_role",
        "cdz": "cdz",
        "activite": "activite",
        "secteur": "secteur",
        "telephone": "telephone",
        "whatsapp": "whatsapp",
        "recrutement": "recrutement",
        "updated_at": "updated_at",
    }
    sort_col = sort_columns.get(sort_by, "vendeur")
    sort_direction = "DESC" if (sort_dir or "").upper() == "DESC" else "ASC"

    cursor.execute(
        f"SELECT id, vendeur, role, type_role, cdz, activite, secteur, telephone, "
        f"whatsapp, recrutement, notes, created_at, updated_at "
        f"FROM fdv {where_clause} "
        f"ORDER BY {sort_col} {sort_direction}, id ASC",
        params,
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return rows


def get_fdv_by_id(fdv_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, vendeur, role, type_role, cdz, activite, secteur, telephone, "
        "whatsapp, recrutement, notes, created_at, updated_at "
        "FROM fdv WHERE id = ?",
        (fdv_id,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def get_fdv_by_vendeur(vendeur):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, vendeur, role, type_role, cdz, activite, secteur, telephone, "
        "whatsapp, recrutement, notes, created_at, updated_at "
        "FROM fdv WHERE vendeur = ?",
        (vendeur,),
    )
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def create_fdv(data):
    """Insert a new FDV row. Returns the new id."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """INSERT INTO fdv (vendeur, role, type_role, cdz, activite, secteur, telephone,
                            whatsapp, recrutement, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            (data.get("vendeur") or "").strip(),
            (data.get("role") or "").strip(),
            (data.get("type_role") or "").strip(),
            (data.get("cdz") or "").strip(),
            (data.get("activite") or "ACTIF").strip() or "ACTIF",
            (data.get("secteur") or "").strip(),
            (data.get("telephone") or "").strip(),
            (data.get("whatsapp") or "").strip(),
            (data.get("recrutement") or "").strip(),
            (data.get("notes") or "").strip(),
        ),
    )
    new_id = cursor.lastrowid
    conn.commit()
    conn.close()
    return new_id


def update_fdv(fdv_id, data):
    """Update an existing FDV row. Returns True on success."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        """UPDATE fdv SET
            vendeur = ?,
            role = ?,
            type_role = ?,
            cdz = ?,
            activite = ?,
            secteur = ?,
            telephone = ?,
            whatsapp = ?,
            recrutement = ?,
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
           WHERE id = ?""",
        (
            (data.get("vendeur") or "").strip(),
            (data.get("role") or "").strip(),
            (data.get("type_role") or "").strip(),
            (data.get("cdz") or "").strip(),
            (data.get("activite") or "ACTIF").strip() or "ACTIF",
            (data.get("secteur") or "").strip(),
            (data.get("telephone") or "").strip(),
            (data.get("whatsapp") or "").strip(),
            (data.get("recrutement") or "").strip(),
            (data.get("notes") or "").strip(),
            fdv_id,
        ),
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def delete_fdv(fdv_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM fdv WHERE id = ?", (fdv_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    return affected > 0


def get_fdv_filters():
    """Return distinct values for filterable fields."""
    conn = get_db_connection()
    cursor = conn.cursor()

    def distinct(col):
        cursor.execute(
            f"SELECT DISTINCT {col} AS v FROM fdv "
            f"WHERE {col} IS NOT NULL AND {col} != '' "
            f"ORDER BY {col} COLLATE NOCASE ASC"
        )
        return [r["v"] for r in cursor.fetchall()]

    result = {
        "secteurs": distinct("secteur"),
        "activites": distinct("activite"),
        "roles": distinct("role"),
        "type_roles": distinct("type_role"),
        "cdzs": distinct("cdz"),
    }
    conn.close()
    return result


def get_fdv_stats():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS c FROM fdv")
    total = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) AS c FROM fdv WHERE LOWER(activite) = 'actif'")
    actifs = cursor.fetchone()["c"]
    cursor.execute("SELECT COUNT(*) AS c FROM fdv WHERE LOWER(activite) != 'actif'")
    inactifs = cursor.fetchone()["c"]
    cursor.execute(
        "SELECT secteur, COUNT(*) AS c FROM fdv "
        "GROUP BY secteur ORDER BY c DESC"
    )
    by_secteur = [dict(r) for r in cursor.fetchall()]
    cursor.execute(
        "SELECT activite, COUNT(*) AS c FROM fdv "
        "GROUP BY activite ORDER BY c DESC"
    )
    by_etat = [dict(r) for r in cursor.fetchall()]
    cursor.execute(
        "SELECT role, COUNT(*) AS c FROM fdv "
        "GROUP BY role ORDER BY c DESC"
    )
    by_role = [dict(r) for r in cursor.fetchall()]
    cursor.execute(
        "SELECT type_role, COUNT(*) AS c FROM fdv "
        "GROUP BY type_role ORDER BY c DESC"
    )
    by_type_role = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {
        "total": total,
        "actifs": actifs,
        "inactifs": inactifs,
        "by_secteur": by_secteur,
        "by_etat": by_etat,
        "by_role": by_role,
        "by_type_role": by_type_role,
    }


# ------------------------------------------------------------------
# WhatsApp helpers
# ------------------------------------------------------------------

# Map from user-facing état labels to the canonical stored values.
ETAT_ALIASES = {
    "active": "ACTIF",
    "actif": "ACTIF",
    "congé": "CONGE",
    "conge": "CONGE",
    "remplacer": "REMPLACER",
    "remplaçant": "REMPLACER",
    "remplacant": "REMPLACER",
    "maladé": "MALADE",
    "malade": "MALADE",
    "suspendu": "SUSPENDU",
    "suspendue": "SUSPENDU",
}

ETAT_OPTIONS = [
    {"value": "ACTIF",     "label": "Active",     "color": "good"},
    {"value": "CONGE",     "label": "Congé",      "color": "warn"},
    {"value": "REMPLACER", "label": "Remplacer",  "color": "info"},
    {"value": "MALADE",    "label": "Maladé",     "color": "warn"},
    {"value": "SUSPENDU",  "label": "Suspendu",   "color": "bad"},
]

# Channel / activité (which product the vendeur covers).
ACTIVITE_OPTIONS = [
    {"value": "SOM",     "label": "SOM",         "color": "blue"},
    {"value": "VMM",     "label": "VMM",         "color": "pink"},
    {"value": "SOM VMM", "label": "SOM + VMM",   "color": "purple"},
]

# Type de profil vendeur.
TYPE_ROLE_OPTIONS = [
    {"value": "PREV", "label": "PREV (Pré-vendeur)",   "color": "blue"},
    {"value": "CNV",  "label": "CNV (Conventionnel)", "color": "amber"},
]

# Kept for back-compat with the seed scripts.
ROLE_OPTIONS = [o["value"] for o in ACTIVITE_OPTIONS]
TYPE_ROLE_VALUES = [o["value"] for o in TYPE_ROLE_OPTIONS]


def normalize_etat(value):
    """Normalize a user-provided État string to its canonical form."""
    if not value:
        return "ACTIF"
    raw = str(value).strip().lower()
    return ETAT_ALIASES.get(raw, str(value).strip().upper())


def parse_vendeur_code(vendeur):
    """Split a vendeur label like 'E14 BOUMDIANE MOHAMED' into
    (code, name). Names without a code (e.g. 'CHAKIB ELFIL') get
    ('', name).
    """
    if not vendeur:
        return "", ""
    parts = str(vendeur).strip().split(maxsplit=1)
    if not parts:
        return "", ""
    first = parts[0]
    # Heuristic: a code is 1-3 letters/digits, optionally with a digit
    # (e.g. "E14", "T96", "485", "CHAKIB", "F82", "K60").
    # We treat it as a code when it ends in a digit AND is short.
    if len(first) <= 5 and any(ch.isdigit() for ch in first):
        code = first
        name = parts[1] if len(parts) > 1 else ""
        return code, name
    return "", vendeur.strip()


def normalize_phone(raw):
    """Strip a phone number down to digits and a leading + when
    present, ready to be passed to wa.me.

    Returns None when the input is empty.
    """
    if not raw:
        return None
    s = str(raw).strip()
    if not s:
        return None
    # Drop whitespace and dashes but keep a leading +.
    keep_plus = s.startswith("+")
    digits = "".join(ch for ch in s if ch.isdigit())
    if not digits:
        return None
    return ("+" + digits) if keep_plus else digits


def build_whatsapp_url(phone, message, default_country="212"):
    """Build a wa.me link that opens a chat with the given phone
    number and pre-fills a message.

    For Moroccan numbers (default_country = "212") we accept
    inputs in 0XXXXXXXXX, +212XXXXXXXXX, 212XXXXXXXXX,
    +212 6XX-XX-XX-XX etc. and normalise to the form wa.me
    expects (no '+').
    """
    if not phone:
        return None
    raw = str(phone).strip()
    if not raw:
        return None
    keep_plus = raw.startswith("+")
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits:
        return None
    if keep_plus:
        wa_phone = digits  # already has country code
    else:
        # Local form: drop a leading 0 then add the country code.
        if digits.startswith("0"):
            digits = digits[1:]
        wa_phone = (default_country or "") + digits
    from urllib.parse import quote
    url = f"https://wa.me/{wa_phone}"
    if message:
        url += "?text=" + quote(message, safe="")
    return url


# ------------------------------------------------------------------
# Focus Rankings and Objectives functions
# ------------------------------------------------------------------

def save_focus_rankings(upload_date, rankings):
    """Save parsed representative rankings from focus2.xlsx"""
    conn = get_db_connection()
    cursor = conn.cursor()
    for r in rankings:
        cursor.execute("""
        INSERT OR REPLACE INTO focus_rankings 
        (upload_date, focus_type, rank, agence, secteur, representative, deviation, cdz)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            upload_date,
            r.get("focus_type"),
            r.get("rank"),
            r.get("agence"),
            r.get("secteur"),
            r.get("representative"),
            r.get("deviation"),
            r.get("cdz")
        ))
    conn.commit()
    conn.close()


def save_focus_cdz_rankings(upload_date, cdz_rankings):
    """Save parsed CDZ rankings from focus2.xlsx"""
    conn = get_db_connection()
    cursor = conn.cursor()
    for r in cdz_rankings:
        cursor.execute("""
        INSERT OR REPLACE INTO focus_cdz_rankings 
        (upload_date, focus_type, rank, cdz, agence, deviation)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (
            upload_date,
            r.get("focus_type"),
            r.get("rank"),
            r.get("cdz"),
            r.get("agence"),
            r.get("deviation")
        ))
    conn.commit()
    conn.close()


def save_focus_objectives(objectives):
    """Save parsed objectives from Focus.xlsx"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM focus_objectives")
    for o in objectives:
        cursor.execute("""
        INSERT INTO focus_objectives 
        (focus_type, vendeur, secteur, number_client, obj_acm, obj_juin, glace_ht, ttc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            o.get("focus_type"),
            o.get("vendeur"),
            o.get("secteur"),
            o.get("number_client", 0),
            o.get("obj_acm", 0.0),
            o.get("obj_juin", 0.0),
            o.get("glace_ht", 0.0),
            o.get("ttc", 0.0)
        ))
    conn.commit()
    conn.close()


def save_focus_names(som_name, vmm_name):
    """Save custom focus names (e.g. BECHAMEL, PESCADA ALGERIENNE)"""
    conn = get_db_connection()
    cursor = conn.cursor()
    if som_name:
        cursor.execute("INSERT OR REPLACE INTO focus_names (focus_type, focus_name) VALUES ('GLACE', ?)", (som_name.strip(),))
    if vmm_name:
        cursor.execute("INSERT OR REPLACE INTO focus_names (focus_type, focus_name) VALUES ('TOMATE_FRITO', ?)", (vmm_name.strip(),))
    conn.commit()
    conn.close()


def get_focus_names():
    """Retrieve custom focus names with default fallbacks"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT focus_type, focus_name FROM focus_names")
    rows = cursor.fetchall()
    conn.close()
    
    names = {"GLACE": "GLACE", "TOMATE_FRITO": "TOMATE FRITO"}
    for r in rows:
        names[r['focus_type']] = r['focus_name']
    return names


def get_latest_focus_upload_date():
    """Retrieve the latest upload date from rankings"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(upload_date) FROM focus_rankings")
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None


def get_focus_data(upload_date, agence='AGADIR'):
    """Fetch focus representative rankings and CDZ rankings for a specific upload date and agence."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Fetch representative rankings
    cursor.execute("""
        SELECT upload_date, focus_type, rank, agence, secteur, representative, deviation, cdz
        FROM focus_rankings
        WHERE upload_date = ? AND agence = ?
        ORDER BY rank ASC
    """, (upload_date, agence))
    rankings_rows = [dict(r) for r in cursor.fetchall()]
    
    # 2. Fetch CDZ rankings
    cursor.execute("""
        SELECT upload_date, focus_type, rank, cdz, agence, deviation
        FROM focus_cdz_rankings
        WHERE upload_date = ? AND agence = ?
        ORDER BY rank ASC
    """, (upload_date, agence))
    cdz_rows = [dict(r) for r in cursor.fetchall()]
    
    # 3. Fetch objectives
    cursor.execute("""
        SELECT focus_type, vendeur, secteur, number_client, obj_acm, obj_juin, glace_ht, ttc
        FROM focus_objectives
    """)
    objectives_rows = [dict(o) for o in cursor.fetchall()]
    conn.close()
    
    # Organize objectives by focus_type and vendeur code
    objectives_by_type_code = {}
    for obj in objectives_rows:
        ft = obj['focus_type']
        v = obj['vendeur']
        if not v:
            continue
        code = v.split()[0].upper()
        if ft not in objectives_by_type_code:
            objectives_by_type_code[ft] = {}
        objectives_by_type_code[ft][code] = obj
        
    # Merge rankings with objectives
    glace_reps = []
    tomate_reps = []
    
    for r in rankings_rows:
        ft = r['focus_type']
        rep = r['representative']
        code = rep.split()[0].upper() if rep else ""
        
        # Match objective
        obj = objectives_by_type_code.get(ft, {}).get(code)
        
        # Copy details
        merged = dict(r)
        if ft == 'GLACE':
            merged['obj_ttc'] = obj['ttc'] if obj else 0.0
            merged['obj_ht'] = obj['glace_ht'] if obj else 0.0
            dev = r['deviation'] or 0.0
            merged['realised_ttc'] = round((1 + dev) * obj['ttc'], 2) if obj else 0.0
            glace_reps.append(merged)
        elif ft == 'TOMATE_FRITO':
            merged['obj_acm'] = obj['obj_acm'] if obj else 0.0
            merged['nb_clients'] = obj['number_client'] if obj else 0
            dev = r['deviation'] or 0.0
            merged['realised_clients'] = round((1 + dev) * obj['obj_acm'], 2) if obj else 0.0
            tomate_reps.append(merged)
            
    # Filter CDZ rankings by focus type
    glace_cdz = [r for r in cdz_rows if r['focus_type'] == 'GLACE']
    tomate_cdz = [r for r in cdz_rows if r['focus_type'] == 'TOMATE_FRITO']
    
    return {
        'glace': {
            'reps': glace_reps,
            'cdz': glace_cdz
        },
        'tomate': {
            'reps': tomate_reps,
            'cdz': tomate_cdz
        }
    }


def get_focus_history(agence='AGADIR'):
    """Fetch historical focus representative rankings and CDZ rankings for all upload dates for an agence."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Fetch representative rankings for all dates
    cursor.execute("""
        SELECT upload_date, focus_type, rank, agence, secteur, representative, deviation, cdz
        FROM focus_rankings
        WHERE agence = ?
        ORDER BY upload_date ASC, rank ASC
    """, (agence,))
    rankings_rows = [dict(r) for r in cursor.fetchall()]
    
    # 2. Fetch CDZ rankings
    cursor.execute("""
        SELECT upload_date, focus_type, rank, cdz, agence, deviation
        FROM focus_cdz_rankings
        WHERE agence = ?
        ORDER BY upload_date ASC, rank ASC
    """, (agence,))
    cdz_rows = [dict(r) for r in cursor.fetchall()]
    
    # 3. Fetch objectives to merge with reps
    cursor.execute("""
        SELECT focus_type, vendeur, secteur, number_client, obj_acm, obj_juin, glace_ht, ttc
        FROM focus_objectives
    """)
    objectives_rows = [dict(o) for o in cursor.fetchall()]
    conn.close()
    
    # Organize objectives by focus_type and vendeur code
    objectives_by_type_code = {}
    for obj in objectives_rows:
        ft = obj['focus_type']
        v = obj['vendeur']
        if not v:
            continue
        code = v.split()[0].upper()
        if ft not in objectives_by_type_code:
            objectives_by_type_code[ft] = {}
        objectives_by_type_code[ft][code] = obj
        
    # Merge rankings with objectives
    glace_reps = []
    tomate_reps = []
    
    for r in rankings_rows:
        ft = r['focus_type']
        rep = r['representative']
        code = rep.split()[0].upper() if rep else ""
        
        # Match objective
        obj = objectives_by_type_code.get(ft, {}).get(code)
        
        # Copy details
        merged = dict(r)
        if ft == 'GLACE':
            merged['obj_ttc'] = obj['ttc'] if obj else 0.0
            merged['obj_ht'] = obj['glace_ht'] if obj else 0.0
            dev = r['deviation'] or 0.0
            merged['realised_ttc'] = round((1 + dev) * obj['ttc'], 2) if obj else 0.0
            glace_reps.append(merged)
        elif ft == 'TOMATE_FRITO':
            merged['obj_acm'] = obj['obj_acm'] if obj else 0.0
            merged['nb_clients'] = obj['number_client'] if obj else 0
            dev = r['deviation'] or 0.0
            merged['realised_clients'] = round((1 + dev) * obj['obj_acm'], 2) if obj else 0.0
            tomate_reps.append(merged)
            
    # Filter CDZ rankings by focus type
    glace_cdz = [r for r in cdz_rows if r['focus_type'] == 'GLACE']
    tomate_cdz = [r for r in cdz_rows if r['focus_type'] == 'TOMATE_FRITO']
    
    return {
        'glace': {
            'reps': glace_reps,
            'cdz': glace_cdz
        },
        'tomate': {
            'reps': tomate_reps,
            'cdz': tomate_cdz
        }
    }


# ------------------------------------------------------------------
# Stock Data Persistence Methods
# ------------------------------------------------------------------

def save_stock_data(date, rows):
    """
    Saves or updates stock rows for a specific date.
    Only saves rows with ACT CODE = 'AG_AGDR'.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Only delete existing entries for sources that we are about to upload/overwrite for this date
        sources = set()
        for r in rows:
            act_code = str(r.get("ACT CODE", r.get("act_code", ""))).strip()
            if act_code == "AG_AGDR":
                src = str(r.get("Source", r.get("source", "SPEED"))).strip()
                if src:
                    sources.add(src)
        for src in sources:
            cursor.execute("DELETE FROM stock WHERE date = ? AND source = ?", (date, src))
        
        insert_query = """
        INSERT OR REPLACE INTO stock (
            date, act_code, site, soc, fournisseur, gamme, famille, produit, designation, statut, stk_qte, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        
        count = 0
        for r in rows:
            act_code = str(r.get("ACT CODE", r.get("act_code", ""))).strip()
            if act_code != "AG_AGDR":
                continue
                
            qty = r.get("STK QTE", r.get("stk_qte", 0))
            try:
                qty = int(qty)
            except (ValueError, TypeError):
                qty = 0
                
            cursor.execute(insert_query, (
                date,
                act_code,
                str(r.get("Site", r.get("site", ""))).strip(),
                str(r.get("SOC", r.get("soc", ""))).strip(),
                str(r.get("Fournisseur", r.get("fournisseur", ""))).strip(),
                str(r.get("GAMME", r.get("gamme", ""))).strip(),
                str(r.get("FAMILLE", r.get("famille", ""))).strip(),
                str(r.get("Produit", r.get("produit", ""))).strip(),
                str(r.get("DESIGNATION", r.get("designation", ""))).strip(),
                str(r.get("Statut", r.get("statut", ""))).strip(),
                qty,
                str(r.get("Source", r.get("source", ""))).strip()
            ))
            count += 1
            
        conn.commit()
        return count
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()

def get_stock_dates():
    """Returns a list of all distinct dates in the stock table, sorted descending."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT date FROM stock ORDER BY date DESC")
        return [row[0] for row in cursor.fetchall()]
    finally:
        conn.close()

def get_stock_data_from_db(date=None, search=None, sites=None, socs=None, fournisseurs=None, sort_by="produit", sort_dir="ASC"):
    """
    Retrieves filtered and sorted stock rows from the database.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # If no date specified, try to use the most recent date
        if not date:
            dates = get_stock_dates()
            if not dates:
                return {"rows": [], "summary": {"total_products": 0, "total_quantity": 0, "filtered_products": 0, "filtered_quantity": 0}}
            date = dates[0]
            
        query = "SELECT * FROM stock WHERE date = ?"
        params = [date]
        
        if search:
            query += " AND (produit LIKE ? OR designation LIKE ?)"
            params.extend([f"%{search}%", f"%{search}%"])
            
        if sites:
            placeholders = ",".join("?" for _ in sites)
            query += f" AND site IN ({placeholders})"
            params.extend(sites)
            
        if socs:
            placeholders = ",".join("?" for _ in socs)
            query += f" AND soc IN ({placeholders})"
            params.extend(socs)
            
        if fournisseurs:
            placeholders = ",".join("?" for _ in fournisseurs)
            query += f" AND fournisseur IN ({placeholders})"
            params.extend(fournisseurs)
            
        # Map sort_by from user interface names to DB column names if necessary
        col_mapping = {
            "Produit": "produit",
            "DESIGNATION": "designation",
            "Site": "site",
            "SOC": "soc",
            "Fournisseur": "fournisseur",
            "GAMME": "gamme",
            "FAMILLE": "famille",
            "STK QTE": "stk_qte",
            "Statut": "statut",
            "Source": "source"
        }
        db_sort_col = col_mapping.get(sort_by, "produit")
        
        # Validate sort_dir
        if sort_dir not in ("ASC", "DESC"):
            sort_dir = "ASC"
            
        query += f" ORDER BY {db_sort_col} {sort_dir}"
        
        cursor.execute(query, params)
        rows = [dict(row) for row in cursor.fetchall()]
        
        # Calculate summary metrics
        cursor.execute("SELECT COUNT(*), SUM(stk_qte) FROM stock WHERE date = ?", (date,))
        total_p, total_q = cursor.fetchone()
        total_p = total_p or 0
        total_q = total_q or 0
        
        # For filtered summary
        filtered_p = len(rows)
        filtered_q = sum(r["stk_qte"] for r in rows)
        
        # Map DB column names back to original Excel keys for frontend compatibility
        formatted_rows = []
        for r in rows:
            formatted_rows.append({
                "ACT CODE": r["act_code"],
                "Site": r["site"],
                "SOC": r["soc"],
                "Fournisseur": r["fournisseur"],
                "GAMME": r["gamme"],
                "FAMILLE": r["famille"],
                "Produit": r["produit"],
                "DESIGNATION": r["designation"],
                "Statut": r["statut"],
                "STK QTE": r["stk_qte"],
                "Source": r["source"],
                "date": r["date"]
            })
            
        return {
            "rows": formatted_rows,
            "date": date,
            "summary": {
                "total_products": total_p,
                "total_quantity": total_q,
                "filtered_products": filtered_p,
                "filtered_quantity": filtered_q
            }
        }
    finally:
        conn.close()

def get_stock_filters_from_db(date):
    """Returns available unique filter options for a specific stock date."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT site FROM stock WHERE date = ? ORDER BY site", (date,))
        sites = [r[0] for r in cursor.fetchall()]
        
        cursor.execute("SELECT DISTINCT soc FROM stock WHERE date = ? ORDER BY soc", (date,))
        socs = [r[0] for r in cursor.fetchall()]
        
        cursor.execute("SELECT DISTINCT fournisseur FROM stock WHERE date = ? ORDER BY fournisseur", (date,))
        fournisseurs = [r[0] for r in cursor.fetchall()]
        
        return {
            "sites": sites,
            "socs": socs,
            "fournisseurs": fournisseurs
        }
    finally:
        conn.close()


def add_stock_favorite(produit):
    """Adds a product code to favorites database table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT OR IGNORE INTO stock_favorites (produit) VALUES (?)", (produit,))
        conn.commit()
    finally:
        conn.close()


def remove_stock_favorite(produit):
    """Removes a product code from favorites database table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM stock_favorites WHERE produit = ?", (produit,))
        conn.commit()
    finally:
        conn.close()


def get_stock_favorites():
    """Gets all favorited product codes from database."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT produit FROM stock_favorites")
        return [r[0] for r in cursor.fetchall()]
    finally:
        conn.close()


def save_anomaly(date, vendeur, type_anomali, commentaire=None, tag=None):
    """Save an anomaly record to database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO anomalies (date, vendeur, type_anomali, commentaire, tag) VALUES (?, ?, ?, ?, ?)",
            (date, vendeur, type_anomali, commentaire, tag)
        )
        conn.commit()
        return True
    except Exception as e:
        print(f"Error saving anomaly: {e}")
        return False
    finally:
        conn.close()


def get_all_anomalies():
    """Get all anomaly records sorted by date descending"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, date, vendeur, type_anomali, commentaire, tag, created_at FROM anomalies ORDER BY date DESC, id DESC")
        rows = cursor.fetchall()
        return [dict(r) for r in rows]
    except Exception as e:
        print(f"Error fetching anomalies: {e}")
        return []
    finally:
        conn.close()


def delete_anomaly(anomaly_id):
    """Delete an anomaly record by ID"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM anomalies WHERE id = ?", (anomaly_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error deleting anomaly {anomaly_id}: {e}")
        return False
    finally:
        conn.close()


def save_task(title, assignee_type, assignee, date, priority, status='Start', creator='me', subtasks=None):
    """Save a task record and its subtasks to the database"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO tasks (title, assignee_type, assignee, date, priority, status, creator) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (title, assignee_type, assignee, date, priority, status, creator)
        )
        task_id = cursor.lastrowid
        if subtasks and isinstance(subtasks, list):
            for sub_title in subtasks:
                if sub_title.strip():
                    cursor.execute(
                        "INSERT INTO subtasks (task_id, title, completed) VALUES (?, ?, 0)",
                        (task_id, sub_title.strip())
                    )
        conn.commit()
        return True
    except Exception as e:
        print(f"Error saving task: {e}")
        return False
    finally:
        conn.close()


def get_all_tasks():
    """Retrieve all tasks including their subtasks"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, title, assignee_type, assignee, date, priority, status, creator, created_at FROM tasks ORDER BY date ASC, id DESC")
        task_rows = cursor.fetchall()
        tasks = [dict(row) for row in task_rows]

        for task in tasks:
            cursor.execute("SELECT id, title, completed FROM subtasks WHERE task_id = ?", (task['id'],))
            subtask_rows = cursor.fetchall()
            task['subtasks'] = [dict(sub) for sub in subtask_rows]
            
        return tasks
    except Exception as e:
        print(f"Error fetching tasks: {e}")
        return []
    finally:
        conn.close()


def delete_task(task_id):
    """Delete a task and its subtasks"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        cursor.execute("DELETE FROM subtasks WHERE task_id = ?", (task_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error deleting task {task_id}: {e}")
        return False
    finally:
        conn.close()


def update_task_status(task_id, status):
    """Update status of a task"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("UPDATE tasks SET status = ? WHERE id = ?", (status, task_id))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error updating task status {task_id}: {e}")
        return False
    finally:
        conn.close()


def toggle_subtask_completed(subsub_id, completed):
    """Toggle completed status of a subtask"""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        val = 1 if completed else 0
        cursor.execute("UPDATE subtasks SET completed = ? WHERE id = ?", (val, subsub_id))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error toggling subtask {subsub_id}: {e}")
        return False
    finally:
        conn.close()



