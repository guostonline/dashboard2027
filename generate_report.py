import os
import json
import urllib.request
import sqlite3
from collections import defaultdict
from datetime import datetime
from dotenv import load_dotenv
from data_processor import ExcelProcessor, get_categorie

load_dotenv(override=True)

def get_db():
    import db_manager
    return db_manager.get_db_connection()

def get_visites_and_anomalies_data(allowed_sellers=None, date=None):
    """Fetch and calculate visit stats and anomalies from visites_rapports table."""
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        where_clauses = ["heure IS NOT NULL AND heure != ''"]
        params = []
        
        if date and date != "default":
            where_clauses.append("(date_visite = ? OR date_visite LIKE ?)")
            params.extend([date, f"%{date}%"])
            
        where_str = " WHERE " + " AND ".join(where_clauses)
        cursor.execute(f"""
            SELECT id, vendeur, date_visite, tournee, client_code, client_nom, heure, motif, note
            FROM visites_rapports
            {where_str}
            ORDER BY date_visite DESC, vendeur ASC, heure ASC
        """, params)
        rows = cursor.fetchall()

        # If date filter returned no rows, fallback to cumulative all-dates records
        if not rows and date and date != "default":
            cursor.execute("""
                SELECT id, vendeur, date_visite, tournee, client_code, client_nom, heure, motif, note
                FROM visites_rapports
                WHERE heure IS NOT NULL AND heure != ''
                ORDER BY date_visite DESC, vendeur ASC, heure ASC
            """)
            rows = cursor.fetchall()
            
        conn.close()
        
        # Filter by allowed_sellers if provided
        if allowed_sellers:
            allowed_upper = {s.strip().upper() for s in allowed_sellers if s}
            filtered_rows = []
            for r in rows:
                v = (r['vendeur'] or '').strip().upper()
                v_code = v.split(" ")[0] if " " in v else v
                if v in allowed_upper or any(s.startswith(v_code) for s in allowed_upper) or any(v.startswith(s.split(" ")[0]) for s in allowed_upper):
                    filtered_rows.append(r)
            rows = filtered_rows

        groups = defaultdict(list)
        for r in rows:
            v = (r['vendeur'] or '').strip()
            d = (r['date_visite'] or '').strip()
            groups[(v, d)].append(dict(r))

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
                c_code = (visit.get('client_code') or '').strip().upper()
                if c_code:
                    client_counts[c_code] += 1
                    if client_counts[c_code] == 2:
                        count_multiple += 1
                        seller_visit_stats[vendeur]["multiple"] += 1
                        seller_visit_stats[vendeur]["anomalies_count"] += 1

                h_str = visit.get('heure') or ''
                if ' - ' in h_str:
                    parts = h_str.split(' - ')
                    if len(parts) == 2:
                        try:
                            t1 = datetime.strptime(parts[0].strip(), '%H:%M:%S')
                            t2 = datetime.strptime(parts[1].strip(), '%H:%M:%S')
                            dur_secs = (t2 - t1).total_seconds()
                            if 0 < dur_secs < 180:
                                count_less_3min += 1
                                seller_visit_stats[vendeur]["less_3min"] += 1
                                seller_visit_stats[vendeur]["anomalies_count"] += 1
                        except:
                            pass

            if visits:
                h0 = visits[0].get('heure', '')
                if ' - ' in h0:
                    p0 = h0.split(' - ')[0].strip()
                    if p0 > '08:40:00':
                        count_first_late += 1
                        seller_visit_stats[vendeur]["first_late"] += 1
                        seller_visit_stats[vendeur]["anomalies_count"] += 1
                h_last = visits[-1].get('heure', '')
                if ' - ' in h_last:
                    p_last = h_last.split(' - ')[1].strip()
                    if p_last < '14:45:00':
                        count_last_early += 1
                        seller_visit_stats[vendeur]["last_early"] += 1
                        seller_visit_stats[vendeur]["anomalies_count"] += 1

        total_anomalies = count_less_3min + count_multiple + count_first_late + count_last_early

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
        print("Error fetching visites and anomalies:", e)
        return {
            "total_visites": 0,
            "total_anomalies": 0,
            "count_less_3min": 0,
            "count_multiple": 0,
            "count_first_late": 0,
            "count_last_early": 0,
            "reps_visites": []
        }

def get_terrain_orders_data(allowed_sellers=None):
    """Fetch field entries and commands from tracking table."""
    try:
        import app
        res = app.get_suivi_terrain_data()
        if isinstance(res, tuple):
            records = res[0]
        else:
            records = res or []
            
        if allowed_sellers:
            allowed_upper = {s.strip().upper() for s in allowed_sellers if s}
            filtered = []
            for r in records:
                v = (r.get("vendeur") or "").strip().upper()
                v_code = v.split(" ")[0] if " " in v else v
                if v in allowed_upper or any(s.startswith(v_code) for s in allowed_upper) or any(v.startswith(s.split(" ")[0]) for s in allowed_upper):
                    filtered.append(r)
            records = filtered

        total_orders = len(records)
        vendeur_counts = defaultdict(int)
        for r in records:
            v = r.get("vendeur") or "Inconnu"
            vendeur_counts[v] += 1

        reps_terrain = [{"vendeur": v, "commandes_count": c} for v, c in vendeur_counts.items()]
        reps_terrain.sort(key=lambda x: x["commandes_count"], reverse=True)

        return {
            "total_commandes_terrain": total_orders,
            "active_reps_count": len(reps_terrain),
            "reps_terrain": reps_terrain
        }
    except Exception as e:
        print("Error fetching terrain data:", e)
        return {
            "total_commandes_terrain": 0,
            "active_reps_count": 0,
            "reps_terrain": []
        }

def build_daily_sales_table(vendeur=None, category=None):
    try:
        import db_manager
        
        records = db_manager.get_all_suivi_data_records()
        if not records:
            return ""
            
        fdv_list = db_manager.get_fdv_list()
        db_sellers = {r["vendeur"].strip().upper() for r in fdv_list if r.get("cdz") in ("CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA")}
        
        if category and category != "All":
            allowed = get_categorie(category)
            if not isinstance(allowed, list):
                allowed = [allowed]
            allowed_set = {v.strip().upper() for v in allowed if v}.intersection(db_sellers)
        elif vendeur:
            allowed_set = {vendeur.strip().upper()}
        else:
            allowed_set = db_sellers
            
        date_sums = []
        records = sorted(records, key=lambda x: x["date"])
        
        for r in records:
            date_str = r["date"]
            quanti = r["data"].get("quantitative", [])
            quanti = [dict(i) if not isinstance(i, dict) else i for i in quanti]
            
            ca_records = [item for item in quanti if item["famille"].strip().upper() in ("C.A (HT)", "C.A (TTC)")]
            
            date_real = 0
            date_obj = 0
            for item in ca_records:
                v_name = item["vendeur"].strip().upper()
                if v_name in allowed_set:
                    date_real += item["real"]
                    date_obj += item["obj"]
                    
            date_sums.append((date_str, date_real, date_obj))
            
        daily_sales = []
        for i in range(len(date_sums)):
            date_str, real, obj = date_sums[i]
            
            if i == 0:
                is_first_legacy = (date_sums[0][0] == '2026-06-01' and len(date_sums) > 1)
                next_real = date_sums[1][1] if len(date_sums) > 1 else 0
                next_obj = date_sums[1][2] if len(date_sums) > 1 else 0
                
                daily_real = 0 if (is_first_legacy and real > next_real * 2) else real
                daily_obj = 0 if (is_first_legacy and obj > next_obj * 2) else obj
                daily_sales.append((date_str, daily_real, daily_obj))
            else:
                prev_str, prev_real, prev_obj = date_sums[i-1]
                d_real = real - prev_real
                daily_real = d_real if d_real >= 0 else real
                
                d_obj = obj - prev_obj
                daily_obj = d_obj if d_obj >= 0 else obj
                daily_sales.append((date_str, daily_real, daily_obj))
                
        table = "\n\n### Historique des Ventes Quotidiennes (Non cumulées)\n\n"
        table += "| Date | Ventes Réelles (DH) | Objectif du Jour (DH) |\n"
        table += "| :--- | :---: | :---: |\n"
        
        for date_str, daily_real, daily_obj in daily_sales:
            if date_str == '2026-06-01' and daily_real == 0:
                continue
            parts = date_str.split("-")
            formatted_date = f"{parts[2]}/{parts[1]}/{parts[0]}" if len(parts) == 3 else date_str
            table += f"| {formatted_date} | {daily_real:,.0f} | {daily_obj:,.0f} |\n"
            
        return table
    except Exception as e:
        print("Error building daily sales table:", e)
        return ""

def get_weekly_comparison_data(date=None, tax_mode="TTC", filter_vendeur=None, filter_cdz=None):
    """Calculate week-over-week performance comparison by CDZ team and vendor by vendor."""
    try:
        import db_manager
        from datetime import datetime, timedelta

        dates = db_manager.get_all_suivi_dates()
        if not dates:
            return {}
            
        cur_date = date if (date and date != "default") else dates[0]
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

        d_cur = db_manager.get_suivi_data(cur_date) or {}
        d_prev = db_manager.get_suivi_data(prev_date) if prev_date else {}

        fdv = db_manager.get_fdv_list()
        v_to_cdz = {r["vendeur"].strip().upper(): (r.get("cdz") or "AUTRE").strip().upper() for r in fdv}
        allowed_vendeurs = {r["vendeur"].strip().upper() for r in fdv if r.get("cdz") in ("CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA")}

        def extract_quanti(data):
            res = {}
            for r in data.get("quantitative", []):
                v = r.get("vendeur", "").strip().upper()
                if not v or "TOTAL" in v:
                    continue
                if v not in res:
                    res[v] = {"real": 0, "obj": 0, "obj_mois": 0, "raf": 0}
                real_val = r.get("real", 0) or 0
                obj_val = r.get("obj", 0) or 0
                if tax_mode == "HT":
                    real_val = int(round(real_val / 1.2))
                    obj_val = int(round(obj_val / 1.2))
                res[v]["real"] += real_val
                res[v]["obj"] += obj_val
            return res

        def extract_quali(data):
            res = {}
            for r in data.get("qualitative", []):
                v = r.get("vendeur", "").strip().upper()
                if not v:
                    continue
                acm_v = r.get("acm", 0)
                tsm_v = r.get("tsm", 0)
                if isinstance(acm_v, str):
                    try:
                        acm_v = float(acm_v.replace('%', '')) / 100.0
                    except:
                        acm_v = 0.0
                if isinstance(tsm_v, str):
                    try:
                        tsm_v = float(tsm_v.replace('%', '')) / 100.0
                    except:
                        tsm_v = 0.0
                res[v] = {"acm": float(acm_v or 0), "tsm": float(tsm_v or 0)}
            return res

        q_cur = extract_quanti(d_cur)
        q_prev = extract_quanti(d_prev)
        ql_cur = extract_quali(d_cur)
        ql_prev = extract_quali(d_prev)

        vendeurs_list = []
        for v in sorted(allowed_vendeurs):
            c_val = q_cur.get(v, {}).get("real", 0)
            p_val = q_prev.get(v, {}).get("real", 0)
            obj_val = q_cur.get(v, {}).get("obj", 0)
            diff_dh = c_val - p_val
            diff_pct = ((c_val - p_val) / p_val * 100) if p_val > 0 else (100.0 if c_val > 0 else 0.0)
            rate = ((c_val - obj_val) / obj_val * 100) if obj_val > 0 else -100.0

            acm_c = ql_cur.get(v, {}).get("acm", 0.0) * 100
            acm_p = ql_prev.get(v, {}).get("acm", 0.0) * 100
            tsm_c = ql_cur.get(v, {}).get("tsm", 0.0) * 100
            tsm_p = ql_prev.get(v, {}).get("tsm", 0.0) * 100

            cdz_name = v_to_cdz.get(v, "AUTRE")

            if diff_pct >= 20:
                trend = "🚀 Forte hausse"
            elif diff_pct >= 5:
                trend = "📈 En progression"
            elif diff_pct >= -5:
                trend = "➡️ Stable"
            elif diff_pct >= -15:
                trend = "📉 En baisse"
            else:
                trend = "⚠️ Décrochage"

            vendeurs_list.append({
                "vendeur": v,
                "cdz": cdz_name,
                "real_cur": c_val,
                "real_prev": p_val,
                "diff_dh": diff_dh,
                "diff_pct": diff_pct,
                "obj": obj_val,
                "rate": rate,
                "acm_cur": acm_c,
                "acm_prev": acm_p,
                "tsm_cur": tsm_c,
                "tsm_prev": tsm_p,
                "trend": trend
            })

        vendeurs_list.sort(key=lambda x: x["real_cur"], reverse=True)

        cdz_summary = []
        for target_cdz_name in ["CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA"]:
            reps = [x for x in vendeurs_list if x["cdz"] == target_cdz_name]
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

        # --- Compute Complete Multi-Week Progression (Semaine par Semaine: S1, S2, S3, S4...) ---
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
            sd = db_manager.get_suivi_data(ep) or {}
            for r in sd.get("quantitative", []):
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

        vendor_multi_week.sort(key=lambda x: x["total"], reverse=True)

        cdz_multi_week = []
        for target_cdz_name in ["CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA"]:
            reps = [x for x in vendor_multi_week if x["cdz"] == target_cdz_name]
            c_discrete = {}
            for w_lbl in week_keys:
                c_discrete[w_lbl] = sum(x["weeks"].get(w_lbl, 0) for x in reps)
            c_tot = sum(x["total"] for x in reps)
            c_obj = sum(x["obj"] for x in reps)
            c_rate = ((c_tot - c_obj) / c_obj * 100) if c_obj > 0 else -100.0
            
            c_vals = [c_discrete[w] for w in week_keys]
            if len(c_vals) >= 2:
                if c_vals[-1] > c_vals[-2] * 1.1:
                    c_dyn = "🚀 Forte dynamique"
                elif c_vals[-1] < c_vals[-2] * 0.85:
                    c_dyn = "📉 Fléchissement"
                else:
                    c_dyn = "➡️ Régulier"
            else:
                c_dyn = "➡️ Stable"

            cdz_multi_week.append({
                "cdz": f"Équipe {target_cdz_name.title()}",
                "cdz_raw": target_cdz_name,
                "reps_count": len(reps),
                "weeks": c_discrete,
                "total": c_tot,
                "obj": c_obj,
                "rate": c_rate,
                "trend": c_dyn
            })

        tot_multi_discrete = {}
        for w_lbl in week_keys:
            tot_multi_discrete[w_lbl] = sum(c["weeks"].get(w_lbl, 0) for c in cdz_multi_week)
        tot_multi_total = sum(c["total"] for c in cdz_multi_week)
        tot_multi_obj = sum(c["obj"] for c in cdz_multi_week)
        tot_multi_rate = ((tot_multi_total - tot_multi_obj) / tot_multi_obj * 100) if tot_multi_obj > 0 else -100.0

        agency_multi_week = {
            "cdz": "AGENCE GLOBALE",
            "weeks": tot_multi_discrete,
            "total": tot_multi_total,
            "obj": tot_multi_obj,
            "rate": tot_multi_rate,
            "trend": "➡️ Global"
        }

        return {
            "current_date": cur_date,
            "previous_date": prev_date or "Semaine Précédente",
            "week_keys": week_keys,
            "week_endpoints": week_endpoints,
            "cdz_summary": cdz_summary,
            "cdz_multi_week": cdz_multi_week,
            "agency_total": {
                "cdz": "AGENCE GLOBALE",
                "real_cur": tot_c,
                "real_prev": tot_p,
                "diff_dh": tot_d_dh,
                "diff_pct": tot_d_pct,
                "obj": tot_o,
                "rate": tot_rate,
                "acm_cur": tot_acm_c,
                "acm_prev": tot_acm_p
            },
            "agency_multi_week": agency_multi_week,
            "vendeurs": vendeurs_list,
            "vendor_multi_week": vendor_multi_week
        }
    except Exception as e:
        print("Error calculating weekly comparison:", e)
        return {}

