import os
import json
import urllib.request
from dotenv import load_dotenv
from data_processor import ExcelProcessor, get_categorie

load_dotenv()

def generate_fallback_report_vendeur(vendeur, summary_data):
    workdays = summary_data["workdays"]
    ca_ttc = summary_data["agency_totals"]["total_real_ca_ttc"]
    obj_ttc = summary_data["agency_totals"]["total_obj_ca_ttc"]
    rate = summary_data["agency_totals"]["achievement_rate_ca"]

    # Positioning context (rank, average, peers)
    pos = summary_data.get("positioning", {})
    positioning_section = ""
    if pos:
        rank = pos["rank"]
        total = pos["total_sellers"]
        v_pct = pos["vendeur_pct"]
        avg_pct = pos["agency_average_pct"]
        ecart = pos["ecart_vs_moyenne"]
        top = pos.get("top_performer", {}) or {}
        bottom = pos.get("bottom_performer", {}) or {}
        top_name = top.get("vendeur", "-")
        top_pct = top.get("pct_str", "-")
        bottom_name = bottom.get("vendeur", "-")
        bottom_pct = bottom.get("pct_str", "-")
        # Verdict
        if pos.get("ecart_vs_moyenne_float", 0) > 5:
            verdict = f"{vendeur} se positionne **en avance** sur la moyenne de l'agence."
        elif pos.get("ecart_vs_moyenne_float", 0) < -5:
            verdict = f"{vendeur} se positionne **en retard** par rapport à la moyenne de l'agence et doit accélérer."
        else:
            verdict = f"{vendeur} se positionne **dans la moyenne** de l'agence."
        positioning_section = f"""
**1.5. POSITIONNEMENT DU VENDEUR (Comparaison agence)**
*   **Classement :** {vendeur} est **#{rank} sur {total} vendeurs** actifs de l'agence.
*   **Taux d'écart objectif :** **{v_pct}** | **Moyenne agence :** **{avg_pct}** | **Écart vs moyenne :** **{ecart}**
*   **Meilleur performer :** {top_name} ({top_pct}) | **Plus en retard :** {bottom_name} ({bottom_pct})
*   **Verdict :** {verdict}
"""

    # Compute RAF total for the headline
    total_raf = sum(f.get("raf", 0) for f in summary_data["families_performance"])
    rest_days = workdays["rest"]
    raf_per_day = total_raf / rest_days if rest_days > 0 else 0

    report = f"""**RAPPORT DE PERFORMANCE INDIVIDUEL - VENDEUR : {vendeur}**
**Période : En cours ({workdays['elapsed']} jours écoulés sur {workdays['total']} jours)**

**1. INTRODUCTION ET CHIFFRE D'AFFAIRES INDIVIDUEL**
Pour la période active, le vendeur {vendeur} a réalisé les performances de chiffre d'affaires suivantes :
*   **Chiffre d'Affaires Réel (TTC) :** {ca_ttc:,.0f} MAD
*   **Objectif de Chiffre d'Affaires (TTC) :** {obj_ttc:,.0f} MAD
*   **Taux d'Atteinte :** {rate}
*   **Reste à Faire Total (RAF) :** {total_raf:,.0f} MAD → soit **{raf_per_day:,.0f} MAD / jour** sur les {rest_days} jours restants.
{positioning_section}
**2. ANALYSE DE LA PERFORMANCE PAR FAMILLE DE PRODUIT (QUANTITATIF)**
Voici le tableau des réalisations quantitatives par famille de produits, avec le Reste à Faire (RAF) à combler :

| Famille | Réalisé (DH) | Objectif (DH) | Taux | Réal 2025 (DH) | Obj Mois (DH) | Reste à Faire (RAF) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
"""
    for f in summary_data["families_performance"]:
        pct_sign = "+" if f["pct"] >= 0 else ""
        report += f"| **{f['famille']}** | {f['real']:,.0f} | {f['obj']:,.0f} | {pct_sign}{f['pct']:.1f}% | {f.get('real_2025', 0):,.0f} | {f.get('obj_mois', 0):,.0f} | {f.get('raf', 0):,.0f} |\n"

    vq = summary_data.get("vendeur_qualitative", {})
    report += f"""
**3. INDICATEURS QUALITATIFS (SUIVI CLIENTS)**
Voici les performances de couverture et de commande du vendeur :

| Clients Programmés | Clients Facturés | ACM | TSM | LINE | RAF TSM | RAF ACM |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| {vq.get('clt_programme', 0)} | {vq.get('clt_facture', 0)} | {vq.get('acm', '0.0%')} | {vq.get('tsm', '0.0%')} | {vq.get('line', '-')} | {vq.get('raf_tsm', 0)} | {vq.get('raf_acm', 0)} |

**4. ANALYSE DES PRODUITS FOCUS**
*   **Focus Tomate Frito (VMM) :**
"""
    if summary_data["focus_vmm_summary"]:
        for f in summary_data["focus_vmm_summary"]:
            report += f"    *   Secteur {f['secteur']} : Réalisé {f['realise']:,.0f} (Objectif ACM {f['obj_acm']:,.0f}) - Taux : {f['percent']}\n"
    else:
        report += "    *   Aucun focus Tomate Frito configuré ou réalisé pour ce vendeur.\n"

    report += """
*   **Focus Glace (SOM) :**
"""
    if summary_data["focus_som_summary"]:
        for f in summary_data["focus_som_summary"]:
            report += f"    *   Secteur {f['secteur']} : Réalisé {f['realise']:,.0f} MAD (Objectif Glace TTC {f['ttc']:,.0f} MAD) - Taux : {f['percent']}\n"
    else:
        report += "    *   Aucun focus Glace configuré ou réalisé pour ce vendeur.\n"

    report += f"""
**5. PLAN D'ACTION ET RECOMMANDATIONS (Sous {workdays['rest']} jours restants)**
*   **🎯 Objectif quotidien :** Réaliser en moyenne **{raf_per_day:,.0f} MAD / jour** pour atteindre l'objectif (RAF total : {total_raf:,.0f} MAD).
1.  **Visites clients (ACM) :** Augmenter la couverture terrain en planifiant rigoureusement les tournées pour visiter l'ensemble des clients programmés.
2.  **Transformation (TSM) :** Améliorer la conversion lors des visites par une argumentation commerciale ciblée et en s'assurant de la disponibilité des produits.
3.  **Relance des focus :** Mettre l'accent sur les familles de produits en retard, en particulier la Tomate Frito et la Glace, en proposant des offres adaptées aux clients du secteur.
"""
    return report

