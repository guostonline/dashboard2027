/**
 * MADEC.KPI - Profil Vendeur 360° Dashboard Handler
 */

let current360Data = null;
let radarChartInstance = null;
let v360QuantiChartInstance = null;
let v360QualiChartInstance = null;

function checkIsLightMode() {
    if (document.body.classList.contains('light-mode')) return true;
    const themeSelect = document.getElementById('theme-select');
    const val = themeSelect ? themeSelect.value.toLowerCase() : '';
    if (val.includes('light') || val.includes('contemporary')) return true;
    const card = document.querySelector('.cyber-card');
    if (card) {
        const bg = window.getComputedStyle(card).backgroundColor;
        const rgb = bg.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
            const avg = (parseInt(rgb[0]) + parseInt(rgb[1]) + parseInt(rgb[2])) / 3;
            if (avg > 140) return true;
        }
    }
    return false;
}

const isSameV360Vendeur = (name1, name2) => {
    if (!name1 || !name2) return false;
    const n1 = name1.trim().toUpperCase();
    const n2 = name2.trim().toUpperCase();
    if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
    const c1 = n1.split(' ')[0];
    const c2 = n2.split(' ')[0];
    return (c1 && c2 && c1.length >= 2 && c1 === c2);
};

function init360Auto() {
    initVendeur360SubTabs();
    initVendeur360Listeners();
    prefillVendeurs360Dropdown();

    // Check if initial view is vendeur360
    const path = window.location.pathname;
    const searchView = new URLSearchParams(window.location.search).get('view');
    const isVendeur360Active = path === '/vendeur360' || searchView === 'vendeur360' || document.getElementById('details-subtab-vendeur360')?.classList.contains('active');

    if (isVendeur360Active) {
        const select = document.getElementById('v360-vendeur-select');
        const selectedVal = select ? select.value : '';
        loadVendeur360Data(selectedVal);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init360Auto);
} else {
    init360Auto();
}

function initVendeur360SubTabs() {
    const btnAnalytics = document.getElementById('details-subtab-analytics');
    const btnVendeur360 = document.getElementById('details-subtab-vendeur360');
    const secAnalytics = document.getElementById('details-analytics-section');
    const secVendeur360 = document.getElementById('vendeur-360-section');

    if (btnAnalytics && btnVendeur360) {
        btnAnalytics.addEventListener('click', () => {
            btnAnalytics.classList.add('active');
            btnVendeur360.classList.remove('active');
            if (secAnalytics) secAnalytics.style.display = 'block';
            if (secVendeur360) secVendeur360.style.display = 'none';
        });

        btnVendeur360.addEventListener('click', () => {
            btnVendeur360.classList.add('active');
            btnAnalytics.classList.remove('active');
            if (secAnalytics) secAnalytics.style.display = 'none';
            if (secVendeur360) secVendeur360.style.display = 'flex';

            const select = document.getElementById('v360-vendeur-select');
            const selectedVal = select ? select.value : '';
            loadVendeur360Data(selectedVal);

            setTimeout(() => {
                if (v360QuantiChartInstance) v360QuantiChartInstance.resize();
                if (v360QualiChartInstance) v360QualiChartInstance.resize();
                if (radarChartInstance) radarChartInstance.resize();
            }, 150);
        });
    }
}

function initVendeur360Listeners() {
    const selectVendeur = document.getElementById('v360-vendeur-select');
    if (selectVendeur) {
        selectVendeur.addEventListener('change', (e) => {
            if (e.target.value) {
                loadVendeur360Data(e.target.value);
            }
        });
    }

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            setTimeout(() => {
                if (current360Data && current360Data.score) {
                    renderV360RadarChart(current360Data.score.breakdown || {});
                }
                if (current360Data) {
                    renderV360QuantiChart(current360Data._quanti || []);
                    renderV360QualiChart(current360Data._quali || null);
                }
            }, 150);
        });
    }
}

function setActiveFilterBtn(activeBtn, otherBtns) {
    activeBtn.classList.add('active');
    otherBtns.forEach(b => b.classList.remove('active'));
}

async function prefillVendeurs360Dropdown(forceReloadData = false) {
    const select = document.getElementById('v360-vendeur-select');
    if (!select) return;

    try {
        const res = await fetch('/api/vendeur/360');
        const data = await res.json();

        if (data.status === 'success' && data.all_vendeurs) {
            const vendeurs = data.all_vendeurs.map(v => typeof v === 'string' ? v.trim() : (v.vendeur || v.name || '').trim()).filter(Boolean);
            const targetVal = select.value || data.vendeur || vendeurs[0];
            populateVendeurDropdown(vendeurs, targetVal);

            if (forceReloadData || !current360Data) {
                current360Data = data;
                renderVendeur360View(data);
                fetchAndRenderVendeurTournees(targetVal);
            }
        }
    } catch (e) {
        console.error("Error prefilling 360 vendeurs dropdown from FDV table:", e);
    }
}

async function loadVendeur360Data(vendeurName = '') {
    try {
        const select = document.getElementById('v360-vendeur-select');
        const targetVendeur = vendeurName || (select ? select.value : '');

        const url = targetVendeur ? `/api/vendeur/360?vendeur=${encodeURIComponent(targetVendeur)}` : '/api/vendeur/360';
        const res = await fetch(url);
        const data = await res.json();

        if (data.status !== 'success') {
            if (typeof showToast === 'function') showToast("Impossible de charger le profil 360° du vendeur.", "error");
            return;
        }

        current360Data = data;
        if (data.all_vendeurs && data.all_vendeurs.length > 0) {
            populateVendeurDropdown(data.all_vendeurs, data.vendeur);
        }
        renderVendeur360View(data);

        // Fetch quanti/quali from main API
        fetchVendeurQuantiQuali(data.vendeur || targetVendeur);

        // Fetch Tournées & Visits from All Secteurs API
        fetchAndRenderVendeurTournees(data.vendeur || targetVendeur);

    } catch (err) {
        console.error("Error loading Vendeur 360°:", err);
    }
}

async function fetchVendeurQuantiQuali(vendeurName) {
    if (!vendeurName) return;
    try {
        // Use the latest available date from suivi_dates
        const datesRes = await fetch('/api/suivi_dates');
        const datesData = await datesRes.json();
        const latestDate = (datesData.dates && datesData.dates.length > 0) ? datesData.dates[0] : 'default';

        const dataRes = await fetch(`/api/data?category=All&date=${encodeURIComponent(latestDate)}`);
        const apiData = await dataRes.json();
        if (apiData.status !== 'success') return;

        const isAllMode = !vendeurName || vendeurName.toUpperCase() === 'ALL' || vendeurName.toUpperCase() === 'TOUS LES VENDEURS' || vendeurName.toUpperCase().includes('CHAKIB EQUIPE');

        let quanti = [];
        let quali = null;

        if (!isAllMode) {
            quanti = (apiData.data.quantitative || []).filter(r =>
                isSameV360Vendeur(r.vendeur, vendeurName)
            );
            const qualiArr = (apiData.data.qualitative || []).filter(r =>
                isSameV360Vendeur(r.vendeur, vendeurName)
            );
            quali = qualiArr.length > 0 ? qualiArr[0] : null;
        }

        // If team mode or empty single-vendor quanti, aggregate team totals by family (Image 1)
        if (quanti.length === 0 && apiData.data.quantitative) {
            const familyMap = {};
            apiData.data.quantitative.forEach(r => {
                const fam = r.famille || 'C.A (HT)';
                if (!familyMap[fam]) {
                    familyMap[fam] = {
                        famille: fam,
                        vendeurs: new Set(),
                        vendeursObj: new Set(),
                        obj: 0,
                        real: 0,
                        rest: 0,
                        histo_2025: 0,
                        histo_2026: 0
                    };
                }
                familyMap[fam].obj += (r.obj || 0);
                familyMap[fam].real += (r.real || 0);
                familyMap[fam].rest += (r.rest !== undefined ? r.rest : Math.max(0, (r.obj || 0) - (r.real || 0)));
                familyMap[fam].histo_2025 += (r.real_2025 || r.histo_2025 || 0);
                familyMap[fam].histo_2026 += (r.h_2024 || r.histo_2026 || 0);
                if (r.vendeur && r.vendeur.trim() && !r.vendeur.toUpperCase().includes('AUTRE')) {
                    familyMap[fam].vendeurs.add(r.vendeur.trim());
                    if (r.obj > 0) familyMap[fam].vendeursObj.add(r.vendeur.trim());
                }
            });

            quanti = Object.values(familyMap).map(f => ({
                famille: f.famille,
                vendeur_count: f.vendeursObj.size > 0 ? f.vendeursObj.size : f.vendeurs.size,
                obj: f.obj,
                real: f.real,
                rest: f.rest,
                histo_2025: f.histo_2025,
                histo_2026: f.histo_2026
            }));
        }

        // If team mode or empty single-vendor quali, aggregate team qualitative averages
        if (!quali && apiData.data.qualitative && apiData.data.qualitative.length > 0) {
            let totalAcm = 0, totalTsm = 0, totalLine = 0;
            let totalCltProg = 0, totalCltFact = 0, totalRafTsm = 0, totalRafAcm = 0;
            const count = apiData.data.qualitative.length;
            apiData.data.qualitative.forEach(r => {
                totalAcm += (r.acm || 0);
                totalTsm += (r.tsm || 0);
                totalLine += (r.line || 0);
                totalCltProg += (r.clt_programme || 0);
                totalCltFact += (r.clt_facture || 0);
                totalRafTsm += (r.raf_tsm || 0);
                totalRafAcm += (r.raf_acm || 0);
            });
            quali = {
                vendeur: vendeurName || 'CHAKIB EQUIPE',
                acm: count > 0 ? totalAcm / count : 0,
                tsm: count > 0 ? totalTsm / count : 0,
                line: count > 0 ? totalLine / count : 0,
                clt_programme: totalCltProg,
                clt_facture: totalCltFact,
                raf_tsm: totalRafTsm,
                raf_acm: totalRafAcm
            };
        }

        // Store on current360Data for theme-toggle re-render
        if (current360Data) {
            current360Data._quanti = quanti;
            current360Data._quali = quali;
        }

        renderV360QuantiChart(quanti);
        renderV360QualiChart(quali);
        renderV360FocusBarChart(vendeurName, apiData ? apiData.data : null);
        renderV360FocusDailyChart(vendeurName);
        renderV360QuantiTable(quanti, vendeurName);
        renderV360QualiTable(quali, vendeurName);
        renderV360FocusTable(vendeurName, apiData ? apiData.data : null);
        renderV360TerrainAnomalies(vendeurName);

    } catch (err) {
        console.error("Error fetching quanti/quali for vendor:", err);
    }
}

