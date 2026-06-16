import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database with proper tables"""
    conn = get_db_connection()
    cursor = conn.cursor()

    # Create new structure
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
    print("✓ Database tables created successfully!")

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
    return row["file_name"], row["file_size"] if row else None, None

def save_quantitative_data(date, data_dict):
    """Save quantitative data as separate columns"""
    conn = get_db_connection()
    cursor = conn.cursor()

    for q in data_dict:
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

    conn.commit()
    conn.close()

def get_quantitative_data(date, exclude_families=None):
    """Get quantitative data from column-based table"""
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
    """Get focus VMM data from column-based table"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
    SELECT vendeur, secteur, dn_fin_mai, obj_juin, nb_clients, obj_acm, percent, realise, rest, jour_rest, rest_jour
    FROM focus_vmm_data
    WHERE date = ?
    """
    params = [date]

    if exclude_families and exclude_families:
        # Get unique vendeurs for these families from quantitative data
        family_vendeurs_query = """
        SELECT DISTINCT vendeur FROM quantitative_data
        WHERE date = ? AND famille IN ({})
        """.format(",".join(["?" for _ in exclude_families]))
        family_vendeurs_params = [date] + exclude_families
        family_vendeurs_cursor = conn.cursor()
        family_vendeurs_cursor.execute(family_vendeurs_query, family_vendeurs_params)
        family_vendeurs = [row["vendeur"] for row in family_vendeurs_cursor.fetchall()]

        if family_vendeurs:
            placeholders = ",".join(["?" for _ in family_vendeurs])
            query += f" AND vendeur NOT IN ({placeholders})"
            params.extend(family_vendeurs)

    query += " ORDER BY vendeur, secteur"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]

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
    """Get focus SOM data from column-based table"""
    conn = get_db_connection()
    cursor = conn.cursor()

    query = """
    SELECT vendeur, secteur, glace_ht, ttc, percent, realise, rest, rest_jour, jour_rest
    FROM focus_som_data
    WHERE date = ?
    """
    params = [date]

    if exclude_families and exclude_families:
        # Get unique vendeurs for these families from quantitative data
        family_vendeurs_query = """
        SELECT DISTINCT vendeur FROM quantitative_data
        WHERE date = ? AND famille IN ({})
        """.format(",".join(["?" for _ in exclude_families]))
        family_vendeurs_params = [date] + exclude_families
        family_vendeurs_cursor = conn.cursor()
        family_vendeurs_cursor.execute(family_vendeurs_query, family_vendeurs_params)
        family_vendeurs = [row["vendeur"] for row in family_vendeurs_cursor.fetchall()]

        if family_vendeurs:
            placeholders = ",".join(["?" for _ in family_vendeurs])
            query += f" AND vendeur NOT IN ({placeholders})"
            params.extend(family_vendeurs)

    query += " ORDER BY vendeur, secteur"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]

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

def get_workdays_info(rest_days):
    elapsed = 5
    total = 24
    if os.path.exists("days.json"):
        import json
        try:
            with open("days.json", "r") as f:
                d_info = json.load(f)
                elapsed = int(d_info["from_file"]["d"])
                total = int(d_info["from_file"]["t"])
        except Exception:
            pass
    return {"elapsed": elapsed, "total": total, "rest": rest_days}

def get_all_suivi_data_records():
    """Get all records across all dates"""
    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("""
    SELECT date FROM quantitative_data
    ORDER BY date ASC
    """)

    dates = [row["date"] for row in cursor.fetchall()]

    records = []
    for date in dates:
        records.append({
            "date": date,
            "data": get_full_data(date)
        })

    conn.close()
    return records

def get_full_data(date):
    """Get complete data for a date"""
    quant_data = get_quantitative_data(date)
    qual_data = get_qualitative_data(date)
    vmm_data = get_focus_vmm_data(date)
    som_data = get_focus_som_data(date)

    # Get settings
    settings = get_settings(date)
    rest_days = settings["rest_days"] if settings else 20
    exclude_families = settings.get("exclude_families", [])

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

    return {
        "quantitative": list(grouped_quant.values()),
        "qualitative": qual_data,
        "focus_vmm": vmm_data,
        "focus_som": som_data,
        "workdays": get_workdays_info(rest_days),
        "exclude_families": exclude_families,
        "all_families": list(set(q["famille"] for q in quant_data if q["famille"]))
    }

def save_suivi_file(date, file_name, file_content):
    """Save raw file content (for backward compatibility)"""
    # Simply store the file metadata, actual processing will use the processed data
    import os
    size = len(file_content)
    save_file_metadata(date, file_name, size)

def get_suivi_file(date):
    """Get raw file content (for backward compatibility)"""
    file_name, file_size = get_file_metadata(date)
    if file_name:
        # For simplicity, just return metadata
        # In production, you'd want to store the actual file content separately
        return b"", file_name if file_size else None
    return None, None