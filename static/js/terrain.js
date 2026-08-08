let terrainRawData = [];
let terrainFilteredData = [];
let terrainAllVendeurs = [];
let terrainVendeurPhones = {};
let terrainHeaders = [];
let selectedAnomalyMonth = "";
let terrainChartInstance = null;
let selectedChartMetrics = new Set(['realisation_ca']);
let selectedChartVendors = new Set();
let selectedChartActivite = 'ALL';
let terrainFocusNames = {"GLACE": "GLACE", "TOMATE_FRITO": "TOMATE FRITO"};

const DAY_NAMES_FR = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function getVendeurCode(vName) {
    if (!vName) return "";
    const clean = vName.trim().toUpperCase();
    const match = clean.match(/^([A-Z]\d{1,3})\b/);
    return match ? match[1] : clean.replace(/[^A-Z0-9]/g, '');
}

function isSameVendeur(name1, name2) {
    if (!name1 || !name2) return false;
    const n1 = name1.trim().toUpperCase();
    const n2 = name2.trim().toUpperCase();
    if (n1 === n2) return true;
    
    const code1 = getVendeurCode(n1);
    const code2 = getVendeurCode(n2);
    if (code1 && code2 && code1 === code2) return true;

    return false;
}

function deduplicateVendeurs(vendeurs) {
    const mapByCode = new Map();
    vendeurs.forEach(v => {
        if (!v) return;
        const code = getVendeurCode(v);
        if (!mapByCode.has(code)) {
            mapByCode.set(code, v);
        } else {
            const existing = mapByCode.get(code);
            if (existing.length > v.length) {
                mapByCode.set(code, v);
            }
        }
    });
    return Array.from(mapByCode.values()).sort();
}

