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

    // Render Radar Chart
    renderV360RadarChart(score.breakdown || {});
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
    // Use percent vs H-1 (h_pct field) - already decimal e.g. 0.23 = +23%
    const values = sorted.map(r => {
        const pct = r.h_pct !== undefined ? r.h_pct : r.percent;
        return Math.round((pct || 0) * 100);
    });

    const colors = values.map(v => {
        if (v > 0) return '#22c55e';       // green
        if (v > -15) return '#f59e0b';     // amber
        return '#ef4444';                   // red
    });

    // Update vendeur label
    const labelEl = document.getElementById('v360-quanti-vendeur-label');
    if (labelEl && quantiRows[0]) {
        labelEl.textContent = (quantiRows[0].vendeur || '').toUpperCase();
    }

    v360QuantiChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Évolution vs H-1 (%)',
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
            layout: { padding: { right: 40 } },
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
                    const x = isPos ? bar.x + 5 : bar.x - 5;
                    const y = bar.y;
                    ctx.fillStyle = isLight ? '#0f172a' : '#e2e8f0';
                    ctx.font = 'bold 10px JetBrains Mono, monospace';
                    ctx.textAlign = isPos ? 'left' : 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(`${val > 0 ? '+' : ''}${val}%`, x, y);
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
        labelEl.textContent = qualiRow.vendeur.toUpperCase();
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
            layout: { padding: { right: 50 } },
            animation: {
                duration: 600,
                easing: 'easeOutQuart'
            }
        },
        plugins: [{
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
        }]
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
        const cleanPhone = phone.replace(/[^0-9]/g, '');
        const encoded = encodeURIComponent(msg);
        window.open(`https://wa.me/${cleanPhone}?text=${encoded}`, '_blank');
    } else {
        navigator.clipboard.writeText(msg);
        if (typeof showToast === 'function') showToast("Message copié dans le presse-papier !", "success");
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
});
