/* ----------------------------------------------------
   MADEC KPI Dashboard JS - Cyberpunk Tech Theme
   ---------------------------------------------------- */

// Global State
let dashboardData = null;
let currentSelection = { type: 'global', name: '' }; // 'global', 'vendeur', 'secteur'
let currentFilterType = 'all'; // 'all', 'som', 'vmm'
let quantiChartInstance = null;
let qualiChartInstance = null;
let activeDropdownIndex = -1;
let activeView = 'dashboard';
let availableDates = [];

// DOM Elements
const totalCaEl = document.getElementById('total-ca');
const caVsObjEl = document.getElementById('ca-vs-obj');
const achievementRateEl = document.getElementById('achievement-rate');
const achievementBarEl = document.getElementById('achievement-bar');
const vendeursCountEl = document.getElementById('vendeurs-count');
const daysRatioEl = document.getElementById('days-ratio');
const daysRemainingEl = document.getElementById('days-remaining');
const prorataLabelEl = document.getElementById('prorata-label');

const searchInput = document.getElementById('search-input');
const searchDropdown = document.getElementById('search-dropdown');
const resetFilterBtn = document.getElementById('reset-filter-btn');
const currentSelectionBadge = document.getElementById('current-selection-badge');

const quantiTableBody = document.querySelector('#quanti-table tbody');
const qualiTableBody = document.querySelector('#quali-table tbody');

// Theme Elements
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');
const themeLabel = document.getElementById('theme-label');
let isWhiteMode = false;

// Refresh Elements
const refreshBtn = document.getElementById('refresh-btn');
const refreshIcon = document.getElementById('refresh-icon');
const refreshLabel = document.getElementById('refresh-label');

// Focus DOM Elements
const focusVmmName = document.getElementById('focus-vmm-name');
const focusVmmClients = document.getElementById('focus-vmm-clients');
const focusVmmTargetAcm = document.getElementById('focus-vmm-target-acm');
const focusVmmObjAcm = document.getElementById('focus-vmm-obj-acm');
const focusVmmPct = document.getElementById('focus-vmm-pct');
const focusVmmBar = document.getElementById('focus-vmm-bar');
const focusVmmRealRest = document.getElementById('focus-vmm-real-rest');
const focusVmmRafJour = document.getElementById('focus-vmm-raf-jour');

const focusSomName = document.getElementById('focus-som-name');
const focusSomObjHt = document.getElementById('focus-som-obj-ht');
const focusSomObjTtc = document.getElementById('focus-som-obj-ttc');
const focusSomPct = document.getElementById('focus-som-pct');
const focusSomBar = document.getElementById('focus-som-bar');
const focusSomRealRest = document.getElementById('focus-som-real-rest');
const focusSomRafJour = document.getElementById('focus-som-raf-jour');

// SVG Elements removed

// Modal Elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const settingsForm = document.getElementById('settings-form');
const inputRestDays = document.getElementById('input-rest-days');
const infoTotalDays = document.getElementById('info-total-days');
const infoElapsedDays = document.getElementById('info-elapsed-days');

// Init application
document.addEventListener('DOMContentLoaded', () => {
    // Load config from server
    fetch('/api/config')
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                const config = data.config;
                if (config.theme) {
                    applyThemeClass(config.theme);
                }
                if (config.light_mode !== undefined) {
                    toggleTheme(config.light_mode);
                }
                if (config.excluded_dates) {
                    excludedDates = config.excluded_dates;
                }
            }
            
            // Proceed with initialization
            fetchSuiviDates(() => {
                fetchDashboardData();
            });
            setupEventListeners();
            initDetailsView();
            initMultiUploadView();
        })
        .catch(err => {
            console.error("Error loading config:", err);
            // Fallback: Check local storage for saved theme
            if (localStorage.getItem('theme') === 'light') {
                toggleTheme(true);
            }
            let initialTheme = 'theme-1';
            const path = window.location.pathname;
            if (path.includes('/theme1')) initialTheme = 'theme-1';
            else if (path.includes('/theme2')) initialTheme = 'theme-2';
            else if (path.includes('/theme3')) initialTheme = 'theme-3';
            else if (path.includes('/theme4')) initialTheme = 'theme-4';
            else if (path.includes('/theme5')) initialTheme = 'theme-5';
            else {
                const classes = Array.from(document.body.classList);
                const bodyTheme = classes.find(c => c.startsWith('theme-'));
                if (bodyTheme) {
                    initialTheme = bodyTheme;
                } else {
                    const savedTheme = localStorage.getItem('selected-theme');
                    if (savedTheme) {
                        initialTheme = savedTheme;
                    }
                }
            }
            applyThemeClass(initialTheme);
            
            fetchSuiviDates(() => {
                fetchDashboardData();
            });
            setupEventListeners();
            initDetailsView();
            initMultiUploadView();
        });
});


// Fetch all dashboard metrics
function showNoNextDayMessage(selectedDate) {
    const placeholder = document.getElementById('no-next-day-placeholder');
    const contentWrapper = document.getElementById('dashboard-content-wrapper');
    const noNextDayDateEl = document.getElementById('no-next-day-date');
    const noNextDayNeededEl = document.getElementById('no-next-day-needed');
    
    if (placeholder && contentWrapper) {
        const parts = selectedDate.split('-');
        const formattedSelected = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : selectedDate;
        
        let formattedNeeded = '--/--/----';
        if (parts.length === 3) {
            const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            d.setDate(d.getDate() + 1);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            formattedNeeded = `${day}/${month}/${year}`;
        }
        
        if (noNextDayDateEl) noNextDayDateEl.innerText = formattedSelected;
        if (noNextDayNeededEl) noNextDayNeededEl.innerText = formattedNeeded;
        
        placeholder.style.display = 'block';
        contentWrapper.style.display = 'none';
        prorataLabelEl.innerText = "NO DATA";
    }
}

function hideNoNextDayMessage() {
    const placeholder = document.getElementById('no-next-day-placeholder');
    const contentWrapper = document.getElementById('dashboard-content-wrapper');
    if (placeholder) placeholder.style.display = 'none';
    if (contentWrapper) contentWrapper.style.display = 'block';
}

function switchView(viewName) {
    activeView = viewName;
    
    const navDashboard = document.getElementById('nav-dashboard');
    const navRealisation = document.getElementById('nav-realisation');
    const navDetails = document.getElementById('nav-details');
    
    const mainDashboard = document.getElementById('main-dashboard-container');
    const detailsContainer = document.getElementById('details-container');
    const dateSelect = document.getElementById('date-select');
    
    // Remove active class from all
    [navDashboard, navRealisation, navDetails].forEach(nav => {
        if (nav) nav.classList.remove('active');
    });
    
    if (viewName === 'details') {
        if (navDetails) navDetails.classList.add('active');
        if (mainDashboard) mainDashboard.style.display = 'none';
        if (detailsContainer) detailsContainer.style.display = 'block';
        if (dateSelect) dateSelect.style.display = 'none';
        loadTrendsData();
    } else {
        if (viewName === 'dashboard' && navDashboard) navDashboard.classList.add('active');
        if (viewName === 'realisation' && navRealisation) navRealisation.classList.add('active');
        
        if (mainDashboard) mainDashboard.style.display = 'block';
        if (detailsContainer) detailsContainer.style.display = 'none';
        if (dateSelect) dateSelect.style.display = 'block';
        
        fetchDashboardData();
    }
}

function fetchDashboardData() {
    prorataLabelEl.innerText = "REFRESHING...";
    const categorySelect = document.getElementById('category-select');
    const category = categorySelect ? categorySelect.value : 'All';
    const dateSelect = document.getElementById('date-select');
    const dateVal = dateSelect ? dateSelect.value : 'default';
    
    let queryDate = dateVal;
    if (activeView === 'realisation') {
        const idx = availableDates.indexOf(dateVal);
        if (idx > 0) {
            queryDate = availableDates[idx - 1];
        } else if (idx === 0) {
            showNoNextDayMessage(dateVal);
            return;
        }
    }
    
    hideNoNextDayMessage();
    
    fetch(`/api/data?category=${encodeURIComponent(category)}&date=${encodeURIComponent(queryDate)}`)
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                dashboardData = res.data;
                updateDashboard();
                populateFilters();
                prorataLabelEl.innerText = `${dashboardData.workdays.elapsed}/${dashboardData.workdays.total} JOURS ECOULÉS`;
            } else {
                showToast("Erreur de chargement des données: " + res.message, "error");
                prorataLabelEl.innerText = "OFFLINE";
            }
        })
        .catch(err => {
            console.error(err);
            showToast("Erreur de communication avec le serveur", "error");
            prorataLabelEl.innerText = "ERROR";
        });
}

// Setup Event Listeners
function setupEventListeners() {
    // Search input filters
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', (e) => {
        const items = searchDropdown.querySelectorAll('.dropdown-item');
        if (searchDropdown.style.display !== 'block' || items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            activeDropdownIndex = (activeDropdownIndex + 1) % items.length;
            updateDropdownHighlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            activeDropdownIndex = (activeDropdownIndex - 1 + items.length) % items.length;
            updateDropdownHighlight(items);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (activeDropdownIndex >= 0 && activeDropdownIndex < items.length) {
                items[activeDropdownIndex].click();
            }
        } else if (e.key === 'Escape') {
            searchDropdown.style.display = 'none';
            activeDropdownIndex = -1;
        }
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.style.display = 'none';
            activeDropdownIndex = -1;
        }
    });

    // Reset filter button
    resetFilterBtn.addEventListener('click', resetSelection);

    // Tab Type buttons (SOM/VMM)
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            currentFilterType = e.target.dataset.type;
            updateDashboard();
        });
    });

    // Chart toggles removed (charts are separated and displayed side-by-side)

    // Modal Settings events
    settingsBtn.addEventListener('click', openSettingsModal);
    closeModalBtn.addEventListener('click', closeSettingsModal);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettingsModal();
    });
    settingsForm.addEventListener('submit', handleSettingsSubmit);
    
    // Listen for selective reset checkboxes and button
    const btnResetSelected = document.getElementById('btn-reset-selected');
    if (btnResetSelected) {
        btnResetSelected.addEventListener('click', handleSelectedTablesReset);
    }



    // Toggle methodology collapsible inside settings modal
    const toggleMethodologyBtn = document.getElementById('toggle-methodology-btn');
    const methodologyContent = document.getElementById('methodology-content');
    const methodologyChevron = document.getElementById('methodology-chevron');
    
    if (toggleMethodologyBtn && methodologyContent) {
        toggleMethodologyBtn.addEventListener('click', () => {
            const isHidden = methodologyContent.style.display === 'none';
            methodologyContent.style.display = isHidden ? 'block' : 'none';
            if (methodologyChevron) {
                methodologyChevron.className = isHidden ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down';
            }
        });
    }

    // AI Report Modal events
    const aiReportBtn = document.getElementById('ai-report-btn');
    const aiReportModal = document.getElementById('ai-report-modal');
    const closeReportModalBtn = document.getElementById('close-report-modal-btn');
    const fullscreenReportModalBtn = document.getElementById('fullscreen-report-modal-btn');
    const copyReportBtn = document.getElementById('copy-report-btn');
    const downloadReportBtn = document.getElementById('download-report-btn');
    
    if (aiReportBtn) {
        aiReportBtn.addEventListener('click', openAiReportModal);
    }
    if (closeReportModalBtn) {
        closeReportModalBtn.addEventListener('click', closeAiReportModal);
    }
    if (fullscreenReportModalBtn) {
        fullscreenReportModalBtn.addEventListener('click', toggleReportFullscreen);
    }
    if (aiReportModal) {
        aiReportModal.addEventListener('click', (e) => {
            if (e.target === aiReportModal) closeAiReportModal();
        });
    }

    // Vendeur Selection Modal events
    const vendeurSelectionModal = document.getElementById('vendeur-selection-modal');
    const closeVendeurModalBtn = document.getElementById('close-vendeur-modal-btn');
    const cancelVendeurBtn = document.getElementById('cancel-vendeur-btn');
    const generateVendeurReportBtn = document.getElementById('generate-vendeur-report-btn');

    if (closeVendeurModalBtn) {
        closeVendeurModalBtn.addEventListener('click', closeVendeurSelectionModal);
    }
    if (cancelVendeurBtn) {
        cancelVendeurBtn.addEventListener('click', closeVendeurSelectionModal);
    }
    if (generateVendeurReportBtn) {
        generateVendeurReportBtn.addEventListener('click', generateReportForSelectedVendeur);
    }
    if (vendeurSelectionModal) {
        vendeurSelectionModal.addEventListener('click', (e) => {
            if (e.target === vendeurSelectionModal) closeVendeurSelectionModal();
        });
    }

    // Dropdown events
    const dropdownToggle = document.getElementById('vendeur-dropdown-toggle');
    const dropdownMenu = document.getElementById('vendeur-dropdown-menu');
    const dropdownSearch = document.getElementById('vendeur-dropdown-search');

    if (dropdownToggle) {
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleVendeurDropdown();
        });
    }
    if (dropdownSearch) {
        dropdownSearch.addEventListener('input', (e) => {
            filterVendeursList(e.target.value);
        });
        dropdownSearch.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    if (dropdownMenu) {
        dropdownMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const container = document.getElementById('vendeur-dropdown-container');
        if (container && !container.contains(e.target)) {
            closeVendeurDropdown();
        }
    });

    // Checkbox items - handle clicks on the whole label
    document.querySelectorAll('.checkbox-item').forEach(item => {
        item.addEventListener('click', (e) => {
            // Prevent double-toggle when clicking the input directly
            if (e.target.tagName !== 'INPUT') {
                e.preventDefault();
                const input = item.querySelector('input[type="checkbox"]');
                if (input) {
                    input.checked = !input.checked;
                }
            }
        });
    });
    if (copyReportBtn) {
        copyReportBtn.addEventListener('click', () => {
            const wrapper = document.getElementById('report-content-wrapper');
            if (wrapper && wrapper.style.display !== 'none') {
                navigator.clipboard.writeText(wrapper.innerText)
                    .then(() => {
                        showToast("Rapport copié dans le presse-papiers !", "success");
                    })
                    .catch(err => {
                        showToast("Échec de la copie: " + err, "error");
                    });
            } else {
                showToast("Aucun rapport à copier.", "error");
            }
        });
    }
    if (downloadReportBtn) {
        downloadReportBtn.addEventListener('click', downloadReportAsPdf);
    }
    const okReportBtn = document.getElementById('ok-report-btn');
    if (okReportBtn) {
        okReportBtn.addEventListener('click', closeAiReportModal);
    }

    // Theme Toggle event listener
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            toggleTheme(!isWhiteMode);
        });
    }

    // Refresh button event listener
    if (refreshBtn) {
        refreshBtn.addEventListener('click', handleRefreshClick);
    }

    // Category selector event listener
    const categorySelect = document.getElementById('category-select');
    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            // Reset individual search selection to avoid mismatch
            currentSelection = { type: 'global', name: '' };
            searchInput.value = '';
            resetFilterBtn.style.display = 'none';
            const categoryText = categorySelect.options[categorySelect.selectedIndex].text;
            currentSelectionBadge.innerText = `GLOBAL / ${categoryText.toUpperCase()}`;
            currentSelectionBadge.className = 'badge-blue';
            fetchDashboardData();
            
            // Also refresh Details trends
            const familySelect = document.getElementById('details-family-select');
            loadTrendsData(familySelect ? familySelect.value : 'C.A (ht)');
        });
    }

    // Theme select dropdown event listener (fallback if element exists)
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            applyThemeClass(e.target.value);
            showToast(`Thème changé : ${e.target.options[e.target.selectedIndex].text}`, "success");
        });
    }

    const modalThemeSelect = document.getElementById('modal-theme-select');
    if (modalThemeSelect) {
        modalThemeSelect.addEventListener('change', (e) => {
            applyThemeClass(e.target.value);
            showToast(`Thème changé : ${e.target.options[e.target.selectedIndex].text}`, "success");
        });
    }

    // Bind visual theme grid selector
    const themeCards = document.querySelectorAll('.theme-card');
    if (themeCards.length > 0 && modalThemeSelect) {
        themeCards.forEach(card => {
            card.addEventListener('click', () => {
                const themeVal = card.dataset.theme;
                modalThemeSelect.value = themeVal;
                // Dispatch change event to trigger modalThemeSelect listener
                modalThemeSelect.dispatchEvent(new Event('change'));
            });
        });
    }

    const sidebarThemeSelect = document.getElementById('sidebar-theme-select');
    if (sidebarThemeSelect) {
        sidebarThemeSelect.addEventListener('change', (e) => {
            applyThemeClass(e.target.value);
            showToast(`Thème changé : ${e.target.options[e.target.selectedIndex].text}`, "success");
        });
    }

    // Sidebar toggle for mobile
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn && sidebar) {
        sidebarToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sidebar.classList.toggle('open');
        });
    }

    // Close sidebar on click outside (mobile)
    document.addEventListener('click', (e) => {
        if (sidebar && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && !sidebarToggleBtn.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        }
    });

    // Sidebar navigation item actions
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            // Remove active class from all
            navItems.forEach(nav => nav.classList.remove('active'));
            // Add active class to clicked
            item.classList.add('active');
            
            // Close sidebar on mobile
            if (sidebar && sidebar.classList.contains('open')) {
                sidebar.classList.remove('open');
            }
        });
    });

    // Highlight active nav item on scroll (using IntersectionObserver)
    if ('IntersectionObserver' in window) {
        const sections = [
            document.getElementById('summary-section'),
            document.getElementById('filter-section'),
            document.getElementById('chart-card'),
            document.getElementById('focus-card'),
            document.getElementById('quanti-table-card'),
            document.getElementById('quali-table-card'),
            document.getElementById('alerts-section')
        ].filter(Boolean);

        const observerOptions = {
            root: null,
            rootMargin: '-20% 0px -60% 0px', // Trigger when section is in active view area
            threshold: 0
        };

        const observer = new IntersectionObserver((entries) => {
            const detailsContainer = document.getElementById('details-container');
            if (detailsContainer && detailsContainer.style.display !== 'none') {
                return;
            }
            
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const id = entry.target.getAttribute('id');
                    navItems.forEach(nav => {
                        if (nav.getAttribute('href') === `#${id}`) {
                            nav.classList.add('active');
                        } else {
                            nav.classList.remove('active');
                        }
                    });
                }
            });
        }, observerOptions);

        sections.forEach(sec => observer.observe(sec));
    }
    
    // Date select change handler
    const dateSelect = document.getElementById('date-select');
    if (dateSelect) {
        dateSelect.addEventListener('change', () => {
            fetchDashboardData();
        });
    }
    
    // Upload modal opening and closing
    const uploadBtn = document.getElementById('upload-btn');
    const uploadModal = document.getElementById('upload-modal');
    const closeUploadModalBtn = document.getElementById('close-upload-modal-btn');

    if (uploadBtn && uploadModal) {
        uploadBtn.addEventListener('click', () => {
            resetUploadForm();
            uploadModal.classList.add('open');
        });
    }

    if (closeUploadModalBtn && uploadModal) {
        closeUploadModalBtn.addEventListener('click', () => {
            uploadModal.classList.remove('open');
        });
        uploadModal.addEventListener('click', (e) => {
            if (e.target === uploadModal) {
                uploadModal.classList.remove('open');
            }
        });
    }

    // Drag and drop zone handling (multi-file)
    const dropzone = document.getElementById('upload-dropzone');
    const fileInput = document.getElementById('upload-file-input');

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleFileSelection(e.target.files);
            }
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('drag-over');
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            if (dt && dt.files && dt.files.length > 0) {
                handleFileSelection(dt.files);
            }
        });
    }

    // Upload form submission (multi-file batch)
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (uploadQueue.length === 0) {
                showToast("Veuillez d'abord sélectionner un ou plusieurs fichiers.", "error");
                return;
            }

            const statusContainer = document.getElementById('upload-status-container');
            const statusText = document.getElementById('upload-status-text');
            const submitBtn = document.getElementById('upload-submit-btn');

            if (submitBtn) submitBtn.disabled = true;
            if (statusContainer) statusContainer.style.display = 'block';

            let successCount = 0;
            let failCount = 0;
            let lastSuccessDate = null;

            for (let i = 0; i < uploadQueue.length; i++) {
                const item = uploadQueue[i];
                const statusEl = document.getElementById(`upload-file-status-${item.index}`);
                if (statusEl) {
                    statusEl.className = 'multi-file-status uploading';
                    statusEl.innerText = 'importation...';
                }
                if (statusText) {
                    statusText.innerText = `Importation de ${item.file.name} (${i + 1}/${uploadQueue.length})...`;
                }

                const formData = new FormData();
                formData.append('file', item.file);
                formData.append('date', item.date);
                formData.append('rest_days', calculateRemainingWorkDays(item.date));

                try {
                    const res = await fetch('/api/upload', { method: 'POST', body: formData });
                    const data = await res.json();
                    if (data.status === 'success') {
                        if (statusEl) {
                            statusEl.className = 'multi-file-status done';
                            statusEl.innerText = 'succès';
                        }
                        lastSuccessDate = item.date;
                        successCount++;
                    } else {
                        if (statusEl) {
                            statusEl.className = 'multi-file-status fail';
                            statusEl.innerText = 'échec';
                        }
                        failCount++;
                    }
                } catch (err) {
                    console.error(err);
                    if (statusEl) {
                        statusEl.className = 'multi-file-status fail';
                        statusEl.innerText = 'erreur';
                    }
                    failCount++;
                }
            }

            if (statusText) {
                statusText.innerText = `Terminé. Succès: ${successCount} | Échecs: ${failCount}.`;
            }
            if (submitBtn) {
                submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> IMPORTATION TERMINÉE';
            }

            showToast(`Importation : ${successCount} réussi(s), ${failCount} échec(s)`, successCount > 0 ? 'success' : 'error');

            if (successCount > 0 && failCount === 0) {
                uploadModal.classList.remove('open');
            }

            fetchSuiviDates(() => {
                if (lastSuccessDate) {
                    const dateSelect = document.getElementById('date-select');
                    if (dateSelect) {
                        dateSelect.value = lastSuccessDate;
                    }
                    fetchDashboardData();
                    const detailsContainer = document.getElementById('details-container');
                    if (detailsContainer && detailsContainer.style.display !== 'none') {
                        const familySelect = document.getElementById('details-family-select');
                        loadTrendsData(familySelect ? familySelect.value : 'C.A (ht)');
                    }
                }
            });
        });
    }
}