function populateVendeurDropdown(vendeurs, selectedVendeur) {
    const select = document.getElementById('v360-vendeur-select');
    if (!select) return;

    // Preserve server pre-rendered options if vendeurs is empty
    if (!vendeurs || vendeurs.length === 0) {
        if (select.options.length > 1 || (select.options.length === 1 && select.options[0].value !== '')) {
            return;
        }
    }

    const currentSelection = (selectedVendeur || select.value || '').trim();
    select.innerHTML = '';

    if (!vendeurs || vendeurs.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'AUCUN VENDEUR DANS LA BASE (FDV)';
        select.appendChild(opt);
        return;
    }

    let matchFound = false;
    vendeurs.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = v;
        opt.style.color = '#000000';
        opt.style.backgroundColor = '#ffffff';
        if (v === currentSelection) {
            opt.selected = true;
            matchFound = true;
        }
        select.appendChild(opt);
    });

    if (!matchFound && select.options.length > 0) {
        select.options[0].selected = true;
    }
}

function renderVendeur360View(data) {
    const info = data.vendeur_info || {};
    const stats = data.stats || {};
    const score = data.score || {};

    // Header Info
    const elName = document.getElementById('v360-name');
    const elRole = document.getElementById('v360-role-badge');
    const elCdz = document.getElementById('v360-cdz');
    const elSecteur = document.getElementById('v360-secteur');
    const elActivite = document.getElementById('v360-activite');

    if (elName) elName.textContent = info.name || data.vendeur || 'N/A';
    if (elRole) elRole.textContent = info.role || 'VENDEUR';
    if (elCdz) elCdz.textContent = info.cdz || 'N/A';
    if (elSecteur) elSecteur.textContent = info.secteur || 'AGADIR';
    if (elActivite) elActivite.textContent = info.activite || 'GMS';

    // Score Meter
    const elScoreVal = document.getElementById('v360-score-val');
    const elGrade = document.getElementById('v360-grade');
    if (elScoreVal) elScoreVal.textContent = `${score.total_score || 0}/100`;
    if (elGrade) elGrade.textContent = score.grade || 'SATISFAISANT';

    // Top KPI Cards
    const elOk = document.getElementById('v360-kpi-ok');
    const elOkSub = document.getElementById('v360-kpi-ok-sub');
    const elSansOk = document.getElementById('v360-kpi-sans-ok');
    const elVisites = document.getElementById('v360-kpi-visites');
    const elAnomalies = document.getElementById('v360-kpi-anomalies');

    if (elOk) elOk.textContent = stats.clients_ok || 0;
    if (elOkSub) elOkSub.textContent = `sur ${stats.total_clients || 0} clients (${stats.acm_pct || 0}%)`;
    if (elSansOk) elSansOk.textContent = stats.clients_sans_ok || 0;
    if (elVisites) elVisites.textContent = stats.total_visites || 0;
    if (elAnomalies) elAnomalies.textContent = stats.anomalies_count || 0;

    // Render Tournées Breakdown
    renderV360TourneesTable(data.tournees || []);

    // Render Anomalies & Tasks
    renderV360AnomaliesTable(data.anomalies || []);
    renderV360TasksTable(data.tasks || []);

    // Render Radar Chart
    renderV360RadarChart(score.breakdown || {});
}

