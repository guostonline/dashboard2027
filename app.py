import os
import json
from flask import Flask, jsonify, request, render_template
from data_processor import ExcelProcessor, get_categorie
import pandas as pd
import datetime
from generate_report import generate_report
import db_manager
db_manager.init_db()

app = Flask(__name__)

@app.after_request
def add_header(response):
    response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '-1'
    return response

# Ensure directories exist
os.makedirs("templates", exist_ok=True)
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)

CONFIG_PATH = "config.json"

def load_config():
    defaults = {
        "rest_days": 20,
        "exclude_families": [],
        "theme": "theme-1",
        "light_mode": False,
        "excluded_dates": []
    }
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                config = json.load(f)
                # Ensure all default keys exist
                for k, v in defaults.items():
                    if k not in config:
                        config[k] = v
                return config
        except Exception:
            pass
    return defaults

def save_config(config):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=4, ensure_ascii=False)
        return True
    except Exception as e:
        print(f"Error saving config: {e}")
        return False

def get_processor():
    config = load_config()
    rest_days = int(config.get("rest_days", 20))
    exclude_families = config.get("exclude_families", [])
    return ExcelProcessor(rest_days=rest_days, exclude_families=exclude_families)


def process_and_save_suivi(date, file_content, force_extract_rest_days=False):
    temp_in = f"excel/temp_upload_{date}.xlsx"
    temp_out = f"excel/temp_finale_{date}.xlsx"
    
    # Save file content temporarily to run openpyxl/pandas
    os.makedirs("excel", exist_ok=True)
    with open(temp_in, "wb") as f:
        f.write(file_content)
        
    # Get settings for this date, default if not present
    settings = db_manager.get_suivi_settings(date)
    if settings and not force_extract_rest_days:
        rest_days = settings["rest_days"]
        exclude_families = settings["exclude_families"]
    else:
        rest_days = None
        exclude_families = settings["exclude_families"] if settings else []
        
    p = ExcelProcessor(path=temp_in, output_path=temp_out, rest_days=rest_days, exclude_families=exclude_families, date=date)
    
    try:
        # Extract default rest days from file if not specified
        elapsed, total = p.get_day_work()
        if rest_days is None:
            rest_days = total - elapsed
            db_manager.save_suivi_settings(date, rest_days, exclude_families)
            # Re-initialize processor with determined rest days
            p = ExcelProcessor(path=temp_in, output_path=temp_out, rest_days=rest_days, exclude_families=exclude_families, date=date)
            
        p.fix_sheet(jour_rest=rest_days)
        data = p.get_data()
        
        # Save parsed data to DB
        db_manager.save_suivi_data(date, data)
        return True
    finally:
        # Clean up temp files
        if os.path.exists(temp_in):
            try:
                os.remove(temp_in)
            except Exception:
                pass
        if os.path.exists(temp_out):
            try:
                os.remove(temp_out)
            except Exception:
                pass

@app.route("/")
@app.route("/dashboard")
def index():
    config = load_config()
    theme = config.get("theme", "theme-1")
    light_mode = config.get("light_mode", False)
    return render_template("index.html", theme=theme, light_mode=light_mode)

@app.route("/details")
def details():
    config = load_config()
    theme = config.get("theme", "theme-1")
    light_mode = config.get("light_mode", False)
    return render_template("index.html", theme=theme, light_mode=light_mode, active_tab="details")

@app.route("/clients")
def clients():
    config = load_config()
    theme = config.get("theme", "theme-1")
    light_mode = config.get("light_mode", False)
    return render_template("index.html", theme=theme, light_mode=light_mode, active_tab="clients")

@app.route("/rapport")
def rapport():
    config = load_config()
    theme = config.get("theme", "theme-1")
    light_mode = config.get("light_mode", False)
    return render_template("index.html", theme=theme, light_mode=light_mode, active_tab="rapport")

@app.route("/theme1")
def theme1():
    config = load_config()
    config["theme"] = "theme-1"
    save_config(config)
    return render_template("index.html", theme="theme-1", light_mode=config.get("light_mode", False))

@app.route("/theme2")
def theme2():
    config = load_config()
    config["theme"] = "theme-2"
    save_config(config)
    return render_template("index.html", theme="theme-2", light_mode=config.get("light_mode", False))

@app.route("/theme3")
def theme3():
    config = load_config()
    config["theme"] = "theme-3"
    save_config(config)
    return render_template("index.html", theme="theme-3", light_mode=config.get("light_mode", False))

@app.route("/theme4")
def theme4():
    config = load_config()
    config["theme"] = "theme-4"
    save_config(config)
    return render_template("index.html", theme="theme-4", light_mode=config.get("light_mode", False))

@app.route("/theme5")
def theme5():
    config = load_config()
    config["theme"] = "theme-5"
    save_config(config)
    return render_template("index.html", theme="theme-5", light_mode=config.get("light_mode", False))

@app.route("/favicon.ico")
def favicon():
    return app.send_static_file("logo.png")

@app.route("/api/data")
def get_all_data():
    try:
        category = request.args.get("category")
        date = request.args.get("date")
        
        if date and date != "default":
            data = db_manager.get_suivi_data(date)
            if not data:
                return jsonify({"status": "error", "message": f"Aucune donnée trouvée pour la date {date}."}), 404
        else:
            processor = get_processor()
            data = processor.get_data()
        
        # Include FDV roster for dynamic Chef de Zone mapping
        data["fdv"] = db_manager.get_fdv_list()
        
        # Apply category filter if requested
        if category and category != "All":
            allowed_vendeurs = get_categorie(category)
            if not isinstance(allowed_vendeurs, list):
                allowed_vendeurs = [allowed_vendeurs]
                
            allowed_vendeurs_set = {v.strip().upper() for v in allowed_vendeurs if v}
            
            # Filter all relevant records
            data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() in allowed_vendeurs_set]
            data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() in allowed_vendeurs_set]
            data["focus_vmm"] = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() in allowed_vendeurs_set]
            data["focus_som"] = [r for r in data["focus_som"] if r["vendeur"].strip().upper() in allowed_vendeurs_set]
            
        return jsonify({"status": "success", "data": data})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/settings", methods=["POST"])
def update_settings():
    try:
        req_data = request.get_json() or {}
        rest_days = req_data.get("rest_days")
        date = req_data.get("date")
        
        if rest_days is None:
            return jsonify({"status": "error", "message": "Missing rest_days"}), 400
        
        rest_days = int(rest_days)
        
        exclude_families_raw = req_data.get("exclude_families", "")
        if isinstance(exclude_families_raw, str):
            exclude_families = [f.strip() for f in exclude_families_raw.split(",") if f.strip()]
        elif isinstance(exclude_families_raw, list):
            exclude_families = [str(f).strip() for f in exclude_families_raw if str(f).strip()]
        else:
            exclude_families = []
            
        if date and date != "default":
            # Save settings for this date
            db_manager.save_suivi_settings(date, rest_days, exclude_families)
            
            # Re-process file from db
            file_content, file_name = db_manager.get_suivi_file(date)
            if not file_content or not file_name:
                return jsonify({
                    "status": "error", 
                    "message": f"Le fichier Excel d'origine pour la date {date} est absent ou vide dans la base de données. Veuillez ré-importer le fichier pour cette date."
                }), 404

            process_and_save_suivi(date, file_content)
            return jsonify({"status": "success", "message": f"Paramètres de la date {date} mis à jour et recalculés."})
        else:
            # Load existing config
            config = load_config()
            
            config["rest_days"] = rest_days
            config["exclude_families"] = exclude_families
            
            # Save config
            save_config(config)
            
            # Re-run processor fix
            processor = ExcelProcessor(rest_days=rest_days, exclude_families=exclude_families)
            processor.fix_sheet(jour_rest=rest_days)
            
            return jsonify({"status": "success", "message": f"Rest days updated to {rest_days}, excluded families updated, and data recalculated."})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/refresh", methods=["POST"])
