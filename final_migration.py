import sqlite3
import os
import json

DB_PATH = "database.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def create_tables():
    """Create new database tables with column-based structure"""
    conn = get_db_connection()
    cursor = conn.cursor()

    print("Creating database tables...")

    # 1. Quantitative data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quantitative_data (
        date TEXT PRIMARY KEY,
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quantitative_date ON quantitative_data(date)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quantitative_vendeur ON quantitative_data(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_quantitative_famille ON quantitative_data(famille)")

    # 2. Qualitative data table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS qualitative_data (
        date TEXT PRIMARY KEY,
        vendeur TEXT NOT NULL,
        clt_programme INTEGER DEFAULT 0,
        clt_facture INTEGER DEFAULT 0,
        acm REAL DEFAULT 0.0,
        tsm REAL DEFAULT 0.0,
        line REAL DEFAULT 0.0,
        raf_tsm INTEGER DEFAULT 0,
        raf_acm INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    conn.commit()
    conn.close()
    print("[OK] Database tables created successfully!")

def migrate_data():
    """Migrate existing data from JSON to new structure"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if old tables exist
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='suivi_data'")
    old_table_exists = cursor.fetchone()

    if not old_table_exists:
        print("[INFO] No old JSON tables found. Migration not needed.")
        return

    print("Migrating existing data...")

    # Get all dates from old table
    cursor.execute("SELECT DISTINCT date FROM suivi_data ORDER BY date DESC")
    dates = [row["date"] for row in cursor.fetchall()]

    migrated_count = 0

    for date in dates:
        print(f"  Processing date: {date}")

        # Get JSON data from old table
        cursor.execute("SELECT json_data FROM suivi_data WHERE date = ?", (date,))
        row = cursor.fetchone()

        if row:
            try:
                data = json.loads(row["json_data"])

                # 1. Migrate quantitative data
                quant_saved = 0
                for q in data.get("quantitative", []):
                    if q.get("famille") and q.get("famille") != "C.A (ht)":
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
                        quant_saved += 1

                print(f"    - Saved {quant_saved} quantitative records")

                # 2. Migrate qualitative data
                qual_saved = 0
                q_data = data.get("qualitative", [])
                if q_data:
                    q = q_data[0]  # Take first (only) row
                    cursor.execute("""
                    INSERT OR REPLACE INTO qualitative_data
                    (date, vendeur, clt_programme, clt_facture, acm, tsm, line, raf_tsm, raf_acm)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        date,
                        q.get("vendeur", ""),
                        q.get("clt_programme", 0),
                        q.get("clt_facture", 0),
                        q.get("acm", 0.0),
                        q.get("tsm", 0.0),
                        q.get("line", 0.0),
                        q.get("raf_tsm", 0),
                        q.get("raf_acm", 0)
                    ))
                    qual_saved += 1

                print(f"    - Saved {qual_saved} qualitative record")

                # 3. Migrate focus VMM data
                vmm_saved = 0
                for f in data.get("focus_vmm", []):
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
                        vmm_saved += 1

                print(f"    - Saved {vmm_saved} focus VMM records")

                # 4. Migrate focus SOM data
                som_saved = 0
                for f in data.get("focus_som", []):
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
                        som_saved += 1

                print(f"    - Saved {som_saved} focus SOM records")

                # 5. Migrate settings
                settings = data.get("exclude_families", [])
                cursor.execute("""
                INSERT OR REPLACE INTO settings (date, rest_days, exclude_families)
                VALUES (?, 20, ?)
                """, (date, json.dumps(settings) if settings else None))

                print(f"    - Saved settings")

                migrated_count += 1

            except Exception as e:
                print(f"    [ERROR] Error migrating date {date}: {e}")

    # Drop old tables
    print("Cleaning up old tables...")
    cursor.execute("DROP TABLE IF EXISTS suivi_data")
    cursor.execute("DROP TABLE IF EXISTS suivi_files")
    cursor.execute("DROP TABLE IF EXISTS suivi_settings")

    conn.commit()
    conn.close()
    print(f"\n[OK] Migration complete! Successfully migrated {migrated_count}/{len(dates)} dates")

def show_database_structure():
    """Display current database structure for verification"""
    conn = get_db_connection()
    cursor = conn.cursor()

    print("\n" + "=" * 60)
    print("DATABASE STRUCTURE")
    print("=" * 60)

    tables = [
        ("quantitative_data", "Quantitative sales data by product family"),
        ("qualitative_data", "Qualitative metrics (ACM, TSM, LINE)"),
        ("focus_vmm_data", "Focus product VMM data"),
        ("focus_som_data", "Focus product SOM data"),
        ("settings", "Date-specific settings"),
        ("file_metadata", "File metadata storage")
    ]

    for table, description in tables:
        print(f"\nFILE: {table}")
        print(f"   {description}")

        cursor.execute(f"PRAGMA table_info({table})")
        columns = cursor.fetchall()

        if columns:
            print("\n   Columns:")
            for col in columns:
                col_type = col['type']
                if col['pk']:
                    col_type += " [PRIMARY KEY]"
                if col['notnull']:
                    col_type += " [NOT NULL]"
                print(f"   - {col['name']:25s} {col_type}")

    # Show table counts
    print("\n" + "=" * 60)
    print("TABLE STATISTICS")
    print("=" * 60)

    table_stats = [
        ("quantitative_data", "SELECT COUNT(*) FROM quantitative_data"),
        ("qualitative_data", "SELECT COUNT(*) FROM qualitative_data"),
        ("focus_vmm_data", "SELECT COUNT(*) FROM focus_vmm_data"),
        ("focus_som_data", "SELECT COUNT(*) FROM focus_som_data"),
        ("settings", "SELECT COUNT(*) FROM settings")
    ]

    for table, query in table_stats:
        cursor.execute(query)
        count = cursor.fetchone()[0]
        print(f"   - {table:20s}: {count:5d} records")

    conn.close()

if __name__ == "__main__":
    print("=" * 60)
    print("DATABASE MIGRATION TOOL")
    print("=" * 60)
    print()

    # Create new tables
    create_tables()

    # Migrate existing data if needed
    migrate_data()

    # Show structure
    show_database_structure()

    print("\n" + "=" * 60)
    print("[OK] Migration process completed successfully!")
    print("=" * 60)