def build_cdz_weekly_table(weekly_data):
    if not weekly_data or not weekly_data.get("cdz_summary"):
        return ""
    cur_date = weekly_data.get("current_date", "")
    prev_date = weekly_data.get("previous_date", "S-1")

    md = f"\n### 📊 Comparaison des Équipes CDZ (Semaine Dernière vs Semaine Actuelle)\n\n"
    md += f"| Équipe CDZ | Semaine Dernière ({prev_date}) | Semaine Actuelle ({cur_date}) | Évolution (DH) | Évolution (%) | Objectif (DH) | Écart Actuel (%) | ACM Moyen (%) |\n"
    md += "| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n"

    for c in weekly_data["cdz_summary"]:
        diff_sign = "+" if c["diff_dh"] >= 0 else ""
        diff_pct_sign = "+" if c["diff_pct"] >= 0 else ""
        rate_sign = "+" if c["rate"] >= 0 else ""
        md += f"| **{c['cdz']}** | {c['real_prev']:,.0f} | {c['real_cur']:,.0f} | {diff_sign}{c['diff_dh']:,.0f} | **{diff_pct_sign}{c['diff_pct']:.1f}%** | {c['obj']:,.0f} | {rate_sign}{c['rate']:.1f}% | {c['acm_cur']:.1f}% |\n"

    tot = weekly_data.get("agency_total", {})
    if tot:
        diff_sign = "+" if tot["diff_dh"] >= 0 else ""
        diff_pct_sign = "+" if tot["diff_pct"] >= 0 else ""
        tot_rate_sign = "+" if tot["rate"] >= 0 else ""
        md += f"| **{tot['cdz']}** | **{tot['real_prev']:,.0f}** | **{tot['real_cur']:,.0f}** | **{diff_sign}{tot['diff_dh']:,.0f}** | **{diff_pct_sign}{tot['diff_pct']:.1f}%** | **{tot['obj']:,.0f}** | **{tot_rate_sign}{tot['rate']:.1f}%** | **{tot['acm_cur']:.1f}%** |\n"

    # Also append the multi-week progression table across S1, S2, S3, S4
    cdz_multi = weekly_data.get("cdz_multi_week", [])
    week_keys = weekly_data.get("week_keys", [])
    if cdz_multi and len(week_keys) > 1:
        md += f"\n### 📊 Évolution Hebdomadaire des Équipes CDZ (Semaine par Semaine : {', '.join(week_keys)})\n\n"
        headers_str = " | ".join([f"Semaine {w.replace('S','')}" for w in week_keys])
        md += f"| Équipe CDZ | {headers_str} | Cumul Réalisé (DH) | Objectif (DH) | Écart vs Obj (%) | Dynamique |\n"
        align_str = " | ".join([":---:" for _ in week_keys])
        md += f"| :--- | {align_str} | :---: | :---: | :---: | :---: |\n"

        for c in cdz_multi:
            w_vals_str = " | ".join([f"{c['weeks'].get(w, 0):,.0f}" for w in week_keys])
            rate_sign = "+" if c["rate"] >= 0 else ""
            md += f"| **{c['cdz']}** | {w_vals_str} | **{c['total']:,.0f}** | {c['obj']:,.0f} | {rate_sign}{c['rate']:.1f}% | {c['trend']} |\n"

        tot_m = weekly_data.get("agency_multi_week", {})
        if tot_m:
            w_vals_str = " | ".join([f"**{tot_m['weeks'].get(w, 0):,.0f}**" for w in week_keys])
            tot_rate_sign = "+" if tot_m["rate"] >= 0 else ""
            md += f"| **{tot_m['cdz']}** | {w_vals_str} | **{tot_m['total']:,.0f}** | **{tot_m['obj']:,.0f}** | **{tot_rate_sign}{tot_m['rate']:.1f}%** | {tot_m['trend']} |\n"

    return md

def build_vendor_weekly_table(weekly_data, target_vendeur=None, target_cdz=None):
    if not weekly_data or not weekly_data.get("vendeurs"):
        return ""
    cur_date = weekly_data.get("current_date", "")
    prev_date = weekly_data.get("previous_date", "S-1")

    vendeurs = weekly_data["vendeurs"]
    if target_vendeur:
        v_upper = target_vendeur.strip().upper()
        vendeurs = [v for v in vendeurs if v["vendeur"].strip().upper() == v_upper]
    elif target_cdz and target_cdz != "All":
        cdz_key = "CHAKIB" if "CHAKIB" in target_cdz.upper() else "BOUTMEZGUINE"
        vendeurs = [v for v in vendeurs if cdz_key in v["cdz"].upper()]

    if not vendeurs:
        return ""

    md = f"\n### 📈 Évolution Hebdomadaire Vendeur par Vendeur ({prev_date} vs {cur_date})\n\n"
    md += f"| Vendeur | Équipe CDZ | Semaine Dernière (DH) | Semaine Actuelle (DH) | Évolution (DH) | Évolution (%) | Objectif (DH) | Écart vs Obj (%) | Tendance |\n"
    md += "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n"

    for v in vendeurs:
        diff_sign = "+" if v["diff_dh"] >= 0 else ""
        diff_pct_sign = "+" if v["diff_pct"] >= 0 else ""
        rate_sign = "+" if v["rate"] >= 0 else ""
        cdz_short = "Chakib" if "CHAKIB" in v["cdz"] else "Boutmezguine"
        md += f"| **{v['vendeur']}** | {cdz_short} | {v['real_prev']:,.0f} | {v['real_cur']:,.0f} | {diff_sign}{v['diff_dh']:,.0f} | **{diff_pct_sign}{v['diff_pct']:.1f}%** | {v['obj']:,.0f} | {rate_sign}{v['rate']:.1f}% | {v['trend']} |\n"

    # Also append the multi-week progression table across S1, S2, S3, S4
    vendor_multi = weekly_data.get("vendor_multi_week", [])
    week_keys = weekly_data.get("week_keys", [])
    if vendor_multi and len(week_keys) > 1:
        if target_vendeur:
            v_upper = target_vendeur.strip().upper()
            vendor_multi = [v for v in vendor_multi if v["vendeur"].strip().upper() == v_upper]
        elif target_cdz and target_cdz != "All":
            cdz_key = "CHAKIB" if "CHAKIB" in target_cdz.upper() else "BOUTMEZGUINE"
            vendor_multi = [v for v in vendor_multi if cdz_key in v["cdz"].upper()]

        if vendor_multi:
            md += f"\n### 📈 Évolution Hebdomadaire Détaillée Vendeur par Vendeur ({', '.join(week_keys)})\n\n"
            headers_str = " | ".join([f"Semaine {w.replace('S','')}" for w in week_keys])
            md += f"| Vendeur | Équipe CDZ | {headers_str} | Cumul Réalisé (DH) | Objectif (DH) | Écart vs Obj (%) | Dynamique |\n"
            align_str = " | ".join([":---:" for _ in week_keys])
            md += f"| :--- | :--- | {align_str} | :---: | :---: | :---: | :---: |\n"

            for v in vendor_multi:
                w_vals_str = " | ".join([f"{v['weeks'].get(w, 0):,.0f}" for w in week_keys])
                rate_sign = "+" if v["rate"] >= 0 else ""
                cdz_short = "Chakib" if "CHAKIB" in v["cdz"] else "Boutmezguine"
                md += f"| **{v['vendeur']}** | {cdz_short} | {w_vals_str} | **{v['total']:,.0f}** | {v['obj']:,.0f} | {rate_sign}{v['rate']:.1f}% | {v['trend']} |\n"

    return md

def get_vendeur_localites_visites(vendeur, date=None):
    """
    Extracts structured visit breakdown by localité/tournée for a specific vendor:
    - localite / tournee name
    - secteur
    - total_visites
    - total_factures (visites avec facture / OK)
    - autre (sans facture)
    - taux_facturation
    - motifs_autre (breakdown of other reasons: Magasin Fermé, Stock Suffisant, etc.)
    """
    if not vendeur:
        return []
        
    vcode = vendeur.strip().split()[0].upper()
    vname = vendeur.strip().upper()
    
    conn = None
    try:
        import sqlite3
        from db_manager import get_db_connection
        conn = get_db_connection()
        conn.row_factory = sqlite3.Row
        c = conn.cursor()
        
        # Try first for specific date if provided
        rows = []
        if date and date != "default":
            query_date = """
                SELECT tournee, agence, motif, count(1) as cnt
                FROM visites_rapports
                WHERE (UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ?) AND date_visite = ?
                GROUP BY tournee, agence, motif ORDER BY tournee ASC
            """
            rows = c.execute(query_date, (f"{vcode}%", f"%{vname}%", date)).fetchall()
            
        # Fallback to all dates (full month cumulative) if date not provided or returned 0 rows
        if not rows:
            query_all = """
                SELECT tournee, agence, motif, count(1) as cnt
                FROM visites_rapports
                WHERE UPPER(vendeur) LIKE ? OR UPPER(vendeur) LIKE ?
                GROUP BY tournee, agence, motif ORDER BY tournee ASC
            """
            rows = c.execute(query_all, (f"{vcode}%", f"%{vname}%")).fetchall()
        
        loc_dict = {}
        for r in rows:
            loc = (r['tournee'] or 'Tournée Non Spécifiée').strip()
            sec = (r['agence'] or 'Secteur Non Spécifié').strip()
            m = str(r['motif'] or 'OK').strip()
            cnt = int(r['cnt'] or 0)
            
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
            if m.upper() == 'OK' or 'VENTE' in m.upper() or 'FACTURE' in m.upper():
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
            
            # Format top other motifs
            top_motifs = sorted(d["motifs_autre"].items(), key=lambda x: x[1], reverse=True)
            d["motifs_str"] = ", ".join(f"{k} ({v})" for k, v in top_motifs) if top_motifs else "Aucun"
            results.append(d)
            
        results.sort(key=lambda x: x["total_visites"], reverse=True)
        return results
    except Exception as e:
        print(f"Error extracting localites visites for {vendeur}: {e}")
        return []
    finally:
        if conn:
            try:
                conn.close()
            except Exception:
                pass