function getVendorSubmittedDaysCount(vName, data) {
    const dataset = (data && data.length > 0) ? data : ((terrainFilteredData && terrainFilteredData.length > 0) ? terrainFilteredData : (terrainRawData || []));
    if (!dataset || dataset.length === 0) return 0;
    const datesSet = new Set();
    dataset.forEach(r => {
        if (r.date && r.vendeur && isSameVendeur(r.vendeur, vName)) {
            datesSet.add(r.date);
        }
    });
    return datesSet.size;
}

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
                terrainHeaders = res.headers || [];
                terrainAllVendeurs = res.all_vendeurs || [];
                terrainVendeurPhones = res.vendeur_phones || {};
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
    
    const vendeurs = deduplicateVendeurs(terrainRawData.map(r => r.vendeur));
    const activites = [...new Set(terrainRawData.map(r => r.activite))].sort();

    dates.forEach(d => {
        dateSelect.innerHTML += `<option value="${d}">${d}</option>`;
        if (tableDateSelect) tableDateSelect.innerHTML += `<option value="${d}">${d}</option>`;
    });
    vendeurs.forEach(v => {
        const vDays = getVendorSubmittedDaysCount(v, terrainRawData);
        const daySuffix = vDays > 0 ? ` (${vDays} J)` : '';
        vendeurSelect.innerHTML += `<option value="${v}">${v}${daySuffix}</option>`;
        if (tableVendeurSelect) tableVendeurSelect.innerHTML += `<option value="${v}">${v}${daySuffix}</option>`;
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

    const anomalyMonthSelect = document.getElementById('terrain-anomalies-month-select');
    if (anomalyMonthSelect) {
        anomalyMonthSelect.addEventListener('change', (e) => {
            selectedAnomalyMonth = e.target.value;
            renderTerrainAnomalies();
        });
    }

    const chartModeSelect = document.getElementById('terrain-chart-mode');
    if (chartModeSelect) chartModeSelect.addEventListener('change', () => renderTerrainChart());

    const chartActiviteSelect = document.getElementById('terrain-chart-activite');
    if (chartActiviteSelect) {
        chartActiviteSelect.addEventListener('change', (e) => {
            selectedChartActivite = e.target.value;
            populateTerrainChartControls();
            renderTerrainChart();
        });
    }

    const selectAllVendorsBtn = document.getElementById('terrain-chart-select-all-vendors');
    if (selectAllVendorsBtn) {
        selectAllVendorsBtn.addEventListener('click', () => {
            selectedChartVendors.clear();
            populateTerrainChartControls();
            renderTerrainChart();
        });
    }

    const selectAllMetricsBtn = document.getElementById('terrain-chart-select-all-metrics');
    if (selectAllMetricsBtn) {
        selectAllMetricsBtn.addEventListener('click', () => {
            selectedChartMetrics.clear();
            if (terrainHeaders && terrainHeaders.length > 0) {
                terrainHeaders.forEach(h => {
                    const hLower = h.toLowerCase();
                    if (hLower === 'date' || hLower === 'timestamp' || hLower === 'vendeur' || hLower.includes('activit')) return;
                    selectedChartMetrics.add(h);
                });
            } else {
                selectedChartMetrics.add('Realisation CA');
                selectedChartMetrics.add('BL');
            }
            populateTerrainChartControls();
            renderTerrainChart();
        });
    }

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
                    terrainHeaders = res.headers || terrainHeaders;
                    terrainAllVendeurs = res.all_vendeurs || terrainAllVendeurs;
                    terrainVendeurPhones = res.vendeur_phones || terrainVendeurPhones;
                    terrainFilteredData = [...terrainRawData];
                    
                    // Populate filters & render view
                    populateTerrainFilters();
                    renderTerrainView();
                    
                    alert(res.message || "Lien Google Sheet enregistré dans le fichier de configuration (config.json) et synchronisé avec succès !");
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
        const matchesVendeur = !vendeurVal || isSameVendeur(r.vendeur, vendeurVal);
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

    // 2. Render Table Headers and Body dynamically from Google Sheet headers (image2)
    const tableHeadRow = document.querySelector('#terrain-table thead tr');
    if (tableHeadRow && terrainHeaders && terrainHeaders.length > 0) {
        tableHeadRow.innerHTML = terrainHeaders.map(h => `<th style="text-transform: uppercase;">${h}</th>`).join('');
    }

    const tableBody = document.querySelector('#terrain-table tbody');
    if (tableBody) {
        if (terrainFilteredData.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="${(terrainHeaders && terrainHeaders.length) || 8}" style="text-align: center; color: var(--text-muted);">Aucune donnée disponible avec les filtres sélectionnés.</td></tr>`;
        } else if (terrainHeaders && terrainHeaders.length > 0) {
            tableBody.innerHTML = terrainFilteredData.map(r => {
                const rawRow = r.raw_row || {};
                const cellsHtml = terrainHeaders.map(h => {
                    let val = rawRow[h];
                    if (val === undefined || val === null) {
                        for (let k in rawRow) {
                            if (k.toLowerCase() === h.toLowerCase()) { val = rawRow[k]; break; }
                        }
                    }
                    if (val === undefined || val === null) val = r[h] !== undefined ? r[h] : '';

                    const hLower = h.toLowerCase();
                    if (hLower === 'date') {
                        return `<td><span class="tech-label" style="font-size: 0.75rem;">${val}</span></td>`;
                    } else if (hLower === 'timestamp') {
                        return `<td><small style="color: var(--text-muted); font-size: 0.7rem; font-family: var(--font-mono);">${val}</small></td>`;
                    } else if (hLower === 'vendeur') {
                        return `<td><strong style="color: var(--text-main);">${val}</strong></td>`;
                    } else if (hLower.includes('activit')) {
                        return `<td><span class="badge-blue" style="text-transform: uppercase;">${val}</span></td>`;
                    } else if (hLower.includes('realisation') || (hLower.includes('ca') && !hLower.includes('tomate') && !hLower.includes('glace') && !hLower.includes('pescada') && !hLower.includes('chantilly'))) {
                        let num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
                        if (!isNaN(num) && num > 0) {
                            if (taxMode === 'HT' && !hLower.includes('ht')) {
                                num = Math.round(num / 1.2);
                            }
                            return `<td class="neon-text-blue" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(num)} DH</td>`;
                        }
                        return `<td class="neon-text-blue" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${val ? val : '0'}</td>`;
                    } else if (hLower === 'bl') {
                        return `<td class="neon-text-green" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${val}</td>`;
                    } else {
                        let num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
                        if (!isNaN(num) && num > 0) {
                            return `<td class="neon-text-amber" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(num)}</td>`;
                        }
                        return `<td style="text-align: right; font-family: var(--font-mono);">${val || '0'}</td>`;
                    }
                }).join('');

                return `<tr>${cellsHtml}</tr>`;
            }).join('');
        }
    }

    const tableFoot = document.getElementById('terrain-table-foot');
    if (tableFoot) {
        if (terrainFilteredData.length === 0) {
            tableFoot.innerHTML = '';
        } else if (terrainHeaders && terrainHeaders.length > 0) {
            const totals = {};
            terrainHeaders.forEach(h => { totals[h] = 0; });

            terrainFilteredData.forEach(r => {
                const rawRow = r.raw_row || {};
                terrainHeaders.forEach(h => {
                    let val = rawRow[h];
                    if (val === undefined || val === null) {
                        for (let k in rawRow) {
                            if (k.toLowerCase() === h.toLowerCase()) { val = rawRow[k]; break; }
                        }
                    }
                    if (val === undefined || val === null) val = r[h];
                    let num = parseFloat(String(val).replace(/[^0-9.-]+/g, ''));
                    if (!isNaN(num)) {
                        totals[h] += num;
                    }
                });
            });

            const footCellsHtml = terrainHeaders.map((h, idx) => {
                const hLower = h.toLowerCase();
                if (idx === 0 || hLower === 'date' || hLower === 'timestamp') {
                    if (idx === 0) return `<td style="text-align: left; vertical-align: middle;"><strong>TOTAL</strong></td>`;
                    return `<td></td>`;
                } else if (hLower === 'vendeur' || hLower.includes('activit')) {
                    return `<td></td>`;
                } else if (hLower.includes('realisation') || (hLower.includes('ca') && !hLower.includes('tomate') && !hLower.includes('glace') && !hLower.includes('pescada') && !hLower.includes('chantilly'))) {
                    let tot = totals[h];
                    if (taxMode === 'HT' && !hLower.includes('ht')) tot = Math.round(tot / 1.2);
                    return `<td class="neon-text-blue" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(tot)} DH</td>`;
                } else {
                    return `<td class="neon-text-amber" style="text-align: right; font-family: var(--font-mono); font-weight: bold;">${formatNumber(totals[h])}</td>`;
                }
            }).join('');

            tableFoot.innerHTML = `<tr>${footCellsHtml}</tr>`;
        }
    }

    // 3. Render Chart
    renderTerrainChart();

    // 4. Render Anomalies Section (Missing reports per seller, excluding Sundays)
    renderTerrainAnomalies();
}

let excludedAnomalyDatesMap = {}; // { [vendeurCode]: Set([dateStr1, dateStr2]) }

function toggleAnomalyDateExclusion(vCode, dateStr) {
    if (!excludedAnomalyDatesMap[vCode]) {
        excludedAnomalyDatesMap[vCode] = new Set();
    }
    if (excludedAnomalyDatesMap[vCode].has(dateStr)) {
        excludedAnomalyDatesMap[vCode].delete(dateStr);
    } else {
        excludedAnomalyDatesMap[vCode].add(dateStr);
    }
    renderTerrainAnomalies();
}

function resetAnomalyDateExclusions(vCode) {
    if (vCode) {
        delete excludedAnomalyDatesMap[vCode];
    } else {
        excludedAnomalyDatesMap = {};
    }
    renderTerrainAnomalies();
}

function renderTerrainAnomalies() {
    const anomaliesTableBody = document.querySelector('#terrain-anomalies-table tbody');
    if (!anomaliesTableBody) return;

    if (!terrainRawData || terrainRawData.length === 0) {
        anomaliesTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Aucune donnée terrain disponible pour calculer les anomalies.</td></tr>`;
        return;
    }

    // 1. Identify all months present in raw data (format: MM/YYYY)
    const monthsMap = {};
    terrainRawData.forEach(r => {
        if (!r.date) return;
        const parts = r.date.split('/');
        if (parts.length === 3) {
            const mKey = `${parts[1]}/${parts[2]}`;
            if (!monthsMap[mKey]) monthsMap[mKey] = [];
            monthsMap[mKey].push(r);
        }
    });

    const monthKeys = Object.keys(monthsMap).sort((a,b) => {
        const [mA, yA] = a.split('/').map(Number);
        const [mB, yB] = b.split('/').map(Number);
        return (yA - yB) || (mA - mB);
    });

    if (monthKeys.length === 0) return;

    // Populate month select dropdown
    const monthSelect = document.getElementById('terrain-anomalies-month-select');
    if (monthSelect) {
        const currentSelected = monthSelect.value;
        monthSelect.innerHTML = monthKeys.map(m => {
            const [mNum, yNum] = m.split('/').map(Number);
            const monthName = new Date(yNum, mNum - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            return `<option value="${m}">${monthName.toUpperCase()} (${m})</option>`;
        }).join('');

        if (currentSelected && monthKeys.includes(currentSelected)) {
            monthSelect.value = currentSelected;
            selectedAnomalyMonth = currentSelected;
        } else {
            selectedAnomalyMonth = monthKeys[monthKeys.length - 1]; // latest month
            monthSelect.value = selectedAnomalyMonth;
        }
    } else if (!selectedAnomalyMonth) {
        selectedAnomalyMonth = monthKeys[monthKeys.length - 1];
    }

    const [targetM, targetY] = selectedAnomalyMonth.split('/').map(Number);

    // 2. Find max day present in dataset for this month to avoid flagging future days
    let maxDay = 0;
    const recordsInMonth = monthsMap[selectedAnomalyMonth] || [];
    recordsInMonth.forEach(r => {
        const d = parseInt(r.date.split('/')[0], 10);
        if (d > maxDay) maxDay = d;
    });

    const daysInMonth = new Date(targetY, targetM, 0).getDate();
    const daysToAnalyze = Math.min(daysInMonth, maxDay || daysInMonth);

    // 3. Build list of mandatory working days (excluding Sundays / Day 0)
    const workingDays = [];
    for (let day = 1; day <= daysToAnalyze; day++) {
        const dateObj = new Date(targetY, targetM - 1, day);
        if (dateObj.getDay() !== 0) { // 0 = Sunday / Dimanche -> EXCLUDE
            const dateStr = `${String(day).padStart(2, '0')}/${String(targetM).padStart(2, '0')}/${targetY}`;
            workingDays.push({
                dateStr: dateStr,
                dayName: DAY_NAMES_FR[dateObj.getDay()],
                dayNum: day
            });
        }
    }

    // 4. Determine list of vendeurs to evaluate
    const filterVendeur = document.getElementById('terrain-filter-vendeur')?.value || "";
    let rawVendeurs = [];

    if (terrainAllVendeurs && terrainAllVendeurs.length > 0) {
        rawVendeurs = [...new Set([...terrainAllVendeurs, ...terrainRawData.map(r => r.vendeur)])];
    } else {
        rawVendeurs = [...new Set(terrainRawData.map(r => r.vendeur))];
    }

    let vendeursList = deduplicateVendeurs(rawVendeurs);

    if (filterVendeur) {
        vendeursList = vendeursList.filter(v => isSameVendeur(v, filterVendeur));
    }

    // 5. Build submission map: submittedMap[code][dateStr] = true
    const submittedMap = {};
    recordsInMonth.forEach(r => {
        if (!r.vendeur || !r.date) return;
        const code = getVendeurCode(r.vendeur);
        if (!submittedMap[code]) submittedMap[code] = {};
        submittedMap[code][r.date] = true;
    });

    // 6. Compute anomalies per vendeur
    const vendorResults = [];
    let totalMissingCount = 0;
    let vendorsWithAnomaliesCount = 0;

    vendeursList.forEach(vName => {
        const code = getVendeurCode(vName);
        const vSubmitted = submittedMap[code] || {};

        let sentCount = 0;
        const missingDates = [];

        workingDays.forEach(wd => {
            if (vSubmitted[wd.dateStr]) {
                sentCount++;
            } else {
                missingDates.push(wd);
            }
        });

        const missingCount = missingDates.length;
        if (missingCount > 0) {
            vendorsWithAnomaliesCount++;
            totalMissingCount += missingCount;
        }

        const pct = workingDays.length > 0 ? Math.round((sentCount / workingDays.length) * 100) : 100;

        vendorResults.push({
            vendeur: vName,
            sentCount: sentCount,
            totalWorkingDays: workingDays.length,
            missingCount: missingCount,
            missingDates: missingDates,
            pct: pct,
            telephone: (terrainVendeurPhones && terrainVendeurPhones[vName]) || ""
        });
    });

    // Sort: highest missing count first
    vendorResults.sort((a,b) => b.missingCount - a.missingCount || a.vendeur.localeCompare(b.vendeur));

    // 7. Update Summary Bar KPIs
    const kpiWorkDays = document.getElementById('anomalies-kpi-working-days');
    const kpiVendorsCount = document.getElementById('anomalies-kpi-vendeurs-count');
    const kpiTotalMissing = document.getElementById('anomalies-kpi-total-missing');
    const badgeEl = document.getElementById('terrain-anomalies-badge');

    if (kpiWorkDays) kpiWorkDays.innerText = `${workingDays.length} j`;
    if (kpiVendorsCount) kpiVendorsCount.innerText = vendorsWithAnomaliesCount;
    if (kpiTotalMissing) kpiTotalMissing.innerText = totalMissingCount;
    if (badgeEl) badgeEl.innerText = `${vendorsWithAnomaliesCount} vendeur(s) en anomalie`;

    // 8. Render Table
    if (vendorResults.length === 0) {
        anomaliesTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Aucun vendeur trouvé.</td></tr>`;
        return;
    }

    const monthSelectEl = document.getElementById('terrain-anomalies-month-select');
    const selectedMonthName = (monthSelectEl && monthSelectEl.options[monthSelectEl.selectedIndex]) 
        ? monthSelectEl.options[monthSelectEl.selectedIndex].text 
        : selectedAnomalyMonth;

    anomaliesTableBody.innerHTML = vendorResults.map(res => {
        const vCode = getVendeurCode(res.vendeur);
        const excludedSet = excludedAnomalyDatesMap[vCode] || new Set();
        
        const activeMissingDates = res.missingDates.filter(d => !excludedSet.has(d.dateStr));
        const activeMissingCount = activeMissingDates.length;

        let statusBadge = "";
        if (activeMissingCount === 0) {
            statusBadge = `<span class="badge-green"><i class="fa-solid fa-circle-check"></i> 100% Conforme</span>`;
        } else if (activeMissingCount <= 3) {
            statusBadge = `<span class="badge-amber"><i class="fa-solid fa-triangle-exclamation"></i> ${activeMissingCount} manqué(s)</span>`;
        } else {
            statusBadge = `<span class="badge-pink"><i class="fa-solid fa-circle-exclamation"></i> ${activeMissingCount} manqués (Alerte)</span>`;
        }

        let dateTags = "";
        if (res.missingDates.length > 0) {
            const tagsHtml = res.missingDates.map(d => {
                const isExcluded = excludedSet.has(d.dateStr);
                const chipClass = isExcluded ? 'anomaly-date-chip excluded-date' : 'anomaly-date-chip';
                const icon = isExcluded ? '<i class="fa-solid fa-plus" style="font-size: 0.6rem; margin-left: 2px;"></i>' : '<i class="fa-solid fa-xmark remove-date-btn"></i>';
                const title = isExcluded ? `Cliquez pour réinclure ${d.dayName} ${d.dateStr}` : `Cliquez pour retirer ${d.dayName} ${d.dateStr} avant l'envoi WA`;
                return `<span class="${chipClass}" title="${title}" onclick="toggleAnomalyDateExclusion('${vCode}', '${d.dateStr}')">${d.dayName} ${d.dateStr.substring(0,5)} ${icon}</span>`;
            }).join('');

            const restoreBtn = excludedSet.size > 0 ? `<button type="button" class="cyber-btn" onclick="resetAnomalyDateExclusions('${vCode}')" title="Restaurer toutes les dates de ce vendeur" style="padding: 1px 6px; font-size: 0.65rem; border-radius: 4px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); color: var(--neon-amber); font-weight: bold;"><i class="fa-solid fa-rotate-left"></i> Restaurer (${excludedSet.size})</button>` : '';

            dateTags = `<div style="display: flex; flex-wrap: wrap; gap: 4px; align-items: center; max-width: 520px;">${tagsHtml}${restoreBtn}</div>`;
        } else {
            dateTags = `<span style="color: var(--neon-green); font-size: 0.78rem;"><i class="fa-solid fa-circle-check"></i> Aucun retard / envoi complet</span>`;
        }

        // Generate WhatsApp button and prefilled message
        let actionCell = "";
        if (activeMissingCount === 0) {
            actionCell = `<span class="rp-wa-ok-badge" title="Aucun rappel nécessaire"><i class="fa-solid fa-check"></i> Conforme</span>`;
        } else {
            let rawPhone = res.telephone || res.whatsapp || (terrainVendeurPhones && terrainVendeurPhones[res.vendeur]) || "";
            if (!rawPhone && terrainVendeurPhones) {
                const vNameLower = (res.vendeur || '').toLowerCase();
                for (let k in terrainVendeurPhones) {
                    const kLower = k.toLowerCase();
                    if (kLower === vNameLower || kLower.includes(vNameLower) || vNameLower.includes(kLower)) {
                        rawPhone = terrainVendeurPhones[k];
                        break;
                    }
                    const codeK = kLower.split(' ')[0];
                    const codeV = vNameLower.split(' ')[0];
                    if (codeK && codeV && codeK.length >= 2 && codeK === codeV) {
                        rawPhone = terrainVendeurPhones[k];
                        break;
                    }
                }
            }

            let phoneDigits = rawPhone ? String(rawPhone).replace(/\D/g, '') : "";

            if (phoneDigits.startsWith('212') && phoneDigits.length >= 11) {
                // already formatted
            } else if (phoneDigits.startsWith('0') && phoneDigits.length === 10) {
                phoneDigits = '212' + phoneDigits.slice(1);
            } else if (phoneDigits.length === 9) {
                phoneDigits = '212' + phoneDigits;
            }

            const vParts = (res.vendeur || '').trim().split(/\s+/);
            const lastWord = vParts[vParts.length - 1] || res.vendeur || '';
            const firstName = lastWord ? (lastWord.charAt(0).toUpperCase() + lastWord.slice(1).toLowerCase()) : '';

            const datesListStr = activeMissingDates.map(d => `* ${d.dayName} ${d.dateStr}`).join('\n');
            const message = `Bonjour ${firstName}.\n\nMerci de remplir le form de ces jours:\n${datesListStr}`;
            const waHref = phoneDigits ? `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}` : `https://wa.me/?text=${encodeURIComponent(message)}`;
            
            actionCell = `
                <a href="${waHref}" target="_blank" class="rp-wa-reminder-btn" title="Envoyer un rappel WhatsApp (${activeMissingCount} date(s)) à ${res.vendeur} (${phoneDigits || 'Sans numéro'})">
                    <i class="fa-brands fa-whatsapp"></i> Rappel WA (${activeMissingCount})
                </a>
            `;
        }

        return `
            <tr>
                <td><strong style="color: var(--text-main);">${res.vendeur}</strong></td>
                <td><span style="font-family: var(--font-mono); font-weight: bold; color: var(--text-main);">${res.sentCount} / ${res.totalWorkingDays} j</span></td>
                <td><span style="font-family: var(--font-mono); font-weight: bold; color: ${activeMissingCount > 0 ? 'var(--neon-pink)' : 'var(--neon-green)'}">${activeMissingCount} j</span></td>
                <td>${statusBadge}</td>
                <td>${dateTags}</td>
                <td style="text-align: center; vertical-align: middle;">${actionCell}</td>
            </tr>
        `;
    }).join('');
}

