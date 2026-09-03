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
        for d in range(1, today.day + 1):
            curr_date = datetime.date(year, month, d)
            if curr_date.weekday() != 6:
                elapsed_workdays += 1
                
    remaining_workdays = max(0, total_workdays - elapsed_workdays)
    
    return {
        "total": total_workdays,
        "elapsed": elapsed_workdays,
        "rest": remaining_workdays
    }

import shutil

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))

def _is_dir_writable(dpath):
    try:
        test_file = os.path.join(dpath, '.test_writable_tmp')
        with open(test_file, 'w') as f:
            f.write('1')
        os.remove(test_file)
        return True
    except Exception:
        return False

# Detect Serverless (Vercel, AWS Lambda, or read-only execution directory)
IS_SERVERLESS = bool(
    os.environ.get("VERCEL") or 
    os.environ.get("AWS_LAMBDA_FUNCTION_NAME") or 
    os.environ.get("SERVERLESS") or 
    os.environ.get("USE_TMP_DB") or 
    not _is_dir_writable(ROOT_DIR)
)

if IS_SERVERLESS:
    DB_DIR = os.environ.get("TMPDIR", "/tmp")
    try:
        os.makedirs(DB_DIR, exist_ok=True)
    except Exception:
        pass
    
    # Initialize /tmp database copies from bundled baseline files if not already present
    for db_file in ["database.db", "uploads.db", "clients_vendeurs.db"]:
        src_path = os.path.join(ROOT_DIR, db_file)
        dst_path = os.path.join(DB_DIR, db_file)
        if os.path.exists(src_path):
            if not os.path.exists(dst_path) or os.path.getsize(dst_path) == 0:
                try:
                    shutil.copyfile(src_path, dst_path)
                    try:
                        os.chmod(dst_path, 0o666)
                    except Exception:
                        pass
                    print(f"[DB] Initialized {db_file} in {DB_DIR} from {src_path}", flush=True)
                except Exception as e:
                    print(f"[DB] Notice initializing {db_file}: {e}", flush=True)
else:
    DB_DIR = ROOT_DIR

DB_PATH = os.environ.get("DB_PATH", os.path.join(DB_DIR, "database.db"))
UPLOADS_DB_PATH = os.environ.get("UPLOADS_DB_PATH", os.path.join(DB_DIR, "uploads.db"))
CV_DB_PATH = os.environ.get("CV_DB_PATH", os.path.join(DB_DIR, "clients_vendeurs.db"))
HISTORIQUE_DB_PATH = os.environ.get("HISTORIQUE_DB_PATH", os.path.join(DB_DIR, "historique.db"))

def _configure_connection(conn):
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA busy_timeout = 60000;")
        conn.execute("PRAGMA temp_store = MEMORY;")
    except Exception:
        pass
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
    except Exception:
        try:
            conn.execute("PRAGMA journal_mode = DELETE;")
        except Exception:
            pass
    return conn

def get_uploads_db_connection():
    conn = sqlite3.connect(UPLOADS_DB_PATH, timeout=60.0, check_same_thread=False)
    return _configure_connection(conn)

def get_cv_db_connection():
    """Connection to clients_vendeurs.db (vendeurs, clients, localites, secteurs)."""
    conn = sqlite3.connect(CV_DB_PATH, timeout=60.0, check_same_thread=False)
    return _configure_connection(conn)

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=60.0, check_same_thread=False)
    _configure_connection(conn)
    try:
        conn.execute(f"ATTACH DATABASE '{UPLOADS_DB_PATH}' AS uploads_db")
    except Exception:
        pass
    return conn

def get_historique_db_connection():
    """Connection to historique.db (backup snapshots before DB reset)."""
    conn = sqlite3.connect(HISTORIQUE_DB_PATH, timeout=60.0, check_same_thread=False)
    return _configure_connection(conn)