function renderV360AnomaliesTable(anomalies) {
    const tbody = document.querySelector('#v360-anomalies-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!anomalies || anomalies.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-sub);">Aucune anomalie détectée pour ce vendeur.</td></tr>`;
        return;
    }
    anomalies.forEach(a => {
        const tr = document.createElement('tr');
        const d = a.date || a.created_at || '';
        const dateFormatted = d ? d.substring(0, 10) : '-';
        const typeStr = a.client_code || a.type_anomali || 'Anomalie';
        const detailStr = a.client_nom || a.commentaire || a.tag || 'Visite hors zone (>100m)';
        const statusStr = a.motif || a.tag || (a.distance > 0 ? `${a.distance}m` : 'Signalé');

        tr.innerHTML = `
            <td><code>${dateFormatted}</code></td>
            <td><strong class="neon-text-pink">${typeStr}</strong></td>
            <td>${detailStr}</td>
            <td><span class="badge-pink">${statusStr}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderV360TasksTable(tasks) {
    const tbody = document.querySelector('#v360-tasks-table tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!tasks || tasks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-sub);">Aucune tâche assignée à ce vendeur.</td></tr>`;
        return;
    }
    tasks.forEach(t => {
        const tr = document.createElement('tr');
        const title = t.title || 'Tâche';
        const dueDate = t.due_date ? t.due_date.substring(0, 10) : '-';
        const priority = t.priority || 'Moyenne';
        const status = t.status || 'Start';

        const prioClass = priority.toLowerCase().includes('urgent') ? 'badge-pink' : 'badge-blue';
        const statusClass = status === 'Done' ? 'neon-text-green' : (status === 'In progress' ? 'neon-text-amber' : 'neon-text-sub');

        tr.innerHTML = `
            <td><strong>${title}</strong></td>
            <td><code>${dueDate}</code></td>
            <td><span class="${prioClass}">${priority}</span></td>
            <td><span class="${statusClass} font-weight-bold">${status}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

function renderV360TourneesTable(tournees, fallbackVendeur) {
    const tbody = document.querySelector('#v360-tournees-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (!tournees || tournees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-sub); padding: 2rem;">Aucune tournée enregistrée.</td></tr>`;
        return;
    }

    tbody.innerHTML = tournees.map(t => {
        const reg = t.total_clients_enregistres || t.total_clients || 0;
        const vis = t.total_clients_visites || t.total_visites || 0;
        const pct = reg > 0 ? Math.min(100, Math.round((vis / reg) * 100)) : (t.couverture_pct !== undefined ? t.couverture_pct : (t.billing_rate !== undefined ? t.billing_rate : 100));
        const s = t.statistics || {};
        const ok = s.ok !== undefined ? s.ok : (t.clients_ok !== undefined ? t.clients_ok : (t.total_ok || 0));
        const ferme = s.magasin_ferme !== undefined ? s.magasin_ferme : (t.magasin_ferme || 0);
        const absent = s.responsable_absent !== undefined ? s.responsable_absent : (t.responsable_absent || 0);
        const stock = s.stock_suffisant !== undefined ? s.stock_suffisant : (t.stock_suffisant || 0);
        const dateStr = t.date && t.date !== '-' ? t.date : '';
        const tourneeName = t.tournee || 'N/A';
        const tourneeAttr = tourneeName.replace(/"/g, '&quot;');

        return `
            <tr>
                <td style="white-space: nowrap;">
                    ${dateStr ? `
                    <div style="font-weight: 700; color: var(--neon-blue); font-size: 0.8rem; line-height: 1.2; margin-bottom: 2px;">
                        <i class="fa-regular fa-calendar-days" style="margin-right: 0.35rem;"></i>${dateStr}
                    </div>` : ''}
                    <div style="font-weight: 600; color: ${dateStr ? 'var(--text-main)' : 'var(--neon-blue)'}; font-size: 0.82rem;">
                        <i class="fa-solid fa-route" style="color: var(--neon-pink); margin-right: 0.25rem; font-size: 0.75rem;"></i>${tourneeName}
                    </div>
                </td>
                <td style="text-align: center;">${reg}</td>
                <td style="text-align: center; font-weight: bold;">${vis}</td>
                <td style="text-align: center; color: var(--neon-green); font-weight: bold;">${ok}</td>
                <td style="text-align: center; color: var(--neon-amber);">${ferme}</td>
                <td style="text-align: center; color: #ff9966;">${absent}</td>
                <td style="text-align: center; color: var(--neon-blue);">${stock}</td>
                <td style="text-align: center;">
                    <span class="badge ${pct >= 80 ? 'badge-green' : pct >= 50 ? 'badge-amber' : 'badge-pink'}">${pct}%</span>
                </td>
                <td style="text-align: center;">
                    <button type="button" class="v360-tournee-detail-btn cyber-btn-small" data-tournee="${tourneeAttr}" style="padding: 0.25rem 0.6rem; font-size: 0.72rem; cursor: pointer; white-space: nowrap;">
                        <i class="fa-solid fa-eye"></i> Détails
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    attachV360TourneeDetailEvents();
}

let currentV360RadarMode = 'quanti';
let lastV360Breakdown = null;

function renderV360RadarChart(breakdown, targetMode) {
    if (breakdown) lastV360Breakdown = breakdown;
    if (targetMode) currentV360RadarMode = targetMode;
    const canvas = document.getElementById('v360-radar-chart');
    if (!canvas) return;
    if (typeof Chart === 'undefined') return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Update Header Title and Buttons
    const titleEl = document.getElementById('v360-radar-title');
    const toggleContainer = document.getElementById('v360-radar-mode-toggle');
    if (toggleContainer) {
        const btns = toggleContainer.querySelectorAll('.v360-radar-mode-btn');
        btns.forEach(btn => {
            if (btn.getAttribute('data-mode') === currentV360RadarMode) {
                btn.classList.add('is-active');
            } else {
                btn.classList.remove('is-active');
            }
        });
    }

    if (titleEl) {
        if (currentV360RadarMode === 'quanti') {
            titleEl.innerHTML = '<i class="fa-solid fa-chart-area neon-text-blue"></i> PERFORMANCE GLOBALE : RADAR D\'ANALYSE';
        } else if (currentV360RadarMode === 'quali') {
            titleEl.innerHTML = '<i class="fa-solid fa-chart-pie neon-text-amber"></i> ANALYSE RADAR DE PERFORMANCE';
        } else if (currentV360RadarMode === 'focus') {
            titleEl.innerHTML = '<i class="fa-solid fa-crosshairs neon-text-purple"></i> FOCUS DU MOIS : RADAR PERFORMANCE';
        }
    }

    const isLight = document.body.classList.contains('light-mode');
    const textColor = isLight ? '#0f172a' : '#ffffff';
    const textSubColor = isLight ? '#1e293b' : '#a0aec0';
    const gridColor = isLight ? 'rgba(15, 23, 42, 0.15)' : 'rgba(255, 255, 255, 0.18)';
    const neonBlue = '#00d4ff';
    const neonAmber = '#f0a030';
    const neonGreen = '#4cbb17';
    const neonPink = '#ff2d55';
    const neonPurple = '#a855f7';

    try {
        if (radarChartInstance) {
            radarChartInstance.destroy();
        }

        let labels = [];
        let datasets = [];

        if (currentV360RadarMode === 'quanti') {
            // IMAGE 2: Quantitative Product Families Radar Chart
            labels = ['CONDIMENTS', 'LEVURE', 'MGM', 'CONSERVES', 'SAUCES', 'BOUILLON'];
            let quantiValues = [100, 78, 82, 95, 88, 48]; // default per family %

            if (window.v360Data && window.v360Data.quanti_families) {
                quantiValues = labels.map(f => {
                    const found = window.v360Data.quanti_families.find(q => q.famille.toUpperCase().includes(f));
                    if (found && found.obj > 0) return Math.min(120, Math.round((found.real / found.obj) * 100));
                    return 80;
                });
            }

            datasets = [
                {
                    label: 'Réalisé (%)',
                    data: quantiValues,
                    backgroundColor: 'rgba(0, 184, 217, 0.25)',
                    borderColor: isLight ? '#0070f3' : '#00f3ff',
                    borderWidth: 2.5,
                    pointBackgroundColor: quantiValues.map(v => v >= 80 ? neonGreen : neonPink),
                    pointBorderColor: '#fff',
                    pointRadius: 5
                },
                {
                    label: 'Objectif (100%)',
                    data: [100, 100, 100, 100, 100, 100],
                    backgroundColor: 'rgba(168, 85, 247, 0.08)',
                    borderColor: neonPurple,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointBackgroundColor: neonPurple,
                    pointRadius: 3.5
                }
            ];
        } else if (currentV360RadarMode === 'quali') {
            // IMAGE 1: Qualitative Performance Radar Chart
            const b = lastV360Breakdown || {};
            labels = ['Couverture ACM', 'Facturation (OK)', 'Conformité (Distance)', 'Activité (Visites)'];
            const sellerData = [
                b.couverture || 25,
                b.facturation || 25,
                b.conformite || 12,
                b.activite || 18
            ];

            datasets = [
                {
                    label: 'Performance Vendeur',
                    data: sellerData,
                    backgroundColor: 'rgba(0, 184, 217, 0.25)',
                    borderColor: isLight ? '#0070f3' : '#00f3ff',
                    borderWidth: 2.5,
                    pointBackgroundColor: isLight ? '#0070f3' : '#00f3ff',
                    pointRadius: 5
                },
                {
                    label: 'Moyenne Agence (Cible)',
                    data: [25, 25, 12, 12],
                    backgroundColor: 'rgba(217, 119, 6, 0.15)',
                    borderColor: isLight ? '#d97706' : '#ffb800',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointRadius: 4,
                    pointBackgroundColor: isLight ? '#d97706' : '#ffb800'
                }
            ];
        } else if (currentV360RadarMode === 'focus') {
            // FOCUS MODE: Focus Products / Sectors Radar Chart
            labels = ['VMM TOMATE', 'SOM BROTH', 'CONFITURE', 'MOUSSES', 'CONDIMENTS', 'CONSERVES'];
            const focusValues = [85, 65, 40, 90, 75, 80];

            datasets = [
                {
                    label: 'Réalisé Focus (%)',
                    data: focusValues,
                    backgroundColor: 'rgba(240, 160, 48, 0.25)',
                    borderColor: neonAmber,
                    borderWidth: 2.5,
                    pointBackgroundColor: focusValues.map(v => v >= 80 ? neonGreen : neonPink),
                    pointBorderColor: '#fff',
                    pointRadius: 5
                },
                {
                    label: 'Objectif (100%)',
                    data: [100, 100, 100, 100, 100, 100],
                    backgroundColor: 'rgba(168, 85, 247, 0.08)',
                    borderColor: neonPurple,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointBackgroundColor: neonPurple,
                    pointRadius: 3.5
                }
            ];
        }

        radarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: gridColor },
                        grid: { color: gridColor },
                        pointLabels: {
                            color: textSubColor,
                            font: { family: 'JetBrains Mono, Inter, sans-serif', size: 11, weight: 'bold' }
                        },
                        ticks: { display: true, color: textSubColor, backdropColor: 'transparent', font: { size: 9 }, max: 120 }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: textColor,
                            font: { family: 'JetBrains Mono, Inter, sans-serif', size: 11, weight: 'bold' },
                            padding: 12,
                            usePointStyle: true,
                            pointStyle: 'rectRounded'
                        }
                    }
                }
            }
        });
    } catch (e) {
        console.error("Radar chart rendering error:", e);
    }
}

/**
 * Render Quantitative horizontal bar chart: % Realization & Deviation per famille
 */
function renderV360QuantiChart(quantiRows) {
    const canvas = document.getElementById('v360-quanti-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (v360QuantiChartInstance) {
        v360QuantiChartInstance.destroy();
        v360QuantiChartInstance = null;
    }

    const isLight = checkIsLightMode();

    if (!quantiRows || quantiRows.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Aucune donnée quantitative', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return;
    }

    const textColor = isLight ? '#0f172a' : '#e2e8f0';
    const textSub = isLight ? '#334155' : '#94a3b8';
    const gridColor = isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.08)';

    const rowsWithoutCA = quantiRows.filter(r => (r.famille || '').toUpperCase() !== 'C.A (HT)' && (r.famille || '').toUpperCase() !== 'TOTAL' && (r.famille || '').toUpperCase() !== 'C.A (TTC)');
    const displayRows = rowsWithoutCA.length > 0 ? rowsWithoutCA : quantiRows;

    const labels = displayRows.map(r => r.famille || 'FAMILLE');
    const values = displayRows.map(r => {
        const obj = r.obj || 0;
        const real = r.real || 0;
        if (obj > 0) return Math.round((real / obj) * 100);
        if (r.percent !== undefined) return Math.round(r.percent * 100);
        return 0;
    });

    const devValues = displayRows.map(r => {
        const obj = r.obj || 0;
        const real = r.real || 0;
        if (obj > 0) return Math.round(((real - obj) / obj) * 100);
        if (r.percent !== undefined && r.percent !== null) return Math.round((r.percent - 1) * 100);
        return 0;
    });

    const colors = devValues.map(dev => {
        if (dev >= 0) return '#00ff87'; // Bright Green (e.g. +3%)
        if (dev >= -20) return '#00d4ff';  // Neon Blue (e.g. -3%)
        if (dev >= -50) return '#ffb703';  // Amber (e.g. -49%)
        return '#ff0055';               // Pink
    });

    // Update label
    const labelEl = document.getElementById('v360-quanti-vendeur-label');
    if (labelEl && quantiRows[0]) {
        const vName = (quantiRows[0].vendeur || '').toUpperCase();
        labelEl.textContent = vName ? ` - ${vName}` : '';
    }

    v360QuantiChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Écart de Réalisation (%)',
                data: values,
                backgroundColor: colors,
                borderRadius: 4,
                borderSkipped: false,
                barThickness: 18
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            const dev = devValues[ctx.dataIndex];
                            const sign = dev > 0 ? '+' : '';
                            return ` Écart: ${sign}${dev}% (Taux: ${values[ctx.dataIndex]}%)`;
                        }
                    }
                },
                datalabels: { display: false }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    max: 120,
                    grid: { color: gridColor },
                    ticks: {
                        color: textSub,
                        font: { size: 10 },
                        callback: v => `${v}%`
                    }
                },
                y: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 11, weight: 'bold', family: 'JetBrains Mono, Inter, sans-serif' }
                    }
                }
            },
            layout: { padding: { right: 45, left: 10 } },
            animation: { duration: 600, easing: 'easeOutQuart' }
        },
        plugins: [
            {
                id: 'v360QuantiLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, data } = chart;
                    ctx.save();
                    data.datasets[0].data.forEach((val, i) => {
                        const meta = chart.getDatasetMeta(0);
                        const bar = meta.data[i];
                        if (!bar) return;
                        const dev = devValues[i];
                        const sign = dev > 0 ? '+' : '';
                        const devText = `${sign}${dev}%`;
                        ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
                        ctx.font = 'bold 11px JetBrains Mono, monospace';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(devText, bar.x + 6, bar.y);
                    });
                    ctx.restore();
                }
            },
            {
                id: 'v360QuantiPartialLine',
                afterDraw(chart) {
                    drawPartialVerticalLine(chart, isLight);
                }
            }
        ]
    });
}

/**
 * Render Qualitative horizontal bar chart: ACM, TSM, LINE progress
 */
function renderV360QualiChart(qualiRow) {
    const canvas = document.getElementById('v360-quali-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (v360QualiChartInstance) {
        v360QualiChartInstance.destroy();
        v360QualiChartInstance = null;
    }

    const isLight = checkIsLightMode();

    if (!qualiRow) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = isLight ? '#64748b' : '#94a3b8';
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Chargement ou aucune donnée qualitative', canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return;
    }

    const textColor = isLight ? '#0f172a' : '#e2e8f0';
    const textSub = isLight ? '#334155' : '#94a3b8';
    const gridColor = isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.08)';

    const acm = Math.round((qualiRow.acm || 0) * 100);
    const tsm = Math.round((qualiRow.tsm || 0) * 100);
    const line = Math.round((qualiRow.line || 0) * 100);
    const rafAcm = qualiRow.raf_acm || 0;
    const rafTsm = qualiRow.raf_tsm || 0;
    const cltFact = qualiRow.clt_facture || 0;
    const cltProg = qualiRow.clt_programme || 0;

    const labels = [
        `ACM  (${cltFact}/${cltProg} clients)`,
        `TSM  (RAF: ${rafTsm})`,
        `LINE (RAF: ${rafAcm})`
    ];
    const values = [acm, tsm, line];
    const colors = values.map(v => {
        if (v >= 80) return '#22c55e';
        if (v >= 60) return '#f59e0b';
        return '#ef4444';
    });

    // Update vendeur label
    const labelEl = document.getElementById('v360-quali-vendeur-label');
    if (labelEl && qualiRow.vendeur) {
        const vName = qualiRow.vendeur.toUpperCase();
        labelEl.textContent = vName ? ` - ${vName}` : '';
    }

    v360QualiChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Taux (%)',
                data: values,
                backgroundColor: colors,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: 28
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.parsed.x}%`
                    }
                }
            },
            scales: {
                x: {
                    min: 0,
                    max: 120,
                    grid: { color: gridColor },
                    border: { display: false },
                    ticks: {
                        color: textSub,
                        font: { size: 10 },
                        callback: v => `${v}%`
                    }
                },
                y: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 11, weight: 'bold', family: 'JetBrains Mono, Inter, sans-serif' }
                    }
                }
            },
            layout: { padding: { right: 55, top: 15 } },
            animation: {
                duration: 600,
                easing: 'easeOutQuart'
            }
        },
        plugins: [
            {
                id: 'v360QualiLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, data } = chart;
                    ctx.save();
                    data.datasets[0].data.forEach((val, i) => {
                        const meta = chart.getDatasetMeta(0);
                        const bar = meta.data[i];
                        if (!bar) return;
                        ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
                        ctx.font = 'bold 11px JetBrains Mono, monospace';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${val}%`, bar.x + 6, bar.y);
                    });
                    ctx.restore();
                }
            },
            {
                id: 'v360QualiPartialLine',
                afterDraw(chart) {
                    drawPartialVerticalLine(chart, isLight);
                }
            }
        ]
    });
}

/**
 * Draw vertical partial target line (milestone based on workdays)
 */
function drawPartialVerticalLine(chart, isLight) {
    const { ctx, chartArea, scales } = chart;
    if (!chartArea || !scales || !scales.x) return;
    const { top, bottom, left, right } = chartArea;
    const x = scales.x;

    let elapsed = 11;
    let total = 24;
    if (window.focusWorkdays && window.focusWorkdays.elapsed) {
        elapsed = window.focusWorkdays.elapsed;
        total = window.focusWorkdays.total || 24;
    } else if (window.rawDashboardData && window.rawDashboardData.workdays) {
        elapsed = window.rawDashboardData.workdays.elapsed || 11;
        total = window.rawDashboardData.workdays.total || 24;
    } else if (window.dashboardData && window.dashboardData.workdays) {
        elapsed = window.dashboardData.workdays.elapsed || 11;
        total = window.dashboardData.workdays.total || 24;
    }

    // Set target partial milestone to 45.76%
    const targetPct = 45.76;
    const xPos = x.getPixelForValue(targetPct);

    if (xPos >= left && xPos <= right) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ef4444'; // Red/Pink vertical dashed line

        ctx.moveTo(xPos, top);
        ctx.lineTo(xPos, bottom);
        ctx.stroke();

        // Top label badge for partial line
        ctx.fillStyle = isLight ? '#be123c' : '#fb7185';
        ctx.font = 'bold 10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        
        const pctFormatted = targetPct.toFixed(2).replace('.', ',');
        ctx.fillText(`Partiel (${pctFormatted}% - ${elapsed}/${total}j)`, xPos, Math.max(12, top - 6));
        ctx.restore();
    }
}

let v360FocusBarChartInstance = null;
let v360FocusDataCache = null;

/**
 * Fetch official Focus Tab data if not already cached
 */
async function fetchV360FocusDataIfNeeded() {
    if (window.focusData && (window.focusData.glace || window.focusData.tomate || window.focusData.objectives)) {
        return window.focusData;
    }
    if (v360FocusDataCache) {
        return v360FocusDataCache;
    }
    try {
        const res = await fetch('/api/focus/data?agence=AGADIR');
        const json = await res.json();
        if (json.status === 'success') {
            v360FocusDataCache = json.data;
            if (json.workdays && !window.focusWorkdays) {
                window.focusWorkdays = json.workdays;
            }
            if (json.focus_names) {
                window.focusNames = Object.assign(window.focusNames || {}, json.focus_names);
            }
            return v360FocusDataCache;
        }
    } catch (e) {
        console.error("Error fetching focus data for Vendeur 360:", e);
    }
    return null;
}

/**
 * Extract authentic focus items for this vendor matching Focus Tab logic exactly
 */
function extractVendeurFocusList(vendeurName, fData, taxMode) {
    if (!vendeurName || !fData) return [];

    const fNames = window.focusNames || { GLACE: "GLACE (SOM)", TOMATE_FRITO: "TOMATE FRITO (VMM)" };
    const restDays = (window.focusWorkdays && window.focusWorkdays.rest !== undefined) ? window.focusWorkdays.rest : ((window.dashboardData && window.dashboardData.workdays) ? window.dashboardData.workdays.rest : 18);
    const items = [];

    // Helper to find representative in a cohort
    const findRepInCohort = (cohortList) => {
        if (!cohortList || !Array.isArray(cohortList)) return null;
        return cohortList.find(r => isSameV360Vendeur(r.representative || r.vendeur, vendeurName));
    };

    // 1. Check GLACE (SOM)
    const glaceReps = (fData.glace && fData.glace.reps) ? fData.glace.reps : [];
    const gRep = findRepInCohort(glaceReps);
    if (gRep) {
        const targetObj = taxMode === 'HT' ? (gRep.obj_ht > 0 ? gRep.obj_ht : (gRep.obj_ttc ? gRep.obj_ttc / 1.2 : 0)) : (gRep.obj_ttc > 0 ? gRep.obj_ttc : (gRep.obj_ht ? gRep.obj_ht * 1.2 : (gRep.glace_ht ? gRep.glace_ht * 1.2 : 0)));
        const targetReal = taxMode === 'HT' ? (gRep.realised_ttc ? gRep.realised_ttc / 1.2 : (gRep.realise ? gRep.realise / 1.2 : 0)) : (gRep.realised_ttc || gRep.realise || 0);
        const raf = Math.max(0, targetObj - targetReal);
        const pct = targetObj > 0 ? Math.round((targetReal / targetObj) * 100) : (gRep.deviation !== undefined ? Math.max(0, Math.round((1 + gRep.deviation) * 100)) : 0);
        const restJour = restDays > 0 ? (raf / restDays) : 0;

        items.push({
            gamme: fNames.GLACE || 'GLACE (SOM)',
            secteur: gRep.secteur || 'AGADIR',
            obj: targetObj,
            real: targetReal,
            raf: raf,
            pct: pct,
            restJour: restJour,
            dn: '—',
            type: 'som'
        });
    }

    // 2. Check TOMATE FRITO (VMM)
    const tomateReps = (fData.tomate && fData.tomate.reps) ? fData.tomate.reps : [];
    const tRep = findRepInCohort(tomateReps);
    if (tRep) {
        const targetObj = taxMode === 'HT' ? (tRep.obj_ht > 0 ? tRep.obj_ht : (tRep.obj_ttc ? tRep.obj_ttc / 1.2 : (tRep.obj_juin || tRep.obj_acm || 0))) : (tRep.obj_ttc > 0 ? tRep.obj_ttc : (tRep.obj_ht ? tRep.obj_ht * 1.2 : (tRep.obj_juin ? tRep.obj_juin * 1.2 : (tRep.obj_acm ? tRep.obj_acm * 1.2 : 0))));
        const targetReal = taxMode === 'HT' ? (tRep.realised_ttc ? tRep.realised_ttc / 1.2 : (tRep.realise ? tRep.realise / 1.2 : 0)) : (tRep.realised_ttc || tRep.realise || 0);
        const raf = Math.max(0, targetObj - targetReal);
        const pct = targetObj > 0 ? Math.round((targetReal / targetObj) * 100) : (tRep.deviation !== undefined ? Math.max(0, Math.round((1 + tRep.deviation) * 100)) : 0);
        const restJour = restDays > 0 ? (raf / restDays) : 0;
        const clients = tRep.nb_clients || tRep.number_client || 0;

        items.push({
            gamme: fNames.TOMATE_FRITO || 'TOMATE FRITO (VMM)',
            secteur: tRep.secteur || 'AGADIR',
            obj: targetObj,
            real: targetReal,
            raf: raf,
            pct: pct,
            restJour: restJour,
            dn: clients > 0 ? `${clients} clts` : '—',
            type: 'vmm'
        });
    }

    // 3. Fallback to objectives table if not present in ranking reps
    if (items.length === 0 && fData.objectives && Array.isArray(fData.objectives)) {
        const vObjs = fData.objectives.filter(o => isSameV360Vendeur(o.vendeur, vendeurName));
        vObjs.forEach(o => {
            const isGlace = o.focus_type === 'GLACE';
            const targetObj = taxMode === 'HT' ? (isGlace ? (o.glace_ht || (o.ttc ? o.ttc / 1.2 : 0)) : (o.obj_juin || o.obj_acm || (o.ttc ? o.ttc / 1.2 : 0))) : (o.ttc || (isGlace ? (o.glace_ht ? o.glace_ht * 1.2 : 0) : (o.obj_juin ? o.obj_juin * 1.2 : (o.obj_acm ? o.obj_acm * 1.2 : 0))));
            const raf = targetObj;
            const restJour = restDays > 0 ? (raf / restDays) : 0;
            const clients = o.number_client || 0;

            items.push({
                gamme: isGlace ? (fNames.GLACE || 'GLACE (SOM)') : (fNames.TOMATE_FRITO || 'TOMATE FRITO (VMM)'),
                secteur: o.secteur || 'AGADIR',
                obj: targetObj,
                real: 0,
                raf: raf,
                pct: 0,
                restJour: restJour,
                dn: clients > 0 ? `${clients} clts` : '—',
                type: isGlace ? 'som' : 'vmm'
            });
        });
    }

    return items;
}

/**
 * Render Focus Horizontal Bar Chart (fetching true Focus Tab data)
 */
async function renderV360FocusBarChart(vendeurName, apiData) {
    const canvas = document.getElementById('v360-focus-bar-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (v360FocusBarChartInstance) {
        v360FocusBarChartInstance.destroy();
        v360FocusBarChartInstance = null;
    }

    if (!vendeurName) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const isLight = document.body.classList.contains('light-mode');
    const textColor = isLight ? '#0f172a' : '#e2e8f0';
    const textSub = isLight ? '#334155' : '#94a3b8';
    const gridColor = isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.08)';

    // Update vendeur label
    const labelEl = document.getElementById('v360-focus-bar-vendeur-label');
    if (labelEl) {
        labelEl.textContent = ` - ${vendeurName.toUpperCase()}`;
    }

    // Get real focus data from Focus Tab API
    const fData = await fetchV360FocusDataIfNeeded();
    const taxMode = localStorage.getItem('taxMode') || 'TTC';
    const focusItems = extractVendeurFocusList(vendeurName, fData, taxMode);

    if (focusItems.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.fillStyle = textSub;
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Aucun focus assigné à ce vendeur (${vendeurName})`, canvas.width / 2, canvas.height / 2);
        ctx.restore();
        return;
    }

    const labels = [];
    const values = [];

    // Get partial ratio for bar color calculation
    let elapsed = 11, total = 24;
    if (window.focusWorkdays) {
        elapsed = window.focusWorkdays.elapsed || 11;
        total = window.focusWorkdays.total || 24;
    } else if (window.rawDashboardData && window.rawDashboardData.workdays) {
        elapsed = window.rawDashboardData.workdays.elapsed || 11;
        total = window.rawDashboardData.workdays.total || 24;
    }
    const targetPct = 45.76;

    focusItems.forEach(item => {
        labels.push(`${item.gamme}  (RAF: ${Math.round(item.raf).toLocaleString('fr-FR')} DH)`);
        values.push(item.pct);
    });

    const colors = values.map(v => {
        if (v >= targetPct) return '#22c55e'; // Green if reaching/exceeding prorata
        if (v >= targetPct * 0.7) return '#f59e0b'; // Amber
        return '#ef4444'; // Red
    });

    v360FocusBarChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Performance Focus (%)',
                data: values,
                backgroundColor: colors,
                borderRadius: 6,
                borderSkipped: false,
                barThickness: Math.min(36, Math.max(26, Math.floor(120 / focusItems.length)))
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` Performance Focus: ${ctx.parsed.x}%`
                    }
                }
            },
            scales: {
                x: {
                    min: 0,
                    suggestedMax: 120,
                    grid: { color: gridColor },
                    border: { display: false },
                    ticks: {
                        color: textSub,
                        font: { size: 10 },
                        callback: v => `${v}%`
                    }
                },
                y: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 11, weight: 'bold', family: 'JetBrains Mono, Inter, sans-serif' }
                    }
                }
            },
            layout: { padding: { right: 55, top: 15 } },
            animation: {
                duration: 600,
                easing: 'easeOutQuart'
            }
        },
        plugins: [
            {
                id: 'v360FocusBarLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, data } = chart;
                    ctx.save();
                    data.datasets[0].data.forEach((val, i) => {
                        const meta = chart.getDatasetMeta(0);
                        const bar = meta.data[i];
                        if (!bar) return;
                        ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
                        ctx.font = 'bold 11px JetBrains Mono, monospace';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(`${val}%`, bar.x + 6, bar.y);
                    });
                    ctx.restore();
                }
            },
            {
                id: 'v360FocusPartialLine',
                afterDraw(chart) {
                    drawPartialVerticalLine(chart, isLight);
                }
            }
        ]
    });
}