// Handle reload data from excel files
function handleRefreshClick() {
    if (!refreshBtn) return;
    
    // Disable button & animate spinner
    refreshBtn.disabled = true;
    if (refreshIcon) refreshIcon.classList.add('fa-spin');
    if (refreshLabel) refreshLabel.innerText = 'RELOADING...';
    
    fetch('/api/refresh', {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            showToast("Données rafraîchies depuis Excel avec succès !", "success");
            fetchDashboardData();
        } else {
            showToast("Erreur lors du rafraîchissement: " + data.message, "error");
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Une erreur de communication est survenue lors de la synchronisation.", "error");
    })
    .finally(() => {
        // Re-enable button & restore labels
        refreshBtn.disabled = false;
        if (refreshIcon) refreshIcon.classList.remove('fa-spin');
        if (refreshLabel) refreshLabel.innerText = 'RELOAD';
    });
}

function saveAppConfig(newConfig) {
    fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
    })
    .then(res => res.json())
    .then(data => {
        if (data.status !== 'success') {
            console.error("Failed to save config:", data.message);
        }
    })
    .catch(err => {
        console.error("Error saving config:", err);
    });
}

// Theme toggle function
function toggleTheme(toLight) {
    isWhiteMode = toLight;
    if (isWhiteMode) {
        document.body.classList.add('light-mode');
        themeIcon.className = 'fa-solid fa-moon';
        themeLabel.innerText = 'DARK';
        localStorage.setItem('theme', 'light');
    } else {
        document.body.classList.remove('light-mode');
        themeIcon.className = 'fa-solid fa-sun';
        themeLabel.innerText = 'LIGHT';
        localStorage.setItem('theme', 'dark');
    }
    // Save to server config file
    saveAppConfig({ light_mode: toLight });
    
    // Re-render chart to update grid colors
    if (dashboardData) {
        renderQuantiChart();
        renderQualiChart();
    }
}


// Apply visual theme class
function applyThemeClass(themeName) {
    document.body.classList.remove('theme-1', 'theme-2', 'theme-3', 'theme-4', 'theme-5');
    document.body.classList.add(themeName);
    localStorage.setItem('selected-theme', themeName);
    
    // Save theme configuration to server
    saveAppConfig({ theme: themeName });

    
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.value = themeName;
    }
    
    const modalThemeSelect = document.getElementById('modal-theme-select');
    if (modalThemeSelect) {
        modalThemeSelect.value = themeName;
    }

    const sidebarThemeSelect = document.getElementById('sidebar-theme-select');
    if (sidebarThemeSelect) {
        sidebarThemeSelect.value = themeName;
    }

    // Update active state in visual theme grid selector
    const themeCards = document.querySelectorAll('.theme-card');
    themeCards.forEach(card => {
        if (card.dataset.theme === themeName) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
    
    // Also re-render chart to pick up theme color changes
    if (dashboardData) {
        renderQuantiChart();
        renderQualiChart();
    }
}

// Open modal
function openSettingsModal() {
    if (!dashboardData) return;
    inputRestDays.value = dashboardData.workdays.rest;
    
    const modalThemeSelect = document.getElementById('modal-theme-select');
    if (modalThemeSelect) {
        const classes = Array.from(document.body.classList);
        const bodyTheme = classes.find(c => c.startsWith('theme-')) || 'theme-1';
        modalThemeSelect.value = bodyTheme;

        // Highlight correct card in theme grid
        const themeCards = document.querySelectorAll('.theme-card');
        themeCards.forEach(card => {
            if (card.dataset.theme === bodyTheme) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });
    }
    
    const container = document.getElementById('exclude-families-toggles');
    if (container) {
        container.innerHTML = '';
        const allFamilies = dashboardData.all_families || [];
        const excludedSet = new Set((dashboardData.exclude_families || []).map(f => f.trim().toUpperCase()));
        
        allFamilies.forEach(family => {
            const pill = document.createElement('div');
            pill.className = 'family-toggle-pill';
            const isExcluded = excludedSet.has(family.trim().toUpperCase());
            if (isExcluded) {
                pill.classList.add('excluded');
            }
            
            const iconClass = isExcluded ? 'fa-solid fa-xmark' : 'fa-solid fa-check';
            pill.innerHTML = `
                <i class="${iconClass}"></i>
                <span>${family}</span>
            `;
            
            pill.addEventListener('click', () => {
                const nowExcluded = pill.classList.toggle('excluded');
                const icon = pill.querySelector('i');
                if (nowExcluded) {
                    icon.className = 'fa-solid fa-xmark';
                    showToast(`Masquer ${family}`, "info");
                } else {
                    icon.className = 'fa-solid fa-check';
                    showToast(`Afficher ${family}`, "info");
                }
            });
            container.appendChild(pill);
        });
    }
    
    infoTotalDays.innerText = dashboardData.workdays.total;
    infoElapsedDays.innerText = dashboardData.workdays.elapsed;
    settingsModal.classList.add('open');
}

// Close modal
function closeSettingsModal() {
    settingsModal.classList.remove('open');
}

// Save settings to backend
function handleSettingsSubmit(e) {
    e.preventDefault();
    const restDays = parseInt(inputRestDays.value);
    
    const container = document.getElementById('exclude-families-toggles');
    const excludedFamilies = [];
    if (container) {
        container.querySelectorAll('.family-toggle-pill.excluded').forEach(pill => {
            excludedFamilies.push(pill.querySelector('span').innerText.trim());
        });
    }
    
    // Explicitly apply theme selection from the modal selector on submission
    const modalThemeSelect = document.getElementById('modal-theme-select');
    if (modalThemeSelect) {
        applyThemeClass(modalThemeSelect.value);
    }
    
    const dateSelect = document.getElementById('date-select');
    const dateVal = dateSelect ? dateSelect.value : 'default';
    
    fetch('/api/settings', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
            rest_days: restDays,
            exclude_families: excludedFamilies,
            date: dateVal
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            showToast("Paramètres mis à jour et données recalculées !", "success");
            closeSettingsModal();
            fetchDashboardData();
        } else {
            showToast("Erreur: " + data.message, "error");
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Une erreur de communication est survenue lors de l'application.", "error");
    });
}

// Reset the selected database tables with confirmation
function handleSelectedTablesReset() {
    const checkboxes = document.querySelectorAll('.reset-table-cb:checked');
    if (checkboxes.length === 0) {
        showToast("Veuillez sélectionner au moins une table à réinitialiser.", "error");
        return;
    }
    
    const selectedTables = Array.from(checkboxes).map(cb => cb.value);
    
    // Map table name to user-friendly French name
    const tableNamesFrench = {
        'qualitative_data': 'la table Qualitatif (qualitative_data)',
        'quantitative_data': 'la table Quantitatif (quantitative_data)',
        'clients_full': 'la table Clients (clients_full)',
        'fdv': 'la table FDV (force de vente)',
        'focus_som_data': 'la table Focus SOM (focus_som_data)',
        'focus_vmm_data': 'la table Focus VMM (focus_vmm_data)'
    };
    
    const frenchNames = selectedTables.map(t => tableNamesFrench[t] || t);
    
    // Create the confirmation message showing exactly what will be reset
    let warningMsg = "⚠️ DANGER : Cette action va réinitialiser (vider) toutes les données de :\n";
    frenchNames.forEach(name => {
        warningMsg += `  - ${name}\n`;
    });
    warningMsg += "\nCette action est irréversible.\n\nÊtes-vous absolument sûr de vouloir réinitialiser ces tables ?";
    
    const isConfirmed = confirm(warningMsg);
    if (!isConfirmed) {
        return;
    }
    
    // Disable reset button and checkboxes during execution to prevent concurrent operations
    const btnResetSelected = document.getElementById('btn-reset-selected');
    if (btnResetSelected) {
        btnResetSelected.disabled = true;
        btnResetSelected.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> RÉINITIALISATION...';
    }
    
    checkboxes.forEach(cb => cb.disabled = true);
    
    fetch('/api/reset_db', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tables: selectedTables })
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            showToast("Tables réinitialisées avec succès !", "success");
            closeSettingsModal();
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showToast("Erreur lors de la réinitialisation : " + data.message, "error");
            if (btnResetSelected) {
                btnResetSelected.disabled = false;
                btnResetSelected.innerHTML = '<i class="fa-solid fa-arrow-rotate-left"></i> RÉINITIALISER';
            }
            checkboxes.forEach(cb => cb.disabled = false);
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Une erreur de communication est survenue.", "error");
        if (btnResetSelected) {
            btnResetSelected.disabled = false;
            btnResetSelected.innerHTML = '<i class="fa-solid fa-arrow-rotate-left"></i> RÉINITIALISER';
        }
        checkboxes.forEach(cb => cb.disabled = false);
    });
}



// Reset Vendeur/Secteur filters to Global view
function resetSelection() {
    currentSelection = { type: 'global', name: '' };
    searchInput.value = '';
    resetFilterBtn.style.display = 'none';
    const categorySelect = document.getElementById('category-select');
    const categoryText = categorySelect ? categorySelect.options[categorySelect.selectedIndex].text : "TOUTE L'AGENCE";
    currentSelectionBadge.innerText = `GLOBAL / ${categoryText.toUpperCase()}`;
    currentSelectionBadge.className = 'badge-blue';
    updateDashboard();
}

// Populate search autocomplete values
function populateFilters() {
    // Extract unique representatives & sectors
    const uniqueVendeurs = [...new Set(dashboardData.quantitative.map(item => item.vendeur))].filter(v => v && v.toUpperCase() !== 'AUTRE').sort();
    const uniqueSecteursVmm = [...new Set(dashboardData.focus_vmm.map(item => item.secteur))].filter(s => s && s.toUpperCase() !== 'AUTRES SECTEURS').sort();
    const uniqueSecteursSom = [...new Set(dashboardData.focus_som.map(item => item.secteur))].filter(s => s && s.toUpperCase() !== 'AUTRES SECTEURS').sort();
    
    window.searchData = [
        ...uniqueVendeurs.map(v => ({ name: v, type: 'vendeur' })),
        ...uniqueSecteursVmm.map(s => ({ name: s, type: 'secteur' })),
        ...uniqueSecteursSom.map(s => ({ name: s, type: 'secteur' })),
        { name: 'AUTRE', type: 'vendeur' }
    ];
}

// Filter autocomplete dropdown dynamically
function handleSearchInput() {
    const term = searchInput.value.toLowerCase().trim();
    if (!term) {
        searchDropdown.style.display = 'none';
        activeDropdownIndex = -1;
        return;
    }

    const matches = window.searchData.filter(item => item.name.toLowerCase().includes(term)).slice(0, 10);
    if (matches.length === 0) {
        searchDropdown.innerHTML = `<div class="dropdown-item-empty" style="padding: 0.65rem 1rem; font-size: 0.85rem; color: var(--text-muted); text-align: center; font-family: var(--font-mono);">AUCUN RÉSULTAT</div>`;
        searchDropdown.style.display = 'block';
        activeDropdownIndex = -1;
        return;
    }

    searchDropdown.innerHTML = '';
    activeDropdownIndex = -1;
    
    matches.forEach((match, idx) => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.dataset.index = idx;
        
        const typeLabel = match.type === 'vendeur' ? 'Vendeur' : 'Secteur';
        const typeBadge = match.type === 'vendeur' ? 'badge-blue' : 'badge-green';

        div.innerHTML = `
            <span>${match.name}</span>
            <span class="dropdown-item-meta ${typeBadge}">${typeLabel}</span>
        `;
        div.addEventListener('click', () => {
            selectFilter(match.type, match.name);
        });
        searchDropdown.appendChild(div);
    });
    searchDropdown.style.display = 'block';
}

// Set active selection
function selectFilter(type, name) {
    currentSelection = { type, name };
    searchInput.value = name;
    searchDropdown.style.display = 'none';
    resetFilterBtn.style.display = 'inline-block';
    
    currentSelectionBadge.innerText = `${type.toUpperCase()}: ${name}`;
    currentSelectionBadge.className = type === 'vendeur' ? 'badge-blue' : 'badge-green';
    
    updateDashboard();
}

// Core rendering pipeline
function updateDashboard() {
    if (!dashboardData) return;

    // 1. Get filtered datasets
    let quantiRecords = dashboardData.quantitative;
    let qualiRecords = dashboardData.qualitative;
    let focusVmm = dashboardData.focus_vmm;
    let focusSom = dashboardData.focus_som;

    // Apply selection filtering (Vendeur or Secteur)
    if (currentSelection.type === 'vendeur') {
        const targetName = (currentSelection.name || '').trim().toLowerCase();
        
        if (targetName === 'autre') {
            // Find all configured sellers in Focus lists (excluding virtual 'AUTRE' itself)
            const configuredSellers = new Set(
                [
                    ...dashboardData.focus_vmm.map(f => f.vendeur.trim().toLowerCase()),
                    ...dashboardData.focus_som.map(f => f.vendeur.trim().toLowerCase())
                ].filter(v => v && v !== 'autre')
            );
            
            quantiRecords = quantiRecords.filter(item => !configuredSellers.has(item.vendeur.trim().toLowerCase()));
            qualiRecords = qualiRecords.filter(item => !configuredSellers.has(item.vendeur.trim().toLowerCase()));
            
            // For Focus cards, select the 'AUTRE' virtual seller
            focusVmm = focusVmm.filter(item => item.vendeur.trim().toLowerCase() === 'autre');
            focusSom = focusSom.filter(item => item.vendeur.trim().toLowerCase() === 'autre');
        } else {
            quantiRecords = quantiRecords.filter(item => {
                const val = (item.vendeur || '').trim().toLowerCase();
                return val === targetName || val.includes(targetName) || targetName.includes(val);
            });
            
            qualiRecords = qualiRecords.filter(item => {
                const val = (item.vendeur || '').trim().toLowerCase();
                return val === targetName || val.includes(targetName) || targetName.includes(val);
            });
            
            // Filter Focus data by matching Vendeur name directly with 'AUTRE' fallback
            const origFocusVmm = focusVmm.filter(item => {
                const val = (item.vendeur || '').trim().toLowerCase();
                return val === targetName || val.includes(targetName) || targetName.includes(val);
            });
            focusVmm = origFocusVmm.length > 0 ? origFocusVmm : focusVmm.filter(item => item.vendeur.trim().toLowerCase() === 'autre');
            
            const origFocusSom = focusSom.filter(item => {
                const val = (item.vendeur || '').trim().toLowerCase();
                return val === targetName || val.includes(targetName) || targetName.includes(val);
            });
            focusSom = origFocusSom.length > 0 ? origFocusSom : focusSom.filter(item => item.vendeur.trim().toLowerCase() === 'autre');
        }
    } else if (currentSelection.type === 'secteur') {
        // Filter Focus items directly
        focusVmm = focusVmm.filter(item => item.secteur.toLowerCase() === currentSelection.name.toLowerCase());
        focusSom = focusSom.filter(item => item.secteur.toLowerCase() === currentSelection.name.toLowerCase());
        
        // Match sellers linked to this sector
        const sellersForSector = new Set([
            ...focusVmm.map(f => f.vendeur.toLowerCase()),
            ...focusSom.map(f => f.vendeur.toLowerCase())
        ]);
        if (sellersForSector.size > 0) {
            quantiRecords = quantiRecords.filter(item => sellersForSector.has(item.vendeur.toLowerCase()));
            qualiRecords = qualiRecords.filter(item => sellersForSector.has(item.vendeur.toLowerCase()));
        }
    }

    // Apply Tab Type filtering (SOM / VMM)
    if (currentFilterType === 'som') {
        quantiRecords = quantiRecords.filter(item => {
            // SOM families: LEVURE, MOUSSES, CONFITURE, CONSERVES, MARGAFRIQUE, SOM, etc.
            const fam = item.famille.toUpperCase();
            return fam !== 'VMM' && fam !== 'VIT' && fam !== 'CHAR' && !fam.includes('VMM');
        });
        focusVmm = []; // VMM focus empty
    } else if (currentFilterType === 'vmm') {
        quantiRecords = quantiRecords.filter(item => {
            // VMM families
            const fam = item.famille.toUpperCase();
            return fam === 'VMM' || fam === 'VIT' || fam === 'CHAR' || fam.includes('VMM') || fam === 'BOUILLON' || fam === 'CONDIMENTS';
        });
        focusSom = []; // SOM focus empty
    }

    // 2. Compute Top cards
    // Filter CA (ht) family or sum everything
    const totalCaObj = quantiRecords.filter(r => r.famille === 'C.A (ht)').reduce((sum, r) => sum + r.obj, 0) || 1;
    const totalCaReal = quantiRecords.filter(r => r.famille === 'C.A (ht)').reduce((sum, r) => sum + r.real, 0);
    
    // Dynamic values
    const achievementRate = Math.round((totalCaReal / totalCaObj) * 100);
    const uniqueVendeursInSelection = [...new Set(quantiRecords.map(item => item.vendeur))].length;

    // Populate Top Cards
    animateNumber('total-ca', totalCaReal, ' DH');
    caVsObjEl.innerText = `VS OBJ: ${formatNumber(totalCaObj)} DH (${Math.round((totalCaReal - totalCaObj) / totalCaObj * 100)}%)`;
    
    achievementRateEl.innerText = `${achievementRate}%`;
    achievementBarEl.style.width = `${Math.min(achievementRate, 100)}%`;
    if (achievementRate < 50) {
        achievementBarEl.className = 'progress-bar-fill';
        achievementBarEl.classList.add('blue-fill');
    } else if (achievementRate < 90) {
        achievementBarEl.className = 'progress-bar-fill';
        achievementBarEl.classList.add('amber-fill');
    } else {
        achievementBarEl.className = 'progress-bar-fill';
        achievementBarEl.classList.add('green-fill');
    }

    // Compare actual achievement with elapsed time prorata
    const wDays = dashboardData.workdays;
    const elapsedRatio = wDays.elapsed / wDays.total; 
    const elapsedPct = Math.round(elapsedRatio * 100);
    const diff = achievementRate - elapsedPct;
    const arrow = diff >= 0 ? '▲' : '▼';
    const diffSign = diff >= 0 ? '+' : '';
    const diffColor = diff >= 0 ? 'neon-text-green' : 'neon-text-pink';
    
    const vsProrataEl = document.getElementById('achievement-vs-prorata');
    if (vsProrataEl) {
        vsProrataEl.innerHTML = `<span class="${diffColor}">${arrow} ${diffSign}${diff}%</span> vs Prorata Temporel (${elapsedPct}%)`;
    }

    vendeursCountEl.innerText = uniqueVendeursInSelection;
    
    daysRatioEl.innerText = `${wDays.elapsed}/${wDays.total} J`;
    daysRemainingEl.innerText = `${wDays.rest} jours restants`;

    // Flow values update skipped (flow chart removed)

    // 4. Render Tables
    renderQuantiTable(quantiRecords);
    renderQualiTable(qualiRecords);

    // 5. Render Focus
    renderFocusSections(focusVmm, focusSom);

    // 6. Render System Alerts
    updateSystemAlerts(quantiRecords, qualiRecords, focusVmm, focusSom, wDays);

    // 7. Render Charts (separated Quanti and Quali)
    renderQuantiChart(quantiRecords);
    renderQualiChart(qualiRecords);
}

