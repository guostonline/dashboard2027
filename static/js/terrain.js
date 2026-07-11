let terrainRawData = [];
let terrainFilteredData = [];
let terrainChartInstance = null;
let terrainFocusNames = {"GLACE": "GLACE", "TOMATE_FRITO": "TOMATE FRITO"};

document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if the terrain-container exists in the DOM
    if (document.getElementById('terrain-container')) {
        initTerrainPage();
    }
});

document.addEventListener('taxModeChanged', () => {
    if (document.getElementById('terrain-container') && terrainRawData.length > 0) {
        renderTerrainView();
    }
});

function initTerrainPage() {
    fetchTerrainData();
    setupTerrainEventListeners();
}

function fetchTerrainData() {
    const tableBody = document.querySelector('#terrain-table tbody');
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center;"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement des données...</td></tr>`;
    }

    fetch('/api/terrain')
        .then(res => res.json())
        .then(res => {
            if (res.status === 'success') {
                terrainRawData = res.data;
                terrainFilteredData = [...terrainRawData];
                if (res.focus_names) {
                    terrainFocusNames = res.focus_names;
                }
                
                // Populate Google Sheet URL input
                const sheetUrlInput = document.getElementById('terrain-sheet-url');
                if (sheetUrlInput && res.google_sheet_url) {
                    sheetUrlInput.value = res.google_sheet_url;
                }
                
                // Populate filters
                populateTerrainFilters();
                
                // Render view
                renderTerrainView();
            } else {
                showTerrainError(res.message || "Erreur lors de la récupération des données.");
            }
        })
        .catch(err => {
            console.error("Error loading terrain data:", err);
            showTerrainError("Impossible de contacter le serveur de données.");
        });
}

function populateTerrainFilters() {
    const dateSelect = document.getElementById('terrain-filter-date');
    const vendeurSelect = document.getElementById('terrain-filter-vendeur');
    const activiteSelect = document.getElementById('terrain-filter-activite');

    const tableDateSelect = document.getElementById('terrain-table-filter-date');
    const tableVendeurSelect = document.getElementById('terrain-table-filter-vendeur');
    const tableActiviteSelect = document.getElementById('terrain-table-filter-activite');

    if (!dateSelect || !vendeurSelect || !activiteSelect) return;

    // Save current values to restore
    const selectedDate = dateSelect.value;
    const selectedVendeur = vendeurSelect.value;
    const selectedActivite = activiteSelect.value;

    // Reset selectors
    dateSelect.innerHTML = '<option value="">Toutes les dates</option>';
    vendeurSelect.innerHTML = '<option value="">Tous les vendeurs</option>';
    activiteSelect.innerHTML = '<option value="">Toutes les activités</option>';

    if (tableDateSelect) tableDateSelect.innerHTML = '<option value="">Date (Toutes)</option>';
    if (tableVendeurSelect) tableVendeurSelect.innerHTML = '<option value="">Vendeur (Tous)</option>';
    if (tableActiviteSelect) tableActiviteSelect.innerHTML = '<option value="">Activité (Toutes)</option>';

    // Get unique sorted values
    const dates = [...new Set(terrainRawData.map(r => r.date))].sort((a,b) => {
        const partsA = a.split('/');
        const partsB = b.split('/');
        const dateA = new Date(partsA[2], partsA[1]-1, partsA[0]);
        const dateB = new Date(partsB[2], partsB[1]-1, partsB[0]);
        return dateA - dateB;
    });
    
    const vendeurs = [...new Set(terrainRawData.map(r => r.vendeur))].sort();
    const activites = [...new Set(terrainRawData.map(r => r.activite))].sort();

    dates.forEach(d => {
        dateSelect.innerHTML += `<option value="${d}">${d}</option>`;
        if (tableDateSelect) tableDateSelect.innerHTML += `<option value="${d}">${d}</option>`;
    });
    vendeurs.forEach(v => {
        vendeurSelect.innerHTML += `<option value="${v}">${v}</option>`;
        if (tableVendeurSelect) tableVendeurSelect.innerHTML += `<option value="${v}">${v}</option>`;
    });
    activites.forEach(a => {
        activiteSelect.innerHTML += `<option value="${a}">${a}</option>`;
        if (tableActiviteSelect) tableActiviteSelect.innerHTML += `<option value="${a}">${a}</option>`;
    });

    // Restore selected values
    dateSelect.value = selectedDate;
    vendeurSelect.value = selectedVendeur;
    activiteSelect.value = selectedActivite;

    if (tableDateSelect) tableDateSelect.value = selectedDate;
    if (tableVendeurSelect) tableVendeurSelect.value = selectedVendeur;
    if (tableActiviteSelect) tableActiviteSelect.value = selectedActivite;
}