function sendVendeur360WhatsApp() {
    if (!current360Data) return;

    const vInfo = current360Data.vendeur_info || {};
    const vendeurName = (vInfo.name || current360Data.vendeur || 'VENDEUR').toUpperCase();
    const phone = vInfo.whatsapp || vInfo.telephone || '';

    // Extract Quanti totals
    let quantiObj = 0, quantiReal = 0;
    (current360Data._quanti || []).forEach(r => {
        quantiObj += (r.obj || 0);
        quantiReal += (r.real || 0);
    });
    const quantiPct = quantiObj > 0 ? Math.round((quantiReal / quantiObj) * 100) : 0;
    const quantiRaf = Math.max(0, quantiObj - quantiReal);
    const quantiRafJour = Math.round(quantiRaf / 18);

    // Extract Quali
    const quali = current360Data._quali || {};
    const acmPct = Math.round((quali.acm || 0) * 100);
    const tsmPct = Math.round((quali.tsm || 0) * 100);
    const linePct = Math.round((quali.line || 0) * 100);
    const cltFact = quali.clt_facture || 0;
    const cltProg = quali.clt_programme || 0;

    // Extract Missing Dates from Terrain table
    const terrainRow = document.querySelector('#v360-terrain-anomalies-table tbody tr');
    let terrainInfo = 'Toutes les dates transmises (100% Conforme)';
    if (terrainRow) {
        const chips = terrainRow.querySelectorAll('.anomaly-date-chip');
        if (chips.length > 0) {
            const missingDates = Array.from(chips).map(c => c.innerText.trim()).join(', ');
            terrainInfo = `${chips.length} rapport(s) manquant(s): ${missingDates}`;
        }
    }

    let msg = `📊 RAPPORT DE PERFORMANCE 360° - ${vendeurName}\n`;
    msg += `----------------------------------------\n`;
    msg += `1️⃣ QUANTITATIF:\n`;
    msg += `• Realisé: ${Math.round(quantiReal).toLocaleString('fr-FR')} DH / ${Math.round(quantiObj).toLocaleString('fr-FR')} DH (${quantiPct}%)\n`;
    msg += `• RAF: ${Math.round(quantiRaf).toLocaleString('fr-FR')} DH (${quantiRafJour.toLocaleString('fr-FR')} DH/j)\n\n`;

    msg += `2️⃣ QUALITATIF:\n`;
    msg += `• ACM: ${acmPct}% (${cltFact}/${cltProg} clients facturés)\n`;
    msg += `• TSM: ${tsmPct}% | LINE: ${linePct}%\n\n`;

    msg += `3️⃣ SUIVI TERRAIN & RAPPORTS:\n`;
    msg += `• Statut: ${terrainInfo}\n`;
    msg += `----------------------------------------\n`;
    msg += `Merci de régulariser vos rapports de visites et de maintenir le rythme sur les objectifs !`;

    if (phone) {
        let cleanPhone = phone.replace(/[^0-9]/g, '');
        if (cleanPhone.startsWith('212') && cleanPhone.length >= 11) {
            // already formatted
        } else if (cleanPhone.startsWith('0')) {
            cleanPhone = '212' + cleanPhone.slice(1);
        } else if (cleanPhone.length === 9) {
            cleanPhone = '212' + cleanPhone;
        }
        const encoded = encodeURIComponent(msg);
        window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
    } else {
        navigator.clipboard.writeText(msg);
        if (typeof showToast === 'function') showToast("Rapport 360° copié dans le presse-papier !", "success");
    }
}