// Populate product family table
function renderQuantiTable(records) {
    quantiTableBody.innerHTML = '';
    
    // Group records by Famille to show totals
    const families = {};
    records.forEach(r => {
        if (!families[r.famille]) {
            families[r.famille] = { real: 0, obj: 0, real2025: 0, objMois: 0, raf: 0 };
        }
        families[r.famille].real += r.real;
        families[r.famille].obj += r.obj;
        families[r.famille].real2025 += r.real_2025;
        families[r.famille].objMois += r.obj_mois;
        families[r.famille].raf += r.raf;
    });

    const customOrder = [
        "LEVURE",
        "MOUSSES",
        "BOUILLON",
        "CONDIMENTS",
        "CONFITURE",
        "CONSERVES",
        "MISWAK"
    ];

    const sortedFamilies = Object.keys(families).sort((a, b) => {
        if (a === 'C.A (ht)') return 1;
        if (b === 'C.A (ht)') return -1;

        const indexA = customOrder.indexOf(a.toUpperCase());
        const indexB = customOrder.indexOf(b.toUpperCase());

        if (indexA !== -1 && indexB !== -1) {
            return indexA - indexB;
        }
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;

        return a.localeCompare(b);
    });

    sortedFamilies.forEach(fam => {
        const data = families[fam];
        const pct = data.obj > 0 ? ((data.real / data.obj) - 1) * 100 : -100;
        const tr = document.createElement('tr');
        
        if (fam === 'C.A (ht)') {
            tr.style.fontWeight = 'bold';
            tr.style.background = 'rgba(0,212,255,0.06)';
            tr.style.borderTop = '2px solid var(--neon-blue)';
        }

        const pctClass = pct >= 0 ? 'neon-text-green' : 'neon-text-pink';
        const pctSign = pct >= 0 ? '+' : '';

        tr.innerHTML = `
            <td><strong>${fam}</strong></td>
            <td>${formatNumber(data.real)}</td>
            <td>${formatNumber(data.obj)}</td>
            <td class="${pctClass}">${pctSign}${pct.toFixed(1)}%</td>
            <td>${formatNumber(data.real2025)}</td>
            <td>${formatNumber(data.objMois)}</td>
            <td class="neon-text-amber">${formatNumber(data.raf)}</td>
        `;
        quantiTableBody.appendChild(tr);
    });

    if (sortedFamilies.length === 0) {
        quantiTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Aucune donnée disponible</td></tr>`;
    }
}

// Populate qualitative seller table
function renderQualiTable(records) {
    qualiTableBody.innerHTML = '';
    
    records.forEach(r => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.title = "Cliquez pour filtrer sur ce vendeur";
        tr.addEventListener('click', () => {
            selectFilter('vendeur', r.vendeur);
            showToast(`Filtré sur le vendeur : ${r.vendeur}`, "info");
        });
        
        tr.innerHTML = `
            <td><strong>${r.vendeur}</strong></td>
            <td>${r.clt_programme}</td>
            <td>${r.clt_facture}</td>
            <td class="neon-text-blue">${(r.acm * 100).toFixed(1)}%</td>
            <td class="neon-text-green">${(r.tsm * 100).toFixed(1)}%</td>
            <td>${r.line !== undefined && r.line !== null && r.line !== "" ? (parseFloat(r.line) * 100).toFixed(1) + '%' : '-'}</td>
            <td class="neon-text-amber">${r.raf_tsm}</td>
            <td class="neon-text-amber">${r.raf_acm}</td>
        `;
        qualiTableBody.appendChild(tr);
    });

    if (records.length === 0) {
        qualiTableBody.innerHTML = `<tr><td colspan="8" style="text-align:center;">Aucune donnée qualitative disponible</td></tr>`;
    }
}

// Populate both focus section components
function renderFocusSections(focusVmm, focusSom) {
    // VMM Focus Calculation
    if (focusVmm.length > 0) {
        let name = "TOUTE L'AGENCE (GLOBAL)";
        let nb_clients = 0;
        let avg_obj_juin = 0;
        let obj_acm = 0;
        let realise = 0;
        let rest = 0;
        let rest_jour = 0;
        
        if (focusVmm.length === 1) {
            const item = focusVmm[0];
            name = item.vendeur.trim().toLowerCase() === 'autre' ? 'Autre (Moyenne Agence)' : item.secteur;
            nb_clients = item.nb_clients;
            avg_obj_juin = item.obj_juin;
            obj_acm = item.obj_acm;
            realise = item.realise;
            rest = item.rest;
            rest_jour = item.rest_jour;
        } else {
            // Aggregate all VMM Focus rows, excluding the virtual 'AUTRE' row
            const activeItems = focusVmm.filter(item => item.vendeur.trim().toLowerCase() !== 'autre');
            if (activeItems.length > 0) {
                activeItems.forEach(item => {
                    nb_clients += item.nb_clients;
                    avg_obj_juin += item.obj_juin;
                    obj_acm += item.obj_acm;
                    realise += item.realise;
                    rest += item.rest;
                    rest_jour += item.rest_jour;
                });
                avg_obj_juin = avg_obj_juin / activeItems.length;
            }
        }
        
        focusVmmName.innerText = name;
        focusVmmClients.innerText = nb_clients;
        focusVmmTargetAcm.innerText = `${Math.round(avg_obj_juin * 100)}%`;
        focusVmmObjAcm.innerText = Math.round(obj_acm);
        
        // Progress
        const realizePct = obj_acm > 0 ? Math.round((realise / obj_acm) * 100) : 0;
        focusVmmPct.innerText = `${realizePct}%`;
        focusVmmBar.style.width = `${Math.min(realizePct, 100)}%`;
        focusVmmRealRest.innerText = `Réalisé: ${realise.toFixed(0)} | Reste: ${rest.toFixed(0)}`;
        focusVmmRafJour.innerText = `Reste/Jour: ${rest_jour.toFixed(1)}`;
    } else {
        focusVmmName.innerText = "Non configuré";
        focusVmmClients.innerText = '0';
        focusVmmTargetAcm.innerText = '0%';
        focusVmmObjAcm.innerText = '0';
        focusVmmPct.innerText = '0%';
        focusVmmBar.style.width = '0%';
        focusVmmRealRest.innerText = 'Réalisé: 0 | Reste: 0';
        focusVmmRafJour.innerText = 'Reste/Jour: 0.0';
    }

    // SOM Focus Calculation
    if (focusSom.length > 0) {
        let name = "TOUTE L'AGENCE (GLOBAL)";
        let glace_ht = 0;
        let ttc = 0;
        let realise = 0;
        let rest = 0;
        let rest_jour = 0;
        
        if (focusSom.length === 1) {
            const item = focusSom[0];
            name = item.vendeur.trim().toLowerCase() === 'autre' ? 'Autre (Moyenne Agence)' : item.secteur;
            glace_ht = item.glace_ht;
            ttc = item.ttc;
            realise = item.realise;
            rest = item.rest;
            rest_jour = item.rest_jour;
        } else {
            // Aggregate all SOM Focus rows, excluding the virtual 'AUTRE' row
            const activeItems = focusSom.filter(item => item.vendeur.trim().toLowerCase() !== 'autre');
            if (activeItems.length > 0) {
                activeItems.forEach(item => {
                    glace_ht += item.glace_ht;
                    ttc += item.ttc;
                    realise += item.realise;
                    rest += item.rest;
                    rest_jour += item.rest_jour;
                });
            }
        }
        
        focusSomName.innerText = name;
        focusSomObjHt.innerText = formatNumber(glace_ht) + ' DH';
        focusSomObjTtc.innerText = formatNumber(ttc) + ' DH';
        
        const realizePct = ttc > 0 ? Math.round((realise / ttc) * 100) : 0;
        focusSomPct.innerText = `${realizePct}%`;
        focusSomBar.style.width = `${Math.min(realizePct, 100)}%`;
        focusSomRealRest.innerText = `Réalisé: ${formatNumber(realise)} DH | Reste: ${formatNumber(rest)} DH`;
        focusSomRafJour.innerText = `Reste/Jour: ${formatNumber(rest_jour)} DH`;
    } else {
        focusSomName.innerText = "Non configuré";
        focusSomObjHt.innerText = '0 DH';
        focusSomObjTtc.innerText = '0 DH';
        focusSomPct.innerText = '0%';
        focusSomBar.style.width = '0%';
        focusSomRealRest.innerText = 'Réalisé: 0 DH | Reste: 0 DH';
        focusSomRafJour.innerText = 'Reste/Jour: 0 DH';
    }
}

// Generate Chart.js diagrams
// Generate Quantitative Chart (Écart vs Obj %)
function renderQuantiChart(quantiRecords) {
    if (!quantiRecords) {
        if (dashboardData) {
            quantiRecords = dashboardData.quantitative;
        } else {
            return;
        }
    }

    const canvas = document.getElementById('quanti-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (quantiChartInstance) {
        quantiChartInstance.destroy();
    }

    // Resolve colors dynamically from the CSS variables of the active theme
    const styles = getComputedStyle(document.body);
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
    const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);
    const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);

    // Extract the top 7 sellers by sales volume (real CA) to keep x-axis consistent
    const sellerPerformances = {};
    quantiRecords.forEach(r => {
        if (r.famille === 'C.A (ht)') {
            if (!sellerPerformances[r.vendeur]) {
                sellerPerformances[r.vendeur] = { real: 0, obj: 0 };
            }
            sellerPerformances[r.vendeur].real += r.real;
            sellerPerformances[r.vendeur].obj += r.obj;
        }
    });

    let labels = Object.keys(sellerPerformances);
    labels.sort((a,b) => sellerPerformances[b].real - sellerPerformances[a].real);
    labels = labels.slice(0, 7); // Show top 7

    // Deviation percentage data calculation
    const deviationData = labels.map(l => {
        const perf = sellerPerformances[l];
        return perf.obj > 0 ? Math.round(((perf.real / perf.obj) - 1) * 100) : 0;
    });

    // Colors for positive (green) and negative (pink) points
    const pointBackgroundColors = deviationData.map(v => v >= 0 ? neonGreen : neonPink);
    const pointBorderColors = deviationData.map(v => v >= 0 ? neonGreen : neonPink);

    // Plugin to display names and percentage values directly on top of each point
    const pointLabelsPlugin = {
        id: 'pointLabels',
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            ctx.save();
            ctx.font = 'bold 11px JetBrains Mono';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            
            chart.getDatasetMeta(0).data.forEach((point, index) => {
                const val = data.datasets[0].data[index];
                const parts = data.labels[index].split(' ');
                const shortName = (parts[0] + ' ' + (parts[1] || '')).trim();
                const pctLabel = (val > 0 ? '+' : '') + val + '%';
                
                ctx.fillStyle = val >= 0 ? neonGreen : neonPink;
                if (val >= 0) {
                    ctx.fillText(shortName, point.x, point.y - 25);
                    ctx.fillText(pctLabel, point.x, point.y - 12);
                } else {
                    ctx.fillText(pctLabel, point.x, point.y + 14);
                    ctx.fillText(shortName, point.x, point.y + 27);
                }
            });
            ctx.restore();
        }
    };

    quantiChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(l => l.substring(0, 15)), // Shorten long names
            datasets: [
                {
                    label: 'Écart / Objectif (%)',
                    data: deviationData,
                    borderColor: neonBlue,
                    borderWidth: 2,
                    pointBackgroundColor: pointBackgroundColors,
                    pointBorderColor: pointBorderColors,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    tension: 0.3, // smooth curves
                    fill: {
                        target: 'origin',
                        above: neonGreen + '22', // translucent green fill above 0%
                        below: neonPink + '22'   // translucent pink fill below 0%
                    }
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
                    grid: {
                        color: function(context) {
                            if (context.tick && context.tick.value === 0) {
                                return isWhiteMode ? 'rgba(255, 45, 85, 0.7)' : 'rgba(255, 45, 85, 0.8)'; // bold neon-pink zero line
                            }
                            return isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
                        },
                        lineWidth: function(context) {
                            if (context.tick && context.tick.value === 0) {
                                return 2.5; // thicker zero line
                            }
                            return 1;
                        }
                    },
                    ticks: {
                        color: isWhiteMode ? '#475569' : '#64748b',
                        font: { family: 'JetBrains Mono', size: 9 },
                        callback: function(value) {
                            return (value > 0 ? '+' : '') + value + '%';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: isWhiteMode ? '#1e293b' : '#e2e8f0', font: { family: 'Inter', weight: 'bold' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += (context.parsed.y > 0 ? '+' : '') + context.parsed.y + '%';
                            }
                            return label;
                        }
                    }
                }
            }
        },
        plugins: [pointLabelsPlugin]
    });
}

// Generate Qualitative Chart (LINE, TSM, ACM)
function renderQualiChart(qualiRecords) {
    if (!qualiRecords) {
        if (dashboardData) {
            qualiRecords = dashboardData.qualitative;
        } else {
            return;
        }
    }

    const canvas = document.getElementById('quali-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (qualiChartInstance) {
        qualiChartInstance.destroy();
    }

    // Resolve colors dynamically from the CSS variables of the active theme
    const styles = getComputedStyle(document.body);
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
    const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);
    const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);
    const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);

    // Calculate temporal prorata value dynamically
    const elapsedDays = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.elapsed : 5;
    const totalDays = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.total : 24;
    const prorata = (elapsedDays / totalDays) * 100;

    // Extract the top 7 sellers by sales volume (real CA) to keep x-axis consistent
    const sellerPerformances = {};
    if (dashboardData && dashboardData.quantitative) {
        dashboardData.quantitative.forEach(r => {
            if (r.famille === 'C.A (ht)') {
                if (!sellerPerformances[r.vendeur]) {
                    sellerPerformances[r.vendeur] = { real: 0, obj: 0 };
                }
                sellerPerformances[r.vendeur].real += r.real;
                sellerPerformances[r.vendeur].obj += r.obj;
            }
        });
    }

    let labels = Object.keys(sellerPerformances);
    labels.sort((a,b) => sellerPerformances[b].real - sellerPerformances[a].real);
    labels = labels.slice(0, 7); // Show top 7

    const lineData = [];
    const tsmData = [];
    const acmData = [];

    labels.forEach(l => {
        const record = qualiRecords.find(r => r.vendeur.trim() === l.trim() || r.vendeur.includes(l) || l.includes(r.vendeur));
        if (record) {
            lineData.push(record.line !== null && record.line !== undefined ? Math.round(record.line * 100) : 0);
            tsmData.push(record.tsm !== null && record.tsm !== undefined ? Math.round(record.tsm * 100) : 0);
            acmData.push(record.acm !== null && record.acm !== undefined ? Math.round(record.acm * 100) : 0);
        } else {
            lineData.push(0);
            tsmData.push(0);
            acmData.push(0);
        }
    });

    // Dynamic point colors mapping based on targets (LINE >= 100%, TSM/ACM >= prorata)
    const linePointColors = lineData.map(v => v >= 100 ? neonGreen : neonPink);
    const tsmPointColors = tsmData.map(v => v >= prorata ? neonGreen : neonPink);
    const acmPointColors = acmData.map(v => v >= prorata ? neonGreen : neonPink);

    // Plugin to display LINE percentages and vendor codes directly on the point
    const qualiLabelsPlugin = {
        id: 'qualiLabels',
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            ctx.save();
            ctx.font = 'bold 11px JetBrains Mono';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            
            chart.getDatasetMeta(0).data.forEach((point, index) => {
                const val = data.datasets[0].data[index];
                const parts = data.labels[index].split(' ');
                const code = parts[0];
                const label = val + '%';
                
                ctx.fillStyle = val >= 100 ? neonGreen : neonPink;
                if (val >= 100) {
                    ctx.fillText(code, point.x, point.y - 25);
                    ctx.fillText(label, point.x, point.y - 12);
                } else {
                    ctx.fillText(label, point.x, point.y + 14);
                    ctx.fillText(code, point.x, point.y + 27);
                }
            });
            ctx.restore();
        }
    };

    // Custom plugin to draw target lines (100% and Prorata) on qualitative chart
    const qualiTargetLinesPlugin = {
        id: 'qualiTargetLines',
        afterDraw(chart) {
            const { ctx, chartArea: { left, right }, scales: { y } } = chart;
            ctx.save();
            ctx.font = 'bold 9px JetBrains Mono';
            ctx.textBaseline = 'middle';
            
            // 1. Draw 100% target line (Solid Pink/Red)
            const y100 = y.getPixelForValue(100);
            ctx.strokeStyle = neonPink;
            ctx.lineWidth = 2.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(left, y100);
            ctx.lineTo(right, y100);
            ctx.stroke();
            
            ctx.fillStyle = neonPink;
            ctx.textAlign = 'right';
            ctx.fillText('OBJ 100%', right - 5, y100 - 8);

            // 2. Draw Prorata target line (Dashed Amber)
            const yProrata = y.getPixelForValue(prorata);
            ctx.strokeStyle = neonAmber;
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(left, yProrata);
            ctx.lineTo(right, yProrata);
            ctx.stroke();
            
            ctx.fillStyle = neonAmber;
            ctx.textAlign = 'left';
            ctx.fillText(`PRORATA ${prorata.toFixed(2)}%`, left + 5, yProrata - 8);
            
            ctx.restore();
        }
    };

    qualiChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(l => l.substring(0, 15)), // Shorten long names
            datasets: [
                {
                    label: 'LINE (%)',
                    data: lineData,
                    borderColor: neonBlue,
                    borderWidth: 2,
                    pointBackgroundColor: linePointColors,
                    pointBorderColor: linePointColors,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: linePointColors,
                    pointHoverBorderColor: linePointColors,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'TSM (%)',
                    data: tsmData,
                    borderColor: neonAmber,
                    borderWidth: 2,
                    pointBackgroundColor: tsmPointColors,
                    pointBorderColor: tsmPointColors,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: tsmPointColors,
                    pointHoverBorderColor: tsmPointColors,
                    tension: 0.3,
                    fill: false
                },
                {
                    label: 'ACM (%)',
                    data: acmData,
                    borderColor: neonGreen,
                    borderWidth: 2,
                    pointBackgroundColor: acmPointColors,
                    pointBorderColor: acmPointColors,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointHoverBackgroundColor: acmPointColors,
                    pointHoverBorderColor: acmPointColors,
                    tension: 0.3,
                    fill: false
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
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    labels: { color: isWhiteMode ? '#1e293b' : '#e2e8f0', font: { family: 'Inter', weight: 'bold' } }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + '%';
                            }
                            return label;
                        }
                    }
                }
            }
        },
        plugins: [qualiLabelsPlugin, qualiTargetLinesPlugin]
    });
}

// Helpers
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function animateNumber(elementId, target, suffix = '') {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    let start = 0;
    const duration = 500; // ms
    const stepTime = 15;
    const steps = duration / stepTime;
    const stepVal = (target - start) / steps;
    
    let current = start;
    let t = setInterval(() => {
        current += stepVal;
        if ((stepVal > 0 && current >= target) || (stepVal < 0 && current <= target)) {
            clearInterval(t);
            el.innerText = formatNumber(target) + suffix;
        } else {
            el.innerText = formatNumber(current) + suffix;
        }
    }, stepTime);
}

// Dropdown highlight helper
function updateDropdownHighlight(items) {
    items.forEach((item, idx) => {
        if (idx === activeDropdownIndex) {
            item.classList.add('active');
            item.scrollIntoView({ block: 'nearest' });
        } else {
            item.classList.remove('active');
        }
    });
}

// Cybernetic Toast notification system
function showToast(message, type = 'info') {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop open';
    backdrop.style.zIndex = '9999';
    
    let title = 'SYSTEM MESSAGE';
    let iconClass = 'fa-circle-info';
    let titleClass = 'neon-text-blue';
    let borderClass = 'glow-blue';
    
    if (type === 'success') {
        title = 'SUCCESS // COMPLETED';
        iconClass = 'fa-circle-check';
        titleClass = 'neon-text-green';
        borderClass = 'glow-green';
    } else if (type === 'error') {
        title = 'ALERT // SYSTEM ERROR';
        iconClass = 'fa-triangle-exclamation';
        titleClass = 'neon-text-pink';
        borderClass = 'glow-pink';
    } else if (type === 'info') {
        title = 'INFO // SYSTEM';
        iconClass = 'fa-circle-info';
        titleClass = 'neon-text-blue';
        borderClass = 'glow-blue';
    }

    backdrop.innerHTML = `
        <div class="cyber-modal ${borderClass}" style="max-width: 450px; width: 90%;">
            <div class="modal-header">
                <h3 class="${titleClass}"><i class="fa-solid ${iconClass}"></i> ${title}</h3>
            </div>
            <div class="modal-body" style="padding: 1.5rem; text-align: center;">
                <p style="font-family: var(--font-mono); font-size: 0.95rem; margin-bottom: 1.5rem; line-height: 1.5; color: var(--text-main);">${message}</p>
                <button class="cyber-btn" id="popup-ok-btn" style="margin: 0 auto; min-width: 100px; justify-content: center;">OK</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(backdrop);
    
    const okBtn = backdrop.querySelector('#popup-ok-btn');
    if (okBtn) {
        okBtn.focus();
        okBtn.addEventListener('click', () => {
            backdrop.classList.remove('open');
            setTimeout(() => {
                backdrop.remove();
            }, 300);
        });
    }
}

// Variable to track veo animation state
let veoCanvas = null;
let veoCtx = null;
let veoAnimId = null;
let veoTimeInterval = null;

// Variable to track vendeur selection modal state
let selectedVendeurForReport = null;
let allVendeursList = [];
let filteredVendeursList = [];

// Open Vendeur Selection Modal
function openVendeurSelectionModal() {
    const modal = document.getElementById('vendeur-selection-modal');
    if (!modal) return;

    // Reset selection
    selectedVendeurForReport = null;
    updateSelectedVendeurDisplay();
    document.getElementById('generate-vendeur-report-btn').disabled = true;

    // Reset dropdown display
    const dropdownText = document.getElementById('dropdown-selected-text');
    if (dropdownText) {
        dropdownText.textContent = '-- Sélectionner un vendeur --';
        dropdownText.classList.add('placeholder');
    }

    // Show modal
    modal.classList.add('open');

    // Load vendeurs
    loadVendeursList();
}

// Close Vendeur Selection Modal
function closeVendeurSelectionModal() {
    const modal = document.getElementById('vendeur-selection-modal');
    if (modal) {
        modal.classList.remove('open');
    }
    // Close dropdown if open
    const dropdownMenu = document.getElementById('vendeur-dropdown-menu');
    if (dropdownMenu) dropdownMenu.classList.remove('open');
    // Reset
    const searchInput = document.getElementById('vendeur-dropdown-search');
    if (searchInput) searchInput.value = '';
    selectedVendeurForReport = null;
    allVendeursList = [];
    filteredVendeursList = [];
}

// Toggle dropdown
function toggleVendeurDropdown() {
    const dropdownMenu = document.getElementById('vendeur-dropdown-menu');
    const dropdownToggle = document.getElementById('vendeur-dropdown-toggle');
    if (dropdownMenu) {
        const isOpen = dropdownMenu.classList.toggle('open');
        if (dropdownToggle) {
            dropdownToggle.classList.toggle('open', isOpen);
        }
        if (isOpen) {
            // Focus search input
            setTimeout(() => {
                const searchInput = document.getElementById('vendeur-dropdown-search');
                if (searchInput) searchInput.focus();
            }, 100);
        }
    }
}

// Close dropdown
function closeVendeurDropdown() {
    const dropdownMenu = document.getElementById('vendeur-dropdown-menu');
    const dropdownToggle = document.getElementById('vendeur-dropdown-toggle');
    if (dropdownMenu) dropdownMenu.classList.remove('open');
    if (dropdownToggle) dropdownToggle.classList.remove('open');
}

// Load vendeurs list from API
function loadVendeursList() {
    const dropdownList = document.getElementById('vendeur-dropdown-list');

    // Show loading
    dropdownList.innerHTML = '<div class="dropdown-loading"><i class="fa-solid fa-circle-notch fa-spin"></i><span>Chargement...</span></div>';

    // Get current date and category
    const dateSelect = document.getElementById('date-select');
    const selectedDate = dateSelect ? dateSelect.value : 'default';
    const categorySelect = document.getElementById('category-select');
    const selectedCategory = categorySelect ? categorySelect.value : 'All';

    // Build URL
    let url = '/api/vendeurs';
    const params = [];
    if (selectedDate && selectedDate !== 'default') params.push(`date=${encodeURIComponent(selectedDate)}`);
    if (selectedCategory && selectedCategory !== 'All') params.push(`category=${encodeURIComponent(selectedCategory)}`);
    if (params.length > 0) {
        url += '?' + params.join('&');
    }

    console.log('[VendeurModal] Fetching vendeurs from:', url);

    fetch(url)
        .then(res => {
            console.log('[VendeurModal] Response status:', res.status);
            return res.json();
        })
        .then(data => {
            console.log('[VendeurModal] Data received:', data);
            if (data.status === 'success' && data.vendeurs) {
                allVendeursList = data.vendeurs;
                filteredVendeursList = [...allVendeursList];
                console.log('[VendeurModal] Rendering', allVendeursList.length, 'vendeurs');
                renderDropdownList();
            } else {
                dropdownList.innerHTML = '<div class="dropdown-empty"><i class="fa-solid fa-exclamation-triangle"></i><span>Erreur de chargement</span></div>';
            }
        })
        .catch(err => {
            console.error('[VendeurModal] Error loading vendeurs:', err);
            dropdownList.innerHTML = '<div class="dropdown-empty"><i class="fa-solid fa-exclamation-triangle"></i><span>Erreur de connexion</span></div>';
        });
}

// Render dropdown list
function renderDropdownList() {
    const dropdownList = document.getElementById('vendeur-dropdown-list');

    if (filteredVendeursList.length === 0) {
        dropdownList.innerHTML = '<div class="dropdown-empty"><i class="fa-solid fa-users-slash"></i><span>Aucun vendeur trouvé</span></div>';
        return;
    }

    let html = '';
    filteredVendeursList.forEach((vendeur) => {
        const isSelected = selectedVendeurForReport === vendeur;
        html += `
            <div class="dropdown-item ${isSelected ? 'selected' : ''}" data-vendeur="${vendeur}">
                <i class="fa-solid fa-user-tie dropdown-item-icon"></i>
                <span class="dropdown-item-text">${vendeur}</span>
                ${isSelected ? '<i class="fa-solid fa-check dropdown-item-check"></i>' : ''}
            </div>
        `;
    });

    dropdownList.innerHTML = html;

    // Add click event listeners
    const items = dropdownList.querySelectorAll('.dropdown-item');
    items.forEach(item => {
        item.addEventListener('click', function() {
            const vendeur = this.getAttribute('data-vendeur');
            selectVendeur(vendeur);
            closeVendeurDropdown();
        });
    });
}

// Select a vendeur
function selectVendeur(vendeur) {
    selectedVendeurForReport = vendeur;

    // Update dropdown display
    const dropdownText = document.getElementById('dropdown-selected-text');
    if (dropdownText) {
        dropdownText.textContent = vendeur;
        dropdownText.classList.remove('placeholder');
    }

    // Update display and button
    updateSelectedVendeurDisplay();
    document.getElementById('generate-vendeur-report-btn').disabled = false;

    // Re-render list to show selection
    renderDropdownList();
}

// Update selected vendeur display
function updateSelectedVendeurDisplay() {
    const display = document.getElementById('selected-vendeur-display');
    if (selectedVendeurForReport) {
        display.innerHTML = `<i class="fa-solid fa-user-check"></i> <span style="color: var(--primary-color); font-weight: 600;">${selectedVendeurForReport}</span>`;
    } else {
        display.innerHTML = '<i class="fa-solid fa-user-check"></i> <span>Aucun vendeur sélectionné</span>';
    }
}

// Filter vendeurs based on search
function filterVendeursList(searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    if (!term) {
        filteredVendeursList = [...allVendeursList];
    } else {
        filteredVendeursList = allVendeursList.filter(v =>
            v.toLowerCase().includes(term)
        );
    }
    renderDropdownList();
}

// Get selected analysis options
function getSelectedAnalysisOptions() {
    return {
        quanti: document.getElementById('check-quanti')?.checked || false,
        quali: document.getElementById('check-quali')?.checked || false,
        focus: document.getElementById('check-focus')?.checked || false,
        anomali: document.getElementById('check-anomali')?.checked || false,
        rappel: document.getElementById('check-rappel')?.checked || false
    };
}

// Generate report for selected vendeur
function generateReportForSelectedVendeur() {
    if (!selectedVendeurForReport) {
        showToast("Veuillez sélectionner un vendeur", "warning");
        return;
    }

    // Get selected options
    const options = getSelectedAnalysisOptions();
    const selectedOptions = Object.keys(options).filter(k => options[k]);

    if (selectedOptions.length === 0) {
        showToast("Veuillez sélectionner au moins une option d'analyse", "warning");
        return;
    }

    // Close vendeur selection modal
    closeVendeurSelectionModal();

    // Open AI report modal with the selected vendeur and options
    openAiReportModalForVendeur(selectedVendeurForReport, options);
}

// Open AI Report modal & run backend generation (modified to show vendeur selection first)
function openAiReportModal() {
    // Check if a specific vendor is already selected
    const categorySelect = document.getElementById('category-select');
    const selectedCategory = categorySelect ? categorySelect.value : 'All';
    const selectedVendeur = currentSelection && currentSelection.type === 'vendeur' ? currentSelection.name : null;

    // If a specific vendor is selected, generate report directly
    if (selectedVendeur) {
        // Use default options (all checked ones)
        const options = getSelectedAnalysisOptions();
        openAiReportModalForVendeur(selectedVendeur, options);
    } else {
        // Otherwise, show the vendeur selection modal
        openVendeurSelectionModal();
    }
}

// Open AI Report modal for a specific vendeur
function openAiReportModalForVendeur(vendeurName, options = null) {
    const modal = document.getElementById('ai-report-modal');
    const loading = document.getElementById('report-loading');
    const content = document.getElementById('report-content-wrapper');
    const aiIcon = document.getElementById('ai-report-icon');
    const aiLabel = document.getElementById('ai-report-label');
    const aiBtn = document.getElementById('ai-report-btn');

    const copyBtn = document.getElementById('copy-report-btn');
    const downloadBtn = document.getElementById('download-report-btn');
    const okBtn = document.getElementById('ok-report-btn');
    const titleEl = document.getElementById('report-modal-title');

    if (!modal) return;

    modal.classList.add('open');
    loading.style.display = 'flex';
    content.style.display = 'none';

    if (copyBtn) copyBtn.style.display = 'none';
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (okBtn) okBtn.style.display = 'none';

    const categorySelect = document.getElementById('category-select');
    const selectedCategory = categorySelect ? categorySelect.value : 'All';

    const dateSelect = document.getElementById('date-select');
    const selectedDate = dateSelect ? dateSelect.value : 'default';

    let url = '/api/generate_report';
    const params = [];
    if (vendeurName) params.push(`vendeur=${encodeURIComponent(vendeurName)}`);
    else if (selectedCategory && selectedCategory !== 'All') params.push(`category=${encodeURIComponent(selectedCategory)}`);
    if (selectedDate && selectedDate !== 'default') params.push(`date=${encodeURIComponent(selectedDate)}`);

    // Add analysis options as parameters
    if (options) {
        const optionsStr = Object.keys(options).filter(k => options[k]).join(',');
        if (optionsStr) params.push(`options=${encodeURIComponent(optionsStr)}`);
    }

    if (params.length > 0) {
        url += '?' + params.join('&');
    }

    if (titleEl) {
        if (vendeurName) {
            titleEl.innerHTML = `<i class="fa-solid fa-brain neon-text-blue"></i> RAPPORT IA : <span class="neon-text-blue">${vendeurName}</span>`;
        } else if (selectedCategory && selectedCategory !== 'All') {
            const categoryText = categorySelect.options[categorySelect.selectedIndex].text;
            titleEl.innerHTML = `<i class="fa-solid fa-brain neon-text-blue"></i> RAPPORT IA : <span class="neon-text-blue">${categoryText.toUpperCase()}</span>`;
        } else {
            titleEl.innerHTML = `<i class="fa-solid fa-brain neon-text-blue"></i> RAPPORT IA : <span class="neon-text-blue">AGENCE (GLOBAL)</span>`;
        }
    }

    if (aiIcon) aiIcon.className = 'fa-solid fa-circle-notch fa-spin';
    if (aiLabel) aiLabel.innerText = 'ANALYSING...';
    if (aiBtn) aiBtn.disabled = true;

    // Start Veo canvas animation
    startVeoAnimation();

    fetch(url, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            loading.style.display = 'none';
            content.style.display = 'block';

            // Clear any previously queued charts
            window.reportChartsToRender = [];

            content.innerHTML = parseMarkdown(data.report);

            // Render the charts!
            renderReportCharts();

            if (copyBtn) copyBtn.style.display = 'inline-block';
            if (downloadBtn) downloadBtn.style.display = 'inline-block';
            if (okBtn) okBtn.style.display = 'inline-block';

            showToast("Rapport d'analyse IA généré avec succès !", "success");
        } else {
            closeAiReportModal();
            showToast("Erreur de génération du rapport: " + data.message, "error");
        }
    })
    .catch(err => {
        console.error(err);
        closeAiReportModal();
        showToast("Erreur de connexion lors de l'analyse IA.", "error");
    })
    .finally(() => {
        stopVeoAnimation();
        if (aiIcon) aiIcon.className = 'fa-solid fa-brain';
        if (aiLabel) aiLabel.innerText = 'ANALYSE IA';
        if (aiBtn) aiBtn.disabled = false;
    });
}

