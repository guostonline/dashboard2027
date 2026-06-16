# AI REPORT BUG — Root Cause Found

## TL;DR

The user-reported bug is confirmed and the root cause has been
identified. When the user opens the "Sélectionner un vendeur" modal
from the AI Report button, picks a specific vendeur in the dropdown,
and clicks "GÉNÉRER LE RAPPORT", the request sent to the backend is
**filtered by the sidebar category, NOT by the selected vendeur**,
producing a category-wide ("team") report instead of an individual
vendeur report.

## Reproduction (Playwright headless)

| Step | Observed |
| --- | --- |
| 1. Open `http://127.0.0.1:5099/` | Dashboard loads (sidebar category = `Chakib Equipe`) |
| 2. Click `#ai-report-btn` | Vendeur-selection modal opens |
| 3. Click `#vendeur-dropdown-toggle` | Dropdown shows 10 vendeurs (filtered to "Chakib Equipe" category) |
| 4. Click first item — `D48 IBACH MOHAMED` | `selectedVendeurForReport` = `"D48 IBACH MOHAMED"` |
| 5. Click `#generate-vendeur-report-btn` | Modal closes, AI report modal opens |
| 6. Wait for response | Report shown with title **"RAPPORT IA : CHAKIB EQUIPE"** and content `RAPPORT DE PERFORMANCE - CATÉGORIE : Chakib Equipe` |

Network call captured by the test:

```
POST /api/generate_report?category=Chakib%20Equipe&date=2026-06-10&options=quanti%2Cquali%2Cfocus
```

JS state observed at the moment of click:

```
selectedVendeurForReport = "D48 IBACH MOHAMED"  // correctly set
currentSelection        = {"type":"global","name":""}  // not yet updated
```

The URL was built with `category=Chakib Equipe` (sidebar value)
instead of `vendeur=D48 IBACH MOHAMED` (modal value).

## Root Cause

`static/js/dashboard.js`, function `generateReportForSelectedVendeur()`
(around lines 2390-2425). The three side-effect calls are executed
in the wrong order:

```js
function generateReportForSelectedVendeur() {
    if (!selectedVendeurForReport) { ... return; }
    const options = getSelectedAnalysisOptions();
    // ...

    // 1. Update dashboard selection
    if (typeof selectFilter === 'function') {
        selectFilter('vendeur', selectedVendeurForReport);
    } else {
        currentSelection = { type: 'vendeur', name: selectedVendeurForReport };
        if (typeof updateDashboard === 'function') updateDashboard();
    }

    // 2. BUG: closeVendeurSelectionModal() RESETS selectedVendeurForReport = null
    closeVendeurSelectionModal();

    // 3. By the time we get here, selectedVendeurForReport is null,
    //    so openAiReportModalForVendeur() falls through to category mode
    openAiReportModalForVendeur(selectedVendeurForReport, options);
}
```

`closeVendeurSelectionModal()` (around line 2247) ends with:

```js
function closeVendeurSelectionModal() {
    const modal = document.getElementById('vendeur-selection-modal');
    if (modal) modal.classList.remove('open');
    // ...
    selectedVendeurForReport = null;          // ← nukes the selection
    allVendeursList = [];
    filteredVendeursList = [];
}
```

So when `openAiReportModalForVendeur()` is finally invoked, its
`vendeurName` parameter is `null`. Inside that function:

```js
let url = '/api/generate_report';
const params = [];
if (vendeurName) params.push(`vendeur=${encodeURIComponent(vendeurName)}`);
else if (selectedCategory && selectedCategory !== 'All')
    params.push(`category=${encodeURIComponent(selectedCategory)}`);
// ...
```

With `vendeurName` falsy, the code falls through to the
sidebar-derived `selectedCategory` and the request is sent with
`category=Chakib Equipe`. The backend then runs the category
report pipeline (correctly) and returns a category-wide report.

## Test Artifacts

Saved in this directory:

| File | Purpose |
| --- | --- |
| `ia-0-initial.png` | Dashboard as loaded |
| `ia-1-modal.png` | Vendeur-selection modal just opened |
| `ia-2-dropdown.png` | Dropdown open showing 10 vendeurs |
| `ia-2b-selected.png` | After selecting `D48 IBACH MOHAMED` |
| `ia-3-report.png` | The full report (full page) — clearly shows the `CATÉGORIE : Chakib Equipe` title and team-wide data |
| `ia-debug-2-report.png` | Second test pass, full page |
| `ia-report.txt` | Extracted text of the report content |
| `ia-console.txt` | Browser console + JS errors from the first run |
| `ia-network.txt` | All `/api/*` network calls captured during the test |
| `ia-selected-vendeur.txt` | `Selected vendeur: D48 IBACH MOHAMED` |
| `test_ia_report_bug.py` | First playwright script |
| `test_ia_report_bug2.py` | Second playwright script (with network capture) |

## What the report actually shows

Extracted from `ia-report.txt`:

> RAPPORT DE PERFORMANCE - CATÉGORIE : Chakib Equipe
> 1. INTRODUCTION ET ANALYSE GLOBALE DE LA CATÉGORIE
> L'analyse de performance pour la catégorie de vendeurs "Chakib Equipe"
> …
> 2. CLASSEMENT DES PERFORMANCE DES VENDEURS DE LA CATÉGORIE
> 2.1. Top Performers : F78 GHOUSMI MOURAD, K91 BAIZ MOHAMED, K60 ELHAOUZI RACHID, D86 ACHAOUI AZIZ, E14 BOUMDIANE MOHAMED
> 2.2. Bottom Performers : T89 AKNOUN MOHAMED, D48 IBACH MOHAMED, E60 BOUALLALI FARID, J78 LASRI EL HOUCINE, O88 OUAZIZ ABDELLATIF

So the report is a *category rollup* (10 vendeurs), not a focused
individual analysis of `D48 IBACH MOHAMED`. If the OpenRouter API
were available, the AI prompt would also be the category prompt,
not the vendeur prompt.

## Side findings (related but secondary)

- `ReferenceError: initializeActiveTab is not defined` is thrown on
  page load (line 245 of `static/js/dashboard.js`). This is a stale
  reference; the function is no longer defined in scope. It is
  not blocking the bug above, but it is causing a console error.
- The dropdown's first click attempt via Playwright was intercepted
  by `.modal-body` (an existing overlay issue, not related to the
  bug). The test had to use `evaluate()` to dispatch the click
  directly. In a real browser a human user clicks fine; this only
  affected automation.
- The vendeur dropdown filters the list server-side by the active
  sidebar category (it calls `/api/vendeurs?category=Chakib Equipe`).
  This is *correct* behaviour for picking a vendeur from within a
  team, but it is also what makes the symptom hard to notice — the
  user picks one person out of their team and gets a report about
  the whole team.

## Recommended fix (one-line reorder)

In `static/js/dashboard.js`, swap the order so the
AI-modal-opening call is made **before** the modal-close (which
nukes the selection variable):

```js
// Capture the value locally
const vendeurForReport = selectedVendeurForReport;

// Update dashboard
selectFilter('vendeur', vendeurForReport);

// Open AI modal FIRST (uses the captured value)
openAiReportModalForVendeur(vendeurForReport, options);

// Then close the selection modal
closeVendeurSelectionModal();
```

The captured local variable is unaffected by the close-handler
mutating the global. The same one-liner fix works regardless of
which other side-effects are present.

## JS errors observed (console)

```
[error] ReferenceError: initializeActiveTab is not defined
    at http://127.0.0.1:5099/static/js/dashboard.js?v=1.9:245:17
```

No other JS errors. No `pageerror` events. The `generate_report`
endpoint itself returned 200 in ~3.5s (local fallback template,
since OpenRouter 401s the offline key).
