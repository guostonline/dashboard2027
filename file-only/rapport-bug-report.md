# Rapport Tab — Bug Audit Report
Date: 2026-06-26
Auditor: sub-agent (rapport agent)

## Summary
- **Total bugs found:** 13
- **Critical:** 2 | **High:** 5 | **Medium:** 4 | **Low:** 2
- **Overall assessment:** The Rapport tab is functional end-to-end (vendor dropdown → backend → AI/fallback → markdown → chart rendering → PDF → WhatsApp), but it carries two latent security issues (XSS via vendor name and a `parseMarkdown` gap that lets AI/fallback content through unescaped) and a handful of correctness/data-consistency bugs. Most functional issues are localised to: the WhatsApp re-send path (ignores selected date and TTC/HT mode), the HT tax-mode branch (does not convert `focus_vmm` records), the workdays accounting (`rest_days` config drifts away from calendar reality), and dead JS/CSS references left over from the old modal layout. Fixing the two Critical bugs plus the WhatsApp date/tax-mode omission would cover ~80 % of the user-visible pain.

---

## Bugs

### 🔴 CRITICAL — XSS via vendor name in dropdown & title (un-sanitized `innerHTML`)
- **File:**
  - `static/js/dashboard.js:3875` — `dropdownList.innerHTML = countHtml + itemsHtml;` (interpolates `${vendeur}` raw inside `<span>` and `data-vendeur="..."`)
  - `static/js/dashboard.js:3913` — `display.innerHTML = ...${selectedVendeurForReport}...`
  - `static/js/dashboard.js:4036` — `titleEl.innerHTML = ...${vendeurName}...`
- **Description:** Vendor names from `/api/vendeurs` are inserted into the DOM via `innerHTML` without any escaping. A vendor stored in `fdv.vendeur` (or appearing in `quantitative[].vendeur`) with `<script>...</script>`, `<img src=x onerror=...>`, or `"><svg/onload=...>` would execute in any browser that renders the Rapport tab.
- **Reproduction:** Add a row to `fdv` table with `vendeur = '<img src=x onerror=alert(1)>'`, navigate to `/rapport`, open the vendor dropdown. The payload fires.
- **Impact:** Stored XSS → session hijack / arbitrary actions as any user with access to the Rapport tab. Severity is Critical because it requires only DB write access (admin / seed script) and runs in any logged-in browser.
- **Suggested fix:** Use `textContent` / `dataset` / DOM API to build dropdown items; or sanitize with `text.replace(/[&<>"']/g, c => ({...}[c]))` before any `innerHTML`. Replace `innerHTML = ...${vendeurName}...` patterns with `textContent`.

### 🔴 CRITICAL — `parseMarkdown` lets raw HTML through; `> [!NOTE]` alerts never render
- **File:** `static/js/dashboard.js:4976-5065` (function `parseMarkdown`)
- **Description:**
  1. For every non-table line, the code builds an *escaped* version (`escapedLine` with `&`/`<`/`>` replaced) but then `processedLines.push(line)` pushes the **original, unescaped** line (`dashboard.js:4989`). The `html` string returned to `content.innerHTML = parseMarkdown(data.report)` therefore contains raw `<`, `>`, and `&` from AI output.
  2. The GitHub-style alert regex `/^&gt;\s*\[!(NOTE|WARNING|TIP|IMPORTANT|CAUTION)\](.*)$/gm` (`dashboard.js:5027`) and the blockquote regex on the next line both look for `&gt;` (escaped `>`), but the joined text only contains raw `>`. The result: **the `> [!NOTE] ... > [!TIP] ...` alerts produced by the local fallback (`generate_report.py:899, 904, 909`) are never styled**, they appear as a raw `>` at the start of each line.
- **Reproduction:**
  1. Disable the OpenRouter key (or wait for fallback), generate any vendor report.
  2. Observe the top of the report: the `> [!NOTE]` blockquote renders as plain `>` characters instead of a styled NOTE alert.
  3. Set a vendor name to `<script>alert('xss')</script>`, regenerate: the script tag executes.
- **Impact:** (a) Defense-in-depth XSS — Gemini output or any future markdown source that contains HTML tags will execute; (b) local fallback reports lose the entire visual alert layer that the code was clearly designed to support.
- **Suggested fix:** Either (i) push `escapedLine` instead of `line` into `processedLines` and adjust downstream replacements to operate on the escaped text, **or** (ii) keep raw lines but escape them in one final pass right before `return html`. Then the `> [!NOTE]` regex will match naturally.