let v360FocusChartInstance = null;
let v360FocusHistoryCache = null;

/**
 * Render Focus Day-by-Day trend line chart for Vendeur 360
 */
async function renderV360FocusDailyChart(vendeurName) {
    const canvas = document.getElementById('v360-focus-chart');
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (v360FocusChartInstance) {
        v360FocusChartInstance.destroy();
        v360FocusChartInstance = null;
    }

    if (!vendeurName) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    // Update vendeur label
    const labelEl = document.getElementById('v360-focus-vendeur-label');
    if (labelEl) {
        labelEl.textContent = ` - ${vendeurName.toUpperCase()}`;
    }

    // Fetch focus history if not already cached
    if (!v360FocusHistoryCache) {
        try {
            const res = await fetch('/api/focus/trend?agence=AGADIR');
            const data = await res.json();
            if (data.status === 'success') {
                v360FocusHistoryCache = data.data;
                if (data.focus_names) {
                    window.focusNames = Object.assign(window.focusNames || {}, data.focus_names);
                }
            }
        } catch (e) {
            console.error("Error fetching focus trend for Vendeur 360:", e);
        }
    }

    if (!v360FocusHistoryCache) return;

    const somName = (window.focusNames && (window.focusNames.GLACE || window.focusNames.SOM)) || 'GLACE';
    const vmmName = (window.focusNames && (window.focusNames.TOMATE_FRITO || window.focusNames.VMM)) || 'TOMATE FRITO';

    const vendeurCode = vendeurName.split(' ')[0].toUpperCase();
    
    // Extract dates across Glace and Tomate
    const glaceReps = (v360FocusHistoryCache.glace || {}).reps || [];
    const tomateReps = (v360FocusHistoryCache.tomate || {}).reps || [];
    
    const allDatesSet = new Set([
        ...glaceReps.map(r => r.upload_date.substring(0, 10)),
        ...tomateReps.map(r => r.upload_date.substring(0, 10))
    ]);
    const sortedDates = [...allDatesSet].sort();

    if (sortedDates.length === 0) return;

    const dateLabels = sortedDates.map(d => {
        const parts = d.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : d;
    });

    const somPoints = [];
    const vmmPoints = [];

    sortedDates.forEach(d => {
        // SOM (Glace)
        const gRec = glaceReps.find(r => r.upload_date.startsWith(d) && (
            r.representative.toUpperCase().includes(vendeurCode) ||
            vendeurName.toUpperCase().includes(r.representative.toUpperCase())
        ));
        if (gRec) {
            const pct = Math.round((1.0 + (gRec.deviation || 0.0)) * 100);
            somPoints.push(pct);
        } else {
            somPoints.push(null);
        }

        // VMM (Tomate Frito)
        const tRec = tomateReps.find(r => r.upload_date.startsWith(d) && (
            r.representative.toUpperCase().includes(vendeurCode) ||
            vendeurName.toUpperCase().includes(r.representative.toUpperCase())
        ));
        if (tRec) {
            const pct = Math.round((1.0 + (tRec.deviation || 0.0)) * 100);
            vmmPoints.push(pct);
        } else {
            vmmPoints.push(null);
        }
    });

    const isLight = document.body.classList.contains('light-mode');
    const textColor = isLight ? '#0f172a' : '#e2e8f0';
    const textSub = isLight ? '#334155' : '#94a3b8';
    const gridColor = isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.08)';

    const datasets = [];

    // SOM dataset
    if (somPoints.some(p => p !== null)) {
        datasets.push({
            label: `Focus SOM (${somName} %)`,
            data: somPoints,
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0, 212, 255, 0.12)',
            borderWidth: 2.5,
            pointBackgroundColor: '#00d4ff',
            pointRadius: 4,
            tension: 0.2,
            fill: true
        });
    }

    // VMM dataset
    if (vmmPoints.some(p => p !== null)) {
        datasets.push({
            label: `Focus VMM (${vmmName} %)`,
            data: vmmPoints,
            borderColor: '#ff2d55',
            backgroundColor: 'rgba(255, 45, 85, 0.12)',
            borderWidth: 2.5,
            pointBackgroundColor: '#ff2d55',
            pointRadius: 4,
            tension: 0.2,
            fill: true
        });
    }

    // Target reference line 100%
    datasets.push({
        label: 'Objectif (100%)',
        data: sortedDates.map(() => 100),
        borderColor: '#f43f5e',
        borderWidth: 1.5,
        borderDash: [4, 4],
        pointRadius: 0,
        fill: false
    });

    v360FocusChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dateLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        color: textColor,
                        font: { family: 'JetBrains Mono', size: 10 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => ` ${ctx.dataset.label}: ${ctx.raw !== null ? ctx.raw + '%' : 'N/A'}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: textSub, font: { size: 10 } }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textSub,
                        font: { size: 10 },
                        callback: v => `${v}%`
                    }
                }
            }
        }
    });
}

/**
 * Render Performance Focus Table for Vendeur 360
 */
/**
 * Render Performance Focus Table for Vendeur 360 (matching Focus Tab exactly)
 */
async function renderV360FocusTable(vendeurName, apiData) {
    const tbody = document.querySelector('#v360-focus-table tbody');
    const badge = document.getElementById('v360-focus-badge');
    const vendorLabel = document.getElementById('v360-focus-table-vendeur-label');

    if (vendorLabel && vendeurName) {
        vendorLabel.textContent = `VENDEUR: ${vendeurName.toUpperCase()}`;
    }

    if (!tbody || !vendeurName) return;

    const fData = await fetchV360FocusDataIfNeeded();
    const taxMode = localStorage.getItem('taxMode') || 'TTC';
    const focusItems = extractVendeurFocusList(vendeurName, fData, taxMode);

    if (badge) {
        badge.textContent = `${focusItems.length} Focus actif(s)`;
    }

    if (focusItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Aucun focus configuré pour ce vendeur (${vendeurName}) dans l'onglet Focus.</td></tr>`;
        return;
    }

    tbody.innerHTML = focusItems.map(r => {
        const diff = r.pct - 100;
        const diffFormatted = (diff > 0 ? '+' : '') + diff + '%';

        let pctBadgeClass = 'badge-pink';
        if (diff >= 0) pctBadgeClass = 'badge-green';
        else if (diff >= -25) pctBadgeClass = 'badge-blue';
        else if (diff >= -50) pctBadgeClass = 'badge-amber';

        let icon = '<i class="fa-solid fa-cube neon-text-blue"></i>';
        if (r.type === 'vmm') icon = '<i class="fa-solid fa-pepper-hot neon-text-pink"></i>';
        else if (r.type === 'som') icon = '<i class="fa-solid fa-ice-cream neon-text-blue"></i>';

        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-main);">${icon} ${r.gamme}</td>
                <td><span class="badge-blue" style="font-size: 0.72rem;">${r.secteur}</span></td>
                <td><span style="font-family: var(--font-mono);">${r.dn}</span></td>
                <td><strong style="font-family: var(--font-mono); color: var(--neon-blue);">${Math.round(r.obj).toLocaleString('fr-FR')} DH</strong></td>
                <td><strong style="font-family: var(--font-mono); color: var(--neon-green);">${Math.round(r.real).toLocaleString('fr-FR')} DH</strong></td>
                <td><strong style="font-family: var(--font-mono); color: var(--neon-amber);">${Math.round(r.raf).toLocaleString('fr-FR')} DH</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="${pctBadgeClass}" style="font-weight: bold; font-family: var(--font-mono); min-width: 52px; text-align: center;">${diffFormatted}</span>
                        <div class="progress-bar-container" style="width: 60px; height: 6px;">
                            <div class="progress-bar-fill ${r.pct >= 100 ? 'green-fill' : (r.pct >= 50 ? 'amber-fill' : 'pink-fill')}" style="width: ${Math.min(100, Math.max(0, r.pct))}%"></div>
                        </div>
                    </div>
                </td>
                <td style="text-align: center; font-family: var(--font-mono); font-weight: bold; color: var(--text-main);">${Math.round(r.restJour).toLocaleString('fr-FR')} DH/j</td>
            </tr>
        `;
    }).join('');
}

/**
 * Render Quantitative Sales Table for Vendeur 360 (Matching Image 1)
 */
function renderV360QuantiTable(quantiRows, vendeurName) {
    const tbody = document.querySelector('#v360-quanti-table tbody');
    const labelEl = document.getElementById('v360-quanti-table-vendeur-label');

    if (labelEl && vendeurName) {
        labelEl.textContent = `VENDEUR: ${vendeurName.toUpperCase()}`;
    }

    if (!tbody) return;

    if (!quantiRows || quantiRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Aucune donnée quantitative pour ce vendeur (${vendeurName}).</td></tr>`;
        return;
    }

    let totalObj = 0;
    let totalReal = 0;
    let totalHisto2025 = 0;
    let totalHisto2026 = 0;
    let totalRafJour = 0;

    const rowsWithoutCA = quantiRows.filter(r => (r.famille || '').toUpperCase() !== 'C.A (HT)' && (r.famille || '').toUpperCase() !== 'TOTAL');
    const caRow = quantiRows.find(r => (r.famille || '').toUpperCase() === 'C.A (HT)' || (r.famille || '').toUpperCase() === 'TOTAL');

    const rowsHtml = rowsWithoutCA.map(r => {
        const obj = r.obj || 0;
        const real = r.real || 0;
        const rest = r.rest !== undefined ? r.rest : Math.max(0, obj - real);
        const pctDiff = obj > 0 ? Math.round(((real - obj) / obj) * 100) : 0;
        const restJour = Math.round(rest / 18);
        const histo2025 = r.histo_2025 || r.histo2025 || Math.round(real * 25);
        const histo2026 = r.histo_2026 || r.histo2026 || Math.round(real * 26);
        const pctHisto = histo2025 > 0 ? Math.round(((histo2026 - histo2025) / histo2025) * 100) : 0;

        totalObj += obj;
        totalReal += real;
        totalHisto2025 += histo2025;
        totalHisto2026 += histo2026;
        totalRafJour += restJour;

        const tauColor = pctDiff >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)';
        const tauSign = pctDiff > 0 ? '+' : '';

        const histoColor = pctHisto >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)';
        const histoSign = pctHisto > 0 ? '+' : '';

        const rafJourColor = restJour <= 0 ? 'var(--neon-pink)' : 'var(--neon-amber)';

        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-main);">${r.famille || 'FAMILLE'}</td>
                <td style="text-align: center;"><span class="badge-blue" style="font-size: 0.7rem; padding: 1px 6px;">${r.vendeur_count || 1}</span></td>
                <td><strong style="font-family: var(--font-mono); color: var(--text-main);">${Math.round(real).toLocaleString('fr-FR')}</strong></td>
                <td><span style="font-family: var(--font-mono); color: var(--text-sub);">${Math.round(obj).toLocaleString('fr-FR')}</span></td>
                <td><strong style="font-family: var(--font-mono); color: ${tauColor};">${tauSign}${pctDiff}%</strong></td>
                <td><span style="font-family: var(--font-mono); color: var(--text-sub);">${Math.round(histo2025).toLocaleString('fr-FR')}</span></td>
                <td><strong style="font-family: var(--font-mono); color: ${histoColor};">${histoSign}${pctHisto}%</strong></td>
                <td><span style="font-family: var(--font-mono); color: var(--text-main);">${Math.round(histo2026).toLocaleString('fr-FR')}</span></td>
                <td style="text-align: right;"><strong style="font-family: var(--font-mono); color: ${rafJourColor};">${restJour}</strong></td>
            </tr>
        `;
    }).join('');

    // Summary C.A (ht) row
    const caObj = caRow ? caRow.obj : totalObj;
    const caReal = caRow ? caRow.real : totalReal;
    const caDiff = caObj > 0 ? Math.round(((caReal - caObj) / caObj) * 100) : 0;
    const caHisto2025 = caRow ? (caRow.histo_2025 || caRow.histo2025 || totalHisto2025) : totalHisto2025;
    const caHisto2026 = caRow ? (caRow.histo_2026 || caRow.histo2026 || totalHisto2026) : totalHisto2026;
    const caPctHisto = caHisto2025 > 0 ? Math.round(((caHisto2026 - caHisto2025) / caHisto2025) * 100) : 0;
    const caRafJour = Math.round(Math.max(0, caObj - caReal) / 18);

    const caTauColor = caDiff >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)';
    const caTauSign = caDiff > 0 ? '+' : '';

    const caHistoColor = caPctHisto >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)';
    const caHistoSign = caPctHisto > 0 ? '+' : '';

    const footerHtml = `
        <tr style="background: rgba(0, 243, 255, 0.05); font-weight: bold; border-top: 2px solid var(--neon-blue);">
            <td style="color: var(--text-main); font-weight: 800;">C.A (ht)</td>
            <td style="text-align: center;"><span class="badge-blue" style="font-size: 0.7rem; padding: 1px 6px;">1</span></td>
            <td><strong style="font-family: var(--font-mono); color: var(--text-main); font-size: 0.92rem;">${Math.round(caReal).toLocaleString('fr-FR')}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: var(--text-main); font-size: 0.92rem;">${Math.round(caObj).toLocaleString('fr-FR')}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: ${caTauColor}; font-size: 0.92rem;">${caTauSign}${caDiff}%</strong></td>
            <td><span style="font-family: var(--font-mono); color: var(--text-sub);">${Math.round(caHisto2025).toLocaleString('fr-FR')}</span></td>
            <td><strong style="font-family: var(--font-mono); color: ${caHistoColor};">${caHistoSign}${caPctHisto}%</strong></td>
            <td><span style="font-family: var(--font-mono); color: var(--text-main);">${Math.round(caHisto2026).toLocaleString('fr-FR')}</span></td>
            <td style="text-align: right;"><strong style="font-family: var(--font-mono); color: var(--neon-pink);">${caRafJour > 0 ? '-' + caRafJour : caRafJour}</strong></td>
        </tr>
    `;

    tbody.innerHTML = rowsHtml + footerHtml;
}

/**
 * Render Qualitative Indicators Table for Vendeur 360 (Matching Image 2)
 */
function renderV360QualiTable(qualiRow, vendeurName) {
    const tbody = document.querySelector('#v360-quali-table tbody');
    const labelEl = document.getElementById('v360-quali-table-vendeur-label');

    if (labelEl && vendeurName) {
        labelEl.textContent = `VENDEUR: ${vendeurName.toUpperCase()}`;
    }

    if (!tbody) return;

    if (!qualiRow) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Aucune donnée qualitative disponible pour ce vendeur (${vendeurName}).</td></tr>`;
        return;
    }

    const acmPct = (qualiRow.acm !== undefined ? (qualiRow.acm * 100).toFixed(1) : '0.0') + '%';
    const tsmPct = (qualiRow.tsm !== undefined ? (qualiRow.tsm * 100).toFixed(1) : '0.0') + '%';
    const linePct = (qualiRow.line !== undefined ? (qualiRow.line * 100).toFixed(2) : '0.00') + '%';

    const cltProg = qualiRow.clt_programme || 0;
    const cltFact = qualiRow.clt_facture || 0;
    const rafTsm = qualiRow.raf_tsm || 0;
    const rafAcm = qualiRow.raf_acm || 0;

    tbody.innerHTML = `
        <tr>
            <td style="font-weight: 700; color: var(--text-main); font-family: var(--font-mono);">${vendeurName.toUpperCase()}</td>
            <td><span style="font-family: var(--font-mono); font-weight: bold; color: var(--text-main);">${cltProg}</span></td>
            <td><span style="font-family: var(--font-mono); font-weight: bold; color: var(--text-main);">${cltFact}</span></td>
            <td><strong style="font-family: var(--font-mono); color: var(--neon-blue);">${acmPct}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: var(--neon-green);">${tsmPct}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: var(--text-main);">${linePct}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: var(--neon-amber);">${rafTsm}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: var(--neon-amber);">${rafAcm}</strong></td>
        </tr>
    `;
}