def build_vendor_localites_table(localites_visites):
    if not localites_visites:
        return "*Aucune donnée de visite par localité disponible pour ce vendeur.*"
        
    tot_vis = sum(l["total_visites"] for l in localites_visites)
    tot_fac = sum(l["total_factures"] for l in localites_visites)
    tot_aut = sum(l["autre"] for l in localites_visites)
    global_rate = (tot_fac / tot_vis * 100) if tot_vis > 0 else 0.0
    
    md = """| Localité / Tournée | Secteur | Total Visites | Total Factures (OK) | Autre (Sans Facture) | Taux Facturation (%) | Motifs Sans Facture Fréquents |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
"""
    for l in localites_visites:
        rate = l["taux_facturation_pct"]
        badge = "🟢" if rate >= 50 else ("🟡" if rate >= 35 else "🔴")
        md += f"| **{l['localite']}** | {l['secteur']} | {l['total_visites']} | {l['total_factures']} | {l['autre']} | {badge} **{l['taux_facturation']}** | {l['motifs_str']} |\n"
        
    md += f"| **TOTAL CONSOLIDÉ** | **-** | **{tot_vis}** | **{tot_fac}** | **{tot_aut}** | **{global_rate:.1f}%** | **{tot_aut} visites sans commande** |\n"
    return md

def tax_mode_label(summary_data):
    return summary_data.get("tax_mode", "TTC")

def generate_fallback_report_vendeur(vendeur, summary_data):
    workdays = summary_data["workdays"]
    ca_ttc = summary_data["agency_totals"]["total_real_ca_ttc"]
    obj_ttc = summary_data["agency_totals"]["total_obj_ca_ttc"]
    rate = summary_data["agency_totals"]["achievement_rate_ca"]
    variance = summary_data["agency_totals"]["variance_rate_ca"]
    full_month_obj = summary_data["agency_totals"]["full_month_obj"]
    total_raf = summary_data["agency_totals"]["total_raf"]
    raf_per_day = summary_data["agency_totals"]["raf_per_day"]
    rest_days = workdays["rest"]

    pos = summary_data.get("positioning", {})
    positioning_section = ""
    if pos:
        rank = pos["rank"]
        total = pos["total_sellers"]
        v_pct = pos["vendeur_pct"]
        avg_pct = pos["agency_average_pct"]
        top = pos.get("top_performer", {}) or {}
        bottom = pos.get("bottom_performer", {}) or {}
        top_name = top.get("vendeur", "-")
        top_pct = top.get("pct_str", "-")
        bottom_name = bottom.get("vendeur", "-")
        bottom_pct = bottom.get("pct_str", "-")
        
        if pos.get("ecart_vs_moyenne_float", 0) > 5:
            verdict = f"{vendeur} est **en nette avance** sur la moyenne de l'équipe."
        elif pos.get("ecart_vs_moyenne_float", 0) < -5:
            verdict = f"{vendeur} est **en retard** par rapport à l'équipe et nécessite une accélération immédiate."
        else:
            verdict = f"{vendeur} est **dans la moyenne** de l'équipe."
            
        positioning_section = f"""
> [!NOTE]
> **Positionnement dans l'équipe :** {vendeur} est classé **#{rank} sur {total} vendeurs**. Écart : **{v_pct}** (Moyenne équipe : {avg_pct}). {verdict}
"""

    visites_info = summary_data.get("visites_summary", {})
    anomalies_info = summary_data.get("anomalies_summary", {})
    terrain_info = summary_data.get("terrain_summary", {})

    localites_visites = summary_data.get("localites_visites", [])
    localites_table_md = summary_data.get("localites_table_md") or build_vendor_localites_table(localites_visites)

    report = f"""# 📊 Rapport d'Analyse Exécutif & Coaching
## Vendeur : **{vendeur}**
**Période : Mois en cours ({workdays['elapsed']} jours écoulés / {workdays['total']} jours ouvrés)**

{positioning_section}

### 1. 💰 Synthèse des Résultats Commerciaux (CA)
* **Chiffre d'Affaires Réalisé :** **{ca_ttc:,.0f} MAD** ({tax_mode_label(summary_data)})
* **Objectif Partiel Proratisé :** {obj_ttc:,.0f} MAD
* **Objectif Mensuel Global :** **{full_month_obj:,.0f} MAD**
* **Taux d'Atteinte :** **{rate}** (Écart : **{variance}**)
* **Reste à Faire (RAF) Global :** **{total_raf:,.0f} MAD**
* **🎯 Effort Quotidien Requis :** **{raf_per_day:,.0f} MAD / jour** sur les **{rest_days} jours restants**.

### 2. 📦 Répartition par Famille de Produits (Quantitatif)
| Famille | Réalisé (DH) | Objectif (DH) | % Écart | Obj Mois (DH) | RAF / Jour (DH) |
| :--- | :---: | :---: | :---: | :---: | :---: |
"""
    for f in summary_data.get("families_performance", []):
        pct_sign = "+" if f["pct"] >= 0 else ""
        report += f"| **{f['famille']}** | {f['real']:,.0f} | {f['obj']:,.0f} | {pct_sign}{f['pct']:.1f}% | {f.get('obj_mois', 0):,.0f} | {f.get('raf', 0):,.0f} |\n"

    vq = summary_data.get("vendeur_qualitative", {})
    weekly_comp = summary_data.get("weekly_comparison", {})
    vendor_weekly_md = build_vendor_weekly_table(weekly_comp, target_vendeur=vendeur)

    report += f"""
### 3. 👥 Couverture Clientèle & Qualitatif (ACM / TSM)
| Clients Programmés | Clients Facturés | Couverture ACM (%) | Transformation TSM (%) | Lignes/Client |
| :---: | :---: | :---: | :---: | :---: |
| {vq.get('clt_programme', 0)} | {vq.get('clt_facture', 0)} | **{vq.get('acm', '0.0%')}** | **{vq.get('tsm', '0.0%')}** | {vq.get('line', '-')} |

{vendor_weekly_md}

### 4. 🎯 Progression sur les Produits Focus
"""
    focus_som = summary_data.get("focus_som_summary", [])
    focus_vmm = summary_data.get("focus_vmm_summary", [])
    
    if focus_som:
        report += "* **Focus Glace / Mousse Chantilly (SOM) :**\n"
        for f in focus_som:
            report += f"  - Secteur {f['secteur']} : Réalisé **{f['realise']:,.0f} DH** sur obj **{f['ttc']:,.0f} DH** (Taux : **{f['percent']}**)\n"
    if focus_vmm:
        report += "* **Focus Tomate Frito (VMM) :**\n"
        for f in focus_vmm:
            report += f"  - Secteur {f['secteur']} : Réalisé **{f['realise']:,.0f}** sur obj ACM **{f['obj_acm']:,.0f}** (Taux : **{f['percent']}**)\n"

    report += f"""
### 5. 📍 Activité Visites par Localité / Tournée & Transformation
{localites_table_md}

### 6. ⚠️ Audit Terrain, Discipline & Détection d'Anomalies
* **Activité Visites Enregistrées :** {visites_info.get('total_visites', 0)} visites effectuées.
* **Commandes Terrain Saisies :** {terrain_info.get('total_commandes_terrain', 0)} commandes enregistrées.
* **Anomalies Détectées :** {anomalies_info.get('total_anomalies', 0)} alertes ({anomalies_info.get('count_less_3min', 0)} visites < 3min, {anomalies_info.get('count_first_late', 0)} départs après 8h40).

> [!TIP]
> ### 🚀 Plan d'Action & Priorités Terrain pour {vendeur}
> 1. **Priorité Chiffre d'Affaires :** Maintenir un rythme de facturation de **{raf_per_day:,.0f} MAD / jour** en poussant les familles à fort volume et en retard.
> 2. **Couverture par Localité :** Traiter en priorité les tournées à fort potentiel et corriger les motifs sans facture (ex: passages aux bonnes heures pour éviter les magasins fermés).
> 3. **Focus Produits :** Placer systématiquement au moins 2 unités des produits focus par visite client.
"""
    return report

def generate_fallback_report_cdz(cdz_name, summary_data):
    workdays = summary_data["workdays"]
    ca_ttc = summary_data["agency_totals"]["total_real_ca_ttc"]
    obj_ttc = summary_data["agency_totals"]["total_obj_ca_ttc"]
    rate = summary_data["agency_totals"]["achievement_rate_ca"]
    variance = summary_data["agency_totals"]["variance_rate_ca"]
    full_month_obj = summary_data["agency_totals"]["full_month_obj"]
    total_raf = summary_data["agency_totals"]["total_raf"]
    raf_per_day = summary_data["agency_totals"]["raf_per_day"]
    rest_days = workdays["rest"]

    visites_info = summary_data.get("visites_summary", {})
    anomalies_info = summary_data.get("anomalies_summary", {})
    terrain_info = summary_data.get("terrain_summary", {})
    weekly_comp = summary_data.get("weekly_comparison", {})

    cdz_weekly_md = build_cdz_weekly_table(weekly_comp)
    vendor_weekly_md = build_vendor_weekly_table(weekly_comp, target_cdz=cdz_name)

    report = f"""# 👑 Rapport de Pilotage Exécutif CDZ
## Chef de Zone : **{cdz_name}**
**Période : Mois en cours ({workdays['elapsed']} jours écoulés / {workdays['total']} jours ouvrés)**

> [!IMPORTANT]
> **Diagnostic Macro Équipe {cdz_name} :**
> * **CA Réalisé :** **{ca_ttc:,.0f} MAD** ({tax_mode_label(summary_data)})
> * **Objectif Mensuel Complet :** **{full_month_obj:,.0f} MAD**
> * **Taux d'Atteinte :** **{rate}** (Écart : **{variance}**)
> * **Reste à Faire Global :** **{total_raf:,.0f} MAD**
> * **🎯 Cible Quotidienne Équipe :** **{raf_per_day:,.0f} MAD / jour** sur les {rest_days} jours restants.

---

{cdz_weekly_md}

---

### 1. 🏆 Classement & Performance des Vendeurs de la Zone

#### Top Performers (Locomotives) :
| Vendeur | Réalisé (DH) | Objectif (DH) | Écart (%) | Statut |
| :--- | :---: | :---: | :---: | :---: |
"""
    for v in summary_data.get("top_performing_sellers", [])[:4]:
        pct_sign = "+" if v["pct"] >= 0 else ""
        badge = "🟢 En avance" if v["pct"] >= 0 else ("🟡 En vigilance" if v["pct"] >= -15 else "🔴 En retard")
        report += f"| **{v['vendeur']}** | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% | {badge} |\n"

    report += """
#### Bottom Performers (Cibles Coaching Prioritaires) :
| Vendeur | Réalisé (DH) | Objectif (DH) | Écart (%) | Statut |
| :--- | :---: | :---: | :---: | :---: |
"""
    for v in summary_data.get("bottom_performing_sellers", [])[-4:]:
        pct_sign = "+" if v["pct"] >= 0 else ""
        badge = "🟢 En avance" if v["pct"] >= 0 else ("🟡 En vigilance" if v["pct"] >= -15 else "🔴 En retard critique")
        report += f"| **{v['vendeur']}** | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% | {badge} |\n"

    report += f"""
---

{vendor_weekly_md}

---

### 2. 📦 Synthèse par Famille de Produits (Mix Produit)
| Famille | Réalisé (DH) | Objectif (DH) | % Écart | Obj Mensuel (DH) | RAF Quotidien (DH/J) |
| :--- | :---: | :---: | :---: | :---: | :---: |
"""
    for f in summary_data.get("families_performance", []):
        pct_sign = "+" if f["pct"] >= 0 else ""
        report += f"| **{f['famille']}** | {f['real']:,.0f} | {f['obj']:,.0f} | {pct_sign}{f['pct']:.1f}% | {f.get('obj_mois', 0):,.0f} | {f.get('raf', 0):,.0f} |\n"

    report += f"""
---

### 3. 👥 Portefeuille Clients, ACM & Couverture Terrain
* **Taux Moyen de Couverture (ACM) :** **{summary_data.get('qualitative_averages', {}).get('average_acm_rate', '0%')}**
* **Taux Moyen de Succès / Commande (TSM) :** **{summary_data.get('qualitative_averages', {}).get('average_tsm_rate', '0%')}**

| Vendeur | Clients Programmés | Clients Facturés | ACM (%) | TSM (%) | LINE |
| :--- | :---: | :---: | :---: | :---: | :---: |
"""
    for r in summary_data.get("sellers_qualitative", [])[:6]:
        report += f"| **{r['vendeur']}** | {r['clt_programme']} | {r['clt_facture']} | {r['acm']} | {r['tsm']} | {r['line']} |\n"

    report += f"""
---

### 4. 🎯 Performance Focus Produits
* **Focus Glace / Chantilly (SOM) :** {len(summary_data.get('focus_som_summary', []))} secteurs suivis.
* **Focus Tomate Frito (VMM) :** {len(summary_data.get('focus_vmm_summary', []))} secteurs suivis.

---

### 5. ⚠️ Audit des Visites, Suivi Terrain & Détection des Anomalies
* **Volume Total de Visites Effectuées :** **{visites_info.get('total_visites', 0):,}** visites
* **Total Commandes Terrain :** **{terrain_info.get('total_commandes_terrain', 0)}**
* **Anomalies Critiques Détectées :** **{anomalies_info.get('total_anomalies', 0)}** alertes
  - Visites ultra-courtes (< 3 min) : **{anomalies_info.get('count_less_3min', 0)}**
  - Démarrage tardif après 08h40 : **{anomalies_info.get('count_first_late', 0)}**
  - Fin précoce avant 14h45 : **{anomalies_info.get('count_last_early', 0)}**
  - Visites multiples sur même client : **{anomalies_info.get('count_multiple', 0)}**

---

### 6. 🧭 Plan d'Action Managérial Recommandé pour {cdz_name}
1. **Accompagnement Terrain Ciblé (Duo Coaching) :** Programmer 2 jours d'accompagnement terrain en priorité avec les vendeurs en bas de tableau.
2. **Discipline des Départs de Tournée :** Fixer le premier passage client impérativement à 08h30 pour éliminer les retards de démarrage.
3. **Chantier Focus & Rattrapage RAF :** Instaurer un point d'étape chaque matin à 08h00 pour suivre l'atteinte des **{raf_per_day:,.0f} MAD / jour** requis.
"""
    return report