const VENDOR_PALETTE = [
    '#00d4ff', '#00ff87', '#ff0055', '#ffb703', '#a855f7', 
    '#3b82f6', '#ec4899', '#10b981', '#f97316', '#06b6d4', 
    '#8b5cf6', '#eab308', '#6366f1', '#14b8a6', '#f43f5e'
];

function populateTerrainChartControls() {
    // 1. Populate Metrics Chips
    const metricsContainer = document.getElementById('terrain-chart-metrics-chips');
    if (metricsContainer) {
        const availableMetrics = [];
        if (terrainHeaders && terrainHeaders.length > 0) {
            terrainHeaders.forEach(h => {
                const hLower = h.toLowerCase();
                if (hLower === 'date' || hLower === 'timestamp' || hLower === 'vendeur' || hLower.includes('activit')) return;
                availableMetrics.push({ id: h, label: h });
            });

            // Map legacy metric keys to actual header strings
            const updatedMetrics = new Set();
            selectedChartMetrics.forEach(mId => {
                let match = terrainHeaders.find(h => h.toLowerCase() === mId.toLowerCase());
                if (!match) {
                    if (mId === 'realisation_ca') match = terrainHeaders.find(h => h.toLowerCase().includes('realisation') || h.toLowerCase().includes('ca'));
                    if (mId === 'bl') match = terrainHeaders.find(h => h.toLowerCase() === 'bl');
                }
                if (match) updatedMetrics.add(match);
            });
            if (updatedMetrics.size > 0) {
                selectedChartMetrics = updatedMetrics;
            } else if (availableMetrics.length > 0) {
                selectedChartMetrics = new Set([availableMetrics[0].id]);
            }
        } else {
            availableMetrics.push({ id: 'Realisation CA', label: 'Realisation CA' });
            availableMetrics.push({ id: 'BL', label: 'BL' });
        }

        metricsContainer.innerHTML = availableMetrics.map(m => {
            const isSelected = selectedChartMetrics.has(m.id);
            return `
                <button class="cyber-chip-btn ${isSelected ? 'active-chip-blue' : ''}" type="button" data-metric="${m.id}" style="padding: 3px 10px; font-size: 0.72rem; border-radius: 12px; cursor: pointer; transition: all 0.2s ease; border: 1px solid ${isSelected ? 'var(--neon-blue)' : 'rgba(255,255,255,0.15)'}; background: ${isSelected ? 'rgba(0, 212, 255, 0.25)' : 'rgba(255,255,255,0.03)'}; color: ${isSelected ? '#fff' : 'var(--text-muted)'}; font-weight: ${isSelected ? 'bold' : 'normal'};">
                    <i class="fa-solid ${isSelected ? 'fa-square-check' : 'fa-square'}" style="margin-right: 4px; color: ${isSelected ? 'var(--neon-blue)' : 'inherit'};"></i> ${m.label}
                </button>
            `;
        }).join('');

        metricsContainer.querySelectorAll('.cyber-chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const mId = btn.getAttribute('data-metric');
                if (selectedChartMetrics.has(mId)) {
                    if (selectedChartMetrics.size > 1) {
                        selectedChartMetrics.delete(mId);
                    }
                } else {
                    selectedChartMetrics.add(mId);
                }
                populateTerrainChartControls();
                renderTerrainChart();
            });
        });
    }

    // 2. Populate Vendors Chips
    const vendorContainer = document.getElementById('terrain-chart-vendor-chips');
    if (vendorContainer) {
        const vendorsSet = new Set();
        (terrainFilteredData || []).forEach(r => { if (r.vendeur) vendorsSet.add(r.vendeur); });
        const sortedVendors = Array.from(vendorsSet).sort();

        const isAllSelected = selectedChartVendors.size === 0 || selectedChartVendors.size === sortedVendors.length;

        let chipsHtml = `
            <button class="cyber-chip-btn ${isAllSelected ? 'active-chip-amber' : ''}" type="button" data-vendor="ALL" style="padding: 3px 10px; font-size: 0.72rem; border-radius: 12px; cursor: pointer; transition: all 0.2s ease; border: 1px solid ${isAllSelected ? 'var(--neon-amber)' : 'rgba(255,255,255,0.15)'}; background: ${isAllSelected ? 'rgba(255, 183, 3, 0.25)' : 'rgba(255,255,255,0.03)'}; color: ${isAllSelected ? '#fff' : 'var(--text-muted)'}; font-weight: bold;">
                <i class="fa-solid ${isAllSelected ? 'fa-circle-check' : 'fa-circle'}" style="margin-right: 4px; color: ${isAllSelected ? 'var(--neon-amber)' : 'inherit'};"></i> TOUS VENDEURS (${sortedVendors.length})
            </button>
        `;

        chipsHtml += sortedVendors.map((v, idx) => {
            const vColor = VENDOR_PALETTE[idx % VENDOR_PALETTE.length];
            const isSelected = isAllSelected || selectedChartVendors.has(v);
            const vDays = getVendorSubmittedDaysCount(v, terrainFilteredData);
            return `
                <button class="cyber-chip-btn" type="button" data-vendor="${v}" style="padding: 3px 10px; font-size: 0.72rem; border-radius: 12px; cursor: pointer; transition: all 0.2s ease; border: 1px solid ${isSelected ? vColor : 'rgba(255,255,255,0.15)'}; background: ${isSelected ? vColor + '33' : 'rgba(255,255,255,0.03)'}; color: ${isSelected ? '#fff' : 'var(--text-muted)'}; font-weight: 500;">
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${vColor}; margin-right: 5px;"></span>
                    ${v} <span style="opacity: 0.85; font-size: 0.68rem; margin-left: 3px; font-family: var(--font-mono); background: rgba(0,0,0,0.3); padding: 1px 5px; border-radius: 8px; font-weight: 700; color: var(--neon-amber);">${vDays} J</span>
                </button>
            `;
        }).join('');

        vendorContainer.innerHTML = chipsHtml;

        vendorContainer.querySelectorAll('.cyber-chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const vId = btn.getAttribute('data-vendor');
                if (vId === 'ALL') {
                    selectedChartVendors.clear();
                } else {
                    if (selectedChartVendors.size === 0) {
                        selectedChartVendors.add(vId);
                    } else if (selectedChartVendors.has(vId)) {
                        selectedChartVendors.delete(vId);
                    } else {
                        selectedChartVendors.add(vId);
                    }
                }
                populateTerrainChartControls();
                renderTerrainChart();
            });
        });
    }

    // 3. Populate Activity Chips
    const actContainer = document.getElementById('terrain-chart-activite-chips');
    if (actContainer) {
        const actOptions = [
            { id: 'ALL', label: '⚡ SOM & VMM (Toutes)' },
            { id: 'SOM', label: '🍦 SOM Seul' },
            { id: 'VMM', label: '🥫 VMM Seul' }
        ];

        actContainer.innerHTML = actOptions.map(a => {
            const isSelected = selectedChartActivite === a.id;
            return `
                <button class="cyber-chip-btn ${isSelected ? 'active-chip-purple' : ''}" type="button" data-act="${a.id}" style="padding: 3px 10px; font-size: 0.72rem; border-radius: 12px; cursor: pointer; transition: all 0.2s ease; border: 1px solid ${isSelected ? 'var(--neon-purple)' : 'rgba(255,255,255,0.15)'}; background: ${isSelected ? 'rgba(168, 85, 247, 0.25)' : 'rgba(255,255,255,0.03)'}; color: ${isSelected ? '#fff' : 'var(--text-muted)'}; font-weight: ${isSelected ? 'bold' : 'normal'};">
                    ${a.label}
                </button>
            `;
        }).join('');

        actContainer.querySelectorAll('.cyber-chip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedChartActivite = btn.getAttribute('data-act');
                const dropdown = document.getElementById('terrain-chart-activite');
                if (dropdown) dropdown.value = selectedChartActivite;
                populateTerrainChartControls();
                renderTerrainChart();
            });
        });
    }
}

