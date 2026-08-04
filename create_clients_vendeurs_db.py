import sqlite3
import os
import sys

TARGET_DB = "clients_vendeurs.db"
SOURCE_DB = "database.db"

def init_target_db(conn):
    cursor = conn.cursor()
    
    # 1. Table Secteurs
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS secteurs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    )
    """)
    
    # 2. Table Localités
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS localites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        secteur_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (secteur_id) REFERENCES secteurs(id) ON DELETE CASCADE
    )
    """)
    
    # 3. Table Vendeurs (FDV)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS vendeurs (
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
        cdz TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)
    
    # 4. Table Clients
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        secteur_id INTEGER NOT NULL,
        localite_id INTEGER NOT NULL,
        vendeur_som TEXT NOT NULL DEFAULT '',
        vendeur_vmm TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (secteur_id) REFERENCES secteurs(id) ON DELETE CASCADE,
        FOREIGN KEY (localite_id) REFERENCES localites(id) ON DELETE CASCADE
    )
    """)
    
    # Create SQL View for joined client information
    cursor.execute("""
    CREATE VIEW IF NOT EXISTS vendeurs_clients_view AS
    SELECT 
        c.id AS client_id,
        c.code AS client_code,
        c.name AS client_name,
        s.name AS secteur_name,
        l.name AS localite_name,
        c.vendeur_som,
        c.vendeur_vmm
    FROM clients c
    LEFT JOIN secteurs s ON c.secteur_id = s.id
    LEFT JOIN localites l ON c.localite_id = l.id
    """)

    # Indexes for optimized performance
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_code ON clients(code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_vendeur_som ON clients(vendeur_som)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_vendeur_vmm ON clients(vendeur_vmm)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_secteur ON clients(secteur_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_localite ON clients(localite_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vendeurs_vendeur ON vendeurs(vendeur)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_vendeurs_secteur ON vendeurs(secteur)")
    
    conn.commit()

def migrate_data():
    if not os.path.exists(SOURCE_DB):
        print(f"[ERROR] Source database '{SOURCE_DB}' not found!")
        return False

    print(f"Connecting to source database: {SOURCE_DB}")
    src_conn = sqlite3.connect(SOURCE_DB)
    src_conn.row_factory = sqlite3.Row
    src_cur = src_conn.cursor()

    if os.path.exists(TARGET_DB):
        os.remove(TARGET_DB)
        print(f"Removed existing target database: {TARGET_DB}")

    print(f"Creating new target database: {TARGET_DB}")
    tgt_conn = sqlite3.connect(TARGET_DB)
    tgt_conn.row_factory = sqlite3.Row
    init_target_db(tgt_conn)
    tgt_cur = tgt_conn.cursor()

    # 1. Copy Secteurs
    secteurs = src_cur.execute("SELECT id, name FROM secteurs").fetchall()
    for s in secteurs:
        tgt_cur.execute(
            "INSERT INTO secteurs (id, name) VALUES (?, ?)",
            (s["id"], s["name"])
        )
    print(f"  [OK] Secteurs imported: {len(secteurs)}")

    # 2. Copy Localités
    localites = src_cur.execute("SELECT id, secteur_id, name FROM localites").fetchall()
    for l in localites:
        tgt_cur.execute(
            "INSERT INTO localites (id, secteur_id, name) VALUES (?, ?, ?)",
            (l["id"], l["secteur_id"], l["name"])
        )
    print(f"  [OK] Localités imported: {len(localites)}")

    # 3. Copy Vendeurs (FDV)
    vendeurs = src_cur.execute("""
        SELECT id, vendeur, role, type_role, activite, secteur, telephone, whatsapp, recrutement, notes, cdz, created_at, updated_at
        FROM fdv
    """).fetchall()
    for v in vendeurs:
        tgt_cur.execute("""
            INSERT INTO vendeurs (id, vendeur, role, type_role, activite, secteur, telephone, whatsapp, recrutement, notes, cdz, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            v["id"], v["vendeur"], v["role"], v["type_role"], v["activite"],
            v["secteur"], v["telephone"], v["whatsapp"], v["recrutement"],
            v["notes"], v["cdz"], v["created_at"], v["updated_at"]
        ))
    print(f"  [OK] Vendeurs imported: {len(vendeurs)}")

    # 4. Copy Clients
    clients = src_cur.execute("""
        SELECT id, code, name, secteur_id, localite_id, vendeur_som, vendeur_vmm 
        FROM clients
    """).fetchall()
    for c in clients:
        tgt_cur.execute("""
            INSERT INTO clients (id, code, name, secteur_id, localite_id, vendeur_som, vendeur_vmm)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            c["id"], c["code"], c["name"], c["secteur_id"], c["localite_id"],
            c["vendeur_som"], c["vendeur_vmm"]
        ))
    print(f"  [OK] Clients imported: {len(clients)}")

    tgt_conn.commit()

    # Verification summary
    print("\n" + "=" * 50)
    print("MIGRATION SUMMARY & INTEGRITY CHECK")
    print("=" * 50)
    v_count = tgt_cur.execute("SELECT COUNT(*) FROM vendeurs").fetchone()[0]
    c_count = tgt_cur.execute("SELECT COUNT(*) FROM clients").fetchone()[0]
    s_count = tgt_cur.execute("SELECT COUNT(*) FROM secteurs").fetchone()[0]
    l_count = tgt_cur.execute("SELECT COUNT(*) FROM localites").fetchone()[0]

    print(f"Vendeurs Count: {v_count}")
    print(f"Clients Count:  {c_count}")
    print(f"Secteurs Count: {s_count}")
    print(f"Localités Count:{l_count}")

    # Sample query from View
    sample = tgt_cur.execute("SELECT * FROM vendeurs_clients_view LIMIT 5").fetchall()
    print("\nSample records from `vendeurs_clients_view`:")
    for row in sample:
        print(" ", dict(row))

    tgt_conn.close()
    src_conn.close()
    return True

if __name__ == "__main__":
    print("Starting creation of clients_vendeurs.db...")
    success = migrate_data()
    if success:
        print("\n[SUCCESS] New database 'clients_vendeurs.db' successfully created and populated!")
    else:
        print("\n[FAILED] Creation of database failed.")
        sys.exit(1)
