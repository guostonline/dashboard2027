"""
Migration and synchronization script to push local SQLite databases to Turso Cloud SQLite.
Usage:
  python sync_to_turso.py <TURSO_DATABASE_URL> <TURSO_AUTH_TOKEN>
Or set environment variables:
  TURSO_DATABASE_URL=...
  TURSO_AUTH_TOKEN=...
  python sync_to_turso.py
"""

import os
import sys
import json
import sqlite3
import urllib.request
import urllib.error

def execute_turso_batch(db_url, auth_token, sql_statements):
    if not sql_statements:
        return
    
    # Normalize URL: libsql://my-db.turso.io -> https://my-db.turso.io/v2/pipeline
    http_url = db_url.strip()
    if http_url.startswith("libsql://"):
        http_url = "https://" + http_url[len("libsql://"):]
    if not http_url.startswith("http"):
        http_url = "https://" + http_url
    if not http_url.endswith("/v2/pipeline"):
        http_url = http_url.rstrip("/") + "/v2/pipeline"

    # Build Turso pipeline requests in batches of 100 statements
    BATCH_SIZE = 50
    for i in range(0, len(sql_statements), BATCH_SIZE):
        batch = sql_statements[i:i + BATCH_SIZE]
        requests_payload = []
        for stmt in batch:
            requests_payload.append({
                "type": "execute",
                "stmt": {"sql": stmt}
            })
            
        payload = json.dumps({"requests": requests_payload}).encode("utf-8")
        req = urllib.request.Request(
            http_url,
            data=payload,
            headers={
                "Authorization": f"Bearer {auth_token.strip()}",
                "Content-Type": "application/json"
            },
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                for r in data.get("results", []):
                    if r.get("type") == "error":
                        print(f"  [Warning] Statement error: {r.get('error', {}).get('message')}")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="ignore")
            print(f"  [Error] Batch failed (HTTP {e.code}): {err_body}")
        except Exception as e:
            print(f"  [Error] Request failed: {e}")

def dump_db_to_sql_statements(db_file):
    if not os.path.exists(db_file):
        return []
    
    statements = []
    conn = sqlite3.connect(db_file)
    cur = conn.cursor()
    
    # Get tables
    cur.execute("SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    tables = cur.fetchall()
    
    for table_name, create_sql in tables:
        if not create_sql:
            continue
        # Table creation
        statements.append(f"CREATE TABLE IF NOT EXISTS {table_name} (" + create_sql[create_sql.find("(")+1:])
        
        # Get data
        cur.execute(f"SELECT * FROM \"{table_name}\"")
        rows = cur.fetchall()
        if rows:
            # Column count
            col_count = len(rows[0])
            for row in rows:
                values = []
                for val in row:
                    if val is None:
                        values.append("NULL")
                    elif isinstance(val, (int, float)):
                        values.append(str(val))
                    else:
                        val_str = str(val).replace("'", "''")
                        values.append(f"'{val_str}'")
                
                val_list = ", ".join(values)
                statements.append(f"INSERT OR REPLACE INTO \"{table_name}\" VALUES ({val_list});")
                
    conn.close()
    return statements

def main():
    db_url = os.environ.get("TURSO_DATABASE_URL")
    auth_token = os.environ.get("TURSO_AUTH_TOKEN")
    
    if len(sys.argv) >= 3:
        db_url = sys.argv[1]
        auth_token = sys.argv[2]
        
    if not db_url or not auth_token:
        print("=" * 60)
        print("TURSO CLOUD SYNC TOOL")
        print("=" * 60)
        print("Usage:")
        print("  python sync_to_turso.py <TURSO_DATABASE_URL> <TURSO_AUTH_TOKEN>")
        print("\nGet your URL & Token from: https://turso.tech")
        return

    print(f"[+] Pushing local SQLite data to Turso: {db_url}...")
    
    all_statements = []
    for db in ["database.db", "uploads.db", "clients_vendeurs.db"]:
        if os.path.exists(db):
            print(f"[*] Extracting schema & rows from {db}...")
            stmts = dump_db_to_sql_statements(db)
            print(f"    -> Extracted {len(stmts)} statements.")
            all_statements.extend(stmts)
            
    print(f"[+] Total statements to execute on Turso: {len(all_statements)}")
    execute_turso_batch(db_url, auth_token, all_statements)
    print("[OK] Synchronization to Turso completed successfully!")

if __name__ == "__main__":
    main()