function renderTerrainChart() {
    const canvas = document.getElementById('terrain-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    populateTerrainChartControls();

    if (terrainChartInstance) {
        terrainChartInstance.destroy();
    }

    const taxMode = localStorage.getItem('taxMode') || 'TTC';
    const modeEl = document.getElementById('terrain-chart-mode');
    const selectedMode = modeEl ? modeEl.value : 'bars_by_vendor';

    const metricsList = Array.from(selectedChartMetrics);

    let dataForChart = terrainFilteredData || [];

    // Filter by Activity (SOM / VMM / ALL)
    if (selectedChartActivite && selectedChartActivite !== 'ALL') {
        dataForChart = dataForChart.filter(r => {
            const actRaw = (r.raw_row && r.raw_row['Activité']) || r.activite || '';
            const actUpper = String(actRaw).toUpperCase();
            if (selectedChartActivite === 'SOM') return actUpper.includes('SOM');
            if (selectedChartActivite === 'VMM') return actUpper.includes('VMM');
            return true;
        });
    }

    if (selectedChartVendors.size > 0) {
        dataForChart = dataForChart.filter(r => {
            return Array.from(selectedChartVendors).some(v => isSameVendeur(r.vendeur, v));
        });
    }

    const vendorSet = new Set();
    dataForChart.forEach(r => { if (r.vendeur) vendorSet.add(r.vendeur); });
    const sortedVendors = Array.from(vendorSet).sort();

    const datesSet = new Set();
    dataForChart.forEach(r => { if (r.date) datesSet.add(r.date); });
    const sortedDates = Array.from(datesSet).sort((a,b) => {
        const partsA = a.split('/');
        const partsB = b.split('/');
        const dateA = new Date(partsA[2], partsA[1]-1, partsA[0]);
        const dateB = new Date(partsB[2], partsB[1]-1, partsB[0]);
        return dateA - dateB;
    });

    const vendorColorMap = {};
    sortedVendors.forEach((v, idx) => {
        vendorColorMap[v] = VENDOR_PALETTE[idx % VENDOR_PALETTE.length];
    });

    const METRIC_PALETTE = ['#00d4ff', '#ffb703', '#ff0055', '#00ff87', '#a855f7', '#ec4899', '#3b82f6'];

    const getMetricVal = (r, mKey) => {
        let val = 0;
        if (r.raw_row && r.raw_row[mKey] !== undefined) {
            val = parseFloat(String(r.raw_row[mKey]).replace(/[^0-9.-]+/g, '')) || 0;
        } else if (r[mKey] !== undefined) {
            val = parseFloat(String(r[mKey])) || 0;
        }
        if (taxMode === 'HT' && (mKey === 'realisation_ca' || mKey.toLowerCase().includes('ca'))) {
            val = val / 1.2;
        }
        return val;
    };

    const isWhiteMode = document.body.classList.contains('light-mode');
    const formatNumberLocal = (val) => new Intl.NumberFormat('fr-FR').format(val);

    let chartType = 'bar';
    let chartData = { labels: [], datasets: [] };
    let chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                stacked: selectedMode === 'stacked_bars',
                grid: { color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                ticks: { color: isWhiteMode ? '#475569' : '#94a3b8', font: { family: 'JetBrains Mono', size: 10 } }
            },
            y: {
                stacked: selectedMode === 'stacked_bars',
                grid: { color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                ticks: {
                    color: isWhiteMode ? '#475569' : '#94a3b8',
                    font: { family: 'JetBrains Mono', size: 10 },
                    callback: function(val) { return formatNumberLocal(val); }
                }
            }
        },
        plugins: {
            legend: {
                position: 'top',
                labels: {
                    color: isWhiteMode ? '#1e293b' : '#e2e8f0',
                    font: { family: 'Inter', weight: 'bold', size: 11 },
                    usePointStyle: true,
                    padding: 15
                }
            },
            tooltip: {
                callbacks: {
                    label: function(tooltipCtx) {
                        const val = tooltipCtx.raw || 0;
                        return `${tooltipCtx.dataset.label}: ${formatNumberLocal(val)}`;
                    }
                }
            }
        }
    };

    if (selectedMode === 'bars_by_vendor') {
        chartType = 'bar';
        chartData.labels = sortedVendors.map(v => {
            const vDays = getVendorSubmittedDaysCount(v, dataForChart);
            return `${v} (${vDays} J)`;
        });

        metricsList.forEach((mKey, mIdx) => {
            const mColor = METRIC_PALETTE[mIdx % METRIC_PALETTE.length];
            const mLabel = mKey === 'realisation_ca' ? `CA Réalisé (${taxMode})` : (mKey === 'bl' ? 'BL (Cmds)' : mKey);

            const dataArr = sortedVendors.map(v => {
                const recs = dataForChart.filter(r => isSameVendeur(r.vendeur, v));
                return recs.reduce((sum, r) => sum + getMetricVal(r, mKey), 0);
            });

            chartData.datasets.push({
                label: mLabel,
                data: dataArr,
                backgroundColor: metricsList.length === 1 
                    ? sortedVendors.map(v => vendorColorMap[v] + 'cc')
                    : mColor + 'cc',
                borderColor: metricsList.length === 1 
                    ? sortedVendors.map(v => vendorColorMap[v])
                    : mColor,
                borderWidth: 2,
                borderRadius: 4
            });
        });

    } else if (selectedMode === 'bars_by_date') {
        chartType = 'bar';
        chartData.labels = sortedDates;

        if (metricsList.length === 1) {
            const mKey = metricsList[0];
            sortedVendors.forEach(v => {
                const vColor = vendorColorMap[v];
                const dataArr = sortedDates.map(d => {
                    const recs = dataForChart.filter(r => r.date === d && isSameVendeur(r.vendeur, v));
                    return recs.reduce((sum, r) => sum + getMetricVal(r, mKey), 0);
                });

                chartData.datasets.push({
                    label: v,
                    data: dataArr,
                    backgroundColor: vColor + 'cc',
                    borderColor: vColor,
                    borderWidth: 1.5,
                    borderRadius: 4
                });
            });
        } else {
            metricsList.forEach((mKey, mIdx) => {
                const mColor = METRIC_PALETTE[mIdx % METRIC_PALETTE.length];
                const mLabel = mKey === 'realisation_ca' ? `CA Réalisé (${taxMode})` : (mKey === 'bl' ? 'BL (Cmds)' : mKey);

                const dataArr = sortedDates.map(d => {
                    const recs = dataForChart.filter(r => r.date === d);
                    return recs.reduce((sum, r) => sum + getMetricVal(r, mKey), 0);
                });

                chartData.datasets.push({
                    label: mLabel,
                    data: dataArr,
                    backgroundColor: mColor + 'cc',
                    borderColor: mColor,
                    borderWidth: 2,
                    borderRadius: 4
                });
            });
        }

    } else if (selectedMode === 'stacked_bars') {
        chartType = 'bar';
        chartData.labels = sortedDates;

        sortedVendors.forEach(v => {
            const vColor = vendorColorMap[v];
            const primaryMetric = metricsList[0] || 'realisation_ca';
            const dataArr = sortedDates.map(d => {
                const recs = dataForChart.filter(r => r.date === d && isSameVendeur(r.vendeur, v));
                return recs.reduce((sum, r) => sum + getMetricVal(r, primaryMetric), 0);
            });

            chartData.datasets.push({
                label: v,
                data: dataArr,
                backgroundColor: vColor + 'dd',
                borderColor: vColor,
                borderWidth: 1
            });
        });

    } else { // lines_by_vendor
        chartType = 'line';
        chartData.labels = sortedDates;

        sortedVendors.forEach(v => {
            const vColor = vendorColorMap[v];
            const primaryMetric = metricsList[0] || 'realisation_ca';
            const dataArr = sortedDates.map(d => {
                const recs = dataForChart.filter(r => r.date === d && isSameVendeur(r.vendeur, v));
                return recs.reduce((sum, r) => sum + getMetricVal(r, primaryMetric), 0);
            });

            chartData.datasets.push({
                label: v,
                data: dataArr,
                borderColor: vColor,
                backgroundColor: vColor + '22',
                borderWidth: 2.5,
                pointBackgroundColor: vColor,
                pointRadius: 4,
                tension: 0.3
            });
        });
    }

    terrainChartInstance = new Chart(ctx, {
        type: chartType,
        data: chartData,
        options: chartOptions
    });
}

function showTerrainError(msg) {
    const tableBody = document.querySelector('#terrain-table tbody');
    if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--neon-pink);"><i class="fa-solid fa-triangle-exclamation"></i> Erreur: ${msg}</td></tr>`;
    }
}