def generate_fallback_report_global(summary_data):
    workdays = summary_data["workdays"]
    ca_ttc = summary_data["agency_totals"]["total_real_ca_ttc"]
    obj_ttc = summary_data["agency_totals"]["total_obj_ca_ttc"]
    rate = summary_data["agency_totals"]["achievement_rate_ca"]
    
    report = f"""**RAPPORT DE PERFORMANCE GLOBAL DE L'AGENCE (AGADIR)**
**Période : En cours ({workdays['elapsed']} jours écoulés sur {workdays['total']} jours)**

**1. INTRODUCTION ET ANALYSE GLOBALE DU CHIFFRE D'AFFAIRES**
L'analyse de performance globale pour la région d'Agadir, couvrant {workdays['elapsed']} jours écoulés sur {workdays['total']} jours de travail pour le mois en cours, révèle les résultats suivants :
*   **Chiffre d'Affaires Réel Global (TTC) :** {ca_ttc:,.0f} MAD
*   **Objectif Global (TTC) :** {obj_ttc:,.0f} MAD
*   **Taux d'Atteinte Global :** {rate}

**2. PERFORMANCE DES VENDEURS**
**2.1. Top Performers (Taux d'atteinte le plus élevé) :**

| Vendeur | Réalisé (DH) | Objectif (DH) | Taux de réalisation (%) |
| :--- | :---: | :---: | :---: |
"""
    for v in summary_data["top_performing_sellers"][:5]:
        pct_sign = "+" if v["pct"] >= 0 else ""
        report += f"| **{v['vendeur']}** | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% |\n"

    report += """
**2.2. Bottom Performers (Vendeurs nécessitant un suivi) :**

| Vendeur | Réalisé (DH) | Objectif (DH) | Taux de réalisation (%) |
| :--- | :---: | :---: | :---: |
"""
    for v in summary_data["bottom_performing_sellers"][:5]:
        pct_sign = "+" if v["pct"] >= 0 else ""
        report += f"| **{v['vendeur']}** | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% |\n"

    report += """
**3. PERFORMANCE PAR FAMILLE DE PRODUIT**
Classement des familles de produits par taux de réalisation :

| Famille | Réalisé (DH) | Objectif (DH) | Taux de réalisation (%) |
| :--- | :---: | :---: | :---: |
"""
    for f in summary_data["families_performance"]:
        pct_sign = "+" if f["pct"] >= 0 else ""
        report += f"| **{f['famille']}** | {f['real']:,.0f} | {f['obj']:,.0f} | {pct_sign}{f['pct']:.1f}% |\n"

    report += f"""
**4. ANALYSE QUALITATIVE GLOBALE**
Voici les taux de visite et de commande consolidés pour l'agence :

| Indicateur | Valeur Moyenne |
| :--- | :---: |
| **Taux de visite moyen (ACM)** | {summary_data['qualitative_averages']['average_acm_rate']} |
| **Taux de commande moyen (TSM)** | {summary_data['qualitative_averages']['average_tsm_rate']} |

**5. PERFORMANCE DES FOCUS PRODUITS**
*   **Focus Tomate Frito (VMM) :**
"""
    if summary_data["focus_vmm_summary"]:
        report += "| Vendeur | Secteur | Réalisé | Objectif ACM | Taux |\n| :--- | :--- | :---: | :---: | :---: |\n"
        for f in summary_data["focus_vmm_summary"][:5]:
            report += f"| **{f['vendeur']}** | {f['secteur']} | {f['realise']:,.0f} | {f['obj_acm']:,.0f} | {f['percent']} |\n"
    else:
        report += "Aucune donnée focus VMM.\n"

    report += """
*   **Focus Glace (SOM) :**
"""
    if summary_data["focus_som_summary"]:
        report += "| Vendeur | Secteur | Réalisé (DH) | Objectif (DH) | Taux |\n| :--- | :--- | :---: | :---: | :---: |\n"
        for f in summary_data["focus_som_summary"][:5]:
            report += f"| **{f['vendeur']}** | {f['secteur']} | {f['realise']:,.0f} | {f['ttc']:,.0f} | {f['percent']} |\n"
    else:
        report += "Aucune donnée focus SOM.\n"

    report += f"""
**6. RECOMMANDATIONS STRATÉGIQUES POUR LES {workdays['rest']} JOURS RESTANTS**
1.  **Fiabilisation et suivi quotidien :** Identifier les vendeurs n'ayant réalisé aucune vente et effectuer des coachings terrain ciblés pour relancer l'activité.
2.  **Amélioration du taux de conversion (TSM) :** Mettre en place des argumentaires produit simples et efficaces pour les familles en retard comme la Levure et les Condiments.
3.  **Relance active des focus :** Suivre de près les approvisionnements et la distribution des produits focus (Tomate Frito et Glace) auprès des principaux points de vente de la région.
"""
    return report

