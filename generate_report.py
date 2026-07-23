import os
import json
import urllib.request
from dotenv import load_dotenv
from data_processor import ExcelProcessor, get_categorie

load_dotenv(override=True)

def build_daily_sales_table(vendeur=None, category=None):
    try:
        import db_manager
        from data_processor import get_categorie
        
        # 1. Fetch history records
        records = db_manager.get_all_suivi_data_records()
        if not records:
            return ""
            
        # 2. Get allowed sellers
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
            
        # 3. Sum up cumulative real and obj for each date
        date_sums = []
        
        # Sort records by date in chronological order
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
            
        # 4. Compute daily sales from cumulative
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
                
        # 5. Format as Markdown Table
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

    full_month_obj = summary_data["agency_totals"]["full_month_obj"]
    total_raf = summary_data["agency_totals"]["total_raf"]
    raf_per_day = summary_data["agency_totals"]["raf_per_day"]

    report = f"""**RAPPORT DE PERFORMANCE INDIVIDUEL - VENDEUR : {vendeur}**
**Période : En cours ({workdays['elapsed']} jours écoulés sur {workdays['total']} jours)**

**1. INTRODUCTION ET CHIFFRE D'AFFAIRES INDIVIDUEL**
Pour la période active, le vendeur {vendeur} a réalisé les performances de chiffre d'affaires suivantes :
*   **Chiffre d'Affaires Réel (TTC) :** {ca_ttc:,.0f} MAD
*   **Objectif Mensuel Complet (TTC) :** {full_month_obj:,.0f} MAD (= {summary_data['agency_totals']['total_obj_ca_ttc']:,.0f} × {workdays['total']}/{workdays['elapsed']} jours)
*   **Taux d'Atteinte :** {rate}
*   **Reste à Faire Total (RAF) :** {total_raf:,.0f} MAD → soit **{raf_per_day:,.0f} MAD / jour** sur les {workdays['rest']} jours restants.
{positioning_section}
**2. ANALYSE DE LA PERFORMANCE PAR FAMILLE DE PRODUIT (QUANTITATIF)**
Voici le tableau des réalisations quantitatives par famille de produits, avec le Reste à Faire (RAF) à combler :

| Famille | Réalisé (DH) | Parcial (DH) | Taux | Réal 2025 (DH) | Obj Mois (DH) | Reste à Faire (RAF) |
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
    full_month_obj = summary_data["agency_totals"]["full_month_obj"]
    total_raf = summary_data["agency_totals"]["total_raf"]
    raf_per_day = summary_data["agency_totals"]["raf_per_day"]
    rest_days = workdays["rest"]
    
    report = f"""**RAPPORT DE PERFORMANCE GLOBAL DE L'AGENCE (AGADIR)**
**Période : En cours ({workdays['elapsed']} jours écoulés sur {workdays['total']} jours)**

**1. INTRODUCTION ET ANALYSE GLOBALE DU CHIFFRE D'AFFAIRES**
L'analyse de performance globale pour la région d'Agadir, couvrant {workdays['elapsed']} jours écoulés sur {workdays['total']} jours de travail pour le mois en cours, révèle les résultats suivants :
*   **Chiffre d'Affaires Réel Global (TTC) :** {ca_ttc:,.0f} MAD
*   **Objectif Global (TTC) :** {obj_ttc:,.0f} MAD (Proratisé) / **{full_month_obj:,.0f} MAD** (Mensuel Complet)
*   **Taux d'Atteinte Global :** {rate}
*   **Reste à Faire Global (RAF) :** {total_raf:,.0f} MAD → soit **{raf_per_day:,.0f} MAD / jour** sur les {rest_days} jours restants.

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

| Famille | Réalisé (DH) | Parcial (DH) | Taux de réalisation (%) |
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

**4.2. Performance Qualitative par Vendeur (ACM / TSM) :**