// Close AI Report modal
function closeAiReportModal() {
    const modal = document.getElementById('ai-report-modal');
    if (modal) {
        modal.classList.remove('open');
        const innerModal = modal.querySelector('.report-modal');
        if (innerModal) {
            innerModal.classList.remove('fullscreen');
        }
        const fullscreenBtn = document.getElementById('fullscreen-report-modal-btn');
        if (fullscreenBtn) {
            const icon = fullscreenBtn.querySelector('i');
            if (icon) icon.className = 'fa-solid fa-expand';
            fullscreenBtn.title = "Plein écran";
        }
    }
    stopVeoAnimation();
}

// Toggle Fullscreen on report modal
function toggleReportFullscreen() {
    const modal = document.querySelector('.report-modal');
    const btn = document.getElementById('fullscreen-report-modal-btn');
    if (!modal || !btn) return;
    
    modal.classList.toggle('fullscreen');
    const isFullscreen = modal.classList.contains('fullscreen');
    
    const icon = btn.querySelector('i');
    if (icon) {
        if (isFullscreen) {
            icon.className = 'fa-solid fa-compress';
            btn.title = "Restaurer la taille";
        } else {
            icon.className = 'fa-solid fa-expand';
            btn.title = "Plein écran";
        }
    }
}

// Start Veo canvas animation loop
function startVeoAnimation() {
    veoCanvas = document.getElementById('veo-canvas');
    if (!veoCanvas) return;
    veoCtx = veoCanvas.getContext('2d');
    
    // Set size based on bounding box
    const rect = veoCanvas.getBoundingClientRect();
    veoCanvas.width = rect.width;
    veoCanvas.height = rect.height;
    
    // Start REC timecode clock
    const timecodeEl = document.getElementById('veo-timecode');
    let seconds = 0;
    if (veoTimeInterval) clearInterval(veoTimeInterval);
    veoTimeInterval = setInterval(() => {
        seconds++;
        const hrs = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const mins = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        if (timecodeEl) timecodeEl.innerText = `REC ${hrs}:${mins}:${secs}`;
    }, 1000);
    
    // Generate particle nodes representing neural activations
    const particles = [];
    const particleCount = 40;
    for (let i = 0; i < particleCount; i++) {
        particles.push({
            x: Math.random() * veoCanvas.width,
            y: Math.random() * veoCanvas.height,
            vx: (Math.random() - 0.5) * 1.6,
            vy: (Math.random() - 0.5) * 1.6,
            r: Math.random() * 2 + 1,
            pulse: Math.random() * Math.PI
        });
    }
    
    function draw() {
        if (!veoCtx) return;
        veoCtx.clearRect(0, 0, veoCanvas.width, veoCanvas.height);
        
        // Render digital grids
        veoCtx.strokeStyle = 'rgba(0, 212, 255, 0.04)';
        veoCtx.lineWidth = 1;
        const gridSize = 40;
        for (let x = 0; x < veoCanvas.width; x += gridSize) {
            veoCtx.beginPath();
            veoCtx.moveTo(x, 0);
            veoCtx.lineTo(x, veoCanvas.height);
            veoCtx.stroke();
        }
        for (let y = 0; y < veoCanvas.height; y += gridSize) {
            veoCtx.beginPath();
            veoCtx.moveTo(0, y);
            veoCtx.lineTo(veoCanvas.width, y);
            veoCtx.stroke();
        }
        
        // Update particles
        particles.forEach(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.pulse += 0.03;
            
            if (p.x < 0 || p.x > veoCanvas.width) p.vx *= -1;
            if (p.y < 0 || p.y > veoCanvas.height) p.vy *= -1;
            
            const alpha = 0.3 + Math.sin(p.pulse) * 0.3;
            veoCtx.fillStyle = `rgba(0, 212, 255, ${alpha})`;
            veoCtx.beginPath();
            veoCtx.arc(p.x, p.y, p.r + Math.sin(p.pulse) * 1, 0, Math.PI * 2);
            veoCtx.fill();
        });
        
        // Render synaptic node lines
        veoCtx.lineWidth = 0.5;
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const p1 = particles[i];
                const p2 = particles[j];
                const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
                if (dist < 80) {
                    const alpha = (1 - dist / 80) * 0.2;
                    veoCtx.strokeStyle = `rgba(0, 212, 255, ${alpha})`;
                    veoCtx.beginPath();
                    veoCtx.moveTo(p1.x, p1.y);
                    veoCtx.lineTo(p2.x, p2.y);
                    veoCtx.stroke();
                }
            }
        }
        
        // Scan line laser sweep
        const scanY = (Date.now() / 15) % veoCanvas.height;
        veoCtx.strokeStyle = 'rgba(0, 212, 255, 0.12)';
        veoCtx.lineWidth = 2;
        veoCtx.beginPath();
        veoCtx.moveTo(0, scanY);
        veoCtx.lineTo(veoCanvas.width, scanY);
        veoCtx.stroke();
        
        veoAnimId = requestAnimationFrame(draw);
    }
    
    draw();
}