def init_historique_db():
    """Initialize historique database with snapshot tables."""
    conn = get_historique_db_connection()
    cursor = conn.cursor()

    # Snapshot metadata table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS h_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        source_date TEXT,
        note TEXT
    )
    """)

    # Quantitative data snapshot
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS h_quantitative_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        famille TEXT NOT NULL,
        j1 INTEGER DEFAULT 0,
        real INTEGER DEFAULT 0,
        obj INTEGER DEFAULT 0,
        percent REAL DEFAULT 0.0,
        real_2025 INTEGER DEFAULT 0,
        h_2024 INTEGER DEFAULT 0,
        h_pct REAL DEFAULT 0.0,
        encours INTEGER DEFAULT 0,
        obj_mois INTEGER DEFAULT 0,
        raf INTEGER DEFAULT 0,
        FOREIGN KEY (snapshot_id) REFERENCES h_snapshots(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_h_quant_snap ON h_quantitative_data(snapshot_id)")

    # Qualitative data snapshot
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS h_qualitative_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        clt_programme INTEGER DEFAULT 0,
        clt_facture INTEGER DEFAULT 0,
        acm REAL DEFAULT 0.0,
        tsm REAL DEFAULT 0.0,
        line REAL DEFAULT 0.0,
        raf_tsm INTEGER DEFAULT 0,
        raf_acm INTEGER DEFAULT 0,
        FOREIGN KEY (snapshot_id) REFERENCES h_snapshots(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_h_qual_snap ON h_qualitative_data(snapshot_id)")

    # Focus VMM data snapshot
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS h_focus_vmm_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
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
        FOREIGN KEY (snapshot_id) REFERENCES h_snapshots(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_h_fvmm_snap ON h_focus_vmm_data(snapshot_id)")

    # Focus SOM data snapshot
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS h_focus_som_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
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
        FOREIGN KEY (snapshot_id) REFERENCES h_snapshots(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_h_fsom_snap ON h_focus_som_data(snapshot_id)")

    # Anomalies snapshot
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS h_anomalies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        type_anomali TEXT NOT NULL,
        commentaire TEXT,
        tag TEXT,
        FOREIGN KEY (snapshot_id) REFERENCES h_snapshots(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_h_anom_snap ON h_anomalies(snapshot_id)")

    # Visites rapports snapshot
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS h_visites_rapports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        file_name TEXT,
        vendeur TEXT NOT NULL,
        date_visite TEXT NOT NULL,
        tournee TEXT,
        agence TEXT,
        client_code TEXT NOT NULL,
        client_nom TEXT,
        heure TEXT,
        distance INTEGER DEFAULT 0,
        motif TEXT,
        note TEXT,
        FOREIGN KEY (snapshot_id) REFERENCES h_snapshots(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_h_vis_snap ON h_visites_rapports(snapshot_id)")

    # Dernier rapport généré snapshot
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS h_rapports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        snapshot_id INTEGER NOT NULL,
        report_text TEXT,
        title TEXT,
        vendeur TEXT,
        format TEXT,
        lang TEXT,
        report_date TEXT,
        FOREIGN KEY (snapshot_id) REFERENCES h_snapshots(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_h_rap_snap ON h_rapports(snapshot_id)")

    conn.commit()
    conn.close()
    print("[OK] Historique database tables created successfully!")


def init_uploads_db():
    """Initialize separate uploads database for Excel files and copy baseline data if new."""
    conn = get_uploads_db_connection()
    cursor = conn.cursor()

    # 1. Quantitative data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quantitative_data (
        date TEXT NOT NULL,
        vendeur TEXT NOT NULL,
        famille TEXT NOT NULL,
        j1 INTEGER DEFAULT 0,
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

    # 5. File metadata
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS file_metadata (
        date TEXT PRIMARY KEY,
        file_name TEXT,
        file_size INTEGER,
        file_content BLOB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 6. Secteurs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS secteurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
    """)

    # 7. Localités
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS localites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        secteur_id INTEGER NOT NULL,
        FOREIGN KEY (secteur_id) REFERENCES secteurs (id),
        UNIQUE(name, secteur_id)
    )
    """)

    # 8. Clients
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        secteur_id INTEGER NOT NULL,
        localite_id INTEGER NOT NULL,
        FOREIGN KEY (secteur_id) REFERENCES secteurs (id),
        FOREIGN KEY (localite_id) REFERENCES localites (id)
    )
    """)

    # 9. Tournees visits
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendeur_tournees_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendeur_code TEXT NOT NULL,
        vendeur_name TEXT,
        date TEXT NOT NULL,
        tournee TEXT,
        client_code TEXT NOT NULL,
        client_name TEXT,
        date_visite TEXT,
        heure_debut TEXT,
        heure_fin TEXT,
        duree_minutes REAL,
        motif TEXT,
        distance TEXT,
        note TEXT,
        facture_status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vendeur_code, client_code, date, heure_debut)
    )
    """)

    # Auto-migrate: if table was created with old schema (vendeur col instead of vendeur_code), rebuild it
    cursor.execute("PRAGMA table_info(vendeur_tournees_visits)")
    vtv_cols = [row[1] for row in cursor.fetchall()]
    if "vendeur" in vtv_cols and "vendeur_code" not in vtv_cols:
        cursor.execute("DROP TABLE IF EXISTS vendeur_tournees_visits")
        cursor.execute("""
        CREATE TABLE vendeur_tournees_visits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vendeur_code TEXT NOT NULL,
            vendeur_name TEXT,
            date TEXT NOT NULL,
            tournee TEXT,
            client_code TEXT NOT NULL,
            client_name TEXT,
            date_visite TEXT,
            heure_debut TEXT,
            heure_fin TEXT,
            duree_minutes REAL,
            motif TEXT,
            distance TEXT,
            note TEXT,
            facture_status TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(vendeur_code, client_code, date, heure_debut)
        )
        """)

    # 10. Visites rapports
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS visites_rapports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT,
        vendeur TEXT,
        date_visite TEXT,
        tournee TEXT,
        agence TEXT,
        client_code TEXT,
        client_nom TEXT,
        heure TEXT,
        distance INTEGER DEFAULT 0,
        motif TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_visites_db_vendeur ON visites_rapports(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_visites_db_date ON visites_rapports(date_visite)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_visites_db_client ON visites_rapports(client_code)")

    # 11. Stock
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS stock (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        code_article TEXT NOT NULL,
        designation TEXT NOT NULL,
        famille TEXT,
        colisage REAL DEFAULT 1.0,
        stock_physique REAL DEFAULT 0.0,
        stock_disponible REAL DEFAULT 0.0,
        valeur_stock REAL DEFAULT 0.0,
        statut TEXT DEFAULT 'OK',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 12. Focus rankings
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 13. Focus CDZ rankings
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_cdz_rankings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upload_date TEXT NOT NULL,
        focus_type TEXT NOT NULL,
        rank INTEGER,
        cdz TEXT,
        agence TEXT,
        deviation REAL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # 14. Focus objectives
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_objectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        focus_type TEXT NOT NULL,
        agence TEXT,
        cdz TEXT,
        vendeur TEXT,
        secteur TEXT,
        objective_value REAL DEFAULT 0.0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()

    # Initial copy of baseline data from database.db to uploads.db if empty
    main_conn = None
    try:
        main_conn = sqlite3.connect(DB_PATH, timeout=60.0, check_same_thread=False)
        _configure_connection(main_conn)
        main_cursor = main_conn.cursor()

        # Copy visites_rapports if empty in uploads.db
        cnt = cursor.execute("SELECT COUNT(1) FROM visites_rapports").fetchone()[0]
        if cnt == 0:
            rows = main_cursor.execute("SELECT file_name, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note FROM visites_rapports").fetchall()
            if rows:
                cursor.executemany("INSERT INTO visites_rapports (file_name, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)

        # Copy secteurs if empty
        cnt = cursor.execute("SELECT COUNT(1) FROM secteurs").fetchone()[0]
        if cnt == 0:
            rows = main_cursor.execute("SELECT id, name FROM secteurs").fetchall()
            if rows:
                cursor.executemany("INSERT INTO secteurs (id, name) VALUES (?, ?)", rows)

        # Copy localites if empty
        cnt = cursor.execute("SELECT COUNT(1) FROM localites").fetchone()[0]
        if cnt == 0:
            rows = main_cursor.execute("SELECT id, name, secteur_id FROM localites").fetchall()
            if rows:
                cursor.executemany("INSERT INTO localites (id, name, secteur_id) VALUES (?, ?, ?)", rows)

        # Copy clients if empty
        cnt = cursor.execute("SELECT COUNT(1) FROM clients").fetchone()[0]
        if cnt == 0:
            rows = main_cursor.execute("SELECT id, code, name, secteur_id, localite_id FROM clients").fetchall()
            if rows:
                cursor.executemany("INSERT INTO clients (id, code, name, secteur_id, localite_id) VALUES (?, ?, ?, ?, ?)", rows)

        conn.commit()
    except Exception as e:
        print(f"Baseline copy to uploads.db notice: {e}")
    finally:
        if main_conn:
            try:
                main_conn.close()
            except Exception:
                pass
        try:
            conn.close()
        except Exception:
            pass


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
        j1 INTEGER DEFAULT 0,
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

    # 7. Normalized Relational Database Model
    # 7a. Secteurs (Role Vendeur from acm.xlsx)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS secteurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )
    """)

    # 7b. Localités (Tournée from acm.xlsx, linked to secteurs)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS localites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        secteur_id INTEGER NOT NULL,
        FOREIGN KEY (secteur_id) REFERENCES secteurs(id) ON DELETE CASCADE,
        UNIQUE(name, secteur_id)
    )
    """)

    # 7c. Clients (Code Client, Nom Client from acm.xlsx, linked to secteurs and localites)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        secteur_id INTEGER NOT NULL,
        localite_id INTEGER NOT NULL,
        vendeur_som TEXT NOT NULL DEFAULT '',
        vendeur_vmm TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (secteur_id) REFERENCES secteurs(id) ON DELETE CASCADE,
        FOREIGN KEY (localite_id) REFERENCES localites(id) ON DELETE CASCADE
    )
    """)
    # Migration: add vendeur columns if upgrading from older schema
    cursor.execute("PRAGMA table_info(clients)")
    existing_cols = {row[1] for row in cursor.fetchall()}
    if 'vendeur_som' not in existing_cols:
        cursor.execute("ALTER TABLE clients ADD COLUMN vendeur_som TEXT NOT NULL DEFAULT ''")
    if 'vendeur_vmm' not in existing_cols:
        cursor.execute("ALTER TABLE clients ADD COLUMN vendeur_vmm TEXT NOT NULL DEFAULT ''")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_secteur ON clients(secteur_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_localite ON clients(localite_id)")

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
        cdz TEXT DEFAULT '',
        UNIQUE(focus_type, vendeur)
    )
    """)
    try:
        cursor.execute("ALTER TABLE focus_objectives ADD COLUMN cdz TEXT DEFAULT ''")
    except Exception:
        pass
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_objectives_type ON focus_objectives(focus_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_objectives_vendeur ON focus_objectives(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_objectives_cdz ON focus_objectives(cdz)")

    # 11b. Focus Names table (stores dynamic focus names like BECHAMEL, PESCADA ALGERIENNE)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_names (
        focus_type TEXT PRIMARY KEY,
        focus_name TEXT NOT NULL
    )
    """)

    # 11c. Focus Obj table (stores objectives for vendeur or secteur in HT and TTC)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_obj (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        focus_type TEXT NOT NULL,
        vendeur TEXT NOT NULL DEFAULT '',
        secteur TEXT NOT NULL DEFAULT '',
        obj_ht REAL DEFAULT 0.0,
        obj_ttc REAL DEFAULT 0.0,
        focus_name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_obj_type ON focus_obj(focus_type)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_obj_vendeur ON focus_obj(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_focus_obj_secteur ON focus_obj(secteur)")


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

    # Migration for quantitative_data: add j1 column and convert TTC to HT if needed
    cursor.execute("PRAGMA table_info(quantitative_data)")
    q_cols = {row[1] for row in cursor.fetchall()}
    if "j1" not in q_cols:
        cursor.execute("ALTER TABLE quantitative_data ADD COLUMN j1 INTEGER DEFAULT 0")

    cursor.execute("SELECT COUNT(*) FROM quantitative_data WHERE famille = 'C.A (TTC)'")
    if cursor.fetchone()[0] > 0:
        print("[MIGRATION] Migrating database quantitative_data from TTC back to HT...")
        cursor.execute("UPDATE quantitative_data SET famille = 'C.A (ht)' WHERE famille = 'C.A (TTC)'")
        cursor.execute("""
            UPDATE quantitative_data
            SET real = ROUND(real / 1.2),
                obj = ROUND(obj / 1.2),
                real_2025 = ROUND(real_2025 / 1.2),
                h_2024 = ROUND(h_2024 / 1.2),
                encours = ROUND(encours / 1.2),
                obj_mois = ROUND(obj_mois / 1.2),
                raf = ROUND(raf / 1.2)
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

    # 16. Visites Rapports details table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS visites_rapports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_name TEXT,
        vendeur TEXT NOT NULL,
        date_visite TEXT NOT NULL,
        tournee TEXT,
        agence TEXT,
        client_code TEXT NOT NULL,
        client_nom TEXT,
        heure TEXT,
        distance INTEGER DEFAULT 0,
        motif TEXT,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_visites_vendeur ON visites_rapports(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_visites_date ON visites_rapports(date_visite)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_visites_client ON visites_rapports(client_code)")

    # 17. Engagements and Engagement Items tables
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS engagements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendeur TEXT NOT NULL,
        periode TEXT NOT NULL,
        date_engagement TEXT NOT NULL,
        total_dh REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS engagement_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        engagement_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        amount_dh REAL NOT NULL DEFAULT 0,
        FOREIGN KEY(engagement_id) REFERENCES engagements(id) ON DELETE CASCADE
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_engagements_vendeur ON engagements(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_engagements_date ON engagements(date_engagement)")

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
            q_real = q.get("real", 0) or 0
            q_obj = q.get("obj", 0) or 0
            h_pct_val = 0.0 if (q_real == 0 and q_obj == 0) else q.get("h_pct", 0.0)
            cursor.execute("""
            INSERT OR REPLACE INTO quantitative_data
            (date, vendeur, famille, j1, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                date,
                q.get("vendeur", ""),
                q.get("famille", ""),
                q.get("j1", q.get("j_1", 0)),
                q_real,
                q_obj,
                q.get("percent", 0.0),
                q.get("real_2025", 0),
                q.get("h_2024", 0),
                h_pct_val,
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

    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
    SELECT vendeur, famille, COALESCE(j1, 0) as j1, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf
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
        SELECT vendeur, secteur, obj_acm, number_client as nb_clients, obj_juin, glace_ht, ttc
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
        ttc = obj['ttc'] if (obj and obj['ttc'] > 0.0) else obj_acm
        glace_ht = obj['glace_ht'] if (obj and obj['glace_ht'] > 0.0) else (obj['obj_juin'] if obj else 0.0)
        
        dev = r['percent'] or 0.0
        realise = (1.0 + dev) * ttc if ttc > 0 else 0.0
        rest = ttc - realise

        merged_list.append({
            "vendeur": v_name,
            "secteur": r["secteur"],
            "dn_fin_mai": 0.0,
            "obj_juin": obj["obj_juin"] if obj else 0.0,
            "nb_clients": obj["nb_clients"] if obj else 0,
            "obj_acm": obj_acm,
            "glace_ht": glace_ht,
            "ttc": ttc,
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
            "glace_ht": sum(x["glace_ht"] for x in merged_list) / len(merged_list),
            "ttc": sum(x["ttc"] for x in merged_list) / len(merged_list),
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

def get_workdays_info(rest_days=None, date_str=None):
    from data_processor import calculate_calendar_workdays
    
    try:
        dynamic_days = calculate_calendar_workdays(date_str)
        if rest_days is not None:
            try:
                r_val = int(rest_days)
                if r_val >= 0:
                    dynamic_days["rest"] = r_val
                    dynamic_days["elapsed"] = max(0, dynamic_days["total"] - r_val)
            except Exception:
                pass
        return dynamic_days
    except Exception as e:
        print(f"Error in get_workdays_info: {e}")
        return {"elapsed": 17, "total": 25, "rest": 8}

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
        f"SELECT vendeur, famille, COALESCE(j1, 0) as j1, real, obj, percent, real_2025, h_2024, h_pct, "
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


def backup_to_historique(report_data=None, note=None):
    """Backup current database.db data into historique.db before reset.
    
    Args:
        report_data: Optional dict with keys: report_text, title, vendeur, format, lang, report_date
        note: Optional string note describing the snapshot
    Returns:
        snapshot_id (int) on success, raises Exception on failure
    """
    import json as _json

    # Ensure historique.db tables exist
    init_historique_db()

    main_conn = None
    hist_conn = None
    try:
        main_conn = sqlite3.connect(DB_PATH, timeout=60.0, check_same_thread=False)
        main_conn.row_factory = sqlite3.Row
        main_cursor = main_conn.cursor()

        hist_conn = get_historique_db_connection()
        hist_cursor = hist_conn.cursor()

        # Determine the latest date in the data for the snapshot label
        main_cursor.execute("SELECT MAX(date) as max_date FROM quantitative_data")
        row = main_cursor.fetchone()
        source_date = row["max_date"] if row and row["max_date"] else "unknown"

        # Create snapshot record
        note_text = note or "Sauvegarde automatique avant réinitialisation"
        hist_cursor.execute(
            "INSERT INTO h_snapshots (source_date, note) VALUES (?, ?)",
            (source_date, note_text)
        )
        snapshot_id = hist_cursor.lastrowid
        print(f"[HISTORIQUE] Created snapshot #{snapshot_id} (source_date={source_date}, note={note_text})")

        # 1. Copy quantitative_data
        main_cursor.execute("SELECT date, vendeur, famille, j1, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf FROM quantitative_data")
        rows = main_cursor.fetchall()
        if rows:
            hist_cursor.executemany(
                "INSERT INTO h_quantitative_data (snapshot_id, date, vendeur, famille, j1, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(snapshot_id, r["date"], r["vendeur"], r["famille"], r["j1"], r["real"], r["obj"], r["percent"], r["real_2025"], r["h_2024"], r["h_pct"], r["encours"], r["obj_mois"], r["raf"]) for r in rows]
            )
        print(f"[HISTORIQUE]   quantitative_data: {len(rows)} rows")

        # 2. Copy qualitative_data
        main_cursor.execute("SELECT date, vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm FROM qualitative_data")
        rows = main_cursor.fetchall()
        if rows:
            hist_cursor.executemany(
                "INSERT INTO h_qualitative_data (snapshot_id, date, vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(snapshot_id, r["date"], r["vendeur"], r["clt_programme"], r["clt_facture"], r["acm"], r["tsm"], r["line"], r["raf_tsm"], r["raf_acm"]) for r in rows]
            )
        print(f"[HISTORIQUE]   qualitative_data: {len(rows)} rows")

        # 3. Copy focus_vmm_data
        main_cursor.execute("SELECT date, vendeur, secteur, dn_fin_mai, obj_juin, nb_clients, obj_acm, percent, realise, rest, jour_rest, rest_jour FROM focus_vmm_data")
        rows = main_cursor.fetchall()
        if rows:
            hist_cursor.executemany(
                "INSERT INTO h_focus_vmm_data (snapshot_id, date, vendeur, secteur, dn_fin_mai, obj_juin, nb_clients, obj_acm, percent, realise, rest, jour_rest, rest_jour) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(snapshot_id, r["date"], r["vendeur"], r["secteur"], r["dn_fin_mai"], r["obj_juin"], r["nb_clients"], r["obj_acm"], r["percent"], r["realise"], r["rest"], r["jour_rest"], r["rest_jour"]) for r in rows]
            )
        print(f"[HISTORIQUE]   focus_vmm_data: {len(rows)} rows")

        # 4. Copy focus_som_data
        main_cursor.execute("SELECT date, vendeur, secteur, glace_ht, ttc, percent, realise, rest, rest_jour, jour_rest FROM focus_som_data")
        rows = main_cursor.fetchall()
        if rows:
            hist_cursor.executemany(
                "INSERT INTO h_focus_som_data (snapshot_id, date, vendeur, secteur, glace_ht, ttc, percent, realise, rest, rest_jour, jour_rest) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(snapshot_id, r["date"], r["vendeur"], r["secteur"], r["glace_ht"], r["ttc"], r["percent"], r["realise"], r["rest"], r["rest_jour"], r["jour_rest"]) for r in rows]
            )
        print(f"[HISTORIQUE]   focus_som_data: {len(rows)} rows")

        # 5. Copy anomalies
        main_cursor.execute("SELECT date, vendeur, type_anomali, commentaire, tag FROM anomalies")
        rows = main_cursor.fetchall()
        if rows:
            hist_cursor.executemany(
                "INSERT INTO h_anomalies (snapshot_id, date, vendeur, type_anomali, commentaire, tag) VALUES (?, ?, ?, ?, ?, ?)",
                [(snapshot_id, r["date"], r["vendeur"], r["type_anomali"], r["commentaire"], r["tag"]) for r in rows]
            )
        print(f"[HISTORIQUE]   anomalies: {len(rows)} rows")

        # 6. Copy visites_rapports
        main_cursor.execute("SELECT file_name, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note FROM visites_rapports")
        rows = main_cursor.fetchall()
        if rows:
            hist_cursor.executemany(
                "INSERT INTO h_visites_rapports (snapshot_id, file_name, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [(snapshot_id, r["file_name"], r["vendeur"], r["date_visite"], r["tournee"], r["agence"], r["client_code"], r["client_nom"], r["heure"], r["distance"], r["motif"], r["note"]) for r in rows]
            )
        print(f"[HISTORIQUE]   visites_rapports: {len(rows)} rows")

        # 7. Save dernier rapport généré (if provided from frontend)
        if report_data and isinstance(report_data, dict) and report_data.get("report_text"):
            hist_cursor.execute(
                "INSERT INTO h_rapports (snapshot_id, report_text, title, vendeur, format, lang, report_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (snapshot_id, report_data.get("report_text", ""), report_data.get("title", ""),
                 report_data.get("vendeur", ""), report_data.get("format", ""),
                 report_data.get("lang", ""), report_data.get("report_date", ""))
            )
            print(f"[HISTORIQUE]   rapport: saved")

        hist_conn.commit()
        print(f"[HISTORIQUE] Snapshot #{snapshot_id} completed successfully!")
        return snapshot_id

    except Exception as e:
        print(f"[HISTORIQUE] ERROR during backup: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        if main_conn:
            main_conn.close()
        if hist_conn:
            hist_conn.close()


def get_historique_snapshots():
    """Retrieve all historical snapshots with statistics summary."""
    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, created_at, source_date, note FROM h_snapshots ORDER BY id DESC")
        snapshots = [dict(r) for r in cursor.fetchall()]
        
        for s in snapshots:
            s_id = s["id"]
            s["quanti_count"] = cursor.execute("SELECT COUNT(1) FROM h_quantitative_data WHERE snapshot_id = ?", (s_id,)).fetchone()[0]
            s["quali_count"] = cursor.execute("SELECT COUNT(1) FROM h_qualitative_data WHERE snapshot_id = ?", (s_id,)).fetchone()[0]
            s["focus_vmm_count"] = cursor.execute("SELECT COUNT(1) FROM h_focus_vmm_data WHERE snapshot_id = ?", (s_id,)).fetchone()[0]
            s["focus_som_count"] = cursor.execute("SELECT COUNT(1) FROM h_focus_som_data WHERE snapshot_id = ?", (s_id,)).fetchone()[0]
            s["anomalies_count"] = cursor.execute("SELECT COUNT(1) FROM h_anomalies WHERE snapshot_id = ?", (s_id,)).fetchone()[0]
            s["visites_count"] = cursor.execute("SELECT COUNT(1) FROM h_visites_rapports WHERE snapshot_id = ?", (s_id,)).fetchone()[0]
            s["has_rapport"] = bool(cursor.execute("SELECT COUNT(1) FROM h_rapports WHERE snapshot_id = ?", (s_id,)).fetchone()[0])
            
        return snapshots
    except Exception as e:
        print(f"Error fetching historique snapshots: {e}")
        return []
    finally:
        conn.close()


def get_historique_snapshot_details(snapshot_id):
    """Retrieve all datasets of a single snapshot."""
    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, created_at, source_date, note FROM h_snapshots WHERE id = ?", (snapshot_id,))
        snap_row = cursor.fetchone()
        if not snap_row:
            return None
        
        snapshot = dict(snap_row)
        
        cursor.execute("SELECT date, vendeur, famille, j1, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf FROM h_quantitative_data WHERE snapshot_id = ? ORDER BY date DESC, vendeur ASC", (snapshot_id,))
        snapshot["quantitative"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT date, vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm FROM h_qualitative_data WHERE snapshot_id = ? ORDER BY date DESC, vendeur ASC", (snapshot_id,))
        snapshot["qualitative"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT date, vendeur, secteur, dn_fin_mai, obj_juin, nb_clients, obj_acm, percent, realise, rest, jour_rest, rest_jour FROM h_focus_vmm_data WHERE snapshot_id = ? ORDER BY date DESC, vendeur ASC", (snapshot_id,))
        snapshot["focus_vmm"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT date, vendeur, secteur, glace_ht, ttc, percent, realise, rest, rest_jour, jour_rest FROM h_focus_som_data WHERE snapshot_id = ? ORDER BY date DESC, vendeur ASC", (snapshot_id,))
        snapshot["focus_som"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT id, date, vendeur, type_anomali, commentaire, tag FROM h_anomalies WHERE snapshot_id = ? ORDER BY date DESC, id DESC", (snapshot_id,))
        snapshot["anomalies"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT file_name, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note FROM h_visites_rapports WHERE snapshot_id = ? ORDER BY date_visite DESC, heure DESC LIMIT 5000", (snapshot_id,))
        snapshot["visites"] = [dict(r) for r in cursor.fetchall()]

        cursor.execute("SELECT report_text, title, vendeur, format, lang, report_date FROM h_rapports WHERE snapshot_id = ? LIMIT 1", (snapshot_id,))
        rap_row = cursor.fetchone()
        snapshot["rapport"] = dict(rap_row) if rap_row else None

        # Summary metrics
        snapshot["summary"] = {
            "quanti_count": len(snapshot["quantitative"]),
            "quali_count": len(snapshot["qualitative"]),
            "focus_vmm_count": len(snapshot["focus_vmm"]),
            "focus_som_count": len(snapshot["focus_som"]),
            "anomalies_count": len(snapshot["anomalies"]),
            "visites_count": len(snapshot["visites"]),
            "has_rapport": bool(snapshot["rapport"])
        }

        return snapshot
    except Exception as e:
        print(f"Error fetching snapshot details: {e}")
        return None
    finally:
        conn.close()


def delete_historique_snapshot(snapshot_id):
    """Delete a single snapshot and all its associated data."""
    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM h_quantitative_data WHERE snapshot_id = ?", (snapshot_id,))
        cursor.execute("DELETE FROM h_qualitative_data WHERE snapshot_id = ?", (snapshot_id,))
        cursor.execute("DELETE FROM h_focus_vmm_data WHERE snapshot_id = ?", (snapshot_id,))
        cursor.execute("DELETE FROM h_focus_som_data WHERE snapshot_id = ?", (snapshot_id,))
        cursor.execute("DELETE FROM h_anomalies WHERE snapshot_id = ?", (snapshot_id,))
        cursor.execute("DELETE FROM h_visites_rapports WHERE snapshot_id = ?", (snapshot_id,))
        cursor.execute("DELETE FROM h_rapports WHERE snapshot_id = ?", (snapshot_id,))
        cursor.execute("DELETE FROM h_snapshots WHERE id = ?", (snapshot_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error deleting snapshot #{snapshot_id}: {e}")
        return False
    finally:
        conn.close()


def get_historique_months():
    """Retrieve distinct months available in historique.db with snapshot metadata and row counts."""
    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            SELECT 
                substr(date, 1, 7) as month,
                MIN(date) as date_min,
                MAX(date) as date_max,
                COUNT(1) as quanti_count,
                COUNT(DISTINCT date) as days_count,
                COUNT(DISTINCT snapshot_id) as snapshots_count,
                MAX(snapshot_id) as latest_snapshot_id
            FROM h_quantitative_data
            WHERE date IS NOT NULL AND length(date) >= 7
            GROUP BY substr(date, 1, 7)
            ORDER BY month DESC
        """)
        months_rows = [dict(r) for r in cursor.fetchall()]

        # Map French month names
        month_names = {
            "01": "Janvier", "02": "Février", "03": "Mars", "04": "Avril",
            "05": "Mai", "06": "Juin", "07": "Juillet", "08": "Août",
            "09": "Septembre", "10": "Octobre", "11": "Novembre", "12": "Décembre"
        }

        months_list = []
        for m in months_rows:
            m_str = m["month"]
            parts = m_str.split("-") if "-" in m_str else [m_str, ""]
            year = parts[0]
            month_num = parts[1] if len(parts) > 1 else ""
            month_fr = month_names.get(month_num, month_num)
            
            # Fetch associated snapshots
            cursor.execute("""
                SELECT id, source_date, created_at, note 
                FROM h_snapshots 
                WHERE id IN (
                    SELECT DISTINCT snapshot_id FROM h_quantitative_data WHERE date LIKE ?
                )
                ORDER BY id DESC
            """, (f"{m_str}%",))
            snap_list = [dict(s) for s in cursor.fetchall()]

            label = f"{month_fr} {year} ({m_str}) — {m['days_count']} jours ({m['date_min']} au {m['date_max']})"
            months_list.append({
                "month": m_str,
                "label": label,
                "year": year,
                "month_name": month_fr,
                "date_min": m["date_min"],
                "date_max": m["date_max"],
                "days_count": m["days_count"],
                "quanti_count": m["quanti_count"],
                "latest_snapshot_id": m["latest_snapshot_id"],
                "snapshots": snap_list
            })

        # Fallback if no months in quanti but snapshots exist
        if not months_list:
            cursor.execute("SELECT id, source_date, created_at, note FROM h_snapshots ORDER BY id DESC")
            snaps = [dict(s) for s in cursor.fetchall()]
            for s in snaps:
                s_date = s.get("source_date") or ""
                m_str = s_date[:7] if len(s_date) >= 7 else "2026-08"
                months_list.append({
                    "month": m_str,
                    "label": f"Instantané #{s['id']} ({s_date})",
                    "year": m_str[:4],
                    "month_name": m_str,
                    "date_min": s_date,
                    "date_max": s_date,
                    "days_count": 1,
                    "quanti_count": 0,
                    "latest_snapshot_id": s["id"],
                    "snapshots": [s]
                })

        return months_list
    except Exception as e:
        print(f"Error fetching historique months: {e}")
        return []
    finally:
        conn.close()


def get_historique_suivi_data_by_month(month=None, snapshot_id=None):
    """
    Retrieve full KPI dataset (quanti, quali, focus_vmm, focus_som) 
    solely from historique.db for a specific month and/or snapshot.
    """
    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        where_snap = ""
        params_snap = []
        if snapshot_id:
            where_snap = "snapshot_id = ?"
            params_snap.append(snapshot_id)

        # 1. Determine target date (latest reporting date of the selected month or snapshot)
        target_date = None
        if month:
            query = "SELECT MAX(date) FROM h_quantitative_data WHERE date LIKE ?"
            params = [f"{month}%"]
            if snapshot_id:
                query += " AND snapshot_id = ?"
                params.append(snapshot_id)
            cursor.execute(query, params)
            row = cursor.fetchone()
            if row and row[0]:
                target_date = row[0]

        if not target_date and snapshot_id:
            cursor.execute("SELECT MAX(date) FROM h_quantitative_data WHERE snapshot_id = ?", (snapshot_id,))
            row = cursor.fetchone()
            if row and row[0]:
                target_date = row[0]
            else:
                cursor.execute("SELECT source_date FROM h_snapshots WHERE id = ?", (snapshot_id,))
                s_row = cursor.fetchone()
                if s_row and s_row[0]:
                    target_date = s_row[0]

        if not target_date:
            cursor.execute("SELECT MAX(date) FROM h_quantitative_data")
            row = cursor.fetchone()
            target_date = row[0] if (row and row[0]) else "2026-08-31"

        actual_month = target_date[:7] if len(target_date) >= 7 else (month or "2026-08")

        # 2. Fetch Quantitative Data on that latest date
        q_params = [target_date]
        q_extra = ""
        if snapshot_id:
            q_extra = " AND snapshot_id = ?"
            q_params.append(snapshot_id)
        cursor.execute(f"""
            SELECT date, vendeur, famille, j1, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf
            FROM h_quantitative_data
            WHERE date = ? {q_extra}
            ORDER BY vendeur ASC, famille ASC
        """, q_params)
        quanti = [dict(r) for r in cursor.fetchall()]

        # If empty on that exact date, load all rows in that month/snapshot
        if not quanti:
            m_params = [f"{actual_month}%"]
            m_extra = ""
            if snapshot_id:
                m_extra = " AND snapshot_id = ?"
                m_params.append(snapshot_id)
            cursor.execute(f"""
                SELECT date, vendeur, famille, j1, real, obj, percent, real_2025, h_2024, h_pct, encours, obj_mois, raf
                FROM h_quantitative_data
                WHERE date LIKE ? {m_extra}
                ORDER BY date DESC, vendeur ASC
            """, m_params)
            quanti = [dict(r) for r in cursor.fetchall()]

        # 3. Fetch Qualitative Data
        cursor.execute(f"""
            SELECT date, vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm
            FROM h_qualitative_data
            WHERE date = ? {q_extra}
            ORDER BY vendeur ASC
        """, q_params)
        quali = [dict(r) for r in cursor.fetchall()]
        if not quali:
            cursor.execute(f"""
                SELECT date, vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm
                FROM h_qualitative_data
                WHERE date LIKE ? {m_extra}
                ORDER BY date DESC, vendeur ASC
            """, m_params)
            quali = [dict(r) for r in cursor.fetchall()]

        # 4. Fetch Focus VMM Data
        cursor.execute(f"""
            SELECT date, vendeur, secteur, dn_fin_mai, obj_juin, nb_clients, obj_acm, percent, realise, rest, jour_rest, rest_jour
            FROM h_focus_vmm_data
            WHERE date = ? {q_extra}
            ORDER BY vendeur ASC
        """, q_params)
        focus_vmm = [dict(r) for r in cursor.fetchall()]
        if not focus_vmm:
            cursor.execute(f"""
                SELECT date, vendeur, secteur, dn_fin_mai, obj_juin, nb_clients, obj_acm, percent, realise, rest, jour_rest, rest_jour
                FROM h_focus_vmm_data
                WHERE date LIKE ? {m_extra}
                ORDER BY date DESC, vendeur ASC
            """, m_params)
            focus_vmm = [dict(r) for r in cursor.fetchall()]

        # 5. Fetch Focus SOM Data
        cursor.execute(f"""
            SELECT date, vendeur, secteur, glace_ht, ttc, percent, realise, rest, rest_jour, jour_rest
            FROM h_focus_som_data
            WHERE date = ? {q_extra}
            ORDER BY vendeur ASC
        """, q_params)
        focus_som = [dict(r) for r in cursor.fetchall()]
        if not focus_som:
            cursor.execute(f"""
                SELECT date, vendeur, secteur, glace_ht, ttc, percent, realise, rest, rest_jour, jour_rest
                FROM h_focus_som_data
                WHERE date LIKE ? {m_extra}
                ORDER BY date DESC, vendeur ASC
            """, m_params)
            focus_som = [dict(r) for r in cursor.fetchall()]

        # Calculate workdays based on target_date and historical month
        from datetime import datetime
        try:
            cur_dt = datetime.strptime(target_date, "%Y-%m-%d")
            total_days = 24
            elapsed_days = min(24, max(1, cur_dt.day * 24 // 31))
            if cur_dt.day >= 28:
                elapsed_days = 20
                rest_days = 4
            else:
                rest_days = max(1, total_days - elapsed_days)
        except Exception:
            total_days = 24
            elapsed_days = 20
            rest_days = 4

        return {
            "date": target_date,
            "month": actual_month,
            "snapshot_id": snapshot_id,
            "quantitative": quanti,
            "qualitative": quali,
            "focus_vmm": focus_vmm,
            "focus_som": focus_som,
            "workdays": {
                "total": total_days,
                "elapsed": elapsed_days,
                "rest": rest_days
            }
        }
    except Exception as e:
        print(f"Error fetching historical suivi data: {e}")
        return {
            "date": "2026-08-31",
            "month": month or "2026-08",
            "snapshot_id": snapshot_id,
            "quantitative": [],
            "qualitative": [],
            "focus_vmm": [],
            "focus_som": [],
            "workdays": {"total": 24, "elapsed": 20, "rest": 4}
        }
    finally:
        conn.close()


def get_historique_visites_and_anomalies(month=None, snapshot_id=None, allowed_sellers=None):
    """
    Fetch and calculate visit stats, tournées, timing anomalies and deviations
    strictly from h_visites_rapports and h_anomalies in historique.db.
    """
    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        from collections import defaultdict
        from datetime import datetime

        where_clauses = ["heure IS NOT NULL AND heure != ''"]
        params = []

        if snapshot_id:
            where_clauses.append("snapshot_id = ?")
            params.append(snapshot_id)
        if month:
            where_clauses.append("date_visite LIKE ?")
            params.append(f"{month}%")

        where_str = " WHERE " + " AND ".join(where_clauses)
        cursor.execute(f"""
            SELECT id, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note
            FROM h_visites_rapports
            {where_str}
            ORDER BY date_visite DESC, vendeur ASC, heure ASC
        """, params)
        rows = [dict(r) for r in cursor.fetchall()]

        # Fallback if specific month/snapshot was empty
        if not rows:
            cursor.execute("""
                SELECT id, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note
                FROM h_visites_rapports
                WHERE heure IS NOT NULL AND heure != ''
                ORDER BY date_visite DESC, vendeur ASC, heure ASC
                LIMIT 5000
            """)
            rows = [dict(r) for r in cursor.fetchall()]

        # Filter by allowed_sellers if provided
        if allowed_sellers:
            allowed_upper = {s.strip().upper() for s in allowed_sellers if s}
            filtered_rows = []
            for r in rows:
                v = (r.get("vendeur") or "").strip().upper()
                v_code = v.split(" ")[0] if " " in v else v
                if v in allowed_upper or any(s.startswith(v_code) for s in allowed_upper) or any(v.startswith(s.split(" ")[0]) for s in allowed_upper):
                    filtered_rows.append(r)
            rows = filtered_rows

        groups = defaultdict(list)
        for r in rows:
            v = (r.get("vendeur") or "").strip()
            d = (r.get("date_visite") or "").strip()
            groups[(v, d)].append(r)

        total_visites = len(rows)
        count_less_3min = 0
        count_multiple = 0
        count_first_late = 0
        count_last_early = 0

        seller_visit_stats = defaultdict(lambda: {
            "total_visites": 0,
            "days_active": set(),
            "anomalies_count": 0,
            "less_3min": 0,
            "first_late": 0,
            "last_early": 0,
            "multiple": 0
        })

        for (vendeur, date_visite), visits in groups.items():
            seller_visit_stats[vendeur]["days_active"].add(date_visite)
            seller_visit_stats[vendeur]["total_visites"] += len(visits)

            client_counts = defaultdict(int)
            for visit in visits:
                c_code = (visit.get("client_code") or "").strip().upper()
                if c_code:
                    client_counts[c_code] += 1
                    if client_counts[c_code] == 2:
                        count_multiple += 1
                        seller_visit_stats[vendeur]["multiple"] += 1
                        seller_visit_stats[vendeur]["anomalies_count"] += 1

                h_str = visit.get("heure") or ""
                if " - " in h_str:
                    parts = h_str.split(" - ")
                    if len(parts) == 2:
                        try:
                            t1 = datetime.strptime(parts[0].strip(), "%H:%M:%S")
                            t2 = datetime.strptime(parts[1].strip(), "%H:%M:%S")
                            dur_secs = (t2 - t1).total_seconds()
                            if 0 < dur_secs < 180:
                                count_less_3min += 1
                                seller_visit_stats[vendeur]["less_3min"] += 1
                                seller_visit_stats[vendeur]["anomalies_count"] += 1
                        except:
                            pass

            if visits:
                h0 = visits[0].get("heure", "")
                if " - " in h0:
                    p0 = h0.split(" - ")[0].strip()
                    if p0 > "08:40:00":
                        count_first_late += 1
                        seller_visit_stats[vendeur]["first_late"] += 1
                        seller_visit_stats[vendeur]["anomalies_count"] += 1
                h_last = visits[-1].get("heure", "")
                if " - " in h_last:
                    p_last = h_last.split(" - ")[1].strip()
                    if p_last < "14:45:00":
                        count_last_early += 1
                        seller_visit_stats[vendeur]["last_early"] += 1
                        seller_visit_stats[vendeur]["anomalies_count"] += 1

        # Also count archived anomalies from h_anomalies
        anom_where = []
        anom_params = []
        if snapshot_id:
            anom_where.append("snapshot_id = ?")
            anom_params.append(snapshot_id)
        if month:
            anom_where.append("date LIKE ?")
            anom_params.append(f"{month}%")
        anom_str = (" WHERE " + " AND ".join(anom_where)) if anom_where else ""
        cursor.execute(f"SELECT COUNT(1) FROM h_anomalies {anom_str}", anom_params)
        db_anomalies_count = cursor.fetchone()[0]

        total_anomalies = max(db_anomalies_count, count_less_3min + count_multiple + count_first_late + count_last_early)

        reps_visites = []
        for v, s in seller_visit_stats.items():
            num_days = len(s["days_active"])
            avg_per_day = round(s["total_visites"] / num_days, 1) if num_days > 0 else 0
            reps_visites.append({
                "vendeur": v,
                "total_visites": s["total_visites"],
                "active_days": num_days,
                "avg_visites_per_day": avg_per_day,
                "anomalies_total": s["anomalies_count"],
                "less_3min": s["less_3min"],
                "first_late": s["first_late"],
                "last_early": s["last_early"],
                "multiple": s["multiple"]
            })
        reps_visites.sort(key=lambda x: x["total_visites"], reverse=True)

        return {
            "total_visites": total_visites,
            "total_anomalies": total_anomalies,
            "count_less_3min": count_less_3min,
            "count_multiple": count_multiple,
            "count_first_late": count_first_late,
            "count_last_early": count_last_early,
            "reps_visites": reps_visites
        }
    except Exception as e:
        print(f"Error fetching historical visites and anomalies: {e}")
        return {
            "total_visites": 0,
            "total_anomalies": 0,
            "count_less_3min": 0,
            "count_multiple": 0,
            "count_first_late": 0,
            "count_last_early": 0,
            "reps_visites": []
        }
    finally:
        conn.close()


def get_historique_vendeur_localites(vendeur, month=None, snapshot_id=None):
    """
    Extracts structured visit breakdown by localité/tournée for a specific vendor
    from h_visites_rapports in historique.db.
    """
    if not vendeur:
        return []

    vcode = vendeur.strip().split()[0].upper()
    vname = vendeur.strip().upper()

    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        where_parts = ["(UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ?)"]
        params = [f"{vcode}%", f"%{vname}%"]

        if snapshot_id:
            where_parts.append("snapshot_id = ?")
            params.append(snapshot_id)
        if month:
            where_parts.append("date_visite LIKE ?")
            params.append(f"{month}%")

        where_str = " WHERE " + " AND ".join(where_parts)
        cursor.execute(f"""
            SELECT tournee, agence, motif, count(1) as cnt
            FROM h_visites_rapports
            {where_str}
            GROUP BY tournee, agence, motif
            ORDER BY tournee ASC
        """, params)
        rows = [dict(r) for r in cursor.fetchall()]

        # If empty with strict filter, try without month filter
        if not rows and month:
            cursor.execute("""
                SELECT tournee, agence, motif, count(1) as cnt
                FROM h_visites_rapports
                WHERE UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ?
                GROUP BY tournee, agence, motif
                ORDER BY tournee ASC
            """, (f"{vcode}%", f"%{vname}%"))
            rows = [dict(r) for r in cursor.fetchall()]

        loc_dict = {}
        for r in rows:
            loc = str(r.get("tournee") or "Localité Inconnue").strip()
            sec = str(r.get("agence") or "-").strip()
            m = str(r.get("motif") or "OK").strip()
            cnt = int(r.get("cnt") or 0)

            if loc not in loc_dict:
                loc_dict[loc] = {
                    "localite": loc,
                    "secteur": sec,
                    "total_visites": 0,
                    "total_factures": 0,
                    "autre": 0,
                    "motifs_autre": {}
                }

            loc_dict[loc]["total_visites"] += cnt
            if m.upper() == "OK" or "VENTE" in m.upper() or "FACTURE" in m.upper():
                loc_dict[loc]["total_factures"] += cnt
            else:
                loc_dict[loc]["autre"] += cnt
                loc_dict[loc]["motifs_autre"][m] = loc_dict[loc]["motifs_autre"].get(m, 0) + cnt

        results = []
        for loc, d in loc_dict.items():
            tot = d["total_visites"]
            fac = d["total_factures"]
            rate = (fac / tot * 100) if tot > 0 else 0.0
            d["taux_facturation_pct"] = rate
            d["taux_facturation"] = f"{rate:.1f}%"

            top_motifs = sorted(d["motifs_autre"].items(), key=lambda x: x[1], reverse=True)
            d["motifs_str"] = ", ".join(f"{k} ({v})" for k, v in top_motifs) if top_motifs else "Aucun"
            results.append(d)

        results.sort(key=lambda x: x["total_visites"], reverse=True)
        return results
    except Exception as e:
        print(f"Error extracting historical localites visites for {vendeur}: {e}")
        return []
    finally:
        conn.close()


def get_historique_weekly_comparison(month=None, snapshot_id=None, tax_mode="TTC", filter_vendeur=None, filter_cdz=None):
    """
    Calculate week-over-week performance comparison by CDZ team and vendor by vendor
    strictly from h_quantitative_data and h_qualitative_data in historique.db.
    """
    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        from datetime import datetime, timedelta

        where_clause = ""
        params = []
        if snapshot_id:
            where_clause = "WHERE snapshot_id = ?"
            params.append(snapshot_id)
        elif month:
            where_clause = "WHERE date LIKE ?"
            params.append(f"{month}%")

        cursor.execute(f"SELECT DISTINCT date FROM h_quantitative_data {where_clause} ORDER BY date DESC", params)
        dates = [r[0] for r in cursor.fetchall()]

        if not dates:
            return {}

        cur_date = dates[0]
        try:
            cur_dt = datetime.strptime(cur_date, "%Y-%m-%d")
        except:
            cur_dt = datetime.now()

        # Find prior week date (~7 days before)
        prev_date = None
        target_prev = (cur_dt - timedelta(days=7)).strftime("%Y-%m-%d")
        if target_prev in dates:
            prev_date = target_prev
        else:
            for d in dates:
                try:
                    dt = datetime.strptime(d, "%Y-%m-%d")
                    diff = (cur_dt - dt).days
                    if 4 <= diff <= 10:
                        prev_date = d
                        break
                except:
                    pass
            if not prev_date and len(dates) > 1:
                for d in dates:
                    if d < cur_date:
                        prev_date = d
                        break

        # Fetch current date quanti rows
        c_params = [cur_date]
        c_snap = ""
        if snapshot_id:
            c_snap = " AND snapshot_id = ?"
            c_params.append(snapshot_id)
        cursor.execute(f"SELECT vendeur, famille, real, obj, obj_mois, raf FROM h_quantitative_data WHERE date = ? {c_snap}", c_params)
        quanti_cur = [dict(r) for r in cursor.fetchall()]

        # Fetch prev date quanti rows
        quanti_prev = []
        if prev_date:
            p_params = [prev_date]
            if snapshot_id:
                p_params.append(snapshot_id)
            cursor.execute(f"SELECT vendeur, famille, real, obj, obj_mois, raf FROM h_quantitative_data WHERE date = ? {c_snap}", p_params)
            quanti_prev = [dict(r) for r in cursor.fetchall()]

        # Fetch FDV mappings
        fdv = get_fdv_list()
        v_to_cdz = {r["vendeur"].strip().upper(): (r.get("cdz") or "AUTRE").strip().upper() for r in fdv}
        allowed_vendeurs = {r["vendeur"].strip().upper() for r in fdv if r.get("cdz") in ("CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA")}

        def extract_quanti(rows):
            res = {}
            for r in rows:
                v = r.get("vendeur", "").strip().upper()
                if not v or "TOTAL" in v:
                    continue
                if v not in res:
                    res[v] = {"real": 0, "obj": 0, "obj_mois": 0, "raf": 0}
                real_val = r.get("real", 0) or 0
                obj_val = r.get("obj", 0) or 0
                obj_m = r.get("obj_mois", 0) or 0
                raf_val = r.get("raf", 0) or 0
                fam = r.get("famille", "").strip().upper()
                if fam in ("C.A (HT)", "C.A (TTC)"):
                    res[v]["real"] = real_val
                    res[v]["obj"] = obj_val
                    res[v]["obj_mois"] = obj_m
                    res[v]["raf"] = raf_val
            return res

        sellers_cur = extract_quanti(quanti_cur)
        sellers_prev = extract_quanti(quanti_prev)

        all_sellers = set(sellers_cur.keys()).union(sellers_prev.keys())
        if allowed_vendeurs:
            all_sellers = [s for s in all_sellers if s in allowed_vendeurs]

        # Fetch qualitative ACM & TSM on cur_date & prev_date
        cursor.execute(f"SELECT vendeur, acm, tsm FROM h_qualitative_data WHERE date = ? {c_snap}", c_params)
        quali_cur_rows = [dict(r) for r in cursor.fetchall()]
        v_acm_c = {r["vendeur"].strip().upper(): (r.get("acm") or 0.0) * 100 for r in quali_cur_rows}
        v_tsm_c = {r["vendeur"].strip().upper(): (r.get("tsm") or 0.0) * 100 for r in quali_cur_rows}

        v_acm_p = {}
        v_tsm_p = {}
        if prev_date:
            p_params = [prev_date]
            if snapshot_id:
                p_params.append(snapshot_id)
            cursor.execute(f"SELECT vendeur, acm, tsm FROM h_qualitative_data WHERE date = ? {c_snap}", p_params)
            quali_prev_rows = [dict(r) for r in cursor.fetchall()]
            v_acm_p = {r["vendeur"].strip().upper(): (r.get("acm") or 0.0) * 100 for r in quali_prev_rows}
            v_tsm_p = {r["vendeur"].strip().upper(): (r.get("tsm") or 0.0) * 100 for r in quali_prev_rows}

        vendeurs_data = []
        for v in all_sellers:
            cdz = v_to_cdz.get(v, "AUTRE")
            d_c = sellers_cur.get(v, {"real": 0, "obj": 0, "obj_mois": 0, "raf": 0})
            d_p = sellers_prev.get(v, {"real": 0, "obj": 0, "obj_mois": 0, "raf": 0})

            real_c = d_c["real"]
            real_p = d_p["real"]
            obj_c = d_c["obj"]

            if tax_mode == "HT":
                real_c = int(round(real_c / 1.2))
                real_p = int(round(real_p / 1.2))
                obj_c = int(round(obj_c / 1.2))

            diff_dh = real_c - real_p
            diff_pct = ((real_c - real_p) / real_p * 100) if real_p > 0 else (0.0 if real_c == 0 else 100.0)
            rate = ((real_c - obj_c) / obj_c * 100) if obj_c > 0 else -100.0
            acm_c = v_acm_c.get(v, 0.0)
            acm_p = v_acm_p.get(v, 0.0)
            tsm_c = v_tsm_c.get(v, 0.0)
            tsm_p = v_tsm_p.get(v, 0.0)

            if diff_pct >= 5:
                trend = "📈 Hausse"
            elif diff_pct <= -5:
                trend = "📉 Baisse"
            else:
                trend = "➡️ Stable"

            v_info = {
                "vendeur": v,
                "cdz": cdz,
                "real_prev": real_p,
                "real_cur": real_c,
                "diff_dh": diff_dh,
                "diff_pct": diff_pct,
                "obj": obj_c,
                "rate": rate,
                "acm_cur": acm_c,
                "acm_prev": acm_p,
                "tsm_cur": tsm_c,
                "tsm_prev": tsm_p,
                "trend": trend
            }
            vendeurs_data.append(v_info)

        vendeurs_data.sort(key=lambda x: x["diff_pct"], reverse=True)

        cdz_teams = ["CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA"]
        cdz_summary = []
        for target_cdz_name in cdz_teams:
            reps = [x for x in vendeurs_data if x["cdz"].strip().upper() == target_cdz_name.strip().upper()]
            c_tot = sum(x["real_cur"] for x in reps)
            p_tot = sum(x["real_prev"] for x in reps)
            o_tot = sum(x["obj"] for x in reps)
            d_dh = c_tot - p_tot
            d_pct = ((c_tot - p_tot) / p_tot * 100) if p_tot > 0 else 0.0
            r_tot = ((c_tot - o_tot) / o_tot * 100) if o_tot > 0 else -100.0

            avg_acm_c = sum(x["acm_cur"] for x in reps) / len(reps) if reps else 0.0
            avg_acm_p = sum(x["acm_prev"] for x in reps) / len(reps) if reps else 0.0
            avg_tsm_c = sum(x["tsm_cur"] for x in reps) / len(reps) if reps else 0.0
            avg_tsm_p = sum(x["tsm_prev"] for x in reps) / len(reps) if reps else 0.0

            cdz_summary.append({
                "cdz": f"Équipe {target_cdz_name.title()}",
                "cdz_raw": target_cdz_name,
                "reps_count": len(reps),
                "real_cur": c_tot,
                "real_prev": p_tot,
                "diff_dh": d_dh,
                "diff_pct": d_pct,
                "obj": o_tot,
                "rate": r_tot,
                "acm_cur": avg_acm_c,
                "acm_prev": avg_acm_p,
                "tsm_cur": avg_tsm_c,
                "tsm_prev": avg_tsm_p
            })

        tot_c = sum(x["real_cur"] for x in cdz_summary)
        tot_p = sum(x["real_prev"] for x in cdz_summary)
        tot_o = sum(x["obj"] for x in cdz_summary)
        tot_d_dh = tot_c - tot_p
        tot_d_pct = ((tot_c - tot_p) / tot_p * 100) if tot_p > 0 else 0.0
        tot_rate = ((tot_c - tot_o) / tot_o * 100) if tot_o > 0 else -100.0
        tot_acm_c = sum(x["acm_cur"] for x in cdz_summary) / len(cdz_summary) if cdz_summary else 0.0
        tot_acm_p = sum(x["acm_prev"] for x in cdz_summary) / len(cdz_summary) if cdz_summary else 0.0

        agency_total = {
            "cdz": "TOTAL AGENCE CONSOLIDÉ",
            "cdz_raw": "ALL",
            "reps_count": len(vendeurs_data),
            "real_cur": tot_c,
            "real_prev": tot_p,
            "diff_dh": tot_d_dh,
            "diff_pct": tot_d_pct,
            "obj": tot_o,
            "rate": tot_rate,
            "acm_cur": tot_acm_c,
            "acm_prev": tot_acm_p
        }

        # Compute multi-week progression
        all_sorted_dates = sorted(dates)
        weeks_dict = {}
        for d in all_sorted_dates:
            try:
                dt = datetime.strptime(d, "%Y-%m-%d")
                w_num = dt.isocalendar()[1]
                weeks_dict.setdefault(w_num, []).append(d)
            except:
                pass

        sorted_week_nums = sorted(weeks_dict.keys())
        week_keys = [f"S{i+1}" for i in range(len(sorted_week_nums))]
        week_endpoints = [max(weeks_dict[w]) for w in sorted_week_nums]

        multi_weekly_cumuls = {}
        for w_lbl, ep in zip(week_keys, week_endpoints):
            ep_params = [ep]
            if snapshot_id:
                ep_params.append(snapshot_id)
            cursor.execute(f"SELECT vendeur, famille, real, obj FROM h_quantitative_data WHERE date = ? {c_snap}", ep_params)
            ep_rows = [dict(r) for r in cursor.fetchall()]
            for r in ep_rows:
                v = r.get("vendeur", "").strip().upper()
                if v not in allowed_vendeurs or r.get("famille") not in ("C.A (ht)", "C.A (TTC)"):
                    continue
                r_val = r.get("real", 0) or 0
                o_val = r.get("obj", 0) or 0
                if tax_mode == "HT":
                    r_val = int(round(r_val / 1.2))
                    o_val = int(round(o_val / 1.2))
                multi_weekly_cumuls.setdefault(v, {})[w_lbl] = r_val
                multi_weekly_cumuls[v]["obj"] = o_val

        vendor_multi_week = []
        for v in sorted(allowed_vendeurs):
            cumuls = multi_weekly_cumuls.get(v, {})
            discrete = {}
            prev_val = 0
            for w_lbl in week_keys:
                cur_val = cumuls.get(w_lbl, prev_val)
                discrete[w_lbl] = max(0, cur_val - prev_val)
                prev_val = cur_val
            tot_val = prev_val
            obj_val = cumuls.get("obj", 0)
            rate_val = ((tot_val - obj_val) / obj_val * 100) if obj_val > 0 else -100.0

            vals = [discrete[w] for w in week_keys]
            if len(vals) >= 2:
                if vals[-1] > vals[-2] * 1.15:
                    dyn = "🚀 Accélération"
                elif vals[-1] < vals[-2] * 0.85:
                    dyn = "📉 Ralentissement"
                else:
                    dyn = "➡️ Régulier"
            else:
                dyn = "➡️ Stable"

            vendor_multi_week.append({
                "vendeur": v,
                "cdz": v_to_cdz.get(v, "AUTRE"),
                "weeks": discrete,
                "total": tot_val,
                "obj": obj_val,
                "rate": rate_val,
                "trend": dyn
            })

        cdz_multi_week = []
        for cdz_name in cdz_teams:
            cdz_vends = [x for x in vendor_multi_week if x["cdz"].strip().upper() == cdz_name.strip().upper()]
            weeks_sum = {}
            for w_lbl in week_keys:
                weeks_sum[w_lbl] = sum(x["weeks"].get(w_lbl, 0) for x in cdz_vends)
            tot_cdz = sum(x["total"] for x in cdz_vends)
            obj_cdz = sum(x["obj"] for x in cdz_vends)
            rate_cdz = ((tot_cdz - obj_cdz) / obj_cdz * 100) if obj_cdz > 0 else -100.0

            vals = [weeks_sum[w] for w in week_keys]
            if len(vals) >= 2:
                if vals[-1] > vals[-2] * 1.15:
                    dyn = "🚀 Accélération"
                elif vals[-1] < vals[-2] * 0.85:
                    dyn = "📉 Ralentissement"
                else:
                    dyn = "➡️ Régulier"
            else:
                dyn = "➡️ Stable"

            cdz_multi_week.append({
                "cdz": f"Équipe {cdz_name.title()}",
                "cdz_raw": cdz_name,
                "weeks": weeks_sum,
                "total": tot_cdz,
                "obj": obj_cdz,
                "rate": rate_cdz,
                "trend": dyn
            })

        agency_weeks_sum = {}
        for w_lbl in week_keys:
            agency_weeks_sum[w_lbl] = sum(x["weeks"].get(w_lbl, 0) for x in cdz_multi_week)
        tot_agency_m = sum(x["total"] for x in cdz_multi_week)
        obj_agency_m = sum(x["obj"] for x in cdz_multi_week)
        rate_agency_m = ((tot_agency_m - obj_agency_m) / obj_agency_m * 100) if obj_agency_m > 0 else -100.0

        agency_multi_week = {
            "cdz": "TOTAL AGENCE CONSOLIDÉ",
            "weeks": agency_weeks_sum,
            "total": tot_agency_m,
            "obj": obj_agency_m,
            "rate": rate_agency_m,
            "trend": "➡️ Global"
        }

        return {
            "current_date": cur_date,
            "previous_date": prev_date or "S-1",
            "tax_mode": tax_mode,
            "cdz_summary": cdz_summary,
            "agency_total": agency_total,
            "vendeurs": vendeurs_data,
            "cdz_multi_week": cdz_multi_week,
            "vendor_multi_week": vendor_multi_week,
            "agency_multi_week": agency_multi_week,
            "week_keys": week_keys
        }
    except Exception as e:
        print(f"Error computing historical weekly comparison: {e}")
        return {}
    finally:
        conn.close()


def save_historique_generated_report(snapshot_id, report_text, title=None, vendeur=None, format="complet", lang="fr", report_date=None):
    """Save or update an AI generated report associated with a historical snapshot in historique.db."""
    init_historique_db()
    conn = get_historique_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM h_rapports WHERE snapshot_id = ?", (snapshot_id,))
        cursor.execute("""
            INSERT INTO h_rapports (snapshot_id, report_text, title, vendeur, format, lang, report_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            snapshot_id,
            report_text,
            title or "Rapport IA Généré (Historique)",
            vendeur or None,
            format,
            lang,
            report_date or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error saving report to historique snapshot #{snapshot_id}: {e}")
        return False
    finally:
        conn.close()


def delete_and_recreate_db_file(report_data=None):
    """Backs up data to historique.db, then deletes database.db and creates a new clean one."""
    import gc

    # Step 1: Backup to historique.db BEFORE deleting
    snapshot_id = None
    try:
        snapshot_id = backup_to_historique(report_data=report_data, note="Sauvegarde automatique avant réinitialisation database.db")
        print(f"[DB] Backup to historique.db completed (snapshot #{snapshot_id})")
    except Exception as e:
        print(f"[DB] WARNING: Backup to historique.db failed: {e}")
        # Continue with delete even if backup fails (data might be empty)

    # Step 2: Delete and recreate
    gc.collect()
    
    if os.path.exists(DB_PATH):
        try:
            os.remove(DB_PATH)
            print(f"Successfully deleted {DB_PATH}")
        except Exception as e:
            print(f"File remove error for {DB_PATH}: {e}. Falling back to table drop & vacuum.")
            try:
                conn = sqlite3.connect(DB_PATH)
                cursor = conn.cursor()
                cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';")
                tables = [row[0] for row in cursor.fetchall()]
                for t in tables:
                    cursor.execute(f"DROP TABLE IF EXISTS \"{t}\"")
                conn.commit()
                cursor.execute("VACUUM")
                conn.close()
            except Exception as inner_e:
                print(f"Fallback drop error: {inner_e}")

    init_db()
    return {"success": True, "snapshot_id": snapshot_id}



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
    """List clients with server-side filtering, search, sorting and pagination using relational model."""
    conn = get_db_connection()
    cursor = conn.cursor()

    where_parts = []
    params = []

    if search:
        like = f"%{search.strip()}%"
        where_parts.append("(c.code LIKE ? OR c.name LIKE ? OR l.name LIKE ? OR s.name LIKE ?)")
        params.extend([like, like, like, like])

    if secteurs:
        placeholders = ",".join(["?" for _ in secteurs])
        where_parts.append(f"s.name IN ({placeholders})")
        params.extend(secteurs)

    if localites:
        placeholders = ",".join(["?" for _ in localites])
        where_parts.append(f"l.name IN ({placeholders})")
        params.extend(localites)

    where_clause = "WHERE " + " AND ".join(where_parts) if where_parts else ""

    # Count query
    count_query = f"""
        SELECT COUNT(*) AS c 
        FROM clients c
        JOIN secteurs s ON c.secteur_id = s.id
        JOIN localites l ON c.localite_id = l.id
        {where_clause}
    """
    cursor.execute(count_query, params)
    total = cursor.fetchone()["c"]

    sort_columns = {
        "code": "c.code",
        "name": "c.name",
        "secteur": "s.name",
        "localite": "l.name",
        "row_index": "c.id",
    }
    sort_col = sort_columns.get(sort_by, "c.id")
    sort_direction = "DESC" if (sort_dir or "").upper() == "DESC" else "ASC"

    page = max(1, int(page or 1))
    per_page = max(1, min(int(per_page or 25), 500))
    offset = (page - 1) * per_page

    list_query = f"""
        SELECT c.id, c.code, c.name, s.name AS secteur, l.name AS localite,
               c.vendeur_som, c.vendeur_vmm, 0 AS is_repeat, c.id AS row_index
        FROM clients c
        JOIN secteurs s ON c.secteur_id = s.id
        JOIN localites l ON c.localite_id = l.id
        {where_clause}
        ORDER BY {sort_col} {sort_direction}, c.id {sort_direction}
        LIMIT ? OFFSET ?
    """
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


def get_clients_full_filters(secteurs=None):
    """Return distinct values for filterable fields from secteurs, localites, and clients."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT DISTINCT name FROM secteurs WHERE name IS NOT NULL AND name != '' ORDER BY name ASC")
    secteurs_list = [r["name"] for r in cursor.fetchall()]

    # Full mapping of each secteur to its localités
    cursor.execute("""
        SELECT s.name AS secteur_name, l.name AS localite_name
        FROM localites l
        JOIN secteurs s ON l.secteur_id = s.id
        WHERE l.name IS NOT NULL AND l.name != ''
        ORDER BY s.name ASC, l.name ASC
    """)
    secteur_localites_map = {}
    for r in cursor.fetchall():
        s_name = r["secteur_name"]
        l_name = r["localite_name"]
        if s_name not in secteur_localites_map:
            secteur_localites_map[s_name] = []
        if l_name not in secteur_localites_map[s_name]:
            secteur_localites_map[s_name].append(l_name)

    if secteurs and len(secteurs) > 0:
        placeholders = ",".join("?" for _ in secteurs)
        cursor.execute(f"""
            SELECT DISTINCT l.name 
            FROM localites l 
            JOIN secteurs s ON l.secteur_id = s.id 
            WHERE s.name IN ({placeholders}) AND l.name IS NOT NULL AND l.name != '' 
            ORDER BY l.name ASC
        """, secteurs)
        localites_list = [r["name"] for r in cursor.fetchall()]

        cursor.execute(f"""
            SELECT DISTINCT c.vendeur_som 
            FROM clients c 
            JOIN secteurs s ON c.secteur_id = s.id 
            WHERE s.name IN ({placeholders}) AND c.vendeur_som IS NOT NULL AND c.vendeur_som != '' 
            ORDER BY c.vendeur_som ASC
        """, secteurs)
        vendeurs_som_list = [r["vendeur_som"] for r in cursor.fetchall()]

        cursor.execute(f"""
            SELECT DISTINCT c.vendeur_vmm 
            FROM clients c 
            JOIN secteurs s ON c.secteur_id = s.id 
            WHERE s.name IN ({placeholders}) AND c.vendeur_vmm IS NOT NULL AND c.vendeur_vmm != '' 
            ORDER BY c.vendeur_vmm ASC
        """, secteurs)
        vendeurs_vmm_list = [r["vendeur_vmm"] for r in cursor.fetchall()]
    else:
        cursor.execute("SELECT DISTINCT name FROM localites WHERE name IS NOT NULL AND name != '' ORDER BY name ASC")
        localites_list = [r["name"] for r in cursor.fetchall()]

        cursor.execute("SELECT DISTINCT vendeur_som FROM clients WHERE vendeur_som IS NOT NULL AND vendeur_som != '' ORDER BY vendeur_som ASC")
        vendeurs_som_list = [r["vendeur_som"] for r in cursor.fetchall()]

        cursor.execute("SELECT DISTINCT vendeur_vmm FROM clients WHERE vendeur_vmm IS NOT NULL AND vendeur_vmm != '' ORDER BY vendeur_vmm ASC")
        vendeurs_vmm_list = [r["vendeur_vmm"] for r in cursor.fetchall()]

    conn.close()
    return {
        "secteurs": secteurs_list,
        "localites": localites_list,
        "vendeurs_som": vendeurs_som_list,
        "vendeurs_vmm": vendeurs_vmm_list,
        "secteur_localites_map": secteur_localites_map
    }


def get_clients_full_stats():
    """Return summary statistics for the clients table."""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) AS c FROM clients")
    total = cursor.fetchone()["c"]
    
    cursor.execute("SELECT COUNT(DISTINCT code) AS c FROM clients")
    unique_codes = cursor.fetchone()["c"]

    cursor.execute("""
        SELECT s.name AS secteur, COUNT(*) AS c 
        FROM clients c
        JOIN secteurs s ON c.secteur_id = s.id 
        GROUP BY s.name ORDER BY c DESC
    """)
    by_secteur = [dict(r) for r in cursor.fetchall()]

    cursor.execute("""
        SELECT vendeur_som AS vendeur, COUNT(*) AS c 
        FROM clients 
        WHERE vendeur_som IS NOT NULL AND vendeur_som != '' 
        GROUP BY vendeur_som ORDER BY c DESC
    """)
    by_vendeur = [dict(r) for r in cursor.fetchall()]

    conn.close()
    return {
        "total": total,
        "repeats": 0,
        "unique_codes": unique_codes,
        "by_secteur": by_secteur,
        "by_vendeur": by_vendeur,
    }


def sync_clients_vendeurs_from_fdv():
    """Sync vendeur_som and vendeur_vmm for all clients across all secteurs based on fdv table."""
    def normalize_sec(name):
        if not name: return ""
        n = name.upper().strip()
        n = n.replace("ESSALAM", "SALAM").replace("EL ", "").replace("MOHAMMADI", "MOHAMADI")
        n = n.replace("BOUIZAKARNE", "BOUIZAKARN").replace("TAROUDANTE EXT IDAOUTANANE", "TAROUDANTE_EXT_IDAOUTANANE")
        return n

    conn = get_db_connection()
    cursor = conn.cursor()

    fdv_rows = cursor.execute("SELECT vendeur, role, secteur FROM fdv").fetchall()
    secteur_vendors = {}
    for r in fdv_rows:
        sec = normalize_sec(r["secteur"])
        role = r["role"].strip().upper()
        v = r["vendeur"].strip()
        if sec not in secteur_vendors:
            secteur_vendors[sec] = {"SOM": None, "VMM": None}
        if "SOM" in role:
            secteur_vendors[sec]["SOM"] = v
        if "VMM" in role:
            secteur_vendors[sec]["VMM"] = v

    sorted_base_secs = sorted(secteur_vendors.keys(), key=lambda x: len(x), reverse=True)
    sec_rows = cursor.execute("SELECT id, name FROM secteurs").fetchall()

    for s in sec_rows:
        s_id = s["id"]
        s_name = s["name"]
        norm_s = normalize_sec(s_name)
        som_v = None
        vmm_v = None
        for base in sorted_base_secs:
            if base in norm_s:
                som_v = secteur_vendors[base]["SOM"]
                vmm_v = secteur_vendors[base]["VMM"]
                break
        if not vmm_v and som_v: vmm_v = som_v
        if not som_v and vmm_v: som_v = vmm_v

        cursor.execute("""
            UPDATE clients 
            SET vendeur_som = ?, vendeur_vmm = ?
            WHERE secteur_id = ?
        """, (som_v or "", vmm_v or "", s_id))

    conn.commit()
    conn.close()
    return True




# ------------------------------------------------------------------
# Client management (edit, delete, vendeur assignment)
# ------------------------------------------------------------------

def get_client_by_id(client_id):
    """Return a single client row with secteur and localite names."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT c.id, c.code, c.name, s.name AS secteur, l.name AS localite,
               c.vendeur_som, c.vendeur_vmm, c.secteur_id, c.localite_id
        FROM clients c
        JOIN secteurs s ON c.secteur_id = s.id
        JOIN localites l ON c.localite_id = l.id
        WHERE c.id = ?
    """, (client_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def update_client(client_id, name=None, secteur_id=None, localite_id=None,
                  vendeur_som=None, vendeur_vmm=None):
    """Update editable fields on a single client."""
    conn = get_db_connection()
    cursor = conn.cursor()
    sets = []
    params = []
    if name is not None:
        sets.append("name = ?"); params.append(name.strip())
    if secteur_id is not None:
        sets.append("secteur_id = ?"); params.append(secteur_id)
    if localite_id is not None:
        sets.append("localite_id = ?"); params.append(localite_id)
    if vendeur_som is not None:
        sets.append("vendeur_som = ?"); params.append(vendeur_som.strip())
    if vendeur_vmm is not None:
        sets.append("vendeur_vmm = ?"); params.append(vendeur_vmm.strip())
    if not sets:
        conn.close()
        return False
    params.append(client_id)
    cursor.execute(f"UPDATE clients SET {', '.join(sets)} WHERE id = ?", params)
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def delete_client(client_id):
    """Delete a single client row."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM clients WHERE id = ?", (client_id,))
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected > 0


def assign_vendeur_to_secteur(secteur_id, channel, vendeur_name):
    """
    Assign a vendeur to ALL clients in a given secteur for one channel.
    channel: 'som' | 'vmm'
    """
    col = "vendeur_som" if channel == "som" else "vendeur_vmm"
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        f"UPDATE clients SET {col} = ? WHERE secteur_id = ?",
        (vendeur_name.strip(), secteur_id)
    )
    conn.commit()
    affected = cursor.rowcount
    conn.close()
    return affected


def get_fdv_vendeurs_for_select():
    """Return vendeurs grouped by channel for dropdowns (SOM and VMM).
    Each entry includes a 'dual' flag that is True when the vendeur handles both channels.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT vendeur, role, secteur FROM fdv ORDER BY role, vendeur"
    )
    rows = cursor.fetchall()
    conn.close()
    som = []
    vmm = []
    for r in rows:
        role = (r["role"] or "").strip().upper()
        is_dual = "SOM" in role and "VMM" in role
        entry = {
            "vendeur": r["vendeur"],
            "secteur": r["secteur"],
            "dual": is_dual,   # True → handles both SOM and VMM
        }
        if "SOM" in role:
            som.append(entry)
        if "VMM" in role:
            vmm.append(entry)
    return {"som": som, "vmm": vmm}


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
    if not vendeur:
        return None
    v_str = str(vendeur).strip()
    if not v_str:
        return None
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # 1. Exact match
    cursor.execute(
        "SELECT id, vendeur, role, type_role, cdz, activite, secteur, telephone, "
        "whatsapp, recrutement, notes, created_at, updated_at "
        "FROM fdv WHERE vendeur = ?",
        (v_str,),
    )
    row = cursor.fetchone()
    
    # 2. Case-insensitive exact match
    if not row:
        cursor.execute(
            "SELECT id, vendeur, role, type_role, cdz, activite, secteur, telephone, "
            "whatsapp, recrutement, notes, created_at, updated_at "
            "FROM fdv WHERE UPPER(vendeur) = ?",
            (v_str.upper(),),
        )
        row = cursor.fetchone()
        
    # 3. Partial match (v_str contained in vendeur or vendeur contained in v_str)
    if not row:
        cursor.execute(
            "SELECT id, vendeur, role, type_role, cdz, activite, secteur, telephone, "
            "whatsapp, recrutement, notes, created_at, updated_at "
            "FROM fdv WHERE UPPER(vendeur) LIKE ? OR ? LIKE '%' || UPPER(vendeur) || '%'",
            (f"%{v_str.upper()}%", v_str.upper()),
        )
        row = cursor.fetchone()

    # 4. Token-based match (e.g. "BAIZ" or "MOHAMED")
    if not row:
        tokens = [t for t in v_str.upper().split() if len(t) >= 3]
        for t in tokens:
            cursor.execute(
                "SELECT id, vendeur, role, type_role, cdz, activite, secteur, telephone, "
                "whatsapp, recrutement, notes, created_at, updated_at "
                "FROM fdv WHERE UPPER(vendeur) LIKE ?",
                (f"%{t}%",),
            )
            row = cursor.fetchone()
            if row:
                break

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


def normalize_whatsapp_phone(phone, default_country="212"):
    """Normalize phone number to digits-only E.164 format without '+' for wa.me links."""
    if not phone:
        return ""
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    if not digits:
        return ""
    if digits.startswith("212") and len(digits) >= 11:
        return digits
    if digits.startswith("0"):
        return (default_country or "212") + digits[1:]
    if len(digits) == 9:
        return (default_country or "212") + digits
    return digits


def build_whatsapp_url(phone, message, default_country="212"):
    """Build a wa.me link that opens a chat with the given phone
    number and pre-fills a message.

    Accepts inputs in 0XXXXXXXXX, +212XXXXXXXXX, 212XXXXXXXXX,
    +212 6XX-XX-XX-XX etc. and normalises to the form wa.me expects (digits with country code).
    """
    wa_phone = normalize_whatsapp_phone(phone, default_country)
    if not wa_phone:
        return None
    from urllib.parse import quote
    url = f"https://wa.me/{wa_phone}"
    if message:
        url += "?text=" + quote(message, safe="")
    return url


def get_vendeur_phone_from_fdv(vendeur_name):
    """Lookup the WhatsApp or telephone number for a given vendeur name from the FDV database table.
    
    First tries exact match on `vendeur` in the `fdv` table.
    If not found, tries partial match (case-insensitive) on `vendeur`.
    If found, prefers `whatsapp` column if non-empty, otherwise `telephone`.
    Returns normalized phone string suitable for wa.me link.
    """
    if not vendeur_name:
        return None
        
    v_str = str(vendeur_name).strip()
    if not v_str:
        return None
        
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Exact match on vendeur
        cursor.execute("SELECT whatsapp, telephone FROM fdv WHERE UPPER(vendeur) = ?", (v_str.upper(),))
        row = cursor.fetchone()
        
        # 2. Partial match if exact match not found
        if not row:
            cursor.execute(
                "SELECT whatsapp, telephone FROM fdv WHERE "
                "UPPER(vendeur) LIKE ? OR ? LIKE '%' || UPPER(vendeur) || '%'",
                (f"%{v_str.upper()}%", v_str.upper())
            )
            row = cursor.fetchone()
            
        # 3. Match by Vendeur Code prefix (e.g., E14, K60, D48)
        if not row:
            import re
            m = re.match(r'^([A-Za-z0-9]{2,4})\b', v_str.strip())
            if m:
                v_code = m.group(1).upper()
                cursor.execute(
                    "SELECT whatsapp, telephone FROM fdv WHERE "
                    "UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ?",
                    (f"{v_code} %", f"{v_code}-%")
                )
                row = cursor.fetchone()
        
        if row:
            raw_phone = row["whatsapp"] if (row["whatsapp"] and str(row["whatsapp"]).strip()) else row["telephone"]
            if raw_phone and str(raw_phone).strip():
                # Normalize digits for WhatsApp wa.me
                digits = "".join(ch for ch in str(raw_phone) if ch.isdigit())
                if digits.startswith("0") and len(digits) == 10:
                    digits = "212" + digits[1:]
                elif not digits.startswith("212") and len(digits) == 9:
                    digits = "212" + digits
                return digits
    except Exception as e:
        print(f"Error querying FDV table for vendeur phone: {e}")
        
    # Fallback to static dictionary from vendeur_phones if available
    try:
        from vendeur_phones import vendedor_number_phone, normalize_phone_for_wa
        raw = vendeur_number_phone.get(v_str, "")
        if not raw:
            for k, ph in vendeur_number_phone.items():
                if k.lower() in v_str.lower() or v_str.lower() in k.lower():
                    raw = ph
                    break
        if raw:
            return normalize_phone_for_wa(raw)
    except Exception:
        pass
        
    return None


def get_vendeur_activite_from_fdv(vendeur_name):
    """Lookup the Activité (SOM, VMM, or SOM VMM from the `role` column) for a given vendeur name from the FDV database table."""
    if not vendeur_name:
        return ""
    v_str = str(vendeur_name).strip()
    if not v_str:
        return ""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # 1. Exact match on vendeur
        cursor.execute("SELECT role FROM fdv WHERE UPPER(vendeur) = ?", (v_str.upper(),))
        row = cursor.fetchone()
        
        # 2. Partial match if exact match not found
        if not row or not row["role"]:
            cursor.execute(
                "SELECT role FROM fdv WHERE "
                "UPPER(vendeur) LIKE ? OR ? LIKE '%' || UPPER(vendeur) || '%'",
                (f"%{v_str.upper()}%", v_str.upper())
            )
            row = cursor.fetchone()
            
        # 3. Match by Vendeur Code prefix (e.g., E14, K60, D48)
        if not row or not row["role"]:
            import re
            m = re.match(r'^([A-Za-z0-9]{2,4})\b', v_str.strip())
            if m:
                v_code = m.group(1).upper()
                cursor.execute(
                    "SELECT role FROM fdv WHERE "
                    "UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ?",
                    (f"{v_code} %", f"{v_code}-%")
                )
                row = cursor.fetchone()
        
        if row and row["role"]:
            return str(row["role"]).strip().upper()
    except Exception as e:
        print(f"Error querying FDV table for vendeur activite: {e}")
    return ""


def get_all_vendeur_activites_from_fdv():
    """Returns a dictionary mapping every vendeur in the FDV table to their role/activite (SOM, VMM, SOM VMM)."""
    mapping = {}
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT vendeur, role FROM fdv")
        for row in cursor.fetchall():
            v = row["vendeur"]
            r = row["role"]
            if v and r:
                mapping[v.strip()] = r.strip().upper()
    except Exception as e:
        print(f"Error getting all vendeur activites from FDV: {e}")
    return mapping



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


def resolve_vendor_cdz(vendeur, secteur=""):
    """Accurately match any vendor name or code to their CDZ / Equipe."""
    if not vendeur:
        return ""
    v_clean = str(vendeur).strip().upper()
    v_code = v_clean.split()[0] if v_clean else ""

    # Check known keywords first
    CHAKIB_KEYWORDS = ['CHAKIB', 'IBACH', 'BAIZ', 'ACHAOUI', 'ELHAOUZI', 'BOUALLALI', 'LASRI', 'AKNOUN', 'GHOUSMI', 'BOUMDIANE', 'BOUBAKER']
    BOUTMEZGUINE_KEYWORDS = ['BOUTMEZGUINE', 'FAICAL', 'NAMOUSS', 'NAMOUS', 'YOUSSEF', 'ASERY', 'ATOUAOU', 'GHANMI', 'OUARSSASSA', 'BENOUALLAD', 'BOUDHOUR', 'OUAHMI', 'ACHTOUK', 'MEZRAOUI', 'KHALI', 'AKKA']
    
    for kw in CHAKIB_KEYWORDS:
        if kw in v_clean:
            return 'CHAKIB ELFIL'
    for kw in BOUTMEZGUINE_KEYWORDS:
        if kw in v_clean:
            return 'BOUTMEZGUINE EL MOSTAFA'

    # Check from database (fdv or vendeurs)
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT vendeur, cdz FROM fdv WHERE cdz IS NOT NULL AND cdz != ''")
        fdv_rows = cursor.fetchall()
        conn.close()
        for f in fdv_rows:
            f_v = (f["vendeur"] or "").strip().upper()
            f_cdz = (f["cdz"] or "").strip().upper()
            if f_v == v_clean:
                return f_cdz
            f_code = f_v.split()[0] if f_v else ""
            if len(v_code) >= 2 and f_code == v_code:
                return f_cdz
    except Exception:
        pass

    return ""


def save_focus_objectives(objectives):
    """Save parsed objectives from Focus.xlsx including CDZ / Equipe"""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM focus_objectives")
    for o in objectives:
        vendeur = o.get("vendeur")
        secteur = o.get("secteur")
        cdz = (o.get("cdz") or "").strip()
        if not cdz:
            cdz = resolve_vendor_cdz(vendeur, secteur)

        cursor.execute("""
        INSERT INTO focus_objectives 
        (focus_type, vendeur, secteur, number_client, obj_acm, obj_juin, glace_ht, ttc, cdz)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            o.get("focus_type"),
            vendeur,
            secteur,
            o.get("number_client", 0),
            o.get("obj_acm", 0.0),
            o.get("obj_juin", 0.0),
            o.get("glace_ht", 0.0),
            o.get("ttc", 0.0),
            cdz
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


def get_focus_whatsapp_data(vendeur=None, cdz=None):
    """
    Retrieves paired SOM and VMM focus objectives per vendor,
    including CDZ, sector, and normalized phone number.
    """
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, focus_type, vendeur, secteur, number_client, obj_acm, obj_juin, glace_ht, ttc, cdz 
        FROM focus_objectives
    """)
    rows = [dict(o) for o in cursor.fetchall()]
    conn.close()

    focus_names = get_focus_names()
    som_product_name = focus_names.get("GLACE", "PAPILLOTE")
    vmm_product_name = focus_names.get("TOMATE_FRITO", "BIGGY TASTY T/B")

    # Group objectives by normalized vendor code/name
    vendors_dict = {}
    for r in rows:
        v_raw = (r.get("vendeur") or "").strip()
        if not v_raw:
            continue
        v_key = v_raw.upper()
        if v_key not in vendors_dict:
            cdz_val = (r.get("cdz") or "").strip()
            if not cdz_val:
                cdz_val = resolve_vendor_cdz(v_raw, r.get("secteur", ""))
            
            phone = get_vendeur_phone_from_fdv(v_raw) or ""

            vendors_dict[v_key] = {
                "vendeur": v_raw,
                "secteur": (r.get("secteur") or "").strip(),
                "cdz": cdz_val,
                "phone": phone,
                "som": {"ht": 0.0, "ttc": 0.0},
                "vmm": {"ht": 0.0, "ttc": 0.0, "nb_clients": 0, "obj_acm": 0.0}
            }

        ft = r.get("focus_type")
        ht = float(r.get("glace_ht") or r.get("obj_juin") or 0.0)
        ttc = float(r.get("ttc") or 0.0)
        if 0.0 < ht < 500.0:
            ht = round(ht * 1000.0, 2)
        if 0.0 < ttc < 500.0:
            ttc = round(ttc * 1000.0, 2)
        if ttc <= 0.0 and ht > 0.0:
            ttc = round(ht * 1.2, 2)

        if ft == "GLACE":
            vendors_dict[v_key]["som"]["ht"] = ht
            vendors_dict[v_key]["som"]["ttc"] = ttc
            if r.get("secteur"):
                vendors_dict[v_key]["secteur"] = r.get("secteur").strip()
        else:
            vendors_dict[v_key]["vmm"]["ht"] = ht
            vendors_dict[v_key]["vmm"]["ttc"] = ttc
            vendors_dict[v_key]["vmm"]["nb_clients"] = int(r.get("number_client") or 0)
            vendors_dict[v_key]["vmm"]["obj_acm"] = float(r.get("obj_acm") or 0.0)
            if r.get("secteur"):
                vendors_dict[v_key]["secteur"] = r.get("secteur").strip()

    vendor_list = list(vendors_dict.values())
    vendor_list.sort(key=lambda x: x["vendeur"])

    if cdz:
        vendor_list = [v for v in vendor_list if v.get("cdz", "").upper() == cdz.strip().upper()]
    if vendeur:
        v_clean = vendeur.strip().upper()
        v_code = v_clean.split()[0] if v_clean else ""
        vendor_list = [v for v in vendor_list if v["vendeur"].upper() == v_clean or (len(v_code) >= 2 and v["vendeur"].upper().startswith(v_code))]

    return {
        "som_name": som_product_name,
        "vmm_name": vmm_product_name,
        "vendors": vendor_list
    }


def build_focus_vendor_whatsapp_message(vendor_info, som_name="PAPILLOTE", vmm_name="BIGGY TASTY T/B"):
    """Format single vendor focus objectives message for WhatsApp"""
    v_name = vendor_info.get("vendeur", "")
    secteur = vendor_info.get("secteur", "")
    cdz = vendor_info.get("cdz", "")
    som = vendor_info.get("som", {})
    vmm = vendor_info.get("vmm", {})

    lines = [
        "🎯 *OBJECTIFS FOCUS - MADEC*",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"👤 *Vendeur* : {v_name}",
    ]
    if secteur:
        lines.append(f"📍 *Secteur* : {secteur}")
    if cdz:
        lines.append(f"👔 *Équipe CDZ* : {cdz}")

    lines.extend([
        "",
        f"📌 *1. FOCUS SOM ({som_name})* :",
        f"• Objectif TTC : *{som.get('ttc', 0):,.0f} DH*",
        f"• Objectif HT  : *{som.get('ht', 0):,.0f} DH*",
        "",
        f"📌 *2. FOCUS VMM ({vmm_name})* :",
        f"• Objectif TTC : *{vmm.get('ttc', 0):,.0f} DH*",
        f"• Objectif HT  : *{vmm.get('ht', 0):,.0f} DH*",
    ])
    if vmm.get("nb_clients", 0) > 0 or vmm.get("obj_acm", 0) > 0:
        lines.append(f"• Objectif Clients : *{vmm.get('nb_clients', 0)} clients* (Obj ACM: {vmm.get('obj_acm', 0):,.0f})")

    lines.extend([
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "💪 *Bonne vente et plein succès pour l'atteinte de vos objectifs !*",
        "— _Direction Commerciale MADEC_"
    ])

    return "\n".join(lines)


def build_focus_cdz_summary_whatsapp_message(cdz_name, vendors, som_name="PAPILLOTE", vmm_name="BIGGY TASTY T/B"):
    """Format CDZ team focus objectives summary message for WhatsApp"""
    return build_focus_group_list_whatsapp_message(cdz_name=cdz_name, vendors=vendors, som_name=som_name, vmm_name=vmm_name)


def build_focus_group_list_whatsapp_message(cdz_name=None, vendors=None, som_name="PAPILLOTE", vmm_name="BIGGY TASTY T/B"):
    """
    Format a complete, beautiful list of focus objectives for sharing directly
    to a team or agency WhatsApp Group.
    """
    if vendors is None:
        vendors = []

    filtered = [v for v in vendors if (v.get("cdz") or "").strip().upper() == cdz_name.strip().upper()] if cdz_name else vendors
    total_som_ttc = sum(v["som"]["ttc"] for v in filtered)
    total_som_ht = sum(v["som"]["ht"] for v in filtered)
    total_vmm_ttc = sum(v["vmm"]["ttc"] for v in filtered)
    total_vmm_ht = sum(v["vmm"]["ht"] for v in filtered)

    team_header = f"ÉQUIPE CDZ {cdz_name.upper()}" if cdz_name else "TOUTES LES ÉQUIPES - MADEC"

    lines = [
        "🎯 *LISTE DES OBJECTIFS FOCUS DU MOIS* 🎯",
        f"👔 *{team_header}*",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"🍦 *1. Focus SOM :* {som_name}",
        f"🥫 *2. Focus VMM :* {vmm_name}",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "",
        "📋 *OBJECTIFS ASSIGNÉS PAR VENDEUR :*",
        ""
    ]

    for i, v in enumerate(filtered, start=1):
        v_name = v.get("vendeur", "")
        sec = v.get("secteur", "")
        sec_str = f" _({sec})_" if sec else ""
        s_ttc = v["som"]["ttc"]
        v_ttc = v["vmm"]["ttc"]
        v_cli = v.get("vmm", {}).get("nb_clients", 0)

        lines.append(f"*{i}. {v_name}*{sec_str}")
        lines.append(f"   🍦 *SOM :* {s_ttc:,.0f} DH TTC")
        if v_cli > 0:
            lines.append(f"   🥫 *VMM :* {v_ttc:,.0f} DH TTC ({v_cli} clients)")
        else:
            lines.append(f"   🥫 *VMM :* {v_ttc:,.0f} DH TTC")
        lines.append("   ─────────────────────────────")

    lines.extend([
        "",
        "📈 *RÉCAPITULATIF GLOBAL DE L'ÉQUIPE :*",
        f"• 👥 *Total Vendeurs :* {len(filtered)}",
        f"• 🍦 *Total SOM ({som_name}) :* *{total_som_ttc:,.0f} DH TTC* ({total_som_ht:,.0f} DH HT)",
        f"• 🥫 *Total VMM ({vmm_name}) :* *{total_vmm_ttc:,.0f} DH TTC* ({total_vmm_ht:,.0f} DH HT)",
        "",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        "💪 *Excellentes ventes et bonne chance à toute l'équipe !*",
        "— _Direction Commerciale MADEC_"
    ])

    return "\n".join(lines)


def save_focus_obj_records(records, som_name=None, vmm_name=None):
    """Save extracted focus objectives into focus_obj table, focus_objectives, and focus_names."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS focus_obj (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        focus_type TEXT NOT NULL,
        vendeur TEXT NOT NULL DEFAULT '',
        secteur TEXT NOT NULL DEFAULT '',
        obj_ht REAL DEFAULT 0.0,
        obj_ttc REAL DEFAULT 0.0,
        focus_name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    cursor.execute("DELETE FROM focus_obj")
    cursor.execute("DELETE FROM focus_objectives")
    
    for r in records:
        f_type = r.get("focus_type", "SOM").strip().upper()
        vendeur = r.get("vendeur", "").strip()
        secteur = r.get("secteur", "").strip()
        obj_ht = float(r.get("obj_ht") or r.get("glace_ht") or r.get("obj_juin") or 0.0)
        obj_ttc = float(r.get("obj_ttc") or r.get("ttc") or round(obj_ht * 1.2, 3))
        f_name = r.get("focus_name", "")
        
        # Save into focus_obj
        cursor.execute("""
            INSERT INTO focus_obj (focus_type, vendeur, secteur, obj_ht, obj_ttc, focus_name)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (f_type, vendeur, secteur, obj_ht, obj_ttc, f_name))
        
        # Save into focus_objectives for backward compatibility
        legacy_type = "GLACE" if f_type == "SOM" else "TOMATE_FRITO"
        cursor.execute("""
            INSERT OR REPLACE INTO focus_objectives
            (focus_type, vendeur, secteur, number_client, obj_acm, obj_juin, glace_ht, ttc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (legacy_type, vendeur, secteur, 0, obj_ht, obj_ht, obj_ht, obj_ttc))
        
    if som_name:
        cursor.execute("INSERT OR REPLACE INTO focus_names (focus_type, focus_name) VALUES ('GLACE', ?)", (som_name.strip(),))
    if vmm_name:
        cursor.execute("INSERT OR REPLACE INTO focus_names (focus_type, focus_name) VALUES ('TOMATE_FRITO', ?)", (vmm_name.strip(),))
        
    conn.commit()
    conn.close()
    return True



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
    """Retrieve the latest upload date from rankings or merged Google Sheet history"""
    try:
        hist = get_focus_history('AGADIR')
        all_d = set()
        for r in hist.get('glace', {}).get('reps', []) + hist.get('tomate', {}).get('reps', []):
            if r.get('upload_date'):
                all_d.add(r['upload_date'][:10])
        if all_d:
            return sorted(list(all_d))[-1]
    except Exception:
        pass
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(upload_date) FROM focus_rankings")
    row = cursor.fetchone()
    conn.close()
    return row[0] if row else None


def get_focus_data(upload_date, agence='AGADIR'):
    """Fetch focus representative rankings and CDZ rankings for a specific upload date and agence."""
    # Use merged history directly so Google Sheet extension dates are included seamlessly
    history = get_focus_history(agence)
    glace_reps = [r for r in history.get('glace', {}).get('reps', []) if r.get('upload_date', '').startswith(upload_date)]
    tomate_reps = [r for r in history.get('tomate', {}).get('reps', []) if r.get('upload_date', '').startswith(upload_date)]
    glace_cdz = [r for r in history.get('glace', {}).get('cdz', []) if r.get('upload_date', '').startswith(upload_date)]
    tomate_cdz = [r for r in history.get('tomate', {}).get('cdz', []) if r.get('upload_date', '').startswith(upload_date)]
    
    if glace_reps or tomate_reps:
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
    
    # 3. Fetch objectives and fdv mapping
    cursor.execute("""
        SELECT focus_type, vendeur, secteur, number_client, obj_acm, obj_juin, glace_ht, ttc
        FROM focus_objectives
    """)
    objectives_rows = [dict(o) for o in cursor.fetchall()]

    cursor.execute("SELECT vendeur, secteur, role, cdz FROM fdv")
    fdv_rows = [dict(f) for f in cursor.fetchall()]
    conn.close()

    fdv_by_code = {}
    for f in fdv_rows:
        v = f.get('vendeur', '')
        if v:
            c = v.split()[0].upper()
            fdv_by_code[c] = f
            fdv_by_code[v.strip().upper()] = f
    
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
        objectives_by_type_code[ft][v.strip().upper()] = obj
        
    # Merge rankings with objectives and database table info
    glace_reps = []
    tomate_reps = []
    
    for r in rankings_rows:
        ft = r['focus_type']
        rep = r['representative']
        code = rep.split()[0].upper() if rep else ""
        rep_upper = rep.strip().upper() if rep else ""
        
        # Match objective and fdv
        obj = objectives_by_type_code.get(ft, {}).get(code) or objectives_by_type_code.get(ft, {}).get(rep_upper)
        fdv_item = fdv_by_code.get(code) or fdv_by_code.get(rep_upper)
        
        # Copy details
        merged = dict(r)

        # Get official representative and secteur from database table (focus_objectives / fdv)
        if obj and obj.get('vendeur'):
            merged['representative'] = obj['vendeur']
        elif fdv_item and fdv_item.get('vendeur'):
            merged['representative'] = fdv_item['vendeur']

        if obj and obj.get('secteur'):
            merged['secteur'] = obj['secteur']
        elif fdv_item and fdv_item.get('secteur'):
            sec = fdv_item['secteur']
            role = fdv_item.get('role', '')
            if role and not sec.upper().endswith(role.upper()):
                sec = f"{sec} {role}"
            merged['secteur'] = sec

        if fdv_item and fdv_item.get('cdz'):
            merged['cdz'] = fdv_item['cdz']

        if ft == 'GLACE':
            merged['obj_ttc'] = obj['ttc'] if obj else 0.0
            merged['obj_ht'] = obj['glace_ht'] if obj else 0.0
            dev = r['deviation'] or 0.0
            merged['realised_ttc'] = round((1 + dev) * obj['ttc'], 2) if obj else 0.0
            glace_reps.append(merged)
        elif ft == 'TOMATE_FRITO':
            merged['obj_ttc'] = obj['ttc'] if obj else 0.0
            merged['obj_ht'] = obj['glace_ht'] if obj else 0.0
            dev = r['deviation'] or 0.0
            merged['realised_ttc'] = round((1 + dev) * obj['ttc'], 2) if (obj and obj['ttc'] > 0.0) else (round((1 + dev) * obj['obj_acm'], 2) if obj else 0.0)
            
            # Keep client counts for compatibility
            merged['obj_acm'] = obj['obj_acm'] if obj else 0.0
            merged['nb_clients'] = obj['number_client'] if obj else 0
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


def get_terrain_sheet_focus_data():
    """Load terrain sheet data from cache or directly from Google Sheet CSV URL."""
    cache_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "terrain_cache.json")
    if os.path.exists(cache_path):
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                content = json.load(f)
                if isinstance(content, dict) and "data" in content and len(content.get("data", [])) > 0:
                    return content.get("data", [])
                elif isinstance(content, list) and len(content) > 0:
                    return content
        except Exception:
            pass
            
    # Direct fetch from Google Sheet
    try:
        import urllib.request
        import csv
        import io
        url = "https://docs.google.com/spreadsheets/d/1-w2F47ig_DJ9xwW1mJDQISdwC1bNeUXIi-eR4Qtok4A/export?format=csv"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as response:
            csv_data = response.read().decode('utf-8')
            
        reader = csv.DictReader(io.StringIO(csv_data))
        records = []
        for row in reader:
            cleaned_row = {}
            for k, v in row.items():
                if not k: continue
                k_clean = k.strip().lower()
                v_clean = v.strip() if v else ""
                
                if "timestamp" in k_clean:
                    key = "timestamp"
                elif "tomate" in k_clean or "pescada" in k_clean:
                    key = "tomate_frito"
                elif "glass" in k_clean or "glace" in k_clean or "chantilly" in k_clean or "bechamel" in k_clean:
                    key = "glass_ca"
                elif "vendeur" in k_clean:
                    key = "vendeur"
                elif "date" in k_clean:
                    key = "date"
                else:
                    key = k_clean.replace(" ", "_")
                
                if key in ["tomate_frito", "glass_ca"]:
                    try:
                        cleaned_row[key] = float(v_clean) if v_clean else 0.0
                    except:
                        cleaned_row[key] = 0.0
                else:
                    cleaned_row[key] = v_clean
                    
            if cleaned_row.get("date") and cleaned_row.get("vendeur"):
                records.append(cleaned_row)
                
        if records:
            try:
                with open(cache_path, "w", encoding="utf-8") as f:
                    json.dump({"headers": list(reader.fieldnames or []), "data": records}, f, ensure_ascii=False, indent=2)
            except:
                pass
        return records
    except Exception as e:
        print("Error fetching Google Sheet in get_terrain_sheet_focus_data:", e)
        return []


def get_focus_history(agence='AGADIR'):
    """Fetch historical focus representative rankings and CDZ rankings for all upload dates for an agence,
    seamlessly extending with live Google Sheet terrain data (Chantilly CA & Pescada Algerienne CA) for dates
    after the latest database baseline upload date.
    """
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

    cursor.execute("SELECT vendeur, secteur, role, cdz FROM fdv")
    fdv_rows = [dict(f) for f in cursor.fetchall()]
    conn.close()

    fdv_by_code = {}
    for f in fdv_rows:
        v = f.get('vendeur', '')
        if v:
            c = v.split()[0].upper()
            fdv_by_code[c] = f
            fdv_by_code[v.strip().upper()] = f
    
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
        objectives_by_type_code[ft][v.strip().upper()] = obj
        
    # Merge rankings with objectives
    glace_reps = []
    tomate_reps = []
    
    for r in rankings_rows:
        ft = r['focus_type']
        rep = r['representative']
        code = rep.split()[0].upper() if rep else ""
        rep_upper = rep.strip().upper() if rep else ""
        
        # Match objective and fdv
        obj = objectives_by_type_code.get(ft, {}).get(code) or objectives_by_type_code.get(ft, {}).get(rep_upper)
        fdv_item = fdv_by_code.get(code) or fdv_by_code.get(rep_upper)
        
        # Copy details
        merged = dict(r)

        # Get official representative and secteur from database table (focus_objectives / fdv)
        if obj and obj.get('vendeur'):
            merged['representative'] = obj['vendeur']
        elif fdv_item and fdv_item.get('vendeur'):
            merged['representative'] = fdv_item['vendeur']

        if obj and obj.get('secteur'):
            merged['secteur'] = obj['secteur']
        elif fdv_item and fdv_item.get('secteur'):
            sec = fdv_item['secteur']
            role = fdv_item.get('role', '')
            if role and not sec.upper().endswith(role.upper()):
                sec = f"{sec} {role}"
            merged['secteur'] = sec

        if fdv_item and fdv_item.get('cdz'):
            merged['cdz'] = fdv_item['cdz']

        if ft == 'GLACE':
            merged['obj_ttc'] = obj['ttc'] if obj else 0.0
            merged['obj_ht'] = obj['glace_ht'] if obj else 0.0
            dev = r['deviation'] or 0.0
            merged['realised_ttc'] = round((1 + dev) * obj['ttc'], 2) if obj else 0.0
            glace_reps.append(merged)
        elif ft == 'TOMATE_FRITO':
            merged['obj_ttc'] = obj['ttc'] if obj else 0.0
            merged['obj_ht'] = obj['glace_ht'] if obj else 0.0
            dev = r['deviation'] or 0.0
            merged['realised_ttc'] = round((1 + dev) * obj['ttc'], 2) if (obj and obj['ttc'] > 0.0) else (round((1 + dev) * obj['obj_acm'], 2) if obj else 0.0)
            
            # Keep client counts for compatibility
            merged['obj_acm'] = obj['obj_acm'] if obj else 0.0
            merged['nb_clients'] = obj['number_client'] if obj else 0
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


def resolve_vendeur_full_name(vendeur_code_or_filename):
    """Extract vendor code from filename/string and resolve seller full name from fdv or cv.vendeurs."""
    if not vendeur_code_or_filename:
        return "NON SPÉCIFIÉ"

    clean_str = str(vendeur_code_or_filename).split('.')[0].strip()
    vcode = clean_str.split()[0].strip().upper() if clean_str else ""

    if not vcode:
        return clean_str

    conn = get_db_connection()
    try:
        conn.execute(f"ATTACH DATABASE '{CV_DB_PATH}' AS cv")
    except Exception:
        pass

    cursor = conn.cursor()

    # 1. Search in fdv table
    try:
        row = cursor.execute(
            "SELECT vendeur FROM fdv WHERE UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ? LIMIT 1",
            (f"{vcode} %", f"{vcode}%")
        ).fetchone()
        if row and row[0]:
            conn.close()
            return str(row[0]).strip()
    except Exception:
        pass

    # 2. Search in cv.vendeurs table
    try:
        row = cursor.execute(
            "SELECT vendeur FROM cv.vendeurs WHERE UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ? LIMIT 1",
            (f"{vcode} %", f"{vcode}%")
        ).fetchone()
        if row and row[0]:
            conn.close()
            return str(row[0]).strip()
    except Exception:
        pass

    # 3. Search in cv.clients table
    try:
        row = cursor.execute(
            "SELECT vendeur_som FROM cv.clients WHERE UPPER(vendeur_som) LIKE ? LIMIT 1",
            (f"{vcode} %",)
        ).fetchone()
        if row and row[0]:
            conn.close()
            return str(row[0]).strip()
    except Exception:
        pass

    conn.close()
    return clean_str


def normalize_ok_visites(conn=None):
    """
    If a client has multiple visits on the same date by the same vendor,
    and AT LEAST ONE visit has motif 'OK', then all visits for that client
    on that date are updated to 'OK' (so the client is considered Facturé / OK).
    """
    targets = []
    if conn is not None:
        targets.append((conn, False))
    else:
        try:
            targets.append((get_uploads_db_connection(), True))
        except Exception:
            pass
        try:
            targets.append((get_db_connection(), True))
        except Exception:
            pass

    for db_c, should_close in targets:
        try:
            db_c.execute("""
                UPDATE visites_rapports
                SET motif = 'OK'
                WHERE (date_visite, vendeur, client_code) IN (
                    SELECT date_visite, vendeur, client_code
                    FROM visites_rapports
                    WHERE UPPER(TRIM(motif)) = 'OK'
                      AND client_code IS NOT NULL AND client_code != ''
                )
                AND UPPER(TRIM(motif)) != 'OK'
            """)
            db_c.commit()
        except Exception as e:
            print(f"Error in normalize_ok_visites: {e}", flush=True)
        finally:
            if should_close:
                db_c.close()


def clear_all_visites_rapports():
    """Delete all records from visites_rapports table in both uploads.db and database.db."""
    try:
        conn = get_uploads_db_connection()
        conn.execute("DELETE FROM visites_rapports")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error clearing visites_rapports in uploads.db: {e}", flush=True)

    try:
        db_conn = get_db_connection()
        db_conn.execute("DELETE FROM visites_rapports")
        db_conn.commit()
        db_conn.close()
    except Exception as e:
        print(f"Error clearing visites_rapports in database.db: {e}", flush=True)


def save_visites_rapport(file_name, vendeur, date_visite, tournee, agence, records, clear_all=False):
    """Save raw visit report details to database.db & uploads.db, resolving seller full name from fdv database and tournee from clients."""
    if clear_all:
        clear_all_visites_rapports()

    resolved_vendeur = resolve_vendeur_full_name(vendeur or file_name)
    vcode = file_name.split('.')[0].split()[0].strip().upper()

    # Pre-load client mapping for instant tournée / secteur resolution
    client_map = {}
    try:
        cv_conn = get_cv_db_connection()
        for r in cv_conn.cursor().execute("SELECT c.code, l.name, s.name FROM clients c LEFT JOIN localites l ON c.localite_id = l.id LEFT JOIN secteurs s ON c.secteur_id = s.id"):
            c_code_k = (r[0] or "").strip().upper()
            if c_code_k:
                client_map[c_code_k] = (r[1] or "", r[2] or "")
        cv_conn.close()
    except Exception as ex:
        print(f"Warning reading clients map in save_visites_rapport: {ex}", flush=True)

    conn = get_uploads_db_connection()
    cursor = conn.cursor()
    try:
        if not clear_all:
            # Clear previous uploaded visits for this specific file/seller in uploads.db
            cursor.execute("DELETE FROM visites_rapports WHERE file_name = ? OR UPPER(vendeur) LIKE ?", (file_name, f"{vcode}%"))
        
        # Prepare batch insert rows with resolved tournee & agence
        insert_rows = []
        for r in records:
            r_date = r.get("date") or date_visite
            dist_str = str(r.get("distance", "0")).replace("m", "").replace(" ", "").strip()
            try:
                dist = int(dist_str)
            except:
                dist = 0
            
            c_code_val = (r.get("code") or "").strip().upper()
            c_info = client_map.get(c_code_val)
            row_tournee = tournee or (c_info[0] if c_info and c_info[0] else "") or "Tournée non spécifiée"
            row_agence = agence or (c_info[1] if c_info and c_info[1] else "") or "Secteur non spécifié"

            insert_rows.append((
                file_name,
                resolved_vendeur,
                r_date,
                row_tournee,
                row_agence,
                r.get("code", ""),
                r.get("name", ""),
                r.get("time", ""),
                dist,
                r.get("motif", ""),
                r.get("note", "")
            ))
            
        cursor.executemany("""
            INSERT INTO visites_rapports
            (file_name, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, insert_rows)
        conn.commit()

        # Also sync to database.db for backwards compatibility
        try:
            db_conn = get_db_connection()
            db_cursor = db_conn.cursor()
            if not clear_all:
                db_cursor.execute("DELETE FROM visites_rapports WHERE file_name = ? OR UPPER(vendeur) LIKE ?", (file_name, f"{vcode}%"))
            db_cursor.executemany("""
                INSERT INTO visites_rapports
                (file_name, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, insert_rows)
            db_conn.commit()
            db_conn.close()
        except Exception as sync_e:
            print(f"Sync to database.db notice: {sync_e}", flush=True)

        try:
            normalize_ok_visites(conn)
        except Exception:
            pass

        return True
    except Exception as e:
        print(f"Error saving visits rapport to db: {e}", flush=True)
        return False
    finally:
        conn.close()


def save_relational_acm(df):
    """Populate secteurs, localites, and clients tables in separate uploads.db database, clearing old data on new upload."""
    import pandas as pd
    conn = get_uploads_db_connection()
    conn.execute("PRAGMA foreign_keys = ON;")
    cursor = conn.cursor()
    try:
        col_map = {}
        for c in df.columns:
            cl = str(c).strip().lower()
            if "code" in cl:
                col_map["code"] = c
            elif "nom" in cl or ("client" in cl and "code" not in cl and "nbr" not in cl and "%" not in cl):
                col_map["name"] = c
            elif "role" in cl or "secteur" in cl:
                col_map["role"] = c
            elif "tourne" in cl or "localite" in cl:
                col_map["tournee"] = c

        # Clear old ACM upload data in uploads.db
        cursor.execute("DELETE FROM clients")
        cursor.execute("DELETE FROM localites")
        cursor.execute("DELETE FROM secteurs")
        cursor.execute("DELETE FROM sqlite_sequence WHERE name IN ('clients', 'localites', 'secteurs')")

        # 1. Populate Secteurs
        secteur_id_map = {}
        if "role" in col_map:
            unique_secteurs = sorted([str(s).strip() for s in df[col_map["role"]].dropna().unique() if str(s).strip()])
            for sec in unique_secteurs:
                cursor.execute("INSERT OR IGNORE INTO secteurs (name) VALUES (?)", (sec,))
            conn.commit()

            cursor.execute("SELECT name, id FROM secteurs")
            secteur_id_map = {r["name"]: r["id"] for r in cursor.fetchall()}

        # 2. Populate Localites
        localite_id_map = {}
        if "tournee" in col_map and "role" in col_map:
            localite_pairs = df[[col_map["tournee"], col_map["role"]]].drop_duplicates().dropna()
            for _, row in localite_pairs.iterrows():
                loc_name = str(row[col_map["tournee"]]).strip()
                sec_name = str(row[col_map["role"]]).strip()
                if loc_name and sec_name in secteur_id_map:
                    sec_id = secteur_id_map[sec_name]
                    try:
                        cursor.execute("INSERT OR IGNORE INTO localites (name, secteur_id) VALUES (?, ?)", (loc_name, sec_id))
                    except Exception:
                        pass

            conn.commit()

            cursor.execute("""
                SELECT l.id, l.name, s.name as sec_name
                FROM localites l
                JOIN secteurs s ON l.secteur_id = s.id
            """)
            for r in cursor.fetchall():
                localite_id_map[(r["name"], r["sec_name"])] = r["id"]

        # 3. Populate Clients (code, name, secteur_id, localite_id)
        client_rows = []
        for _, row in df.iterrows():
            c_code = str(row[col_map["code"]]).strip() if "code" in col_map and pd.notna(row[col_map["code"]]) else ""
            c_name = str(row[col_map["name"]]).strip() if "name" in col_map and pd.notna(row[col_map["name"]]) else ""
            sec_name = str(row[col_map["role"]]).strip() if "role" in col_map and pd.notna(row[col_map["role"]]) else ""
            loc_name = str(row[col_map["tournee"]]).strip() if "tournee" in col_map and pd.notna(row[col_map["tournee"]]) else ""

            if not c_code or c_code.lower() in ("nan", "none", "null", ""):
                continue
            if not c_name or c_name.lower() in ("nan", "none", "null", ""):
                c_name = "N/A"

            sec_id = secteur_id_map.get(sec_name)
            loc_id = localite_id_map.get((loc_name, sec_name))

            if sec_id and loc_id:
                client_rows.append((c_code, c_name, sec_id, loc_id))

        if client_rows:
            cursor.executemany("""
                INSERT OR REPLACE INTO clients (code, name, secteur_id, localite_id)
                VALUES (?, ?, ?, ?)
            """, client_rows)

        conn.commit()
        return len(client_rows)
    except Exception as e:
        print(f"Error saving relational ACM data: {e}")
        return 0
    finally:
        conn.close()


def import_acm_file(file_path_or_stream):
    """Parse and import acm.xlsx file into secteurs, localites, and clients tables."""
    import pandas as pd
    try:
        if hasattr(file_path_or_stream, 'seek'):
            file_path_or_stream.seek(0)
        df = pd.read_excel(file_path_or_stream, skiprows=2)
        return save_relational_acm(df)
    except Exception as e:
        print(f"Error importing ACM file: {e}")
        import traceback
        traceback.print_exc()
        return 0


def get_acm_stats():
    """Return summary statistics for relational clients model."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT COUNT(*) as total FROM clients")
        tot = cursor.fetchone()["total"]
        cursor.execute("SELECT COUNT(*) as tournees FROM localites")
        t_cnt = cursor.fetchone()["tournees"]
        cursor.execute("SELECT COUNT(*) as secteurs FROM secteurs")
        s_cnt = cursor.fetchone()["secteurs"]
        return {"total": tot, "active": tot, "inactive": 0, "tournees": t_cnt, "secteurs": s_cnt, "total_ca": 0}
    except Exception as e:
        print(f"Error getting ACM stats: {e}")
        return {"total": 0, "active": 0, "inactive": 0, "tournees": 0, "secteurs": 0, "total_ca": 0}
    finally:
        conn.close()


def get_acm_tournees():
    """Return list of distinct tournées from localites."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT name FROM localites WHERE name != '' ORDER BY name ASC")
        return [row["name"] for row in cursor.fetchall()]
    finally:
        conn.close()


def get_acm_vendeurs():
    """Return list of distinct secteurs from secteurs."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT DISTINCT name FROM secteurs WHERE name != '' ORDER BY name ASC")
        return [row["name"] for row in cursor.fetchall()]
    finally:
        conn.close()


def create_engagement(vendeur, periode, date_engagement, items):
    """Create a new seller engagement with categorized items."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        total_dh = sum(float(item.get("amount_dh", 0) or 0) for item in items)
        cursor.execute(
            "INSERT INTO engagements (vendeur, periode, date_engagement, total_dh) VALUES (?, ?, ?, ?)",
            (vendeur, periode, date_engagement, total_dh)
        )
        engagement_id = cursor.lastrowid
        
        for item in items:
            title = (item.get("title") or "").strip()
            category = (item.get("category") or "Autre").strip()
            amount_dh = float(item.get("amount_dh", 0) or 0)
            if title or amount_dh > 0:
                cursor.execute(
                    "INSERT INTO engagement_items (engagement_id, category, title, amount_dh) VALUES (?, ?, ?, ?)",
                    (engagement_id, category, title, amount_dh)
                )
        conn.commit()
        return engagement_id
    except Exception as e:
        print(f"Error creating engagement: {e}")
        conn.rollback()
        raise e
    finally:
        conn.close()


def get_all_engagements():
    """Retrieve all seller engagements with their items."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, vendeur, periode, date_engagement, total_dh, created_at FROM engagements ORDER BY date_engagement DESC, id DESC")
        rows = cursor.fetchall()
        engagements = [dict(r) for r in rows]

        for eng in engagements:
            cursor.execute(
                "SELECT id, category, title, amount_dh FROM engagement_items WHERE engagement_id = ? ORDER BY id ASC",
                (eng['id'],)
            )
            item_rows = cursor.fetchall()
            eng['items'] = [dict(item) for item in item_rows]
            
        return engagements
    except Exception as e:
        print(f"Error fetching engagements: {e}")
        return []
    finally:
        conn.close()


def delete_engagement(engagement_id):
    """Delete an engagement and its items."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("DELETE FROM engagements WHERE id = ?", (engagement_id,))
        cursor.execute("DELETE FROM engagement_items WHERE engagement_id = ?", (engagement_id,))
        conn.commit()
        return True
    except Exception as e:
        print(f"Error deleting engagement {engagement_id}: {e}")
        conn.rollback()
        return False
    finally:
        conn.close()


def update_engagement(engagement_id, vendeur, periode, date_engagement, items):
    """Update an existing seller engagement and its items."""
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        total_dh = sum(float(item.get("amount_dh", 0) or 0) for item in items)
        cursor.execute(
            "UPDATE engagements SET vendeur = ?, periode = ?, date_engagement = ?, total_dh = ? WHERE id = ?",
            (vendeur, periode, date_engagement, total_dh, engagement_id)
        )
        cursor.execute("DELETE FROM engagement_items WHERE engagement_id = ?", (engagement_id,))
        for item in items:
            title = (item.get("title") or "").strip()
            category = (item.get("category") or "Autre").strip()
            amount_dh = float(item.get("amount_dh", 0) or 0)
            if title or amount_dh > 0:
                cursor.execute(
                    "INSERT INTO engagement_items (engagement_id, category, title, amount_dh) VALUES (?, ?, ?, ?)",
                    (engagement_id, category, title, amount_dh)
                )
        conn.commit()
        return True
    except Exception as e:
        print(f"Error updating engagement {engagement_id}: {e}")
        conn.rollback()
        raise e
    finally:
        conn.close()


def parse_visit_time_diff(h_start_str, h_end_str):
    try:
        if not h_start_str or not h_end_str:
            return 0.0
        h_start_str = str(h_start_str).strip()
        h_end_str = str(h_end_str).strip()
        t1 = datetime.datetime.strptime(h_start_str.split('.')[0], "%H:%M:%S")
        t2 = datetime.datetime.strptime(h_end_str.split('.')[0], "%H:%M:%S")
        diff = (t2 - t1).total_seconds() / 60.0
        return round(diff, 1) if diff >= 0 else 0.0
    except Exception:
        return 0.0


def import_all_secteurs_visites_rapports(save_tournee=False, clear_existing=True):
    """Import all visit report Excel files from 'All Secteurs' folder into visites_rapports table file by file without tournee."""
    import glob
    import pandas as pd

    if clear_existing:
        clear_all_visites_rapports()

    folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "All Secteurs")
    if not os.path.exists(folder):
        return {"status": "error", "message": f"Dossier All Secteurs non trouvé ({folder})"}

    files = sorted(glob.glob(os.path.join(folder, "*.xlsx")))
    if not files:
        return {"status": "error", "message": "Aucun fichier Excel trouvé dans le dossier All Secteurs"}

    total_records = 0
    file_summary = []

    for fpath in files:
        fname = os.path.basename(fpath)
        if fname.startswith("~$"):
            continue

        try:
            df_raw = pd.read_excel(fpath, sheet_name=None)
            sheet_name = list(df_raw.keys())[0]
            for k in df_raw.keys():
                if "rapport" in k.lower() or "visite" in k.lower():
                    sheet_name = k
                    break

            df_sheet = df_raw[sheet_name]
            date_tournee = "2026-07-01"
            if len(df_sheet) > 4 and len(df_sheet.columns) > 21:
                val = df_sheet.iloc[4, 21]
                if pd.notna(val):
                    date_tournee = str(val).split(' ')[0]

            df_data = pd.read_excel(fpath, sheet_name=sheet_name, skiprows=13)
            if df_data.empty:
                continue

            df_data.columns = [str(val).strip() if pd.notna(val) else f"col{i}" for i, val in enumerate(df_data.iloc[0])]
            df_data = df_data.iloc[1:]

            client_cols = [c for c in df_data.columns if str(c).lower() == "client"]
            if not client_cols:
                continue
            client_col = client_cols[0]
            df_data = df_data.dropna(subset=[client_col])

            date_col = [c for c in df_data.columns if "date" in str(c).lower()]
            date_col = date_col[0] if date_col else ("col11" if "col11" in df_data.columns else None)

            df_data = df_data.rename(columns={'Heure Dbut': 'Heure Début', 'Heure Fin ': 'Heure Fin'})
            h_dep = 'Heure Début' if 'Heure Début' in df_data.columns else ('col13' if 'col13' in df_data.columns else None)
            h_fin = 'Heure Fin' if 'Heure Fin' in df_data.columns else ('col14' if 'col14' in df_data.columns else None)
            dist_col = 'Distance' if 'Distance' in df_data.columns else ('col18' if 'col18' in df_data.columns else None)
            motif_col = 'Motif' if 'Motif' in df_data.columns else ('col19' if 'col19' in df_data.columns else None)
            note_col = 'Note' if 'Note' in df_data.columns else ('col24' if 'col24' in df_data.columns else None)
            nom_col = 'Nom' if 'Nom' in df_data.columns else ('col4' if 'col4' in df_data.columns else None)

            vendeur_full = resolve_vendeur_full_name(fname)
            records = []

            for _, row in df_data.iterrows():
                c_code = str(row[client_col]).strip()
                c_name = str(row[nom_col]).strip() if nom_col and pd.notna(row[nom_col]) else "N/A"
                c_date = date_tournee
                if date_col and pd.notna(row[date_col]):
                    raw_d = str(row[date_col]).strip()
                    if raw_d and raw_d.lower() not in ("nan", "none", "null", "nat"):
                        c_date = raw_d.split(' ')[0].strip()
                c_h_dep = str(row[h_dep]).strip() if h_dep and pd.notna(row[h_dep]) else ""
                c_h_fin = str(row[h_fin]).strip() if h_fin and pd.notna(row[h_fin]) else ""
                c_time = f"{c_h_dep} - {c_h_fin}" if c_h_dep or c_h_fin else "N/A"
                dist_str = str(row[dist_col]).split('.')[0].strip() if dist_col and pd.notna(row[dist_col]) else "0"
                motif_val = str(row[motif_col]).strip() if motif_col and pd.notna(row[motif_col]) else "OK"
                note_val = str(row[note_col]).strip() if note_col and pd.notna(row[note_col]) else ""

                records.append({
                    "code": c_code,
                    "name": c_name,
                    "date": c_date,
                    "time": c_time,
                    "distance": dist_str,
                    "motif": motif_val,
                    "note": note_val
                })

            tournee_val = "" if not save_tournee else ""
            ok = save_visites_rapport(fname, vendeur_full, date_tournee, tournee_val, "", records)
            if ok:
                total_records += len(records)
                file_summary.append({"file": fname, "vendeur": vendeur_full, "records": len(records)})
        except Exception as e:
            print(f"Error importing {fname}: {e}")

    return {
        "status": "success",
        "message": f"Importation de {len(file_summary)} fichiers terminée avec succès ({total_records:,} enregistrements de visites)",
        "total_files": len(file_summary),
        "total_records": total_records,
        "details": file_summary
    }


def import_all_secteurs_tournees():

    """Import all visit reports from All Secteurs folder into vendeur_tournees_visits table."""
    import glob
    import openpyxl
    import re

    folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "All Secteurs")
    if not os.path.exists(folder):
        print(f"All Secteurs folder not found at {folder}")
        return 0

    files = sorted(glob.glob(os.path.join(folder, "*.xlsx")))
    if not files:
        return 0

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendeur_tournees_visits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vendeur_code TEXT NOT NULL,
        vendeur_name TEXT,
        date TEXT NOT NULL,
        tournee TEXT,
        client_code TEXT NOT NULL,
        client_name TEXT,
        date_visite TEXT,
        heure_debut TEXT,
        heure_fin TEXT,
        duree_minutes REAL,
        motif TEXT,
        distance TEXT,
        note TEXT,
        facture_status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(vendeur_code, client_code, date, heure_debut)
    );
    """)

    code_name_map = {
        "D48": "IBACH MOHAMED",
        "D86": "ACHAOUI AZIZ",
        "E14": "BOUMDIANE MOHAMED",
        "F78": "GHOUSMI MOURAD",
        "J78": "LASRI EL HOUCINE",
        "K91": "BAIZ MOHAMED",
        "T89": "AKNOUN MOHAMED",
        "T96": "EL HADI BOUBAKER",
        "E60": "BOUALLALI FARID",
        "K60": "ELHAOUZI RACHID"
    }

    inserted_count = 0
    skipped_count = 0

    for fpath in files:
        fname = os.path.basename(fpath)
        if fname.startswith("~$"):
            continue
        
        vendeur_code = fname.replace(".xlsx", "").strip().upper()
        vendeur_name = code_name_map.get(vendeur_code, vendeur_code)
        
        try:
            wb = openpyxl.load_workbook(fpath, data_only=True, read_only=True)
            ws = wb.active

            current_date = None
            current_tournee = None
            
            for row in ws.iter_rows(values_only=True):
                if not any(row):
                    continue
                
                row_str = " ".join([str(v) for v in row if v is not None])
                
                if "Date tournée" in row_str or "Date tourn" in row_str:
                    for v in row:
                        if isinstance(v, datetime.datetime):
                            current_date = v.strftime("%Y-%m-%d")
                        elif isinstance(v, str) and re.search(r'\d{4}-\d{2}-\d{2}', v):
                            current_date = re.search(r'\d{4}-\d{2}-\d{2}', v).group(0)
                
                if "Tournée" in row_str or "Tourn" in row_str:
                    for v in row:
                        s_v = str(v).strip()
                        if v and any(kw in s_v for kw in ["TAROUDANT", "AGADIR", "INZEGANE", "DETAIL", "SOM", "VMM", "GROS", "OULED", "TIKIOUINE", "AIT MELLOUL"]):
                            current_tournee = s_v

                time_matches = []
                for v in row:
                    s = str(v).strip() if v is not None else ""
                    if "00:00:00" in s and len(s) > 8:
                        s = s.replace("00:00:00", "")
                    m = re.findall(r'\b\d{2}:\d{2}(?::\d{2})?\b', s)
                    if m:
                        for t_item in m:
                            if t_item != "00:00:00":
                                time_matches.append(t_item)

                c_code = (row[2] if len(row) > 2 else None) or (row[1] if len(row) > 1 else None)
                c_name = (row[5] if len(row) > 5 else None) or (row[4] if len(row) > 4 else None)
                d_visite = (row[12] if len(row) > 12 else None) or (row[11] if len(row) > 11 else None)
                motif = (row[20] if len(row) > 20 else None) or (row[19] if len(row) > 19 else None)
                note = (row[25] if len(row) > 25 else None) or (row[24] if len(row) > 24 else None)

                if c_code and str(c_code).strip() not in ["Client", "Code Client", "Code", "None"] and not str(c_code).startswith("RAPPORT"):
                    c_code_str = str(c_code).strip()
                    if re.match(r'^[A-Z0-9]{3,}$', c_code_str, re.IGNORECASE):
                        visite_date_str = current_date
                        if isinstance(d_visite, datetime.datetime):
                            visite_date_str = d_visite.strftime("%Y-%m-%d")
                        elif isinstance(d_visite, str) and re.search(r'\d{4}-\d{2}-\d{2}', d_visite):
                            visite_date_str = re.search(r'\d{4}-\d{2}-\d{2}', d_visite).group(0)
                        
                        if not visite_date_str:
                            visite_date_str = "2026-07-01"

                        h_start_str = time_matches[0] if len(time_matches) >= 1 else ""
                        h_end_str = time_matches[1] if len(time_matches) >= 2 else h_start_str
                        motif_str = str(motif).strip() if motif else "OK"
                        note_str = str(note).strip() if note else ""
                        duree = parse_visit_time_diff(h_start_str, h_end_str)

                        facture_status = "SANS FACTURE"
                        m_upper = motif_str.upper()
                        if m_upper == "OK":
                            if duree > 0 and duree < 1.0:
                                facture_status = "ANOMALIE AVEC FACTURE"
                            elif duree >= 15.0:
                                facture_status = "BIG FACTURE"
                            elif duree < 5.0 and duree >= 1.0:
                                facture_status = "SMALL FACTURE"
                            else:
                                facture_status = "AVEC FACTURE"
                        elif "STOCK" in m_upper or "FERME" in m_upper or "ABSENT" in m_upper or "ERREUR" in m_upper:
                            facture_status = "SANS FACTURE"

                        try:
                            cursor.execute("""
                                INSERT INTO vendeur_tournees_visits (
                                    vendeur_code, vendeur_name, date, tournee, client_code, client_name,
                                    date_visite, heure_debut, heure_fin, duree_minutes, motif, note, facture_status
                                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """, (
                                vendeur_code, vendeur_name, visite_date_str, current_tournee or "TOURNÉE GENERALE",
                                c_code_str, str(c_name).strip() if c_name else "", visite_date_str,
                                h_start_str, h_end_str, duree, motif_str, note_str, facture_status
                            ))
                            inserted_count += 1
                        except sqlite3.IntegrityError:
                            skipped_count += 1

            wb.close()
        except Exception as err:
            print(f"Error parsing {fname}: {err}")

    conn.commit()
    conn.close()
    return inserted_count


def get_vendeur_tournees_summary(vendeur_identifier, is_cdz=False):
    """Retrieve structured tournées summary & visit KPIs for a given seller.
    If no specific seller is requested, retrieves data ONLY for the first vendeur.
    Ultra-fast cross-referencing of visites_rapports with clients_vendeurs.db.
    """
    search_term = (vendeur_identifier or '').strip()

    conn = get_db_connection()
    cursor = conn.cursor()

    # If no seller is provided or generic ALL, automatically target ONLY the first vendeur
    if not search_term or search_term.upper() in ["ALL", "TOUT", "GLOBAL", "UNDEFINED", "NULL", "DEFAULT"]:
        cursor.execute("SELECT DISTINCT vendeur FROM visites_rapports WHERE vendeur IS NOT NULL AND vendeur != '' ORDER BY vendeur ASC LIMIT 1")
        first_vr = cursor.fetchone()
        if first_vr and first_vr[0]:
            search_term = first_vr[0]
        else:
            cursor.execute("SELECT DISTINCT vendeur FROM fdv WHERE vendeur IS NOT NULL AND vendeur != '' ORDER BY vendeur ASC LIMIT 1")
            first_fdv = cursor.fetchone()
            if first_fdv and first_fdv[0]:
                search_term = first_fdv[0]

    parts = search_term.split()
    vcode = parts[0].upper() if parts else search_term.upper()

    # 1. Load client mapping {code: (tournee_name, secteur_name, vendeur_som, vendeur_vmm)}
    client_map = {}
    try:
        cv_conn = get_cv_db_connection()
        cv_cursor = cv_conn.cursor()
        cv_cursor.execute("""
            SELECT c.code, l.name AS tournee, s.name AS secteur, c.vendeur_som, c.vendeur_vmm
            FROM clients c
            LEFT JOIN localites l ON c.localite_id = l.id
            LEFT JOIN secteurs s ON c.secteur_id = s.id
        """)
        for r in cv_cursor.fetchall():
            code = (r["code"] or "").strip().upper()
            if code:
                client_map[code] = (r["tournee"] or "", r["secteur"] or "", r["vendeur_som"] or "", r["vendeur_vmm"] or "")
        cv_conn.close()
    except Exception as ex:
        print(f"Warning loading clients map: {ex}", flush=True)

    rows = []

    # 2. Query visites_rapports for this specific seller ONLY
    try:
        cursor.execute("""
            SELECT id, file_name, vendeur, date_visite, tournee, agence, client_code, client_nom, heure, distance, motif, note
            FROM visites_rapports
            WHERE UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ?
            ORDER BY date_visite DESC, id ASC
        """, (f"{vcode}%", f"%{search_term.upper()}%"))

        cols = [col[0] for col in cursor.description]
        vr_raw = [dict(zip(cols, row)) for row in cursor.fetchall()]

        for r in vr_raw:
            c_code_clean = (r.get('client_code') or '').strip().upper()
            c_info = client_map.get(c_code_clean)

            real_tournee = (c_info[0] if c_info and c_info[0] else None) or r.get('tournee') or 'Tournée non spécifiée'
            real_secteur = (c_info[1] if c_info and c_info[1] else None) or r.get('agence') or 'Secteur non spécifié'
            v_raw = r.get('vendeur') or (c_info[2] if c_info else '') or (c_info[3] if c_info else '') or ''

            h_str = str(r.get('heure') or '').strip()
            if ' - ' in h_str:
                h_debut, h_fin = [x.strip() for x in h_str.split(' - ', 1)]
            else:
                h_debut, h_fin = h_str, ''

            m = str(r.get('motif') or 'OK').strip()
            fact_status = 'AVEC FACTURE' if m.upper() == 'OK' else 'SANS FACTURE'

            rows.append({
                'date': r.get('date_visite') or '',
                'tournee': real_tournee,
                'secteur': real_secteur,
                'vendeur_code': v_raw.split()[0] if v_raw else '',
                'vendeur_name': v_raw,
                'heure_debut': h_debut,
                'heure_fin': h_fin,
                'duree_minutes': parse_visit_time_diff(h_debut, h_fin),
                'motif': m,
                'note': r.get('note') or '',
                'facture_status': fact_status,
                'distance': r.get('distance') or '',
                'client_code': r.get('client_code') or '',
                'client_name': r.get('client_nom') or ''
            })
    except Exception as ex:
        import traceback
        print(f"Error reading visites_rapports in get_vendeur_tournees_summary: {ex}", flush=True)
        traceback.print_exc()

    # 3. Fallback to vendeur_tournees_visits if no rows from visites_rapports
    if not rows:
        try:
            if is_cdz:
                query = "SELECT * FROM vendeur_tournees_visits ORDER BY date DESC, tournee ASC, heure_debut ASC"
                cursor.execute(query)
            else:
                query = """
                    SELECT * FROM vendeur_tournees_visits
                    WHERE UPPER(vendeur_code) LIKE ? OR UPPER(vendeur_name) LIKE ?
                    ORDER BY date DESC, tournee ASC, heure_debut ASC
                """
                pattern = f"%{search_term.upper()}%"
                cursor.execute(query, (pattern, pattern))

            cols = [col[0] for col in cursor.description]
            vt_raw = [dict(zip(cols, row)) for row in cursor.fetchall()]

            for r in vt_raw:
                rows.append({
                    'date': r.get('date') or '',
                    'tournee': r.get('tournee') or '',
                    'secteur': '',
                    'vendeur_code': r.get('vendeur_code') or '',
                    'vendeur_name': r.get('vendeur_name') or '',
                    'heure_debut': r.get('heure_debut') or '',
                    'heure_fin': r.get('heure_fin') or '',
                    'duree_minutes': r.get('duree_minutes') or 0,
                    'motif': str(r.get('motif') or 'OK').strip(),
                    'note': r.get('note') or '',
                    'facture_status': r.get('facture_status') or '',
                    'distance': r.get('distance') or '',
                    'client_code': r.get('client_code') or '',
                    'client_name': r.get('client_name') or ''
                })
        except Exception as ex:
            import traceback
            print(f"Error reading vendeur_tournees_visits: {ex}", flush=True)

    # 4. Fallback: If no visit records exist for this specific seller in visites_rapports,
    # load assigned tournées from clients_vendeurs.db with 0 visits conducted
    if not rows and not is_cdz:
        try:
            cv_conn = get_cv_db_connection()
            cv_cursor = cv_conn.cursor()
            cv_cursor.execute("""
                SELECT l.name AS tournee, s.name AS secteur, COUNT(c.id) AS total_clients
                FROM clients c
                LEFT JOIN localites l ON l.id = c.localite_id
                LEFT JOIN secteurs s ON s.id = c.secteur_id
                WHERE (UPPER(c.vendeur_som) LIKE ? OR UPPER(c.vendeur_vmm) LIKE ?
                    OR UPPER(c.vendeur_som) LIKE ? OR UPPER(c.vendeur_vmm) LIKE ?)
                  AND l.name IS NOT NULL
                GROUP BY l.name, s.name
                ORDER BY total_clients DESC
            """, (f"{vcode}%", f"{vcode}%", f"%{search_term.upper()}%", f"%{search_term.upper()}%"))

            assigned_tournees = []
            for r in cv_cursor.fetchall():
                assigned_tournees.append({
                    "date": "-",
                    "tournee": r["tournee"],
                    "secteur": r["secteur"],
                    "vendeur_code": vcode,
                    "vendeur_name": search_term,
                    "heure_debut": "-",
                    "heure_fin": "-",
                    "total_clients_enregistres": r["total_clients"],
                    "total_visites": 0,
                    "visites_ok": 0,
                    "visites_sans_ok": 0,
                    "magasin_ferme": 0,
                    "stock_suffisant": 0,
                    "responsable_absent": 0,
                    "anomalies_avec_facture": 0,
                    "big_facture": 0,
                    "small_facture": 0,
                    "billing_rate": 0.0,
                    "duree_totale_minutes": 0,
                    "visites_list": []
                })
            cv_conn.close()
            conn.close()
            return {
                "vendeur": search_term,
                "total_tournees": len(assigned_tournees),
                "total_visites": 0,
                "visites_ok": 0,
                "visites_sans_ok": 0,
                "anomalies_avec_facture": 0,
                "big_facture": 0,
                "small_facture": 0,
                "billing_rate": 0.0,
                "motifs_summary": {},
                "tournees": assigned_tournees
            }
        except Exception as ex:
            print(f"Error querying assigned localites for {search_term}: {ex}", flush=True)

    try:
        conn.close()
    except Exception:
        pass

    if not rows:
        return {
            "vendeur": search_term,
            "total_tournees": 0,
            "total_visites": 0,
            "visites_ok": 0,
            "visites_sans_ok": 0,
            "anomalies_avec_facture": 0,
            "big_facture": 0,
            "small_facture": 0,
            "billing_rate": 0.0,
            "motifs_summary": {},
            "tournees": []
        }

    tournees_dict = {}
    motifs_summary = {}

    total_visites = 0
    visites_ok = 0
    visites_sans_ok = 0
    anomalies_avec_facture = 0
    big_facture = 0
    small_facture = 0

    for r in rows:
        key = r['date'] or 'Date inconnue'
        if key not in tournees_dict:
            tournees_dict[key] = {
                "date": r['date'],
                "tournee": r.get('tournee') or '',
                "secteur": r.get('secteur') or '',
                "vendeur_code": r['vendeur_code'],
                "vendeur_name": r['vendeur_name'],
                "heure_debut": r['heure_debut'],
                "heure_fin": r['heure_fin'],
                "total_visites": 0,
                "visites_ok": 0,
                "visites_sans_ok": 0,
                "magasin_ferme": 0,
                "stock_suffisant": 0,
                "responsable_absent": 0,
                "anomalies_avec_facture": 0,
                "big_facture": 0,
                "small_facture": 0,
                "motifs": {},
                "tournees_counts": {},
                "secteurs_counts": {},
                "visites_list": []
            }

        t = tournees_dict[key]
        t["total_visites"] += 1
        total_visites += 1

        t_name = r.get('tournee')
        if t_name and t_name != 'Tournée non spécifiée':
            t["tournees_counts"][t_name] = t["tournees_counts"].get(t_name, 0) + 1
        s_name = r.get('secteur')
        if s_name and s_name != 'Secteur non spécifié':
            t["secteurs_counts"][s_name] = t["secteurs_counts"].get(s_name, 0) + 1

        if r['heure_debut'] and (not t["heure_debut"] or t["heure_debut"] == '-' or r['heure_debut'] < t["heure_debut"]):
            t["heure_debut"] = r['heure_debut']
        if r['heure_fin'] and (not t["heure_fin"] or t["heure_fin"] == '-' or r['heure_fin'] > t["heure_fin"]):
            t["heure_fin"] = r['heure_fin']

        m = (r['motif'] or 'OK').strip()
        m_upper = m.upper()
        motifs_summary[m] = motifs_summary.get(m, 0) + 1
        t["motifs"][m] = t["motifs"].get(m, 0) + 1

        if 'FERME' in m_upper or 'FERMÉ' in m_upper:
            t["magasin_ferme"] += 1
        elif 'STOCK' in m_upper or 'SUFISANT' in m_upper or 'SUFFISANT' in m_upper:
            t["stock_suffisant"] += 1
        elif 'RESPONSABLE' in m_upper or 'ABSENT' in m_upper:
            t["responsable_absent"] += 1

        status = r['facture_status'] or ''
        if m_upper == 'OK' or 'AVEC FACTURE' in status:
            t["visites_ok"] += 1
            visites_ok += 1
        else:
            t["visites_sans_ok"] += 1
            visites_sans_ok += 1

        if status == 'ANOMALIE AVEC FACTURE':
            t["anomalies_avec_facture"] += 1
            anomalies_avec_facture += 1
        elif status == 'BIG FACTURE':
            t["big_facture"] += 1
            big_facture += 1
        elif status == 'SMALL FACTURE':
            t["small_facture"] += 1
            small_facture += 1

        t["visites_list"].append({
            "client_code": r['client_code'],
            "client_name": r['client_name'],
            "tournee": r.get('tournee') or '',
            "secteur": r.get('secteur') or '',
            "heure_debut": r['heure_debut'],
            "heure_fin": r['heure_fin'],
            "duree_minutes": r['duree_minutes'],
            "motif": m,
            "facture_status": status,
            "note": r['note']
        })

    tournees_list = []
    for t in tournees_dict.values():
        if t.get("tournees_counts"):
            top_tournee = sorted(t["tournees_counts"].items(), key=lambda x: x[1], reverse=True)[0][0]
            t["tournee"] = top_tournee
        elif not t.get("tournee") or t["tournee"] == t.get("date"):
            t["tournee"] = "Tournée standard"

        if t.get("secteurs_counts"):
            top_secteur = sorted(t["secteurs_counts"].items(), key=lambda x: x[1], reverse=True)[0][0]
            t["secteur"] = top_secteur

        t.pop("tournees_counts", None)
        t.pop("secteurs_counts", None)

        t["billing_rate"] = round((t["visites_ok"] / t["total_visites"] * 100), 1) if t["total_visites"] > 0 else 0.0
        t["duree_totale_minutes"] = parse_visit_time_diff(t["heure_debut"], t["heure_fin"])
        tournees_list.append(t)

    billing_rate_global = round((visites_ok / total_visites * 100), 1) if total_visites > 0 else 0.0

    return {
        "vendeur": search_term,
        "total_tournees": len(tournees_list),
        "total_visites": total_visites,
        "visites_ok": visites_ok,
        "visites_sans_ok": visites_sans_ok,
        "anomalies_avec_facture": anomalies_avec_facture,
        "big_facture": big_facture,
        "small_facture": small_facture,
        "billing_rate": billing_rate_global,
        "motifs_summary": motifs_summary,
        "tournees": tournees_list
    }






