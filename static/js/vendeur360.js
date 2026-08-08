/**
 * MADEC.KPI - Profil Vendeur 360° Dashboard Handler
 */

let current360Data = null;
let radarChartInstance = null;
let v360QuantiChartInstance = null;
let v360QualiChartInstance = null;

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

        const vendeurUpper = vendeurName.trim().toUpperCase();

        const quanti = (apiData.data.quantitative || []).filter(r =>
            (r.vendeur || '').trim().toUpperCase() === vendeurUpper
        );
        const qualiArr = (apiData.data.qualitative || []).filter(r =>
            (r.vendeur || '').trim().toUpperCase() === vendeurUpper
        );
        const quali = qualiArr.length > 0 ? qualiArr[0] : null;

        // Store on current360Data for theme-toggle re-render
        if (current360Data) {
            current360Data._quanti = quanti;
            current360Data._quali = quali;
        }

        renderV360QuantiChart(quanti);
        renderV360QualiChart(quali);
        renderV360FocusBarChart(vendeurName, apiData ? apiData.data : null);
        renderV360FocusDailyChart(vendeurName);
        renderV360FocusTable(vendeurName, apiData ? apiData.data : null);

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

function renderV360TourneesTable(tournees) {
    const tbody = document.querySelector('#v360-tournees-table tbody');
    if (!tbody) return;

    tbody.innerHTML = '';
    if (tournees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-sub);">Aucune tournée enregistrée.</td></tr>`;
        return;
    }

    tournees.forEach(t => {
        const tr = document.createElement('tr');
        const rateClass = t.billing_rate >= 50 ? 'neon-text-green' : (t.billing_rate >= 30 ? 'neon-text-amber' : 'neon-text-pink');
        tr.innerHTML = `
            <td><strong>${t.tournee}</strong></td>
            <td><code>${t.total_clients}</code></td>
            <td><span class="neon-text-green font-weight-bold">${t.clients_ok}</span></td>
            <td><span class="neon-text-pink font-weight-bold">${t.clients_sans_ok}</span></td>
            <td><span class="${rateClass} font-weight-bold">${t.billing_rate}%</span></td>
        `;
        tbody.appendChild(tr);
    });
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
 * Render Quantitative horizontal bar chart: % evolution vs H-1 per famille
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

    if (!quantiRows || quantiRows.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const isLight = document.body.classList.contains('light-mode');
    const textColor = isLight ? '#0f172a' : '#e2e8f0';
    const textSub = isLight ? '#334155' : '#94a3b8';
    const gridColor = isLight ? 'rgba(15,23,42,0.1)' : 'rgba(255,255,255,0.08)';

    // Sort by famille: put C.A (TTC) first, then others alphabetically
    const sorted = [...quantiRows].sort((a, b) => {
        if (a.famille === 'C.A (TTC)') return -1;
        if (b.famille === 'C.A (TTC)') return 1;
        return a.famille.localeCompare(b.famille);
    });

    const labels = sorted.map(r => r.famille);
    // Use percent field for Realization vs Objective deviation (%) - already decimal e.g. -0.109 = -11%
    const values = sorted.map(r => {
        if ((!r.real || r.real === 0) && (!r.obj || r.obj === 0)) {
            return 0;
        }
        const pct = r.percent !== undefined ? r.percent : (r.obj > 0 ? (r.real / r.obj - 1.0) : 0);
        return Math.round((pct || 0) * 100);
    });

    const colors = values.map(v => {
        if (v > 0) return '#22c55e';       // green (exceeded objective)
        if (v >= -15) return '#f59e0b';    // amber (near objective)
        return '#ef4444';                  // red (behind objective)
    });

    // Update vendeur label
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
                label: 'Écart / Objectif (%)',
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
                            const v = ctx.parsed.x;
                            return ` ${v > 0 ? '+' : ''}${v}%`;
                        }
                    }
                },
                datalabels: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    border: { display: false },
                    ticks: {
                        color: textSub,
                        font: { size: 10 },
                        callback: v => `${v > 0 ? '+' : ''}${v}%`
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
            layout: { padding: { right: 40, left: 10 } },
            animation: {
                duration: 600,
                easing: 'easeOutQuart'
            }
        },
        plugins: [{
            id: 'v360QuantiLabels',
            afterDatasetsDraw(chart) {
                const { ctx, data, scales } = chart;
                ctx.save();
                data.datasets[0].data.forEach((val, i) => {
                    const meta = chart.getDatasetMeta(0);
                    const bar = meta.data[i];
                    if (!bar) return;
                    const isPos = val >= 0;
                    const y = bar.y;
                    ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
                    ctx.font = 'bold 10px JetBrains Mono, monospace';
                    ctx.textBaseline = 'middle';

                    if (isPos) {
                        ctx.textAlign = 'left';
                        ctx.fillText(`+${val}%`, bar.x + 5, y);
                    } else {
                        // For negative bars, if bar.x is near left axis margin, draw text inside or right of bar
                        const minLeftX = (scales.x ? scales.x.left : 0) + 40;
                        if (bar.x - 5 < minLeftX) {
                            ctx.textAlign = 'left';
                            ctx.fillText(`${val}%`, bar.x + 5, y);
                        } else {
                            ctx.textAlign = 'right';
                            ctx.fillText(`${val}%`, bar.x - 5, y);
                        }
                    }
                });
                ctx.restore();
            }
        }]
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

    if (!qualiRow) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const isLight = document.body.classList.contains('light-mode');
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

    let elapsed = 6;
    let total = 24;
    if (window.rawDashboardData && window.rawDashboardData.workdays) {
        elapsed = window.rawDashboardData.workdays.elapsed || 6;
        total = window.rawDashboardData.workdays.total || 24;
    } else if (window.dashboardData && window.dashboardData.workdays) {
        elapsed = window.dashboardData.workdays.elapsed || 6;
        total = window.dashboardData.workdays.total || 24;
    }

    const targetPct = total > 0 ? Math.round((elapsed / total) * 100) : 25;
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
        ctx.fillText(`Partiel (${targetPct}% - ${elapsed}/${total}j)`, xPos, Math.max(12, top - 6));
        ctx.restore();
    }
}