def refresh_data():
    try:
        processor = get_processor()
        processor.get_day_work()
        processor.fix_sheet()
        return jsonify({"status": "success", "message": "Données rafraîchies depuis Excel avec succès."})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/generate_report", methods=["POST"])
def run_ai_analysis():
    try:
        vendeur = request.args.get("vendeur")
        category = request.args.get("category")
        date = request.args.get("date")
        options_str = request.args.get("options")
        tax_mode = request.args.get("tax_mode", "TTC")
        
        # Parse options if provided
        options = None
        if options_str:
            selected_options = options_str.split(",")
            options = {
                "quanti": "quanti" in selected_options,
                "quali": "quali" in selected_options,
                "focus": "focus" in selected_options,
                "anomali": "anomali" in selected_options,
                "rappel": "rappel" in selected_options
            }

        report_content = generate_report(vendeur=vendeur, category=category, date=date, options=options, tax_mode=tax_mode)
        if report_content:
            return jsonify({"status": "success", "report": report_content})
        else:
            return jsonify({"status": "error", "message": "Erreur lors de la génération du rapport via OpenRouter."}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/upload", methods=["POST"])
def upload_suivi():
    try:
        if "file" not in request.files:
            return jsonify({"status": "error", "message": "Aucun fichier fourni."}), 400
        file = request.files["file"]
        date = request.form.get("date")
        rest_days = request.form.get("rest_days")
        
        if not date:
            return jsonify({"status": "error", "message": "Aucune date fournie."}), 400
            
        if not file.filename.endswith(('.xlsx', '.xls')):
            return jsonify({"status": "error", "message": "Le fichier doit être un classeur Excel (.xlsx, .xls)."}), 400
            
        file_content = file.read()
        db_manager.save_suivi_file(date, file.filename, file_content)
        
        # Process and save structured JSON, always extracting rest days from the file
        process_and_save_suivi(date, file_content, force_extract_rest_days=True)
        
        return jsonify({"status": "success", "message": f"Fichier importé et recalculé avec succès pour le {date}."})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/suivi_dates", methods=["GET"])
def get_suivi_dates():
    try:
        dates = db_manager.get_all_suivi_dates()
        return jsonify({"status": "success", "dates": dates})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/reset_db", methods=["POST"])
def reset_db():
    try:
        data = request.get_json(silent=True) or {}
        tables = data.get("tables", [])
        if tables:
            db_manager.reset_specific_tables(tables)
            message = "Les tables spécifiées ont été réinitialisées avec succès."
        else:
            db_manager.reset_all_database_tables()
            message = "La base de données a été réinitialisée avec succès."
        return jsonify({"status": "success", "message": message})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500



@app.route("/api/trends", methods=["GET"])
def get_trends():
    try:
        family = request.args.get("family", "LEVURE").strip().upper()
        category = request.args.get("category", "All").strip()
        records = db_manager.get_all_suivi_data_records()
        
        allowed_vendeurs_set = None
        if category and category != "All":
            allowed_vendeurs = get_categorie(category)
            if not isinstance(allowed_vendeurs, list):
                allowed_vendeurs = [allowed_vendeurs]
            allowed_vendeurs_set = {v.strip().upper() for v in allowed_vendeurs if v}
        
        dates = []
        vendeurs_set = set()
        trends = {}
        quali_trends = {}
        
        for r in records:
            date_str = r["date"]
            dates.append(date_str)
            quanti = r["data"].get("quantitative", [])
            quanti = [dict(i) if not isinstance(i, dict) else i for i in quanti]
            quali_list = r["data"].get("qualitative", [])
            quali_list = [dict(i) if not isinstance(i, dict) else i for i in quali_list]
            
            # Extract records for the selected family
            family_records = [item for item in quanti if item["famille"].strip().upper() == family]
            
            for item in family_records:
                v = item["vendeur"].strip()
                if not v or v.upper() == 'AUTRE':
                    continue
                if allowed_vendeurs_set is not None and v.upper() not in allowed_vendeurs_set:
                    continue
                vendeurs_set.add(v)
                
                if v not in trends:
                    trends[v] = {}
                
                pct = round((item["real"] / item["obj"]) * 100) if item["obj"] > 0 else 0
                trends[v][date_str] = {
                    "real": item["real"],
                    "obj": item["obj"],
                    "pct": pct,
                    "encours": item.get("encours", 0)
                }
                
            for item in quali_list:
                v = item["vendeur"].strip()
                if not v or v.upper() == 'AUTRE':
                    continue
                if allowed_vendeurs_set is not None and v.upper() not in allowed_vendeurs_set:
                    continue
                
                if v not in quali_trends:
                    quali_trends[v] = {}
                    
                quali_trends[v][date_str] = {
                    "clt_programme": item.get("clt_programme", 0),
                    "clt_facture": item.get("clt_facture", 0),
                    "acm": round(item.get("acm", 0.0) * 100, 1),
                    "tsm": round(item.get("tsm", 0.0) * 100, 1),
                    "line": round(item.get("line", 0.0) * 100, 1) if item.get("line") is not None else 0.0,
                    "raf_tsm": item.get("raf_tsm", 0),
                    "raf_acm": item.get("raf_acm", 0)
                }
                
        # Fill missing dates with 0s for each vendeur
        sorted_dates = sorted(list(set(dates)))
        formatted_trends = {}
        formatted_quali = {}
        
        for v in vendeurs_set:
            v_data = []
            v_quali = []
            for d in sorted_dates:
                # Quantitative
                if d in trends.get(v, {}):
                    v_data.append({
                        "date": d,
                        "real": trends[v][d]["real"],
                        "obj": trends[v][d]["obj"],
                        "pct": trends[v][d]["pct"],
                        "encours": trends[v][d]["encours"]
                    })
                else:
                    v_data.append({
                        "date": d,
                        "real": 0,
                        "obj": 0,
                        "pct": 0,
                        "encours": 0
                    })
                
                # Qualitative
                if v in quali_trends and d in quali_trends[v]:
                    v_quali.append({
                        "date": d,
                        "clt_programme": quali_trends[v][d]["clt_programme"],
                        "clt_facture": quali_trends[v][d]["clt_facture"],
                        "acm": quali_trends[v][d]["acm"],
                        "tsm": quali_trends[v][d]["tsm"],
                        "line": quali_trends[v][d]["line"],
                        "raf_tsm": quali_trends[v][d]["raf_tsm"],
                        "raf_acm": quali_trends[v][d]["raf_acm"]
                    })
                else:
                    v_quali.append({
                        "date": d,
                        "clt_programme": 0,
                        "clt_facture": 0,
                        "acm": 0.0,
                        "tsm": 0.0,
                        "line": 0.0,
                        "raf_tsm": 0,
                        "raf_acm": 0
                    })
            formatted_trends[v] = v_data
            formatted_quali[v] = v_quali
            
        # Get all distinct families for the dropdown (excluding empty)
        all_families = set()
        for r in records:
            quanti = r["data"].get("quantitative", [])
            for item in quanti:
                fam = item["famille"].strip()
                if fam:
                    all_families.add(fam)
                    
        return jsonify({
            "status": "success",
            "dates": sorted_dates,
            "vendeurs": sorted(list(vendeurs_set)),
            "families": sorted(list(all_families)),
            "trends": formatted_trends,
            "qualitative_trends": formatted_quali
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500
@app.route("/api/reload-check", methods=["GET"])
def reload_check():
    import os
    paths = ["templates", "static"]
    max_mtime = 0
    for path in paths:
        if os.path.exists(path):
            for root, dirs, files in os.walk(path):
                for file in files:
                    fp = os.path.join(root, file)
                    try:
                        mtime = os.path.getmtime(fp)
                        if mtime > max_mtime:
                            max_mtime = mtime
                    except OSError:
                        pass
    return jsonify({"last_modified": max_mtime})

@app.route("/api/config", methods=["GET"])
def get_app_config():
    try:
        config = load_config()
        return jsonify({"status": "success", "config": config})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

@app.route("/api/config", methods=["POST"])
def post_app_config():
    try:
        req_data = request.get_json() or {}
        config = load_config()
        
        # Update keys if present
        if "rest_days" in req_data:
            config["rest_days"] = int(req_data["rest_days"])
        if "exclude_families" in req_data:
            config["exclude_families"] = req_data["exclude_families"]
        if "theme" in req_data:
            config["theme"] = req_data["theme"]
        if "light_mode" in req_data:
            config["light_mode"] = bool(req_data["light_mode"])
        if "excluded_dates" in req_data:
            config["excluded_dates"] = req_data["excluded_dates"]
            
        save_config(config)
        return jsonify({"status": "success", "config": config})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500

# ------------------------------------------------------------------
# Client (full list with duplicates) API endpoints
# ------------------------------------------------------------------

def _parse_csv_list(value):
    """Convert a comma-separated query-string value into a clean list."""
    if value is None:
        return None
    if isinstance(value, list):
        return [v for v in value if v]
    return [v.strip() for v in str(value).split(",") if v.strip()]


@app.route("/api/clients_full", methods=["GET"])
def list_clients_full():
    try:
        search = request.args.get("search", "").strip() or None
        secteurs = _parse_csv_list(request.args.get("secteurs"))
        localites = _parse_csv_list(request.args.get("localites"))
        vendeurs_som = _parse_csv_list(request.args.get("vendeurs_som"))
        vendeurs_vmm = _parse_csv_list(request.args.get("vendeurs_vmm"))
        is_repeat_raw = request.args.get("is_repeat")
        if is_repeat_raw is None or is_repeat_raw == "":
            is_repeat = None
        else:
            is_repeat = is_repeat_raw in ("1", "true", "True", "yes", "oui", "OUI")
        unique_raw = request.args.get("unique")
        unique = unique_raw in ("1", "true", "True", "yes", "oui", "OUI") if unique_raw else False
        sort_by = request.args.get("sort_by", "row_index")
        sort_dir = request.args.get("sort_dir", "ASC")
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 25))

        result = db_manager.get_clients_full(
            search=search,
            secteurs=secteurs,
            localites=localites,
            vendeurs_som=vendeurs_som,
            vendeurs_vmm=vendeurs_vmm,
            is_repeat=is_repeat,
            unique=unique,
            sort_by=sort_by,
            sort_dir=sort_dir,
            page=page,
            per_page=per_page,
        )
        return jsonify({"status": "success", **result})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/clients_full/filters", methods=["GET"])
def clients_full_filters():
    try:
        return jsonify({
            "status": "success",
            "filters": db_manager.get_clients_full_filters(),
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/clients_full/stats", methods=["GET"])
def clients_full_stats():
    try:
        return jsonify({
            "status": "success",
            "stats": db_manager.get_clients_full_stats(),
        })
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/clients_full/export", methods=["GET"])
def clients_full_export():
    """Export the (filtered) clients_full list to CSV."""
    try:
        import csv
        import io

        search = request.args.get("search", "").strip() or None
        secteurs = _parse_csv_list(request.args.get("secteurs"))
        localites = _parse_csv_list(request.args.get("localites"))
        vendeurs_som = _parse_csv_list(request.args.get("vendeurs_som"))
        vendeurs_vmm = _parse_csv_list(request.args.get("vendeurs_vmm"))
        is_repeat_raw = request.args.get("is_repeat")
        if is_repeat_raw is None or is_repeat_raw == "":
            is_repeat = None
        else:
            is_repeat = is_repeat_raw in ("1", "true", "True", "yes", "oui", "OUI")

        # Pull every row that matches (server-side paginated internally
        # with a large per_page to keep things simple)
        result = db_manager.get_clients_full(
            search=search,
            secteurs=secteurs,
            localites=localites,
            vendeurs_som=vendeurs_som,
            vendeurs_vmm=vendeurs_vmm,
            is_repeat=is_repeat,
            sort_by="row_index",
            sort_dir="ASC",
            page=1,
            per_page=10000,
        )

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Code", "Nom", "Secteur", "Localité",
            "Vendeur SOM", "Vendeur VMM",
        ])
        for r in result["rows"]:
            writer.writerow([
                r["code"],
                r["name"],
                r["secteur"],
                r["localite"],
                r["vendeur_som"],
                r["vendeur_vmm"],
            ])

        from flask import Response
        return Response(
            buf.getvalue(),
            mimetype="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": 'attachment; filename="clients_full.csv"'
            },
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/vendeurs", methods=["GET"])
def get_vendeurs_list():
    try:
        date = request.args.get("date", "default")
        category = request.args.get("category", "All")
        
        # 1. Get sellers from fdv roster
        fdv_list = db_manager.get_fdv_list()
        vendeurs_list = [r["vendeur"].strip() for r in fdv_list]
        
        # 2. Get sellers from quantitative data for specific date
        if date and date != "default":
            quant_data = db_manager.get_quantitative_data(date)
        else:
            processor = get_processor()
            data = processor.get_data()
            quant_data = data.get("quantitative", [])
            
        data_vendeurs = [r["vendeur"].strip() for r in quant_data if r.get("vendeur")]
        
        # Combine
        combined_vendeurs = list(set(vendeurs_list + data_vendeurs))
        
        # Apply category filter if specified
        if category and category != "All":
            allowed_vendeurs = get_categorie(category)
            if not isinstance(allowed_vendeurs, list):
                allowed_vendeurs = [allowed_vendeurs]
            allowed_vendeurs_set = {v.strip().upper() for v in allowed_vendeurs if v}
            combined_vendeurs = [v for v in combined_vendeurs if v.upper() in allowed_vendeurs_set]
            
            # Make sure the CDZ itself is included if they are in the allowed category list
            for cdz_name in ["CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA"]:
                if cdz_name in allowed_vendeurs_set and cdz_name not in combined_vendeurs:
                    combined_vendeurs.append(cdz_name)
        else:
            # If category is "All", ensure CDZ names are present
            for cdz_name in ["CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA"]:
                if cdz_name not in combined_vendeurs:
                    combined_vendeurs.append(cdz_name)
                    
        vendeurs_list = sorted(list(set(combined_vendeurs)))
        return jsonify({"status": "success", "vendeurs": vendeurs_list})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

# ------------------------------------------------------------------
# FDV (Force De Vente) API
# ------------------------------------------------------------------

@app.route("/fdv")
def fdv_page():
    config = load_config()
    theme = config.get("theme", "theme-1")
    light_mode = config.get("light_mode", False)
    return render_template(
        "index.html", theme=theme, light_mode=light_mode, active_tab="fdv"
    )


@app.route("/api/fdv", methods=["GET"])
def api_fdv_list():
    try:
        search = request.args.get("search", "").strip() or None
        vendeur = request.args.get("vendeur", "").strip() or None
        secteur = request.args.get("secteur", "").strip() or None
        activite = request.args.get("activite", "").strip() or None
        role = request.args.get("role", "").strip() or None
        type_role = request.args.get("type_role", "").strip() or None
        cdz = request.args.get("cdz", "").strip() or None
        sort_by = request.args.get("sort_by", "vendeur")
        sort_dir = request.args.get("sort_dir", "ASC")

        # If a specific vendeur is requested, return at most that one
        # row. Use a precise search so a partial match (e.g. typing
        # just the name) still works.
        if vendeur:
            search = vendeur

        rows = db_manager.get_fdv_list(
            search=search, secteur=secteur, activite=activite,
            role=role, type_role=type_role, cdz=cdz,
            sort_by=sort_by, sort_dir=sort_dir,
        )
        # Augment with a parsed `code` + `name` for the UI.
        for r in rows:
            code, name = db_manager.parse_vendeur_code(r["vendeur"])
            r["code"] = code
            r["name"] = name
            r["etat"] = r.get("activite") or "ACTIF"
        return jsonify({"status": "success", "rows": rows, "total": len(rows)})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/fdv", methods=["POST"])
def api_fdv_create():
    try:
        data = request.get_json(silent=True) or {}
        vendeur = (data.get("vendeur") or "").strip()
        if not vendeur:
            return jsonify({"status": "error", "message": "Le nom du vendeur est obligatoire."}), 400
        # Normalize the État label.
        if "etat" in data and "activite" not in data:
            data["activite"] = db_manager.normalize_etat(data.get("etat"))
        if "activite" in data:
            data["activite"] = db_manager.normalize_etat(data.get("activite"))
        if db_manager.get_fdv_by_vendeur(vendeur):
            return jsonify({"status": "error", "message": f"'{vendeur}' existe déjà."}), 409
        new_id = db_manager.create_fdv(data)
        row = db_manager.get_fdv_by_id(new_id)
        if row:
            code, name = db_manager.parse_vendeur_code(row["vendeur"])
            row["code"], row["name"] = code, name
            row["etat"] = row.get("activite") or "ACTIF"
        return jsonify({"status": "success", "fdv": row})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/fdv/<int:fdv_id>", methods=["GET"])
def api_fdv_get(fdv_id):
    row = db_manager.get_fdv_by_id(fdv_id)
    if not row:
        return jsonify({"status": "error", "message": "Vendeur introuvable."}), 404
    code, name = db_manager.parse_vendeur_code(row["vendeur"])
    row["code"], row["name"] = code, name
    row["etat"] = row.get("activite") or "ACTIF"
    return jsonify({"status": "success", "fdv": row})


@app.route("/api/fdv/<int:fdv_id>", methods=["PUT", "PATCH"])
def api_fdv_update(fdv_id):
    try:
        data = request.get_json(silent=True) or {}
        if "etat" in data and "activite" not in data:
            data["activite"] = db_manager.normalize_etat(data.get("etat"))
        if "activite" in data:
            data["activite"] = db_manager.normalize_etat(data.get("activite"))
        ok = db_manager.update_fdv(fdv_id, data)
        if not ok:
            return jsonify({"status": "error", "message": "Vendeur introuvable."}), 404
        row = db_manager.get_fdv_by_id(fdv_id)
        code, name = db_manager.parse_vendeur_code(row["vendeur"])
        row["code"], row["name"] = code, name
        row["etat"] = row.get("activite") or "ACTIF"
        return jsonify({"status": "success", "fdv": row})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/fdv/<int:fdv_id>", methods=["DELETE"])
def api_fdv_delete(fdv_id):
    try:
        ok = db_manager.delete_fdv(fdv_id)
        if not ok:
            return jsonify({"status": "error", "message": "Vendeur introuvable."}), 404
        return jsonify({"status": "success"})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/fdv/filters", methods=["GET"])
def api_fdv_filters():
    return jsonify({
        "status": "success",
        "filters": db_manager.get_fdv_filters(),
        "etat_options": db_manager.ETAT_OPTIONS,
        "activite_options": db_manager.ACTIVITE_OPTIONS,
        "type_role_options": db_manager.TYPE_ROLE_OPTIONS,
    })


@app.route("/api/fdv/stats", methods=["GET"])
def api_fdv_stats():
    return jsonify({
        "status": "success",
        "stats": db_manager.get_fdv_stats(),
        "etat_options": db_manager.ETAT_OPTIONS,
    })


@app.route("/api/fdv/seed", methods=["POST"])
def api_fdv_seed():
    """Re-run the phone-book seed (idempotent)."""
    try:
        from seed_fdv import PHONE_BOOK, SECTEUR_MAP, ROLE_MAP, DEFAULT_ROLE
        created = updated = 0
        for vendeur, phone in PHONE_BOOK.items():
            existing = db_manager.get_fdv_by_vendeur(vendeur)
            data = {
                "vendeur": vendeur,
                "role": ROLE_MAP.get(vendeur, DEFAULT_ROLE),
                "type_role": existing.get("type_role", "") if existing else "",
                "activite": "ACTIF",
                "secteur": SECTEUR_MAP.get(vendeur, ""),
                "telephone": phone,
                "whatsapp": phone,
                "recrutement": existing.get("recrutement", "") if existing else "",
                "notes": existing.get("notes", "") if existing else "",
            }
            if existing:
                db_manager.update_fdv(existing["id"], data)
                updated += 1
            else:
                db_manager.create_fdv(data)
                created += 1
        return jsonify({"status": "success", "created": created, "updated": updated})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


def _build_rapport_text(vendeur, data_or_md):
    """Strip the markdown report down to a WhatsApp-friendly
    short summary, or format a beautiful and structured text from summary_data.
    """
    if not data_or_md:
        return (
            f"Bonjour {vendeur},\n\n"
            f"Voici votre rapport de performance pour la période en cours.\n"
            f"Bonne continuation !\n\n— KPI Analytics"
        )

    if isinstance(data_or_md, str):
        # Collapse the long markdown report to a short WhatsApp message.
        import re
        # Drop the table separators and noisy rules.
        text = re.sub(r"^\s*\|?[\s:|-]+\|?\s*$", "", data_or_md, flags=re.MULTILINE)
        text = re.sub(r"\n{3,}", "\n\n", text).strip()

        # Find the headline numbers.
        import re as _re
        m_real  = _re.search(r"Chiffre d'Affaires Réel.*?:\**\s*([\d\s,]+)\s*MAD", text)
        m_obj   = _re.search(r"Objectif de Chiffre d'Affaires.*?:\**\s*([\d\s,]+)\s*MAD", text)
        m_rate  = _re.search(r"Taux d'Atteinte\s*:\**\s*([+\-\d.,]+%?)", text)
        m_rank  = _re.search(r"est \*\*#(\d+) sur (\d+) vendeurs\*\*", text)
        m_verd  = _re.search(r"Verdict\s*:\**\s*([^\n]+)", text)

        parts = [f"📊 *Rapport de performance — {vendeur}*", ""]
        if m_real and m_obj and m_rate:
            parts.append(f"• CA Réalisé : {m_real.group(1).strip()} MAD")
            parts.append(f"• Objectif   : {m_obj.group(1).strip()} MAD")
            parts.append(f"• Taux       : {m_rate.group(1).strip()}")
        if m_rank:
            parts.append(f"• Classement : #{m_rank.group(1)} / {m_rank.group(2)} vendeurs")
        if m_verd:
            v = m_verd.group(1).replace("*", "").strip()
            parts.append(f"• {v}")
        parts.append("")
        parts.append("Rapport complet disponible sur demande.")
        parts.append("— KPI Analytics")
        return "\n".join(parts)

    # Build from structured data
    summary_data = data_or_md
    
    workdays = summary_data.get("workdays", {})
    elapsed = workdays.get("elapsed", 0)
    total = workdays.get("total", 0)
    rest = workdays.get("rest", 0)
    
    agency_totals = summary_data.get("agency_totals", {})
    real_ca = agency_totals.get("total_real_ca_ttc", 0) or agency_totals.get("total_real_ca_ht", 0)
    prorated_obj_ca = agency_totals.get("total_obj_ca_ttc", 0) or agency_totals.get("total_obj_ca_ht", 0)
    rate = agency_totals.get("achievement_rate_ca", "0%")
    variance = agency_totals.get("variance_rate_ca", "0%")

    # Compute full month objective and correct RAF
    # stored obj is prorated for elapsed days; scale back to full month
    full_month_obj_ca = prorated_obj_ca * total / elapsed if elapsed > 0 else prorated_obj_ca
    total_raf = max(0, full_month_obj_ca - real_ca)
    raf_per_day = total_raf / rest if rest > 0 else 0
    
    # Positioning
    pos = summary_data.get("positioning", {})
    rank_text = ""
    verdict_text = ""
    if pos:
        rank = pos.get("rank")
        tot_sellers = pos.get("total_sellers")
        ecart = pos.get("ecart_vs_moyenne", "0%")
        rank_text = f"• *Classement :* #{rank} sur {tot_sellers} vendeurs (Écart vs Moyenne : {ecart})\n"
        
        ecart_val = pos.get("ecart_vs_moyenne_float", 0)
        if ecart_val > 5:
            verdict_text = "• *Verdict :* En avance sur la moyenne agence. Bon travail !"
        elif ecart_val < -5:
            verdict_text = "• *Verdict :* En retard sur la moyenne agence. Effort requis !"
        else:
            verdict_text = "• *Verdict :* Dans la moyenne de l'agence."
            
    # Families breakdown table (Monospaced for WhatsApp)
    fam_lines = [
        "```",
        "FAMILLE   | RÉEL    | OBJ.    | %",
        "----------|---------|---------|----"
    ]
    ca_item = None
    for f in families_performance:
        fam_name = f.get("famille", "").strip()
        if fam_name.upper() in ("C.A (HT)", "C.A (HT) TOTAL", "TOTAL", "C.A (TTC)", "C.A (TTC) TOTAL"):
            ca_item = f
            continue
        
        display_name = fam_name[:9] if len(fam_name) > 9 else fam_name
        name_fmt = display_name.ljust(9)
        
        real_val = f.get("real", 0)
        obj_val = f.get("obj", 0)
        pct = f.get("pct", 0)
        ach_rate = pct + 100.0 if obj_val > 0 else 0.0
        
        real_str = f"{real_val:,}".replace(",", " ").rjust(8)
        obj_str = f"{obj_val:,}".replace(",", " ").rjust(8)
        pct_str = f"{int(round(ach_rate))}%".rjust(4)
        
        fam_lines.append(f"{name_fmt} |{real_str} |{obj_str} |{pct_str}")
        
    if ca_item:
        fam_lines.append("----------|---------|---------|----")
        name_fmt = "C.A (ttc)".ljust(9)
        real_val = ca_item.get("real", 0)
        obj_val = ca_item.get("obj", 0)
        pct = ca_item.get("pct", 0)
        ach_rate = pct + 100.0 if obj_val > 0 else 0.0
        
        real_str = f"{real_val:,}".replace(",", " ").rjust(8)
        obj_str = f"{obj_val:,}".replace(",", " ").rjust(8)
        pct_str = f"{int(round(ach_rate))}%".rjust(4)
        fam_lines.append(f"{name_fmt} |{real_str} |{obj_str} |{pct_str}")
        
    fam_lines.append("```")
    fam_section = "\n".join(fam_lines) if families_performance else "Aucune famille de produits."
    
    # Qualitative metrics table (Monospaced for WhatsApp)
    vq = summary_data.get("vendeur_qualitative", {})
    quali_text = ""
    if vq:
        clt_prog = vq.get("clt_programme", 0)
        clt_fact = vq.get("clt_facture", 0)
        acm = vq.get("acm", "0%")
        tsm = vq.get("tsm", "0%")
        line = vq.get("line", "-")
        raf_acm = vq.get("raf_acm", 0)
        raf_tsm = vq.get("raf_tsm", 0)
        
        tsm_val = 0.0
        try:
            tsm_val = float(tsm.replace("%", "")) / 100.0
        except ValueError:
            pass
        real_tsm = int(round(clt_fact * tsm_val))
        
        line_str = line
        if isinstance(line, (int, float)):
            line_str = f"{line * 100:.1f}%"
            
        quali_lines = [
            "```",
            "METRIQUE   | RÉEL | OBJ. | %",
            "-----------|------|------|------",
            f"Visites    | {clt_fact:4d} | {clt_prog:4d} | {acm:>5s}",
            f"Commandes  | {real_tsm:4d} | {clt_fact:4d} | {tsm:>5s}",
            f"LINE       |    - |    - | {line_str:>5s}",
            "```",
            f"• *RAF Couverture (ACM) :* {raf_acm} clients",
            f"• *RAF Commandes (TSM) :* {raf_tsm} commandes"
        ]
        quali_text = "\n".join(quali_lines)
        
    # Focus Products
    focus_bullets = []
    focus_vmm = summary_data.get("focus_vmm_summary", [])
    focus_som = summary_data.get("focus_som_summary", [])
    
    # Tomate Frito VMM
    vmm_realised = 0
    vmm_obj = 0
    vmm_pct = "0%"
    has_vmm = False
    for f in focus_vmm:
        if f.get("vendeur", "").strip().upper() == vendeur.strip().upper() or f.get("vendeur", "").strip().upper() != "AUTRE":
            vmm_realised = f.get("realise", 0)
            vmm_obj = f.get("obj_acm", 0)
            vmm_pct = f.get("percent", "0%")
            has_vmm = True
            break
    if has_vmm:
        vmm_achieved = False
        try:
            if float(vmm_pct.replace("%", "")) >= 100.0:
                vmm_achieved = True
        except ValueError:
            pass
        vmm_icon = "✅" if vmm_achieved else "🍅"
        focus_bullets.append(f"• {vmm_icon} *Focus Tomate Frito (VMM) :* {vmm_pct} ({vmm_realised:,.0f} / {vmm_obj:,.0f} ACM)")
        
    # Glace SOM
    som_realised = 0
    som_obj = 0
    som_pct = "0%"
    has_som = False
    for f in focus_som:
        if f.get("vendeur", "").strip().upper() == vendeur.strip().upper() or f.get("vendeur", "").strip().upper() != "AUTRE":
            som_realised = f.get("realise", 0)
            som_obj = f.get("ttc", 0)
            som_pct = f.get("percent", "0%")
            has_som = True
            break
    if has_som:
        som_achieved = False
        try:
            if float(som_pct.replace("%", "")) >= 100.0:
                som_achieved = True
        except ValueError:
            pass
        som_icon = "✅" if som_achieved else "🍦"
        focus_bullets.append(f"• {som_icon} *Focus Glace (SOM) :* {som_pct} ({som_realised:,.0f} / {som_obj:,.0f} MAD)")
        
    focus_section = ""
    if focus_bullets:
        focus_section = "\n*🎯 SUIVI DES PRODUITS FOCUS*\n" + "\n".join(focus_bullets)
        
    # Assemble message
    parts = [
        f"📊 *RAPPORT DE PERFORMANCE AI — {vendeur}*",
        f"📅 *Période :* En cours ({elapsed}j écoulés sur {total}j, reste {rest}j)",
        "",
        "*📈 CHIFFRE D'AFFAIRES GLOBAL*",
        f"• *CA Réalisé :* {real_ca:,.0f} MAD",
        f"• *Objectif Mensuel :* {full_month_obj_ca:,.0f} MAD",
        f"• *Taux d'Atteinte :* {rate} (Écart : {variance})",
        f"• *Reste à Faire (RAF) :* {total_raf:,.0f} MAD",
        f"• *🎯 Objectif Quotidien :* *{raf_per_day:,.0f} MAD / jour* pour les {rest} jours restants.",
        ""
    ]
    
    if rank_text or verdict_text:
        parts.extend([
            "*🏆 CLASSEMENT & POSITIONNEMENT*",
            (rank_text + verdict_text).strip(),
            ""
        ])
        
    parts.extend([
        "*📦 PERFORMANCE PAR FAMILLE*",
        fam_section,
        ""
    ])
    
    if quali_text:
        parts.extend([
            "*📋 INDICATEURS QUALITATIFS*",
            quali_text,
            ""
        ])
        
    if focus_section:
        parts.extend([
            focus_section,
            ""
        ])
        
    parts.extend([
        "*💡 PLAN D'ACTION CONCRET RECOMMANDE*",
        f"1. Visiter vos clients pour atteindre l'objectif de couverture (ACM).",
        f"2. Proposer toutes les familles de produits à chaque visite pour booster le TSM.",
        f"3. Concentrer vos efforts sur les familles en retard pour combler le Reste à Faire (RAF).",
        f"4. Suivre quotidiennement l'objectif de *{raf_per_day:,.0f} MAD/jour*.",
        "",
        f"Bonne chance pour les {rest} jours restants ! 💪",
        "— KPI Analytics"
    ])
    
    return "\n".join(parts)


@app.route("/api/fdv/whatsapp_link", methods=["POST", "GET"])
def api_fdv_whatsapp_link():
    """Build a wa.me link for a vendeur with a pre-filled message.

    Request body (JSON, POST) or query string (GET):
        { "id": 12, "include_rapport": true }
        or
        { "vendeur": "E14 BOUMDIANE MOHAMED", "include_rapport": true }

    When `include_rapport` is true, the message is the
    WhatsApp-friendly summary of the latest AI rapport for that
    vendeur. Otherwise a short generic message is used.
    """
    try:
        if request.method == "POST":
            data = request.get_json(silent=True) or {}
        else:
            data = request.args.to_dict()

        fdv_id = data.get("id")
        vendeur = data.get("vendeur")
        include_rapport = str(data.get("include_rapport", "true")).lower() in (
            "1", "true", "yes", "oui"
        )

        row = None
        if fdv_id:
            row = db_manager.get_fdv_by_id(int(fdv_id))
        elif vendeur:
            row = db_manager.get_fdv_by_vendeur(vendeur)

        if not row:
            return jsonify({"status": "error", "message": "Vendeur introuvable."}), 404

        phone = row.get("whatsapp") or row.get("telephone")
        url = db_manager.build_whatsapp_url(phone, "Bonjour")
        if not url:
            return jsonify({"status": "error", "message": "Numéro WhatsApp manquant."}), 400

        message = None
        rapport_used = False
        if include_rapport:
            try:
                rapport, summary_data = generate_report(
                    vendeur=row["vendeur"], date="default", options=None, return_data=True
                )
                message = _build_rapport_text(row["vendeur"], summary_data)
                rapport_used = True
            except Exception as ex:
                import traceback
                traceback.print_exc()
                # Fall back to a short generic message.
                message = (
                    f"Bonjour {row['vendeur']},\n\n"
                    f"Votre rapport de performance est prêt.\n"
                    f"Bonne continuation !\n\n— KPI Analytics"
                )
        else:
            message = (
                f"Bonjour {row['vendeur']},\n\n"
                f"Voici votre rapport de performance pour la période en cours.\n"
                f"Bonne continuation !\n\n— KPI Analytics"
            )

        url = db_manager.build_whatsapp_url(phone, message)
        clean_phone = phone
        if clean_phone and clean_phone.strip().startswith("+"):
            clean_phone = clean_phone.strip().lstrip("+")
        return jsonify({
            "status": "success",
            "url": url,
            "phone": clean_phone,
            "vendeur": row["vendeur"],
            "message": message,
            "rapport_used": rapport_used,
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


# ------------------------------------------------------------------
# ------------------------------------------------------------------
# Google Sheet Daily Terrain Data Integration
# ------------------------------------------------------------------

GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/17Q3DoTjLdGwAmztk3LWaC2Z69_ZrGYlAsLHXTusrHIk/export?format=csv"

def get_suivi_terrain_data():
    import urllib.request
    import csv
    import io
    import time
    import json
    
    cache_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "terrain_cache.json")
    
    now = time.time()
    if os.path.exists(cache_path):
        try:
            mtime = os.path.getmtime(cache_path)
            if now - mtime < 300: # 5 minutes cache
                with open(cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            print("Error reading terrain cache:", e)
            
    try:
        req = urllib.request.Request(
            GOOGLE_SHEET_CSV_URL, 
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            csv_data = response.read().decode('utf-8')
            
        reader = csv.DictReader(io.StringIO(csv_data))
        records = []
        for row in reader:
            cleaned_row = {}
            for k, v in row.items():
                if not k:
                    continue
                k_clean = k.strip()
                v_clean = v.strip() if v else ""
                
                # Normalize key names
                if "timestamp" in k_clean.lower():
                    key = "timestamp"
                elif "tomate" in k_clean.lower():
                    key = "tomate_frito"
                elif "glass" in k_clean.lower() or "glace" in k_clean.lower():
                    key = "glass_ca"
                elif "activit" in k_clean.lower() or "activ" in k_clean.lower():
                    key = "activite"
                elif "vendeur" in k_clean.lower():
                    key = "vendeur"
                elif "date" in k_clean.lower():
                    key = "date"
                elif "realisation" in k_clean.lower() or ("ca" in k_clean.lower() and "glass" not in k_clean.lower()):
                    key = "realisation_ca"
                elif k_clean.lower() == "bl":
                    key = "bl"
                else:
                    key = k_clean.lower().replace(" ", "_")
                
                # Convert values
                if key in ["realisation_ca", "bl"]:
                    try:
                        cleaned_row[key] = int(float(v_clean)) if v_clean else 0
                    except:
                        cleaned_row[key] = 0
                elif key in ["tomate_frito", "glass_ca"]:
                    try:
                        cleaned_row[key] = float(v_clean) if v_clean else 0.0
                    except:
                        cleaned_row[key] = 0.0
                else:
                    cleaned_row[key] = v_clean
            
            # Only append if we got a valid record (must have Date and Vendeur)
            if cleaned_row.get("date") and cleaned_row.get("vendeur"):
                records.append(cleaned_row)
            
        # Write to cache
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(records, f, ensure_ascii=False, indent=4)
            
        return records
    except Exception as e:
        print("Error fetching Google Sheet:", e)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    return json.load(f)
            except:
                pass
        return []

@app.route("/terrain")
def terrain_page():
    config = load_config()
    theme = config.get("theme", "theme-1")
    light_mode = config.get("light_mode", False)
    return render_template("index.html", theme=theme, light_mode=light_mode, active_tab="terrain")

@app.route("/api/terrain")
def api_terrain_data():
    records = get_suivi_terrain_data()
    return jsonify({"status": "success", "data": records})

@app.route("/api/terrain/refresh", methods=["POST"])
def api_terrain_refresh():
    cache_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "terrain_cache.json")
    if os.path.exists(cache_path):
        try:
            os.remove(cache_path)
        except Exception as e:
            return jsonify({"status": "error", "message": f"Failed to clear cache: {e}"}), 500
    records = get_suivi_terrain_data()
    return jsonify({"status": "success", "data": records})


# Agent monitor (standalone HTML)
# ------------------------------------------------------------------

@app.route("/agent-monitor")
def agent_monitor_page():
    """Serve the standalone agent-monitor.html from the project root."""
    return send_file_or_404("agent-monitor.html")


def send_file_or_404(filename):
    root = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(root, filename)
    if not os.path.exists(path):
        from flask import abort
        abort(404)
    from flask import send_file
    return send_file(path)


# ------------------------------------------------------------------
# Focus Excel Parsing Helpers
# ------------------------------------------------------------------

def import_focus_objectives_file(filepath="Focus.xlsx"):
    """Parse Focus.xlsx and return list of objectives dicts"""
    try:
        xl = pd.ExcelFile(filepath)
        objectives = []
        
        # Focus VMM (Tomate Frito)
        if "Focus VMM" in xl.sheet_names:
            df = xl.parse("Focus VMM")
            for _, row in df.iterrows():
                vendeur = str(row.get("Vendeur") or "").strip()
                if not vendeur or vendeur.lower() == "nan":
                    continue
                objectives.append({
                    "focus_type": "TOMATE_FRITO",
                    "vendeur": vendeur,
                    "secteur": str(row.get("TOMATE FRITO") or "").strip(),
                    "number_client": int(row.get("Number Client") or 0) if pd.notna(row.get("Number Client")) else 0,
                    "obj_acm": float(row.get("OBJ ACM") or 0.0) if pd.notna(row.get("OBJ ACM")) else 0.0,
                    "obj_juin": float(row.get("OBJ JUIN") or 0.0) if pd.notna(row.get("OBJ JUIN")) else 0.0,
                })
                
        # Focus SOM (Glace)
        if "Focus SOM" in xl.sheet_names:
            df = xl.parse("Focus SOM")
            for _, row in df.iterrows():
                vendeur = str(row.get("Vendeur") or "").strip()
                if not vendeur or vendeur.lower() == "nan":
                    continue
                objectives.append({
                    "focus_type": "GLACE",
                    "vendeur": vendeur,
                    "secteur": str(row.get("Secteur") or "").strip(),
                    "glace_ht": float(row.get("GLACE HT") or 0.0) if pd.notna(row.get("GLACE HT")) else 0.0,
                    "ttc": float(row.get("TTC") or 0.0) if pd.notna(row.get("TTC")) else 0.0,
                })
                
        return objectives
    except Exception as e:
        print(f"Error parsing objectives file: {e}")
        return []


def import_focus_rankings_file(filepath="focus2.xlsx", date_str=None):
    """Parse focus2.xlsx and return (upload_date, representative_rankings, cdz_rankings)"""
    try:
        with pd.ExcelFile(filepath) as xl:
            reps = []
            cdzs = []
            
            # 1. Parse Representative rankings for Glace
            if "CLASSEMENT DET GLACE" in xl.sheet_names:
                df = xl.parse("CLASSEMENT DET GLACE", header=7)
                df.columns = [c.strip() for c in df.columns]
                for _, row in df.iterrows():
                    rep = str(row.get("Repr\u00e9sentant") or "").strip()
                    if not rep or rep.lower() == "nan" or "repr" in rep.lower():
                        continue
                    agence = str(row.get("Agence") or "").strip()
                    if agence.upper() != "AGADIR":
                        continue
                    pct_col = [c for c in df.columns if '%' in c]
                    deviation = float(row.get(pct_col[0])) if pct_col and pd.notna(row.get(pct_col[0])) else 0.0
                    reps.append({
                        "focus_type": "GLACE",
                        "rank": int(row.get("CLASSEMENT") or 0) if pd.notna(row.get("CLASSEMENT")) else 0,
                        "agence": agence,
                        "secteur": str(row.get("Secteur") or "").strip(),
                        "representative": rep,
                        "deviation": deviation,
                        "cdz": str(row.get("CDZ") or "").strip()
                    })
                    
            # 2. Parse CDZ rankings for Glace
            if "CLASSEMENT CDZ GLACE" in xl.sheet_names:
                df = xl.parse("CLASSEMENT CDZ GLACE", header=8)
                df.columns = [c.strip() for c in df.columns]
                for _, row in df.iterrows():
                    cdz = str(row.get("CDZ") or "").strip()
                    if not cdz or cdz.lower() == "nan" or "cdz" in cdz.lower():
                        continue
                    agence = str(row.get("Agence") or "").strip()
                    if agence.upper() != "AGADIR":
                        continue
                    pct_col = [c for c in df.columns if '%' in c]
                    deviation = float(row.get(pct_col[0])) if pct_col and pd.notna(row.get(pct_col[0])) else 0.0
                    cdzs.append({
                        "focus_type": "GLACE",
                        "rank": int(row.get("CLASSEMENT") or 0) if pd.notna(row.get("CLASSEMENT")) else 0,
                        "cdz": cdz,
                        "agence": agence,
                        "deviation": deviation
                    })
                    
            # 3. Parse Representative rankings for Tomate Frito
            if "CLASSEMENT DET TOMATE FRITO" in xl.sheet_names:
                df = xl.parse("CLASSEMENT DET TOMATE FRITO", header=7)
                df.columns = [c.strip() for c in df.columns]
                for _, row in df.iterrows():
                    rep = str(row.get("Repr\u00e9sentant") or "").strip()
                    if not rep or rep.lower() == "nan" or "repr" in rep.lower():
                        continue
                    agence = str(row.get("Agence") or "").strip()
                    if agence.upper() != "AGADIR":
                        continue
                    pct_col = [c for c in df.columns if '%' in c]
                    deviation = float(row.get(pct_col[0])) if pct_col and pd.notna(row.get(pct_col[0])) else 0.0
                    reps.append({
                        "focus_type": "TOMATE_FRITO",
                        "rank": int(row.get("CLASSEMENT") or 0) if pd.notna(row.get("CLASSEMENT")) else 0,
                        "agence": agence,
                        "secteur": str(row.get("Secteur") or "").strip(),
                        "representative": rep,
                        "deviation": deviation,
                        "cdz": str(row.get("CDZ") or "").strip()
                    })
                    
            # 4. Parse CDZ rankings for Tomate Frito
            if "CLASSEMENT CDZ TOMATE FRITO" in xl.sheet_names:
                df = xl.parse("CLASSEMENT CDZ TOMATE FRITO", header=4)
                df.columns = [c.strip() for c in df.columns]
                for _, row in df.iterrows():
                    cdz = str(row.get("CDZ") or "").strip()
                    if not cdz or cdz.lower() == "nan" or "cdz" in cdz.lower():
                        continue
                    agence = str(row.get("Agence") or "").strip()
                    if agence.upper() != "AGADIR":
                        continue
                    pct_col = [c for c in df.columns if '%' in c]
                    deviation = float(row.get(pct_col[0])) if pct_col and pd.notna(row.get(pct_col[0])) else 0.0
                    cdzs.append({
                        "focus_type": "TOMATE_FRITO",
                        "rank": int(row.get("CLASSEMENT") or 0) if pd.notna(row.get("CLASSEMENT")) else 0,
                        "cdz": cdz,
                        "agence": agence,
                        "deviation": deviation
                    })
                    
            if not date_str:
                date_str = datetime.datetime.now().strftime("%Y-%m-%d")
            return date_str, reps, cdzs
    except Exception as e:
        print(f"Error parsing rankings file: {e}")
        return None, [], []


# ------------------------------------------------------------------
# Focus Page and API Routes
# ------------------------------------------------------------------

@app.route("/focus")
def focus_page():
    config = load_config()
    theme = config.get("theme", "theme-1")
    light_mode = config.get("light_mode", False)
    return render_template(
        "index.html", theme=theme, light_mode=light_mode, active_tab="focus"
    )


def save_focus_data_all(date_str, reps, cdzs):
    """Save rankings and calculate/populate focus_som_data and focus_vmm_data tables."""
    # 1. Save rankings
    db_manager.save_focus_rankings(date_str, reps)
    db_manager.save_focus_cdz_rankings(date_str, cdzs)
    
    # 2. Populate focus_som_data and focus_vmm_data
    conn = db_manager.get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT focus_type, vendeur, secteur, number_client, obj_acm, obj_juin, glace_ht, ttc FROM focus_objectives")
    objectives_rows = [dict(o) for o in cursor.fetchall()]
    
    cursor.execute("SELECT rest_days FROM settings WHERE date = ?", (date_str,))
    settings_row = cursor.fetchone()
    rest_days = settings_row[0] if settings_row else 20
    conn.close()

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

    focus_som_list = []
    focus_vmm_list = []

    for r in reps:
        ft = r['focus_type']
        rep = r['representative']
        code = rep.split()[0].upper() if rep else ""
        obj = objectives_by_type_code.get(ft, {}).get(code)
        
        dev = r['deviation'] or 0.0
        percent_val = 1.0 + dev
        
        if ft == 'GLACE':
            ttc_val = obj['ttc'] if obj else 0.0
            glace_ht_val = obj['glace_ht'] if obj else 0.0
            realise_val = round(percent_val * ttc_val, 2)
            rest_val = round(ttc_val - realise_val, 2)
            rest_jour_val = round(rest_val / rest_days, 2) if rest_days > 0 else 0.0
            
            focus_som_list.append({
                "vendeur": rep,
                "secteur": r['secteur'],
                "glace_ht": glace_ht_val,
                "ttc": ttc_val,
                "percent": percent_val,
                "realise": realise_val,
                "rest": rest_val,
                "rest_jour": rest_jour_val,
                "jour_rest": rest_days
            })
        elif ft == 'TOMATE_FRITO':
            obj_acm_val = obj['obj_acm'] if obj else 0.0
            obj_juin_val = obj['obj_juin'] if obj else 0.0
            nb_clients_val = obj['number_client'] if obj else 0
            realise_val = round(percent_val * obj_acm_val, 2)
            rest_val = round(obj_acm_val - realise_val, 2)
            rest_jour_val = round(rest_val / rest_days, 2) if rest_days > 0 else 0.0
            
            focus_vmm_list.append({
                "vendeur": rep,
                "secteur": r['secteur'],
                "dn_fin_mai": 0.0,
                "obj_juin": obj_juin_val,
                "nb_clients": nb_clients_val,
                "obj_acm": obj_acm_val,
                "percent": percent_val,
                "realise": realise_val,
                "rest": rest_val,
                "jour_rest": rest_days,
                "rest_jour": rest_jour_val
            })

    if focus_som_list:
        db_manager.save_focus_som_data(date_str, focus_som_list)
    if focus_vmm_list:
        db_manager.save_focus_vmm_data(date_str, focus_vmm_list)


@app.route("/api/focus/upload", methods=["POST"])
def upload_focus_rankings():
    try:
        if "file" not in request.files:
            return jsonify({"status": "error", "message": "Aucun fichier fourni dans la requête."}), 400
        file = request.files["file"]
        if file.filename == "":
            return jsonify({"status": "error", "message": "Nom de fichier vide."}), 400
            
        temp_path = "excel/temp_focus_upload.xlsx"
        os.makedirs("excel", exist_ok=True)
        file.save(temp_path)
        
        date_param = request.form.get("date", "").strip() or None
        date_str, reps, cdzs = import_focus_rankings_file(temp_path, date_str=date_param)
        
        if os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except Exception as e:
                print(f"Warning: could not remove temp file {temp_path}: {e}")
            
        if not reps:
            return jsonify({"status": "error", "message": "Aucune donnée de classement valide n'a pu être extraite."}), 400
            
        save_focus_data_all(date_str, reps, cdzs)
        
        return jsonify({
            "status": "success", 
            "message": f"Classement Focus importé avec succès pour la date {date_str}.",
            "upload_date": date_str,
            "rep_count": len(reps),
            "cdz_count": len(cdzs)
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/focus/data", methods=["GET"])
def get_focus_data_api():
    try:
        agence = request.args.get("agence", "AGADIR").strip().upper()
        upload_date = request.args.get("date", "").strip()
        
        if not upload_date:
            upload_date = db_manager.get_latest_focus_upload_date()
            
        if not upload_date:
            return jsonify({"status": "success", "data": None, "message": "Aucune donnée de classement focus disponible."})
            
        data = db_manager.get_focus_data(upload_date, agence)
        
        # Fetch workdays info for this date
        conn = db_manager.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT rest_days FROM settings WHERE date = ?", (upload_date,))
        row = cursor.fetchone()
        rest_days = row[0] if row else 20
        conn.close()
        
        workdays_info = db_manager.get_workdays_info(rest_days)
        
        return jsonify({
            "status": "success",
            "upload_date": upload_date,
            "agence": agence,
            "data": data,
            "workdays": workdays_info
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/focus/trend", methods=["GET"])
def get_focus_trend_api():
    try:
        agence = request.args.get("agence", "AGADIR").strip().upper()
        history = db_manager.get_focus_history(agence)
        
        # Fetch settings dictionary to get rest_days for each history date
        conn = db_manager.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT date, rest_days FROM settings")
        settings_data = {row["date"]: row["rest_days"] for row in cursor.fetchall()}
        conn.close()
        
        # Fetch total workdays
        workdays_info = db_manager.get_workdays_info(20)
        total_days = workdays_info.get("total", 24)
        
        return jsonify({
            "status": "success",
            "agence": agence,
            "data": history,
            "settings": settings_data,
            "total_days": total_days
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    db_manager.init_db()
    
    # Startup seeding for Focus objectives only
    try:
        conn = db_manager.get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM focus_objectives")
        objs_count = cursor.fetchone()[0]
        conn.close()
        
        if objs_count == 0:
            if os.path.exists("Focus.xlsx"):
                print("[STARTUP] Seeding focus objectives from Focus.xlsx...")
                objs = import_focus_objectives_file("Focus.xlsx")
                if objs:
                    db_manager.save_focus_objectives(objs)
                    print(f"[STARTUP] Seeded {len(objs)} focus objectives.")
    except Exception as e:
        print(f"[STARTUP ERROR] Seeding focus objectives failed: {e}")

    # Perform initial run to check if data is populated
    try:
        p = get_processor()
        p.get_day_work()
        p.fix_sheet()
    except Exception as e:
        print(f"Error during initial processing: {e}")
        
    app.run(host="127.0.0.1", port=5000, debug=True)