def generate_fallback_report_category(category, summary_data):
    cdz_name = "CHAKIB ELFIL" if "CHAKIB" in category.upper() else ("BOUTMEZGUINE EL MOSTAFA" if "BOUTMEZGUINE" in category.upper() else category)
    return generate_fallback_report_cdz(cdz_name, summary_data)

def generate_fallback_report_global(summary_data):
    workdays = summary_data["workdays"]
    ca_ttc = summary_data["agency_totals"]["total_real_ca_ttc"]
    obj_ttc = summary_data["agency_totals"]["total_obj_ca_ttc"]
    rate = summary_data["agency_totals"]["achievement_rate_ca"]
    variance = summary_data["agency_totals"]["variance_rate_ca"]
    full_month_obj = summary_data["agency_totals"]["full_month_obj"]
    total_raf = summary_data["agency_totals"]["total_raf"]
    raf_per_day = summary_data["agency_totals"]["raf_per_day"]
    rest_days = workdays["rest"]

    visites_info = summary_data.get("visites_summary", {})
    anomalies_info = summary_data.get("anomalies_summary", {})
    terrain_info = summary_data.get("terrain_summary", {})
    weekly_comp = summary_data.get("weekly_comparison", {})

    cdz_weekly_md = build_cdz_weekly_table(weekly_comp)
    vendor_weekly_md = build_vendor_weekly_table(weekly_comp)

    report = f"""# 🌐 Rapport d'Analyse Commerciale Globale - Agence Agadir
**Période : Mois en cours ({workdays['elapsed']} jours écoulés / {workdays['total']} jours ouvrés)**

> [!NOTE]
> **Synthèse Globale Agence :**
> * **CA Réalisé Total :** **{ca_ttc:,.0f} MAD** ({tax_mode_label(summary_data)})
> * **Objectif Mensuel Global :** **{full_month_obj:,.0f} MAD**
> * **Taux de Réalisation Global :** **{rate}** (Écart : **{variance}**)
> * **Reste à Faire Global :** **{total_raf:,.0f} MAD**
> * **🎯 Effort Quotidien Global :** **{raf_per_day:,.0f} MAD / jour** sur les {rest_days} jours restants.

---

{cdz_weekly_md}

---

### 1. 🏆 Classement Général des Représentants (Top & Flop)

#### Top 5 Vendeurs (Moteurs de Croissance) :
| Vendeur | Réalisé (DH) | Objectif (DH) | Écart (%) | Statut |
| :--- | :---: | :---: | :---: | :---: |
"""
    for v in summary_data.get("top_performing_sellers", [])[:5]:
        pct_sign = "+" if v["pct"] >= 0 else ""
        report += f"| **{v['vendeur']}** | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% | 🟢 En avance |\n"

    report += """
#### 5 Vendeurs sous Surveillance :
| Vendeur | Réalisé (DH) | Objectif (DH) | Écart (%) | Statut |
| :--- | :---: | :---: | :---: | :---: |
"""
    for v in summary_data.get("bottom_performing_sellers", [])[-5:]:
        pct_sign = "+" if v["pct"] >= 0 else ""
        report += f"| **{v['vendeur']}** | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% | 🔴 En retard |\n"

    report += f"""
---

{vendor_weekly_md}

---

### 2. 📦 Synthèse Globale par Famille de Produits
| Famille | Réalisé (DH) | Objectif (DH) | % Écart | Obj Mois (DH) | RAF Quotidien (DH/J) |
| :--- | :---: | :---: | :---: | :---: | :---: |
"""
    for f in summary_data.get("families_performance", []):
        pct_sign = "+" if f["pct"] >= 0 else ""
        report += f"| **{f['famille']}** | {f['real']:,.0f} | {f['obj']:,.0f} | {pct_sign}{f['pct']:.1f}% | {f.get('obj_mois', 0):,.0f} | {f.get('raf', 0):,.0f} |\n"

    report += f"""
---

### 3. 👥 Indicateurs Qualitatifs Consolidés
* **Taux Moyen ACM :** **{summary_data.get('qualitative_averages', {}).get('average_acm_rate', '0%')}**
* **Taux Moyen TSM :** **{summary_data.get('qualitative_averages', {}).get('average_tsm_rate', '0%')}**

---

### 4. ⚠️ Activité Terrain, Visites & Anomalies Détectées
* **Total Visites Enregistrées :** **{visites_info.get('total_visites', 0):,}** visites
* **Total Commandes Terrain Saisies :** **{terrain_info.get('total_commandes_terrain', 0)}**
  - Visites courtes (< 3min) : **{anomalies_info.get('count_less_3min', 0)}**
  - Retards au démarrage (> 08h40) : **{anomalies_info.get('count_first_late', 0)}**
  - Arrêts précoces (< 14h45) : **{anomalies_info.get('count_last_early', 0)}**
"""
    return report

def build_prompt_sections(options, is_vendeur=False, is_cdz=False):
    """Build the prompt sections based on selected options"""
    sections = []

    sections.append("""
1.bis **Comparaison & Évolution Hebdomadaire (Semaine Dernière vs Semaine Actuelle) :**
   - Rédige obligatoirement le tableau Markdown de comparaison des équipes CDZ :
     | Équipe CDZ | Semaine Dernière (DH) | Semaine Actuelle (DH) | Évolution (DH) | Évolution (%) | Objectif (DH) | Écart Actuel (%) | ACM Moyen (%) |
   - Rédige obligatoirement le tableau Markdown d'évolution hebdomadaire vendeur par vendeur :
     | Vendeur | Équipe CDZ | Semaine Dernière (DH) | Semaine Actuelle (DH) | Évolution (DH) | Évolution (%) | Objectif (DH) | Écart vs Obj (%) | Tendance |
   - Commente les dynamiques de croissance, les reprises et les ralentissements hebdomadaires.
    """)

    if options.get("quanti", True):
        sections.append("""
2. **Analyse Quantitative (Performance des Ventes) :**
   - Présente un tableau de performance quantitative par famille de produits (Famille, Réalisé (DH), Parcial (DH), Taux de Réalisation (%), Réal 2025 (DH), Obj Mois (DH), Reste à Faire (RAF)).
   - RÈGLE D'AFFICHAGE DU TAUX QUANTITATIF : Le Taux de Réalisation (%) doit TOUJOURS être exprimé sous forme d'écart négatif ou positif avec son signe (ex: -10.0% si Réalisé est à 90% de l'objectif, +15.0% si Réalisé est à 115% de l'objectif).
   - Analyse les points forts, les dérives et les familles motrices vs familles en retard.
        """)

    if options.get("quali", True):
        sections.append("""
3. **Analyse Qualitative & Couverture Portefeuille (ACM / TSM) :**
   - Présente le tableau de couverture (Clients Programmés, Clients Facturés, ACM %, TSM %, LINE %).
   - NOTE : Les indicateurs qualitatifs (ACM %, TSM %, LINE %) restent en pourcentage absolu standard (ex: 85.0%, 78.2%).
   - Identifie le taux de transformation client et la régularité des commandes.
        """)

    if options.get("focus", True):
        sections.append("""
4. **Analyse des Focus Produits (Glace SOM & Tomate Frito VMM) :**
   - Analyse la progression sur les focus et le taux d'atteinte des objectifs spéciaux (exprimé en écart +/- %).
        """)

    if options.get("terrain", True):
        sections.append("""
5. **Analyse du Suivi Terrain & Commandes :**
   - Analyse le volume de commandes et ajouts saisis directement sur le terrain.
        """)

    if is_vendeur and options.get("visites", True):
        sections.append("""
6. **Analyse Détaillée des Visites par Localité / Tournée & Transformation :**
   - Rédige obligatoirement le tableau Markdown des visites par localité / tournée pour ce vendeur :
     | Localité / Tournée | Secteur | Total Visites | Total Factures (OK) | Autre (Sans Facture) | Taux Facturation (%) | Motifs Sans Facture Fréquents |
   - Analyse la performance par tournée : compare les localités championnes (taux élevé de facturation) vs les zones à faible transformation (taux bas, motifs dominants : magasins fermés, stocks suffisants, responsables absents).
   - Formule des recommandations opérationnelles concrètes par tournée / localité pour transformer les visites sans facture.
        """)
    elif options.get("visites", True):
        sections.append("""
6. **Analyse des Visites Terrain & Discipline de Tournée :**
   - Analyse le volume de visites, le respect des horaires de tournée et la régularité.
        """)

    if options.get("anomali", True):
        sections.append("""
7. **Audit des Anomalies & Alertes Critiques :**
   - Analyse les anomalies détectées (visites < 3 min, départs tardifs > 8h40, fins précoces < 14h45, visites répétées).
   - Signale les points de risque majeurs pour l'équipe.
        """)

    if options.get("rappel", True):
        sections.append("""
8. **Recommandations Opérationnelles & Plan d'Action Managérial :**
   - Formule un plan d'action concret pour les jours restants avec priorités chiffrées (RAF/jour).
        """)

    return "\n".join(sections)