function stopVeoAnimation() {
    if (veoAnimId) cancelAnimationFrame(veoAnimId);
    if (veoTimeInterval) clearInterval(veoTimeInterval);
    veoAnimId = null;
    veoTimeInterval = null;
    if (veoCtx && veoCanvas) {
        veoCtx.clearRect(0, 0, veoCanvas.width, veoCanvas.height);
    }
}

// Convert DOM report element into ink-friendly printable A4 PDF via html2pdf
function downloadReportAsPdf() {
    const element = document.getElementById('report-content-wrapper');
    if (!element || element.style.display === 'none') {
        showToast("Aucun rapport disponible.", "error");
        return;
    }
    
    const selectedVendeur = currentSelection.type === 'vendeur' ? currentSelection.name : null;
    const filename = selectedVendeur 
        ? `Rapport_KPI_${selectedVendeur.replace(/\s+/g, '_')}.pdf`
        : 'Rapport_KPI_Agence_Agadir.pdf';
        
    showToast("Génération du PDF...", "info");
    
    // Apply printing visual mode override
    element.classList.add('pdf-print-mode');
    
    const opt = {
        margin:       [15, 15],
        filename:     filename,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    html2pdf().set(opt).from(element).save()
        .then(() => {
            showToast("PDF téléchargé !", "success");
            element.classList.remove('pdf-print-mode');
        })
        .catch(err => {
            console.error(err);
            showToast("Erreur PDF: " + err, "error");
            element.classList.remove('pdf-print-mode');
        });
}

// Helper to render beautiful HTML table and queue a chart if applicable
function renderTableHtml(rows) {
    if (rows.length === 0) return "";
    let headers = rows[0];
    let dataRows = rows.slice(1);
    
    // Check type of table by checking header terms
    let isQuantiTable = headers.some(h => h.toLowerCase().includes('famille')) && headers.some(h => h.toLowerCase().includes('réalisé'));
    let isQualiTable = headers.some(h => h.toLowerCase().includes('facturé') || h.toLowerCase().includes('commandes') || h.toLowerCase().includes('acm') || h.toLowerCase().includes('tsm'));
    let isRankTable = headers.some(h => h.toLowerCase().includes('vendeur')) && headers.some(h => h.toLowerCase().includes('taux'));
    
    let tableId = "report-table-" + Math.random().toString(36).substring(2, 9);
    let chartCanvasId = "chart-" + tableId;
    
    let html = '';
    
    // 1. If it's a quantitative table (by family), queue a comparative bar chart
    if (isQuantiTable) {
        html += `
        <div class="report-chart-card">
            <div class="report-chart-header">
                <span class="tech-label"><i class="fa-solid fa-chart-bar neon-text-blue"></i> RÉALISÉ VS OBJECTIF PAR FAMILLE</span>
            </div>
            <div class="report-chart-body">
                <canvas id="${chartCanvasId}"></canvas>
            </div>
        </div>
        `;
        
        if (!window.reportChartsToRender) window.reportChartsToRender = [];
        
        let labels = [];
        let realVals = [];
        let objVals = [];
        
        dataRows.forEach(row => {
            if (row.length >= 3) {
                let label = row[0].replace(/\*\*/g, '').trim();
                // Skip overall CA/HT or TOTAL rows so they don't skew the axis scale
                if (label.toUpperCase().includes('C.A') || label.toUpperCase().includes('TOTAL') || label.toUpperCase() === 'C.A (HT)') {
                    return;
                }
                let realVal = parseFloat(row[1].replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '')) || 0;
                let objVal = parseFloat(row[2].replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '')) || 0;
                
                labels.push(label);
                realVals.push(realVal);
                objVals.push(objVal);
            }
        });
        
        window.reportChartsToRender.push({
            id: chartCanvasId,
            type: 'quanti',
            data: { labels, realVals, objVals }
        });
    }
    // 2. If it's an individual qualitative table (1 row of data), render metrics progress cards
    else if (isQualiTable && dataRows.length === 1) {
        let row = dataRows[0];
        let acmIdx = headers.findIndex(h => h.toUpperCase().includes('ACM'));
        let tsmIdx = headers.findIndex(h => h.toUpperCase().includes('TSM'));
        let lineIdx = headers.findIndex(h => h.toUpperCase().includes('LINE'));
        
        let metersHtml = '<div class="report-metrics-grid">';
        let hasMeters = false;
        
        if (acmIdx !== -1 && row[acmIdx]) {
            let val = parseFloat(row[acmIdx].replace(/%/g, '').trim()) || 0;
            metersHtml += `
            <div class="report-metric-card">
                <span class="metric-label">COUVERTURE (ACM)</span>
                <span class="metric-value neon-text-blue">${row[acmIdx]}</span>
                <div class="progress-bar-container mini">
                    <div class="progress-bar-fill blue-fill" style="width: ${Math.min(val, 100)}%"></div>
                </div>
            </div>`;
            hasMeters = true;
        }
        if (tsmIdx !== -1 && row[tsmIdx]) {
            let val = parseFloat(row[tsmIdx].replace(/%/g, '').trim()) || 0;
            metersHtml += `
            <div class="report-metric-card">
                <span class="metric-label">TRANSFORMATION (TSM)</span>
                <span class="metric-value neon-text-amber">${row[tsmIdx]}</span>
                <div class="progress-bar-container mini">
                    <div class="progress-bar-fill amber-fill" style="width: ${Math.min(val, 100)}%"></div>
                </div>
            </div>`;
            hasMeters = true;
        }
        if (lineIdx !== -1 && row[lineIdx]) {
            let val = parseFloat(row[lineIdx].replace(/%/g, '').trim()) || 0;
            metersHtml += `
            <div class="report-metric-card">
                <span class="metric-label">PERFORMANCE LINE</span>
                <span class="metric-value neon-text-green">${row[lineIdx]}</span>
                <div class="progress-bar-container mini">
                    <div class="progress-bar-fill green-fill" style="width: ${Math.min(val, 100)}%"></div>
                </div>
            </div>`;
            hasMeters = true;
        }
        metersHtml += '</div>';
        if (hasMeters) {
            html += metersHtml;
        }
    }
    // 3. If it's a qualitative list table (multiple sellers), render a bar chart
    else if (isQualiTable && dataRows.length > 1) {
        html += `
        <div class="report-chart-card">
            <div class="report-chart-header">
                <span class="tech-label"><i class="fa-solid fa-chart-bar neon-text-green"></i> PERFORMANCE QUALITATIVE PAR VENDEUR</span>
            </div>
            <div class="report-chart-body">
                <canvas id="${chartCanvasId}"></canvas>
            </div>
        </div>
        `;
        
        if (!window.reportChartsToRender) window.reportChartsToRender = [];
        
        let labels = [];
        let acmVals = [];
        let tsmVals = [];
        let lineVals = [];
        
        let acmIdx = headers.findIndex(h => h.toUpperCase().includes('ACM'));
        let tsmIdx = headers.findIndex(h => h.toUpperCase().includes('TSM'));
        let lineIdx = headers.findIndex(h => h.toUpperCase().includes('LINE'));
        
        dataRows.forEach(row => {
            let seller = row[0].replace(/\*\*/g, '').trim();
            if (seller.toUpperCase().includes('TOTAL') || seller.toUpperCase().includes('MOYENNE')) return;
            
            let acmVal = acmIdx !== -1 && row[acmIdx] ? parseFloat(row[acmIdx].replace(/%/g, '').trim()) || 0 : 0;
            let tsmVal = tsmIdx !== -1 && row[tsmIdx] ? parseFloat(row[tsmIdx].replace(/%/g, '').trim()) || 0 : 0;
            let lineVal = lineIdx !== -1 && row[lineIdx] ? parseFloat(row[lineIdx].replace(/%/g, '').trim()) || 0 : 0;
            
            labels.push(seller);
            acmVals.push(acmVal);
            tsmVals.push(tsmVal);
            lineVals.push(lineVal);
        });
        
        window.reportChartsToRender.push({
            id: chartCanvasId,
            type: 'quali',
            data: { labels, acmVals, tsmVals, lineVals }
        });
    }
    // 4. If it's a rank/performer list table (multiple sellers' CA), render a bar chart comparing performance
    else if (isRankTable && dataRows.length > 1) {
        html += `
        <div class="report-chart-card">
            <div class="report-chart-header">
                <span class="tech-label"><i class="fa-solid fa-trophy neon-text-amber"></i> CLASSEMENT DES PERFORMANCES</span>
            </div>
            <div class="report-chart-body">
                <canvas id="${chartCanvasId}"></canvas>
            </div>
        </div>
        `;
        
        if (!window.reportChartsToRender) window.reportChartsToRender = [];
        
        let labels = [];
        let realVals = [];
        let objVals = [];
        
        dataRows.forEach(row => {
            if (row.length >= 3) {
                let seller = row[0].replace(/\*\*/g, '').trim();
                let realVal = parseFloat(row[1].replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '')) || 0;
                let objVal = parseFloat(row[2].replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '')) || 0;
                
                labels.push(seller);
                realVals.push(realVal);
                objVals.push(objVal);
            }
        });
        
        window.reportChartsToRender.push({
            id: chartCanvasId,
            type: 'rank',
            data: { labels, realVals, objVals }
        });
    }
    
    // Render the table
    html += `<div class="report-table-wrapper"><table class="cyber-table report-table"><thead><tr>`;
    headers.forEach(h => {
        html += `<th>${h.replace(/\*\*/g, '').trim()}</th>`;
    });
    html += `</tr></thead><tbody>`;
    
    dataRows.forEach(row => {
        let isCARow = row.length > 0 && row[0].replace(/\*\*/g, '').trim().toUpperCase().includes('C.A (HT)');
        let rowStyle = isCARow ? ' style="font-weight: bold; background: rgba(0, 212, 255, 0.05); border-top: 1.5px solid var(--neon-blue);"' : '';
        
        html += `<tr${rowStyle}>`;
        row.forEach((cell, idx) => {
            let isBold = cell.startsWith('**') && cell.endsWith('**');
            let clean = cell.replace(/\*\*/g, '').trim();
            let style = '';
            
            // Highlight color markers (+ / -)
            if (clean.startsWith('+') && clean.includes('%')) {
                style = ' style="color: var(--neon-green); font-weight: bold;"';
            } else if (clean.startsWith('-') && clean.includes('%')) {
                style = ' style="color: var(--neon-pink); font-weight: bold;"';
            }
            
            if (idx === 0 && (isBold || clean.toUpperCase().includes('TOTAL') || clean.toUpperCase().includes('MOYENNE') || isCARow)) {
                html += `<td${style}><strong>${clean}</strong></td>`;
            } else {
                html += `<td${style}>${clean}</td>`;
            }
        });
        html += `</tr>`;
    });
    html += `</tbody></table></div>`;
    return html;
}

// Simple Markdown to HTML converter supporting tables
function parseMarkdown(md) {
    if (!md) return "";
    let lines = md.split('\n');
    let processedLines = [];
    let inTable = false;
    let tableRows = [];
    
    function flushTable() {
        if (tableRows.length > 0) {
            processedLines.push(renderTableHtml(tableRows));
            tableRows = [];
        }
        inTable = false;
    }
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        // Escape HTML tags to protect layout
        let escapedLine = line
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
            
        // Check if line is a table row (starts and ends with |)
        if (escapedLine.startsWith('|') && escapedLine.endsWith('|')) {
            inTable = true;
            let cells = escapedLine.split('|').map(c => c.trim());
            // Remove empty elements from ends
            cells = cells.slice(1, cells.length - 1);
            
            // Check if separator row like |:---| or |---|
            let isDivider = cells.every(c => c.match(/^:?-+:?$/));
            if (!isDivider) {
                tableRows.push(cells);
            }
        } else {
            if (inTable) {
                flushTable();
            }
            processedLines.push(line); // push original line for further markdown replacements
        }
    }
    if (inTable) {
        flushTable();
    }
    
    let html = processedLines.join('\n');
    
    // Match alerts: > [!NOTE] text, etc.
    html = html.replace(/^&gt;\s*\[!(NOTE|WARNING|TIP|IMPORTANT|CAUTION)\](.*)$/gm, (match, type, content) => {
        const lowerType = type.toLowerCase();
        return `<div class="report-alert alert-${lowerType}"><strong>${type}</strong><br>${content}</div>`;
    });
    
    // Match basic blockquotes
    html = html.replace(/^&gt;\s*(.*)$/gm, '<blockquote>$1</blockquote>');

    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Bold text
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Bullet lists
    html = html.replace(/^\*\s+(.*$)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/^-\s+(.*$)/gim, '<ul><li>$1</li></ul>');
    html = html.replace(/<\/ul>\s*<ul>/g, ''); // combine consecutive lists

    // Dividers
    html = html.replace(/^---$/gm, '<hr class="report-divider">');

    // Convert paragraph splits
    const blocks = html.split(/\n\n+/);
    html = blocks.map(block => {
        const trimmed = block.trim();
        if (!trimmed) return "";
        if (trimmed.startsWith('<h') || trimmed.startsWith('<ul') || trimmed.startsWith('<blockquote') || trimmed.startsWith('<div') || trimmed.startsWith('<hr')) {
            return trimmed;
        }
        return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    return html;
}

function renderReportCharts() {
    if (!window.reportChartsToRender || window.reportChartsToRender.length === 0) return;
    
    const styles = getComputedStyle(document.body);
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
    const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);
    const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);
    const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);
    
    const isLight = document.body.classList.contains('light-mode');
    const textColor = isLight ? '#1e293b' : '#e2e8f0';
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
    
    window.reportChartsToRender.forEach(chartConfig => {
        const canvas = document.getElementById(chartConfig.id);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        if (chartConfig.type === 'quanti') {
            const { labels, realVals, objVals } = chartConfig.data;
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Réalisé (DH)',
                            data: realVals,
                            backgroundColor: neonBlue + '80',
                            borderColor: neonBlue,
                            borderWidth: 1.5
                        },
                        {
                            label: 'Objectif (DH)',
                            data: objVals,
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderColor: neonAmber,
                            borderWidth: 1.5,
                            borderDash: [3, 3]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: { color: textColor, font: { family: 'Inter', size: 9 } }
                        }
                    }
                }
            });
        } else if (chartConfig.type === 'quali') {
            const { labels, acmVals, tsmVals, lineVals } = chartConfig.data;
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'ACM (%)',
                            data: acmVals,
                            backgroundColor: neonGreen + '60',
                            borderColor: neonGreen,
                            borderWidth: 1.5
                        },
                        {
                            label: 'TSM (%)',
                            data: tsmVals,
                            backgroundColor: neonAmber + '60',
                            borderColor: neonAmber,
                            borderWidth: 1.5
                        },
                        {
                            label: 'LINE (%)',
                            data: lineVals,
                            backgroundColor: neonBlue + '60',
                            borderColor: neonBlue,
                            borderWidth: 1.5
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: {
                                color: textColor,
                                font: { family: 'JetBrains Mono', size: 9 },
                                callback: function(value) { return value + '%'; }
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: { color: textColor, font: { family: 'Inter', size: 9 } }
                        }
                    }
                }
            });
        } else if (chartConfig.type === 'rank') {
            const { labels, realVals, objVals } = chartConfig.data;
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Réalisé (DH)',
                            data: realVals,
                            backgroundColor: neonAmber + '60',
                            borderColor: neonAmber,
                            borderWidth: 1.5
                        },
                        {
                            label: 'Objectif (DH)',
                            data: objVals,
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderColor: neonBlue,
                            borderWidth: 1.5,
                            borderDash: [3, 3]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
                        }
                    },
                    plugins: {
                        legend: {
                            labels: { color: textColor, font: { family: 'Inter', size: 9 } }
                        }
                    }
                }
            });
        }
    });
}

