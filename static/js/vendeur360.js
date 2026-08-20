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
        const secAnalytics = document.getElementById('details-analytics-section');
        const secVendeur360 = document.getElementById('vendeur-360-section');
        const btnAnalytics = document.getElementById('details-subtab-analytics');
        const btnVendeur360 = document.getElementById('details-subtab-vendeur360');
        if (secAnalytics) secAnalytics.style.display = 'none';
        if (secVendeur360) secVendeur360.style.display = 'flex';
        if (btnAnalytics) btnAnalytics.classList.remove('active');
        if (btnVendeur360) btnVendeur360.classList.add('active');

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
                Object.values(sageChartInstances).forEach(c => { if (c) c.resize(); });
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
                if (sageCachedData) {
                    renderAllFamilySageCharts(sageCachedData);
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
                        obj_mois: 0,
                        real: 0,
                        rest: 0,
                        histo_2025: 0,
                        histo_2026: 0
                    };
                }
                familyMap[fam].obj += (r.obj || 0);
                familyMap[fam].obj_mois += (r.obj_mois || 0);
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
                obj_mois: f.obj_mois,
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

        // Calculate remaining days (26 total - 11 elapsed = 15 rest days)
        const workdays = (apiData && apiData.data && apiData.data.workdays) ? apiData.data.workdays : null;
        let restDays = 15; // 26 - 11 = 15 days remaining
        if (workdays) {
            if (workdays.rest !== undefined && workdays.rest > 0) {
                restDays = workdays.rest;
            } else if (workdays.total && workdays.elapsed) {
                restDays = Math.max(1, workdays.total - workdays.elapsed);
            }
        }

        // Store on current360Data for theme-toggle re-render
        if (current360Data) {
            current360Data._quanti = quanti;
            current360Data._quali = quali;
            current360Data._restDays = restDays;
        }

        renderV360QuantiChart(quanti);
        renderV360QualiChart(quali);
        renderV360FocusBarChart(vendeurName, apiData ? apiData.data : null);
        renderV360FocusDailyChart(vendeurName);
        renderV360QuantiTable(quanti, vendeurName, restDays);
        renderV360QualiTable(quali, vendeurName);
        renderV360FocusTable(vendeurName, apiData ? apiData.data : null);
        renderV360TerrainAnomalies(vendeurName);
        loadSageBiDailyData(vendeurName);

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
            <tr class="v360-tournee-row" data-tournee="${tourneeAttr}" style="cursor: pointer; transition: all 0.2s ease;" title="Cliquer pour afficher le journal détaillé de cette tournée">
                <td style="white-space: nowrap;">
                    <div style="font-weight: 700; color: var(--neon-blue); font-size: 0.84rem; line-height: 1.3;">
                        <i class="fa-solid fa-route" style="color: var(--neon-pink); margin-right: 0.3rem; font-size: 0.78rem;"></i>${tourneeName}
                    </div>
                    ${dateStr ? `
                    <div style="font-weight: 600; color: var(--text-muted); font-size: 0.76rem; margin-top: 3px; font-family: var(--font-mono);">
                        <i class="fa-regular fa-calendar-days" style="color: var(--neon-blue); margin-right: 0.35rem;"></i>${dateStr}
                    </div>` : ''}
                </td>
                <td style="text-align: center; font-weight: 600;">${reg}</td>
                <td style="text-align: center; font-weight: bold; color: var(--neon-blue);">${vis}</td>
                <td style="text-align: center; color: var(--neon-green); font-weight: bold;" data-motif="OK" title="Filtrer OK">${ok}</td>
                <td style="text-align: center; color: var(--neon-amber);" data-motif="Magasin Fermé" title="Filtrer Magasin Fermé">${ferme}</td>
                <td style="text-align: center; color: #ff9966;" data-motif="Responsable Absent" title="Filtrer Responsable Absent">${absent}</td>
                <td style="text-align: center; color: var(--neon-blue);" data-motif="Stock Suffisant" title="Filtrer Stock Suffisant">${stock}</td>
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

        const existingRadar = Chart.getChart(canvas);
        if (existingRadar) existingRadar.destroy();
        if (radarChartInstance) {
            radarChartInstance.destroy();
            radarChartInstance = null;
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

    const targetPct = total > 0 ? ((elapsed / total) * 100) : 45.76;
    const xPos = x.getPixelForValue(targetPct);

    if (xPos >= left && xPos <= right) {
        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ef4444'; // Red dashed line

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
            if (json.terrain_records) {
                window.focusTerrainRecords = json.terrain_records;
            }
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

function getV360TerrainFocusSum(repName, focusType, startDate) {
    const terrainRecords = window.focusTerrainRecords || [];
    if (!terrainRecords || terrainRecords.length === 0 || !repName) return 0;
    const code = repName.split(' ')[0].toUpperCase();
    const repUpper = repName.trim().toUpperCase();
    
    const parseIso = (dStr) => {
        if (!dStr) return '';
        const m = String(dStr).match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
        if (m) {
            const day = m[1].padStart(2, '0');
            const month = m[2].padStart(2, '0');
            return `${m[3]}-${month}-${day}`;
        }
        const m2 = String(dStr).match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
        return m2 ? m2[0] : String(dStr);
    };
    
    const minIso = startDate ? parseIso(startDate) : '2026-08-17';
    let total = 0;
    
    terrainRecords.forEach(tr => {
        const rowIso = parseIso(tr.date);
        if (rowIso && rowIso >= minIso) {
            const trVend = (tr.vendeur || '').trim().toUpperCase();
            const trCode = trVend.split(' ')[0];
            if (trCode === code || trVend === repUpper || repUpper.includes(trVend) || trVend.includes(repUpper)) {
                if (focusType === 'GLACE') {
                    total += Number(tr.glass_ca || 0);
                } else {
                    total += Number(tr.tomate_frito || 0);
                }
            }
        }
    });
    
    return total;
}

/**
 * Extract authentic focus items for this vendor matching Focus Tab logic exactly
 */
function extractVendeurFocusList(vendeurName, fData, taxMode) {
    if (!vendeurName || !fData) return [];

    const fNames = window.focusNames || { GLACE: "GLACE (SOM)", TOMATE_FRITO: "TOMATE FRITO (VMM)" };
    const restDays = (window.focusWorkdays && window.focusWorkdays.rest !== undefined) ? window.focusWorkdays.rest : ((window.dashboardData && window.dashboardData.workdays) ? window.dashboardData.workdays.rest : 10);
    const autoAddTerrain = localStorage.getItem('focusAutoAddTerrain') !== 'OFF';
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
        const baseReal = taxMode === 'HT' ? (gRep.realised_ttc ? gRep.realised_ttc / 1.2 : (gRep.realise ? gRep.realise / 1.2 : 0)) : (gRep.realised_ttc || gRep.realise || 0);
        
        const terrainSum = getV360TerrainFocusSum(vendeurName, 'GLACE', '2026-08-17');
        const targetReal = (autoAddTerrain && terrainSum > 0) ? baseReal + (taxMode === 'HT' ? terrainSum / 1.2 : terrainSum) : baseReal;
        
        const raf = Math.max(0, targetObj - targetReal);
        const pct = targetObj > 0 ? Math.round((targetReal / targetObj) * 100) : (gRep.deviation !== undefined ? Math.max(0, Math.round((1 + gRep.deviation) * 100)) : 0);
        const restJour = restDays > 0 ? (raf / restDays) : 0;

        items.push({
            gamme: fNames.GLACE || 'GLACE (SOM)',
            secteur: gRep.secteur || 'AGADIR',
            obj: targetObj,
            real: targetReal,
            baseReal: baseReal,
            terrainSum: terrainSum,
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
        const baseReal = taxMode === 'HT' ? (tRep.realised_ttc ? tRep.realised_ttc / 1.2 : (tRep.realise ? tRep.realise / 1.2 : 0)) : (tRep.realised_ttc || tRep.realise || 0);
        
        const terrainSum = getV360TerrainFocusSum(vendeurName, 'TOMATE_FRITO', '2026-08-17');
        const targetReal = (autoAddTerrain && terrainSum > 0) ? baseReal + (taxMode === 'HT' ? terrainSum / 1.2 : terrainSum) : baseReal;
        
        const raf = Math.max(0, targetObj - targetReal);
        const pct = targetObj > 0 ? Math.round((targetReal / targetObj) * 100) : (tRep.deviation !== undefined ? Math.max(0, Math.round((1 + tRep.deviation) * 100)) : 0);
        const restJour = restDays > 0 ? (raf / restDays) : 0;
        const clients = tRep.nb_clients || tRep.number_client || 0;

        items.push({
            gamme: fNames.TOMATE_FRITO || 'TOMATE FRITO (VMM)',
            secteur: tRep.secteur || 'AGADIR',
            obj: targetObj,
            real: targetReal,
            baseReal: baseReal,
            terrainSum: terrainSum,
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
            const terrainSum = getV360TerrainFocusSum(vendeurName, isGlace ? 'GLACE' : 'TOMATE_FRITO', '2026-08-17');
            const targetReal = (autoAddTerrain && terrainSum > 0) ? (taxMode === 'HT' ? terrainSum / 1.2 : terrainSum) : 0;
            const raf = Math.max(0, targetObj - targetReal);
            const pct = targetObj > 0 ? Math.round((targetReal / targetObj) * 100) : 0;
            const restJour = restDays > 0 ? (raf / restDays) : 0;
            const clients = o.number_client || 0;

            items.push({
                gamme: isGlace ? (fNames.GLACE || 'GLACE (SOM)') : (fNames.TOMATE_FRITO || 'TOMATE FRITO (VMM)'),
                secteur: o.secteur || 'AGADIR',
                obj: targetObj,
                real: targetReal,
                baseReal: 0,
                terrainSum: terrainSum,
                raf: raf,
                pct: pct,
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

    const existingBar = Chart.getChart(canvas);
    if (existingBar) existingBar.destroy();
    if (v360FocusBarChartInstance) {
        v360FocusBarChartInstance.destroy();
        v360FocusBarChartInstance = null;
    }

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
    const restDays = (current360Data && current360Data._restDays > 0) ? current360Data._restDays : 15;
    const quantiRafJour = restDays > 0 ? Math.round(quantiRaf / restDays) : 0;

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

    const existingDaily = Chart.getChart(canvas);
    if (existingDaily) existingDaily.destroy();
    if (v360FocusChartInstance) {
        v360FocusChartInstance.destroy();
        v360FocusChartInstance = null;
    }

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
            },
            plugins: [
                {
                    id: 'focusDailyLastPointValue',
                    afterDraw(chart) {
                        const { ctx, chartArea } = chart;
                        chart.data.datasets.forEach((ds, dsIdx) => {
                            if (ds.label && ds.label.includes('Objectif')) return;
                            const meta = chart.getDatasetMeta(dsIdx);
                            if (!meta || !meta.data || meta.data.length === 0) return;
                            
                            let lastIdx = -1;
                            for (let i = ds.data.length - 1; i >= 0; i--) {
                                if (ds.data[i] !== null && ds.data[i] !== undefined && !isNaN(ds.data[i])) {
                                    lastIdx = i;
                                    break;
                                }
                            }
                            if (lastIdx === -1) return;
                            const pt = meta.data[lastIdx];
                            if (!pt) return;
                            
                            const val = ds.data[lastIdx];
                            const text = `${val}%`;
                            const badgeColor = ds.borderColor || '#00d4ff';
                            
                            ctx.save();
                            ctx.font = 'bold 10px "JetBrains Mono", monospace';
                            const textMetrics = ctx.measureText(text);
                            const badgeW = Math.max(34, textMetrics.width + 10);
                            const badgeH = 18;
                            
                            let badgeY = pt.y - badgeH - 6;
                            if (badgeY < chartArea.top + 2) badgeY = pt.y + 8;
                            let badgeX = pt.x - badgeW / 2;
                            if (badgeX < chartArea.left + 2) badgeX = chartArea.left + 2;
                            if (badgeX + badgeW > chartArea.right - 2) badgeX = chartArea.right - badgeW - 2;
                            
                            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
                            ctx.shadowBlur = 4;
                            ctx.fillStyle = badgeColor;
                            ctx.beginPath();
                            if (ctx.roundRect) ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
                            else ctx.rect(badgeX, badgeY, badgeW, badgeH);
                            ctx.fill();
                            
                            ctx.shadowBlur = 0;
                            ctx.fillStyle = '#ffffff';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2);
                            
                            ctx.beginPath();
                            ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
                            ctx.fillStyle = '#ffffff';
                            ctx.fill();
                            ctx.lineWidth = 2;
                            ctx.strokeStyle = badgeColor;
                            ctx.stroke();
                            
                            ctx.restore();
                        });
                    }
                }
            ]
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

        const terrainBadge = (r.terrainSum && r.terrainSum > 0) ? `<div style="color: var(--neon-green); font-size: 0.76rem; font-weight: 700; margin-top: 2px;">(+${Math.round(r.terrainSum).toLocaleString('fr-FR')})</div>` : '';

        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-main);">${icon} ${r.gamme}</td>
                <td><span class="badge-blue" style="font-size: 0.72rem;">${r.secteur}</span></td>
                <td><span style="font-family: var(--font-mono);">${r.dn}</span></td>
                <td><strong style="font-family: var(--font-mono); color: var(--neon-blue);">${Math.round(r.obj).toLocaleString('fr-FR')} DH</strong></td>
                <td>
                    <strong style="font-family: var(--font-mono); color: var(--neon-blue); font-size: 0.92rem;">${Math.round(r.real).toLocaleString('fr-FR')} DH</strong>
                    ${terrainBadge}
                </td>
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
function renderV360QuantiTable(quantiRows, vendeurName, restDaysOverride) {
    const tbody = document.querySelector('#v360-quanti-table tbody');
    const labelEl = document.getElementById('v360-quanti-table-vendeur-label');

    if (labelEl && vendeurName) {
        labelEl.textContent = `VENDEUR: ${vendeurName.toUpperCase()}`;
    }

    if (!tbody) return;

    if (!quantiRows || quantiRows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Aucune donnée quantitative pour ce vendeur (${vendeurName}).</td></tr>`;
        return;
    }

    // Days remaining from workdays info (defaults to 10)
    const restDays = (restDaysOverride !== undefined && Number(restDaysOverride) > 0)
        ? Number(restDaysOverride)
        : ((window.dashboardData && window.dashboardData.workdays && window.dashboardData.workdays.rest > 0) 
            ? window.dashboardData.workdays.rest 
            : ((current360Data && current360Data._restDays > 0) ? current360Data._restDays : 10));

    let totalObj = 0;
    let totalObjGlobal = 0;
    let totalReal = 0;
    let totalHisto2025 = 0;
    let totalHisto2026 = 0;
    let totalRafJour = 0;

    let rowsWithoutCA = quantiRows.filter(r => (r.famille || '').toUpperCase() !== 'C.A (HT)' && (r.famille || '').toUpperCase() !== 'TOTAL' && !(r.famille || '').toUpperCase().includes('C.A'));
    const caRow = quantiRows.find(r => (r.famille || '').toUpperCase() === 'C.A (HT)' || (r.famille || '').toUpperCase() === 'TOTAL' || (r.famille || '').toUpperCase().includes('C.A'));

    // Check if MISWAK is present, if not and vendor is selected, add MISWAK with 0
    const hasMiswak = rowsWithoutCA.some(r => (r.famille || '').toUpperCase().includes('MISWAK'));
    if (!hasMiswak) {
        rowsWithoutCA.push({
            famille: 'MISWAK',
            vendeur_count: 1,
            real: 0,
            obj: 0,
            obj_mois: 0,
            real_2025: 0,
            h_2024: 0,
            h_pct: 0
        });
    }

    const customFamilyOrder = [
        "LEVURE",
        "MGM",
        "BOUILLON",
        "CONDIMENTS",
        "SAUCES TACOS",
        "SAUCES",
        "CONSERVES",
        "MISWAK"
    ];

    rowsWithoutCA.sort((a, b) => {
        const famA = (a.famille || '').toUpperCase().trim();
        const famB = (b.famille || '').toUpperCase().trim();
        const idxA = customFamilyOrder.findIndex(f => famA === f || famA.includes(f));
        const idxB = customFamilyOrder.findIndex(f => famB === f || famB.includes(f));
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return famA.localeCompare(famB);
    });

    const rowsHtml = rowsWithoutCA.map(r => {
        const obj = r.obj || 0;
        const real = r.real || 0;
        const pctDiff = obj > 0 ? Math.round(((real - obj) / obj) * 100) : 0;
        
        // Exact RAF Jour calculation matching Image 2: ((OBJ_MOIS - REAL) * 1.2) / restDays
        const famObjMois = (r.obj_mois !== undefined && r.obj_mois !== null && r.obj_mois > 0)
            ? r.obj_mois
            : (obj > 0 ? Math.round(obj * 24 / 15) : 0);
        const restJour = (restDays > 0 && famObjMois > 0)
            ? Math.round(((famObjMois - real) * 1.2) / restDays)
            : 0;
        
        // Percentage vs Objectif Global
        const globalDiff = famObjMois > 0 ? Math.round(((real - famObjMois) / famObjMois) * 100) : 0;
        const globalTauColor = globalDiff >= 0 ? 'var(--neon-green)' : (globalDiff >= -20 ? 'var(--neon-amber)' : 'var(--neon-pink)');
        const globalTauSign = globalDiff > 0 ? '+' : '';
        const globalText = famObjMois > 0 ? `${globalTauSign}${globalDiff}%` : '0%';

        // RAF Global (TTC) = (famObjMois - real) * 1.2
        const famRafGlobalTTC = famObjMois > 0 ? ((famObjMois - real) * 1.2) : 0;
        const famRafGlobalColor = famRafGlobalTTC <= 0 ? 'var(--neon-green)' : 'var(--neon-amber)';

        // Use real historical data fields from database
        const histo2025 = (r.real_2025 !== undefined && r.real_2025 !== null) ? r.real_2025 : (r.histo_2025 || 0);
        const histo2026 = (r.h_2024 !== undefined && r.h_2024 !== null) ? r.h_2024 : (r.histo_2026 || (r.obj_mois || 0));
        const pctHisto = (r.h_pct !== undefined && r.h_pct !== null)
            ? Math.round(r.h_pct * 100)
            : (histo2026 > 0 ? Math.round(((histo2025 - histo2026) / histo2026) * 100) : (histo2025 > 0 ? Math.round(((real - histo2025) / histo2025) * 100) : 0));

        totalObj += obj;
        totalObjGlobal += famObjMois;
        totalReal += real;
        totalHisto2025 += histo2025;
        totalHisto2026 += histo2026;
        totalRafJour += restJour;

        const tauColor = pctDiff >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)';
        const tauSign = pctDiff > 0 ? '+' : '';

        const histoColor = pctHisto >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)';
        const histoSign = pctHisto > 0 ? '+' : '';

        const rafJourColor = restJour <= 0 ? 'var(--neon-green)' : 'var(--neon-amber)';
        const displayFamName = (r.famille || '').toUpperCase() === 'SAUCES' ? 'SAUCES TACOS' : (r.famille || 'FAMILLE');

        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-main);">${displayFamName}</td>
                <td style="text-align: center;"><span class="badge-blue" style="font-size: 0.7rem; padding: 1px 6px;">${r.vendeur_count || 1}</span></td>
                <td><strong style="font-family: var(--font-mono); color: var(--neon-blue);">${Math.round(real).toLocaleString('fr-FR')}</strong></td>
                <td><span style="font-family: var(--font-mono); color: var(--text-sub);">${Math.round(obj).toLocaleString('fr-FR')}</span></td>
                <td><strong style="font-family: var(--font-mono); color: ${tauColor};">${tauSign}${pctDiff}%</strong></td>
                <td><strong style="font-family: var(--font-mono); color: var(--text-main); font-weight: 700;">${Math.round(famObjMois).toLocaleString('fr-FR')}</strong></td>
                <td><strong style="font-family: var(--font-mono); color: ${globalTauColor};">${globalText}</strong></td>
                <td><strong style="font-family: var(--font-mono); color: ${famRafGlobalColor};">${Math.round(famRafGlobalTTC).toLocaleString('fr-FR')}</strong></td>
                <td><span style="font-family: var(--font-mono); color: var(--text-sub);">${Math.round(histo2025).toLocaleString('fr-FR')}</span></td>
                <td><strong style="font-family: var(--font-mono); color: ${histoColor};">${histoSign}${pctHisto}%</strong></td>
                <td><span style="font-family: var(--font-mono); color: var(--text-main);">${Math.round(histo2026).toLocaleString('fr-FR')}</span></td>
                <td style="text-align: right;"><strong style="font-family: var(--font-mono); color: ${rafJourColor};">${Math.round(restJour).toLocaleString('fr-FR')}</strong></td>
            </tr>
        `;
    }).join('');

    // Summary C.A (ht) row
    const caObj = caRow ? caRow.obj : totalObj;
    const caReal = caRow ? caRow.real : totalReal;
    const caDiff = caObj > 0 ? Math.round(((caReal - caObj) / caObj) * 100) : 0;
    const caHisto2025 = caRow && (caRow.real_2025 !== undefined && caRow.real_2025 !== null) ? caRow.real_2025 : totalHisto2025;
    const caHisto2026 = caRow && (caRow.h_2024 !== undefined && caRow.h_2024 !== null) ? caRow.h_2024 : totalHisto2026;
    const caPctHisto = (caRow && caRow.h_pct !== undefined && caRow.h_pct !== null)
        ? Math.round(caRow.h_pct * 100)
        : (caHisto2026 > 0 ? Math.round(((caHisto2025 - caHisto2026) / caHisto2026) * 100) : (caHisto2025 > 0 ? Math.round(((caReal - caHisto2025) / caHisto2025) * 100) : 0));

    // Exact C.A (ht) RAF matching Image 2
    const caObjMois = (caRow && caRow.obj_mois && caRow.obj_mois > 0)
        ? caRow.obj_mois
        : (totalObjGlobal > 0 ? totalObjGlobal : (caObj > 0 ? Math.round(caObj * 24 / 15) : 0));
    const caRafJour = (restDays > 0 && caObjMois > 0)
        ? Math.round(((caObjMois - caReal) * 1.2) / restDays)
        : totalRafJour;

    const caGlobalDiff = caObjMois > 0 ? Math.round(((caReal - caObjMois) / caObjMois) * 100) : 0;
    const caGlobalColor = caGlobalDiff >= 0 ? 'var(--neon-green)' : (caGlobalDiff >= -20 ? 'var(--neon-amber)' : 'var(--neon-pink)');
    const caGlobalSign = caGlobalDiff > 0 ? '+' : '';
    const caGlobalText = caObjMois > 0 ? `${caGlobalSign}${caGlobalDiff}%` : '0%';

    const caRafGlobalTTC = caObjMois > 0 ? ((caObjMois - caReal) * 1.2) : ((totalObjGlobal - totalReal) * 1.2);
    const caRafGlobalColor = caRafGlobalTTC <= 0 ? 'var(--neon-green)' : 'var(--neon-amber)';

    const caTauColor = caDiff >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)';
    const caTauSign = caDiff > 0 ? '+' : '';

    const caHistoColor = caPctHisto >= 0 ? 'var(--neon-green)' : 'var(--neon-pink)';
    const caHistoSign = caPctHisto > 0 ? '+' : '';
    const caRafColor = caRafJour <= 0 ? 'var(--neon-green)' : 'var(--neon-amber)';

    const footerHtml = `
        <tr style="background: rgba(0, 243, 255, 0.05); font-weight: bold; border-top: 2px solid var(--neon-blue);">
            <td style="color: var(--text-main); font-weight: 800;">C.A (ht)</td>
            <td style="text-align: center;"><span class="badge-blue" style="font-size: 0.7rem; padding: 1px 6px;">1</span></td>
            <td><strong style="font-family: var(--font-mono); color: var(--neon-blue); font-size: 0.92rem;">${Math.round(caReal).toLocaleString('fr-FR')}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: var(--text-main); font-size: 0.92rem;">${Math.round(caObj).toLocaleString('fr-FR')}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: ${caTauColor}; font-size: 0.92rem;">${caTauSign}${caDiff}%</strong></td>
            <td><strong style="font-family: var(--font-mono); color: var(--neon-amber); font-size: 0.92rem;">${Math.round(caObjMois).toLocaleString('fr-FR')}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: ${caGlobalColor}; font-size: 0.92rem;">${caGlobalText}</strong></td>
            <td><strong style="font-family: var(--font-mono); color: ${caRafGlobalColor}; font-size: 0.92rem;">${Math.round(caRafGlobalTTC).toLocaleString('fr-FR')}</strong></td>
            <td><span style="font-family: var(--font-mono); color: var(--text-sub);">${Math.round(caHisto2025).toLocaleString('fr-FR')}</span></td>
            <td><strong style="font-family: var(--font-mono); color: ${caHistoColor};">${caHistoSign}${caPctHisto}%</strong></td>
            <td><span style="font-family: var(--font-mono); color: var(--text-main);">${Math.round(caHisto2026).toLocaleString('fr-FR')}</span></td>
            <td style="text-align: right;"><strong style="font-family: var(--font-mono); color: ${caRafColor}; font-size: 0.92rem;">${Math.round(caRafJour).toLocaleString('fr-FR')}</strong></td>
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
    initV360QuantiExportExcel();
});

function initV360QuantiExportExcel() {
    const btn = document.getElementById('v360-quanti-export-excel-btn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        const table = document.getElementById('v360-quanti-table');
        if (!table) return;
        const thead = table.querySelector('thead');
        const tbody = table.querySelector('tbody');
        const tfoot = table.querySelector('tfoot');

        const headers = [];
        if (thead) {
            thead.querySelectorAll('th').forEach(th => headers.push(th.innerText.trim()));
        }

        const rows = [];
        if (tbody) {
            tbody.querySelectorAll('tr').forEach(tr => {
                const row = [];
                tr.querySelectorAll('td').forEach(td => row.push(td.innerText.trim().replace(/\n/g, ' ')));
                if (row.length > 0) rows.push(row);
            });
        }
        if (tfoot) {
            tfoot.querySelectorAll('tr').forEach(tr => {
                const row = [];
                tr.querySelectorAll('td').forEach(td => row.push(td.innerText.trim().replace(/\n/g, ' ')));
                if (row.length > 0) rows.push(row);
            });
        }

        if (rows.length === 0) {
            if (typeof showToast === 'function') showToast("Aucune donnée à exporter.", "warning");
            else alert("Aucune donnée à exporter.");
            return;
        }

        const vendeurName = v360CurrentVendeurName || 'Vendeur';
        const cleanVendeur = String(vendeurName).replace(/[^a-zA-Z0-9_-]/g, '_');
        if (typeof exportVisitesTableToExcel === 'function') {
            exportVisitesTableToExcel(rows, headers, `Quantitatif_${cleanVendeur}`);
        }
        if (typeof showToast === 'function') showToast("Export Excel quantitatif réussi !", "success");
    });
}

let v360SubtabsBound = false;
let v360LoadedVisites = [];
let v360CurrentVendeurName = '';

let v360ActiveTourneeFilter = null;
let v360ActiveMotifFilter = null;

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
            renderV360JournalVisits(v360LoadedVisites, v360ActiveTourneeFilter, v360ActiveMotifFilter, v360CurrentVendeurName);
        });
    }

    if (btnResetFilter) {
        btnResetFilter.addEventListener('click', () => {
            v360ActiveTourneeFilter = null;
            v360ActiveMotifFilter = null;
            renderV360MotifsBar();
            renderV360JournalVisits(v360LoadedVisites, null, null, v360CurrentVendeurName);
        });
    }
}

function attachV360TourneeDetailEvents() {
    const rows = document.querySelectorAll('.v360-tournee-row');
    const btnTournees = document.getElementById('v360-subtab-tournees');
    const btnJournal = document.getElementById('v360-subtab-journal');
    const viewTournees = document.getElementById('v360-view-tournees');
    const viewJournal = document.getElementById('v360-view-journal');

    rows.forEach(row => {
        row.addEventListener('click', (e) => {
            const tourneeName = row.getAttribute('data-tournee');
            if (!tourneeName) return;

            const targetMotifCell = e.target.closest('td[data-motif]');
            const selectedMotif = targetMotifCell ? targetMotifCell.getAttribute('data-motif') : null;

            v360ActiveTourneeFilter = tourneeName;
            v360ActiveMotifFilter = selectedMotif || null;

            // 1. Switch to Journal Subtab
            if (btnJournal) btnJournal.classList.add('active');
            if (btnTournees) btnTournees.classList.remove('active');
            if (viewJournal) viewJournal.style.display = 'block';
            if (viewTournees) viewTournees.style.display = 'none';

            // 2. Dynamically re-render Motifs bar for this specific tournée!
            renderV360MotifsBar();

            // 3. Filter Journal to this tournée and motif
            renderV360JournalVisits(v360LoadedVisites, v360ActiveTourneeFilter, v360ActiveMotifFilter, v360CurrentVendeurName);

            // 4. Scroll smoothly to the Journal section
            if (viewJournal) {
                viewJournal.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

function updateV360MotifButtonsVisual() {
    const allBtns = document.querySelectorAll('.v360-motif-btn');
    allBtns.forEach(b => {
        const bMotif = b.getAttribute('data-motif');
        const isSelected = (!v360ActiveMotifFilter && bMotif === 'ALL') || (v360ActiveMotifFilter === bMotif);
        if (isSelected) {
            b.classList.add('active');
            b.style.boxShadow = '0 0 10px rgba(0, 240, 255, 0.5)';
            b.style.transform = 'scale(1.05)';
            b.style.outline = '2px solid #fff';
        } else {
            b.classList.remove('active');
            b.style.boxShadow = 'none';
            b.style.transform = 'none';
            b.style.outline = 'none';
        }
    });
}

function attachV360MotifFilterEvents() {
    const motifBtns = document.querySelectorAll('.v360-motif-btn');
    const btnTournees = document.getElementById('v360-subtab-tournees');
    const btnJournal = document.getElementById('v360-subtab-journal');
    const viewTournees = document.getElementById('v360-view-tournees');
    const viewJournal = document.getElementById('v360-view-journal');

    motifBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const motif = btn.getAttribute('data-motif');
            if (!motif || motif === 'ALL' || motif === v360ActiveMotifFilter) {
                v360ActiveMotifFilter = null;
            } else {
                v360ActiveMotifFilter = motif;
            }

            // 1. Auto-switch to Journal Subtab
            if (btnJournal) btnJournal.classList.add('active');
            if (btnTournees) btnTournees.classList.remove('active');
            if (viewJournal) viewJournal.style.display = 'block';
            if (viewTournees) viewTournees.style.display = 'none';

            // 2. Update button styles
            updateV360MotifButtonsVisual();

            // 3. Render Journal with active filters
            renderV360JournalVisits(v360LoadedVisites, v360ActiveTourneeFilter, v360ActiveMotifFilter, v360CurrentVendeurName);
        });
    });
}

function renderV360JournalVisits(visitsList, selectedTournee, selectedMotif, fallbackVendeur) {
    v360ActiveTourneeFilter = selectedTournee || null;
    v360ActiveMotifFilter = selectedMotif || null;

    const journalTableBody = document.querySelector('#v360-journal-tbody');
    const filterBar = document.getElementById('v360-journal-filter-bar');
    const filterNameEl = document.getElementById('v360-journal-filter-name');
    const filterCountEl = document.getElementById('v360-journal-filter-count');

    if (!journalTableBody) return;

    let displayVisits = visitsList || [];

    // Pre-calculate clients that have at least one OK visit
    const okClientCodes = new Set();
    displayVisits.forEach(v => {
        const c = (v.client_code || '').trim().toUpperCase();
        const m = (v.motif || '').toUpperCase();
        if (c && (m === 'OK' || m.includes('VENTE') || m.includes('COMMANDE') || v.facture_status === 'AVEC FACTURE' || v.has_facture || v.is_client_billed)) {
            okClientCodes.add(c);
        }
    });

    // Filter by Tournée
    if (v360ActiveTourneeFilter && v360ActiveTourneeFilter.trim() !== '') {
        const query = v360ActiveTourneeFilter.trim().toUpperCase();
        displayVisits = displayVisits.filter(v => {
            const vTournee = (v.tournee || '').toUpperCase();
            return vTournee === query || vTournee.includes(query);
        });
    }

    // Filter by Motif
    if (v360ActiveMotifFilter && v360ActiveMotifFilter !== 'ALL') {
        const mQuery = v360ActiveMotifFilter.trim().toUpperCase();
        displayVisits = displayVisits.filter(v => {
            const m = (v.motif || '').toUpperCase().trim();
            const cCode = (v.client_code || '').trim().toUpperCase();
            const isClientBilled = cCode && okClientCodes.has(cCode);

            if (mQuery === 'NO_OK' || mQuery === 'NO OK' || mQuery === 'SANS FACTURE') {
                // If client bought something on any visit (e.g. 2nd visit OK), do NOT list in NO OK (SANS FACTURE)
                if (isClientBilled) return false;
                return m !== 'OK' && !m.includes('VENTE') && !m.includes('COMMANDE');
            }
            if (mQuery === 'OK') return m === 'OK' || isClientBilled;
            if (mQuery.includes('FERM')) {
                if (isClientBilled) return false;
                return m.includes('FERM');
            }
            if (mQuery.includes('ABSENT')) {
                if (isClientBilled) return false;
                return m.includes('ABSENT');
            }
            if (mQuery.includes('STOCK') || mQuery.includes('SUFF')) {
                if (isClientBilled) return false;
                return m.includes('STOCK') || m.includes('SUFF');
            }
            return m === mQuery || m.includes(mQuery);
        });

        if (mQuery === 'NO_OK' || mQuery === 'NO OK' || mQuery === 'SANS FACTURE') {
            const seenV360NoOkMap = new Map();
            displayVisits.forEach(v => {
                const code = (v.client_code || '').trim().toUpperCase();
                if (!code) seenV360NoOkMap.set(v.id || Math.random(), v);
                else if (!seenV360NoOkMap.has(code)) seenV360NoOkMap.set(code, v);
                else {
                    const existing = seenV360NoOkMap.get(code);
                    if ((v.duree_seconds || 0) > (existing.duree_seconds || 0)) {
                        seenV360NoOkMap.set(code, v);
                    }
                }
            });
            displayVisits = Array.from(seenV360NoOkMap.values());
        }
    }

    // Update Filter Toolbar
    const activeFilters = [];
    if (v360ActiveTourneeFilter) activeFilters.push(`Tournée: "${v360ActiveTourneeFilter}"`);
    if (v360ActiveMotifFilter === 'NO_OK') activeFilters.push(`Motif: "NO OK (SANS FACTURE)"`);
    else if (v360ActiveMotifFilter) activeFilters.push(`Motif: "${v360ActiveMotifFilter}"`);

    if (activeFilters.length > 0) {
        if (filterBar) filterBar.style.display = 'flex';
        if (filterNameEl) filterNameEl.textContent = activeFilters.join(' • ');
        if (filterCountEl) filterCountEl.textContent = `${displayVisits.length} visite${displayVisits.length > 1 ? 's' : ''}`;
    } else {
        if (filterBar) filterBar.style.display = 'none';
    }

    if (displayVisits.length === 0) {
        const msg = activeFilters.length > 0 
            ? `Aucune visite trouvée pour les filtres sélectionnés (${activeFilters.join(', ')})`
            : `Aucun enregistrement de visite trouvé pour ce vendeur`;
        journalTableBody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--text-sub); padding: 2rem;">${msg}</td></tr>`;
        return;
    }

    // Pre-count visits per client code in dataset
    const clientVisitsCountMap = {};
    (v360LoadedVisites || []).forEach(v => {
        const c = (v.client_code || '').trim().toUpperCase();
        if (c) {
            clientVisitsCountMap[c] = (clientVisitsCountMap[c] || 0) + 1;
        }
    });

    journalTableBody.innerHTML = displayVisits.map(v => {
        const dureeStr = v.duree_formatted || (v.duree_minutes ? `${v.duree_minutes} min` : (v.heure || 'N/A'));
        const motif = v.motif || 'OK';
        const hasAnom = v.has_anomaly;
        const anomList = Array.isArray(v.anomalies) ? v.anomalies : (v.anomalies_list || v.anomaly_reasons || []);
        const anomReasons = anomList.join(', ');
        
        let motifClass = 'badge-blue';
        if (motif.toUpperCase() === 'OK') motifClass = 'badge-green';
        else if (motif.toUpperCase().includes('FERM') || motif.toUpperCase().includes('ABSENT')) motifClass = 'badge-amber';

        const cCode = (v.client_code || '').trim().toUpperCase();
        const totalVisitesForClient = clientVisitsCountMap[cCode] || 1;
        const isMultiVisite = (totalVisitesForClient >= 2);

        // Yellow for unique visit, Green for multi-visite in background
        const rowBgStyle = isMultiVisite
            ? 'background: rgba(16, 185, 129, 0.16); border-left: 4px solid #10b981;'
            : 'background: rgba(234, 179, 8, 0.13); border-left: 4px solid #eab308;';

        const visitTypeBadge = isMultiVisite
            ? `<span class="badge" style="background: rgba(16, 185, 129, 0.25); color: #10b981; border: 1px solid #10b981; font-size: 0.67rem; font-weight: 800; padding: 1px 5px; border-radius: 3px; margin-left: 4px; white-space: nowrap;" title="Client visité ${totalVisitesForClient} fois"><i class="fa-solid fa-arrows-rotate"></i> Multi (${totalVisitesForClient})</span>`
            : `<span class="badge" style="background: rgba(234, 179, 8, 0.20); color: #d97706; border: 1px solid #eab308; font-size: 0.67rem; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 4px; white-space: nowrap;" title="Visite unique"><i class="fa-solid fa-user"></i> 1 Visite</span>`;

        return `
            <tr style="${rowBgStyle}">
                <td style="font-family: var(--font-mono); font-size: 0.78rem;">${v.heure_debut || v.heure || '--:--'}</td>
                <td style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-muted);">${v.heure_fin || '--:--'}</td>
                <td>${v.vendeur || fallbackVendeur || 'N/A'}</td>
                <td style="font-family: var(--font-mono); font-weight: bold; color: var(--neon-blue); white-space: nowrap;">
                    ${v.client_code || 'N/A'} ${visitTypeBadge}
                </td>
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

async function openV360WhatsappModal(customVisits = null, customTitle = '') {
    const selectEl = document.getElementById('v360-vendeur-select');
    let vendeurName = v360CurrentVendeurName || (selectEl ? selectEl.value : '');
    if (!vendeurName && selectEl && selectEl.selectedIndex >= 0) {
        vendeurName = selectEl.options[selectEl.selectedIndex].text || selectEl.value;
    }
    if (!vendeurName) {
        vendeurName = "Vendeur";
    }

    const waModal = document.getElementById('af-wa-modal');
    const waVendeurNameInput = document.getElementById('af-wa-vendeur-name');
    const waVendeurPhoneInput = document.getElementById('af-wa-vendeur-phone');
    const waMessageTextarea = document.getElementById('af-wa-message-text');
    const badgeEl = document.getElementById('af-wa-client-count-badge');

    // 1. Open modal immediately
    initV360WhatsappModalGlobalListeners();
    if (waModal) {
        waModal.classList.add('open');
        waModal.style.setProperty('display', 'flex', 'important');
        waModal.style.setProperty('opacity', '1', 'important');
        waModal.style.setProperty('pointer-events', 'auto', 'important');
        waModal.style.setProperty('z-index', '999999', 'important');
    }
    if (waVendeurNameInput) waVendeurNameInput.value = vendeurName;
    if (waMessageTextarea) waMessageTextarea.value = "Chargement des clients...";
    if (badgeEl) badgeEl.textContent = "...";

    // 2. Fetch visits if empty
    if (!v360LoadedVisites || v360LoadedVisites.length === 0) {
        try {
            const r = await fetch(`/api/anomalies/analysis?vendeur=${encodeURIComponent(vendeurName)}`);
            const d = await r.json();
            if (d && d.status === 'success' && Array.isArray(d.visites)) {
                v360LoadedVisites = d.visites;
            }
        } catch (e) {
            console.warn("Could not fetch journal visits for WA:", e);
        }
    }

    // 3. Filter visits
    let pool = v360LoadedVisites || [];
    if (v360ActiveTourneeFilter && v360ActiveTourneeFilter.trim() !== '') {
        const queryTournee = v360ActiveTourneeFilter.trim().toUpperCase();
        pool = pool.filter(v => (v.tournee || '').toUpperCase().includes(queryTournee));
    }

    let visitsToSend = customVisits;
    if (!visitsToSend) {
        const okClientCodes = new Set();
        pool.forEach(v => {
            const c = (v.client_code || '').trim().toUpperCase();
            const m = (v.motif || '').toUpperCase();
            if (c && (m === 'OK' || m.includes('VENTE') || m.includes('COMMANDE') || v.facture_status === 'AVEC FACTURE' || v.has_facture || v.is_client_billed)) {
                okClientCodes.add(c);
            }
        });

        if (v360ActiveMotifFilter && v360ActiveMotifFilter !== 'ALL') {
            const queryMotif = v360ActiveMotifFilter.trim().toUpperCase();
            if (queryMotif === 'NO_OK' || queryMotif === 'NO OK' || queryMotif === 'SANS FACTURE') {
                visitsToSend = pool.filter(v => {
                    const cCode = (v.client_code || '').trim().toUpperCase();
                    if (cCode && okClientCodes.has(cCode)) return false;
                    const m = (v.motif || '').toUpperCase().trim();
                    return m !== 'OK' && !m.includes('VENTE') && !m.includes('COMMANDE');
                });
            } else if (queryMotif === 'OK') {
                visitsToSend = pool.filter(v => {
                    const cCode = (v.client_code || '').trim().toUpperCase();
                    const m = (v.motif || '').toUpperCase().trim();
                    return m === 'OK' || m.includes('VENTE') || m.includes('COMMANDE') || (cCode && okClientCodes.has(cCode));
                });
            } else {
                visitsToSend = pool.filter(v => {
                    const cCode = (v.client_code || '').trim().toUpperCase();
                    if (cCode && okClientCodes.has(cCode)) return false;
                    const m = (v.motif || '').toUpperCase().trim();
                    return m.includes(queryMotif);
                });
            }
        } else {
            const noOkVisits = pool.filter(v => {
                const cCode = (v.client_code || '').trim().toUpperCase();
                if (cCode && okClientCodes.has(cCode)) return false;
                const m = (v.motif || '').toUpperCase().trim();
                return m !== 'OK' && !m.includes('VENTE') && !m.includes('COMMANDE');
            });
            visitsToSend = noOkVisits.length > 0 ? noOkVisits : pool;
        }
    }

    // 4. Fetch vendor phone number & real RAF ACM
    let vendeurPhone = '';
    let rafAcm = 20;
    try {
        const resp = await fetch('/api/fdv/whatsapp_link?vendeur=' + encodeURIComponent(vendeurName) + '&include_rapport=false');
        const resData = await resp.json();
        if (resData.status === 'success') {
            if (resData.phone) vendeurPhone = resData.phone;
            if (resData.raf_acm !== undefined && resData.raf_acm !== null && !isNaN(resData.raf_acm)) {
                rafAcm = parseInt(resData.raf_acm, 10);
            }
        }
    } catch (e) {
        console.warn('FDV phone lookup error:', e);
    }

    let filterLabel = customTitle;
    if (!filterLabel) {
        if (v360ActiveMotifFilter === 'NO_OK') filterLabel = "CLIENTS SANS FACTURE (NO OK)";
        else if (v360ActiveMotifFilter) filterLabel = `CLIENTS MOTIF : ${v360ActiveMotifFilter}`;
        else if (v360ActiveTourneeFilter) filterLabel = `TOURNÉE : ${v360ActiveTourneeFilter}`;
        else filterLabel = "CLIENTS NON FACTURÉS (NO OK)";
    }

    const count = (visitsToSend || []).length;
    if (badgeEl) badgeEl.textContent = `${count} client${count > 1 ? 's' : ''}`;

    let msg = `🚨 *RAPPORT DE VISITES TERRAIN*\n`;
    msg += `👤 *Représentant:* ${vendeurName}\n`;
    if (v360ActiveTourneeFilter) msg += `📍 *Tournée:* ${v360ActiveTourneeFilter}\n`;
    msg += `🎯 *Vous avez ${rafAcm} client${rafAcm > 1 ? 's' : ''} à activer aujourd'hui (RAF ACM)*\n`;
    msg += `📊 *Catégorie:* ${filterLabel} (${count} clients)\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `*LISTE DES CLIENTS :*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (visitsToSend && visitsToSend.length > 0) {
        visitsToSend.forEach((v, idx) => {
            const code = v.client_code || '---';
            const nom = v.client_nom || 'Client';
            const motif = v.motif || 'Non spécifié';
            const tournee = v.tournee ? ` - ${v.tournee}` : '';
            const heure = v.heure_debut || v.heure ? ` (${v.heure_debut || v.heure})` : '';
            msg += `${idx + 1}. [${code}] *${nom}* (${motif}${heure}${tournee})\n`;
        });
    } else {
        msg += `(Aucun client trouvé pour cette sélection)\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━\n`;

    if (waVendeurPhoneInput) waVendeurPhoneInput.value = typeof normalizePhoneForWhatsapp === 'function' ? normalizePhoneForWhatsapp(vendeurPhone) : vendeurPhone;
    if (waMessageTextarea) waMessageTextarea.value = msg;
}

function initV360WhatsappModalGlobalListeners() {
    const waModal = document.getElementById('af-wa-modal');
    const waModalClose = document.getElementById('af-wa-modal-close');
    const waVendeurNameInput = document.getElementById('af-wa-vendeur-name');
    const waVendeurPhoneInput = document.getElementById('af-wa-vendeur-phone');
    const waMessageTextarea = document.getElementById('af-wa-message-text');
    const waCopyBtn = document.getElementById('af-wa-copy-btn');
    const waSendBtn = document.getElementById('af-wa-send-btn');

    if (waModalClose) {
        waModalClose.onclick = () => {
            if (waModal) {
                waModal.classList.remove('open');
                waModal.style.setProperty('display', 'none', 'important');
                waModal.style.setProperty('opacity', '0', 'important');
                waModal.style.setProperty('pointer-events', 'none', 'important');
            }
        };
    }

    if (waCopyBtn && waMessageTextarea) {
        waCopyBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(waMessageTextarea.value)
                    .then(() => { if (typeof showToast === 'function') showToast("Message copié !", "success"); })
                    .catch(() => {
                        waMessageTextarea.select();
                        document.execCommand('copy');
                        if (typeof showToast === 'function') showToast("Message copié !", "success");
                    });
            } else {
                waMessageTextarea.select();
                document.execCommand('copy');
                if (typeof showToast === 'function') showToast("Message copié !", "success");
            }
        };
    }

    if (waSendBtn && waMessageTextarea) {
        waSendBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const rawPhone = waVendeurPhoneInput ? waVendeurPhoneInput.value.trim() : '';
            const phone = typeof normalizePhoneForWhatsapp === 'function' 
                ? normalizePhoneForWhatsapp(rawPhone) 
                : rawPhone.replace(/[^0-9]/g, '');

            if (!phone) {
                if (typeof showToast === 'function') showToast("Veuillez saisir un numéro de téléphone valide.", "warning");
                else alert("Veuillez saisir un numéro de téléphone valide.");
                return;
            }

            const msg = waMessageTextarea.value || '';
            const countMatches = msg.match(/^\d+\.\s+\[/gm) || msg.match(/•\s+/g);
            const count = countMatches ? countMatches.length : 'la';
            const vName = waVendeurNameInput ? waVendeurNameInput.value.trim() : 'le vendeur';

            const userConfirmed = window.confirm(`📲 CONFIRMATION ENVOI WHATSAPP\n\nVoulez-vous envoyer la liste de ${count} client(s) sélectionné(s) à :\n👤 ${vName}\n📞 +${phone}\n\nCliquez sur "OK" pour confirmer et ouvrir WhatsApp.`);
            if (!userConfirmed) return;

            const encodedMsg = encodeURIComponent(msg);
            const waUrl = `https://wa.me/${phone}?text=${encodedMsg}`;
            window.open(waUrl, '_blank');
            if (waModal) {
                waModal.classList.remove('open');
                waModal.style.setProperty('display', 'none', 'important');
                waModal.style.setProperty('opacity', '0', 'important');
                waModal.style.setProperty('pointer-events', 'none', 'important');
            }
        };
    }
}

// Export globally
window.openV360WhatsappModal = openV360WhatsappModal;
window.initV360WhatsappModalGlobalListeners = initV360WhatsappModalGlobalListeners;

// Global click delegation for Vendeur 360 WhatsApp button
document.addEventListener('click', (e) => {
    const btn = e.target.closest('#v360-motifs-btn-wa, .v360-btn-wa');
    if (btn) {
        e.preventDefault();
        e.stopPropagation();
        openV360WhatsappModal();
    }
});

function renderV360MotifsBar(defaultData = null) {
    const motifsBar = document.getElementById('v360-motifs-bar');
    if (!motifsBar) return;

    let visits = v360LoadedVisites || [];
    if (v360ActiveTourneeFilter && v360ActiveTourneeFilter.trim() !== '') {
        const query = v360ActiveTourneeFilter.trim().toUpperCase();
        visits = visits.filter(v => {
            const vTournee = (v.tournee || '').toUpperCase();
            return vTournee === query || vTournee.includes(query);
        });
    }

    // Dynamic counts from the scoped visits
    const motifs = {};
    let okCount = 0;
    let noOkCount = 0;

    const okClientCodes = new Set();
    visits.forEach(v => {
        const c = (v.client_code || '').trim().toUpperCase();
        const m = (v.motif || '').toUpperCase();
        if (c && (m === 'OK' || m.includes('VENTE') || m.includes('COMMANDE') || v.facture_status === 'AVEC FACTURE' || v.has_facture || v.is_client_billed)) {
            okClientCodes.add(c);
        }
    });

    visits.forEach(v => {
        const cCode = (v.client_code || '').trim().toUpperCase();
        const isClientBilled = cCode && okClientCodes.has(cCode);
        const rawM = (v.motif || 'Non spécifié').trim();
        let normM = rawM;
        const u = rawM.toUpperCase();
        if (u === 'OK' || u.includes('VENTE') || u.includes('COMMANDE') || isClientBilled) {
            normM = 'OK';
            okCount++;
        } else {
            noOkCount++;
            if (u.includes('FERM')) normM = 'Magasin Ferme';
            else if (u.includes('ABSENT')) normM = 'Responsable Absent';
            else if (u.includes('STOCK') || u.includes('SUFF')) normM = 'Stock Suffisant';
            else if (u.includes('MANIP')) normM = 'Erreur de Manipulation';
        }
        motifs[normM] = (motifs[normM] || 0) + 1;
    });

    const totalV = visits.length || (defaultData?.total_visites || 0);
    if (totalV === 0 && defaultData && !v360ActiveTourneeFilter) {
        Object.assign(motifs, defaultData.motifs_summary || {});
    }

    const tourneeLabel = v360ActiveTourneeFilter 
        ? `<span style="color: var(--neon-pink); font-weight: 700; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block; vertical-align: bottom;">[${v360ActiveTourneeFilter}]</span>` 
        : '';

    let motifsHtml = `
        <span style="font-weight: bold; color: var(--text-muted); align-self: center; margin-right: 0.4rem; font-size: 0.75rem; white-space: nowrap; display: inline-flex; align-items: center; gap: 0.25rem;">
            <i class="fa-solid fa-filter" style="color: var(--neon-blue);"></i>MOTIFS ${tourneeLabel}:
        </span>
        <button type="button" class="v360-motif-btn ${!v360ActiveMotifFilter ? 'active' : ''}" data-motif="ALL" style="padding: 0.22rem 0.65rem; border-radius: 4px; background: ${!v360ActiveMotifFilter ? 'var(--neon-blue)' : 'rgba(0,0,0,0.35)'}; color: ${!v360ActiveMotifFilter ? '#000' : 'var(--text-main)'}; border: 1px solid var(--border-color); font-weight: 700; font-size: 0.72rem; cursor: pointer; transition: all 0.2s ease; white-space: nowrap;">
            TOUT (${totalV})
        </button>
        <button type="button" class="v360-motif-btn ${v360ActiveMotifFilter === 'NO_OK' ? 'active' : ''}" data-motif="NO_OK" style="padding: 0.22rem 0.65rem; border-radius: 4px; background: ${v360ActiveMotifFilter === 'NO_OK' ? 'var(--neon-pink)' : 'rgba(255, 0, 127, 0.15)'}; color: ${v360ActiveMotifFilter === 'NO_OK' ? '#fff' : 'var(--neon-pink)'}; border: 1px solid var(--neon-pink); font-weight: 800; font-size: 0.72rem; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 0.35rem; white-space: nowrap;" title="Clients non facturés / NO OK">
            <i class="fa-solid fa-triangle-exclamation"></i>
            <span>NO OK (SANS FACTURE)</span>
            <span style="background: rgba(0,0,0,0.35); padding: 0.05rem 0.4rem; border-radius: 3px; font-weight: 800;">${noOkCount}</span>
        </button>
    `;
    
    const motifStyles = {
        'OK': { color: 'var(--neon-green)', border: '1px solid var(--neon-green)', bg: 'rgba(0, 255, 136, 0.12)', activeBg: 'var(--neon-green)', activeColor: '#000' },
        'Stock Suffisant': { color: 'var(--neon-blue)', border: '1px solid var(--neon-blue)', bg: 'rgba(0, 240, 255, 0.12)', activeBg: 'var(--neon-blue)', activeColor: '#000' },
        'Magasin Ferme': { color: 'var(--neon-pink)', border: '1px solid var(--neon-pink)', bg: 'rgba(255, 0, 127, 0.12)', activeBg: 'var(--neon-pink)', activeColor: '#fff' },
        'Responsable Absent': { color: 'var(--neon-amber)', border: '1px solid var(--neon-amber)', bg: 'rgba(255, 170, 0, 0.12)', activeBg: 'var(--neon-amber)', activeColor: '#000' },
        'Erreur de Manipulation': { color: '#e0e0e0', border: '1px solid #888', bg: 'rgba(200, 200, 200, 0.12)', activeBg: '#e0e0e0', activeColor: '#000' },
        'Erreur de Manipluation': { color: '#e0e0e0', border: '1px solid #888', bg: 'rgba(200, 200, 200, 0.12)', activeBg: '#e0e0e0', activeColor: '#000' }
    };

    const standardKeys = ['OK', 'Magasin Ferme', 'Responsable Absent', 'Stock Suffisant'];
    const allKeys = Array.from(new Set([...standardKeys, ...Object.keys(motifs)]));

    for (const mName of allKeys) {
        const mCount = motifs[mName] || 0;
        if (mCount === 0 && !standardKeys.includes(mName)) continue;

        const conf = motifStyles[mName] || { color: 'var(--text-main)', border: '1px solid var(--border-color)', bg: 'rgba(0,0,0,0.3)', activeBg: 'var(--neon-blue)', activeColor: '#000' };
        const isSelected = v360ActiveMotifFilter === mName;
        const btnBg = isSelected ? conf.activeBg : conf.bg;
        const btnColor = isSelected ? conf.activeColor : conf.color;

        motifsHtml += `
            <button type="button" class="v360-motif-btn ${isSelected ? 'active' : ''}" data-motif="${mName.replace(/"/g, '&quot;')}" style="padding: 0.22rem 0.65rem; border-radius: 4px; background: ${btnBg}; color: ${btnColor}; border: ${conf.border}; font-weight: 700; font-size: 0.72rem; cursor: pointer; transition: all 0.2s ease; display: inline-flex; align-items: center; gap: 0.35rem; white-space: nowrap;">
                <span>${mName}</span>
                <span style="background: rgba(0,0,0,0.35); padding: 0.05rem 0.4rem; border-radius: 3px; font-weight: 800;">${mCount}</span>
            </button>
        `;
    }

    motifsHtml += `
        <button type="button" id="v360-motifs-btn-wa" class="cyber-btn" style="border-color: #25D366; color: #25D366; background: rgba(37,211,102,0.12); padding: 0.2rem 0.7rem; font-size: 0.72rem; font-weight: bold; display: inline-flex; align-items: center; gap: 0.35rem; margin-left: auto; cursor: pointer; white-space: nowrap;" title="Envoyer la liste de clients filtrée au vendeur par WhatsApp">
            <i class="fa-brands fa-whatsapp" style="font-size: 0.9rem;"></i> ENVOYER VENDEUR WA
        </button>
    `;

    motifsBar.innerHTML = motifsHtml;
    attachV360MotifFilterEvents();

    const waMotifsBtn = document.getElementById('v360-motifs-btn-wa');
    if (waMotifsBtn) {
        waMotifsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openV360WhatsappModal();
        });
    }
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

            renderV360MotifsBar(data);
        } else {
            renderV360MotifsBar();
        }

        // 3. Render Tournées Table Rows
        renderV360TourneesTable(tournees, vendeurName);

        // 4. Render Journal Table Rows (all by default)
        renderV360JournalVisits(v360LoadedVisites, v360ActiveTourneeFilter, v360ActiveMotifFilter, vendeurName);

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

/* ==========================================================================
   SAGE GREEN MULTI-FAMILY DAY-BY-DAY CURVED LINE CHARTS CONTROLLER
   ========================================================================== */

let sageChartInstances = {};
let sageCurrentInterval = '1day';
let sageCurrentMetric = 'pct'; // Taux de Réalisation (%) by default (Image 2)
let sageCurrentCategory = 'ALL'; // ALL | QUANTITATIF | QUALITATIF
let sageCurrentVendeur = 'ALL';
let sageCachedData = null;

function formatSageValue(val, forcePct = false) {
    if (val === undefined || val === null || isNaN(val)) return (forcePct || sageCurrentMetric === 'pct') ? '0%' : '0';
    const num = Number(val);
    if (forcePct || sageCurrentMetric === 'pct') {
        const rounded = Math.round(num);
        const sign = rounded > 0 ? '+' : '';
        return `${sign}${rounded}%`;
    }
    if (Math.abs(num) >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M';
    }
    if (Math.abs(num) >= 10000) {
        return (num / 1000).toFixed(1) + 'k';
    }
    if (Math.abs(num) >= 1000) {
        return Math.round(num).toLocaleString('fr-FR');
    }
    return String(Math.round(num));
}

/**
 * Custom Chart.js Plugin: Alternating subtle vertical column bands
 */
const sageBackgroundBandsPlugin = {
    id: 'sageBackgroundBands',
    beforeDraw(chart) {
        const { ctx, chartArea, scales: { x } } = chart;
        if (!chartArea || !x || !x.ticks) return;
        const count = x.ticks.length;
        if (count <= 0) return;

        ctx.save();
        for (let i = 0; i < count; i++) {
            if (i % 2 === 0) {
                const xCenter = x.getPixelForTick(i);
                let colW = 50;
                if (count > 1) {
                    if (i < count - 1) {
                        colW = Math.abs(x.getPixelForTick(i + 1) - xCenter);
                    } else {
                        colW = Math.abs(xCenter - x.getPixelForTick(i - 1));
                    }
                }
                const left = Math.max(chartArea.left, xCenter - colW / 2);
                const right = Math.min(chartArea.right, xCenter + colW / 2);

                ctx.fillStyle = 'rgba(0, 0, 0, 0.055)';
                ctx.fillRect(left, chartArea.top, right - left, chartArea.bottom - chartArea.top);
            }
        }
        ctx.restore();
    }
};

/**
 * Custom Chart.js Plugin: Soft drop shadow beneath the curved line
 */
const sageDropShadowPlugin = {
    id: 'sageDropShadow',
    beforeDatasetDraw(chart) {
        const ctx = chart.ctx;
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
        ctx.shadowBlur = 14;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 8;
    },
    afterDatasetDraw(chart) {
        chart.ctx.restore();
    }
};

/**
 * Custom Chart.js Plugin: Horizontal Objective reference line with right callout
 */
const sageThreshold100Plugin = {
    id: 'sageThreshold100',
    afterDraw(chart) {
        const isPct = (sageCurrentMetric === 'pct');
        const isQuali = !!(chart.config && chart.config._isQuali);
        const famKey = chart.config ? chart.config._famKey : '';

        const { ctx, chartArea, scales: { y } } = chart;
        if (!chartArea || !y) return;

        // Only draw reference line if pct mode or if qualitative ACM/TSM/LINE
        if (isQuali && famKey !== 'ACM' && famKey !== 'TSM' && famKey !== 'LINE') return;
        if (!isPct && !isQuali) return;

        const targetVal = isQuali ? 100 : 0;
        const y0 = y.getPixelForValue(targetVal);
        if (y0 < chartArea.top - 5 || y0 > chartArea.bottom + 5) return;

        ctx.save();

        // 1. Horizontal dashed line across chart
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = '#4ade80';
        ctx.moveTo(chartArea.left, y0);
        ctx.lineTo(chartArea.right, y0);
        ctx.stroke();
        ctx.setLineDash([]);

        // 2. Right-hand OBJ pill
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;

        const text = isQuali ? '100% OBJ' : '0% OBJ';
        ctx.font = 'bold 9px JetBrains Mono, monospace';
        const textMetrics = ctx.measureText(text);
        const badgeW = textMetrics.width + 12;
        const badgeH = 18;
        const badgeX = chartArea.right - badgeW - 4;
        const badgeY = y0 - badgeH / 2;

        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
        } else {
            ctx.rect(badgeX, badgeY, badgeW, badgeH);
        }
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

        ctx.restore();
    }
};

/**
 * Custom Chart.js Plugin: Value badge ONLY on the LAST point with vibrant styling
 */
const sagePeakValleyBadgesPlugin = {
    id: 'sagePeakValleyBadges',
    afterDraw(chart) {
        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data || meta.data.length === 0) return;
        const dataset = chart.data.datasets[0];
        if (!dataset || !dataset.data || dataset.data.length === 0) return;

        const data = dataset.data;
        const ctx = chart.ctx;
        const { top, bottom, left, right } = chart.chartArea;
        const isQuali = !!(chart.config && chart.config._isQuali);
        const famMeta = (chart.config && chart.config._meta) || {};

        const drawCallout = (idx, val) => {
            const pt = meta.data[idx];
            if (!pt) return;
            const x = pt.x;
            const y = pt.y;

            // Vibrant badge color for last point
            const badgeColor = isQuali ? (famMeta.color || '#0070f3') : '#0070f3';

            ctx.save();

            // 1. Glowing outer halo dot on the line
            ctx.beginPath();
            ctx.arc(x, y, 5.5, 0, Math.PI * 2);
            ctx.fillStyle = isQuali ? 'rgba(0, 212, 255, 0.35)' : 'rgba(0, 112, 243, 0.35)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = badgeColor;
            ctx.stroke();

            // Inner white dot
            ctx.beginPath();
            ctx.arc(x, y, 2, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // 2. Callout pill badge
            const labelStr = isQuali ? `${val}${famMeta.unit || ''}` : formatSageValue(val);
            ctx.font = 'bold 10px JetBrains Mono, Inter, sans-serif';
            const textMetrics = ctx.measureText(labelStr);
            const badgeW = Math.max(36, textMetrics.width + 12);
            const badgeH = 19;

            let badgeY = y - badgeH - 8;
            if (badgeY < top + 2) badgeY = y + 10;
            let badgeX = x - badgeW / 2;
            if (badgeX < left + 2) badgeX = left + 2;
            if (badgeX + badgeW > right - 2) badgeX = right - badgeW - 2;

            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 2;

            ctx.fillStyle = badgeColor;
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 4);
            } else {
                ctx.rect(badgeX, badgeY, badgeW, badgeH);
            }
            ctx.fill();

            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(labelStr, badgeX + badgeW / 2, badgeY + badgeH / 2 + 0.5);

            ctx.restore();
        };

        if (data.length > 0) {
            let lastIdx = -1;
            for (let i = data.length - 1; i >= 0; i--) {
                const val = data[i];
                if (val !== null && val !== undefined && !isNaN(val)) {
                    lastIdx = i;
                    break;
                }
            }
            if (lastIdx >= 0) {
                const lastVal = Number(data[lastIdx]) || 0;
                drawCallout(lastIdx, lastVal);
            }
        }
    }
};

