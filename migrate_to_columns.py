import sqlite3
import os

DB_PATH = "database.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def create_migration_script():
    """Create migration script to convert from JSON to column-based storage"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Check if we need to migrate
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='suivi_data'")
    old_table_exists = cursor.fetchone()

    if not old_table_exists:
        print("No migration needed - database already has new structure")
        return

    print("Starting database migration...")
    print("=" * 50)

    # Get all dates from old table
    cursor.execute("SELECT DISTINCT date FROM suivi_data ORDER BY date DESC")
    dates = [row["date"] for row in cursor.fetchall()]

    print(f"Found {len(dates)} date(s) to migrate")

    migrated_count = 0

    for date in dates:
        print(f"\nMigrating date: {date}")

        # Get JSON data from old table
        cursor.execute("SELECT json_data FROM suivi_data WHERE date = ?", (date,))
        row = cursor.fetchone()

        if row:
            try:
                import json
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

                print(f"  ✓ Saved {quant_saved} quantitative records")

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

                print(f"  ✓ Saved {qual_saved} qualitative record")

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

                print(f"  ✓ Saved {vmm_saved} focus VMM records")

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

                print(f"  ✓ Saved {som_saved} focus SOM records")

                # 5. Migrate settings
                settings = data.get("exclude_families", [])
                cursor.execute("""
                INSERT OR REPLACE INTO settings (date, rest_days, exclude_families)
                VALUES (?, 20, ?)
                """, (date, json.dumps(settings) if settings else None))

                print(f"  ✓ Saved settings")

                migrated_count += 1

            except Exception as e:
                print(f"  [ERROR] Error migrating date {date}: {e}")
                import traceback
                traceback.print_exc()

    # Drop old tables
    print("\nCleaning up old tables...")
    cursor.execute("DROP TABLE IF EXISTS suivi_data")
    cursor.execute("DROP TABLE IF EXISTS suivi_files")
    cursor.execute("DROP TABLE IF EXISTS suivi_settings")

    conn.commit()
    conn.close()

    print("\n" + "=" * 50)
    print(f"✓ Migration complete! Successfully migrated {migrated_count}/{len(dates)} dates")

def show_database_structure():
    """Display current database structure"""
    conn = get_db_connection()
    cursor = conn.cursor()

    print("\nDATABASE STRUCTURE")
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
                print(f"   • {col['name']:25s} {col_type}")

    # Show sample data
    print("\n" + "=" * 60)
    print("SAMPLE DATA")
    print("=" * 60)

    # Sample quantitative records
    cursor.execute("SELECT vendeur, famille, real, obj, percent FROM quantitative_data LIMIT 5")
    sample_quant = cursor.fetchall()
    print(f"\nQUANTITATIVE Sample (5 records):")
    if sample_quant:
        for row in sample_quant:
            print(f"   - {row['vendeur']:20s} {row['famille']:15s} | Real: {row['real']:6d} | Obj: {row['obj']:6d} | {row['percent']:5.1f}%")
    else:
        print("   No quantitative data found")

    # Sample qualitative records
    cursor.execute("SELECT vendeur, clt_programme, clt_facture, acm, tsm FROM qualitative_data LIMIT 5")
    sample_qual = cursor.fetchall()
    print(f"\nQUALITATIVE Sample (5 records):")
    if sample_qual:
        for row in sample_qual:
            print(f"   - {row['vendeur']:20s} | Clt Prog: {row['clt_programme']:4d} | Clt Fact: {row['clt_facture']:4d} | ACM: {row['acm']:4.1f}% | TSM: {row['tsm']:4.1f}%")
    else:
        print("   No qualitative data found")

    # Sample settings
    cursor.execute("SELECT date, rest_days FROM settings LIMIT 5")
    sample_settings = cursor.fetchall()
    print(f"\nSETTINGS Sample (5 records):")
    if sample_settings:
        for row in sample_settings:
            print(f"   - {row['date']}: {row['rest_days']} rest days")
    else:
        print("   No settings found")

    # Table counts
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
        print(f"   • {table:20s}: {count:5d} records")

    conn.close()

if __name__ == "__main__":
    print("DATABASE MIGRATION TOOL")
    print("=" * 50)
    print()

    # Check if we need to migrate
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='suivi_data'")
    old_table_exists = cursor.fetchone()
    conn.close()

    if old_table_exists:
        print("[WARNING] Found old JSON-based database structure")
        print("   Starting migration to column-based structure...")
        create_migration_script()
        show_database_structure()
    else:
        print("[OK] Database already uses column-based structure")
        show_database_structure()

    print("\n[OK] Migration process completed successfully!")