// System Alerts engine (KPI dashboard design guidelines)
function updateSystemAlerts(quantiRecords, qualiRecords, focusVmm, focusSom, wDays) {
    const container = document.getElementById('alerts-container');
    if (!container) return;
    
    container.innerHTML = '';
    const alerts = [];

    // 1. Identify underperforming sellers (0 CA)
    const caRecords = quantiRecords.filter(r => r.famille === 'C.A (ht)');
    const zeroSellers = [];
    caRecords.forEach(r => {
        if (r.real === 0 && r.obj > 0) {
            zeroSellers.push(r.vendeur);
        }
    });

    if (zeroSellers.length > 0) {
        alerts.push({
            level: 'error',
            message: `<strong>RETARD CRITIQUE (CA nul) :</strong> ${zeroSellers.join(', ')} n'ont enregistré aucune vente (0 DH) alors qu'ils ont des objectifs assignés.`
        });
    }

    // 2. Compare focus products against temporal progress (prorata)
    const elapsedRatio = wDays.elapsed / wDays.total;
    
    if (focusVmm.length > 0) {
        const vmmObj = focusVmm.reduce((sum, r) => sum + r.obj_acm, 0);
        const vmmReal = focusVmm.reduce((sum, r) => sum + r.realise, 0);
        const vmmPct = vmmObj > 0 ? vmmReal / vmmObj : 0;
        
        if (vmmPct < elapsedRatio * 0.5 && vmmObj > 0) {
            alerts.push({
                level: 'warning',
                message: `<strong>RETARD FOCUS VMM (Tomate Frito) :</strong> Taux de réalisation de l'agence (${(vmmPct*100).toFixed(1)}%) très en dessous du prorata temporel (${Math.round(elapsedRatio*100)}%).`
            });
        }
    }

    if (focusSom.length > 0) {
        const somObj = focusSom.reduce((sum, r) => sum + r.ttc, 0);
        const somReal = focusSom.reduce((sum, r) => sum + r.realise, 0);
        const somPct = somObj > 0 ? somReal / somObj : 0;
        
        if (somPct < elapsedRatio * 0.5 && somObj > 0) {
            alerts.push({
                level: 'warning',
                message: `<strong>RETARD FOCUS SOM (Glace) :</strong> Taux de réalisation de l'agence (${(somPct*100).toFixed(1)}%) très inférieur au prorata temporel (${Math.round(elapsedRatio*100)}%).`
            });
        }
    }

    // 3. Identify qualitative coverage issues (TSM / follow-ups)
    const lowTsmSellers = qualiRecords.filter(r => r.tsm < 0.20 && r.clt_programme > 5).map(r => r.vendeur);
    if (lowTsmSellers.length > 0) {
        alerts.push({
            level: 'info',
            message: `<strong>COUVERTURE TERRAIN TRÈS FAIBLE :</strong> Taux de suivi (TSM) critique (<20%) pour : ${lowTsmSellers.slice(0, 5).join(', ')}${lowTsmSellers.length > 5 ? ' et ' + (lowTsmSellers.length - 5) + ' autres' : ''}.`
        });
    }

    // Render aggregated alerts
    if (alerts.length === 0) {
        container.innerHTML = `<div class="alert-item alert-green"><i class="fa-solid fa-circle-check"></i> Aucun risque critique identifié. Tous les indicateurs terrain de l'agence (ventes, visites, focus) sont dans le vert.</div>`;
    } else {
        alerts.forEach(alert => {
            const div = document.createElement('div');
            div.className = `alert-item alert-${alert.level}`;
            
            let icon = 'fa-circle-info';
            if (alert.level === 'error') icon = 'fa-circle-xmark';
            if (alert.level === 'warning') icon = 'fa-triangle-exclamation';

            div.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${alert.message}</span>`;
            container.appendChild(div);
        });
    }
}

let uploadQueue = [];

function handleFileSelection(fileList) {
    const container = document.getElementById('upload-files-list-container');
    const list = document.getElementById('upload-files-list');
    const submitBtn = document.getElementById('upload-submit-btn');
    const dropzone = document.getElementById('upload-dropzone');
    if (!container || !list) return;

    uploadQueue = [];
    list.innerHTML = '';

    Array.from(fileList).forEach((file, idx) => {
        const item = document.createElement('div');
        item.className = 'multi-file-item';
        item.id = `upload-file-item-${idx}`;

        let parsedDate = '';
        let errorMsg = '';
        let isValid = true;

        try {
            if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                throw new Error("Format invalide (.xlsx, .xls)");
            }
            parsedDate = parseDateFromFilename(file.name);
        } catch (err) {
            errorMsg = err.message;
            isValid = false;
        }

        const dateParts = parsedDate.split('-');
        const formattedDateDisplay = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';

        item.innerHTML = `
            <span class="multi-file-name"><i class="fa-solid fa-file-excel" style="color: var(--neon-blue); margin-right: 0.5rem;"></i>${file.name}</span>
            ${isValid
                ? `<span class="multi-file-date"><i class="fa-solid fa-calendar" style="margin-right: 0.25rem;"></i><input type="date" class="cyber-input" data-idx="${idx}" value="${parsedDate}" style="padding: 0.2rem 0.4rem; font-size: 0.75rem; width: 140px; background: transparent; color: var(--text-main); border: 1px solid var(--border-color); border-radius: 3px;"></span>`
                : `<span class="multi-file-date" style="color: var(--neon-pink); font-size: 0.75rem;"><i class="fa-solid fa-triangle-exclamation" style="margin-right: 0.25rem;"></i>${errorMsg}</span>`
            }
            <span class="multi-file-status ${isValid ? 'pending' : 'fail'}" id="upload-file-status-${idx}">${isValid ? 'prêt' : 'erreur'}</span>
            <button type="button" class="cyber-btn-mini upload-remove-btn" data-idx="${idx}" style="padding: 0.2rem 0.45rem; background: transparent; border: 1px solid var(--neon-pink); color: var(--neon-pink); border-radius: 3px; cursor: pointer;" title="Retirer"><i class="fa-solid fa-xmark"></i></button>
        `;

        if (isValid) {
            uploadQueue.push({ file, date: parsedDate, index: idx });
            item.classList.add('pending');
        } else {
            item.classList.add('error');
        }

        list.appendChild(item);
    });

    // Bind date change handlers
    list.querySelectorAll('input[type="date"]').forEach(inp => {
        inp.addEventListener('change', (e) => {
            const i = parseInt(e.target.getAttribute('data-idx'), 10);
            const entry = uploadQueue.find(x => x.index === i);
            if (entry) entry.date = e.target.value;
        });
    });

    // Bind remove buttons
    list.querySelectorAll('.upload-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const i = parseInt(e.currentTarget.getAttribute('data-idx'), 10);
            uploadQueue = uploadQueue.filter(x => x.index !== i);
            const row = document.getElementById(`upload-file-item-${i}`);
            if (row) row.remove();
            if (submitBtn) submitBtn.disabled = uploadQueue.length === 0;
            if (uploadQueue.length === 0 && dropzone) dropzone.style.display = 'flex';
        });
    });

    container.style.display = 'block';
    if (submitBtn) submitBtn.disabled = uploadQueue.length === 0;
}

function resetUploadForm() {
    uploadQueue = [];
    const fileInput = document.getElementById('upload-file-input');
    const container = document.getElementById('upload-files-list-container');
    const list = document.getElementById('upload-files-list');
    const statusContainer = document.getElementById('upload-status-container');
    const submitBtn = document.getElementById('upload-submit-btn');
    const dropzone = document.getElementById('upload-dropzone');

    if (fileInput) fileInput.value = '';
    if (container) container.style.display = 'none';
    if (list) list.innerHTML = '';
    if (statusContainer) statusContainer.style.display = 'none';
    if (dropzone) dropzone.style.display = 'flex';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> IMPORTER ET RECALCULER';
    }
}

function fetchSuiviDates(callback) {
    fetch('/api/suivi_dates')
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                availableDates = (res.dates && res.dates.length > 0) ? res.dates : [];
                const dateSelect = document.getElementById('date-select');
                if (dateSelect) {
                    const currentVal = dateSelect.value;
                    dateSelect.innerHTML = '';
                    
                    if (res.dates && res.dates.length > 0) {
                        res.dates.forEach(d => {
                            const opt = document.createElement('option');
                            opt.value = d;
                            const parts = d.split('-');
                            const formatted = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : d;
                            opt.innerText = formatted;
                            dateSelect.appendChild(opt);
                        });
                        
                        // Select currentVal if it exists in the new list,
                        // otherwise default to the first (most recent) date.
                        if (currentVal && res.dates.includes(currentVal)) {
                            dateSelect.value = currentVal;
                        } else {
                            dateSelect.value = res.dates[0];
                        }
                    } else {
                        // Empty database state fallback
                        const opt = document.createElement('option');
                        opt.value = 'default';
                        opt.innerText = 'Aucune donnée';
                        dateSelect.appendChild(opt);
                        dateSelect.value = 'default';
                    }
                }
            }
            if (callback) callback();
        })
        .catch(err => {
            console.error("Error fetching dates:", err);
            if (callback) callback();
        });
}

function calculateRemainingWorkDays(dateStr) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 20;
    
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-indexed
    
    const lastDay = new Date(year, month + 1, 0).getDate();
    let remainingWorkDays = 0;
    const startDay = date.getDate();
    
    for (let d = startDay + 1; d <= lastDay; d++) {
        const checkDate = new Date(year, month, d);
        const dayOfWeek = checkDate.getDay(); // 0 = Sunday
        if (dayOfWeek !== 0) {
            remainingWorkDays++;
        }
    }
    return remainingWorkDays;
}

/* ----------------------------------------------------
   DETAILS VIEW TREND CHART CONTROLLERS
   ---------------------------------------------------- */
let detailsChartInstance = null;
let detailsQualiChartInstance = null;
let perDayQualiCharts = [];
let trendsData = null;
let excludedDates = [];

function initDetailsView() {
    const navDashboard = document.getElementById('nav-dashboard');
    const navDetails = document.getElementById('nav-details');
    const mainDashboard = document.getElementById('main-dashboard-container');
    const detailsContainer = document.getElementById('details-container');
    const backBtn = document.getElementById('back-to-dashboard-btn');
    const dateSelect = document.getElementById('date-select');
    
    if (navDetails && navDashboard && mainDashboard && detailsContainer) {
        navDetails.addEventListener('click', (e) => {
            e.preventDefault();
            navDashboard.classList.remove('active');
            navDetails.classList.add('active');
            mainDashboard.style.display = 'none';
            detailsContainer.style.display = 'block';
            if (dateSelect) dateSelect.style.display = 'none';

            // Show "loading" state immediately so the user knows data is being fetched
            const placeholder = document.getElementById('details-loading-placeholder');
            const chartCard = document.querySelector('.chart-card .chart-wrapper');
            if (placeholder) placeholder.style.display = 'flex';
            if (chartCard) chartCard.style.opacity = '0.4';

            // Wait one frame for layout to settle (canvas needs visible dimensions
            // before Chart.js can size itself), then load.
            requestAnimationFrame(() => {
                loadTrendsData();
            });
        });

        const goBack = (e) => {
            e.preventDefault();
            navDetails.classList.remove('active');
            navDashboard.classList.add('active');
            detailsContainer.style.display = 'none';
            mainDashboard.style.display = 'block';
            if (dateSelect) dateSelect.style.display = 'block';
        };

        navDashboard.addEventListener('click', goBack);
        if (backBtn) {
            backBtn.addEventListener('click', goBack);
        }
    }
    
    // Bind Details select filters
    const familySelect = document.getElementById('details-family-select');
    const vendeurSelect = document.getElementById('details-vendeur-select');
    
    if (familySelect) {
        familySelect.addEventListener('change', () => {
            const selectedFamily = familySelect.value;
            const badge = document.getElementById('details-family-badge');
            if (badge) badge.innerText = selectedFamily;
            loadTrendsData(selectedFamily);
        });
    }
    
    if (vendeurSelect) {
        vendeurSelect.addEventListener('change', () => {
            renderTrends();
        });
    }
    
    const excludeSelect = document.getElementById('details-exclude-date-select');
    if (excludeSelect) {
        excludeSelect.addEventListener('change', () => {
            const dateVal = excludeSelect.value;
            if (dateVal && !excludedDates.includes(dateVal)) {
                excludedDates.push(dateVal);
                updateExcludedDatesBadges();
                renderTrends();
                // Save to server config file
                saveAppConfig({ excluded_dates: excludedDates });
            }
            excludeSelect.value = '';
        });
    }

    // Bind Details J-1 toggle checkbox
    const j1Toggle = document.getElementById('details-j1-toggle');
    if (j1Toggle) {
        const savedState = localStorage.getItem('details-j1-toggle');
        if (savedState !== null) {
            j1Toggle.checked = savedState === 'true';
        }
        
        j1Toggle.addEventListener('change', () => {
            localStorage.setItem('details-j1-toggle', j1Toggle.checked);
            updateExcludedDatesBadges();
            renderTrends();
        });
    }
}


function loadTrendsData(family = 'C.A (ht)') {
    const familySelect = document.getElementById('details-family-select');

    const vendeurSelect = document.getElementById('details-vendeur-select');
    const categorySelect = document.getElementById('category-select');
    const category = categorySelect ? categorySelect.value : 'All';

    // Hide loading placeholder on success/error (the click handler set it visible)
    const hideLoading = () => {
        const ph = document.getElementById('details-loading-placeholder');
        const cw = document.querySelector('.chart-card .chart-wrapper');
        if (ph) ph.style.display = 'none';
        if (cw) cw.style.opacity = '1';
    };

    fetch(`/api/trends?family=${encodeURIComponent(family)}&category=${encodeURIComponent(category)}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                trendsData = data;

                // Populate Family Select dropdown if it has only one option
                if (familySelect && familySelect.options.length <= 1 && data.families.length > 0) {
                    const currentVal = familySelect.value;
                    familySelect.innerHTML = '';
                    data.families.forEach(f => {
                        const opt = document.createElement('option');
                        opt.value = f;
                        opt.innerText = f;
                        familySelect.appendChild(opt);
                    });
                    familySelect.value = currentVal || 'C.A (ht)';
                }

                // Populate Vendeur Select dropdown
                if (vendeurSelect) {
                    const selectedVendeur = vendeurSelect.value || 'all';
                    vendeurSelect.innerHTML = '<option value="all">TOUS LES VENDEURS</option>';
                    data.vendeurs.forEach(v => {
                        const opt = document.createElement('option');
                        opt.value = v;
                        opt.innerText = v;
                        vendeurSelect.appendChild(opt);
                    });
                    if (data.vendeurs.includes(selectedVendeur)) {
                        vendeurSelect.value = selectedVendeur;
                    } else {
                        vendeurSelect.value = 'all';
                    }
                }

                // Populate Exclude Date select dropdown and badges
                updateExcludedDatesBadges();
                renderTrends();
                hideLoading();
            } else {
                hideLoading();
                showToast("Erreur lors de la récupération de l'historique: " + data.message, "error");
            }
        })
        .catch(err => {
            console.error("Error fetching trends:", err);
            hideLoading();
            showToast("Erreur de connexion au serveur", "error");
        });
}

function getTodayStr() {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function updateExcludedDatesBadges() {
    const container = document.getElementById('excluded-dates-badges');
    if (!container) return;
    container.innerHTML = '';
    
    const j1Toggle = document.getElementById('details-j1-toggle');
    const isJ1 = j1Toggle && j1Toggle.checked;
    const todayStr = getTodayStr();
    
    excludedDates.forEach(d => {
        const targetDate = isJ1 ? shiftDateString(d, -1) : d;
        let formattedDate;
        if (isJ1 && targetDate === todayStr) {
            formattedDate = "En cours";
        } else {
            const parts = targetDate.split('-');
            formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : targetDate;
        }
        
        const badge = document.createElement('span');
        badge.className = 'badge-pink';
        badge.style.cssText = "display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0.5rem; border-radius: 4px; font-family: 'JetBrains Mono', monospace; font-size: 0.8rem; background: rgba(255, 45, 85, 0.15); border: 1px solid var(--neon-pink); color: var(--neon-pink);";
        badge.innerHTML = `
            <span>${formattedDate}</span>
            <button class="remove-exclude-btn" data-date="${d}" style="background: transparent; border: none; color: inherit; cursor: pointer; font-size: 1.1rem; padding: 0; line-height: 1; display: flex; align-items: center; justify-content: center; font-weight: bold;" title="Ne plus exclure">&times;</button>
        `;
        
        badge.querySelector('.remove-exclude-btn').addEventListener('click', (e) => {
            const dateToRemove = e.currentTarget.getAttribute('data-date');
            excludedDates = excludedDates.filter(x => x !== dateToRemove);
            updateExcludedDatesBadges();
            
            // Save to server config file
            saveAppConfig({ excluded_dates: excludedDates });
            
            renderTrends();
        });
        
        container.appendChild(badge);
    });
    
    // Also update the select options since a date was just excluded/restored
    const excludeSelect = document.getElementById('details-exclude-date-select');
    if (excludeSelect && trendsData) {
        excludeSelect.innerHTML = '<option value="">-- CHOISIR POUR EXCLURE --</option>';
        trendsData.dates.forEach(dt => {
            if (!excludedDates.includes(dt)) {
                const opt = document.createElement('option');
                opt.value = dt;
                const targetDt = isJ1 ? shiftDateString(dt, -1) : dt;
                let text;
                if (isJ1 && targetDt === todayStr) {
                    text = "En cours";
                } else {
                    const parts = targetDt.split('-');
                    text = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : targetDt;
                }
                opt.innerText = text;
                excludeSelect.appendChild(opt);
            }
        });
    }
}

function shiftDateString(dateStr, days = -1) {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);
    const d = new Date(year, month, day);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

function renderTrends() {
    if (!trendsData) return;
    
    const canvas = document.getElementById('details-trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (detailsChartInstance) {
        detailsChartInstance.destroy();
    }
    
    const selectedVendeur = document.getElementById('details-vendeur-select').value;
    const dates = trendsData.dates.filter(d => !excludedDates.includes(d));
    const j1Toggle = document.getElementById('details-j1-toggle');
    
    // Format dates to DD/MM/YYYY for chart display
    const isJ1 = j1Toggle && j1Toggle.checked;
    const todayStr = getTodayStr();
    const formattedLabels = dates.map(d => {
        const targetDate = isJ1 ? shiftDateString(d, -1) : d;
        if (isJ1 && targetDate === todayStr) {
            return "En cours";
        }
        const parts = targetDate.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : targetDate;
    });
    
    // Resolve theme variables dynamically
    const styles = getComputedStyle(document.body);
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
    const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);
    const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);
    const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);

    // ---- Temporal line plugin: vertical marker at today's date ----
    const todayIndex = formattedLabels.findIndex((lbl, i) => {
        const rawDate = dates[i];
        const targetDate = isJ1 ? shiftDateString(rawDate, -1) : rawDate;
        return targetDate === todayStr;
    });
    const todayLinePlugin = {
        id: 'todayLine',
        afterDraw(chart) {
            if (todayIndex < 0) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data[todayIndex]) return;
            const x = meta.data[todayIndex].x;
            const { top, bottom } = chart.chartArea;
            const ctx2 = chart.ctx;
            ctx2.save();
            // Glow shadow
            ctx2.shadowColor = neonAmber;
            ctx2.shadowBlur = 12;
            ctx2.beginPath();
            ctx2.setLineDash([5, 4]);
            ctx2.moveTo(x, top);
            ctx2.lineTo(x, bottom);
            ctx2.strokeStyle = neonAmber;
            ctx2.lineWidth = 2;
            ctx2.stroke();
            ctx2.setLineDash([]);
            ctx2.shadowBlur = 0;
            // Label badge
            const label = isJ1 ? 'Hier' : "Aujourd'hui";
            ctx2.font = 'bold 10px JetBrains Mono, monospace';
            const tw = ctx2.measureText(label).width;
            const bx = x - tw / 2 - 6;
            const by = top + 4;
            const bw = tw + 12;
            const bh = 18;
            ctx2.fillStyle = neonAmber + 'dd';
            ctx2.beginPath();
            ctx2.roundRect(bx, by, bw, bh, 4);
            ctx2.fill();
            ctx2.fillStyle = '#000';
            ctx2.fillText(label, bx + 6, by + 13);
            ctx2.restore();
        }
    };
    
    const vendeursList = selectedVendeur === 'all' 
        ? trendsData.vendeurs 
        : [selectedVendeur];
        
    const realPoints = [];
    const objPoints = [];
    const pctPoints = [];
    const encoursPoints = [];
    
    dates.forEach((d) => {
        const dIdx = trendsData.dates.indexOf(d);
        if (dIdx === -1) return;
        
        let totalReal = 0;
        let totalObj = 0;
        let totalEncours = 0;
        
        vendeursList.forEach(v => {
            const vData = trendsData.trends[v] || [];
            const pt = vData[dIdx];
            if (pt) {
                totalReal += pt.real;
                totalObj += pt.obj;
                totalEncours += pt.encours || 0;
            }
        });
        
        const pct = totalObj > 0 ? Math.round((totalReal / totalObj) * 100) - 100 : 0;
        realPoints.push(totalReal);
        objPoints.push(totalObj);
        pctPoints.push(pct);
        encoursPoints.push(totalEncours);
    });
    


    let datasets = [];

    if (isJ1) {
        datasets.push({
            type: 'bar',
            label: 'Encours (DH)',
            data: encoursPoints,
            backgroundColor: neonAmber + '80', // 50% opacity fill
            borderColor: neonAmber,
            borderWidth: 1.5,
            borderRadius: 4,
            borderSkipped: 'bottom',
            yAxisID: 'y'
        });
    } else {
        datasets.push(
            {
                type: 'bar',
                label: 'Réalisé (DH)',
                data: realPoints,
                backgroundColor: neonBlue + '80', // 50% opacity fill
                borderColor: neonBlue,
                borderWidth: 1.5,
                borderRadius: 4,
                borderSkipped: 'bottom',
                yAxisID: 'y'
            },
            {
                type: 'bar',
                label: 'Objectif (DH)',
                data: objPoints,
                backgroundColor: isWhiteMode ? 'rgba(71, 85, 105, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                borderColor: isWhiteMode ? '#475569' : '#94a3b8',
                borderWidth: 1.5,
                borderRadius: 4,
                borderSkipped: 'bottom',
                yAxisID: 'y'
            },
            {
                type: 'line',
                label: 'Taux de Réalisation (%)',
                data: pctPoints,
                borderColor: neonPink,
                backgroundColor: 'transparent',
                borderWidth: 3,
                pointBackgroundColor: neonPink,
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.2,
                yAxisID: 'y1'
            }
        );
    }
    
    detailsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: formattedLabels,
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: isWhiteMode ? '#475569' : '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    min: 0,
                    grid: { color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: isWhiteMode ? '#475569' : '#64748b',
                        font: { family: 'JetBrains Mono', size: 10 },
                        callback: function(value) {
                            return formatNumber(value) + ' DH';
                        }
                    }
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    display: !isJ1,
                    grid: { drawOnChartArea: false },
                    ticks: {
                        color: isWhiteMode ? '#475569' : '#64748b',
                        font: { family: 'JetBrains Mono', size: 10 },
                        callback: function(value) {
                            return (value > 0 ? '+' : '') + value + '%';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: isWhiteMode ? '#1e293b' : '#e2e8f0',
                        font: { family: 'Inter', weight: 'bold', size: 11 },
                        boxWidth: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const datasetLabel = context.dataset.label || '';
                            const val = context.parsed.y;
                            if (datasetLabel.includes('%')) {
                                return `${datasetLabel} : ${(val > 0 ? '+' : '')}${val}%`;
                            }
                            return `${datasetLabel} : ${formatNumber(val)} DH`;
                        }
                    }
                }
            }
        },
        plugins: [todayLinePlugin, {
            id: 'zeroLine',
            afterDraw(chart) {
                if (isJ1) return;
                const y1 = chart.scales.y1;
                if (!y1) return;
                const yPx = y1.getPixelForValue(0);
                if (yPx < chart.chartArea.top || yPx > chart.chartArea.bottom) return;
                const c = chart.ctx;
                c.save();
                c.shadowColor = neonGreen;
                c.shadowBlur = 8;
                c.beginPath();
                c.moveTo(chart.chartArea.left, yPx);
                c.lineTo(chart.chartArea.right, yPx);
                c.strokeStyle = neonGreen;
                c.lineWidth = 2;
                c.setLineDash([]);
                c.stroke();
                c.shadowBlur = 0;
                // Badge label on right
                c.font = 'bold 10px JetBrains Mono, monospace';
                const txt = '0%';
                const tw = c.measureText(txt).width;
                const bx = chart.chartArea.right + 4;
                const by = yPx - 9;
                c.fillStyle = neonGreen + 'dd';
                c.beginPath();
                c.roundRect(bx, by, tw + 10, 18, 4);
                c.fill();
                c.fillStyle = '#000';
                c.fillText(txt, bx + 5, by + 13);
                c.restore();
            }
        }]
    });
    
    // Populate raw data table
    populateTrendsTable(vendeursList);
    
    // Render Qualitative trends chart and table
    renderQualiTrends(vendeursList);
}