def generate_fallback_report_category(category, summary_data):
    workdays = summary_data["workdays"]
    ca_ttc = summary_data["agency_totals"]["total_real_ca_ttc"]
    obj_ttc = summary_data["agency_totals"]["total_obj_ca_ttc"]
    rate = summary_data["agency_totals"]["achievement_rate_ca"]
    
    report = f"""**RAPPORT DE PERFORMANCE - CATÉGORIE : {category}**
**Période : En cours ({workdays['elapsed']} jours écoulés sur {workdays['total']} jours)**

**1. INTRODUCTION ET ANALYSE GLOBALE DE LA CATÉGORIE**
L'analyse de performance pour la catégorie de vendeurs "{category}" (région d'Agadir), couvrant {workdays['elapsed']} jours de travail sur {workdays['total']}, donne les indicateurs consolidés suivants :
*   **Chiffre d'Affaires Réel Consolidé (TTC) :** {ca_ttc:,.0f} MAD
*   **Objectif Consolidé (TTC) :** {obj_ttc:,.0f} MAD
*   **Taux d'Atteinte Consolidé :** {rate}

**2. CLASSEMENT DES PERFORMANCE DES VENDEURS DE LA CATÉGORIE**
**2.1. Top Performers :**

| Vendeur | Réalisé (DH) | Objectif (DH) | Taux de réalisation (%) |
| :--- | :---: | :---: | :---: |
"""
    for v in summary_data["top_performing_sellers"][:5]:
        pct_sign = "+" if v["pct"] >= 0 else ""
        report += f"| **{v['vendeur']}** | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% |\n"

    report += """
**2.2. Bottom Performers (Vendeurs en retard) :**

| Vendeur | Réalisé (DH) | Objectif (DH) | Taux de réalisation (%) |
| :--- | :---: | :---: | :---: |
"""
    for v in summary_data["bottom_performing_sellers"][-5:]:
        pct_sign = "+" if v["pct"] >= 0 else ""
        report += f"| **{v['vendeur']}** | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% |\n"

    report += """
**3. PERFORMANCE PAR FAMILLE DE PRODUIT**
Réalisation par famille de produits triée par performance pour cette catégorie :

| Famille | Réalisé (DH) | Objectif (DH) | Taux de réalisation (%) |
| :--- | :---: | :---: | :---: |
"""
    for f in summary_data["families_performance"]:
        pct_sign = "+" if f["pct"] >= 0 else ""
        report += f"| **{f['famille']}** | {f['real']:,.0f} | {f['obj']:,.0f} | {pct_sign}{f['pct']:.1f}% |\n"

    report += f"""
**4. INDICATEURS QUALITATIFS COMMERCIAUX**
Voici les taux de visite et de commande consolidés pour cette catégorie :

| Indicateur | Valeur Moyenne |
| :--- | :---: |
| **Taux de couverture moyen (ACM)** | {summary_data['qualitative_averages']['average_acm_rate']} |
| **Taux de commande moyen (TSM)** | {summary_data['qualitative_averages']['average_tsm_rate']} |

**5. PERFORMANCE DES FOCUS DE LA CATÉGORIE**
*   **Focus Tomate Frito (VMM) :**
"""
    if summary_data["focus_vmm_summary"]:
        report += "| Vendeur | Secteur | Réalisé | Objectif ACM | Taux |\n| :--- | :--- | :---: | :---: | :---: |\n"
        for f in summary_data["focus_vmm_summary"]:
            report += f"| **{f['vendeur']}** | {f['secteur']} | {f['realise']:,.0f} | {f['obj_acm']:,.0f} | {f['percent']} |\n"
    else:
        report += "Aucun focus Tomate Frito configuré pour cette catégorie.\n"

    report += """
*   **Focus Glace (SOM) :**
"""
    if summary_data["focus_som_summary"]:
        report += "| Vendeur | Secteur | Réalisé (DH) | Objectif (DH) | Taux |\n| :--- | :--- | :---: | :---: | :---: |\n"
        for f in summary_data["focus_som_summary"]:
            report += f"| **{f['vendeur']}** | {f['secteur']} | {f['realise']:,.0f} | {f['ttc']:,.0f} | {f['percent']} |\n"
    else:
        report += "Aucun focus Glace configuré pour cette catégorie.\n"

    report += f"""
**6. RECOMMANDATIONS POUR LES {workdays['rest']} JOURS RESTANTS**
1.  **Suivi individualisé :** Accompagner en priorité les vendeurs du bas de classement de la catégorie "{category}" pour redresser leur chiffre d'affaires.
2.  **Animation qualitative :** Augmenter le nombre moyen de visites (ACM) et le taux de succès (TSM) au sein de cette catégorie.
3.  **Alignement sur les focus :** Relancer les ventes de Tomate Frito et de Glace en affectant des objectifs de placement quotidiens aux vendeurs.
"""
    return report