def generate_report(vendeur=None, category=None, cdz=None, date=None, options=None, return_data=False, tax_mode="TTC", report_type="complet", language="fr", model=None, source_db="active", month=None, snapshot_id=None):
    if source_db == "historique" or (month and source_db != "active"):
        return generate_historique_report(
            month=month,
            snapshot_id=snapshot_id,
            vendeur=vendeur,
            category=category,
            cdz=cdz,
            options=options,
            return_data=return_data,
            tax_mode=tax_mode,
            report_type=report_type,
            language=language,
            model=model
        )

    if not model:
        try:
            cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
            if os.path.exists(cfg_path):
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    model = cfg.get("model") or cfg.get("openrouter_model")
        except Exception:
            pass
    if not model:
        model = "anthropic/claude-3.5-sonnet"

    print(f"Loading data (vendeur={vendeur}, category={category}, cdz={cdz}, date={date}, options={options}, tax_mode={tax_mode}, report_type={report_type}, model={model})...")

    if options is None:
        options = {
            "quanti": True,
            "quali": True,
            "focus": True,
            "terrain": True,
            "visites": True,
            "anomali": True,
            "rappel": True
        }

    if not cdz and category and category != "All":
        if "CHAKIB" in category.upper():
            cdz = "CHAKIB ELFIL"
        elif "BOUTMEZGUINE" in category.upper():
            cdz = "BOUTMEZGUINE EL MOSTAFA"

    if date and date != "default":
        from db_manager import get_suivi_data
        data = get_suivi_data(date)
        if not data:
            p = ExcelProcessor()
            p.get_day_work()
            p.fix_sheet()
            data = p.get_data()
    else:
        p = ExcelProcessor()
        p.get_day_work()
        p.fix_sheet()
        data = p.get_data()

    try:
        import datetime
        import db_manager
        report_date_str = date if (date and date != "default") else datetime.date.today().strftime("%Y-%m-%d")
        settings = db_manager.get_suivi_settings(report_date_str)
        custom_rest_days = settings["rest_days"] if settings else None
        data["workdays"] = db_manager.get_workdays_info(custom_rest_days, report_date_str)
    except Exception as e:
        print("Error setting dynamic workdays in generate_report:", e)
        
    try:
        import db_manager
        fdv_list = db_manager.get_fdv_list()
        allowed_vendeurs = {r["vendeur"].strip().upper() for r in fdv_list if r.get("cdz") in ("CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA")}
        allowed_vendeurs.add("AUTRE")

        for key in ["quantitative", "qualitative", "focus_vmm", "focus_som"]:
            if key in data:
                data[key] = [r for r in data[key] if r.get("vendeur", "").strip().upper() in allowed_vendeurs]
    except Exception as e:
        print("Error filtering by database vendeurs in generate_report:", e)
    
    if tax_mode == "HT":
        if "quantitative" in data:
            data["quantitative"] = [
                {
                    **r,
                    "real": int(round(r["real"] / 1.2)) if r.get("real") is not None else 0,
                    "obj": int(round(r["obj"] / 1.2)) if r.get("obj") is not None else 0,
                    "real_2025": int(round(r["real_2025"] / 1.2)) if r.get("real_2025") is not None else 0,
                    "h_2024": int(round(r["h_2024"] / 1.2)) if r.get("h_2024") is not None else 0,
                    "obj_mois": int(round(r["obj_mois"] / 1.2)) if r.get("obj_mois") is not None else 0,
                    "raf": int(round(r["raf"] / 1.2)) if r.get("raf") is not None else 0,
                    "encours": int(round(r["encours"] / 1.2)) if r.get("encours") is not None else 0
                }
                for r in data["quantitative"]
            ]
        if "focus_som" in data:
            data["focus_som"] = [
                {
                    **r,
                    "ttc": int(round(r["ttc"] / 1.2)) if r.get("ttc") is not None else 0,
                    "realise": int(round(r["realise"] / 1.2)) if r.get("realise") is not None else 0,
                    "rest": int(round(r["rest"] / 1.2)) if r.get("rest") is not None else 0,
                    "rest_jour": int(round(r["rest_jour"] / 1.2)) if r.get("rest_jour") is not None else 0
                }
                for r in data["focus_som"]
            ]
    
    target_sellers_set = None
    if cdz and cdz != "All":
        import db_manager
        fdv_list = db_manager.get_fdv_list()
        cdz_sellers = [r["vendeur"].strip().upper() for r in fdv_list if (r.get("cdz") or "").strip().upper() == cdz.strip().upper()]
        if cdz_sellers:
            allowed_set = set(cdz_sellers)
            target_sellers_set = allowed_set
            data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() in allowed_set]
            data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() in allowed_set]
            data["focus_vmm"] = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() in allowed_set]
            data["focus_som"] = [r for r in data["focus_som"] if r["vendeur"].strip().upper() in allowed_set]
    elif category and category != "All":
        allowed = get_categorie(category)
        if not isinstance(allowed, list):
            allowed = [allowed]
        allowed_set = {v.strip().upper() for v in allowed if v}
        target_sellers_set = allowed_set
        data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() in allowed_set]
        data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() in allowed_set]
        data["focus_vmm"] = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() in allowed_set]
        data["focus_som"] = [r for r in data["focus_som"] if r["vendeur"].strip().upper() in allowed_set]
        
    unfiltered_quanti = data.get("quantitative", [])
    
    if vendeur:
        v_name = vendeur.strip().upper()
        target_sellers_set = {v_name}
        data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() == v_name]
        data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() == v_name]
        
        orig_vmm = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() == v_name]
        data["focus_vmm"] = orig_vmm if orig_vmm else [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() == "AUTRE"]
        
        orig_som = [r for r in data["focus_som"] if r["vendeur"].strip().upper() == v_name]
        data["focus_som"] = orig_som if orig_som else [r for r in data["focus_som"] if r["vendeur"].strip().upper() == "AUTRE"]

    quanti = data["quantitative"]
    ca_records = [r for r in quanti if r["famille"] in ("C.A (ht)", "C.A (TTC)")]
    
    total_real = sum(r["real"] for r in ca_records)
    total_obj = sum(r["obj"] for r in ca_records)
    total_pct = (total_real / total_obj - 1.0) * 100 if total_obj > 0 else -100
    
    seller_ca = {}
    for r in ca_records:
        seller_ca[r["vendeur"]] = seller_ca.get(r["vendeur"], 0) + r["real"]
        
    seller_obj = {}
    for r in ca_records:
        seller_obj[r["vendeur"]] = seller_obj.get(r["vendeur"], 0) + r["obj"]
        
    vendeurs_perf = []
    for v, real in seller_ca.items():
        obj = seller_obj.get(v, 1)
        pct = (real / obj - 1.0) * 100 if obj > 0 else -100
        vendeurs_perf.append({
            "vendeur": v,
            "real": real,
            "obj": obj,
            "pct": pct,
            "pct_str": f"{pct:+.1f}%"
        })
    vendeurs_perf.sort(key=lambda x: x["pct"], reverse=True)
    
    agency_ranking = list(vendeurs_perf)
    agency_avg_pct = total_pct
    agency_total_real = total_real
    agency_total_obj = total_obj
    if vendeur and unfiltered_quanti:
        unfiltered_ca = [r for r in unfiltered_quanti if r["famille"] in ("C.A (ht)", "C.A (TTC)")]
        if unfiltered_ca:
            u_seller_ca = {}
            u_seller_obj = {}
            for r in unfiltered_ca:
                u_seller_ca[r["vendeur"]] = u_seller_ca.get(r["vendeur"], 0) + r["real"]
                u_seller_obj[r["vendeur"]] = u_seller_obj.get(r["vendeur"], 0) + r["obj"]
            u_perf = []
            for v, real in u_seller_ca.items():
                obj = u_seller_obj.get(v, 1)
                pct = (real / obj - 1.0) * 100 if obj > 0 else -100
                u_perf.append({
                    "vendeur": v,
                    "real": real,
                    "obj": obj,
                    "pct": pct,
                    "pct_str": f"{pct:+.1f}%"
                })
            u_perf.sort(key=lambda x: x["pct"], reverse=True)
            agency_ranking = u_perf
            agency_total_real = sum(r["real"] for r in unfiltered_ca)
            agency_total_obj = sum(r["obj"] for r in unfiltered_ca)
            agency_avg_pct = (agency_total_real / agency_total_obj - 1.0) * 100 if agency_total_obj > 0 else -100
    
    rest_days = data["workdays"]["rest"]
    elapsed_days = data["workdays"]["elapsed"]
    total_days = data["workdays"]["total"]
    effective_elapsed = 19 if elapsed_days == 20 else (elapsed_days if elapsed_days > 0 else 19)

    families = {}
    for r in quanti:
        if r["famille"] not in families:
            families[r["famille"]] = {"real": 0, "obj": 0, "real_2025": 0, "obj_mois": 0, "raf": 0}
        families[r["famille"]]["real"] += r["real"]
        families[r["famille"]]["obj"] += r["obj"]
        families[r["famille"]]["real_2025"] += r["real_2025"]
        families[r["famille"]]["obj_mois"] += r["obj_mois"]
        families[r["famille"]]["raf"] += r["raf"]
            
    custom_order = [
        "LEVURE",
        "MOUSSES",
        "BOUILLON",
        "CONDIMENTS",
        "CONFITURE",
        "CONSERVES",
        "MISWAK"
    ]

    existing_upper = {k.strip().upper(): k for k in families.keys()}
    for fam in custom_order:
        if fam not in existing_upper:
            families[fam] = {"real": 0, "obj": 0, "real_2025": 0, "obj_mois": 0, "raf": 0}

    fam_perf_normal = []
    ca_perf = None
    for f, vals in families.items():
        real = vals["real"]
        obj = vals["obj"]
        pct = (real / obj - 1.0) * 100 if obj > 0 else -100
        
        if obj > 0:
            obj_global_fam = round(obj * 24 / effective_elapsed)
            total_rem_fam = max(0, obj_global_fam - real)
            raf_fam = int(round(total_rem_fam / rest_days)) if rest_days > 0 else 0
        else:
            raf_fam = 0

        item = {
            "famille": f,
            "real": real,
            "obj": obj,
            "pct": pct,
            "pct_str": f"{pct:+.1f}%",
            "real_2025": vals["real_2025"],
            "obj_mois": vals["obj_mois"],
            "raf": raf_fam
        }
        if f.strip().upper() in ("C.A (HT)", "C.A (TTC)"):
            ca_perf = item
        else:
            fam_perf_normal.append(item)
            
    def get_custom_sort_key(item):
        name = item["famille"].strip().upper()
        if name in custom_order:
            return (custom_order.index(name), "")
        return (len(custom_order) + 1, name)

    fam_perf_normal.sort(key=get_custom_sort_key)
    fam_perf = fam_perf_normal
    if ca_perf:
        fam_perf.append(ca_perf)
    
    quali = data["qualitative"]
    avg_acm = sum(r["acm"] for r in quali) / len(quali) * 100 if quali else 0.0
    avg_tsm = sum(r["tsm"] for r in quali) / len(quali) * 100 if quali else 0.0
    avg_line = sum(r["line"] for r in quali if r.get("line") is not None) / len([r for r in quali if r.get("line") is not None]) * 100 if quali and any(r.get("line") is not None for r in quali) else 0.0
    
    vendeur_qualitative = data["qualitative"][0] if data["qualitative"] else None
    
    focus_vmm = data["focus_vmm"]
    focus_som = data["focus_som"]
    
    visites_summary = get_visites_and_anomalies_data(allowed_sellers=target_sellers_set, date=date)
    anomalies_summary = {
        "total_anomalies": visites_summary.get("total_anomalies", 0),
        "count_less_3min": visites_summary.get("count_less_3min", 0),
        "count_multiple": visites_summary.get("count_multiple", 0),
        "count_first_late": visites_summary.get("count_first_late", 0),
        "count_last_early": visites_summary.get("count_last_early", 0),
    }

    terrain_summary = get_terrain_orders_data(allowed_sellers=target_sellers_set)

    effective_elapsed = 19 if elapsed_days == 20 else (elapsed_days if elapsed_days > 0 else 19)
    if total_obj > 0:
        full_month_obj = int(round(total_obj * 24 / effective_elapsed))
    else:
        full_month_obj = sum(r["obj_mois"] for r in ca_records) if ca_records else 0

    total_raf = full_month_obj - total_real
    raf_per_day = int(round(total_raf / rest_days)) if rest_days > 0 else 0

    summary_data = {
        "target_cdz": cdz,
        "target_vendeur": vendeur,
        "target_category": category,
        "tax_mode": tax_mode,
        "workdays": data["workdays"],
        "agency_totals": {
            "total_real_ca_ttc": total_real,
            "total_obj_ca_ttc": total_obj,
            "achievement_rate_ca": f"{((total_real/total_obj) - 1.0)*100:+.1f}%" if total_obj > 0 else "-100.0%",
            "variance_rate_ca": f"{((total_real/total_obj) - 1.0)*100:+.1f}%" if total_obj > 0 else "-100.0%",
            "full_month_obj": full_month_obj,
            "total_raf": total_raf,
            "raf_per_day": raf_per_day
        },
        "top_performing_sellers": vendeurs_perf[:5],
        "bottom_performing_sellers": vendeurs_perf[-5:],
        "families_performance": fam_perf,
        "qualitative_averages": {
            "average_acm_rate": f"{avg_acm:.1f}%",
            "average_tsm_rate": f"{avg_tsm:.1f}%",
            "average_line_rate": f"{avg_line:.1f}%"
        },
        "vendeur_qualitative": {
            "clt_programme": vendeur_qualitative["clt_programme"] if vendeur_qualitative else 0,
            "clt_facture": vendeur_qualitative["clt_facture"] if vendeur_qualitative else 0,
            "acm": f"{vendeur_qualitative['acm']*100:.1f}%" if vendeur_qualitative else "0.0%",
            "tsm": f"{vendeur_qualitative['tsm']*100:.1f}%" if vendeur_qualitative else "0.0%",
            "line": f"{vendeur_qualitative['line']*100:.1f}%" if vendeur_qualitative and vendeur_qualitative['line'] is not None else "-",
            "raf_tsm": vendeur_qualitative["raf_tsm"] if vendeur_qualitative else 0,
            "raf_acm": vendeur_qualitative["raf_acm"] if vendeur_qualitative else 0
        } if vendeur else None,
        "sellers_qualitative": [
            {
                "vendeur": r["vendeur"],
                "clt_programme": r["clt_programme"],
                "clt_facture": r["clt_facture"],
                "acm": f"{r['acm']*100:.1f}%",
                "tsm": f"{r['tsm']*100:.1f}%",
                "line": f"{r['line']*100:.1f}%" if r['line'] is not None else "-",
                "raf_tsm": r["raf_tsm"],
                "raf_acm": r["raf_acm"]
            }
            for r in quali
        ],
        "focus_vmm_summary": [
            {"vendeur": f["vendeur"], "secteur": f["secteur"], "obj_acm": f["obj_acm"], "realise": f["realise"], "percent": f"{(f['percent'] - 1.0)*100:+.1f}%", "rest": f.get("rest", 0.0), "rest_jour": f.get("rest_jour", 0.0), "jour_rest": f.get("jour_rest", 20)}
            for f in focus_vmm
        ],
        "focus_som_summary": [
            {"vendeur": f["vendeur"], "secteur": f["secteur"], "ttc": f["ttc"], "realise": f["realise"], "percent": f"{(f['percent'] - 1.0)*100:+.1f}%", "rest": f.get("rest", 0.0), "rest_jour": f.get("rest_jour", 0.0), "jour_rest": f.get("jour_rest", 20)}
            for f in focus_som
        ],
        "visites_summary": visites_summary,
        "anomalies_summary": anomalies_summary,
        "terrain_summary": terrain_summary
    }

    # Calculate rich weekly comparison by CDZ team and vendor by vendor
    weekly_comp = get_weekly_comparison_data(date=date, tax_mode=tax_mode, filter_vendeur=vendeur, filter_cdz=cdz)
    summary_data["weekly_comparison"] = weekly_comp
    summary_data["cdz_weekly_table"] = build_cdz_weekly_table(weekly_comp)
    summary_data["vendor_weekly_table"] = build_vendor_weekly_table(weekly_comp, target_vendeur=vendeur, target_cdz=cdz)

    if vendeur:
        localites_visites = get_vendeur_localites_visites(vendeur, date=date)
        summary_data["localites_visites"] = localites_visites
        summary_data["localites_table_md"] = build_vendor_localites_table(localites_visites)
    
    if vendeur and agency_ranking:
        v_name = vendeur.strip().upper()
        vendeur_idx = None
        vendeur_perf = None
        for i, v in enumerate(agency_ranking):
            if v["vendeur"].strip().upper() == v_name:
                vendeur_idx = i
                vendeur_perf = v
                break
        
        if vendeur_perf is not None and vendeur_idx is not None:
            total_sellers = len(agency_ranking)
            rank = vendeur_idx + 1
            vendeur_pct = vendeur_perf["pct"]
            ecart_vs_avg = vendeur_pct - agency_avg_pct
            top_performer = agency_ranking[0] if agency_ranking else None
            bottom_performer = agency_ranking[-1] if agency_ranking else None
            
            summary_data["positioning"] = {
                "rank": rank,
                "total_sellers": total_sellers,
                "vendeur_pct": vendeur_perf["pct_str"],
                "vendeur_pct_float": vendeur_pct,
                "agency_average_pct": f"{agency_avg_pct:+.1f}%",
                "agency_average_pct_float": agency_avg_pct,
                "ecart_vs_moyenne": f"{ecart_vs_avg:+.1f}%",
                "ecart_vs_moyenne_float": ecart_vs_avg,
                "top_performer": {
                    "vendeur": top_performer["vendeur"],
                    "pct_str": top_performer["pct_str"],
                    "pct_float": top_performer["pct"]
                } if top_performer else None,
                "bottom_performer": {
                    "vendeur": bottom_performer["vendeur"],
                    "pct_str": bottom_performer["pct_str"],
                    "pct_float": bottom_performer["pct"]
                } if bottom_performer else None,
                "agency_total_real_ca_ttc": agency_total_real,
                "agency_total_obj_ca_ttc": agency_total_obj,
                "full_ranking": agency_ranking
            }
    
    lang_instruction = "entièrement en langue Arabe (en utilisant l'alphabet arabe, pas d'arizi)" if language == "ar" else "en français"
    is_cdz_report = bool(cdz and cdz != "All") or bool(category and category != "All" and not vendeur)
    
    if vendeur:
        prompt_sections = build_prompt_sections(options, is_vendeur=True, is_cdz=False)
        positioning = summary_data.get("positioning", {})
        pos_str = f"Position: #{positioning.get('rank', 1)}/{positioning.get('total_sellers', 1)}" if positioning else ""
        loc_table = summary_data.get("localites_table_md", "")
        prompt = f"""Tu es un analyste commercial senior et un coach de force de vente. Analyse les indicateurs clés de performance (KPI) multi-dimensionnels (Quanti, Quali, Focus, Suivi Terrain, Visites par Localité/Tournée, Anomalies) du vendeur {vendeur} (région AGADIR) pour la période en cours.
Rédige un rapport de performance individuel complet, constructif et motivant {lang_instruction}.

1. **Introduction :** Analyse du CA de {vendeur} (Réalisé {summary_data['agency_totals']['total_real_ca_ttc']:,.0f} MAD {tax_mode}, Écart/Progression {summary_data['agency_totals']['achievement_rate_ca']}, RAF Total {summary_data['agency_totals']['total_raf']:,.0f} MAD, RAF Quotidien {summary_data['agency_totals']['raf_per_day']:,.0f} MAD/j sur {summary_data['workdays']['rest']} jours restants). {pos_str}

{prompt_sections}

Tableau pré-calculé des visites par localité / tournée pour ce vendeur :
{loc_table}

Données KPI consolidées :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    elif is_cdz_report:
        cdz_label = cdz or category
        prompt_sections = build_prompt_sections(options, is_vendeur=False, is_cdz=True)
        prompt = f"""Tu es un analyste commercial senior et auditeur de performance. Analyse les indicateurs clés de performance (KPI) consolidés (Quanti, Quali, Focus, Suivi Terrain, Visites, Anomalies) pour l'équipe du Chef de Zone (CDZ) "{cdz_label}" (région AGADIR).