function renderQualiTrends(vendeursList) {
    if (!trendsData || !trendsData.qualitative_trends) return;
    
    const canvas = document.getElementById('details-quali-trend-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (detailsQualiChartInstance) {
        detailsQualiChartInstance.destroy();
    }
    
    const dates = trendsData.dates.filter(d => !excludedDates.includes(d));
    const j1Toggle = document.getElementById('details-j1-toggle');
    const isJ1 = j1Toggle && j1Toggle.checked;
    const todayStr = getTodayStr();
    
    const formattedLabels = dates.map(d => {
        const targetDate = isJ1 ? shiftDateString(d, -1) : d;
        if (isJ1 && targetDate === todayStr) {
            return "En cours";
        }
        const parts = targetDate.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : targetDate;
    });
    
    const acmPoints = [];
    const tsmPoints = [];
    const linePoints = [];
    
    dates.forEach(d => {
        const dIdx = trendsData.dates.indexOf(d);
        if (dIdx === -1) return;
        
        let sumAcm = 0;
        let sumTsm = 0;
        let sumLine = 0;
        let count = 0;
        
        vendeursList.forEach(v => {
            const vQuali = trendsData.qualitative_trends[v] || [];
            const pt = vQuali[dIdx];
            if (pt) {
                sumAcm += pt.acm;
                sumTsm += pt.tsm;
                sumLine += pt.line;
                count++;
            }
        });
        
        if (count > 0) {
            acmPoints.push(parseFloat((sumAcm / count).toFixed(1)));
            tsmPoints.push(parseFloat((sumTsm / count).toFixed(1)));
            linePoints.push(parseFloat((sumLine / count).toFixed(1)));
        } else {
            acmPoints.push(0);
            tsmPoints.push(0);
            linePoints.push(0);
        }
    });
    
    const styles = getComputedStyle(document.body);
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
    const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);
    const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);
    
    const todayIndex = formattedLabels.findIndex((lbl, i) => {
        const rawDate = dates[i];
        const targetDate = isJ1 ? shiftDateString(rawDate, -1) : rawDate;
        return targetDate === todayStr;
    });
    const qualiTodayLinePlugin = {
        id: 'qualiTodayLine',
        afterDraw(chart) {
            if (todayIndex < 0) return;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data || !meta.data[todayIndex]) return;
            const x = meta.data[todayIndex].x;
            const { top, bottom } = chart.chartArea;
            const ctx2 = chart.ctx;
            ctx2.save();
            ctx2.shadowColor = neonAmber;
            ctx2.shadowBlur = 12;
            ctx2.beginPath();
            ctx2.setLineDash([5, 4]);
            ctx2.moveTo(x, top);
            ctx2.lineTo(x, bottom);
            ctx2.strokeStyle = neonAmber;
            ctx2.lineWidth = 2;
            ctx2.stroke();
            ctx2.setLineDash([]);
            ctx2.shadowBlur = 0;
            // Label badge
            const label = isJ1 ? 'Hier' : "Aujourd'hui";
            ctx2.font = 'bold 10px JetBrains Mono, monospace';
            const tw = ctx2.measureText(label).width;
            const bx = x - tw / 2 - 6;
            const by = top + 4;
            ctx2.fillStyle = neonAmber + 'dd';
            ctx2.beginPath();
            ctx2.roundRect(bx, by, tw + 12, 18, 4);
            ctx2.fill();
            ctx2.fillStyle = '#000';
            ctx2.fillText(label, bx + 6, by + 13);
            ctx2.restore();
        }
    };

    // Plugin: draw prorata % value as a badge on right edge of the line
    const qualiProrataLabelPlugin = {
        id: 'qualiProrataLabel',
        afterDraw(chart) {
            const elapsed = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.elapsed : 5;
            const total   = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.total   : 24;
            const prorataVal = parseFloat(((elapsed / total) * 100).toFixed(1));
            const yScale = chart.scales.y;
            if (!yScale) return;
            const yPx = yScale.getPixelForValue(prorataVal);
            if (yPx < chart.chartArea.top || yPx > chart.chartArea.bottom) return;
            const c = chart.ctx;
            c.save();
            c.font = 'bold 10px JetBrains Mono, monospace';
            const txt = `${prorataVal}%`;
            const tw = c.measureText(txt).width;
            const bx = chart.chartArea.right - tw - 14;
            const by = yPx - 10;
            c.fillStyle = neonAmber + 'ee';
            c.beginPath();
            c.roundRect(bx, by, tw + 12, 18, 4);
            c.fill();
            c.fillStyle = '#000';
            c.fillText(txt, bx + 6, by + 13);
            c.restore();
        }
    };
    
    detailsQualiChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: formattedLabels,
            datasets: [
                {
                    label: 'ACM (%)',
                    data: acmPoints,
                    borderColor: neonBlue,
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    pointBackgroundColor: neonBlue,
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    tension: 0.15
                },
                {
                    label: 'TSM (%)',
                    data: tsmPoints,
                    borderColor: neonAmber,
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    pointBackgroundColor: neonAmber,
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    tension: 0.15
                },
                {
                    label: 'LINE (%)',
                    data: linePoints,
                    borderColor: neonGreen,
                    backgroundColor: 'transparent',
                    borderWidth: 2.5,
                    pointBackgroundColor: neonGreen,
                    pointBorderColor: '#fff',
                    pointRadius: 4,
                    tension: 0.15
                },
                {
                    label: (() => {
                        const el = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.elapsed : 5;
                        const to = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.total   : 24;
                        return `Prorata ${parseFloat(((el/to)*100).toFixed(1))}% (${el}j/${to}j)`;
                    })(),
                    data: (() => {
                        const elapsed = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.elapsed : 5;
                        const total   = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.total   : 24;
                        const prorata = parseFloat(((elapsed / total) * 100).toFixed(2));
                        return formattedLabels.map(() => prorata);
                    })(),
                    borderColor: neonAmber,
                    backgroundColor: neonAmber + '18',
                    borderWidth: 2.5,
                    borderDash: [8, 4],
                    pointRadius: 0,
                    pointHoverRadius: 3,
                    tension: 0,
                    fill: false,
                    spanGaps: false
                },
                {
                    label: 'Objectif 100%',
                    data: formattedLabels.map(() => 100),
                    borderColor: (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7),
                    backgroundColor: 'transparent',
                    borderWidth: 1.5,
                    borderDash: [3, 3],
                    pointRadius: 0,
                    pointHoverRadius: 0,
                    tension: 0,
                    fill: false
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    grid: { color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: isWhiteMode ? '#475569' : '#64748b', font: { family: 'JetBrains Mono', size: 10 } }
                },
                y: {
                    min: 0,
                    grid: { color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)' },
                    ticks: {
                        color: isWhiteMode ? '#475569' : '#64748b',
                        font: { family: 'JetBrains Mono', size: 10 },
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: isWhiteMode ? '#1e293b' : '#e2e8f0',
                        font: { family: 'Inter', weight: 'bold', size: 11 },
                        boxWidth: 15
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.dataset.label} : ${context.parsed.y}%`;
                        }
                    }
                }
            }
        },
        plugins: [qualiTodayLinePlugin, qualiProrataLabelPlugin]
    });
    
    populateQualiTrendsTable(vendeursList);
    renderPerDayQualiSections(vendeursList);
}

function populateQualiTrendsTable(vendeursList) {
    const tableBody = document.querySelector('#details-quali-trend-table tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    const dates = trendsData.dates.filter(d => !excludedDates.includes(d));
    const j1Toggle = document.getElementById('details-j1-toggle');
    const isJ1 = j1Toggle && j1Toggle.checked;
    const todayStr = getTodayStr();
    
    const rows = [];
    dates.forEach(d => {
        vendeursList.forEach(v => {
            const vQuali = trendsData.qualitative_trends[v] || [];
            const pt = vQuali.find(pt => pt.date === d);
            if (pt) {
                rows.push({
                    date: d,
                    vendeur: v,
                    clt_programme: pt.clt_programme,
                    clt_facture: pt.clt_facture,
                    acm: pt.acm,
                    tsm: pt.tsm,
                    line: pt.line,
                    raf_tsm: pt.raf_tsm,
                    raf_acm: pt.raf_acm
                });
            }
        });
    });
    
    // Sort rows by date asc, then vendeur asc
    rows.sort((a, b) => {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }
        return a.vendeur.localeCompare(b.vendeur);
    });
    
    rows.forEach(r => {
        const tr = document.createElement('tr');
        const targetDate = isJ1 ? shiftDateString(r.date, -1) : r.date;
        let formattedDate;
        if (isJ1 && targetDate === todayStr) {
            formattedDate = "En cours";
        } else {
            const parts = targetDate.split('-');
            formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : targetDate;
        }
        
        tr.innerHTML = `
            <td><strong>${formattedDate}</strong></td>
            <td><strong>${r.vendeur}</strong></td>
            <td>${r.clt_programme}</td>
            <td>${r.clt_facture}</td>
            <td class="neon-text-blue">${r.acm.toFixed(1)}%</td>
            <td class="neon-text-amber">${r.tsm.toFixed(1)}%</td>
            <td class="neon-text-green">${r.line.toFixed(1)}%</td>
            <td class="neon-text-pink">${r.raf_tsm}</td>
            <td class="neon-text-pink">${r.raf_acm}</td>
        `;
        tableBody.appendChild(tr);
    });
    
    if (rows.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="9" style="text-align:center;">Aucune donnée disponible pour cette sélection</td></tr>`;
    }
}

function renderPerDayQualiSections(vendeursList) {
    // Destroy old per-day chart instances
    perDayQualiCharts.forEach(c => { try { c.destroy(); } catch(e) {} });
    perDayQualiCharts = [];

    const container = document.getElementById('details-per-day-quali');
    if (!container) return;
    container.innerHTML = '';

    // Update section title
    const titleEl = document.getElementById('per-day-quali-title');
    if (titleEl) {
        if (vendeursList.length === 1) {
            titleEl.innerHTML = `<i class="fa-solid fa-chart-line neon-text-green"></i> ÉVOLUTION QUALITATIVE — ${vendeursList[0]}`;
        } else {
            titleEl.innerHTML = `<i class="fa-solid fa-calendar-days neon-text-amber"></i> ANALYSE QUALITATIVE PAR JOUR`;
        }
    }

    if (!trendsData || !trendsData.qualitative_trends) return;

    const dates = trendsData.dates.filter(d => !excludedDates.includes(d));
    if (dates.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted); font-family: JetBrains Mono, monospace; font-size:0.85rem;">Aucune donnée disponible.</p>';
        return;
    }

    const j1Toggle = document.getElementById('details-j1-toggle');
    const isJ1 = j1Toggle && j1Toggle.checked;
    const todayStr = getTodayStr();

    const styles = getComputedStyle(document.body);
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff');
    const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030');
    const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17');
    const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d9a');
    const textMain = isWhiteMode ? '#1e293b' : '#e2e8f0';
    const textMuted = isWhiteMode ? '#475569' : '#64748b';
    const gridColor = isWhiteMode ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';

    // ── SINGLE VENDEUR MODE: timeline line chart ──────────────────────────
    if (vendeursList.length === 1) {
        const v = vendeursList[0];
        const vQuali = trendsData.qualitative_trends[v] || [];

        const labels = [];
        const acmData = [], tsmData = [], lineData = [];
        const tableRows = [];

        dates.forEach((d, di) => {
            const dIdx = trendsData.dates.indexOf(d);
            const targetDate = isJ1 ? shiftDateString(d, -1) : d;
            let lbl;
            if (isJ1 && targetDate === todayStr) { lbl = 'En cours'; }
            else { const p = targetDate.split('-'); lbl = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : targetDate; }

            labels.push(lbl);
            const pt = vQuali[dIdx];
            if (pt) {
                acmData.push(parseFloat(pt.acm.toFixed(1)));
                tsmData.push(parseFloat(pt.tsm.toFixed(1)));
                lineData.push(parseFloat(pt.line.toFixed(1)));
                tableRows.push({ lbl, pt });
            } else {
                acmData.push(null);
                tsmData.push(null);
                lineData.push(null);
            }
        });

        // --- today line plugin ---
        const todayIdx = labels.findIndex((lbl, i) => {
            const rawDate = dates[i];
            const td = isJ1 ? shiftDateString(rawDate, -1) : rawDate;
            return td === todayStr;
        });
        const singleTodayPlugin = {
            id: 'singleTodayLine',
            afterDraw(chart) {
                if (todayIdx < 0) return;
                const meta = chart.getDatasetMeta(0);
                if (!meta || !meta.data || !meta.data[todayIdx]) return;
                const x = meta.data[todayIdx].x;
                const { top, bottom } = chart.chartArea;
                const c = chart.ctx;
                c.save();
                c.shadowColor = neonAmber; c.shadowBlur = 12;
                c.beginPath(); c.setLineDash([5, 4]);
                c.moveTo(x, top); c.lineTo(x, bottom);
                c.strokeStyle = neonAmber; c.lineWidth = 2; c.stroke();
                c.setLineDash([]); c.shadowBlur = 0;
                const lbl2 = isJ1 ? 'Hier' : "Aujourd'hui";
                c.font = 'bold 10px JetBrains Mono, monospace';
                const tw = c.measureText(lbl2).width;
                const bx = x - tw / 2 - 6, by = top + 4;
                c.fillStyle = neonAmber + 'dd';
                c.beginPath(); c.roundRect(bx, by, tw + 12, 18, 4); c.fill();
                c.fillStyle = '#000'; c.fillText(lbl2, bx + 6, by + 13);
                c.restore();
            }
        };

        // Build DOM
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display: flex; flex-direction: column; gap: 1.25rem;';

        // Chart
        const chartWrap = document.createElement('div');
        chartWrap.style.cssText = 'width: 100%; height: 320px; position: relative;';
        const canvas = document.createElement('canvas');
        chartWrap.appendChild(canvas);
        wrap.appendChild(chartWrap);

        // Table
        const tableWrap = document.createElement('div');
        tableWrap.className = 'table-container';
        tableWrap.style.cssText = 'overflow-x: auto;';
        let tHtml = `<table class="cyber-table" style="font-size:0.82rem;">
            <thead><tr>
                <th>Date</th>
                <th>Clt Prog</th><th>Clt Fact</th>
                <th style="color:${neonBlue}">ACM (%)</th>
                <th style="color:${neonAmber}">TSM (%)</th>
                <th style="color:${neonGreen}">LINE (%)</th>
                <th style="color:${neonPink}">RAF TSM</th>
                <th style="color:${neonPink}">RAF ACM</th>
            </tr></thead><tbody>`;
        tableRows.forEach(r => {
            const ac = r.pt.acm >= 80 ? neonGreen : r.pt.acm >= 60 ? neonAmber : neonPink;
            const ts = r.pt.tsm >= 80 ? neonGreen : r.pt.tsm >= 60 ? neonAmber : neonPink;
            const li = r.pt.line >= 80 ? neonGreen : r.pt.line >= 60 ? neonAmber : neonPink;
            tHtml += `<tr>
                <td><strong>${r.lbl}</strong></td>
                <td>${r.pt.clt_programme}</td><td>${r.pt.clt_facture}</td>
                <td style="color:${ac};font-weight:700">${r.pt.acm.toFixed(1)}%</td>
                <td style="color:${ts};font-weight:700">${r.pt.tsm.toFixed(1)}%</td>
                <td style="color:${li};font-weight:700">${r.pt.line.toFixed(1)}%</td>
                <td style="color:${neonPink}">${r.pt.raf_tsm}</td>
                <td style="color:${neonPink}">${r.pt.raf_acm}</td>
            </tr>`;
        });
        tHtml += `</tbody></table>`;
        tableWrap.innerHTML = tHtml;
        wrap.appendChild(tableWrap);
        container.appendChild(wrap);

        // Render line chart
        requestAnimationFrame(() => {
            const allVals = [...acmData, ...tsmData, ...lineData].filter(x => x !== null);
            const dataMax = Math.max(...allVals, 0);
            const yMax = Math.ceil(Math.max(dataMax * 1.12, 100) / 10) * 10;

            // Horizontal prorata line: (jours_écoulés / total_jours) * 100
            const elapsedDays = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.elapsed : 5;
            const totalDays   = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.total   : 24;
            const prorataVal  = parseFloat(((elapsedDays / totalDays) * 100).toFixed(2));
            const prorataVisible = labels.map(() => prorataVal);

            const chartObj = new Chart(canvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels,
                    datasets: [
                        {
                            label: 'ACM (%)',
                            data: acmData,
                            borderColor: neonBlue,
                            backgroundColor: neonBlue + '20',
                            borderWidth: 2.5,
                            pointBackgroundColor: acmData.map(v => v !== null && v >= 80 ? neonGreen : v !== null && v >= 60 ? neonAmber : neonPink),
                            pointBorderColor: '#fff',
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            tension: 0.3,
                            fill: false,
                            spanGaps: true
                        },
                        {
                            label: 'TSM (%)',
                            data: tsmData,
                            borderColor: neonAmber,
                            backgroundColor: neonAmber + '20',
                            borderWidth: 2.5,
                            pointBackgroundColor: tsmData.map(v => v !== null && v >= 80 ? neonGreen : v !== null && v >= 60 ? neonAmber : neonPink),
                            pointBorderColor: '#fff',
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            tension: 0.3,
                            fill: false,
                            spanGaps: true
                        },
                        {
                            label: 'LINE (%)',
                            data: lineData,
                            borderColor: neonGreen,
                            backgroundColor: neonGreen + '20',
                            borderWidth: 2.5,
                            pointBackgroundColor: lineData.map(v => v !== null && v >= 80 ? neonGreen : v !== null && v >= 60 ? neonAmber : neonPink),
                            pointBorderColor: '#fff',
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            tension: 0.3,
                            fill: false,
                            spanGaps: true
                        },
                        {
                            label: `Prorata ${prorataVal.toFixed(1)}% (${elapsedDays}j/${totalDays}j)`,
                            data: prorataVisible,
                            borderColor: neonAmber,
                            backgroundColor: neonAmber + '18',
                            borderWidth: 2.5,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            tension: 0,
                            fill: false,
                            spanGaps: false,
                            borderDash: [8, 4]
                        },
                        {
                            label: 'Objectif 100%',
                            data: labels.map(() => 100),
                            borderColor: neonPink,
                            backgroundColor: 'transparent',
                            borderWidth: 1.5,
                            pointRadius: 0,
                            pointHoverRadius: 0,
                            tension: 0,
                            fill: false,
                            borderDash: [3, 3]
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textMuted, font: { family: 'JetBrains Mono', size: 10 }, maxRotation: 45 }
                        },
                        y: {
                            min: 0,
                            max: yMax,
                            grid: { color: gridColor },
                            ticks: {
                                color: textMuted,
                                font: { family: 'JetBrains Mono', size: 10 },
                                callback: val => val + '%'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { color: textMain, font: { family: 'Inter', size: 12, weight: 'bold' }, boxWidth: 16, padding: 16 }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => `${ctx.dataset.label} : ${ctx.parsed.y !== null ? ctx.parsed.y + '%' : 'N/A'}`
                            }
                        }
                    },
                    animation: { duration: 500 }
                },
                plugins: [singleTodayPlugin, {
                    id: 'singleProrataLabel',
                    afterDraw(chart) {
                        const yScale = chart.scales.y;
                        if (!yScale) return;
                        const yPx = yScale.getPixelForValue(prorataVal);
                        if (yPx < chart.chartArea.top || yPx > chart.chartArea.bottom) return;
                        const c = chart.ctx;
                        c.save();
                        c.font = 'bold 10px JetBrains Mono, monospace';
                        const txt = `${prorataVal.toFixed(1)}%`;
                        const tw = c.measureText(txt).width;
                        const bx = chart.chartArea.right - tw - 14;
                        const by = yPx - 10;
                        c.fillStyle = neonAmber + 'ee';
                        c.beginPath();
                        c.roundRect(bx, by, tw + 12, 18, 4);
                        c.fill();
                        c.fillStyle = '#000';
                        c.fillText(txt, bx + 6, by + 13);
                        c.restore();
                    }
                }]
            });
            perDayQualiCharts.push(chartObj);
        });
        return; // skip per-day accordion for single vendeur
    }
    // ── END SINGLE VENDEUR MODE ───────────────────────────────────────────

    dates.forEach((d, di) => {
        const dIdx = trendsData.dates.indexOf(d);
        if (dIdx === -1) return;

        const targetDate = isJ1 ? shiftDateString(d, -1) : d;
        let label;
        if (isJ1 && targetDate === todayStr) {
            label = 'En cours';
        } else {
            const p = targetDate.split('-');
            label = p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : targetDate;
        }

        // Gather per-vendeur data for this day
        const vendeurLabels = [];
        const acmData = [];
        const tsmData = [];
        const lineData = [];
        const rows = [];

        vendeursList.forEach(v => {
            const vQuali = trendsData.qualitative_trends[v] || [];
            const pt = vQuali[dIdx];
            if (pt && (pt.clt_programme > 0 || pt.clt_facture > 0 || pt.acm > 0 || pt.tsm > 0 || pt.line > 0)) {
                vendeurLabels.push(v);
                acmData.push(parseFloat(pt.acm.toFixed(1)));
                tsmData.push(parseFloat(pt.tsm.toFixed(1)));
                lineData.push(parseFloat(pt.line.toFixed(1)));
                rows.push({ v, pt });
            }
        });

        if (rows.length === 0) return; // skip days with no data

        // Build DOM: collapsible section
        const uniqueId = `pday-${di}`;
        const section = document.createElement('div');
        section.className = 'per-day-quali-section';
        section.style.cssText = 'border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; transition: box-shadow 0.2s;';

        // Header (clickable toggle)
        const header = document.createElement('div');
        header.style.cssText = `display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; cursor: pointer;
            background: ${isWhiteMode ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'};
            border-bottom: 1px solid var(--border-color); user-select: none;`;
        header.innerHTML = `
            <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; font-weight: 700; color: var(--neon-amber);">
                <i class="fa-solid fa-calendar-day" style="margin-right: 0.5rem;"></i>${label}
            </span>
            <span style="display: flex; gap: 1.25rem; align-items: center;">
                <span style="font-family: 'JetBrains Mono', monospace; font-size: 0.78rem; color: ${textMuted};">
                    ${rows.length} vendeur${rows.length > 1 ? 's' : ''}
                </span>
                <i class="fa-solid fa-chevron-down pday-toggle-icon" id="icon-${uniqueId}" style="color: var(--neon-blue); transition: transform 0.25s;"></i>
            </span>`;

        // Content (chart + table)
        const content = document.createElement('div');
        content.id = `content-${uniqueId}`;
        content.style.cssText = 'display: flex; flex-direction: column; gap: 1rem; padding: 1rem 1.25rem; transition: all 0.25s ease;';

        // Chart canvas
        const chartWrap = document.createElement('div');
        chartWrap.style.cssText = 'width: 100%; height: 240px; position: relative;';
        const canvas = document.createElement('canvas');
        canvas.id = `chart-${uniqueId}`;
        chartWrap.appendChild(canvas);
        content.appendChild(chartWrap);

        // Table
        const tableWrap = document.createElement('div');
        tableWrap.className = 'table-container';
        tableWrap.style.cssText = 'overflow-x: auto;';
        let tHtml = `<table class="cyber-table" style="font-size: 0.82rem;">
            <thead><tr>
                <th>Vendeur</th>
                <th>Clt Prog</th>
                <th>Clt Fact</th>
                <th style="color: ${neonBlue};">ACM (%)</th>
                <th style="color: ${neonAmber};">TSM (%)</th>
                <th style="color: ${neonGreen};">LINE (%)</th>
                <th style="color: ${neonPink};">RAF TSM</th>
                <th style="color: ${neonPink};">RAF ACM</th>
            </tr></thead><tbody>`;
        rows.forEach(r => {
            const acmBadge = r.pt.acm >= 80 ? neonGreen : r.pt.acm >= 60 ? neonAmber : neonPink;
            const tsmBadge = r.pt.tsm >= 80 ? neonGreen : r.pt.tsm >= 60 ? neonAmber : neonPink;
            const lineBadge = r.pt.line >= 80 ? neonGreen : r.pt.line >= 60 ? neonAmber : neonPink;
            tHtml += `<tr>
                <td><strong>${r.v}</strong></td>
                <td>${r.pt.clt_programme}</td>
                <td>${r.pt.clt_facture}</td>
                <td style="color:${acmBadge}; font-weight:700;">${r.pt.acm.toFixed(1)}%</td>
                <td style="color:${tsmBadge}; font-weight:700;">${r.pt.tsm.toFixed(1)}%</td>
                <td style="color:${lineBadge}; font-weight:700;">${r.pt.line.toFixed(1)}%</td>
                <td style="color:${neonPink};">${r.pt.raf_tsm}</td>
                <td style="color:${neonPink};">${r.pt.raf_acm}</td>
            </tr>`;
        });
        tHtml += `</tbody></table>`;
        tableWrap.innerHTML = tHtml;
        content.appendChild(tableWrap);

        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);

        // Toggle collapse
        let isOpen = true;
        header.addEventListener('click', () => {
            isOpen = !isOpen;
            content.style.display = isOpen ? 'flex' : 'none';
            const icon = document.getElementById(`icon-${uniqueId}`);
            if (icon) icon.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(-90deg)';
        });

        // Render bar chart
        requestAnimationFrame(() => {
            const ctx2 = canvas.getContext('2d');
            const allVals = [...acmData, ...tsmData, ...lineData];
            const dataMax = Math.max(...allVals, 0);
            const yMax = Math.ceil(Math.max(dataMax * 1.12, 10) / 10) * 10; // 12% headroom, round to nearest 10

            // Plugin: draw horizontal 100% reference line
            const refLinePlugin = {
                id: `refLine-${uniqueId}`,
                afterDraw(chart) {
                    const yScale = chart.scales.y;
                    if (!yScale) return;
                    const y100 = yScale.getPixelForValue(100);
                    if (y100 < chart.chartArea.top || y100 > chart.chartArea.bottom) return;
                    const c = chart.ctx;
                    c.save();
                    c.beginPath();
                    c.setLineDash([6, 4]);
                    c.moveTo(chart.chartArea.left, y100);
                    c.lineTo(chart.chartArea.right, y100);
                    c.strokeStyle = neonPink + 'aa';
                    c.lineWidth = 1.5;
                    c.stroke();
                    c.setLineDash([]);
                    c.font = 'bold 9px JetBrains Mono, monospace';
                    c.fillStyle = neonPink;
                    c.fillText('100%', chart.chartArea.right - 34, y100 - 4);
                    c.restore();
                }
            };

            const chartObj = new Chart(ctx2, {
                type: 'bar',
                data: {
                    labels: vendeurLabels,
                    datasets: [
                        {
                            label: 'ACM (%)',
                            data: acmData,
                            backgroundColor: neonBlue + '99',
                            borderColor: neonBlue,
                            borderWidth: 1.5,
                            borderRadius: 4
                        },
                        {
                            label: 'TSM (%)',
                            data: tsmData,
                            backgroundColor: neonAmber + '99',
                            borderColor: neonAmber,
                            borderWidth: 1.5,
                            borderRadius: 4
                        },
                        {
                            label: 'LINE (%)',
                            data: lineData,
                            backgroundColor: neonGreen + '99',
                            borderColor: neonGreen,
                            borderWidth: 1.5,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textMuted, font: { family: 'JetBrains Mono', size: 10 } }
                        },
                        y: {
                            min: 0,
                            max: yMax,
                            grid: { color: gridColor },
                            ticks: {
                                color: textMuted,
                                font: { family: 'JetBrains Mono', size: 10 },
                                callback: v => v + '%'
                            }
                        }
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: { color: textMain, font: { family: 'Inter', size: 11, weight: 'bold' }, boxWidth: 14 }
                        },
                        tooltip: {
                            callbacks: {
                                label: ctx => `${ctx.dataset.label} : ${ctx.parsed.y}%`
                            }
                        }
                    },
                    animation: { duration: 400 }
                },
                plugins: [refLinePlugin]
            });
            perDayQualiCharts.push(chartObj);
        });
    });
}