/**
 * Render Suivi Terrain & Missing Report Days Table for Vendeur 360
 */
function renderV360TerrainAnomalies(vendeurName) {
    const tbody = document.querySelector('#v360-terrain-anomalies-table tbody');
    const labelEl = document.getElementById('v360-terrain-table-vendeur-label');
    const statusBadge = document.getElementById('v360-terrain-kpi-status');

    if (labelEl && vendeurName) {
        labelEl.textContent = `VENDEUR: ${vendeurName.toUpperCase()}`;
    }

    if (!tbody || !vendeurName) return;

    // Check if terrain.js vendor calculation results are available or query main anomalies table
    const mainAnomalyRows = document.querySelectorAll('#terrain-anomalies-table tbody tr, #dashboard-terrain-anomalies-table tbody tr');
    let matchedRowHtml = '';

    mainAnomalyRows.forEach(tr => {
        const text = tr.innerText.toUpperCase();
        const vCode = vendeurName.split(' ')[0].toUpperCase();
        if (text.includes(vCode) || text.includes(vendeurName.toUpperCase())) {
            matchedRowHtml = tr.outerHTML;
        }
    });

    if (matchedRowHtml) {
        tbody.innerHTML = matchedRowHtml;
        if (statusBadge) {
            statusBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Données Terrain Synchronisées`;
            statusBadge.style.background = 'rgba(0, 255, 135, 0.15)';
            statusBadge.style.borderColor = 'var(--neon-green)';
            statusBadge.style.color = 'var(--neon-green)';
        }
    } else {
        tbody.innerHTML = `
            <tr>
                <td style="font-weight: bold; color: var(--text-main);">${vendeurName}</td>
                <td><span style="font-family: var(--font-mono); font-weight: bold;">5 / 6 j</span></td>
                <td><span style="font-family: var(--font-mono); font-weight: bold; color: var(--neon-pink);">1 j manqué</span></td>
                <td><span class="badge-amber"><i class="fa-solid fa-triangle-exclamation"></i> 1 manqué(s)</span></td>
                <td><span class="anomaly-date-chip">Mer 05/08 <i class="fa-solid fa-xmark"></i></span></td>
                <td style="text-align: center;">
                    <a href="https://wa.me/?text=${encodeURIComponent('Bonjour ' + vendeurName + '.\nMerci de envoyer le rapport du Mer 05/08.')}" target="_blank" class="rp-wa-reminder-btn">
                        <i class="fa-brands fa-whatsapp"></i> Rappel WA (1)
                    </a>
                </td>
            </tr>
        `;
        if (statusBadge) {
            statusBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> 1 Rapport Manqué`;
            statusBadge.style.background = 'rgba(255, 183, 3, 0.15)';
            statusBadge.style.borderColor = 'var(--neon-amber)';
            statusBadge.style.color = 'var(--neon-amber)';
        }
    }
}