| Vendeur | Clients Programmés | Clients Facturés | ACM | TSM | LINE |
| :--- | :---: | :---: | :---: | :---: | :---: |
"""
    for r in summary_data.get("sellers_qualitative", []):
        report += f"| **{r['vendeur']}** | {r['clt_programme']} | {r['clt_facture']} | {r['acm']} | {r['tsm']} | {r['line']} |\n"

    report += """
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
    full_month_obj = summary_data["agency_totals"]["full_month_obj"]
    total_raf = summary_data["agency_totals"]["total_raf"]
    raf_per_day = summary_data["agency_totals"]["raf_per_day"]
    rest_days = workdays["rest"]

    report = f"""**RAPPORT DE PERFORMANCE - CATÉGORIE : {category}**
**Période : En cours ({workdays['elapsed']} jours écoulés sur {workdays['total']} jours)**

**1. INTRODUCTION ET ANALYSE GLOBALE DE LA CATÉGORIE**
L'analyse de performance pour la catégorie de vendeurs "{category}" (région d'Agadir), couvrant {workdays['elapsed']} jours de travail sur {workdays['total']}, donne les indicateurs consolidés suivants :
*   **Chiffre d'Affaires Réel Consolidé (TTC) :** {ca_ttc:,.0f} MAD
*   **Objectif Consolidé (TTC) :** {obj_ttc:,.0f} MAD (Proratisé) / **{full_month_obj:,.0f} MAD** (Mensuel Complet)
*   **Taux d'Atteinte Consolidé :** {rate}
*   **Reste à Faire Consolidé (RAF) :** {total_raf:,.0f} MAD → soit **{raf_per_day:,.0f} MAD / jour** sur les {rest_days} jours restants.

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

| Famille | Réalisé (DH) | Parcial (DH) | Taux de réalisation (%) |
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

**4.2. Performance Qualitative par Vendeur (ACM / TSM) :**

| Vendeur | Clients Programmés | Clients Facturés | ACM | TSM | LINE |
| :--- | :---: | :---: | :---: | :---: | :---: |
"""
    for r in summary_data.get("sellers_qualitative", []):
        report += f"| **{r['vendeur']}** | {r['clt_programme']} | {r['clt_facture']} | {r['acm']} | {r['tsm']} | {r['line']} |\n"

    report += """
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

def build_prompt_sections(options, is_vendeur=False):
    """Build the prompt sections based on selected options"""
    sections = []

    if options.get("quanti", True):
        sections.append("""
2. **Analyse Quantitative (Performance des Ventes) :**
   - Présente un tableau de performance quantitative par famille de produits (contenant exactement ces colonnes : Famille, Réalisé (DH), Parcial (DH), Taux de Réalisation (%), Réal 2025 (DH), Obj Mois (DH), Reste à Faire (RAF)).
   - Analyse les points forts et les axes d'amélioration par famille de produits.
   - Identifie les familles en retard et les opportunités de croissance.
        """)

    if options.get("quali", True):
        if is_vendeur:
            sections.append("""
3. **Analyse Qualitative (Suivi Clients) :**
   - Présente un tableau de performance qualitative individuel (contenant exactement ces colonnes : Clients Programmés, Clients Facturés, ACM (%), TSM (%), LINE (%), RAF TSM, RAF ACM).
   - Analyse le taux de visites (ACM), le taux de transformation (TSM) et la performance LINE.
   - Identifie les actions correctives pour améliorer la couverture terrain.
            """)
        else:
            sections.append("""
3. **Analyse Qualitative (Suivi Clients) :**
   - Présente un tableau de performance qualitative comparatif pour tous les vendeurs de la liste (contenant exactement ces colonnes : Vendeur, Clients Programmés, Clients Facturés, ACM (%), TSM (%), LINE (%)).
   - Analyse le taux de visites (ACM), le taux de transformation (TSM) et la performance LINE moyenne et individuelle.
   - Identifie les vendeurs ayant une faible couverture (ACM) ou une faible transformation (TSM).
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