Rédige un rapport exécutif de pilotage managérial détaillé, clair et actionnable {lang_instruction}.

1. **Diagnostic Exécutif CDZ :** Synthèse globale de l'équipe (CA Réalisé {summary_data['agency_totals']['total_real_ca_ttc']:,.0f} MAD {tax_mode}, Objectif {summary_data['agency_totals']['total_obj_ca_ttc']:,.0f} MAD, Écart/Progression {summary_data['agency_totals']['achievement_rate_ca']}, RAF Total {summary_data['agency_totals']['total_raf']:,.0f} MAD, RAF Quotidien {summary_data['agency_totals']['raf_per_day']:,.0f} MAD/j sur {summary_data['workdays']['rest']} jours restants).

{prompt_sections}

Données KPI consolidées de l'équipe :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    else:
        prompt_sections = build_prompt_sections(options, is_vendeur=False, is_cdz=False)
        prompt = f"""Tu es un analyste commercial senior. Analyse les indicateurs clés de performance (KPI) globaux (Quanti, Quali, Focus, Suivi Terrain, Visites, Anomalies) de l'agence MADEC Agadir.
Rédige un rapport commercial global d'analyse exécutive {lang_instruction}.

1. **Synthèse Macro Commerciale :** Réalisé global {summary_data['agency_totals']['total_real_ca_ttc']:,.0f} MAD {tax_mode}, Écart/Progression {summary_data['agency_totals']['achievement_rate_ca']}, RAF Total {summary_data['agency_totals']['total_raf']:,.0f} MAD, RAF/jour {summary_data['agency_totals']['raf_per_day']:,.0f} MAD/j.

{prompt_sections}

Données KPI consolidées de l'agence :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""

    api_key = os.getenv("OPENROUTER_API_KEY")
    content = None
    if report_type == "mini":
        content = "### Mini Rapport (Aperçu Image WhatsApp)\nCe format est optimisé pour être partagé directement sous forme d'image sur WhatsApp."
    elif api_key:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5000",
            "X-Title": "MADEC KPI Analyzer"
        }
        
        body = {
            "model": model,
            "messages": [
                {
                    "role": "system", 
                    "content": (
                        "Tu es un analyste commercial senior spécialisé dans la force de vente et l'optimisation des ventes.\n"
                        f"IMPORTANT : Toutes les valeurs monétaires de chiffre d'affaires (CA) fournies sont en {tax_mode} (Hors Taxe si HT, ou Toutes Taxes Comprises si TTC). Veille à formuler toutes les valeurs monétaires en précisant '{tax_mode}'.\n\n"
                        "RÈGLE STRICTE SUR LES POURCENTAGES :\n"
                        "- Pour TOUTES les métriques et tableaux QUANTITATIFS (Ventes, CA Réalisé vs Objectif, Performance par Famille de Produits, Évolution hebdomadaire S-1 vs S, Classement Vendeurs, Focus) : exprime TOUJOURS le taux de réalisation sous forme d'Écart/Progression relatif avec son signe (+ ou -). Exemple : écris -10.0% (et JAMAIS 90.0% si Réalisé < Objectif) ; écris +15.0% (et JAMAIS 115.0% si Réalisé > Objectif).\n"
                        "- Seuls les indicateurs QUALITATIFS (Couverture ACM %, Transformation TSM %, LINE %) doivent rester sous forme de taux absolu standard (ex: 85.0%, 78.2%).\n\n"
                        "CONSIGNE DE RIGUEUR : Utilise uniquement les données et taux pré-calculés fournis dans le JSON. "
                        "Respecte scrupuleusement les tableaux Markdown pour que l'interface puisse les styliser et tracer les graphiques."
                    )
                },
                {"role": "user", "content": prompt}
            ]
        }
        
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=45) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                content = res_data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"Error calling OpenRouter: {e}. Falling back to local template generator.")
    else:
        print("OPENROUTER_API_KEY not found. Falling back to local template generator.")
 
    if not content:
        if vendeur:
            content = generate_fallback_report_vendeur(vendeur, summary_data)
        elif is_cdz_report:
            cdz_label = cdz or category
            content = generate_fallback_report_cdz(cdz_label, summary_data)
        else:
            content = generate_fallback_report_global(summary_data)
 
    if vendeur and report_type != "mini":
        localites_table = summary_data.get("localites_table_md")
        if localites_table and ("| Localité" not in content and "| Tournée" not in content and "TOTAL CONSOLIDÉ" not in content):
            content += f"\n\n### 📍 Répartition Détaillée des Visites par Localité / Tournée\n\n{localites_table}\n"

        positioning = summary_data.get("positioning", {})
        full_ranking = positioning.get("full_ranking", [])
        if full_ranking:
            comparison_table = "\n\n### Classement et Comparaison avec les pairs\n\n"
            comparison_table += "| Vendeur | Réalisé (DH) | Objectif (DH) | Écart vs Objectif (%) |\n"
            comparison_table += "| :--- | :---: | :---: | :---: |\n"
            
            for v in full_ranking:
                is_active = (v["vendeur"].strip().upper() == vendeur.strip().upper())
                name_str = f"**{v['vendeur']} (Sélectionné)**" if is_active else v["vendeur"]
                pct_sign = "+" if v["pct"] >= 0 else ""
                comparison_table += f"| {name_str} | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% |\n"
            content += comparison_table
 
        daily_table = build_daily_sales_table(vendeur=vendeur, category=category)
        if daily_table:
            content += daily_table

    output_file = "rapport_kpi.md"
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"Error saving report: {e}")
        
    if return_data:
        return content, summary_data
    return content


def generate_historique_report(month=None, snapshot_id=None, vendeur=None, category=None, cdz=None, options=None, return_data=False, tax_mode="TTC", report_type="complet", language="fr", model=None):
    """
    Generates a complete multi-dimensional AI analysis report getting 100% of data 
    directly and solely from historique.db for a specific month or snapshot.
    """
    import db_manager
    from collections import defaultdict
    import datetime

    if not model:
        try:
            cfg_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
            if os.path.exists(cfg_path):
                with open(cfg_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                    model = cfg.get("model") or cfg.get("openrouter_model")
        except Exception:
            pass
    if not model:
        model = "anthropic/claude-3.5-sonnet"

    if not month and not snapshot_id:
        months = db_manager.get_historique_months()
        if months:
            month = months[0]["month"]
            snapshot_id = months[0].get("latest_snapshot_id")
        else:
            month = "2026-08"

    print(f"[HISTORIQUE AI REPORT] Generating report solely from historique.db (month={month}, snapshot_id={snapshot_id}, vendeur={vendeur}, cdz={cdz}, tax_mode={tax_mode})...")

    if options is None:
        options = {
            "quanti": True,
            "quali": True,
            "focus": True,
            "terrain": True,
            "visites": True,
            "anomali": True,
            "rappel": True
        }

    if not cdz and category and category != "All":
        if "CHAKIB" in category.upper():
            cdz = "CHAKIB ELFIL"
        elif "BOUTMEZGUINE" in category.upper():
            cdz = "BOUTMEZGUINE EL MOSTAFA"

    # 1. Load baseline data from historique.db
    data = db_manager.get_historique_suivi_data_by_month(month=month, snapshot_id=snapshot_id)
    actual_date = data.get("date") or (f"{month}-31" if month else "2026-08-31")
    actual_month = data.get("month") or (month or actual_date[:7])
    target_snapshot_id = snapshot_id or data.get("snapshot_id")

    # If snapshot_id wasn't determined yet, find the latest snapshot for this month
    if not target_snapshot_id:
        months_meta = db_manager.get_historique_months()
        for m in months_meta:
            if m["month"] == actual_month:
                target_snapshot_id = m.get("latest_snapshot_id")
                break

    # 2. Filter allowed sellers based on CDZ mappings
    try:
        fdv_list = db_manager.get_fdv_list()
        allowed_vendeurs = {r["vendeur"].strip().upper() for r in fdv_list if r.get("cdz") in ("CHAKIB ELFIL", "BOUTMEZGUINE EL MOSTAFA")}
        allowed_vendeurs.add("AUTRE")

        for key in ["quantitative", "qualitative", "focus_vmm", "focus_som"]:
            if key in data:
                data[key] = [r for r in data[key] if r.get("vendeur", "").strip().upper() in allowed_vendeurs]
    except Exception as e:
        print("Error filtering historique by FDV sellers:", e)

    # 3. Apply Tax Mode (HT vs TTC)
    if tax_mode == "HT":
        if "quantitative" in data:
            data["quantitative"] = [
                {
                    **r,
                    "real": int(round(r["real"] / 1.2)) if r.get("real") is not None else 0,
                    "obj": int(round(r["obj"] / 1.2)) if r.get("obj") is not None else 0,
                    "real_2025": int(round(r["real_2025"] / 1.2)) if r.get("real_2025") is not None else 0,
                    "h_2024": int(round(r["h_2024"] / 1.2)) if r.get("h_2024") is not None else 0,
                    "obj_mois": int(round(r["obj_mois"] / 1.2)) if r.get("obj_mois") is not None else 0,
                    "raf": int(round(r["raf"] / 1.2)) if r.get("raf") is not None else 0,
                    "encours": int(round(r["encours"] / 1.2)) if r.get("encours") is not None else 0
                }
                for r in data["quantitative"]
            ]
        if "focus_som" in data:
            data["focus_som"] = [
                {
                    **r,
                    "ttc": int(round(r["ttc"] / 1.2)) if r.get("ttc") is not None else 0,
                    "realise": int(round(r["realise"] / 1.2)) if r.get("realise") is not None else 0,
                    "rest": int(round(r["rest"] / 1.2)) if r.get("rest") is not None else 0,
                    "rest_jour": int(round(r["rest_jour"] / 1.2)) if r.get("rest_jour") is not None else 0
                }
                for r in data["focus_som"]
            ]

    # 4. Target filters (CDZ / Category / Vendor)
    target_sellers_set = None
    if cdz and cdz != "All":
        fdv_list = db_manager.get_fdv_list()
        cdz_sellers = [r["vendeur"].strip().upper() for r in fdv_list if (r.get("cdz") or "").strip().upper() == cdz.strip().upper()]
        if cdz_sellers:
            allowed_set = set(cdz_sellers)
            target_sellers_set = allowed_set
            data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() in allowed_set]
            data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() in allowed_set]
            data["focus_vmm"] = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() in allowed_set]
            data["focus_som"] = [r for r in data["focus_som"] if r["vendeur"].strip().upper() in allowed_set]
    elif category and category != "All":
        allowed = get_categorie(category)
        if not isinstance(allowed, list):
            allowed = [allowed]
        allowed_set = {v.strip().upper() for v in allowed if v}
        target_sellers_set = allowed_set
        data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() in allowed_set]
        data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() in allowed_set]
        data["focus_vmm"] = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() in allowed_set]
        data["focus_som"] = [r for r in data["focus_som"] if r["vendeur"].strip().upper() in allowed_set]

    unfiltered_quanti = list(data.get("quantitative", []))

    if vendeur:
        v_name = vendeur.strip().upper()
        target_sellers_set = {v_name}
        data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() == v_name]
        data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() == v_name]

        orig_vmm = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() == v_name]
        data["focus_vmm"] = orig_vmm if orig_vmm else [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() == "AUTRE"]

        orig_som = [r for r in data["focus_som"] if r["vendeur"].strip().upper() == v_name]
        data["focus_som"] = orig_som if orig_som else [r for r in data["focus_som"] if r["vendeur"].strip().upper() == "AUTRE"]

    quanti = data["quantitative"]
    ca_records = [r for r in quanti if r["famille"] in ("C.A (ht)", "C.A (TTC)")]

    total_real = sum(r["real"] for r in ca_records)
    total_obj = sum(r["obj"] for r in ca_records)
    total_pct = (total_real / total_obj - 1.0) * 100 if total_obj > 0 else -100

    seller_ca = {}
    seller_obj = {}
    for r in ca_records:
        seller_ca[r["vendeur"]] = seller_ca.get(r["vendeur"], 0) + r["real"]
        seller_obj[r["vendeur"]] = seller_obj.get(r["vendeur"], 0) + r["obj"]

    vendeurs_perf = []
    for v, real in seller_ca.items():
        obj = seller_obj.get(v, 1)
        pct = (real / obj - 1.0) * 100 if obj > 0 else -100
        vendeurs_perf.append({
            "vendeur": v,
            "real": real,
            "obj": obj,
            "pct": pct,
            "pct_str": f"{pct:+.1f}%"
        })
    vendeurs_perf.sort(key=lambda x: x["pct"], reverse=True)

    agency_ranking = list(vendeurs_perf)
    agency_avg_pct = total_pct
    agency_total_real = total_real
    agency_total_obj = total_obj

    if vendeur and unfiltered_quanti:
        unfiltered_ca = [r for r in unfiltered_quanti if r["famille"] in ("C.A (ht)", "C.A (TTC)")]
        if unfiltered_ca:
            u_seller_ca = {}
            u_seller_obj = {}
            for r in unfiltered_ca:
                u_seller_ca[r["vendeur"]] = u_seller_ca.get(r["vendeur"], 0) + r["real"]
                u_seller_obj[r["vendeur"]] = u_seller_obj.get(r["vendeur"], 0) + r["obj"]
            u_perf = []
            for v, real in u_seller_ca.items():
                obj = u_seller_obj.get(v, 1)
                pct = (real / obj - 1.0) * 100 if obj > 0 else -100
                u_perf.append({
                    "vendeur": v,
                    "real": real,
                    "obj": obj,
                    "pct": pct,
                    "pct_str": f"{pct:+.1f}%"
                })
            u_perf.sort(key=lambda x: x["pct"], reverse=True)
            agency_ranking = u_perf
            agency_total_real = sum(r["real"] for r in unfiltered_ca)
            agency_total_obj = sum(r["obj"] for r in unfiltered_ca)
            agency_avg_pct = (agency_total_real / agency_total_obj - 1.0) * 100 if agency_total_obj > 0 else -100

    rest_days = data["workdays"]["rest"]
    elapsed_days = data["workdays"]["elapsed"]
    total_days = data["workdays"]["total"]
    effective_elapsed = 19 if elapsed_days == 20 else (elapsed_days if elapsed_days > 0 else 19)

    # 5. Product Families Breakdown
    families = {}
    for r in quanti:
        if r["famille"] not in families:
            families[r["famille"]] = {"real": 0, "obj": 0, "real_2025": 0, "obj_mois": 0, "raf": 0}
        families[r["famille"]]["real"] += r["real"]
        families[r["famille"]]["obj"] += r["obj"]
        families[r["famille"]]["real_2025"] += r["real_2025"]
        families[r["famille"]]["obj_mois"] += r["obj_mois"]
        families[r["famille"]]["raf"] += r["raf"]

    custom_order = ["LEVURE", "MOUSSES", "BOUILLON", "CONDIMENTS", "CONFITURE", "CONSERVES", "MISWAK"]
    existing_upper = {k.strip().upper(): k for k in families.keys()}
    for fam in custom_order:
        if fam not in existing_upper:
            families[fam] = {"real": 0, "obj": 0, "real_2025": 0, "obj_mois": 0, "raf": 0}

    fam_perf_normal = []
    ca_perf = None
    for f, vals in families.items():
        real = vals["real"]
        obj = vals["obj"]
        pct = (real / obj - 1.0) * 100 if obj > 0 else -100
        if obj > 0:
            obj_global_fam = round(obj * 24 / effective_elapsed)
            total_rem_fam = max(0, obj_global_fam - real)
            raf_fam = int(round(total_rem_fam / rest_days)) if rest_days > 0 else 0
        else:
            raf_fam = 0

        item = {
            "famille": f,
            "real": real,
            "obj": obj,
            "pct": pct,
            "pct_str": f"{pct:+.1f}%",
            "real_2025": vals["real_2025"],
            "obj_mois": vals["obj_mois"],
            "raf": raf_fam
        }
        if f.strip().upper() in ("C.A (HT)", "C.A (TTC)"):
            ca_perf = item
        else:
            fam_perf_normal.append(item)

    def get_custom_sort_key(item):
        name = item["famille"].strip().upper()
        if name in custom_order:
            return (custom_order.index(name), "")
        return (len(custom_order) + 1, name)

    fam_perf_normal.sort(key=get_custom_sort_key)
    fam_perf = fam_perf_normal
    if ca_perf:
        fam_perf.append(ca_perf)

    # 6. Qualitative Indicators
    quali = data["qualitative"]
    avg_acm = sum(r["acm"] for r in quali) / len(quali) * 100 if quali else 0.0
    avg_tsm = sum(r["tsm"] for r in quali) / len(quali) * 100 if quali else 0.0
    avg_line = sum(r["line"] for r in quali if r.get("line") is not None) / len([r for r in quali if r.get("line") is not None]) * 100 if quali and any(r.get("line") is not None for r in quali) else 0.0

    vendeur_qualitative = data["qualitative"][0] if data["qualitative"] else None
    focus_vmm = data["focus_vmm"]
    focus_som = data["focus_som"]

    # 7. Visites & Anomalies strictly from historique.db
    visites_summary = db_manager.get_historique_visites_and_anomalies(month=actual_month, snapshot_id=target_snapshot_id, allowed_sellers=target_sellers_set)
    anomalies_summary = {
        "total_anomalies": visites_summary.get("total_anomalies", 0),
        "count_less_3min": visites_summary.get("count_less_3min", 0),
        "count_multiple": visites_summary.get("count_multiple", 0),
        "count_first_late": visites_summary.get("count_first_late", 0),
        "count_last_early": visites_summary.get("count_last_early", 0),
    }

    if total_obj > 0:
        full_month_obj = int(round(total_obj * 24 / effective_elapsed))
    else:
        full_month_obj = sum(r["obj_mois"] for r in ca_records) if ca_records else 0

    total_raf = full_month_obj - total_real
    raf_per_day = int(round(total_raf / rest_days)) if rest_days > 0 else 0

    summary_data = {
        "source_database": "historique.db",
        "historical_month": actual_month,
        "historical_date": actual_date,
        "snapshot_id": target_snapshot_id,
        "target_cdz": cdz,
        "target_vendeur": vendeur,
        "target_category": category,
        "tax_mode": tax_mode,
        "workdays": data["workdays"],
        "agency_totals": {
            "total_real_ca_ttc": total_real,
            "total_obj_ca_ttc": total_obj,
            "achievement_rate_ca": f"{((total_real/total_obj) - 1.0)*100:+.1f}%" if total_obj > 0 else "-100.0%",
            "variance_rate_ca": f"{((total_real/total_obj) - 1.0)*100:+.1f}%" if total_obj > 0 else "-100.0%",
            "full_month_obj": full_month_obj,
            "total_raf": total_raf,
            "raf_per_day": raf_per_day
        },
        "top_performing_sellers": vendeurs_perf[:5],
        "bottom_performing_sellers": vendeurs_perf[-5:],
        "families_performance": fam_perf,
        "qualitative_averages": {
            "average_acm_rate": f"{avg_acm:.1f}%",
            "average_tsm_rate": f"{avg_tsm:.1f}%",
            "average_line_rate": f"{avg_line:.1f}%"
        },
        "vendeur_qualitative": {
            "clt_programme": vendeur_qualitative["clt_programme"] if vendeur_qualitative else 0,
            "clt_facture": vendeur_qualitative["clt_facture"] if vendeur_qualitative else 0,
            "acm": f"{vendeur_qualitative['acm']*100:.1f}%" if vendeur_qualitative else "0.0%",
            "tsm": f"{vendeur_qualitative['tsm']*100:.1f}%" if vendeur_qualitative else "0.0%",
            "line": f"{vendeur_qualitative['line']*100:.1f}%" if (vendeur_qualitative and vendeur_qualitative.get('line') is not None) else "-",
            "raf_tsm": vendeur_qualitative["raf_tsm"] if vendeur_qualitative else 0,
            "raf_acm": vendeur_qualitative["raf_acm"] if vendeur_qualitative else 0
        } if vendeur else None,
        "sellers_qualitative": [
            {
                "vendeur": r["vendeur"],
                "clt_programme": r["clt_programme"],
                "clt_facture": r["clt_facture"],
                "acm": f"{r['acm']*100:.1f}%",
                "tsm": f"{r['tsm']*100:.1f}%",
                "line": f"{r['line']*100:.1f}%" if r.get('line') is not None else "-",
                "raf_tsm": r["raf_tsm"],
                "raf_acm": r["raf_acm"]
            }
            for r in quali
        ],
        "focus_vmm_summary": [
            {"vendeur": f["vendeur"], "secteur": f["secteur"], "obj_acm": f["obj_acm"], "realise": f["realise"], "percent": f"{(f['percent'] - 1.0)*100:+.1f}%", "rest": f.get("rest", 0.0), "rest_jour": f.get("rest_jour", 0.0), "jour_rest": f.get("jour_rest", 20)}
            for f in focus_vmm
        ],
        "focus_som_summary": [
            {"vendeur": f["vendeur"], "secteur": f["secteur"], "ttc": f["ttc"], "realise": f["realise"], "percent": f"{(f['percent'] - 1.0)*100:+.1f}%", "rest": f.get("rest", 0.0), "rest_jour": f.get("rest_jour", 0.0), "jour_rest": f.get("jour_rest", 20)}
            for f in focus_som
        ],
        "visites_summary": visites_summary,
        "anomalies_summary": anomalies_summary
    }

    # 8. Weekly comparison from historical database
    weekly_comp = db_manager.get_historique_weekly_comparison(month=actual_month, snapshot_id=target_snapshot_id, tax_mode=tax_mode, filter_vendeur=vendeur, filter_cdz=cdz)
    summary_data["weekly_comparison"] = weekly_comp
    summary_data["cdz_weekly_table"] = build_cdz_weekly_table(weekly_comp)
    summary_data["vendor_weekly_table"] = build_vendor_weekly_table(weekly_comp, target_vendeur=vendeur, target_cdz=cdz)

    if vendeur:
        localites_visites = db_manager.get_historique_vendeur_localites(vendeur, month=actual_month, snapshot_id=target_snapshot_id)
        summary_data["localites_visites"] = localites_visites
        summary_data["localites_table_md"] = build_vendor_localites_table(localites_visites)

    if vendeur and agency_ranking:
        v_name = vendeur.strip().upper()
        vendeur_idx = None
        vendeur_perf = None
        for i, v in enumerate(agency_ranking):
            if v["vendeur"].strip().upper() == v_name:
                vendeur_idx = i
                vendeur_perf = v
                break

        if vendeur_perf is not None and vendeur_idx is not None:
            total_sellers = len(agency_ranking)
            rank = vendeur_idx + 1
            vendeur_pct = vendeur_perf["pct"]
            ecart_vs_avg = vendeur_pct - agency_avg_pct
            top_performer = agency_ranking[0] if agency_ranking else None
            bottom_performer = agency_ranking[-1] if agency_ranking else None

            summary_data["positioning"] = {
                "rank": rank,
                "total_sellers": total_sellers,
                "vendeur_pct": vendeur_perf["pct_str"],
                "vendeur_pct_float": vendeur_pct,
                "agency_average_pct": f"{agency_avg_pct:+.1f}%",
                "agency_average_pct_float": agency_avg_pct,
                "ecart_vs_moyenne": f"{ecart_vs_avg:+.1f}%",
                "ecart_vs_moyenne_float": ecart_vs_avg,
                "top_performer": {
                    "vendeur": top_performer["vendeur"],
                    "pct_str": top_performer["pct_str"],
                    "pct_float": top_performer["pct"]
                } if top_performer else None,
                "bottom_performer": {
                    "vendeur": bottom_performer["vendeur"],
                    "pct_str": bottom_performer["pct_str"],
                    "pct_float": bottom_performer["pct"]
                } if bottom_performer else None,
                "agency_total_real_ca_ttc": agency_total_real,
                "agency_total_obj_ca_ttc": agency_total_obj,
                "full_ranking": agency_ranking
            }

    lang_instruction = "entièrement en langue Arabe (en utilisant l'alphabet arabe, pas d'arizi)" if language == "ar" else "en français"
    is_cdz_report = bool(cdz and cdz != "All") or bool(category and category != "All" and not vendeur)

    # 9. Formulate AI Prompt explicitly identifying historical dataset
    period_header = f"HISTORIQUE CLÔTURÉ / ARCHIVÉ (Mois : {actual_month}, Instantané source : {actual_date})"
    if vendeur:
        prompt_sections = build_prompt_sections(options, is_vendeur=True, is_cdz=False)
        positioning = summary_data.get("positioning", {})
        pos_str = f"Position: #{positioning.get('rank', 1)}/{positioning.get('total_sellers', 1)}" if positioning else ""
        loc_table = summary_data.get("localites_table_md", "")
        prompt = f"""Tu es un auditeur et analyste commercial senior. Analyse les indicateurs clés de performance (KPI) archivés ({period_header}) issus exclusivement de la base de données historique pour le vendeur {vendeur} (région AGADIR).