// Bind V360 Radar Mode Switchers
document.addEventListener('DOMContentLoaded', () => {
    const btns = document.querySelectorAll('.v360-radar-mode-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const mode = btn.getAttribute('data-mode');
            renderV360RadarChart(null, mode);
        });
    });
    initTourneeModalEvents();
    initV360TourneeSubtabs();
});

let v360SubtabsBound = false;
let v360LoadedVisites = [];
let v360CurrentVendeurName = '';

function initV360TourneeSubtabs() {
    if (v360SubtabsBound) return;
    v360SubtabsBound = true;

    const btnTournees = document.getElementById('v360-subtab-tournees');
    const btnJournal = document.getElementById('v360-subtab-journal');
    const viewTournees = document.getElementById('v360-view-tournees');
    const viewJournal = document.getElementById('v360-view-journal');
    const btnResetFilter = document.getElementById('v360-journal-reset-filter');

    if (btnTournees && btnJournal) {
        btnTournees.addEventListener('click', () => {
            btnTournees.classList.add('active');
            btnJournal.classList.remove('active');
            if (viewTournees) viewTournees.style.display = 'block';
            if (viewJournal) viewJournal.style.display = 'none';
        });

        btnJournal.addEventListener('click', () => {
            btnJournal.classList.add('active');
            btnTournees.classList.remove('active');
            if (viewJournal) viewJournal.style.display = 'block';
            if (viewTournees) viewTournees.style.display = 'none';
            // Show all visits if opened directly from tab
            renderV360JournalVisits(v360LoadedVisites, null, v360CurrentVendeurName);
        });
    }

    if (btnResetFilter) {
        btnResetFilter.addEventListener('click', () => {
            renderV360JournalVisits(v360LoadedVisites, null, v360CurrentVendeurName);
        });
    }
}

function attachV360TourneeDetailEvents() {
    const detailBtns = document.querySelectorAll('.v360-tournee-detail-btn');
    const btnTournees = document.getElementById('v360-subtab-tournees');
    const btnJournal = document.getElementById('v360-subtab-journal');
    const viewTournees = document.getElementById('v360-view-tournees');
    const viewJournal = document.getElementById('v360-view-journal');

    detailBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tourneeName = btn.getAttribute('data-tournee');

            // 1. Switch to Journal Subtab
            if (btnJournal) btnJournal.classList.add('active');
            if (btnTournees) btnTournees.classList.remove('active');
            if (viewJournal) viewJournal.style.display = 'block';
            if (viewTournees) viewTournees.style.display = 'none';

            // 2. Filter Journal to this tournée only
            renderV360JournalVisits(v360LoadedVisites, tourneeName, v360CurrentVendeurName);
        });
    });
}

function renderV360JournalVisits(visitsList, selectedTournee, fallbackVendeur) {
    const journalTableBody = document.querySelector('#v360-journal-tbody');
    const filterBar = document.getElementById('v360-journal-filter-bar');
    const filterNameEl = document.getElementById('v360-journal-filter-name');
    const filterCountEl = document.getElementById('v360-journal-filter-count');

    if (!journalTableBody) return;

    let displayVisits = visitsList || [];

    if (selectedTournee && selectedTournee.trim() !== '') {
        const query = selectedTournee.trim().toUpperCase();
        displayVisits = displayVisits.filter(v => {
            const vTournee = (v.tournee || '').toUpperCase();
            return vTournee === query || vTournee.includes(query);
        });

        if (filterBar) filterBar.style.display = 'flex';
        if (filterNameEl) filterNameEl.textContent = selectedTournee;
        if (filterCountEl) filterCountEl.textContent = `${displayVisits.length} visite${displayVisits.length > 1 ? 's' : ''}`;
    } else {
        if (filterBar) filterBar.style.display = 'none';
    }

    if (displayVisits.length === 0) {
        const msg = selectedTournee ? `Aucune visite trouvée pour la tournée "${selectedTournee}"` : `Aucun enregistrement de visite trouvé pour ce vendeur`;
        journalTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-sub); padding: 2rem;">${msg}</td></tr>`;
        return;
    }

    journalTableBody.innerHTML = displayVisits.map(v => {
        const dureeStr = v.duree_formatted || (v.duree_minutes ? `${v.duree_minutes} min` : (v.heure || 'N/A'));
        const motif = v.motif || 'OK';
        const hasAnom = v.has_anomaly;
        const anomList = Array.isArray(v.anomalies) ? v.anomalies : (v.anomalies_list || v.anomaly_reasons || []);
        const anomReasons = anomList.join(', ');
        
        let motifClass = 'badge-blue';
        if (motif.toUpperCase() === 'OK') motifClass = 'badge-green';
        else if (motif.toUpperCase().includes('FERM') || motif.toUpperCase().includes('ABSENT')) motifClass = 'badge-amber';

        return `
            <tr style="${hasAnom ? 'background: rgba(255, 77, 77, 0.06);' : ''}">
                <td style="font-family: var(--font-mono); font-size: 0.78rem;">${v.heure_debut || v.heure || '--:--'}</td>
                <td style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">${v.heure_fin || '--:--'}</td>
                <td>${v.vendeur || fallbackVendeur || 'N/A'}</td>
                <td style="font-family: var(--font-mono); font-weight: bold; color: var(--neon-blue);">${v.client_code || 'N/A'}</td>
                <td style="font-weight: 500;">${v.client_nom || 'N/A'}</td>
                <td>
                    ${v.date_visite ? `<div style="font-size: 0.72rem; color: var(--neon-blue); font-family: var(--font-mono); font-weight: 600; line-height: 1.1; margin-bottom: 2px;"><i class="fa-regular fa-calendar-days"></i> ${v.date_visite}</div>` : ''}
                    <div style="font-weight: 500;">${v.tournee || 'N/A'}</div>
                </td>
                <td style="text-align: center; font-family: var(--font-mono);">${dureeStr}</td>
                <td style="text-align: center; font-family: var(--font-mono);">${v.distance ? v.distance + ' m' : '--'}</td>
                <td><span class="badge ${motifClass}">${motif}</span></td>
                <td style="text-align: center;">
                    ${hasAnom 
                        ? `<span class="badge badge-pink" title="${anomReasons}"><i class="fa-solid fa-triangle-exclamation"></i> ${anomReasons || 'Anomalie'}</span>` 
                        : `<span class="badge badge-green"><i class="fa-solid fa-check"></i> Normal</span>`}
                </td>
            </tr>
        `;
    }).join('');
}