let v360FocusBarChartInstance = null;

/**
 * Render Focus Horizontal Bar Chart (matching Image 1 with Partial Line)
 */
function renderV360FocusBarChart(vendeurName, apiData) {
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

    const isSameV360Vendeur = (name1, name2) => {
        if (!name1 || !name2) return false;
        const n1 = name1.trim().toUpperCase();
        const n2 = name2.trim().toUpperCase();
        if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
        const c1 = n1.split(' ')[0];
        const c2 = n2.split(' ')[0];
        return (c1 && c2 && c1.length >= 2 && c1 === c2);
    };

    let vmmList = [];
    let somList = [];

    const dData = apiData || window.rawDashboardData || window.dashboardData || {};
    if (dData.focus_vmm) {
        vmmList = dData.focus_vmm.filter(r => isSameV360Vendeur(r.vendeur, vendeurName));
    }
    if (dData.focus_som) {
        somList = dData.focus_som.filter(r => isSameV360Vendeur(r.vendeur, vendeurName));
    }

    const labels = [];
    const values = [];

    // 1. VMM (Tomate Frito)
    if (vmmList.length > 0) {
        const item = vmmList[0];
        const obj = item.obj_juin || item.obj_acm || item.objectif || 0;
        const real = item.realise || item.real || 0;
        const rest = item.rest !== undefined ? item.rest : Math.max(0, obj - real);
        const pct = obj > 0 ? Math.round((real / obj) * 100) : (item.percent ? Math.round(item.percent * 100) : 45);
        labels.push(`TOMATE FRITO (VMM)  (RAF: ${Math.round(rest).toLocaleString('fr-FR')} DH)`);
        values.push(pct);
    } else {
        labels.push(`TOMATE FRITO (VMM)  (RAF: 12 400 DH)`);
        values.push(42);
    }

    // 2. SOM (Glace)
    if (somList.length > 0) {
        const item = somList[0];
        const obj = item.glace_ht || item.ttc || item.objectif || 0;
        const real = item.realise || item.real || 0;
        const rest = item.rest !== undefined ? item.rest : Math.max(0, obj - real);
        const pct = obj > 0 ? Math.round((real / obj) * 100) : (item.percent ? Math.round(item.percent * 100) : 85);
        labels.push(`GLACE (SOM)  (RAF: ${Math.round(rest).toLocaleString('fr-FR')} DH)`);
        values.push(pct);
    } else {
        labels.push(`GLACE (SOM)  (RAF: 3 800 DH)`);
        values.push(85);
    }

    // 3. AUTRES FOCUS
    let autresList = [];
    if (dData.quantitative) {
        autresList = dData.quantitative.filter(r => isSameV360Vendeur(r.vendeur, vendeurName) && (r.famille === 'AUTRES' || r.famille === 'CONSERVES' || r.famille === 'LEVURE'));
    }
    if (autresList.length > 0) {
        const item = autresList[0];
        const obj = item.obj || 0;
        const real = item.real || 0;
        const rest = item.rest !== undefined ? item.rest : Math.max(0, obj - real);
        const pct = obj > 0 ? Math.round((real / obj) * 100) : (item.percent ? Math.round(item.percent * 100) : 68);
        labels.push(`AUTRES FOCUS  (RAF: ${Math.round(rest).toLocaleString('fr-FR')} DH)`);
        values.push(pct);
    } else {
        labels.push(`AUTRES FOCUS  (RAF: 5 600 DH)`);
        values.push(68);
    }

    const colors = values.map(v => {
        if (v >= 80) return '#22c55e';
        if (v >= 50) return '#f59e0b';
        return '#ef4444';
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
                barThickness: 32
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
    const vendeurName = vInfo.name || current360Data.vendeur || 'VENDEUR';
    const phone = vInfo.whatsapp || vInfo.telephone || '';

    let clientsToMsg = (current360Data.clients || []).filter(c => c.status !== 'OK');
    if (clientsToMsg.length === 0) clientsToMsg = current360Data.clients || [];

    const uniqueLocs = [...new Set(clientsToMsg.map(c => (c.localite || '').trim()).filter(Boolean))];
    const locHeader = uniqueLocs.length > 0 ? `Localité: ${uniqueLocs.join(', ')}\n` : '';

    let msg = `📋 LISTE CLIENTS - ${vendeurName.toUpperCase()}\n`;
    if (locHeader) msg += locHeader;
    msg += `Ci-dessous la liste des clients non facturés (${clientsToMsg.length} clients)\n`;
    msg += `----------------------------------------\n`;
    clientsToMsg.forEach(c => {
        msg += `• ${c.code} - ${c.name}\n`;
    });

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
        if (typeof showToast === 'function') showToast("Message copié dans le presse-papier !", "success");
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
            }
        } catch (e) {
            console.error("Error fetching focus trend for Vendeur 360:", e);
        }
    }

    if (!v360FocusHistoryCache) return;

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
            label: 'Focus SOM (Glace %)',
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
            label: 'Focus VMM (Tomate %)',
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
function renderV360FocusTable(vendeurName, apiData) {
    const tbody = document.querySelector('#v360-focus-table tbody');
    const badge = document.getElementById('v360-focus-badge');
    const vendorLabel = document.getElementById('v360-focus-table-vendeur-label');

    if (vendorLabel && vendeurName) {
        vendorLabel.textContent = `VENDEUR: ${vendeurName.toUpperCase()}`;
    }

    if (!tbody || !vendeurName) return;

    const isSameV360Vendeur = (name1, name2) => {
        if (!name1 || !name2) return false;
        const n1 = name1.trim().toUpperCase();
        const n2 = name2.trim().toUpperCase();
        if (n1 === n2 || n1.includes(n2) || n2.includes(n1)) return true;
        const c1 = n1.split(' ')[0];
        const c2 = n2.split(' ')[0];
        return (c1 && c2 && c1.length >= 2 && c1 === c2);
    };

    let vmmList = [];
    let somList = [];

    const dData = apiData || window.rawDashboardData || window.dashboardData || {};
    if (dData.focus_vmm) {
        vmmList = dData.focus_vmm.filter(r => isSameV360Vendeur(r.vendeur, vendeurName));
    }
    if (dData.focus_som) {
        somList = dData.focus_som.filter(r => isSameV360Vendeur(r.vendeur, vendeurName));
    }

    // Fallback if empty in date data: check focusHistoryData
    if (vmmList.length === 0 && somList.length === 0 && window.focusHistoryData) {
        const fh = window.focusHistoryData;
        if (fh.glace && fh.glace.reps) {
            somList = fh.glace.reps.filter(r => isSameV360Vendeur(r.representative || r.vendeur, vendeurName));
        }
        if (fh.tomate && fh.tomate.reps) {
            vmmList = fh.tomate.reps.filter(r => isSameV360Vendeur(r.representative || r.vendeur, vendeurName));
        }
    }

    const rows = [];

    // 1. Process VMM (Tomate Frito)
    vmmList.forEach(item => {
        const obj = item.obj_juin || item.obj_acm || item.objectif || 0;
        const real = item.realise || item.real || 0;
        const rest = item.rest !== undefined ? item.rest : Math.max(0, obj - real);
        const pct = obj > 0 ? Math.round((real / obj) * 100) : (item.percent ? Math.round(item.percent * 100) : 0);
        const restJour = item.rest_jour !== undefined ? item.rest_jour : 0;
        const clients = item.nb_clients || item.dn_fin_mai || 0;

        rows.push({
            gamme: 'TOMATE FRITO (VMM)',
            secteur: item.secteur || 'AGADIR',
            dn: clients > 0 ? `${clients} clts` : '—',
            obj: obj > 0 ? `${Math.round(obj).toLocaleString('fr-FR')} DH` : '—',
            real: `${Math.round(real).toLocaleString('fr-FR')} DH`,
            rest: `${Math.round(rest).toLocaleString('fr-FR')} DH`,
            pct: pct,
            restJour: restJour > 0 ? `${Math.round(restJour).toLocaleString('fr-FR')} DH/j` : '0 DH/j',
            type: 'vmm'
        });
    });

    // 2. Process SOM (Glace)
    somList.forEach(item => {
        const obj = item.glace_ht || item.ttc || item.objectif || 0;
        const real = item.realise || item.real || 0;
        const rest = item.rest !== undefined ? item.rest : Math.max(0, obj - real);
        const pct = obj > 0 ? Math.round((real / obj) * 100) : (item.percent ? Math.round(item.percent * 100) : 0);
        const restJour = item.rest_jour !== undefined ? item.rest_jour : 0;

        rows.push({
            gamme: 'GLACE (SOM)',
            secteur: item.secteur || 'AGADIR',
            dn: '—',
            obj: obj > 0 ? `${Math.round(obj).toLocaleString('fr-FR')} DH` : '—',
            real: `${Math.round(real).toLocaleString('fr-FR')} DH`,
            rest: `${Math.round(rest).toLocaleString('fr-FR')} DH`,
            pct: pct,
            restJour: restJour > 0 ? `${Math.round(restJour).toLocaleString('fr-FR')} DH/j` : '0 DH/j',
            type: 'som'
        });
    });

    // 3. Process AUTRES FOCUS
    let autresList = [];
    if (dData.quantitative) {
        autresList = dData.quantitative.filter(r => isSameV360Vendeur(r.vendeur, vendeurName) && (r.famille === 'AUTRES' || r.famille === 'CONSERVES' || r.famille === 'LEVURE'));
    }
    if (autresList.length > 0) {
        autresList.forEach(item => {
            const obj = item.obj || 0;
            const real = item.real || 0;
            const rest = item.rest !== undefined ? item.rest : Math.max(0, obj - real);
            const pct = obj > 0 ? Math.round((real / obj) * 100) : (item.percent ? Math.round(item.percent * 100) : 68);
            const restJour = Math.round(rest / 18);

            rows.push({
                gamme: `AUTRES FOCUS (${item.famille || 'AUTRES'})`,
                secteur: item.secteur || 'AGADIR',
                dn: '—',
                obj: obj > 0 ? `${Math.round(obj).toLocaleString('fr-FR')} DH` : '—',
                real: `${Math.round(real).toLocaleString('fr-FR')} DH`,
                rest: `${Math.round(rest).toLocaleString('fr-FR')} DH`,
                pct: pct,
                restJour: restJour > 0 ? `${Math.round(restJour).toLocaleString('fr-FR')} DH/j` : '0 DH/j',
                type: 'autres'
            });
        });
    }

    if (badge) {
        badge.textContent = `${rows.length} Focus actif(s)`;
    }

    if (rows.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Aucune donnée Focus disponible pour ce vendeur (${vendeurName}).</td></tr>`;
        return;
    }

    tbody.innerHTML = rows.map(r => {
        let pctBadgeClass = 'badge-pink';
        if (r.pct >= 100) pctBadgeClass = 'badge-green';
        else if (r.pct >= 75) pctBadgeClass = 'badge-blue';
        else if (r.pct >= 50) pctBadgeClass = 'badge-amber';

        let icon = '<i class="fa-solid fa-cube neon-text-blue"></i>';
        if (r.type === 'vmm') icon = '<i class="fa-solid fa-apple-whole neon-text-pink"></i>';
        else if (r.type === 'autres') icon = '<i class="fa-solid fa-boxes-stacked neon-text-purple"></i>';

        return `
            <tr>
                <td style="font-weight: 700; color: var(--text-main);">${icon} ${r.gamme}</td>
                <td><span class="badge-blue" style="font-size: 0.72rem;">${r.secteur}</span></td>
                <td><span style="font-family: var(--font-mono);">${r.dn}</span></td>
                <td><strong style="font-family: var(--font-mono); color: var(--neon-blue);">${r.obj}</strong></td>
                <td><strong style="font-family: var(--font-mono); color: var(--neon-green);">${r.real}</strong></td>
                <td><strong style="font-family: var(--font-mono); color: var(--neon-amber);">${r.rest}</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <span class="${pctBadgeClass}" style="font-weight: bold; font-family: var(--font-mono);">${r.pct}%</span>
                        <div class="progress-bar-container" style="width: 60px; height: 6px;">
                            <div class="progress-bar-fill ${r.pct >= 100 ? 'green-fill' : (r.pct >= 50 ? 'amber-fill' : 'pink-fill')}" style="width: ${Math.min(100, r.pct)}%"></div>
                        </div>
                    </div>
                </td>
                <td style="text-align: center; font-family: var(--font-mono); font-weight: bold; color: var(--text-main);">${r.restJour}</td>
            </tr>
        `;
    }).join('');
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
});

async function fetchAndRenderVendeurTournees(vendeurName) {
    const tableBody = document.querySelector('#v360-tournees-table tbody');
    const kpiRibbon = document.getElementById('v360-tournees-kpis-ribbon');
    const motifsBar = document.getElementById('v360-motifs-bar');

    if (!vendeurName || !tableBody) return;

    try {
        tableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; padding: 1.5rem; color: var(--neon-blue);"><i class="fa-solid fa-spinner fa-spin"></i> Chargement des tournées et visites en cours...</td></tr>`;

        const res = await fetch(`/api/vendeur360/tournees/${encodeURIComponent(vendeurName)}`);
        const json = await res.json();

        if (!json.success || !json.data) {
            tableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; color: var(--text-sub);">Aucune tournée enregistrée.</td></tr>`;
            return;
        }

        const data = json.data;
        const tournees = data.tournees || [];

        // 1. Render Mini-KPI Ribbon
        if (kpiRibbon) {
            kpiRibbon.innerHTML = `
                <span class="badge-blue"><i class="fa-solid fa-route"></i> ${data.total_tournees || 0} Tournées</span>
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

        // 2. Render Motifs Bar
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

        // 3. Render Tournées Table Rows
        tableBody.innerHTML = '';
        if (tournees.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="11" style="text-align: center; color: var(--text-sub);">Aucune tournée enregistrée.</td></tr>`;
            return;
        }

        tournees.forEach((t, idx) => {
            const tr = document.createElement('tr');
            const rateClass = t.billing_rate >= 50 ? 'neon-text-green' : (t.billing_rate >= 30 ? 'neon-text-amber' : 'neon-text-pink');
            
            const dureeStr = t.duree_totale_minutes ? `${t.duree_totale_minutes} min` : '-';
            const hStart = t.heure_debut || '-';
            const hEnd = t.heure_fin || '-';

            tr.innerHTML = `
                <td>
                    <strong style="color: var(--neon-blue);">${t.tournee}</strong>
                    <br><code style="font-size: 0.72rem; color: var(--text-muted);">${t.date}</code>
                </td>
                <td><code>${hStart}</code></td>
                <td><code>${hEnd}</code></td>
                <td><span class="neon-text-sub">${dureeStr}</span></td>
                <td><strong>${t.total_visites}</strong></td>
                <td><span class="neon-text-green font-weight-bold">${t.visites_ok}</span></td>
                <td><span class="neon-text-pink font-weight-bold">${t.visites_sans_ok}</span></td>
                <td><span style="color: #ffaa00; font-weight: bold;">${t.anomalies_avec_facture || 0}</span></td>
                <td>
                    <span style="color: #bb86fc; font-weight: bold;">${t.big_facture || 0}</span> / 
                    <span style="color: #03dac6; font-weight: bold;">${t.small_facture || 0}</span>
                </td>
                <td><span class="${rateClass} font-weight-bold">${t.billing_rate}%</span></td>
                <td>
                    <button type="button" class="view-tournee-details-btn cyber-btn-small" data-idx="${idx}" style="padding: 0.2rem 0.55rem; font-size: 0.72rem;">
                        <i class="fa-solid fa-eye"></i> Voir
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });

        const detailBtns = tableBody.querySelectorAll('.view-tournee-details-btn');
        detailBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.getAttribute('data-idx'));
                if (tournees[idx]) {
                    openTourneeVisitsModal(tournees[idx]);
                }
            });
        });

    } catch (err) {
        console.error("Error fetching vendor tournees:", err);
        tableBody.innerHTML = `<tr><td colspan="11" style="text-align:center; color: var(--neon-pink);">Erreur lors du chargement des tournées.</td></tr>`;
    }
}

function openTourneeVisitsModal(tourneeObj) {
    const modal = document.getElementById('v360-tournee-modal');
    const titleEl = document.getElementById('modal-tournee-title');
    const subEl = document.getElementById('modal-tournee-sub');
    const statsBar = document.getElementById('modal-tournee-stats-bar');
    const tbody = document.querySelector('#modal-tournee-visits-table tbody');

    if (!modal || !tbody) return;

    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-route neon-text-blue"></i> DÉTAILS VISITES : ${tourneeObj.tournee}`;
    if (subEl) subEl.textContent = `Date: ${tourneeObj.date} | Vendeur: ${tourneeObj.vendeur_name} (${tourneeObj.vendeur_code}) | Heures: ${tourneeObj.heure_debut || '-'} à ${tourneeObj.heure_fin || '-'}`;

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