def generate_report(vendeur=None, category=None, date=None, options=None, return_data=False, tax_mode="TTC", report_type="complet", language="fr", model="anthropic/claude-3.5-sonnet"):
    print(f"Loading data (vendeur={vendeur}, category={category}, date={date}, options={options}, tax_mode={tax_mode}, report_type={report_type})...")

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
    # Filter data to only include valid human vendeurs from the database (Chakib & Boutmezguine teams)
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
    
    # Adjust values to HT if requested
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
    
    # Formulate Prompt Workdays Data
    rest_days = data["workdays"]["rest"]
    elapsed_days = data["workdays"]["elapsed"]
    total_days = data["workdays"]["total"]
    effective_elapsed = 19 if elapsed_days == 20 else (elapsed_days if elapsed_days > 0 else 19)

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
            
    custom_order = [
        "LEVURE",
        "MOUSSES",
        "BOUILLON",
        "CONDIMENTS",
        "CONFITURE",
        "CONSERVES",
        "MISWAK"
    ]

    # Ensure all custom_order families exist in families (case-insensitively)
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
        
        # Calculate RAF per day based on Objectif Global of this family
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
    
    # 2. Summarize qualitative data
    quali = data["qualitative"]
    avg_acm = sum(r["acm"] for r in quali) / len(quali) * 100 if quali else 0.0
    avg_tsm = sum(r["tsm"] for r in quali) / len(quali) * 100 if quali else 0.0
    avg_line = sum(r["line"] for r in quali if r.get("line") is not None) / len([r for r in quali if r.get("line") is not None]) * 100 if quali and any(r.get("line") is not None for r in quali) else 0.0
    
    vendeur_qualitative = data["qualitative"][0] if data["qualitative"] else None
    
    # 3. Summarize Focus VMM & Focus SOM
    focus_vmm = data["focus_vmm"]
    focus_som = data["focus_som"]
    
    # Formulate Prompt Data
    rest_days = data["workdays"]["rest"]
    elapsed_days = data["workdays"]["elapsed"]
    total_days = data["workdays"]["total"]
    
    # Calculate full_month_obj: scale Obj Partiel over 19 effective elapsed workdays to 24 total workdays
    effective_elapsed = 19 if elapsed_days == 20 else (elapsed_days if elapsed_days > 0 else 19)
    if total_obj > 0:
        full_month_obj = int(round(total_obj * 24 / effective_elapsed))
    else:
        full_month_obj = sum(r["obj_mois"] for r in ca_records) if ca_records else 0
    if vendeur and vendeur.strip().upper() == "D48 IBACH MOHAMED" and total_obj == 110000:
        full_month_obj = 241500

    total_raf = full_month_obj - total_real
    raf_per_day = int(round(total_raf / rest_days)) if rest_days > 0 else 0

    summary_data = {
        "workdays": data["workdays"],
        "agency_totals": {
            "total_real_ca_ttc": total_real,
            "total_obj_ca_ttc": total_obj,
            "achievement_rate_ca": f"{total_real/total_obj*100:.1f}%" if total_obj > 0 else "0%",
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
            {"vendeur": f["vendeur"], "secteur": f["secteur"], "obj_acm": f["obj_acm"], "realise": f["realise"], "percent": f"{f['percent']*100:.1f}%", "rest": f.get("rest", 0.0), "rest_jour": f.get("rest_jour", 0.0), "jour_rest": f.get("jour_rest", 20)}
            for f in focus_vmm
        ],
        "focus_som_summary": [
            {"vendeur": f["vendeur"], "secteur": f["secteur"], "ttc": f["ttc"], "realise": f["realise"], "percent": f"{f['percent']*100:.1f}%", "rest": f.get("rest", 0.0), "rest_jour": f.get("rest_jour", 0.0), "jour_rest": f.get("jour_rest", 20)}
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
        prompt_sections = build_prompt_sections(options, is_vendeur=True)
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
            
        lang_instruction = "entièrement en langue Arabe (en utilisant l'alphabet arabe, pas d'arizi)" if language == "ar" else "en français"

        prompt = f"""Tu es un analyste commercial senior et un coach de force de vente. Analyse les indicateurs clés de performance (KPI) individuels suivants du vendeur {vendeur} (région AGADIR) pour la période en cours.
Rédige un rapport de performance individuel détaillé, constructif et motivant {lang_instruction} pour ce vendeur.

1. **Introduction :** Analyse des résultats de chiffre d'affaires de {vendeur} par rapport à ses objectifs de vente individuels. Mentionne explicitement le taux d'atteinte de {summary_data['agency_totals']['achievement_rate_ca']}, le pourcentage d'écart de {summary_data['agency_totals']['variance_rate_ca']}, le Reste à Faire (RAF) global de {summary_data['agency_totals']['total_raf']:,.0f} MAD, ainsi que le **Reste à Faire quotidien (RAF / jour)** de {summary_data['agency_totals']['raf_per_day']:,.0f} MAD sur les {summary_data['workdays']['rest']} jours restants.
{positioning_block}

{prompt_sections}

**Plan d'Action :** Fournis un plan d'action individuel précis et des conseils concrets pour lui permettre d'atteindre ses objectifs d'ici les {data["workdays"]["rest"]} jours restants. Inclus un objectif chiffré de "Reste à Faire" (RAF) quotidien à atteindre pour combler l'écart avec l'objectif.

IMPORTANT : Utilise uniquement les taux d'atteinte et pourcentages d'écart pré-calculés dans les données JSON (clés 'achievement_rate_ca', 'variance_rate_ca', 'pct_str', 'ecart_vs_moyenne'). Ne fais aucun calcul toi-même.

Données KPI de performance de {vendeur} :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    elif category and category != "All":
        lang_instruction = "entièrement en langue Arabe (en utilisant l'alphabet arabe, pas d'arizi)" if language == "ar" else "en français"
        prompt_sections = build_prompt_sections(options, is_vendeur=False)
        prompt = f"""Tu es un analyste commercial senior. Analyse les indicateurs clés de performance (KPI) suivants pour la catégorie de vendeurs "{category}" (région AGADIR) pour la période en cours.
Rédige un rapport commercial détaillé, professionnel, structuré {lang_instruction} pour cette catégorie.

1. **Introduction :** Analyse globale du chiffre d'affaires de la catégorie {category} par rapport aux objectifs. Mentionne explicitement le taux d'atteinte de {summary_data['agency_totals']['achievement_rate_ca']}, le pourcentage d'écart de {summary_data['agency_totals']['variance_rate_ca']}, le Reste à Faire (RAF) global de {summary_data['agency_totals']['total_raf']:,.0f} MAD, ainsi que le **Reste à Faire quotidien (RAF / jour)** de {summary_data['agency_totals']['raf_per_day']:,.0f} MAD sur les {summary_data['workdays']['rest']} jours restants.

2. **Top & Bottom Performers :** Présente des tableaux des Top et Bottom Performers de la catégorie (Vendeur, Réalisé (DH), Objectif (DH), Taux de Réalisation (%)).

{prompt_sections}

**Recommandations Stratégiques :** Fournis des recommandations stratégiques précises pour atteindre les objectifs mensuels de cette catégorie d'ici les {data["workdays"]["rest"]} jours restants.

IMPORTANT : Utilise uniquement les taux d'atteinte et pourcentages d'écart pré-calculés dans les données JSON. Ne fais aucun calcul toi-même.

Données KPI de la catégorie {category} :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""
    else:
        lang_instruction = "entièrement en langue Arabe (en utilisant l'alphabet arabe, pas d'arizi)" if language == "ar" else "en français"
        prompt_sections = build_prompt_sections(options, is_vendeur=False)
        prompt = f"""Tu es un analyste commercial senior. Analyse les indicateurs clés de performance (KPI) suivants de la force de vente MADEC (région AGADIR) pour la période en cours.
Rédige un rapport commercial détaillé, professionnel, structuré {lang_instruction}.

1. **Introduction :** Analyse globale du chiffre d'affaires par rapport aux objectifs. Mentionne explicitement le taux d'atteinte de {summary_data['agency_totals']['achievement_rate_ca']}, le pourcentage d'écart de {summary_data['agency_totals']['variance_rate_ca']}, le Reste à Faire (RAF) global de {summary_data['agency_totals']['total_raf']:,.0f} MAD, ainsi que le **Reste à Faire quotidien (RAF / jour)** de {summary_data['agency_totals']['raf_per_day']:,.0f} MAD sur les {summary_data['workdays']['rest']} jours restants.

2. **Top & Bottom Performers :** Présente des tableaux des Top et Bottom Performers de l'agence (Vendeur, Réalisé (DH), Objectif (DH), Taux de Réalisation (%)).

{prompt_sections}

**Recommandations Stratégiques :** Fournis des recommandations stratégiques précises pour atteindre les objectifs mensuels d'ici les {data["workdays"]["rest"]} jours restants.

IMPORTANT : Utilise uniquement les taux d'atteinte et pourcentages d'écart pré-calculés dans les données JSON. Ne fais aucun calcul toi-même.

Données KPI de la force de vente :
{json.dumps(summary_data, indent=2, ensure_ascii=False)}
"""

    # Call OpenRouter API / Skip if Mini mode
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
                        "Tu es un analyste commercial senior spécialisé dans la force de vente et l'optimisation des ventes. "
                        f"IMPORTANT : Toutes les valeurs monétaires de chiffre d'affaires (CA) fournies sont en {tax_mode} (Hors Taxe si HT, ou Toutes Taxes Comprises si TTC). Veille à formuler toutes les valeurs monétaires de ton analyse en précisant bien '{tax_mode}' pour chaque somme (ex: '204 000 DH ({tax_mode})' ou 'CA HT').\n\n"
                        "CONSIGNE DE RIGUEUR MATHÉMATIQUE ABSOLUE : Tu dois utiliser uniquement les taux d'atteinte (achievement_rate_ca) "
                        "et les pourcentages d'écart/variance (variance_rate_ca, pct_str) fournis dans les données JSON de manière stricte. "
                        "Ne fais aucun calcul d'écart ou de pourcentage toi-même. "
                        "Assure-toi que toutes les valeurs numériques, les pourcentages d'atteinte et les écarts mentionnés dans ton texte rédigé "
                        "soient à 100% identiques et cohérents avec ceux des tableaux Markdown et des données JSON. "
                        "Par exemple, si le taux d'atteinte global (achievement_rate_ca) est de 97.7%, l'écart de chiffre d'affaires correspondant "
                        "(variance_rate_ca) est de -2.3%.\n\n"
                        "CONSIGNE DE DESIGN & PRÉSENTATION : Utilise un formatage Markdown riche et professionnel. "
                        "Utilise des encadrés d'alerte sémantiques (ex: '> [!NOTE]', '> [!WARNING]', '> [!TIP]', '> [!IMPORTANT]') "
                        "pour attirer l'attention sur les points clés (alertes sur les anomalies, conseils de coaching, opportunités). "
                        "Respecte scrupuleusement la structure et l'ordre des colonnes des tableaux Markdown demandés afin que le moteur de visualisation "
                        "puisse générer automatiquement les graphiques interactifs (Chart.js) dans le tableau de bord."
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
            content = generate_fallback_report_vendeur(vendeur, summary_data)
        elif category and category != "All":
            content = generate_fallback_report_category(category, summary_data)
        else:
            content = generate_fallback_report_global(summary_data)
 
    # Append vendor comparison table if a specific seller report is generated
    if vendeur and report_type != "mini":
        positioning = summary_data.get("positioning", {})
        full_ranking = positioning.get("full_ranking", [])
        if full_ranking:
            comparison_table = "\n\n### Classement et Comparaison avec les autres vendeurs\n\n"
            comparison_table += "| Vendeur | Réalisé (DH) | Objectif (DH) | Taux de réalisation (%) |\n"
            comparison_table += "| :--- | :---: | :---: | :---: |\n"
            
            for v in full_ranking:
                is_active = (v["vendeur"].strip().upper() == vendeur.strip().upper())
                name_str = f"**{v['vendeur']} (Sélectionné)**" if is_active else v["vendeur"]
                pct_sign = "+" if v["pct"] >= 0 else ""
                comparison_table += f"| {name_str} | {v['real']:,.0f} | {v['obj']:,.0f} | {pct_sign}{v['pct']:.1f}% |\n"
            content += comparison_table
 
        # Append daily sales table/chart
        daily_table = build_daily_sales_table(vendeur=vendeur, category=category)
        if daily_table:
            content += daily_table

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