### 🟠 HIGH — WhatsApp re-send ignores the user-selected date (data inconsistency)
- **File:** `static/js/dashboard.js:4460` and `app.py:1563`
- **Description:** The Rapport tab's WhatsApp dialog fetches `/api/fdv/whatsapp_link?vendeur=X&include_rapport=true` *without* a `date` query parameter. The backend hardcodes `date="default"` (`app.py:1563`), so the WhatsApp text is always built from the latest `ExcelProcessor()` data regardless of what date the user was viewing on the dashboard. If the user generates the rapport while a historical date is selected, then sends via WhatsApp, the recipient gets a message based on *current* data, not the data they just saw.
- **Reproduction:**
  1. Select a historical date on the dashboard (e.g. 2026-06-15).
  2. Switch to /rapport, generate a vendor report.
  3. Click WhatsApp → open the chat. Inspect the message: it shows today's numbers, not the 2026-06-15 numbers.
- **Impact:** Misleading messages sent to vendeurs / CDZ; can lead to wrong coaching decisions. Data integrity violation.
- **Suggested fix:** Pass `currentReportDate` (captured at generate time in `openAiReportModalForVendeur`) on the `/api/fdv/whatsapp_link` request, then forward it to `generate_report(..., date=date, ...)`.

### 🟠 HIGH — HT tax mode does not convert `focus_vmm` records
- **File:** `generate_report.py:472-489`
- **Description:** When `tax_mode == "HT"`, the code divides `quantitative` and `focus_som` by 1.2 (`generate_report.py:472-489`). However, `focus_vmm` records (`obj_acm`, `realise`, `rest`) are stored TTC and are **never** divided. The system prompt to the AI explicitly says *"Toutes les valeurs monétaires [...] sont en HT"* (`generate_report.py:858-859`), so the AI will label VMM focus numbers as HT even though they are still TTC.
- **Reproduction:**
  1. Switch the Rapport tab's TTC/HT radio to HT.
  2. Generate a vendor report with Focus products.
  3. Compare `obj_acm` in the AI output vs the raw DB row: the AI says "HT" but the number is the TTC value.
- **Impact:** Inconsistent tax labelling between quantitative and focus tables; the `taxModeChanged` event and downstream recalculation propagate the same wrong value to the PDF and WhatsApp exports.
- **Suggested fix:** Add a parallel block that mirrors the `focus_som` conversion for `focus_vmm` (`obj_acm`, `realise`, `rest`, `rest_jour`).

### 🟠 HIGH — `closeAiReportModal` does not clear `currentReportText`
- **File:** `static/js/dashboard.js:4107-4135`
- **Description:** On Reset, the function clears `currentReportVendeur` and `currentVendeurWhatsappMessage`, hides the result panel, but never resets `currentReportText`. The "Reset" button is the only way to dismiss the report, but if a subsequent code path (e.g. an automated test, the WhatsApp dialog re-opener, or an extension) reads `currentReportText` it will get stale content from the previous successful generation.
- **Reproduction:** Inspect `window.currentReportText` before and after clicking Reset — it stays populated.
- **Impact:** Latent: only triggers if something else reads the global after Reset. Today the WhatsApp button is hidden after Reset, so the user can't trigger the leak. But any future feature that exposes the text (e.g. share-to-clipboard) would silently send the wrong content.
- **Suggested fix:** Add `currentReportText = '';` in `closeAiReportModal`.

### 🟠 HIGH — Workdays accounting inconsistent: `rest_days = 20` while calendar `rest = 2`
- **File:** `data_processor.py:197-232` (`calculate_calendar_workdays`), `data_processor.py:247-282` (`get_day_work`), `app.py:343-366` (`/api/generate_report` → `generate_report`)
- **Description:** `days.json` currently holds `{"from_file": {"t": "24", "d": "22"}, "rest_days": 20}`. Calendar computation yields `total=24, elapsed=22, rest=2`, but `rest_days` from the config wins. The fallback report and WhatsApp text then say *"sur les 20 jours restants"* and `raf_per_day = total_raf / 20`. The user-visible text reads "22 jours écoulés sur 24 jours" in the same report — so `elapsed + rest = 42 ≠ total = 24`.
- **Reproduction:** Open the latest `rapport_kpi.md` (E14 BOUMDIANE MOHAMED): header says "22 jours écoulés sur 24 jours", footer says "20 jours restants" with `raf_per_day = 482`.
- **Impact:** Confusing / contradictory copy; the RAF-per-day calculation overstates how much each remaining day must produce (the user thinks they need 482/day when the math was calibrated to a 20-day planning horizon, not 2 calendar days).
- **Suggested fix:** Either (a) display `rest = total - elapsed` from the calendar and ignore the config value for *display* purposes only (still use config for RAF/jour calc), or (b) surface a warning banner when `elapsed + rest > total`. Add a UI label explaining what `rest_days` represents.

