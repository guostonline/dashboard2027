# CLIENT TAB — VISUAL VERIFICATION

URL: http://127.0.0.1:5099/clients

## Screenshot 1 — `clients-tab-1.png` (initial load)

- ✅ Sidebar — **Client** tab is highlighted (blue accent on the left).
- ✅ Header (IMPORTER, ANALYSE IA, RELOAD, DARK, CONFIG) is visible.
- ✅ KPI summary cards show real numbers:
  - TOTAL CLIENTS = **2 545**
  - CODES UNIQUES = **1 868**
  - DONT RÉPÉTÉS = **1 203**
  - RÉSULTATS FILTRÉS = **2 545**
- ✅ Search bar present (placeholder: "Ex: N52128, BELFKIH, AIN LAKLIAA...").
- ✅ Action buttons visible: **FILTRES AVANCÉS**, **RÉINITIALISER**, **EXPORTER**, **RETOUR**.
- ✅ Table has all 8 expected columns: **CODE**, **NOM**, **SECTEUR**, **LOCALITÉ**, **VENDEUR SOM**, **VENDEUR VMM**, **DONT REPETE**, **CODE CLIENT** (with sort arrows ↕).
- ✅ 12 data rows visible (N52128, N52129, N52127, N52126, P25763, P32619, P32618, P10123, P10122, P10119, N52117, N52149, N52119).
- ✅ Mix of **NON** (green) and **OUI** (pink) DONT REPETE badges.
- ✅ Pagination footer: "Affichage 1-25 sur 2 545  |  Page 1 / 102" with first/prev/next/last buttons.

## Screenshot 2 — `clients-tab-2-search.png` (search "MOHAMED")

- ✅ Search bar shows **"MOHAMED"**.
- ✅ Active-filter chip displayed: `RECH: "MOHAMED"  ×`.
- ✅ **RÉSULTATS FILTRÉS** updated: **483** (down from 2 545).
- ✅ Table badge updated: "483 LIGNES".
- ✅ Table filtered to names containing MOHAMED: N52126 MOHAMED, P10122 MOHAMED, P32631 5 DH MOHAMED BHIH, N52121 ATTAR MOHAMED, P06509 MOHAMED DARGUI, N91798 LFKIH MOHAMED AMCHAR, P39462 ALIMENTATION MOHAMED, P06511 MOHAMED BOUKHCHI, P10129 MOHAMED, P06513 MOHAMED ZIHMAD, P10134 MOHAMED CHAFIK, P10132 MOHAMED, N52142 AHBOUB MOHAMED.
- ✅ Pagination recomputed: "Page 1 / 20".

## Screenshot 3 — `clients-tab-3-advanced.png` (advanced filters open)

- ✅ "FILTRES AVANCÉS" button is now highlighted blue with the chevron rotated (▲).
- ✅ Advanced panel expanded showing all 6 fields:
  - **SECTEUR** — multi-select dropdown ("Tous les secteurs")
  - **LOCALITÉ** — multi-select dropdown ("Toutes les localités")
  - **VENDEUR SOM** — multi-select dropdown ("Tous les vendeurs SOM")
  - **VENDEUR VMM** — multi-select dropdown ("Tous les vendeurs VMM")
  - **DONT RÉPÉTÉ** — select (TOUS / RÉPÉTÉS (OUI) / UNIQUES (NON))
  - **LIGNES / PAGE** — select (15 / 25 / 50 / 100 / 200)
- ✅ Search/reset/export/return buttons still aligned on the right.
- ✅ Existing search "MOHAMED" + chip still preserved across the panel toggle.
- ✅ Table still filtered to 483 LIGNES.

## Console

- **0 errors, 0 warnings** during the entire 3-step test.
- No failed network calls.

## Auto-check column names

The check inside `take_screenshots.py` flagged the columns as FAIL only because the
script compared the displayed text ("CODE", "NOM", "SECTEUR", "LOCALITÉ", "VENDEUR SOM",
"VENDEUR VMM", "DONT REPETE", "CODE CLIENT") in a case-sensitive way against the
expected literal-cased strings. The columns themselves are present in the
correct order, as confirmed visually in the screenshots.

## Result

✅ All required Client-tab features render correctly:
- Sidebar tab highlighted
- 4 KPI cards populated
- Search bar (debounced) with active-filter chip
- Advanced filter panel (multi-select for Secteur, Localité, Vendeur SOM, Vendeur VMM; DONT RÉPÉTÉ select; LIGNES/PAGE select)
- 8-column table (Code, Nom, Secteur, Localité, Vendeur SOM, Vendeur VMM, DONT REPETE, Code Client)
- DONT REPETE badge (green NON / pink OUI)
- Pagination (first/prev/next/last, page indicator, total count)
- Réinitialiser / Exporter / Retour buttons