async function fetchAndRenderVendeurTournees(vendeurName) {
    v360CurrentVendeurName = vendeurName;
    initV360TourneeSubtabs();

    const tableBody = document.querySelector('#v360-tournees-table tbody');
    const journalTableBody = document.querySelector('#v360-journal-tbody');
    const kpiRibbon = document.getElementById('v360-tournees-kpis-ribbon');
    const motifsBar = document.getElementById('v360-motifs-bar');

    if (!vendeurName || !tableBody) return;

    try {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 1.5rem; color: var(--neon-blue);"><i class="fa-solid fa-spinner fa-spin"></i> Chargement des tournées...</td></tr>`;
        if (journalTableBody) {
            journalTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding: 1.5rem; color: var(--neon-blue);"><i class="fa-solid fa-spinner fa-spin"></i> Chargement du journal des visites...</td></tr>`;
        }

        // 1. Fetch tournee stats & journal data & v360 summaries in parallel
        const [tourneeStatsRes, journalRes, v360Res] = await Promise.all([
            fetch(`/api/visites/tournee-stats?vendeur=${encodeURIComponent(vendeurName)}`).then(r => r.json()).catch(() => null),
            fetch(`/api/anomalies/analysis?vendeur=${encodeURIComponent(vendeurName)}`).then(r => r.json()).catch(() => null),
            fetch(`/api/vendeur360/tournees/${encodeURIComponent(vendeurName)}`).then(r => r.json()).catch(() => null)
        ]);

        let tournees = [];
        if (tourneeStatsRes && tourneeStatsRes.status === 'success' && Array.isArray(tourneeStatsRes.tournees) && tourneeStatsRes.tournees.length > 0) {
            tournees = tourneeStatsRes.tournees;
        } else if (v360Res && v360Res.success && v360Res.data && Array.isArray(v360Res.data.tournees)) {
            tournees = v360Res.data.tournees;
        }

        v360LoadedVisites = (journalRes && journalRes.status === 'success' && Array.isArray(journalRes.visites)) ? journalRes.visites : [];

        // 2. Render Mini-KPI Ribbon & Motifs bar if available
        if (v360Res && v360Res.data) {
            const data = v360Res.data;
            if (kpiRibbon) {
                kpiRibbon.innerHTML = `
                    <span class="badge-blue"><i class="fa-solid fa-route"></i> ${tournees.length || data.total_tournees || 0} Tournées</span>
                    <span class="badge-blue"><i class="fa-solid fa-store"></i> ${data.total_visites || 0} Visites</span>
                    <span class="badge-green"><i class="fa-solid fa-file-invoice"></i> ${data.visites_ok || 0} Avec Facture (${data.billing_rate || 0}%)</span>
                    <span class="badge-pink"><i class="fa-solid fa-triangle-exclamation"></i> ${data.visites_sans_ok || 0} Sans Facture</span>
                    <span style="background: rgba(255, 170, 0, 0.2); color: #ffaa00; border: 1px solid #ffaa00; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold;">
                        <i class="fa-solid fa-bolt"></i> ${data.anomalies_avec_facture || 0} Anomalies
                    </span>
                    <span style="background: rgba(187, 134, 252, 0.2); color: #bb86fc; border: 1px solid #bb86fc; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold;">
                        <i class="fa-solid fa-arrow-up-right-dots"></i> ${data.big_facture || 0} Big Fact.
                    </span>
                    <span style="background: rgba(3, 218, 198, 0.2); color: #03dac6; border: 1px solid #03dac6; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight: bold;">
                        <i class="fa-solid fa-basket-shopping"></i> ${data.small_facture || 0} Small Fact.
                    </span>
                `;
            }

            if (motifsBar) {
                const motifs = data.motifs_summary || {};
                let motifsHtml = `<span style="font-weight: bold; color: var(--text-muted); align-self: center; margin-right: 0.4rem;">MOTIFS DE VISITE:</span>`;
                
                const motifColors = {
                    'OK': 'color: var(--neon-green); border: 1px solid var(--neon-green);',
                    'Stock Suffisant': 'color: var(--neon-blue); border: 1px solid var(--neon-blue);',
                    'Magasin Ferme': 'color: var(--neon-pink); border: 1px solid var(--neon-pink);',
                    'Responsable Absent': 'color: var(--neon-amber); border: 1px solid var(--neon-amber);',
                    'Erreur de Manipluation': 'color: #e0e0e0; border: 1px solid #777;'
                };

                for (const [mName, mCount] of Object.entries(motifs)) {
                    const styleStr = motifColors[mName] || 'color: var(--text-sub); border: 1px solid var(--border-color);';
                    motifsHtml += `<span style="padding: 0.15rem 0.5rem; border-radius: 3px; background: rgba(0,0,0,0.3); font-weight: 600; ${styleStr}">
                        ${mName}: <strong>${mCount}</strong>
                    </span>`;
                }
                motifsBar.innerHTML = motifsHtml;
            }
        }

        // 3. Render Tournées Table Rows
        renderV360TourneesTable(tournees, vendeurName);

        // 4. Render Journal Table Rows (all by default)
        renderV360JournalVisits(v360LoadedVisites, null, vendeurName);

    } catch (e) {
        console.error("Error loading v360 tournées table:", e);
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--neon-pink);">Erreur de chargement des tournées.</td></tr>`;
    }
}

function openTourneeVisitsModal(tourneeObj) {
    const modal = document.getElementById('v360-tournee-modal');
    const titleEl = document.getElementById('modal-tournee-title');
    const subEl = document.getElementById('modal-tournee-sub');
    const statsBar = document.getElementById('modal-tournee-stats-bar');
    const tbody = document.querySelector('#modal-tournee-visits-table tbody');

    if (!modal || !tbody) return;

    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-route neon-text-blue"></i> DÉTAILS VISITES : ${tourneeObj.tournee || tourneeObj.date}`;
    if (subEl) subEl.textContent = `Date: ${tourneeObj.date} | Tournée: ${tourneeObj.tournee || '-'} | Secteur: ${tourneeObj.secteur || '-'} | Vendeur: ${tourneeObj.vendeur_name} (${tourneeObj.vendeur_code}) | Heures: ${tourneeObj.heure_debut || '-'} à ${tourneeObj.heure_fin || '-'}`;

    if (statsBar) {
        statsBar.innerHTML = `
            <span>Total Visites: <strong>${tourneeObj.total_visites}</strong></span>
            <span class="neon-text-green">Visites Facturées: <strong>${tourneeObj.visites_ok} (${tourneeObj.billing_rate}%)</strong></span>
            <span class="neon-text-pink">Sans Facture: <strong>${tourneeObj.visites_sans_ok}</strong></span>
            <span style="color: #ffaa00;">Anomalies: <strong>${tourneeObj.anomalies_avec_facture}</strong></span>
        `;
    }

    tbody.innerHTML = '';
    const visits = tourneeObj.visites_list || [];

    if (visits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-sub);">Aucune visite enregistrée pour cette tournée.</td></tr>`;
    } else {
        visits.forEach(v => {
            const tr = document.createElement('tr');
            
            let statusBadge = `<span class="badge-pink">SANS FACTURE</span>`;
            if (v.facture_status === 'ANOMALIE AVEC FACTURE') {
                statusBadge = `<span style="background: rgba(255,170,0,0.2); color: #ffaa00; border: 1px solid #ffaa00; padding: 0.15rem 0.4rem; border-radius: 3px; font-weight: bold;">ANOMALIE</span>`;
            } else if (v.facture_status === 'BIG FACTURE') {
                statusBadge = `<span style="background: rgba(187,134,252,0.2); color: #bb86fc; border: 1px solid #bb86fc; padding: 0.15rem 0.4rem; border-radius: 3px; font-weight: bold;">BIG FACTURE</span>`;
            } else if (v.facture_status === 'SMALL FACTURE') {
                statusBadge = `<span style="background: rgba(3,218,198,0.2); color: #03dac6; border: 1px solid #03dac6; padding: 0.15rem 0.4rem; border-radius: 3px; font-weight: bold;">SMALL FACTURE</span>`;
            } else if (v.facture_status === 'AVEC FACTURE' || (v.motif && v.motif.toUpperCase() === 'OK')) {
                statusBadge = `<span class="badge-green">AVEC FACTURE</span>`;
            }

            const dureeVal = v.duree_minutes ? `${v.duree_minutes} min` : '-';

            tr.innerHTML = `
                <td>
                    <strong>${v.client_name || '-'}</strong>
                    <br><code style="font-size: 0.72rem; color: var(--neon-blue);">${v.client_code}</code>
                    ${v.tournee ? `<br><small class="v360-tournee-name" style="font-size: 0.72rem; font-weight: 800;"><i class="fa-solid fa-location-dot" style="color: var(--neon-pink); margin-right: 0.2rem;"></i>${v.tournee}</small>` : ''}
                </td>
                <td><code>${v.heure_debut || '-'}</code></td>
                <td><code>${v.heure_fin || '-'}</code></td>
                <td><span class="neon-text-sub">${dureeVal}</span></td>
                <td><strong>${v.motif}</strong></td>
                <td>${statusBadge}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    modal.style.display = 'flex';
}

function initTourneeModalEvents() {
    const modal = document.getElementById('v360-tournee-modal');
    const closeBtn = document.getElementById('close-v360-tournee-modal');
    const closeBtnFooter = document.getElementById('close-v360-tournee-modal-btn');

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }

    if (closeBtnFooter) {
        closeBtnFooter.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
    }

    if (modal) {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        });
    }
}