### 🟠 HIGH — TTC/HT radio `change` handler doesn't refetch when Rapport tab is active
- **File:** `static/js/dashboard.js:564-580` (`handleRadioChange`)
- **Description:** The handler calls `applyTaxMode()` + `updateDashboard()` + `loadTrendsData()` — all of which assume `rawDashboardData` is loaded. If the user is currently on the Rapport tab (no dashboard data fetched), clicking HT/HT still mutates `currentTaxMode` and dispatches `taxModeChanged`, so the *next* generated report will use the new tax mode. That part is fine. But `applyTaxMode()` early-returns when `!rawDashboardData` (`dashboard.js:422`), and `updateDashboard()` may render a stale dashboard with the wrong tax label. The TTC/HT selection does *not* invalidate the most recently generated Rapport content, so the user sees old numbers until they re-click Générer.
- **Reproduction:** Generate a TTC report. Switch to HT without re-generating. The rendered report still shows TTC values; the title bar still says TTC.
- **Impact:** Misleading — user thinks the report auto-refreshed when only the radio button state changed.
- **Suggested fix:** Either clear `currentReportText` and show "Régénérez le rapport pour appliquer le nouveau mode de taxe" when the radio changes while a rapport is on screen, or trigger a silent regeneration.

### 🟡 MEDIUM — `_build_rapport_text` markdown regex bug (latent dead-code bug)
- **File:** `app.py:1292-1295`
- **Description:** The `m_obj` regex looks for "Objectif de Chiffre d'Affaires" but the actual report text (both AI and fallback) uses "Objectif Mensuel Complet". The regex therefore never matches in the `isinstance(data_or_md, str)` branch, so any WhatsApp text built from a raw markdown string would be missing the "Objectif :" line.
- **Reproduction:** Not currently triggerable — no caller in the active flow passes a raw string to `_build_rapport_text` (the WhatsApp route passes `summary_data`). Confirmed by tracing all callers.
- **Impact:** None today. If anyone wires up a new caller that passes the AI markdown string (e.g. "send this exact report via WhatsApp"), the resulting message will silently drop the objective.
- **Suggested fix:** Either delete the dead `isinstance(data_or_md, str)` branch, or update the regex to `r"Objectif\s+(?:Mensuel|de Chiffre d'Affaires)[^:]*:\**\s*([\d\s,]+)\s*MAD"`.

### 🟡 MEDIUM — `_build_rapport_text` "or" fallback mixes TTC and HT values
- **File:** `app.py:1341-1343`
- **Description:**
  ```python
  real_ca = agency_totals.get("total_real_ca_ttc", 0) or agency_totals.get("total_real_ca_ht", 0)
  prorated_obj_ca = agency_totals.get("total_obj_ca_ttc", 0) or agency_totals.get("total_obj_ca_ht", 0)
  ```
  Python's `or` returns the right operand when the left is falsy (0 / 0.0 / "" / None). The current `summary_data["agency_totals"]` only ever sets `total_real_ca_ttc` and `total_obj_ca_ttc` (`generate_report.py:677-681`); the `_ht` keys are never set. So in practice both calls return `0` and the `or` falls through to `0`, not the intended HT backup. If a future refactor adds the `_ht` keys, the fallback would silently surface a different currency (HT) under a TTC label.
- **Impact:** Currently inert. Forward-compatibility hazard.
- **Suggested fix:** Replace with explicit `if agency_totals.get("total_real_ca_ttc"): ... else: agency_totals.get("total_real_ca_ht", 0)`, or remove the fallback if HT is never persisted.

### 🟡 MEDIUM — Vendeur dropdown reset text mismatch: "Tous les vendeurs" vs "Agence globale"
- **File:** `templates/index.html:1310` (dropdown initial label) vs `templates/index.html:1329-1330` (selected-vendeur-display initial label)
- **Description:** On first paint the dropdown button reads `"Tous les vendeurs"` (placeholder), but the selected-vendeur badge directly below it reads `"Agence globale"`. Same logical state ("no vendor chosen"), two different labels. The "Reset" button handler (`dashboard.js:720-730`) sets the dropdown text to yet a third string: `"Sélectionner un vendeur (Optionnel)"`. Three strings for the same UI state.
- **Reproduction:** Navigate to `/rapport` for the first time.
- **Impact:** Mild confusion — users may think the dropdown and the badge are showing different things.
- **Suggested fix:** Pick one canonical label (suggest "Agence globale") and use it in all three places. Apply it from a single source (e.g. a small `updateRapportLabels()` helper called after every state change).