function populateTrendsTable(vendeursList) {
    const tableBody = document.querySelector('#details-trend-table tbody');
    if (!tableBody) return;
    tableBody.innerHTML = '';
    
    const tableHead = document.querySelector('#details-trend-table thead');
    const j1Toggle = document.getElementById('details-j1-toggle');
    const isJ1 = j1Toggle && j1Toggle.checked;
    
    if (tableHead) {
        if (isJ1) {
            tableHead.innerHTML = `
                <tr>
                    <th>Date</th>
                    <th>Vendeur</th>
                    <th>Encours (DH)</th>
                </tr>
            `;
        } else {
            tableHead.innerHTML = `
                <tr>
                    <th>Date</th>
                    <th>Vendeur</th>
                    <th>Réalisé (DH)</th>
                    <th>Objectif (DH)</th>
                    <th>Écart / Objectif (%)</th>
                </tr>
            `;
        }
    }
    
    const dates = trendsData.dates.filter(d => !excludedDates.includes(d));
    
    // Group records and insert into table
    const rows = [];
    
    dates.forEach(d => {
        vendeursList.forEach(v => {
            const vData = trendsData.trends[v] || [];
            const pt = vData.find(pt => pt.date === d);
            if (pt) {
                rows.push({
                    date: d,
                    vendeur: v,
                    real: pt.real,
                    obj: pt.obj,
                    pct: pt.pct,
                    encours: pt.encours || 0
                });
            }
        });
    });
    
    // Sort rows by date asc, then vendeur asc
    rows.sort((a, b) => {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }
        return a.vendeur.localeCompare(b.vendeur);
    });
    
    const todayStr = getTodayStr();
    rows.forEach(r => {
        const tr = document.createElement('tr');
        const targetDate = isJ1 ? shiftDateString(r.date, -1) : r.date;
        let formattedDate;
        if (isJ1 && targetDate === todayStr) {
            formattedDate = "En cours";
        } else {
            const parts = targetDate.split('-');
            formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : targetDate;
        }
        
        const devPct = r.obj > 0 ? (r.pct - 100) : 0;
        const pctClass = devPct >= 0 ? 'neon-text-green' : (devPct < -50 ? 'neon-text-pink' : 'neon-text-amber');
        const formattedPct = (devPct > 0 ? '+' : '') + devPct + '%';
        
        if (isJ1) {
            tr.innerHTML = `
                <td><strong>${formattedDate}</strong></td>
                <td><strong>${r.vendeur}</strong></td>
                <td class="neon-text-amber">${formatNumber(r.encours)} DH</td>
            `;
        } else {
            tr.innerHTML = `
                <td><strong>${formattedDate}</strong></td>
                <td><strong>${r.vendeur}</strong></td>
                <td>${formatNumber(r.real)} DH</td>
                <td>${formatNumber(r.obj)} DH</td>
                <td class="${pctClass}">${formattedPct}</td>
            `;
        }
        tableBody.appendChild(tr);
    });
    
    if (rows.length === 0) {
        const colspan = isJ1 ? 3 : 5;
        tableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;">Aucune donnée disponible pour cette sélection</td></tr>`;
    }
}

/* ----------------------------------------------------
   MULTI-UPLOAD BATCH PROCESSING CONTROLLERS
   ---------------------------------------------------- */
let multiUploadFiles = [];

function initMultiUploadView() {
    const multiBtn = document.getElementById('multi-upload-btn');
    const multiModal = document.getElementById('multi-upload-modal');
    const closeMultiBtn = document.getElementById('close-multi-upload-btn');
    const dropzone = document.getElementById('multi-upload-dropzone');
    const fileInput = document.getElementById('multi-upload-file-input');
    const submitBtn = document.getElementById('multi-upload-submit-btn');

    if (multiBtn && multiModal) {
        multiBtn.addEventListener('click', () => {
            resetMultiUploadForm();
            multiModal.classList.add('open');
        });
    }

    if (closeMultiBtn && multiModal) {
        closeMultiBtn.addEventListener('click', () => {
            multiModal.classList.remove('open');
        });
        multiModal.addEventListener('click', (e) => {
            if (e.target === multiModal) {
                multiModal.classList.remove('open');
            }
        });
    }

    if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => {
            fileInput.click();
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                handleMultiFileSelection(e.target.files);
            }
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.add('drag-over');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropzone.classList.remove('drag-over');
            }, false);
        });

        dropzone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                handleMultiFileSelection(files);
            }
        });
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            executeBatchUploads();
        });
    }
}

function parseDateFromFilename(filename) {
    const nameWithoutExt = filename.substring(0, filename.lastIndexOf('.')) || filename;
    const matches = nameWithoutExt.match(/\d+/g);
    if (!matches) {
        throw new Error("Aucun numéro de jour trouvé");
    }
    
    let day = null;
    for (let m of matches) {
        const val = parseInt(m, 10);
        if (val >= 1 && val <= 31) {
            day = val;
            break;
        }
    }
    
    if (day === null) {
        throw new Error("Jour invalide (doit être entre 1 et 31)");
    }
    
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dayStr = String(day).padStart(2, '0');
    
    return `${year}-${month}-${dayStr}`;
}

function handleMultiFileSelection(fileList) {
    const container = document.getElementById('multi-files-list-container');
    const list = document.getElementById('multi-files-list');
    const submitBtn = document.getElementById('multi-upload-submit-btn');

    if (!container || !list) return;

    multiUploadFiles = [];
    list.innerHTML = '';

    Array.from(fileList).forEach((file, idx) => {
        const item = document.createElement('div');
        item.className = 'multi-file-item';
        item.id = `multi-file-item-${idx}`;

        let parsedDate = '';
        let errorMsg = '';
        let isValid = true;

        try {
            if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
                throw new Error("Format de fichier invalide (.xlsx, .xls requis)");
            }
            parsedDate = parseDateFromFilename(file.name);
        } catch (err) {
            errorMsg = err.message;
            isValid = false;
        }

        const dateParts = parsedDate.split('-');
        const formattedDateDisplay = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : '';

        item.innerHTML = `
            <span class="multi-file-name"><i class="fa-solid fa-file-excel" style="color: var(--neon-blue); margin-right: 0.5rem;"></i>${file.name}</span>
            ${isValid ? `<span class="multi-file-date"><i class="fa-solid fa-calendar" style="margin-right: 0.25rem;"></i>${formattedDateDisplay}</span>` : `<span class="multi-file-date" style="color: var(--neon-pink); font-size: 0.75rem;"><i class="fa-solid fa-triangle-exclamation" style="margin-right: 0.25rem;"></i>${errorMsg}</span>`}
            <span class="multi-file-status ${isValid ? 'pending' : 'fail'}" id="multi-file-status-${idx}">${isValid ? 'prêt' : 'erreur'}</span>
        `;

        if (isValid) {
            multiUploadFiles.push({
                file: file,
                date: parsedDate,
                index: idx
            });
            item.classList.add('pending');
        } else {
            item.classList.add('error');
        }

        list.appendChild(item);
    });

    container.style.display = 'block';
    if (submitBtn) {
        submitBtn.disabled = multiUploadFiles.length === 0;
    }
}

function resetMultiUploadForm() {
    multiUploadFiles = [];
    const fileInput = document.getElementById('multi-upload-file-input');
    const container = document.getElementById('multi-files-list-container');
    const list = document.getElementById('multi-files-list');
    const statusContainer = document.getElementById('multi-upload-status-container');
    const submitBtn = document.getElementById('multi-upload-submit-btn');

    if (fileInput) fileInput.value = '';
    if (container) container.style.display = 'none';
    if (list) list.innerHTML = '';
    if (statusContainer) statusContainer.style.display = 'none';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> IMPORTER LES SÉLECTIONS';
    }
}

async function executeBatchUploads() {
    const submitBtn = document.getElementById('multi-upload-submit-btn');
    const statusContainer = document.getElementById('multi-upload-status-container');
    const statusText = document.getElementById('multi-upload-status-text');

    if (multiUploadFiles.length === 0) return;

    if (submitBtn) submitBtn.disabled = true;
    if (statusContainer) statusContainer.style.display = 'block';

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < multiUploadFiles.length; i++) {
        const item = multiUploadFiles[i];
        const itemEl = document.getElementById(`multi-file-item-${item.index}`);
        const statusEl = document.getElementById(`multi-file-status-${item.index}`);

        if (statusEl) {
            statusEl.className = 'multi-file-status uploading';
            statusEl.innerText = 'importation...';
        }
        if (statusText) {
            statusText.innerText = `Importation de ${item.file.name} (${i + 1}/${multiUploadFiles.length})...`;
        }

        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('date', item.date);

        // Estimate remaining workdays based on date
        const restDays = calculateRemainingWorkDays(item.date);
        formData.append('rest_days', restDays);

        try {
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();

            if (data.status === 'success') {
                if (statusEl) {
                    statusEl.className = 'multi-file-status done';
                    statusEl.innerText = 'succès';
                }
                if (itemEl) {
                    itemEl.classList.remove('pending');
                    itemEl.classList.add('success');
                }
                successCount++;
            } else {
                if (statusEl) {
                    statusEl.className = 'multi-file-status fail';
                    statusEl.innerText = 'échec';
                }
                if (itemEl) {
                    itemEl.classList.remove('pending');
                    itemEl.classList.add('error');
                }
                failCount++;
            }
        } catch (err) {
            console.error("Batch upload failed for index " + item.index, err);
            if (statusEl) {
                statusEl.className = 'multi-file-status fail';
                statusEl.innerText = 'erreur';
            }
            if (itemEl) {
                itemEl.classList.remove('pending');
                itemEl.classList.add('error');
            }
            failCount++;
        }
    }

    if (statusText) {
        statusText.innerText = `Batch terminé. Succès: ${successCount} | Échecs: ${failCount}.`;
    }
    if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> IMPORTATION TERMINÉE';
    }

    showToast(`Batch d'importation terminé ! Succès : ${successCount}, Échecs : ${failCount}`, successCount > 0 ? 'success' : 'error');

    // Close multi-upload popup modal on complete success
    if (successCount > 0 && failCount === 0) {
        const multiModal = document.getElementById('multi-upload-modal');
        if (multiModal) {
            multiModal.classList.remove('open');
        }
    }

    // Reload dates dropdown list
    fetchSuiviDates(() => {
        // Find if we uploaded files, and trigger dashboard reload to show the newest uploaded date
        if (successCount > 0) {
            fetchDashboardData();
            // Also reload details page trend data if it's currently open
            const detailsContainer = document.getElementById('details-container');
            if (detailsContainer && detailsContainer.style.display !== 'none') {
                const familySelect = document.getElementById('details-family-select');
                loadTrendsData(familySelect ? familySelect.value : 'C.A (ht)');
            }
        }
    });
}

/* ----------------------------------------------------
   LIVE RELOAD SCRIPT (DEVELOPMENT MODE ONLY)
   ---------------------------------------------------- */
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    let initialMtime = null;
    setInterval(() => {
        fetch('/api/reload-check')
            .then(res => res.json())
            .then(data => {
                if (data.last_modified) {
                    if (initialMtime === null) {
                        initialMtime = data.last_modified;
                    } else if (data.last_modified > initialMtime) {
                        console.log("Change detected. Reloading browser...");
                        location.reload();
                    }
                }
            })
            .catch(err => console.debug("Live reload check error:", err));
    }, 1000);
}

