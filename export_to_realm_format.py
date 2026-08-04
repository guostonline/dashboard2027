import sqlite3
import json
import os

def export_sqlite_to_realm():
    db_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")
    print(f"Connecting to {db_path}...")
    
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    tables = cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()
    table_names = [t[0] for t in tables]
    
    realm_schemas = {}
    realm_data = {}
    
    # Type mapping from SQLite to Realm
    def map_type(sqlite_type):
        st = sqlite_type.upper()
        if "INT" in st:
            return "int"
        elif "REAL" in st or "FLOAT" in st or "DOUBLE" in st or "NUMERIC" in st:
            return "double"
        elif "BLOB" in st:
            return "data"
        elif "DATE" in st or "TIME" in st:
            return "string" # or date
        else:
            return "string"

    total_exported_rows = 0
    
    for table in table_names:
        columns = cursor.execute(f"PRAGMA table_info('{table}')").fetchall()
        properties = {}
        primary_key = None
        
        for col in columns:
            col_name = col[1]
            col_type = col[2]
            is_pk = col[5]
            
            realm_type = map_type(col_type)
            properties[col_name] = {
                "type": realm_type,
                "optional": not bool(col[3]) and is_pk == 0
            }
            if is_pk > 0:
                primary_key = col_name
                
        realm_schemas[table] = {
            "name": table,
            "primaryKey": primary_key,
            "properties": properties
        }
        
        rows = cursor.execute(f"SELECT * FROM '{table}'").fetchall()
        row_list = []
        for r in rows:
            row_dict = dict(r)
            row_list.append(row_dict)
            
        realm_data[table] = row_list
        total_exported_rows += len(row_list)
        print(f"Table '{table}': {len(row_list)} rows exported.")
        
    conn.close()
    
    # Save schema file
    schemas_path = os.path.join(os.path.dirname(__file__), "realm_schemas.json")
    with open(schemas_path, "w", encoding="utf-8") as f:
        json.dump(realm_schemas, f, indent=2)
        
    # Save data file
    data_path = os.path.join(os.path.dirname(__file__), "realm_data.json")
    with open(data_path, "w", encoding="utf-8") as f:
        json.dump(realm_data, f, indent=2, default=str)
        
    # Generate JavaScript/TypeScript Realm Schema definitions file
    js_schemas_path = os.path.join(os.path.dirname(__file__), "realm_schemas.js")
    with open(js_schemas_path, "w", encoding="utf-8") as f:
        f.write("// Realm Object Schemas exported from SQLite database.db\n\n")
        for table, schema in realm_schemas.items():
            f.write(f"export const {table}Schema = {{\n")
            f.write(f"  name: '{table}',\n")
            if schema["primaryKey"]:
                f.write(f"  primaryKey: '{schema['primaryKey']}',\n")
            f.write("  properties: {\n")
            for prop, details in schema["properties"].items():
                opt_str = "?" if details["optional"] else ""
                f.write(f"    '{prop}': '{details['type']}{opt_str}',\n")
            f.write("  }\n")
            f.write("};\n\n")

    print(f"\nMigration Package Created Successfully!")
    print(f"- Total Tables: {len(table_names)}")
    print(f"- Total Rows Exported: {total_exported_rows}")
    print(f"- Realm Schema file: {schemas_path}")
    print(f"- Realm Data file: {data_path}")
    print(f"- JS Realm Schema file: {js_schemas_path}")
    print(f"- Note: Original 'database.db' remains 100% intact and untouched.")

if __name__ == "__main__":
    export_sqlite_to_realm()