### 🟡 MEDIUM — Empty-state icon mismatch when no vendor selected
- **File:** `static/js/dashboard.js:3913-3918`
- **Description:** The initial `selected-vendeur-display` HTML uses a globe icon (`fa-solid fa-globe`), but the JS `else` branch that re-renders the "no vendor selected" state uses a checkmark (`fa-solid fa-user-check`). After the user clicks Reset, the badge switches from globe → checkmark, which reads as "you have selected this user" instead of "no user selected".
- **Reproduction:** Select a vendor, click Reset (Effacer). The icon changes from globe to a checkmark.
- **Impact:** Misleading iconography; accessibility concern (icon doesn't match state).
- **Suggested fix:** Use `fa-globe` (or `fa-circle-dot`) in both the initial markup and the JS `else` branch.

### 🟢 LOW — Vendeur list not refreshed when date or category changes on the main dashboard
- **File:** `static/js/dashboard.js:155, 206, 320` (only `switchView('rapport')` and initial load call `loadVendeursList()`)
- **Description:** `loadVendeursList()` is called only on initial fetch, error fallback, and when the user enters the Rapport tab. If the user changes the date-selector or category-selector *while the Rapport tab is already active*, the vendeur dropdown stays stale (still showing the list for the previous date/category). The user has to navigate away and back to refresh.
- **Reproduction:** On /rapport, change the date-selector in the global header (date-select). Observe the dropdown — same vendor list.
- **Impact:** Stale vendor list; user might select a vendor that has zero data on the new date and waste a generation. ⚠️ Unverified — needs runtime check (the date-select listener path wasn't fully traced).
- **Suggested fix:** In the date-select and category-select `change` handlers, call `loadVendeursList()` if `activeView === 'rapport'`.

### 🟢 LOW — Multiple dead/legacy DOM references in Rapport JS
- **File:** `static/js/dashboard.js:3986, 4091-4093, 3982, 4067`
- **Description:** The Rapport code references DOM elements that no longer exist after the modal-to-tab refactor: `#ai-report-modal`, `#ai-report-icon`, `#ai-report-label`, `#ai-report-btn`, `#report-initial-state`, `#fullscreen-report-modal-btn`. Every reference is guarded by `if (modal) ...` so nothing crashes, but:
  - `closeAiReportModal()` always tries to remove a `.fullscreen` class from `modal.querySelector('.report-modal')` — never runs because modal is null.
  - The `.finally()` block resets icon / label / disabled state on three elements that no longer exist, so the spinner / "EN COURS..." state on `#generate-vendeur-report-btn` *is* reset (good), but the old sidebar AI button (if it ever comes back) would be silently ignored.
- **Reproduction:** N/A — purely cosmetic / dead code. Confirmed by `grep` against `templates/index.html`.
- **Impact:** None today. Adds confusion for future maintainers and makes the code harder to refactor safely.
- **Suggested fix:** Remove the dead branches (anything that resolves a missing element to null and is then guarded by `if (x)`) or extract them into a clearly-marked `// legacy modal compatibility` block.

---

## Out of Scope (intentionally not investigated)
- Other tabs (Dashboard, Details, Clients, FDV, Terrain, Focus, Stock) — `active_tab` logic was cross-checked only to confirm the Rapport container is hidden/shown correctly.
- Backend data ingestion (`process_and_save_suivi`, `import_focus_objectives_file`, `get_suivi_terrain_data` Google Sheet loader).
- Database schema, migrations, `db_manager.py` correctness outside the FDV/vendeurs path touched by Rapport.
- General chart rendering in `renderReportCharts()` — only scanned for security issues, not for chart correctness.
- AI prompt engineering / cost optimisation / token limits.
- Performance (e.g. `ExcelProcessor` re-runs `get_day_work` + `fix_sheet` on every `generate_report` call — known inefficiency but not a functional bug).
- `days.json` mutation paths outside the Rapport read flow.
- The WhatsApp bulk send button in the FDV tab (`fdv.js:412, 453`) — flagged here as context only, full audit belongs in the FDV-tab report.
- Configuration UI (rest_days slider, theme picker) — not part of the Rapport tab itself.