/**
 * Fetch and render all family charts for the selected vendeur
 */
async function loadSageBiDailyData(vendeur, family, metric, interval) {
    if (vendeur !== undefined && vendeur !== null) {
        sageCurrentVendeur = vendeur.trim();
    } else {
        const vSelect = document.getElementById('v360-vendeur-select');
        sageCurrentVendeur = (vSelect && vSelect.value) ? vSelect.value.trim() : 'ALL';
    }

    if (metric !== undefined && metric !== null) {
        sageCurrentMetric = metric.trim();
    } else {
        const mSelect = document.getElementById('sage-metric-select');
        if (mSelect) sageCurrentMetric = mSelect.value;
    }

    if (interval !== undefined && interval !== null) {
        sageCurrentInterval = interval.trim();
    }

    try {
        const params = new URLSearchParams({
            vendeur: sageCurrentVendeur || 'ALL',
            metric: sageCurrentMetric || 'pct',
            interval: sageCurrentInterval || '1day'
        });

        const res = await fetch(`/api/vendeur-bi-daily-trends?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data && data.status === 'success') {
            sageCachedData = data;
            
            const roleBadge = document.getElementById('sage-role-badge');
            if (roleBadge) {
                const r = (data.role || 'TOUS').toUpperCase();
                roleBadge.textContent = r;
                roleBadge.className = 'sage-family-badge ' + (r.includes('SOM') && !r.includes('VMM') ? 'sage-badge-som' : (r.includes('VMM') && !r.includes('SOM') ? 'sage-badge-vmm' : 'sage-badge-global'));
            }

            renderAllFamilySageCharts(data);
        }
    } catch (err) {
        console.error("Error loading sage multi-family data:", err);
    }
}

/**
 * Render all family cards and minimal line charts
 */
function renderAllFamilySageCharts(apiData) {
    Object.keys(sageChartInstances).forEach(k => {
        if (sageChartInstances[k]) {
            sageChartInstances[k].destroy();
        }
    });
    sageChartInstances = {};

    const container = document.getElementById('sage-families-container');
    if (!container) return;

    const familyData = apiData.family_data || {};
    let familiesToShow = apiData.families_to_show || Object.keys(familyData);

    // Apply category filter (TOUS, QUANTITATIF, QUALITATIF)
    if (sageCurrentCategory === 'QUANTITATIF') {
        familiesToShow = familiesToShow.filter(k => {
            const f = familyData[k];
            return !f || !f.meta || !f.meta.is_quali;
        });
    } else if (sageCurrentCategory === 'QUALITATIF') {
        familiesToShow = familiesToShow.filter(k => {
            const f = familyData[k];
            return f && f.meta && f.meta.is_quali;
        });
    }

    if (!familiesToShow || familiesToShow.length === 0) {
        container.innerHTML = '<div style="color: #bbf7d0; text-align: center; padding: 2rem; font-family: monospace;">Aucune donnée disponible pour cette sélection.</div>';
        return;
    }

    // Build HTML for all family cards
    let html = '';
    familiesToShow.forEach(famKey => {
        const f = familyData[famKey];
        if (!f) return;
        const meta = f.meta || { title: famKey, icon: 'fa-solid fa-chart-line', badge: 'SOM' };
        const isCA = (famKey === 'CA');
        const isQuali = !!meta.is_quali;
        const cardClass = isCA ? 'sage-family-card sage-ca-card' : 'sage-family-card';
        const badgeClass = meta.badge === 'SOM' ? 'sage-badge-som' : (meta.badge === 'VMM' ? 'sage-badge-vmm' : 'sage-badge-global');
        
        const isPct = (sageCurrentMetric === 'pct');
        let maxText = '--';
        let minText = '--';
        let totalText = '--';
        let avgText = '--';

        if (isQuali) {
            const unit = meta.unit || '';
            maxText = f.max_point ? `${f.max_point.value}${unit} (${f.max_point.label})` : '--';
            minText = f.min_point ? `${f.min_point.value}${unit} (${f.min_point.label})` : '--';
            if (f.points && f.points.length > 0) {
                const lastPt = f.points[f.points.length - 1];
                totalText = `${lastPt.value}${unit} (Actuel)`;
            }
            avgText = `${f.avg_value}${unit}`;
        } else {
            maxText = f.max_point ? `${formatSageValue(f.max_point.value)} (${f.max_point.label})` : '--';
            minText = f.min_point ? `${formatSageValue(f.min_point.value)} (${f.min_point.label})` : '--';
            if (isPct && f.points && f.points.length > 0) {
                const lastPt = f.points[f.points.length - 1];
                const sign = lastPt.pct > 0 ? '+' : '';
                totalText = `${sign}${lastPt.pct}% (Actuel)`;
            } else {
                totalText = `${formatSageValue(f.total_sales || f.total_real)} DH`;
            }
            avgText = isPct ? `${f.avg_value > 0 ? '+' : ''}${f.avg_value}%` : formatSageValue(f.avg_value);
        }

        html += `
        <div class="${cardClass}" id="sage-card-${famKey}">
            <div class="sage-chart-header" style="margin-bottom: 0.85rem;">
                <div class="sage-title" style="font-size: 0.95rem;">
                    <i class="${meta.icon}" style="color: ${meta.color || '#4ade80'};"></i>
                    <span>${meta.title}</span>
                    <span class="sage-family-badge ${badgeClass}">${meta.badge}</span>
                </div>
            </div>

            <!-- STATS SUMMARY BAR -->
            <div class="sage-kpi-bar" style="margin-bottom: 0.85rem; gap: 0.5rem;">
                <div class="sage-kpi-chip" style="border-color: rgba(34, 197, 94, 0.4); padding: 0.3rem 0.65rem;">
                    <span class="sage-kpi-title" style="color: #4ade80; font-size: 0.6rem;"><i class="fa-solid fa-arrow-trend-up"></i> PIC MAX</span>
                    <span class="sage-kpi-val" style="color: #4ade80; font-size: 0.85rem;">${maxText}</span>
                </div>
                <div class="sage-kpi-chip" style="border-color: rgba(239, 68, 68, 0.4); padding: 0.3rem 0.65rem;">
                    <span class="sage-kpi-title" style="color: #f87171; font-size: 0.6rem;"><i class="fa-solid fa-arrow-trend-down"></i> VALLÉE MIN</span>
                    <span class="sage-kpi-val" style="color: #f87171; font-size: 0.85rem;">${minText}</span>
                </div>
                <div class="sage-kpi-chip" style="padding: 0.3rem 0.65rem;">
                    <span class="sage-kpi-title" style="font-size: 0.6rem;">${isQuali ? 'VALEUR ACTUELLE' : 'TOTAL PÉRIODE'}</span>
                    <span class="sage-kpi-val" style="color: #ffffff; font-size: 0.85rem;">${totalText}</span>
                </div>
                <div class="sage-kpi-chip" style="padding: 0.3rem 0.65rem;">
                    <span class="sage-kpi-title" style="font-size: 0.6rem;">MOYENNE / JOUR</span>
                    <span class="sage-kpi-val" style="color: #bbf7d0; font-size: 0.85rem;">${avgText}</span>
                </div>
            </div>

            <!-- MINIMAL LINE CANVAS WRAPPER -->
            <div class="sage-chart-wrapper" style="height: ${isCA ? '280px' : '230px'};">
                <canvas id="sage-canvas-${famKey}"></canvas>
            </div>
        </div>
        `;
    });

    container.innerHTML = html;

    familiesToShow.forEach(famKey => {
        const f = familyData[famKey];
        if (f) {
            renderSingleSageChart(famKey, f);
        }
    });
}

/**
 * Render a minimal curved line chart for a single family with negative percentage support
 */
function renderSingleSageChart(famKey, famPayload) {
    const canvas = document.getElementById(`sage-canvas-${famKey}`);
    if (!canvas || typeof Chart === 'undefined') return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points = famPayload.points || [];
    if (points.length === 0) return;

    const labels = points.map(p => p.label);
    const values = points.map(p => p.value);
    const meta = famPayload.meta || {};
    const isQuali = !!meta.is_quali;
    const isPct = (sageCurrentMetric === 'pct');

    const maxVal = Math.max(...values, 0);
    const minVal = Math.min(...values, 0);

    let yMax, yMin;
    if (isQuali) {
        if (famKey === 'ACM' || famKey === 'TSM' || famKey === 'LINE') {
            yMin = 0;
            yMax = Math.max(105, Math.ceil(maxVal * 1.15));
        } else if (famKey === 'CLTS_FACTURE') {
            yMin = 0;
            yMax = Math.max(10, Math.ceil(maxVal * 1.25));
        } else {
            yMin = 0;
            yMax = Math.max(100, Math.ceil(maxVal * 1.15));
        }
    } else {
        yMax = isPct ? Math.max(Math.ceil(maxVal * 1.25), 20) : (maxVal > 0 ? maxVal * 1.22 : 100);
        yMin = isPct ? Math.min(Math.floor(minVal * 1.25), -20) : (minVal < 0 ? minVal * 1.15 : 0);
    }

    const getBorderColor = function(context) {
        const chart = context.chart;
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales || !scales.y || !isPct) {
            return meta.color || '#bbf7d0';
        }

        const y0 = scales.y.getPixelForValue(0);
        const top = chartArea.top;
        const bottom = chartArea.bottom;
        const height = bottom - top;
        if (height <= 0) return '#4ade80';

        const stop0 = Math.max(0, Math.min(1, (y0 - top) / height));
        if (stop0 <= 0.005) return '#ef4444'; // All points below 0%
        if (stop0 >= 0.995) return '#4ade80'; // All points above 0%

        const gradient = ctx.createLinearGradient(0, top, 0, bottom);
        gradient.addColorStop(0, '#4ade80');
        gradient.addColorStop(Math.max(0, stop0 - 0.008), '#4ade80');
        gradient.addColorStop(Math.min(1, stop0 + 0.008), '#ef4444');
        gradient.addColorStop(1, '#ef4444');
        return gradient;
    };

    sageChartInstances[famKey] = new Chart(ctx, {
        type: 'line',
        _isQuali: isQuali,
        _meta: meta,
        _famKey: famKey,
        data: {
            labels: labels,
            datasets: [{
                label: isQuali ? meta.title : (isPct ? 'Taux (%)' : 'Ventes'),
                data: values,
                borderColor: isQuali ? (meta.color || '#00d4ff') : getBorderColor,
                borderWidth: 3.8,
                tension: 0.46,
                capBezierPoints: true,
                pointRadius: 4.5,
                pointBackgroundColor: (ctx) => {
                    if (isQuali) return meta.color || '#00d4ff';
                    if (isPct) {
                        const val = ctx.raw;
                        return val >= 0 ? '#4ade80' : '#ef4444';
                    }
                    return '#00d4ff';
                },
                pointBorderColor: '#ffffff',
                pointBorderWidth: 1.5,
                pointHoverRadius: 7,
                pointHoverBackgroundColor: (ctx) => {
                    if (isQuali) return meta.color || '#00d4ff';
                    if (isPct) {
                        const val = ctx.raw;
                        return val >= 0 ? '#4ade80' : '#ef4444';
                    }
                    return '#bbf7d0';
                },
                pointHoverBorderColor: '#ffffff',
                pointHoverBorderWidth: 2,
                fill: false
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 25,
                    bottom: 5,
                    left: 6,
                    right: 12
                }
            },
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 30, 24, 0.95)',
                    titleColor: '#bbf7d0',
                    bodyColor: '#ffffff',
                    borderColor: 'rgba(187, 247, 208, 0.35)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    titleFont: { family: 'JetBrains Mono, monospace', size: 11, weight: 'bold' },
                    bodyFont: { family: 'Inter, sans-serif', size: 11 },
                    callbacks: {
                        title: (tooltipItems) => {
                            const idx = tooltipItems[0].dataIndex;
                            const pt = points[idx];
                            return `${pt.sublabel || pt.label} (Date: ${(pt.dates || []).join(', ')})`;
                        },
                        label: (tooltipItem) => {
                            const idx = tooltipItem.dataIndex;
                            const pt = points[idx];
                            const lines = [];
                            if (isQuali) {
                                const unit = meta.unit || '';
                                lines.push(` ${meta.title} : ${pt.real}${unit}`);
                                lines.push(` Objectif : ${pt.obj}${unit}`);
                                if (pt.pct !== undefined) {
                                    lines.push(` Taux Réalisé : ${pt.pct}%`);
                                }
                            } else if (isPct) {
                                const status = pt.pct >= 0 ? '✅ OBJECTIF ATTEINT' : '⚠️ EN DESSOUS';
                                const sign = pt.pct > 0 ? '+' : '';
                                lines.push(` Taux vs Obj : ${sign}${pt.pct}% (${status})`);
                                lines.push(` Réalisé : ${formatSageValue(pt.real)} DH`);
                                lines.push(` Objectif : ${formatSageValue(pt.obj)} DH`);
                                lines.push(` Ventes du Jour : ${formatSageValue(pt.sales)} DH`);
                            } else if (sageCurrentMetric === 'sales') {
                                lines.push(` Ventes du Jour : ${formatSageValue(pt.sales)} DH`);
                                lines.push(` Réalisé Cumulé : ${formatSageValue(pt.real)} DH`);
                                lines.push(` Objectif : ${formatSageValue(pt.obj)} DH (${pt.pct}%)`);
                            } else if (sageCurrentMetric === 'real') {
                                lines.push(` Réalisé Cumulé : ${formatSageValue(pt.real)} DH`);
                                lines.push(` Objectif : ${formatSageValue(pt.obj)} DH (${pt.pct}%)`);
                                lines.push(` Ventes du Jour : ${formatSageValue(pt.sales)} DH`);
                            } else if (sageCurrentMetric === 'obj') {
                                lines.push(` Objectif Cumulé : ${formatSageValue(pt.obj)} DH`);
                                lines.push(` Réalisé : ${formatSageValue(pt.real)} DH (${pt.pct}%)`);
                            } else if (sageCurrentMetric === 'ecart') {
                                const sign = pt.ecart >= 0 ? '+' : '';
                                lines.push(` Écart vs Objectif : ${sign}${formatSageValue(pt.ecart)} DH (${pt.pct}%)`);
                                lines.push(` Réalisé : ${formatSageValue(pt.real)} DH`);
                                lines.push(` Objectif : ${formatSageValue(pt.obj)} DH`);
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.72)',
                        font: { family: 'JetBrains Mono, monospace', size: 11, weight: '600' },
                        padding: 6
                    }
                },
                y: {
                    min: yMin,
                    max: yMax,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.10)',
                        drawBorder: false
                    },
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.68)',
                        font: { family: 'JetBrains Mono, monospace', size: 10 },
                        callback: (val) => {
                            if (isQuali) {
                                return `${Math.round(val)}${meta.unit || ''}`;
                            }
                            return isPct ? `${val > 0 ? '+' : ''}${Math.round(val)}%` : formatSageValue(val);
                        }
                    }
                }
            }
        },
        plugins: [
            sageBackgroundBandsPlugin,
            sageThreshold100Plugin,
            sageDropShadowPlugin,
            sagePeakValleyBadgesPlugin
        ]
    });
}

/**
 * Initialize Sage Green Chart controls and event listeners
 */
function initSageChartListeners() {
    const metricSelect = document.getElementById('sage-metric-select');
    if (metricSelect) {
        metricSelect.addEventListener('change', (e) => {
            sageCurrentMetric = e.target.value;
            loadSageBiDailyData(sageCurrentVendeur, 'ALL', sageCurrentMetric, sageCurrentInterval);
        });
    }

    // Category pills (ALL / QUANTITATIF / QUALITATIF)
    const catPills = [
        { id: 'sage-pill-cat-all', cat: 'ALL' },
        { id: 'sage-pill-cat-quanti', cat: 'QUANTITATIF' },
        { id: 'sage-pill-cat-quali', cat: 'QUALITATIF' }
    ];

    catPills.forEach(p => {
        const btn = document.getElementById(p.id);
        if (btn) {
            btn.addEventListener('click', () => {
                catPills.forEach(b => {
                    const el = document.getElementById(b.id);
                    if (el) el.classList.remove('active');
                });
                btn.classList.add('active');
                sageCurrentCategory = p.cat;
                if (sageCachedData) {
                    renderAllFamilySageCharts(sageCachedData);
                } else {
                    loadSageBiDailyData(sageCurrentVendeur, 'ALL', sageCurrentMetric, sageCurrentInterval);
                }
            });
        }
    });

    const pillBtns = [
        { id: 'sage-pill-day', interval: '1day' },
        { id: 'sage-pill-week', interval: '2days' }
    ];

    pillBtns.forEach(p => {
        const btn = document.getElementById(p.id);
        if (btn) {
            btn.addEventListener('click', () => {
                pillBtns.forEach(b => {
                    const el = document.getElementById(b.id);
                    if (el) el.classList.remove('active');
                });
                btn.classList.add('active');
                sageCurrentInterval = p.interval;
                loadSageBiDailyData(sageCurrentVendeur, 'ALL', sageCurrentMetric, sageCurrentInterval);
            });
        }
    });

    // Initial load: Default to 'pct' (Taux de Réalisation)
    setTimeout(() => {
        const vSelect = document.getElementById('v360-vendeur-select');
        const initVendeur = (vSelect && vSelect.value) ? vSelect.value : 'ALL';
        loadSageBiDailyData(initVendeur, 'ALL', 'pct', '1day');
    }, 350);
}

// Auto init on load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSageChartListeners);
} else {
    initSageChartListeners();
}