Rédige un bilan de performance individuel d'archive complet, rigoureux, constructif et motivant {lang_instruction}.

1. **Introduction & Bilan Période :** Analyse du CA de {vendeur} (Réalisé {summary_data['agency_totals']['total_real_ca_ttc']:,.0f} MAD {tax_mode}, Écart/Progression {summary_data['agency_totals']['achievement_rate_ca']}, RAF Total {summary_data['agency_totals']['total_raf']:,.0f} MAD, RAF Quotidien {summary_data['agency_totals']['raf_per_day']:,.0f} MAD/j sur {summary_data['workdays']['rest']} jours restants). {pos_str}

{prompt_sections}

Tableau pré-calculé des visites par localité / tournée pour ce vendeur :
{loc_table}

Données KPI consolidées de l'archive historique :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    elif is_cdz_report:
        cdz_label = cdz or category
        prompt_sections = build_prompt_sections(options, is_vendeur=False, is_cdz=True)
        prompt = f"""Tu es un auditeur et analyste commercial senior. Analyse les indicateurs clés de performance (KPI) archivés ({period_header}) issus exclusivement de la base de données historique pour l'équipe du Chef de Zone (CDZ) "{cdz_label}" (région AGADIR).
Rédige un rapport de pilotage managérial d'archive détaillé, clair et actionnable {lang_instruction}.

1. **Diagnostic Exécutif CDZ (Archive {actual_month}) :** Synthèse globale de l'équipe (CA Réalisé {summary_data['agency_totals']['total_real_ca_ttc']:,.0f} MAD {tax_mode}, Objectif {summary_data['agency_totals']['total_obj_ca_ttc']:,.0f} MAD, Écart/Progression {summary_data['agency_totals']['achievement_rate_ca']}, RAF Total {summary_data['agency_totals']['total_raf']:,.0f} MAD, RAF Quotidien {summary_data['agency_totals']['raf_per_day']:,.0f} MAD/j sur {summary_data['workdays']['rest']} jours restants).

{prompt_sections}

Données KPI consolidées de l'équipe :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    else:
        prompt_sections = build_prompt_sections(options, is_vendeur=False, is_cdz=False)
        prompt = f"""Tu es un auditeur et analyste commercial senior. Analyse les indicateurs clés de performance (KPI) globaux archivés ({period_header}) issus exclusivement de la base de données historique de l'agence MADEC Agadir.