def build_prompt_sections(options):
    """Build the prompt sections based on selected options"""
    sections = []

    if options.get("quanti", True):
        sections.append("""
2. **Analyse Quantitative (Performance des Ventes) :**
   - Présente un tableau de performance quantitative par famille de produits (contenant exactement ces colonnes : Famille, Réalisé (DH), Objectif (DH), Taux de Réalisation (%), Réal 2025 (DH), Obj Mois (DH), Reste à Faire (RAF)).
   - Analyse les points forts et les axes d'amélioration par famille de produits.
   - Identifie les familles en retard et les opportunités de croissance.
        """)

    if options.get("quali", True):
        sections.append("""
3. **Analyse Qualitative (Suivi Clients) :**
   - Présente un tableau de performance qualitative (contenant exactement ces colonnes : Clients Programmés, Clients Facturés, Taux de couverture ACM (%), Taux de commande TSM (%), Performance LINE (%), RAF TSM, RAF ACM).
   - Analyse le taux de visites (ACM), le taux de transformation (TSM) et la performance LINE.
   - Identifie les actions correctives pour améliorer la couverture terrain.
        """)

    if options.get("focus", True):
        sections.append("""
4. **Analyse des Focus Produits :**
   - Présente un tableau des performances sur les focus Tomate Frito (VMM) et Glace (SOM).
   - Analyse les secteurs et vendeurs en retard sur les focus.
   - Propose des actions spécifiques pour relancer les focus produits.
        """)

    if options.get("anomali", False):
        sections.append("""
5. **Détection des Anomalies :**
   - Identifie les anomalies dans les données (vendeurs sans ventes, objectifs non atteints, écarts significatifs).
   - Liste les vendeurs nécessitant une attention particulière.
   - Propose des actions correctives immédiates.
        """)

    if options.get("rappel", False):
        sections.append("""
6. **Rappels Importants :**
   - N'oublie pas de mentionner les objectifs clés à atteindre.
   - Rappel des deadlines importantes et des priorités.
   - Points d'attention spécifiques pour les jours restants.
        """)

    return "\n".join(sections)


