import pandas as pd
import os
import sys
import sqlite3
import re

# This script is preserved for historical reference only.
# The active clients table is now `clients_full` (imported via
# import_clients_full.py). Run that script instead.
print("[DEPRECATED] import_clients.py targets the legacy `clients` table,\n"
      "           which has been removed. Use `import_clients_full.py` instead.")
sys.exit(0)

DB_PATH = "database.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def clean_value(val, default=""):
    """Clean a value, return default if NaN/None/empty"""
    if pd.isna(val) or val is None:
        return default
    val_str = str(val).strip()
    if val_str.lower() in ['nan', 'none', 'null', '']:
        return default
    return val_str

def clean_phone(phone):
    """Clean phone number"""
    phone = clean_value(phone)
    if not phone:
        return ""
    # Remove any non-numeric characters except + and spaces
    phone = re.sub(r'[^\d+\s\-\(\)]', '', phone)
    return phone.strip()

def clean_email(email):
    """Clean and validate email"""
    email = clean_value(email).lower()
    if not email:
        return ""
    # Basic email validation
    if '@' in email and '.' in email:
        return email
    return ""

def import_clients_from_excel(file_path):
    """Read clients from Excel and import to database"""

    if not os.path.exists(file_path):
        print(f"[ERROR] File not found: {file_path}")
        return False

    print(f"Reading file: {file_path}")
    print("=" * 60)

    try:
        # Read Excel file
        df = pd.read_excel(file_path)
        print(f"[OK] File loaded successfully")
        print(f"Total rows: {len(df)}")
        print(f"Columns: {list(df.columns)}")
        print()

        # Display first few rows to understand structure
        print("First 5 rows (preview):")
        print(df.head().to_string())
        print()

    except Exception as e:
        print(f"[ERROR] Error reading file: {e}")
        return False

    # Connect to database
    conn = get_db_connection()
    cursor = conn.cursor()

    # Get existing codes to avoid duplicates
    cursor.execute("SELECT code FROM clients")
    existing_codes = set(row["code"] for row in cursor.fetchall())
    print(f"Existing clients in database: {len(existing_codes)}")
    print()

    # Column mapping - adapt based on actual column names
    # Try to identify columns automatically
    column_mapping = {}

    # Common column name variations
    code_variations = ['code', 'client code', 'code client', 'customer code', 'id', 'ref', 'reference', 'code_client', 'client']
    name_variations = ['name', 'nom', 'client name', 'nom client', 'customer name', 'client', 'raison sociale', 'company', 'société']
    vendeur_variations = ['vendeur', 'seller', 'salesperson', 'commercial', 'rep', 'representative']
    secteur_variations = ['secteur', 'sector', 'zone', 'area', 'region', 'territory', 'localité', 'localite']
    phone_variations = ['phone', 'téléphone', 'tel', 'telephone', 'mobile', 'contact']
    email_variations = ['email', 'e-mail', 'mail', 'courriel']
    address_variations = ['address', 'adresse', 'location', 'rue']
    status_variations = ['status', 'statut', 'state', 'etat', 'état']
    notes_variations = ['notes', 'note', 'comment', 'commentaire', 'remarks', 'observation']

    # Find matching columns
    for col in df.columns:
        col_lower = str(col).lower().strip()

        if col_lower in [v.lower() for v in code_variations]:
            column_mapping['code'] = col
        elif col_lower in [v.lower() for v in name_variations]:
            column_mapping['name'] = col
        elif col_lower in [v.lower() for v in vendeur_variations]:
            column_mapping['vendeur'] = col
        elif col_lower in [v.lower() for v in secteur_variations]:
            column_mapping['secteur'] = col
        elif col_lower in [v.lower() for v in phone_variations]:
            column_mapping['phone'] = col
        elif col_lower in [v.lower() for v in email_variations]:
            column_mapping['email'] = col
        elif col_lower in [v.lower() for v in address_variations]:
            column_mapping['address'] = col
        elif col_lower in [v.lower() for v in status_variations]:
            column_mapping['status'] = col
        elif col_lower in [v.lower() for v in notes_variations]:
            column_mapping['notes'] = col

    print("Column mapping detected:")
    for field, col in column_mapping.items():
        print(f"  {field:10s} -> {col}")
    print()

    # Special case: if we have 'Secteur', 'Localité', 'Client', 'Nom' columns
    # Map Client -> code, Nom -> name, Localité -> address, Secteur -> secteur
    if 'Client' in df.columns and 'Nom' in df.columns and 'Secteur' in df.columns:
        print("[INFO] Detected standard format: Client=code, Nom=name, Secteur=secteur, Localité=address")
        column_mapping = {
            'code': 'Client',
            'name': 'Nom',
            'secteur': 'Secteur',
            'address': 'Localité' if 'Localité' in df.columns else None
        }

    # Check required fields
    if 'code' not in column_mapping or 'name' not in column_mapping:
        print("[ERROR] Required columns 'code' and 'name' not found!")
        print(f"Available columns: {list(df.columns)}")
        print("Please ensure your Excel file has 'code' and 'name' columns.")
        return False

    # Import clients
    imported_count = 0
    skipped_count = 0
    error_count = 0

    print("Starting import...")
    print("=" * 60)

    for index, row in df.iterrows():
        try:
            # Get code
            code = clean_value(row[column_mapping['code']])
            if not code:
                print(f"  Row {index+1}: Skipped (no code)")
                skipped_count += 1
                continue

            # Check for duplicates
            if code in existing_codes:
                # print(f"  Row {index+1}: Skipped '{code}' (already exists)")
                skipped_count += 1
                continue

            # Get name
            name = clean_value(row[column_mapping['name']])
            if not name:
                print(f"  Row {index+1}: Skipped (no name for code '{code}')")
                skipped_count += 1
                continue

            # Get optional fields
            vendeur = clean_value(row.get(column_mapping.get('vendeur', ''), ""))
            if not vendeur:
                vendeur = "NON ASSIGNE"

            secteur = clean_value(row.get(column_mapping.get('secteur', ''), ""))
            if not secteur:
                secteur = "NON DEFINI"

            phone = clean_phone(row.get(column_mapping.get('phone', ''), ""))
            email = clean_email(row.get(column_mapping.get('email', ''), ""))
            address = clean_value(row.get(column_mapping.get('address', ''), ""))
            status = clean_value(row.get(column_mapping.get('status', ''), ""))
            if status not in ['Actif', 'Inactif', 'Prospect']:
                status = 'Actif'

            notes = clean_value(row.get(column_mapping.get('notes', ''), ""))

            # Insert into database
            cursor.execute("""
            INSERT INTO clients (code, name, vendeur, secteur, phone, email, address, status, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (code, name, vendeur, secteur, phone, email, address, status, notes))

            existing_codes.add(code)
            imported_count += 1

            if imported_count <= 5 or imported_count % 10 == 0:
                print(f"  [OK] Imported: {code} - {name}")

        except Exception as e:
            error_count += 1
            print(f"  [ERROR] Row {index+1}: {e}")

    conn.commit()
    conn.close()

    print()
    print("=" * 60)
    print(f"Import complete!")
    print(f"  Imported: {imported_count}")
    print(f"  Skipped:  {skipped_count}")
    print(f"  Errors:   {error_count}")
    print(f"  Total in database: {len(existing_codes)}")
    print("=" * 60)

    return True

if __name__ == "__main__":
    file_path = "clients.xlsx"

    if len(sys.argv) > 1:
        file_path = sys.argv[1]

    print("=" * 60)
    print("CLIENTS IMPORT TOOL")
    print("=" * 60)
    print()

    success = import_clients_from_excel(file_path)

    if success:
        print("\n[OK] Import completed successfully!")
    else:
        print("\n[ERROR] Import failed!")
        sys.exit(1)