Rédige un rapport commercial global d'analyse exécutive rétrospective {lang_instruction}.

1. **Synthèse Macro Commerciale (Archive {actual_month}) :** Réalisé global {summary_data['agency_totals']['total_real_ca_ttc']:,.0f} MAD {tax_mode}, Écart/Progression {summary_data['agency_totals']['achievement_rate_ca']}, RAF Total {summary_data['agency_totals']['total_raf']:,.0f} MAD, RAF/jour {summary_data['agency_totals']['raf_per_day']:,.0f} MAD/j.

{prompt_sections}

Données KPI consolidées de l'agence :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""

    api_key = os.getenv("OPENROUTER_API_KEY")
    content = None
    if report_type == "mini":
        content = f"### Mini Rapport Historique ({actual_month})\nAperçu des indicateurs archivés pour la période {actual_month}."
    elif api_key:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5000",
            "X-Title": "MADEC KPI Analyzer - Historique"
        }
        body = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "Tu es un analyste commercial senior et auditeur spécialisé dans la force de vente.\n"
                        f"IMPORTANT : Ce rapport est basé sur les données archivées dans la base HISTORIQUE pour la période ({actual_month}).\n"
                        f"Toutes les valeurs monétaires de CA fournies sont en {tax_mode}.\n\n"
                        "RÈGLE STRICTE SUR LES POURCENTAGES :\n"
                        "- Pour TOUTES les métriques QUANTITATIVES (Ventes, CA Réalisé vs Obj, Performance par Famille, Évolution hebdomadaire, Classement) : exprime TOUJOURS le taux de réalisation sous forme d'Écart/Progression relatif avec son signe (+ ou -). Exemple : écris -10.0% (et JAMAIS 90.0% si Réalisé < Objectif) ; écris +15.0% (et JAMAIS 115.0% si Réalisé > Objectif).\n"
                        "- Seuls les indicateurs QUALITATIFS (ACM %, TSM %, LINE %) restent en taux absolu standard (ex: 85.0%).\n\n"
                        "CONSIGNE : Utilise uniquement les données fournies dans le JSON et produis des tableaux Markdown stricts."
                    )
                },
                {"role": "user", "content": prompt}
            ]
        }
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=45) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                content = res_data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"Error calling OpenRouter for historical report: {e}. Falling back to local template generator.")

    if not content:
        if vendeur:
            content = generate_fallback_report_vendeur(vendeur, summary_data)
        elif is_cdz_report:
            cdz_label = cdz or category
            content = generate_fallback_report_cdz(cdz_label, summary_data)
        else:
            content = generate_fallback_report_global(summary_data)

    if vendeur and report_type != "mini":
        localites_table = summary_data.get("localites_table_md")
        if localites_table and ("| Localité" not in content and "| Tournée" not in content and "TOTAL CONSOLIDÉ" not in content):
            content += f"\n\n### 📍 Répartition Détaillée des Visites par Localité / Tournée\n\n{localites_table}\n"

        positioning = summary_data.get("positioning", {})
        full_ranking = positioning.get("full_ranking", [])
        if full_ranking:
            comparison_table = "\n\n### Classement et Comparaison avec les pairs\n\n"
            comparison_table += "| Vendeur | Réalisé (DH) | Objectif (DH) | Écart vs Objectif (%) |\n"
            comparison_table += "| :--- | :---: | :---: | :---: |\n"
            for v in full_ranking:
                is_active = (v["vendeur"].strip().upper() == vendeur.strip().upper())
                name_str = f"**{v['vendeur']} (Sélectionné)**" if is_active else v["vendeur"]
                pct_sign = "+" if v["pct"] >= 0 else ""
                comparison_table += f"| {name_str} | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% |\n"
            content += comparison_table

    # 10. Automatically archive report into h_rapports if a snapshot ID exists
    if target_snapshot_id:
        title_tag = f"Rapport IA Historique — {actual_month}"
        if vendeur:
            title_tag += f" ({vendeur})"
        elif cdz:
            title_tag += f" ({cdz})"
        db_manager.save_historique_generated_report(
            snapshot_id=target_snapshot_id,
            report_text=content,
            title=title_tag,
            vendeur=vendeur,
            format=report_type,
            lang=language,
            report_date=actual_date
        )

    output_file = "rapport_kpi.md"
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        print(f"Error saving historical report file: {e}")

    if return_data:
        return content, summary_data
    return content


if __name__ == "__main__":
    generate_report()