def generate_report(vendeur=None, category=None, date=None, options=None, return_data=False):
    print(f"Loading data (vendeur={vendeur}, category={category}, date={date}, options={options})...")

    # Default options: include all if not specified
    if options is None:
        options = {
            "quanti": True,
            "quali": True,
            "focus": True,
            "anomali": False,
            "rappel": False
        }

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
        # Ensure processed excel is ready
        p.get_day_work()
        p.fix_sheet()
        data = p.get_data()
    
    # Filter data if category is specified
    if category and category != "All":
        allowed = get_categorie(category)
        if not isinstance(allowed, list):
            allowed = [allowed]
        allowed_set = {v.strip().upper() for v in allowed if v}
        data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() in allowed_set]
        data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() in allowed_set]
        data["focus_vmm"] = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() in allowed_set]
        data["focus_som"] = [r for r in data["focus_som"] if r["vendeur"].strip().upper() in allowed_set]
        
    # Save unfiltered data for comparison metrics when vendeur is specified
    unfiltered_quanti = data.get("quantitative", [])
    unfiltered_quali = data.get("qualitative", [])
    
    # Filter data if seller is specified
    if vendeur:
        v_name = vendeur.strip().upper()
        if v_name == "AUTRE":
            # Find all configured sellers in Focus sheets (excluding virtual 'AUTRE' itself)
            configured_sellers = {f["vendeur"].strip().upper() for f in data["focus_vmm"] + data["focus_som"] if f["vendeur"].strip().upper() != "AUTRE"}
            
            data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() not in configured_sellers]
            data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() not in configured_sellers]
            
            data["focus_vmm"] = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() == "AUTRE"]
            data["focus_som"] = [r for r in data["focus_som"] if r["vendeur"].strip().upper() == "AUTRE"]
        else:
            data["quantitative"] = [r for r in data["quantitative"] if r["vendeur"].strip().upper() == v_name]
            data["qualitative"] = [r for r in data["qualitative"] if r["vendeur"].strip().upper() == v_name]
            
            orig_vmm = [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() == v_name]
            data["focus_vmm"] = orig_vmm if orig_vmm else [r for r in data["focus_vmm"] if r["vendeur"].strip().upper() == "AUTRE"]
            
            orig_som = [r for r in data["focus_som"] if r["vendeur"].strip().upper() == v_name]
            data["focus_som"] = orig_som if orig_som else [r for r in data["focus_som"] if r["vendeur"].strip().upper() == "AUTRE"]
    # 1. Summarize quantitative data
    quanti = data["quantitative"]
    ca_records = [r for r in quanti if r["famille"] in ("C.A (ht)", "C.A (TTC)")]
    
    total_real = sum(r["real"] for r in ca_records)
    total_obj = sum(r["obj"] for r in ca_records)
    total_pct = (total_real / total_obj - 1.0) * 100 if total_obj > 0 else -100
    
    # Sort sellers by performance
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
    
    # Build agency-wide ranking from UNFILTERED data (when vendeur is specified)
    # so we can compare this vendeur to peers
    agency_ranking = list(vendeurs_perf)  # default: same as filtered
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
    
    # Product families performance (including C.A (ht))
    families = {}
    for r in quanti:
        if r["famille"] not in families:
            families[r["famille"]] = {"real": 0, "obj": 0, "real_2025": 0, "obj_mois": 0, "raf": 0}
        families[r["famille"]]["real"] += r["real"]
        families[r["famille"]]["obj"] += r["obj"]
        families[r["famille"]]["real_2025"] += r["real_2025"]
        families[r["famille"]]["obj_mois"] += r["obj_mois"]
        families[r["famille"]]["raf"] += r["raf"]
            
    fam_perf_normal = []
    ca_perf = None
    for f, vals in families.items():
        real = vals["real"]
        obj = vals["obj"]
        pct = (real / obj - 1.0) * 100 if obj > 0 else -100
        item = {
            "famille": f,
            "real": real,
            "obj": obj,
            "pct": pct,
            "pct_str": f"{pct:+.1f}%",
            "real_2025": vals["real_2025"],
            "obj_mois": vals["obj_mois"],
            "raf": vals["raf"]
        }
        if f.strip().upper() in ("C.A (HT)", "C.A (TTC)"):
            ca_perf = item
        else:
            fam_perf_normal.append(item)
            
    fam_perf_normal.sort(key=lambda x: x["pct"], reverse=True)
    fam_perf = fam_perf_normal
    if ca_perf:
        fam_perf.append(ca_perf)
    
    # 2. Summarize qualitative data
    quali = data["qualitative"]
    avg_acm = sum(r["acm"] for r in quali) / len(quali) * 100 if quali else 0.0
    avg_tsm = sum(r["tsm"] for r in quali) / len(quali) * 100 if quali else 0.0
    
    vendeur_qualitative = data["qualitative"][0] if data["qualitative"] else None
    
    # 3. Summarize Focus VMM & Focus SOM
    focus_vmm = data["focus_vmm"]
    focus_som = data["focus_som"]
    
    # Formulate Prompt Data
    summary_data = {
        "workdays": data["workdays"],
        "agency_totals": {
            "total_real_ca_ttc": total_real,
            "total_obj_ca_ttc": total_obj,
            "achievement_rate_ca": f"{total_real/total_obj*100:.1f}%" if total_obj > 0 else "0%",
            "variance_rate_ca": f"{((total_real/total_obj) - 1.0)*100:+.1f}%" if total_obj > 0 else "-100.0%"
        },
        "top_performing_sellers": vendeurs_perf[:5],
        "bottom_performing_sellers": vendeurs_perf[-5:],
        "families_performance": fam_perf,
        "qualitative_averages": {
            "average_acm_rate": f"{avg_acm:.1f}%",
            "average_tsm_rate": f"{avg_tsm:.1f}%"
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
        "focus_vmm_summary": [
            {"vendeur": f["vendeur"], "secteur": f["secteur"], "obj_acm": f["obj_acm"], "realise": f["realise"], "percent": f"{f['percent']*100:.1f}%"}
            for f in focus_vmm
        ],
        "focus_som_summary": [
            {"vendeur": f["vendeur"], "secteur": f["secteur"], "ttc": f["ttc"], "realise": f["realise"], "percent": f"{f['percent']*100:.1f}%"}
            for f in focus_som
        ]
    }
    
    # Add positioning/rank metrics when a specific vendeur is requested
    if vendeur and agency_ranking:
        v_name = vendeur.strip().upper()
        # Find vendeur in agency ranking
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
    
    if vendeur:
        prompt_sections = build_prompt_sections(options)
        # Build positioning context
        positioning = summary_data.get("positioning", {})
        if positioning:
            rank = positioning["rank"]
            total = positioning["total_sellers"]
            v_pct = positioning["vendeur_pct"]
            avg_pct = positioning["agency_average_pct"]
            ecart = positioning["ecart_vs_moyenne"]
            top = positioning.get("top_performer", {}) or {}
            bottom = positioning.get("bottom_performer", {}) or {}
            top_name = top.get("vendeur", "-")
            top_pct = top.get("pct_str", "-")
            bottom_name = bottom.get("vendeur", "-")
            bottom_pct = bottom.get("pct_str", "-")
            positioning_block = f"""
1.5. **Positionnement du vendeur (comparaison agence) :**
   - {vendeur} se classe **#{rank} sur {total} vendeurs** actifs de l'agence.
   - Son taux d'écart objectif est de **{v_pct}** ; la moyenne de l'agence est de **{avg_pct}** (écart vs moyenne : **{ecart}**).
   - Meilleur performer de l'agence : **{top_name}** ({top_pct}).
   - Vendeur le plus en retard : **{bottom_name}** ({bottom_pct}).
   - Commente explicitement le positionnement de {vendeur} (est-il en avance, dans la moyenne, ou en retard par rapport à ses pairs ?) et l'écart concret en points par rapport à la moyenne de l'agence."""
        else:
            positioning_block = ""

        prompt = f"""Tu es un analyste commercial senior et un coach de force de vente. Analyse les indicateurs clés de performance (KPI) individuels suivants du vendeur {vendeur} (région AGADIR) pour la période en cours.
Rédige un rapport de performance individuel détaillé, constructif et motivant en français pour ce vendeur.

1. **Introduction :** Analyse des résultats de chiffre d'affaires de {vendeur} par rapport à ses objectifs de vente individuels. Mentionne explicitement le taux d'atteinte de {summary_data['agency_totals']['achievement_rate_ca']} et le pourcentage d'écart de {summary_data['agency_totals']['variance_rate_ca']} fournis dans 'agency_totals'.
{positioning_block}

{prompt_sections}

**Plan d'Action :** Fournis un plan d'action individuel précis et des conseils concrets pour lui permettre d'atteindre ses objectifs d'ici les {data["workdays"]["rest"]} jours restants. Inclus un objectif chiffré de "Reste à Faire" (RAF) quotidien à atteindre pour combler l'écart avec l'objectif.

IMPORTANT : Utilise uniquement les taux d'atteinte et pourcentages d'écart pré-calculés dans les données JSON (clés 'achievement_rate_ca', 'variance_rate_ca', 'pct_str', 'ecart_vs_moyenne'). Ne fais aucun calcul toi-même.

Données KPI de performance de {vendeur} :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    elif category and category != "All":
        prompt_sections = build_prompt_sections(options)
        prompt = f"""Tu es un analyste commercial senior. Analyse les indicateurs clés de performance (KPI) suivants pour la catégorie de vendeurs "{category}" (région AGADIR) pour la période en cours.
Rédige un rapport commercial détaillé, professionnel, structuré en français pour cette catégorie.

1. **Introduction :** Analyse globale du chiffre d'affaires de la catégorie {category} par rapport aux objectifs. Mentionne le taux d'atteinte de {summary_data['agency_totals']['achievement_rate_ca']} et le pourcentage d'écart de {summary_data['agency_totals']['variance_rate_ca']} fournis dans 'agency_totals'.

2. **Top & Bottom Performers :** Présente des tableaux des Top et Bottom Performers de la catégorie (Vendeur, Réalisé (DH), Objectif (DH), Taux de Réalisation (%)).

{prompt_sections}

**Recommandations Stratégiques :** Fournis des recommandations stratégiques précises pour atteindre les objectifs mensuels de cette catégorie d'ici les {data["workdays"]["rest"]} jours restants.

IMPORTANT : Utilise uniquement les taux d'atteinte et pourcentages d'écart pré-calculés dans les données JSON. Ne fais aucun calcul toi-même.

Données KPI de la catégorie {category} :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    else:
        prompt_sections = build_prompt_sections(options)
        prompt = f"""Tu es un analyste commercial senior. Analyse les indicateurs clés de performance (KPI) suivants de la force de vente MADEC (région AGADIR) pour la période en cours.
Rédige un rapport commercial détaillé, professionnel, structuré en français.

1. **Introduction :** Analyse globale du chiffre d'affaires par rapport aux objectifs. Mentionne le taux d'atteinte de {summary_data['agency_totals']['achievement_rate_ca']} et le pourcentage d'écart de {summary_data['agency_totals']['variance_rate_ca']} fournis dans 'agency_totals'.

2. **Top & Bottom Performers :** Présente des tableaux des Top et Bottom Performers de l'agence (Vendeur, Réalisé (DH), Objectif (DH), Taux de Réalisation (%)).

{prompt_sections}

**Recommandations Stratégiques :** Fournis des recommandations stratégiques précises pour atteindre les objectifs mensuels d'ici les {data["workdays"]["rest"]} jours restants.

IMPORTANT : Utilise uniquement les taux d'atteinte et pourcentages d'écart pré-calculés dans les données JSON. Ne fais aucun calcul toi-même.

Données KPI de la force de vente :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    
    # Call OpenRouter API
    print("Calling OpenRouter API...")
    api_key = os.getenv("OPENROUTER_API_KEY")
    content = None
    
    if api_key:
        url = "https://openrouter.ai/api/v1/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:5000",
            "X-Title": "MADEC KPI Analyzer"
        }
        
        body = {
            "model": "google/gemini-2.5-flash",
            "messages": [
                {
                    "role": "system", 
                    "content": (
                        "Tu es un analyste commercial senior spécialisé dans la force de vente et l'optimisation des ventes. "
                        "CONSIGNE DE RIGUEUR MATHÉMATIQUE ABSOLUE : Tu dois utiliser uniquement les taux d'atteinte (achievement_rate_ca) "
                        "et les pourcentages d'écart/variance (variance_rate_ca, pct_str) fournis dans les données JSON de manière stricte. "
                        "Ne fais aucun calcul d'écart ou de pourcentage toi-même. "
                        "Assure-toi que toutes les valeurs numériques, les pourcentages d'atteinte et les écarts mentionnés dans ton texte rédigé "
                        "soient à 100% identiques et cohérents avec ceux des tableaux Markdown et des données JSON. "
                        "Par exemple, si le taux d'atteinte global (achievement_rate_ca) est de 97.7%, l'écart de chiffre d'affaires correspondant "
                        "(variance_rate_ca) est de -2.3% (et en aucun cas -2.7% ou autre valeur calculée de manière erronée)."
                    )
                },
                {"role": "user", "content": prompt}
            ]
        }
        
        try:
            req = urllib.request.Request(url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST")
            with urllib.request.urlopen(req) as response:
                res_data = json.loads(response.read().decode("utf-8"))
                content = res_data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"Error calling OpenRouter: {e}. Falling back to local template generator.")
    else:
        print("OPENROUTER_API_KEY not found. Falling back to local template generator.")

    # Fallback to local template if OpenRouter failed or key not found
    if not content:
        if vendeur:
            content = f"""> [!NOTE]
> **Rapport de performance généré localement** (Impossible de contacter l'API OpenRouter, les données chiffrées ci-dessous restent 100% exactes et à jour).

""" + generate_fallback_report_vendeur(vendeur, summary_data)
        elif category and category != "All":
            content = f"""> [!NOTE]
> **Rapport de performance généré localement** (Impossible de contacter l'API OpenRouter, les données chiffrées ci-dessous restent 100% exactes et à jour).

""" + generate_fallback_report_category(category, summary_data)
        else:
            content = f"""> [!NOTE]
> **Rapport de performance généré localement** (Impossible de contacter l'API OpenRouter, les données chiffrées ci-dessous restent 100% exactes et à jour).

""" + generate_fallback_report_global(summary_data)

    # Save report to markdown
    output_file = "rapport_kpi.md"
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"\nReport successfully generated and saved to '{output_file}'!")
    except Exception as e:
        print(f"Error saving report: {e}")
        
    if return_data:
        return content, summary_data
    return content

if __name__ == "__main__":
    generate_report()