function setupTerrainEventListeners() {
    const dateSelect = document.getElementById('terrain-filter-date');
    const vendeurSelect = document.getElementById('terrain-filter-vendeur');
    const activiteSelect = document.getElementById('terrain-filter-activite');
    const resetBtn = document.getElementById('terrain-filter-reset');

    const tableDateSelect = document.getElementById('terrain-table-filter-date');
    const tableVendeurSelect = document.getElementById('terrain-table-filter-vendeur');
    const tableActiviteSelect = document.getElementById('terrain-table-filter-activite');
    const tableResetBtn = document.getElementById('terrain-table-filter-reset');

    const sheetUpdateBtn = document.getElementById('terrain-sheet-update-btn');

    // Sync helper
    const syncAndFilter = (source, target, value) => {
        if (target) target.value = value;
        applyTerrainFilters();
    };

    if (dateSelect) {
        dateSelect.addEventListener('change', () => syncAndFilter(dateSelect, tableDateSelect, dateSelect.value));
    }
    if (tableDateSelect) {
        tableDateSelect.addEventListener('change', () => syncAndFilter(tableDateSelect, dateSelect, tableDateSelect.value));
    }

    if (vendeurSelect) {
        vendeurSelect.addEventListener('change', () => syncAndFilter(vendeurSelect, tableVendeurSelect, vendeurSelect.value));
    }
    if (tableVendeurSelect) {
        tableVendeurSelect.addEventListener('change', () => syncAndFilter(tableVendeurSelect, vendeurSelect, tableVendeurSelect.value));
    }

    if (activiteSelect) {
        activiteSelect.addEventListener('change', () => syncAndFilter(activiteSelect, tableActiviteSelect, activiteSelect.value));
    }
    if (tableActiviteSelect) {
        tableActiviteSelect.addEventListener('change', () => syncAndFilter(tableActiviteSelect, activiteSelect, tableActiviteSelect.value));
    }
    
    const resetAll = () => {
        if (dateSelect) dateSelect.value = "";
        if (tableDateSelect) tableDateSelect.value = "";
        if (vendeurSelect) vendeurSelect.value = "";
        if (tableVendeurSelect) tableVendeurSelect.value = "";
        if (activiteSelect) activiteSelect.value = "";
        if (tableActiviteSelect) tableActiviteSelect.value = "";
        applyTerrainFilters();
    };

    if (resetBtn) resetBtn.addEventListener('click', resetAll);
    if (tableResetBtn) tableResetBtn.addEventListener('click', resetAll);

    if (sheetUpdateBtn) {
        sheetUpdateBtn.addEventListener('click', () => {
            const urlInput = document.getElementById('terrain-sheet-url');
            const url = urlInput ? urlInput.value.trim() : "";
            
            sheetUpdateBtn.disabled = true;
            const originalContent = sheetUpdateBtn.innerHTML;
            sheetUpdateBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Synchronisation...`;
            
            fetch('/api/terrain/update_sheet', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ google_sheet_url: url })
            })
            .then(res => res.json())
            .then(res => {
                sheetUpdateBtn.disabled = false;
                sheetUpdateBtn.innerHTML = originalContent;
                if (res.status === 'success') {
                    terrainRawData = res.data;
                    terrainFilteredData = [...terrainRawData];
                    
                    // Populate filters & render view
                    populateTerrainFilters();
                    renderTerrainView();
                    
                    alert("Lien Google Sheet mis à jour et synchronisé avec succès !");
                } else {
                    alert("Erreur: " + (res.message || "Impossible de mettre à jour le lien."));
                }
            })
            .catch(err => {
                console.error("Error updating sheet URL:", err);
                sheetUpdateBtn.disabled = false;
                sheetUpdateBtn.innerHTML = originalContent;
                alert("Une erreur s'est produite lors de l'enregistrement.");
            });
        });
    }
}

function applyTerrainFilters() {
    const dateVal = document.getElementById('terrain-filter-date')?.value || "";
    const vendeurVal = document.getElementById('terrain-filter-vendeur')?.value || "";
    const activiteVal = document.getElementById('terrain-filter-activite')?.value || "";

    terrainFilteredData = terrainRawData.filter(r => {
        const matchesDate = !dateVal || r.date === dateVal;
        const matchesVendeur = !vendeurVal || r.vendeur === vendeurVal;
        const matchesActivite = !activiteVal || r.activite === activiteVal;
        return matchesDate && matchesVendeur && matchesActivite;
    });

    renderTerrainView();
}

function renderTerrainView() {
    const taxMode = localStorage.getItem('taxMode') || 'TTC';
    
    // Update headers text dynamically
    const thTerrainReal = document.getElementById('th-terrain-real');
    const thTerrainGlace = document.getElementById('th-terrain-glace');
    if (thTerrainReal) thTerrainReal.innerText = `Real CA (${taxMode})`;
    
    const glaceTitle = terrainFocusNames.GLACE || "Glace";
    if (thTerrainGlace) thTerrainGlace.innerText = `CA ${glaceTitle} (${taxMode})`;

    // 1. Calculate and render KPIs
    let totalCa = 0;
    let totalBl = 0;
    let totalTomate = 0;
    let totalGlace = 0;

    terrainFilteredData.forEach(r => {
        let ca = r.realisation_ca || 0;
        let glace = r.glass_ca || 0;
        if (taxMode === 'HT') {
            ca = ca / 1.2;
            glace = glace / 1.2;
        }
        totalCa += ca;
        totalBl += r.bl || 0;
        totalTomate += r.tomate_frito || 0;
        totalGlace += glace;
    });

    const formatCurrency = (val) => {
        return new Intl.NumberFormat('fr-FR').format(val) + " DH";
    };

    const formatNumber = (val) => {
        return new Intl.NumberFormat('fr-FR').format(val);
    };

    document.getElementById('terrain-kpi-ca').innerText = formatCurrency(totalCa);
    document.getElementById('terrain-kpi-bl').innerText = formatNumber(totalBl);
    document.getElementById('terrain-kpi-tomate').innerText = formatNumber(totalTomate);
    document.getElementById('terrain-kpi-glace').innerText = formatCurrency(totalGlace);

    // Update KPI card labels dynamically based on focus names
    const kpiTomateEl = document.getElementById('terrain-kpi-tomate');
    if (kpiTomateEl && kpiTomateEl.parentElement) {
        const label = kpiTomateEl.parentElement.querySelector('.summary-label');
        if (label) label.innerText = `CA ${terrainFocusNames.TOMATE_FRITO || "TOMATE"} (VMM)`;
    }
    const kpiGlaceEl = document.getElementById('terrain-kpi-glace');
    if (kpiGlaceEl && kpiGlaceEl.parentElement) {
        const label = kpiGlaceEl.parentElement.querySelector('.summary-label');
        if (label) label.innerText = `CA ${terrainFocusNames.GLACE || "GLACE"} (SOM)`;
    }

    // 2. Render Table
    const tableBody = document.querySelector('#terrain-table tbody');
    if (tableBody) {
        if (terrainFilteredData.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--text-muted);">Aucune donnée disponible avec les filtres sélectionnés.</td></tr>`;
        } else {
            tableBody.innerHTML = terrainFilteredData.map(r => {
                let ca = r.realisation_ca || 0;
                let glace = r.glass_ca || 0;
                if (taxMode === 'HT') {
                    ca = ca / 1.2;
                    glace = glace / 1.2;
                }
                return `
                    <tr>
                        <td><span class="tech-label" style="font-size: 0.75rem;">${r.date}</span></td>
                        <td><small style="color: var(--text-muted); font-size: 0.7rem; font-family: var(--font-mono);">${r.timestamp}</small></td>
                        <td><strong style="color: var(--text-main);">${r.vendeur}</strong></td>
                        <td><span class="badge-blue" style="text-transform: uppercase;">${r.activite}</span></td>
                        <td class="neon-text-blue" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(ca)} DH</td>
                        <td class="neon-text-green" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${r.bl}</td>
                        <td class="neon-text-amber" style="text-align: right; font-family: var(--font-mono);">${r.tomate_frito || 0}</td>
                        <td class="neon-text-pink" style="text-align: right; font-family: var(--font-mono);">${formatNumber(glace)} DH</td>
                    </tr>
                `;
            }).join('');
        }
    }

    const tableFoot = document.getElementById('terrain-table-foot');
    if (tableFoot) {
        if (terrainFilteredData.length === 0) {
            tableFoot.innerHTML = '';
        } else {
            tableFoot.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: left; vertical-align: middle;"><strong>TOTAL</strong></td>
                    <td class="neon-text-blue" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(totalCa)} DH</td>
                    <td class="neon-text-green" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(totalBl)}</td>
                    <td class="neon-text-amber" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(totalTomate)}</td>
                    <td class="neon-text-pink" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(totalGlace)} DH</td>
                </tr>
            `;
        }
    }

    // 3. Render Chart
    renderTerrainChart();
}

function renderTerrainChart() {
    const canvas = document.getElementById('terrain-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (terrainChartInstance) {
        terrainChartInstance.destroy();
    }

    const taxMode = localStorage.getItem('taxMode') || 'TTC';

    // Aggregate data by Date for the chart trend
    const dateData = {};
    terrainFilteredData.forEach(r => {
        if (!dateData[r.date]) {
            dateData[r.date] = { ca: 0, glass: 0 };
        }
        let ca = r.realisation_ca || 0;
        let glass = r.glass_ca || 0;
        if (taxMode === 'HT') {
            ca = ca / 1.2;
            glass = glass / 1.2;
        }
        dateData[r.date].ca += ca;
        dateData[r.date].glass += glass;
    });

    // Sort dates chronologically
    const sortedDates = Object.keys(dateData).sort((a,b) => {
        const partsA = a.split('/');
        const partsB = b.split('/');
        const dateA = new Date(partsA[2], partsA[1]-1, partsA[0]);
        const dateB = new Date(partsB[2], partsB[1]-1, partsB[0]);
        return dateA - dateB;
    });

    const caTrend = sortedDates.map(d => dateData[d].ca);
    const glassTrend = sortedDates.map(d => dateData[d].glass);

    // Dynamic colors
    const styles = getComputedStyle(document.body);
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
    const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);
    const isWhiteMode = document.body.classList.contains('light-mode');

    terrainChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedDates,
            datasets: [
                {
                    type: 'line',
                    label: `CA Réalisé Total (${taxMode})`,
                    data: caTrend,
                    borderColor: neonBlue,
                    borderWidth: 3,
                    pointBackgroundColor: neonBlue,
                    pointRadius: 4,
                    tension: 0.3,
                    yAxisID: 'y'
                },
                {
                    type: 'bar',
                    label: `CA Glace (SOM) (${taxMode})`,
                    data: glassTrend,
                    backgroundColor: neonPink + '44',
                    borderColor: neonPink,
                    borderWidth: 1.5,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: isWhiteMode ? '#475569' : '#64748b', font: { family: 'JetBrains Mono', size: 9 } }
                },
                y: {
                    grid: { color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: isWhiteMode ? '#475569' : '#64748b',
                        font: { family: 'JetBrains Mono', size: 9 },
                        callback: function(value) { return value + ' DH'; }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: isWhiteMode ? '#1e293b' : '#e2e8f0', font: { family: 'Inter', weight: 'bold' } }
                }
            }
        }
    });
}

function showTerrainError(msg) {
    const tableBody = document.querySelector('#terrain-table tbody');
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--neon-pink);"><i class="fa-solid fa-triangle-exclamation"></i> Erreur: ${msg}</td></tr>`;
    }
}
