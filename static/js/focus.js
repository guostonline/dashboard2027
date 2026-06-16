/**
 * MADEC KPI Dashboard - Focus Tab Logic
 */

(function () {
    let currentFocusType = 'GLACE'; // 'GLACE' or 'TOMATE_FRITO'
    let focusChartInstance = null;
    let focusTrendChartInstance = null;
    let focusData = null;
    let focusHistoryData = null;
    let selectedVendeurFilter = '';
    let selectedUploadFile = null;

    // Wait until DOM is ready
    document.addEventListener('DOMContentLoaded', function () {
        const focusContainer = document.getElementById('focus-container');
        if (focusContainer) {
            initFocusTab();
        }
    });

    function initFocusTab() {
        console.log("Initializing Focus Tab...");
        
        // 1. Bind tab switches
        const tabGlace = document.getElementById('focus-tab-glace');
        const tabTomate = document.getElementById('focus-tab-tomate');

        if (tabGlace && tabTomate) {
            tabGlace.addEventListener('click', function () {
                switchTab('GLACE');
            });
            tabTomate.addEventListener('click', function () {
                switchTab('TOMATE_FRITO');
            });
        }

        // 2. Bind Excel upload modal triggers
        const uploadBtn = document.getElementById('focus-upload-btn');
        const uploadModal = document.getElementById('focus-upload-modal');
        const closeModalBtn = document.getElementById('close-focus-upload-modal');
        const cancelModalBtn = document.getElementById('cancel-focus-upload');
        const submitModalBtn = document.getElementById('submit-focus-upload');
        const fileInput = document.getElementById('focus-modal-file-input');
        const dropzone = document.getElementById('focus-dropzone');
        const dateInput = document.getElementById('focus-upload-date');

        if (uploadBtn && uploadModal) {
            // Open modal
            uploadBtn.addEventListener('click', function () {
                uploadModal.classList.add('open');
                // Set default date to today
                const today = new Date().toISOString().split('T')[0];
                if (dateInput) dateInput.value = today;
                resetUploadModalState();
            });

            // Close modal functions
            const closeModal = function () {
                uploadModal.classList.remove('open');
                resetUploadModalState();
            };

            if (closeModalBtn) closeModalBtn.addEventListener('click', closeModal);
            if (cancelModalBtn) cancelModalBtn.addEventListener('click', closeModal);
            
            // Clicking backdrop closes modal
            uploadModal.addEventListener('click', function (e) {
                if (e.target === uploadModal) {
                    closeModal();
                }
            });

            // Drag and Drop handlers
            if (dropzone && fileInput) {
                dropzone.addEventListener('click', function () {
                    fileInput.click();
                });

                fileInput.addEventListener('change', function () {
                    if (fileInput.files.length > 0) {
                        selectUploadFile(fileInput.files[0]);
                    }
                });

                // HTML5 Drag and Drop events
                ['dragenter', 'dragover'].forEach(eventName => {
                    dropzone.addEventListener(eventName, function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropzone.classList.add('dragover');
                    }, false);
                });

                ['dragleave', 'drop'].forEach(eventName => {
                    dropzone.addEventListener(eventName, function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        dropzone.classList.remove('dragover');
                    }, false);
                });

                dropzone.addEventListener('drop', function (e) {
                    const dt = e.dataTransfer;
                    const files = dt.files;
                    if (files.length > 0) {
                        selectUploadFile(files[0]);
                    }
                }, false);
            }

            // Confirm upload
            if (submitModalBtn) {
                submitModalBtn.addEventListener('click', function () {
                    if (!selectedUploadFile) {
                        if (window.showToast) {
                            window.showToast("Veuillez sélectionner ou glisser un fichier Excel.", "error");
                        } else {
                            alert("Veuillez sélectionner un fichier Excel.");
                        }
                        return;
                    }
                    if (!dateInput || !dateInput.value) {
                        if (window.showToast) {
                            window.showToast("Veuillez sélectionner une date pour les statistiques.", "error");
                        } else {
                            alert("Veuillez sélectionner une date.");
                        }
                        return;
                    }
                    handleExcelUpload(selectedUploadFile, dateInput.value, closeModal);
                });
            }
        }

        // 3. Bind Vendeur filter select dropdown
        const vendeurFilter = document.getElementById('focus-vendeur-filter');
        if (vendeurFilter) {
            vendeurFilter.addEventListener('change', function () {
                selectedVendeurFilter = vendeurFilter.value;
                console.log("Selected vendeur filter:", selectedVendeurFilter);
                
                const comparisonCard = document.getElementById('focus-comparison-card');
                if (comparisonCard) {
                    if (selectedVendeurFilter) {
                        comparisonCard.style.display = 'none';
                    } else {
                        comparisonCard.style.display = 'block';
                    }
                }
                
                renderFocusTrendChart();
            });
        }

        // 4. Load initial rankings and historical trend data
        loadFocusData();
        loadFocusTrendData();
    }

    function resetUploadModalState() {
        selectedUploadFile = null;
        const dropzone = document.getElementById('focus-dropzone');
        const fileInput = document.getElementById('focus-modal-file-input');
        const submitModalBtn = document.getElementById('submit-focus-upload');
        
        if (submitModalBtn) {
            submitModalBtn.disabled = false;
            submitModalBtn.innerHTML = '<i class="fa-solid fa-check"></i> CONFIRMER';
        }
        
        if (fileInput) fileInput.value = '';
        if (dropzone) {
            const textEl = dropzone.querySelector('.dropzone-text');
            const fileEl = dropzone.querySelector('.dropzone-file-name');
            const iconEl = dropzone.querySelector('i');
            if (textEl) textEl.style.display = 'block';
            if (fileEl) {
                fileEl.style.display = 'none';
                fileEl.innerText = '';
            }
            if (iconEl) {
                iconEl.className = 'fa-solid fa-cloud-arrow-up';
            }
        }
    }

    function selectUploadFile(file) {
        if (!file.name.endsWith('.xlsx')) {
            if (window.showToast) {
                window.showToast("Seuls les fichiers Excel (.xlsx) sont acceptés.", "error");
            } else {
                alert("Fichier invalide.");
            }
            return;
        }
        selectedUploadFile = file;
        const dropzone = document.getElementById('focus-dropzone');
        if (dropzone) {
            const textEl = dropzone.querySelector('.dropzone-text');
            const fileEl = dropzone.querySelector('.dropzone-file-name');
            const iconEl = dropzone.querySelector('i');
            if (textEl) textEl.style.display = 'none';
            if (fileEl) {
                fileEl.style.display = 'block';
                fileEl.innerText = `${file.name} (${formatBytes(file.size)})`;
            }
            if (iconEl) {
                iconEl.className = 'fa-solid fa-file-excel neon-text-green';
            }
        }
    }

    function switchTab(type) {
        currentFocusType = type;
        
        const tabGlace = document.getElementById('focus-tab-glace');
        const tabTomate = document.getElementById('focus-tab-tomate');

        if (type === 'GLACE') {
            tabGlace.classList.add('active');
            tabGlace.style.borderBottom = '3px solid var(--neon-blue)';
            tabGlace.style.color = 'var(--text-main)';
            
            tabTomate.classList.remove('active');
            tabTomate.style.borderBottom = '3px solid transparent';
            tabTomate.style.color = 'var(--text-muted)';
        } else {
            tabTomate.classList.add('active');
            tabTomate.style.borderBottom = '3px solid var(--neon-pink)';
            tabTomate.style.color = 'var(--text-main)';
            
            tabGlace.classList.remove('active');
            tabGlace.style.borderBottom = '3px solid transparent';
            tabGlace.style.color = 'var(--text-muted)';
        }

        renderFocusView();
    }

    function handleExcelUpload(file, dateStr, callback) {
        const submitModalBtn = document.getElementById('submit-focus-upload');
        const statusEl = document.getElementById('focus-upload-status');
        
        if (submitModalBtn) {
            submitModalBtn.disabled = true;
            submitModalBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> IMPORTATION...';
        }

        const formData = new FormData();
        formData.append('file', file);
        formData.append('date', dateStr);

        fetch('/api/focus/upload', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                if (window.showToast) {
                    window.showToast(res.message, "success");
                }
                if (callback) callback();
                // Reload data and historical trend
                loadFocusData();
                loadFocusTrendData();
            } else {
                if (window.showToast) {
                    window.showToast(res.message || "Erreur lors de l'importation.", "error");
                }
                if (submitModalBtn) {
                    submitModalBtn.disabled = false;
                    submitModalBtn.innerHTML = '<i class="fa-solid fa-check"></i> CONFIRMER';
                }
            }
        })
        .catch(err => {
            console.error("Upload failed:", err);
            if (window.showToast) {
                window.showToast("Erreur réseau de communication.", "error");
            }
            if (submitModalBtn) {
                submitModalBtn.disabled = false;
                submitModalBtn.innerHTML = '<i class="fa-solid fa-check"></i> CONFIRMER';
            }
        });
    }

    function loadFocusData() {
        const statusEl = document.getElementById('focus-upload-status');
        fetch('/api/focus/data?agence=AGADIR')
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success' && res.data) {
                focusData = res.data;
                if (statusEl) {
                    statusEl.innerHTML = `<i class="fa-solid fa-clock"></i> Dernière mise à jour : <strong>${res.upload_date}</strong>`;
                }
                renderFocusView();
            } else {
                if (statusEl) {
                    statusEl.innerText = "Aucun historique ou donnée disponible. Veuillez importer focus2.xlsx.";
                }
            }
        })
        .catch(err => {
            console.error("Failed to load focus data:", err);
            if (statusEl) {
                statusEl.innerText = "Erreur de connexion serveur.";
            }
        });
    }

    function loadFocusTrendData() {
        fetch('/api/focus/trend?agence=AGADIR')
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                focusHistoryData = res.data;
                renderFocusTrendChart();
            }
        })
        .catch(err => {
            console.error("Failed to load focus trend data:", err);
        });
    }

    function renderFocusView() {
        if (!focusData) return;

        const cohort = currentFocusType === 'GLACE' ? focusData.glace : focusData.tomate;
        const reps = cohort.reps || [];
        const cdz = cohort.cdz || [];
        
        // 1. Populate summary cards
        document.getElementById('focus-summary-sellers').innerText = reps.length;
        
        if (reps.length > 0) {
            let topRep = reps[0];
            let totalDeviation = 0;
            reps.forEach(r => {
                totalDeviation += r.deviation;
                if (r.deviation > topRep.deviation) {
                    topRep = r;
                }
            });

            const topNameParts = topRep.representative.split(' ');
            const topShortName = (topNameParts[0] + ' ' + (topNameParts[1] || '')).trim();
            const topValFormatted = (topRep.deviation > 0 ? '+' : '') + (topRep.deviation * 100).toFixed(1) + '%';
            
            document.getElementById('focus-summary-top-seller').innerText = topShortName;
            document.getElementById('focus-summary-top-val').innerText = `Écart: ${topValFormatted}`;
            
            const avgDev = totalDeviation / reps.length;
            const avgDevFormatted = (avgDev > 0 ? '+' : '') + (avgDev * 100).toFixed(1) + '%';
            document.getElementById('focus-summary-avg-deviation').innerText = avgDevFormatted;
        } else {
            document.getElementById('focus-summary-top-seller').innerText = "N/A";
            document.getElementById('focus-summary-top-val').innerText = "+0%";
            document.getElementById('focus-summary-avg-deviation').innerText = "0%";
        }

        // 2. Render Vendeur filter select dropdown options
        const vendeurFilter = document.getElementById('focus-vendeur-filter');
        if (vendeurFilter) {
            // Keep track of currently selected filter
            const prevSelected = selectedVendeurFilter;
            
            vendeurFilter.innerHTML = '<option value="">-- TOUS LES VENDEURS --</option>';
            
            // Extract sorted unique representatives
            const sortedReps = [...reps].sort((a, b) => a.representative.localeCompare(b.representative));
            sortedReps.forEach(r => {
                const opt = document.createElement('option');
                opt.value = r.representative.split(' ')[0]; // Store the seller code (like K60) as option value
                opt.innerText = r.representative;
                vendeurFilter.appendChild(opt);
            });
            
            // Restore previous selection if still exists in options
            const hasOption = Array.from(vendeurFilter.options).some(o => o.value === prevSelected);
            if (prevSelected && hasOption) {
                vendeurFilter.value = prevSelected;
                selectedVendeurFilter = prevSelected;
            } else {
                vendeurFilter.value = '';
                selectedVendeurFilter = '';
            }
        }

        // 3. Render Representatives Table
        const tableTitle = document.getElementById('focus-table-title');
        const repsCountBadge = document.getElementById('focus-reps-count');
        const repsHeaders = document.getElementById('focus-reps-headers');
        const repsTbody = document.getElementById('focus-reps-tbody');

        repsCountBadge.innerText = `${reps.length} VENDEURS`;
        repsTbody.innerHTML = '';

        if (currentFocusType === 'GLACE') {
            tableTitle.innerHTML = `<i class="fa-solid fa-list-ol"></i> CLASSEMENT REPRÉSENTANTS GLACE (SOM)`;
            repsHeaders.innerHTML = `
                <th>Rang</th>
                <th>Vendeur</th>
                <th>Secteur</th>
                <th>Objectif TTC</th>
                <th>Réalisé TTC</th>
                <th>Écart (%)</th>
                <th>Chef de Zone</th>
            `;

            reps.forEach(r => {
                const tr = document.createElement('tr');
                const devPct = r.deviation * 100;
                
                const devClass = devPct >= 0 ? 'neon-text-green' : (devPct >= -20 ? 'neon-text-amber' : 'neon-text-pink');
                const devSign = devPct > 0 ? '+' : '';
                const deviationFormatted = devSign + devPct.toFixed(1) + '%';
                
                const objVal = r.obj_ttc > 0 ? formatCurrency(r.obj_ttc) + ' DH' : 'N/A';
                const realVal = r.obj_ttc > 0 ? formatCurrency(r.realised_ttc) + ' DH' : 'N/A';
                
                tr.innerHTML = `
                    <td><strong>${r.rank}</strong></td>
                    <td><strong>${r.representative}</strong></td>
                    <td>${r.secteur}</td>
                    <td>${objVal}</td>
                    <td>${realVal}</td>
                    <td class="${devClass}"><strong>${deviationFormatted}</strong></td>
                    <td>${r.cdz}</td>
                `;
                repsTbody.appendChild(tr);
            });
        } else {
            tableTitle.innerHTML = `<i class="fa-solid fa-list-ol"></i> CLASSEMENT REPRÉSENTANTS TOMATE FRITO (VMM)`;
            repsHeaders.innerHTML = `
                <th>Rang</th>
                <th>Vendeur</th>
                <th>Secteur</th>
                <th>Clients Total</th>
                <th>Objectif ACM</th>
                <th>Réalisé ACM</th>
                <th>Écart (%)</th>
                <th>Chef de Zone</th>
            `;

            reps.forEach(r => {
                const tr = document.createElement('tr');
                const devPct = r.deviation * 100;
                
                const devClass = devPct >= 0 ? 'neon-text-green' : (devPct >= -20 ? 'neon-text-amber' : 'neon-text-pink');
                const devSign = devPct > 0 ? '+' : '';
                const deviationFormatted = devSign + devPct.toFixed(1) + '%';
                
                const nbClients = r.nb_clients > 0 ? r.nb_clients : 'N/A';
                const objVal = r.obj_acm > 0 ? r.obj_acm.toFixed(0) : 'N/A';
                const realVal = r.obj_acm > 0 ? r.realised_clients.toFixed(0) : 'N/A';
                
                tr.innerHTML = `
                    <td><strong>${r.rank}</strong></td>
                    <td><strong>${r.representative}</strong></td>
                    <td>${r.secteur}</td>
                    <td>${nbClients}</td>
                    <td>${objVal}</td>
                    <td>${realVal}</td>
                    <td class="${devClass}"><strong>${deviationFormatted}</strong></td>
                    <td>${r.cdz}</td>
                `;
                repsTbody.appendChild(tr);
            });
        }

        if (reps.length === 0) {
            const colSpan = currentFocusType === 'GLACE' ? 7 : 8;
            repsTbody.innerHTML = `<tr><td colspan="${colSpan}" style="text-align:center;">Aucune donnée disponible</td></tr>`;
        }

        // 4. Render CDZ Table
        const cdzCountBadge = document.getElementById('focus-cdz-count');
        const cdzTbody = document.getElementById('focus-cdz-tbody');

        cdzCountBadge.innerText = `${cdz.length} CDZ`;
        cdzTbody.innerHTML = '';

        cdz.forEach(c => {
            const tr = document.createElement('tr');
            const devPct = c.deviation * 100;
            
            const devClass = devPct >= 0 ? 'neon-text-green' : (devPct >= -20 ? 'neon-text-amber' : 'neon-text-pink');
            const devSign = devPct > 0 ? '+' : '';
            const deviationFormatted = devSign + devPct.toFixed(1) + '%';
            
            tr.innerHTML = `
                <td><strong>${c.rank}</strong></td>
                <td><strong>${c.cdz}</strong></td>
                <td>${c.agence}</td>
                <td class="${devClass}"><strong>${deviationFormatted}</strong></td>
            `;
            cdzTbody.appendChild(tr);
        });

        if (cdz.length === 0) {
            cdzTbody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Aucun CDZ classé</td></tr>`;
        }

        // 5. Render Ranking Comparison Chart or hide it if a representative is selected
        const comparisonCard = document.getElementById('focus-comparison-card');
        if (comparisonCard) {
            if (selectedVendeurFilter) {
                comparisonCard.style.display = 'none';
            } else {
                comparisonCard.style.display = 'block';
                renderFocusComparisonChart(reps);
            }
        } else {
            renderFocusComparisonChart(reps);
        }
        
        // 6. Render Trend Progress Line Chart
        renderFocusTrendChart();
    }

    function renderFocusComparisonChart(reps) {
        const canvas = document.getElementById('focus-comparison-chart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (focusChartInstance) {
            focusChartInstance.destroy();
        }

        const isWhiteMode = document.body.classList.contains('light-mode');
        const styles = getComputedStyle(document.body);
        const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
        const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);
        const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);
        const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);
        
        const gridColor = isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
        const textColor = isWhiteMode ? '#334155' : '#e2e8f0';

        const labels = reps.map(r => {
            const parts = r.representative.split(' ');
            return parts[0] + ' ' + (parts[1] || '');
        });
        const deviations = reps.map(r => Math.round(r.deviation * 100));
        
        const backgroundColors = deviations.map(v => {
            let color = neonPink;
            if (v >= 0) {
                color = neonGreen;
            } else if (v >= -20) {
                color = neonAmber;
            }
            return color + 'ba';
        });

        const borderColors = deviations.map(v => {
            let color = neonPink;
            if (v >= 0) {
                color = neonGreen;
            } else if (v >= -20) {
                color = neonAmber;
            }
            return color;
        });

        const focusLabelsPlugin = {
            id: 'focusLabels',
            afterDatasetsDraw(chart) {
                const { ctx, data } = chart;
                ctx.save();
                ctx.textBaseline = 'middle';
                ctx.font = 'bold 10px JetBrains Mono';
                
                chart.getDatasetMeta(0).data.forEach((bar, index) => {
                    const val = data.datasets[0].data[index];
                    const pctLabel = (val > 0 ? '+' : '') + val + '%';
                    
                    let color = neonPink;
                    if (val >= 0) {
                        color = neonGreen;
                    } else if (val >= -20) {
                        color = neonAmber;
                    }
                    
                    if (val >= 0) {
                        ctx.textAlign = 'left';
                        ctx.fillStyle = color;
                        ctx.fillText(pctLabel, bar.x + 8, bar.y);
                    } else {
                        ctx.textAlign = 'right';
                        ctx.fillStyle = color;
                        ctx.fillText(pctLabel, bar.x - 8, bar.y);
                    }
                });
                ctx.restore();
            }
        };

        const chartTitle = currentFocusType === 'GLACE' ? "ÉCARTS GLACE (SOM) PAR VENDEUR (%)" : "ÉCARTS TOMATE FRITO (VMM) PAR VENDEUR (%)";
        document.getElementById('focus-chart-title').innerHTML = `<i class="fa-solid fa-chart-bar"></i> ${chartTitle}`;

        focusChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Écart de Réalisation (%)',
                    data: deviations,
                    backgroundColor: backgroundColors,
                    borderColor: borderColors,
                    borderWidth: 1.5,
                    borderRadius: 4,
                    barPercentage: 0.65
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
                            label: function (context) {
                                const val = context.raw;
                                return ` Écart : ${(val > 0 ? '+' : '') + val}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grace: '10%',
                        grid: {
                            color: function (context) {
                                if (context.tick && context.tick.value === 0) {
                                    return isWhiteMode ? 'rgba(15, 23, 42, 0.6)' : '#00d4ff';
                                }
                                return gridColor;
                            },
                            lineWidth: function (context) {
                                if (context.tick && context.tick.value === 0) {
                                    return 2.5;
                                }
                                return 1;
                            }
                        },
                        ticks: {
                            color: function (context) {
                                if (context.tick && context.tick.value === 0) {
                                    return isWhiteMode ? '#0f172a' : '#00d4ff';
                                }
                                return isWhiteMode ? '#475569' : '#64748b';
                            },
                            font: { family: 'JetBrains Mono', size: 9 },
                            callback: function (value) {
                                return (value > 0 ? '+' : '') + value + '%';
                            }
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: textColor,
                            font: { family: 'JetBrains Mono', size: 10, weight: 'bold' }
                        }
                    }
                }
            },
            plugins: [focusLabelsPlugin]
        });
    }

    function renderFocusTrendChart() {
        const canvas = document.getElementById('focus-trend-chart');
        if (!canvas || !focusHistoryData) return;

        const ctx = canvas.getContext('2d');
        if (focusTrendChartInstance) {
            focusTrendChartInstance.destroy();
        }

        const isWhiteMode = document.body.classList.contains('light-mode');
        const styles = getComputedStyle(document.body);
        const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
        const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);
        const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);
        const gridColor = isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
        const textColor = isWhiteMode ? '#334155' : '#e2e8f0';

        // Choose GLACE or TOMATE data
        const history = currentFocusType === 'GLACE' ? focusHistoryData.glace : focusHistoryData.tomate;
        const reps = history.reps || [];

        // 1. Extract and sort unique dates
        const dates = [...new Set(reps.map(r => r.upload_date.substring(0, 10)))].sort();

        // Helper to format date display (e.g. 2026-06-16 -> 16 Juin)
        const formatShortDate = (dateStr) => {
            const parts = dateStr.split('-');
            if (parts.length !== 3) return dateStr;
            const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
            const idx = parseInt(parts[1]) - 1;
            return `${parts[2]} ${months[idx] || parts[1]}`;
        };

        const dateLabels = dates.map(formatShortDate);

        // 2. Compute Agency Average Deviation for each date
        const agencyAverages = dates.map(d => {
            const dayReps = reps.filter(r => r.upload_date.startsWith(d));
            if (dayReps.length === 0) return null;
            const sum = dayReps.reduce((acc, r) => acc + r.deviation, 0);
            return Math.round((sum / dayReps.length) * 100);
        });

        const datasets = [];
        let trendTitle = "ÉVOLUTION DE PERFORMANCE DANS LE TEMPS (%)";
        let displayBadgeName = "AGENCE AGADIR";

        if (selectedVendeurFilter) {
            // Find representative full name from code
            const sampleRep = reps.find(r => r.representative.startsWith(selectedVendeurFilter));
            const repFullName = sampleRep ? sampleRep.representative : selectedVendeurFilter;
            displayBadgeName = repFullName;
            trendTitle = `PROGRESSION DE : ${repFullName} (%)`;

            // Calculate seller dev for each date
            const sellerDeviations = dates.map(d => {
                const record = reps.find(r => r.upload_date.startsWith(d) && r.representative.startsWith(selectedVendeurFilter));
                return record ? Math.round(record.deviation * 100) : null;
            });

            // Dataset 1: Selected seller (solid glowing line)
            const mainColor = currentFocusType === 'GLACE' ? neonBlue : neonPink;
            datasets.push({
                label: 'Performance Vendeur (%)',
                data: sellerDeviations,
                borderColor: mainColor,
                backgroundColor: mainColor + '20',
                borderWidth: 3,
                pointBackgroundColor: mainColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: false,
                tension: 0.15
            });

            // Dataset 2: Agency Average (dashed reference line)
            datasets.push({
                label: 'Moyenne Agence (%)',
                data: agencyAverages,
                borderColor: isWhiteMode ? '#94a3b8' : '#475569',
                borderWidth: 1.5,
                borderDash: [5, 5],
                pointRadius: 0,
                fill: false,
                tension: 0.15
            });
        } else {
            // No seller selected -> Show Agency Average trend as solid line
            const avgColor = currentFocusType === 'GLACE' ? neonBlue : neonPink;
            datasets.push({
                label: 'Moyenne Agence (%)',
                data: agencyAverages,
                borderColor: avgColor,
                backgroundColor: avgColor + '20',
                borderWidth: 3,
                pointBackgroundColor: avgColor,
                pointBorderColor: '#fff',
                pointBorderWidth: 1.5,
                pointRadius: 5,
                pointHoverRadius: 7,
                fill: true,
                tension: 0.15
            });
        }

        document.getElementById('focus-trend-title').innerHTML = `<i class="fa-solid fa-chart-line"></i> ${trendTitle}`;
        document.getElementById('focus-trend-seller-name').innerText = displayBadgeName;

        focusTrendChartInstance = new Chart(ctx, {
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
                            label: function (context) {
                                const val = context.raw;
                                if (val === null) return ` N/A`;
                                return ` ${context.dataset.label}: ${(val > 0 ? '+' : '') + val}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            font: { family: 'JetBrains Mono', size: 9 }
                        }
                    },
                    y: {
                        grid: {
                            color: function (context) {
                                if (context.tick && context.tick.value === 0) {
                                    return isWhiteMode ? 'rgba(15, 23, 42, 0.5)' : '#00d4ff';
                                }
                                return gridColor;
                            },
                            lineWidth: function (context) {
                                if (context.tick && context.tick.value === 0) {
                                    return 2;
                                }
                                return 1;
                            }
                        },
                        ticks: {
                            color: function (context) {
                                if (context.tick && context.tick.value === 0) {
                                    return isWhiteMode ? '#0f172a' : '#00d4ff';
                                }
                                return textColor;
                            },
                            font: { family: 'JetBrains Mono', size: 9 },
                            callback: function (value) {
                                return (value > 0 ? '+' : '') + value + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    // Helpers
    function formatCurrency(num) {
        if (num === null || num === undefined) return '0';
        return Number(num).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }

    function formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
})();
