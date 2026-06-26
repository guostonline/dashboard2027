/* ----------------------------------------------------
   MADEC KPI Dashboard JS - Cyberpunk Tech Theme
   ---------------------------------------------------- */

// Global State
let rawDashboardData = null;
let dashboardData = null;
let rawTrendsData = null;
let trendsData = null;
let currentTaxMode = localStorage.getItem('taxMode') || 'TTC'; // 'TTC' or 'HT'
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

const chakibFamiliesProgressCard = document.getElementById('chakib-families-progress-card');
let chakibFamiliesChartInstance = null;
const chakibFocusProgressCard = document.getElementById('chakib-focus-progress-card');
let chakibFocusChartInstance = null;
let chakibFocusHistoryData = null;

// Layout Manager Configurations & State
const checkboxMap = {
    'quanti-chart-card': 'toggle-quanti-chart',
    'quali-chart-card': 'toggle-quali-chart',
    'radar-chart-card': 'toggle-radar-chart',
    'focus-card': 'toggle-focus-card',
    'chakib-families-progress-card': 'toggle-chakib-families',
    'chakib-focus-progress-card': 'toggle-chakib-focus',
    'quanti-table-card': 'toggle-quanti-table',
    'quali-table-card': 'toggle-quali-table',
    'alerts-section': 'toggle-alerts-section'
};
let layoutStates = {
    visible: {},
    collapsed: {},
    order: { left: [], right: [] }
};

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
    // Initialize layout manager first to restore saved layout order and visibility states
    initLayoutManager();

    // Load config from server
    fetch('/api/config?_=' + Date.now())
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
            const path = window.location.pathname;
            const onClientsRoute = path === '/clients';
            const onDetailsRoute = path === '/details';
            const onFdvRoute = path === '/fdv';
            const onTerrainRoute = path === '/terrain';
            const onFocusRoute = path === '/focus';
            const onRapportRoute = path === '/rapport';
            const onStockRoute = path === '/stock';
            
            if (onDetailsRoute) {
                activeView = 'details';
            } else if (onClientsRoute) {
                activeView = 'clients';
            } else if (onFdvRoute) {
                activeView = 'fdv';
            } else if (onTerrainRoute) {
                activeView = 'terrain';
            } else if (onFocusRoute) {
                activeView = 'focus';
            } else if (onRapportRoute) {
                activeView = 'rapport';
            } else if (onStockRoute) {
                activeView = 'stock';
            } else {
                activeView = 'dashboard';
            }
            
            switchView(activeView);
            
            // Skip the main dashboard fetch when the user is on sub routes
            // (the dashboard-container is hidden in that case, but
            // the network call would still fire and trigger a modal error).
            if (!onClientsRoute && !onFdvRoute && !onTerrainRoute && !onFocusRoute && !onRapportRoute && !onStockRoute) {
                fetchSuiviDates(() => {
                    fetchDashboardData();
                });
            } else {
                fetchSuiviDates(() => {});
            }
            setupEventListeners();
            initDetailsView();
            initMultiUploadView();
            const dropdownList = document.getElementById('vendeur-dropdown-list');
            if (dropdownList) {
                loadVendeursList();
            }
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
            const dropdownList = document.getElementById('vendeur-dropdown-list');
            if (dropdownList) {
                loadVendeursList();
            }
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
    const navClients = document.getElementById('nav-clients');
    const navFdv = document.getElementById('nav-fdv');
    const navTerrain = document.getElementById('nav-terrain');
    const navFocus = document.getElementById('nav-focus');
    const navRapport = document.getElementById('nav-rapport');
    const navStock = document.getElementById('nav-stock');
    const navStockFavorites = document.getElementById('nav-stock-favorites');
    
    const mainDashboard = document.getElementById('main-dashboard-container');
    const detailsContainer = document.getElementById('details-container');
    const clientsContainer = document.getElementById('clients-container');
    const fdvContainer = document.getElementById('fdv-container');
    const terrainContainer = document.getElementById('terrain-container');
    const focusContainer = document.getElementById('focus-container');
    const rapportContainer = document.getElementById('rapport-container');
    const stockContainer = document.getElementById('stock-container');
    
    const dateSelect = document.getElementById('date-select');
    const timelapseCtrl = document.getElementById('timelapse-control');
    
    // Remove active class from all nav items
    [navDashboard, navRealisation, navDetails, navClients, navFdv, navTerrain, navFocus, navRapport, navStock, navStockFavorites].forEach(nav => {
        if (nav) nav.classList.remove('active');
    });
    
    // Hide all view containers
    [mainDashboard, detailsContainer, clientsContainer, fdvContainer, terrainContainer, focusContainer, rapportContainer, stockContainer].forEach(container => {
        if (container) container.style.display = 'none';
    });
    
    // Show/hide Stock favorites sub nav item depending on active view
    if (navStockFavorites) {
        if (viewName === 'stock') {
            navStockFavorites.style.display = 'flex';
        } else {
            navStockFavorites.style.display = 'none';
        }
    }
    
    // Default: hide date selector and timelapse control for subviews
    if (dateSelect) dateSelect.style.display = 'none';
    if (timelapseCtrl) timelapseCtrl.style.display = 'none';
    if (timelapseIsPlaying) stopTimelapse();
    
    if (viewName === 'details') {
        if (navDetails) navDetails.classList.add('active');
        if (detailsContainer) detailsContainer.style.display = 'block';
        loadTrendsData();
    } else if (viewName === 'clients') {
        if (navClients) navClients.classList.add('active');
        if (clientsContainer) clientsContainer.style.display = 'block';
    } else if (viewName === 'fdv') {
        if (navFdv) navFdv.classList.add('active');
        if (fdvContainer) fdvContainer.style.display = 'block';
    } else if (viewName === 'terrain') {
        if (navTerrain) navTerrain.classList.add('active');
        if (terrainContainer) terrainContainer.style.display = 'block';
    } else if (viewName === 'focus') {
        if (navFocus) navFocus.classList.add('active');
        if (focusContainer) focusContainer.style.display = 'block';
    } else if (viewName === 'rapport') {
        if (navRapport) navRapport.classList.add('active');
        if (rapportContainer) {
            rapportContainer.style.display = 'flex';
            // Always reload the vendeur list when switching to rapport
            loadVendeursList();
        }
    } else if (viewName === 'stock') {
        const urlParams = new URLSearchParams(window.location.search);
        const isFav = urlParams.get('view') === 'favorites' || urlParams.get('view') === 'favorit';
        if (isFav) {
            if (navStockFavorites) navStockFavorites.classList.add('active');
        } else {
            if (navStock) navStock.classList.add('active');
        }
        if (stockContainer) stockContainer.style.display = 'block';
        if (typeof window.initStockView === 'function') {
            window.initStockView();
        }
    } else {
        // dashboard or realisation
        if (viewName === 'dashboard' && navDashboard) navDashboard.classList.add('active');
        if (viewName === 'realisation' && navRealisation) navRealisation.classList.add('active');
        
        if (mainDashboard) mainDashboard.style.display = 'block';
        if (dateSelect) dateSelect.style.display = 'block';
        if (timelapseCtrl) timelapseCtrl.style.display = 'flex';
        
        fetchDashboardData();
    }
}

function updateTaxToggleUI() {
    const taxSelect = document.getElementById('tax-select');
    if (taxSelect) {
        taxSelect.value = currentTaxMode;
    }
    
    // Update main dashboard quanti-table headers
    const thReal = document.getElementById('th-quanti-real');
    const thObj = document.getElementById('th-quanti-obj');
    const thReal2025 = document.getElementById('th-quanti-real2025');
    const thObjMois = document.getElementById('th-quanti-objmois');
    const thRaf = document.getElementById('th-quanti-raf');
    
    if (thReal) thReal.innerText = `Réalisé (${currentTaxMode})`;
    if (thObj) thObj.innerText = `Objectif (${currentTaxMode})`;
    if (thReal2025) thReal2025.innerText = `Réal 2025 (${currentTaxMode})`;
    if (thObjMois) thObjMois.innerText = `Obj Mois (${currentTaxMode})`;
    if (thRaf) thRaf.innerText = `Reste à Faire (${currentTaxMode})`;

    // Update details view headers
    const thDetailsReal = document.getElementById('th-details-real');
    const thDetailsObj = document.getElementById('th-details-obj');
    if (thDetailsReal) thDetailsReal.innerText = `Réalisé (${currentTaxMode})`;
    if (thDetailsObj) thDetailsObj.innerText = `Objectif (${currentTaxMode})`;

    // Update terrain headers
    const thTerrainReal = document.getElementById('th-terrain-real');
    const thTerrainGlace = document.getElementById('th-terrain-glace');
    if (thTerrainReal) thTerrainReal.innerText = `Real CA (${currentTaxMode})`;
    if (thTerrainGlace) thTerrainGlace.innerText = `CA Glace (${currentTaxMode})`;

    // Toggle Som Focus HT/TTC visibility
    const focusSomObjHt = document.getElementById('focus-som-obj-ht');
    const focusSomObjTtc = document.getElementById('focus-som-obj-ttc');
    if (focusSomObjHt && focusSomObjTtc) {
        if (currentTaxMode === 'HT') {
            focusSomObjHt.parentElement.style.display = 'block';
            focusSomObjTtc.parentElement.style.display = 'none';
        } else {
            focusSomObjHt.parentElement.style.display = 'none';
            focusSomObjTtc.parentElement.style.display = 'block';
        }
    }

    // Synchronize report tax mode radio buttons check state
    const reportTaxTtc = document.getElementById('report-tax-mode-ttc');
    const reportTaxHt = document.getElementById('report-tax-mode-ht');
    if (currentTaxMode === 'HT') {
        if (reportTaxHt) reportTaxHt.checked = true;
    } else {
        if (reportTaxTtc) reportTaxTtc.checked = true;
    }
}

function applyTrendsTaxMode() {
    if (!rawTrendsData) return;
    
    // Deep copy rawTrendsData
    trendsData = JSON.parse(JSON.stringify(rawTrendsData));
    
    if (currentTaxMode === 'HT') {
        if (trendsData.trends) {
            for (let v in trendsData.trends) {
                trendsData.trends[v] = trendsData.trends[v].map(pt => ({
                    ...pt,
                    real: Math.round(pt.real / 1.2),
                    obj: Math.round(pt.obj / 1.2),
                    encours: Math.round((pt.encours || 0) / 1.2)
                }));
            }
        }
    }
}

function applyTaxMode() {
    if (!rawDashboardData) return;
    
    // Deep copy rawDashboardData so we don't modify the source
    dashboardData = JSON.parse(JSON.stringify(rawDashboardData));
    
    if (currentTaxMode === 'HT') {
        if (dashboardData.quantitative) {
            dashboardData.quantitative = dashboardData.quantitative.map(r => ({
                ...r,
                real: Math.round(r.real / 1.2),
                obj: Math.round(r.obj / 1.2),
                real_2025: Math.round(r.real_2025 / 1.2),
                h_2024: Math.round(r.h_2024 / 1.2),
                obj_mois: Math.round(r.obj_mois / 1.2),
                raf: Math.round(r.raf / 1.2),
                encours: Math.round(r.encours / 1.2)
            }));
        }
        
        if (dashboardData.focus_som) {
            dashboardData.focus_som = dashboardData.focus_som.map(item => ({
                ...item,
                ttc: Math.round(item.ttc / 1.2),
                realise: Math.round(item.realise / 1.2),
                rest: Math.round(item.rest / 1.2),
                rest_jour: Math.round(item.rest_jour / 1.2)
            }));
        }
    }
    
    applyTrendsTaxMode();
    updateTaxToggleUI();
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
    
    fetch(`/api/data?category=${encodeURIComponent(category)}&date=${encodeURIComponent(queryDate)}&_=${Date.now()}`)
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                rawDashboardData = res.data;
                applyTaxMode();
                populateCategoryDropdown();
                updateDashboard();
                populateFilters();
                prorataLabelEl.innerText = `${dashboardData.workdays.elapsed}/${dashboardData.workdays.total} JOURS ECOULÉS`;
                const headerElapsedInput = document.getElementById('header-elapsed-days');
                if (headerElapsedInput && dashboardData && dashboardData.workdays) {
                    headerElapsedInput.value = dashboardData.workdays.elapsed;
                }
                // Initialize the correct tab based on URL (function defined later in file)
                if (typeof initializeActiveTab === 'function') {
                    initializeActiveTab();
                }
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
    if (searchInput && searchDropdown) {
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
    }

    document.addEventListener('click', (e) => {
        if (searchInput && searchDropdown && !searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.style.display = 'none';
            activeDropdownIndex = -1;
        }
    });

    // Reset filter button
    if (resetFilterBtn) {
        resetFilterBtn.addEventListener('click', resetSelection);
    }

    // Tax selector (HT / TTC)
    const taxSelect = document.getElementById('tax-select');
    if (taxSelect) {
        taxSelect.value = currentTaxMode;
        taxSelect.addEventListener('change', (e) => {
            currentTaxMode = e.target.value;
            localStorage.setItem('taxMode', currentTaxMode);
            applyTaxMode();
            updateDashboard();
            if (activeView === 'details') {
                loadTrendsData(document.getElementById('details-family-select')?.value || 'C.A (TTC)');
            }
            document.dispatchEvent(new CustomEvent('taxModeChanged', { detail: { taxMode: currentTaxMode } }));
        });
    }

    // Synchronize report tax mode radio buttons change
    const reportTaxTtcInput = document.getElementById('report-tax-mode-ttc');
    const reportTaxHtInput = document.getElementById('report-tax-mode-ht');
    if (reportTaxTtcInput && reportTaxHtInput) {
        const handleRadioChange = (e) => {
            currentTaxMode = e.target.value;
            localStorage.setItem('taxMode', currentTaxMode);
            applyTaxMode();
            updateDashboard();
            if (activeView === 'details') {
                loadTrendsData(document.getElementById('details-family-select')?.value || 'C.A (TTC)');
            }
            document.dispatchEvent(new CustomEvent('taxModeChanged', { detail: { taxMode: currentTaxMode } }));
        };
        reportTaxTtcInput.addEventListener('change', handleRadioChange);
        reportTaxHtInput.addEventListener('change', handleRadioChange);
    }

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

    const headerElapsedInput = document.getElementById('header-elapsed-days');
    if (headerElapsedInput) {
        headerElapsedInput.addEventListener('change', () => {
            if (!dashboardData) return;
            const newElapsed = parseInt(headerElapsedInput.value);
            if (isNaN(newElapsed) || newElapsed < 0 || newElapsed > dashboardData.workdays.total) {
                showToast("Veuillez saisir un nombre de jours valide.", "error");
                headerElapsedInput.value = dashboardData.workdays.elapsed;
                return;
            }
            
            // Update frontend data
            dashboardData.workdays.elapsed = newElapsed;
            dashboardData.workdays.rest = dashboardData.workdays.total - newElapsed;
            
            // Recalculate other displays
            prorataLabelEl.innerText = `${dashboardData.workdays.elapsed}/${dashboardData.workdays.total} JOURS ECOULÉS`;
            
            // Update other workday fields on the screen if they exist
            if (infoElapsedDays) infoElapsedDays.innerText = newElapsed;
            if (inputRestDays) inputRestDays.value = dashboardData.workdays.rest;
            
            // Trigger instant redraw
            updateDashboard();
            
            // Persist the change to the backend settings
            const dateSelect = document.getElementById('date-select');
            const dateVal = dateSelect ? dateSelect.value : 'default';
            
            // Retrieve currently excluded families to keep them
            const excludedFamilies = [];
            const container = document.getElementById('exclude-families-toggles');
            if (container) {
                container.querySelectorAll('.family-toggle-pill.excluded').forEach(pill => {
                    excludedFamilies.push(pill.querySelector('span').innerText.trim());
                });
            }
            
            fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    rest_days: dashboardData.workdays.rest,
                    exclude_families: excludedFamilies,
                    date: dateVal
                })
            })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    showToast("Jours travaillés mis à jour et sauvegardés !", "success");
                } else {
                    showToast("Erreur lors de la sauvegarde: " + data.message, "error");
                }
            })
            .catch(err => {
                console.error("Error saving workdays:", err);
            });
        });
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
    const resetVendeurSelectionBtn = document.getElementById('reset-vendeur-selection-btn');
    if (resetVendeurSelectionBtn) {
        resetVendeurSelectionBtn.addEventListener('click', () => {
            selectedVendeurForReport = null;
            const dropdownText = document.getElementById('dropdown-selected-text');
            if (dropdownText) {
                dropdownText.textContent = 'Sélectionner un vendeur (Optionnel)';
                dropdownText.classList.add('placeholder');
            }
            updateSelectedVendeurDisplay();
            renderDropdownList();
        });
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
    const whatsappReportBtn = document.getElementById('whatsapp-report-btn');
    if (whatsappReportBtn) {
        whatsappReportBtn.addEventListener('click', openWhatsappShareDialog);
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
            if (searchInput) searchInput.value = '';
            closeMainVendeurDropdown();
            if (timelapseIsPlaying) stopTimelapse();
            if (resetFilterBtn) resetFilterBtn.style.display = 'none';
            const categoryText = categorySelect.options[categorySelect.selectedIndex].text;
            if (currentSelectionBadge) {
                currentSelectionBadge.innerText = `GLOBAL / ${categoryText.toUpperCase()}`;
                currentSelectionBadge.className = 'badge-blue';
            }
            fetchDashboardData();

            // Also refresh Details trends
            const familySelect = document.getElementById('details-family-select');
            loadTrendsData(familySelect ? familySelect.value : 'C.A (TTC)');
        });
    }

    // Main Vendeur/Secteur selector event listeners
    const mainVendeurToggle = document.getElementById('main-vendeur-toggle');
    const mainVendeurSearch = document.getElementById('main-vendeur-search');
    const mainVendeurMenu = document.getElementById('main-vendeur-menu');

    if (mainVendeurToggle) {
        mainVendeurToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleMainVendeurDropdown();
        });
    }
    if (mainVendeurSearch) {
        mainVendeurSearch.addEventListener('input', (e) => {
            mainVendeurSearchQuery = e.target.value;
            renderMainVendeurDropdownList();
        });
        mainVendeurSearch.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    if (mainVendeurMenu) {
        mainVendeurMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    document.addEventListener('click', (e) => {
        const container = document.getElementById('main-vendeur-container');
        if (container && !container.contains(e.target)) {
            closeMainVendeurDropdown();
        }
    });

    // Timelapse control events
    const playBtn = document.getElementById('timelapse-play-btn');
    const stopBtn = document.getElementById('timelapse-stop-btn');
    const speedInd = document.getElementById('timelapse-speed-indicator');

    if (playBtn) {
        playBtn.addEventListener('click', () => {
            toggleTimelapse();
        });
    }
    if (stopBtn) {
        stopBtn.addEventListener('click', () => {
            stopTimelapse();
        });
    }
    if (speedInd) {
        speedInd.addEventListener('click', () => {
            cycleTimelapseSpeed();
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

    // ============================================
    // SIDEBAR AUTO-HIDE
    // ============================================
    // Behavior:
    //  - Toggle button (hamburger in header) collapses/expands the sidebar
    //  - State persists in localStorage
    //  - On screens ≤ 1024px the sidebar is hidden by default; the existing
    //    .open class handles the slide-in overlay behavior
    //  - Edge trigger (6px strip on the left) peeks the sidebar on hover
    //    when it is collapsed
    //  - Floating reopen button restores the sidebar
    const sidebar = document.getElementById('sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarReopenBtn = document.getElementById('sidebar-reopen-btn');
    const sidebarEdgeTrigger = document.getElementById('sidebar-edge-trigger');

    const SIDEBAR_STATE_KEY = 'madec_sidebar_collapsed';
    const isSmallScreen = () => window.matchMedia('(max-width: 1024px)').matches;

    function applySidebarCollapsed(collapsed) {
        if (!sidebar) return;
        if (collapsed) {
            document.body.classList.add('sidebar-collapsed');
            // Mobile uses .open as the slide-in flag — keep them in sync so
            // the sidebar stays hidden on small screens even after collapse.
            if (isSmallScreen()) sidebar.classList.remove('open');
        } else {
            document.body.classList.remove('sidebar-collapsed');
        }
        try { localStorage.setItem(SIDEBAR_STATE_KEY, collapsed ? '1' : '0'); } catch {}
    }

    function toggleSidebar() {
        if (isSmallScreen()) {
            // Mobile: toggle the slide-in overlay
            if (!sidebar) return;
            sidebar.classList.toggle('open');
        } else {
            // Desktop: toggle the collapsed/expanded state
            const isCollapsed = document.body.classList.contains('sidebar-collapsed');
            applySidebarCollapsed(!isCollapsed);
        }
    }

    // Restore persisted state (desktop only — mobile always starts hidden)
    if (!isSmallScreen()) {
        let stored = '0';
        try { stored = localStorage.getItem(SIDEBAR_STATE_KEY) || '0'; } catch {}
        if (stored === '1') applySidebarCollapsed(true);
    }

    if (sidebarToggleBtn) {
        sidebarToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSidebar();
        });
    }

    if (sidebarReopenBtn) {
        sidebarReopenBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isSmallScreen()) {
                if (sidebar) sidebar.classList.add('open');
            } else {
                applySidebarCollapsed(false);
            }
        });
    }

    // Edge trigger: hover peeks the sidebar temporarily while collapsed
    let peekTimeout = null;
    if (sidebarEdgeTrigger) {
        sidebarEdgeTrigger.addEventListener('mouseenter', () => {
            if (!document.body.classList.contains('sidebar-collapsed')) return;
            if (sidebar) {
                sidebar.style.transform = 'translateX(0)';
                sidebar.style.boxShadow = '10px 0 30px rgba(0,0,0,0.8)';
            }
        });
        sidebarEdgeTrigger.addEventListener('mouseleave', () => {
            if (!document.body.classList.contains('sidebar-collapsed')) return;
            if (peekTimeout) clearTimeout(peekTimeout);
            peekTimeout = setTimeout(() => {
                if (sidebar) {
                    sidebar.style.transform = '';
                    sidebar.style.boxShadow = '';
                }
            }, 150);
        });
    }

    // Keep sidebar behavior in sync with viewport size changes
    const mql = window.matchMedia('(max-width: 1024px)');
    const onMqlChange = (ev) => {
        if (ev.matches) {
            // Switched to small screen — clear desktop collapsed state
            document.body.classList.remove('sidebar-collapsed');
            if (sidebar) sidebar.classList.remove('open');
        } else {
            // Switched to large screen — hide any mobile open state
            if (sidebar) sidebar.classList.remove('open');
            // Reapply persisted collapsed state
            let stored = '0';
            try { stored = localStorage.getItem(SIDEBAR_STATE_KEY) || '0'; } catch {}
            if (stored === '1') document.body.classList.add('sidebar-collapsed');
        }
    };
    if (mql.addEventListener) mql.addEventListener('change', onMqlChange);
    else if (mql.addListener) mql.addListener(onMqlChange);

    // Close sidebar on click outside (mobile only)
    document.addEventListener('click', (e) => {
        if (sidebar && sidebar.classList.contains('open') && isSmallScreen()) {
            if (!sidebar.contains(e.target) && !sidebarToggleBtn.contains(e.target) && !sidebarReopenBtn.contains(e.target)) {
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

            // Auto-close sidebar on mobile after navigating
            if (sidebar && sidebar.classList.contains('open') && isSmallScreen()) {
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
                        // Only manage active state for in-page anchor links
                        // (those whose href starts with "#"). Real-URL nav
                        // items keep their server-rendered active class.
                        const href = nav.getAttribute('href') || '';
                        if (href.startsWith('#')) {
                            if (href === `#${id}`) {
                                nav.classList.add('active');
                            } else {
                                nav.classList.remove('active');
                            }
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
            if (timelapseIsPlaying) {
                stopTimelapse();
            }
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

                // Check if the date already exists in the database
                if (availableDates.includes(item.date)) {
                    const dateParts = item.date.split('-');
                    const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : item.date;
                    const confirmOverwrite = confirm(`Les données pour la date ${formattedDate} (fichier ${item.file.name}) existent déjà. Voulez-vous les remplacer ?`);
                    if (!confirmOverwrite) {
                        if (statusEl) {
                            statusEl.className = 'multi-file-status fail';
                            statusEl.innerText = 'annulé';
                        }
                        failCount++;
                        continue;
                    }
                }

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
                        loadTrendsData(familySelect ? familySelect.value : 'C.A (TTC)');
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
    
    // Re-render dashboard to pick up theme changes across all components
    if (dashboardData) {
        updateDashboard();
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
    
    // Re-render dashboard to pick up theme color changes
    if (dashboardData) {
        updateDashboard();
    }
}

// Open modal
function openSettingsModal() {
    if (!dashboardData) {
        showToast("Chargement des paramètres...", "info");
        
        const categorySelect = document.getElementById('category-select');
        const category = categorySelect ? categorySelect.value : 'All';
        const dateSelect = document.getElementById('date-select');
        const dateVal = dateSelect ? dateSelect.value : 'default';
        
        fetch(`/api/data?category=${encodeURIComponent(category)}&date=${encodeURIComponent(dateVal)}&_=${Date.now()}`)
            .then(res => res.json())
            .then(res => {
                if (res.status === 'success') {
                    rawDashboardData = res.data;
                    applyTaxMode();
                    openSettingsModal();
                } else {
                    // Fallback to fetch config directly if data load failed (e.g. database empty)
                    fetch(`/api/config?_=${Date.now()}`)
                        .then(configRes => configRes.json())
                        .then(configData => {
                            if (configData.status === 'success') {
                                const config = configData.config;
                                dashboardData = {
                                    workdays: {
                                        total: 24,
                                        elapsed: 24 - (config.rest_days || 20),
                                        rest: config.rest_days || 20
                                    },
                                    all_families: [],
                                    exclude_families: config.exclude_families || []
                                };
                                openSettingsModal();
                            } else {
                                showToast("Erreur lors de la récupération des paramètres : " + configData.message, "error");
                            }
                        })
                        .catch(err => {
                            console.error(err);
                            showToast("Erreur de connexion au serveur", "error");
                        });
                }
            })
            .catch(err => {
                console.error(err);
                // Fallback to fetch config directly if data load failed
                fetch(`/api/config?_=${Date.now()}`)
                    .then(configRes => configRes.json())
                    .then(configData => {
                        if (configData.status === 'success') {
                            const config = configData.config;
                            dashboardData = {
                                workdays: {
                                    total: 24,
                                    elapsed: 24 - (config.rest_days || 20),
                                    rest: config.rest_days || 20
                                },
                                all_families: [],
                                exclude_families: config.exclude_families || []
                            };
                            openSettingsModal();
                        } else {
                            showToast("Erreur de connexion au serveur", "error");
                        }
                    })
                    .catch(() => {
                        showToast("Erreur de connexion au serveur", "error");
                    });
            });
        return;
    }
    
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
            
            // Only fetch dashboard data if we are not on a sub-route that skips it
            const path = window.location.pathname;
            const onClientsRoute = path === '/clients';
            const onFdvRoute = path === '/fdv';
            const onTerrainRoute = path === '/terrain';
            const onFocusRoute = path === '/focus';
            const onRapportRoute = path === '/rapport';
            if (!onClientsRoute && !onFdvRoute && !onTerrainRoute && !onFocusRoute && !onRapportRoute) {
                fetchDashboardData();
            }
        } else {
            showToast("Erreur: " + data.message, "error");
        }
    })
    .catch(err => {
        console.error(err);
        showToast("Une erreur de communication est survenue lors de l'application.", "error");
    });
}

// Reset Vendeur/Secteur filters to Global view
function resetSelection() {
    currentSelection = { type: 'global', name: '' };
    if (searchInput) searchInput.value = '';
    closeMainVendeurDropdown();
    updateMainVendeurSelectedText();
    renderMainVendeurDropdownList();
    if (resetFilterBtn) resetFilterBtn.style.display = 'none';
    const categorySelect = document.getElementById('category-select');
    const categoryText = categorySelect ? categorySelect.options[categorySelect.selectedIndex].text : "TOUTE L'AGENCE";
    if (currentSelectionBadge) {
        currentSelectionBadge.innerText = `GLOBAL / ${categoryText.toUpperCase()}`;
        currentSelectionBadge.className = 'badge-blue';
    }
    updateDashboard();
}

let categoryDropdownPopulated = false;

function getTeamName(cdz) {
    if (!cdz) return '';
    if (cdz.toUpperCase().includes('CHAKIB')) return 'Chakib Equipe';
    if (cdz.toUpperCase().includes('BOUTMEZGUINE')) return 'Boutmezguine Equipe';
    const firstWord = cdz.trim().split(' ')[0];
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase() + ' Equipe';
}

function populateCategoryDropdown() {
    if (categoryDropdownPopulated) return;
    const categorySelect = document.getElementById('category-select');
    if (!categorySelect || !dashboardData || !dashboardData.fdv) return;
    
    // Extract unique CDZs
    const cdzList = [...new Set(dashboardData.fdv.map(r => r.cdz).filter(c => c && c.trim() !== ''))];
    
    // Track if we have a default selected category
    const savedCategory = categorySelect.value || 'Chakib Equipe';
    
    // Generate options
    let html = '<option value="All">TOUTE L\'AGENCE</option>';
    cdzList.forEach(cdz => {
        const teamName = getTeamName(cdz);
        const isSelected = (teamName === savedCategory) ? 'selected' : '';
        html += `<option value="${teamName}" ${isSelected}>${teamName}</option>`;
    });
    
    categorySelect.innerHTML = html;
    categoryDropdownPopulated = true;
}

// Populate search autocomplete values
function populateFilters() {
    if (!dashboardData) return;

    // Get current category select value
    const categorySelect = document.getElementById('category-select');
    const categoryVal = categorySelect ? categorySelect.value : 'All';

    // 1. Get all vendeurs from roster (dashboardData.fdv) or fallback to quantitative if fdv is empty
    let allowedSellers = [];
    if (dashboardData.fdv && dashboardData.fdv.length > 0) {
        let fdvList = dashboardData.fdv;
        
        // Filter fdv roster based on selected category, mimicking backend get_categorie
        if (categoryVal === 'All') {
            allowedSellers = fdvList.map(r => r.vendeur.trim());
        } else if (categoryVal === 'Chakib Equipe') {
            allowedSellers = fdvList.filter(r => (r.cdz || '').trim().toUpperCase() === 'CHAKIB ELFIL').map(r => r.vendeur.trim());
        } else if (categoryVal === 'Boutmezguine Equipe') {
            allowedSellers = fdvList.filter(r => (r.cdz || '').trim().toUpperCase() === 'BOUTMEZGUINE EL MOSTAFA').map(r => r.vendeur.trim());
        } else {
            // Check if matches dynamic CDZ team name
            const matchedCdz = fdvList.find(r => r.cdz && getTeamName(r.cdz) === categoryVal);
            if (matchedCdz) {
                allowedSellers = fdvList.filter(r => (r.cdz || '').trim().toUpperCase() === matchedCdz.cdz.trim().toUpperCase()).map(r => r.vendeur.trim());
            } else {
                allowedSellers = fdvList.map(r => r.vendeur.trim());
            }
        }

        // Always add the CDZ names to category team selections
        if (categoryVal === 'All' || categoryVal === 'Chakib Equipe' || categoryVal === 'Boutmezguine Equipe') {
            if (!allowedSellers.includes('CHAKIB ELFIL')) allowedSellers.push('CHAKIB ELFIL');
            if (!allowedSellers.includes('BOUTMEZGUINE EL MOSTAFA')) allowedSellers.push('BOUTMEZGUINE EL MOSTAFA');
        }
    } else {
        // Fallback to quantitative dataset unique vendors if fdv list is missing
        allowedSellers = [...new Set(dashboardData.quantitative.map(item => item.vendeur))];
    }

    // Filter out virtual "AUTRE" and clean
    const uniqueVendeurs = [...new Set(allowedSellers)].filter(v => v && v.toUpperCase() !== 'AUTRE').sort();

    const uniqueSecteursVmm = [...new Set(dashboardData.focus_vmm.map(item => item.secteur))].filter(s => s && s.toUpperCase() !== 'AUTRES SECTEURS').sort();
    const uniqueSecteursSom = [...new Set(dashboardData.focus_som.map(item => item.secteur))].filter(s => s && s.toUpperCase() !== 'AUTRES SECTEURS').sort();
    
    window.searchData = [
        ...uniqueVendeurs.map(v => ({ name: v, type: 'vendeur' })),
        ...uniqueSecteursVmm.map(s => ({ name: s, type: 'secteur' })),
        ...uniqueSecteursSom.map(s => ({ name: s, type: 'secteur' })),
        { name: 'AUTRE', type: 'vendeur' }
    ];

    mainDropdownItems = [
        { name: 'RESET_GLOBAL', label: '-- TOUS LES VENDEURS --', type: 'global' },
        ...uniqueVendeurs.map(v => ({ name: v, label: v, type: 'vendeur' })),
        ...uniqueSecteursVmm.map(s => ({ name: s, label: s, type: 'secteur_vmm' })),
        ...uniqueSecteursSom.map(s => ({ name: s, label: s, type: 'secteur_som' })),
        { name: 'AUTRE', label: 'AUTRE', type: 'vendeur' }
    ];

    updateMainVendeurSelectedText();
    renderMainVendeurDropdownList();
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
    if (searchInput) searchInput.value = name;
    if (searchDropdown) searchDropdown.style.display = 'none';
    if (resetFilterBtn) resetFilterBtn.style.display = 'inline-block';
    
    updateMainVendeurSelectedText();
    renderMainVendeurDropdownList();
    
    if (currentSelectionBadge) {
        currentSelectionBadge.innerText = `${type.toUpperCase()}: ${name}`;
        currentSelectionBadge.className = type === 'vendeur' ? 'badge-blue' : 'badge-green';
    }
    
    updateDashboard();
}

// Core rendering pipeline
function updateDashboard() {
    if (!dashboardData) return;

    if (!currentSelection || currentSelection.type === 'global') {
        const categorySelect = document.getElementById('category-select');
        const categoryVal = categorySelect ? categorySelect.value : 'All';
        if (categoryVal === 'Boutmezguine Equipe') {
            selectFilter('vendeur', 'BOUTMEZGUINE EL MOSTAFA');
        } else {
            selectFilter('vendeur', 'CHAKIB ELFIL');
        }
        return;
    }

    if (currentSelection.type === 'vendeur' && (currentSelection.name === 'CHAKIB ELFIL' || currentSelection.name === 'BOUTMEZGUINE EL MOSTAFA')) {
        const hasSelectedCdz = dashboardData.quantitative.some(r => r.vendeur.trim().toUpperCase() === currentSelection.name.toUpperCase());
        if (!hasSelectedCdz) {
            console.log(`${currentSelection.name} not found in current category dataset. Selecting first active seller.`);
            // Find another active seller in the dataset to select
            const activeSellers = [...new Set(dashboardData.quantitative.map(r => r.vendeur.trim()))].filter(v => v && v.toUpperCase() !== 'AUTRE');
            if (activeSellers.length > 0) {
                selectFilter('vendeur', activeSellers[0]);
                return;
            }
        }
    }

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
            // Get all vendors belonging to this CDZ
            const teamSellers = [];
            if (dashboardData && dashboardData.fdv) {
                dashboardData.fdv.forEach(r => {
                    if ((r.cdz || '').trim().toLowerCase() === targetName) {
                        teamSellers.push(r.vendeur.trim().toLowerCase());
                    }
                });
            }

            quantiRecords = quantiRecords.filter(item => {
                const val = (item.vendeur || '').trim().toLowerCase();
                return val === targetName || teamSellers.includes(val) || val.includes(targetName) || targetName.includes(val);
            });
            
            // For qualitative chart / table
            qualiRecords = qualiRecords.filter(item => {
                const val = (item.vendeur || '').trim().toLowerCase();
                return val === targetName || teamSellers.includes(val) || val.includes(targetName) || targetName.includes(val);
            });
            
            // Filter Focus data by matching Vendeur name directly with 'AUTRE' fallback
            const origFocusVmm = focusVmm.filter(item => {
                const val = (item.vendeur || '').trim().toLowerCase();
                return val === targetName || teamSellers.includes(val) || val.includes(targetName) || targetName.includes(val);
            });
            focusVmm = origFocusVmm.length > 0 ? origFocusVmm : focusVmm.filter(item => item.vendeur.trim().toLowerCase() === 'autre');
            
            const origFocusSom = focusSom.filter(item => {
                const val = (item.vendeur || '').trim().toLowerCase();
                return val === targetName || teamSellers.includes(val) || val.includes(targetName) || targetName.includes(val);
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
        const somSellers = new Set((dashboardData.fdv || []).filter(r => (r.role || '').toUpperCase().includes('SOM')).map(r => r.vendeur.trim().toUpperCase()));
        quantiRecords = quantiRecords.filter(item => {
            const fam = item.famille.toUpperCase();
            if (fam === 'C.A (HT)' || fam === 'C.A (TTC)' || fam === 'C.A (ht)' || fam === 'C.A (ttc)') {
                const sellerName = item.vendeur.trim().toUpperCase();
                return somSellers.has(sellerName) || sellerName === 'CHAKIB ELFIL' || sellerName === 'BOUTMEZGUINE EL MOSTAFA';
            }
            return fam !== 'VMM' && fam !== 'VIT' && fam !== 'CHAR' && !fam.includes('VMM');
        });
        focusVmm = []; // VMM focus empty
    } else if (currentFilterType === 'vmm') {
        const vmmSellers = new Set((dashboardData.fdv || []).filter(r => (r.role || '').toUpperCase().includes('VMM')).map(r => r.vendeur.trim().toUpperCase()));
        quantiRecords = quantiRecords.filter(item => {
            const fam = item.famille.toUpperCase();
            if (fam === 'C.A (HT)' || fam === 'C.A (TTC)' || fam === 'C.A (ht)' || fam === 'C.A (ttc)') {
                const sellerName = item.vendeur.trim().toUpperCase();
                return vmmSellers.has(sellerName) || sellerName === 'CHAKIB ELFIL' || sellerName === 'BOUTMEZGUINE EL MOSTAFA';
            }
            return fam === 'VMM' || fam === 'VIT' || fam === 'CHAR' || fam.includes('VMM') || fam === 'BOUILLON' || fam === 'CONDIMENTS';
        });
        focusSom = []; // SOM focus empty
    }

    // 2. Compute Top cards
    // Filter CA (ht) family or sum everything
    const totalCaObj = quantiRecords.filter(r => r.famille === 'C.A (ht)' || r.famille === 'C.A (TTC)').reduce((sum, r) => sum + r.obj, 0) || 1;
    const totalCaReal = quantiRecords.filter(r => r.famille === 'C.A (ht)' || r.famille === 'C.A (TTC)').reduce((sum, r) => sum + r.real, 0);
    
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
    const diffColor = diff >= 0 ? 'neon-text-green' : (diff >= -20 ? 'neon-text-amber' : 'neon-text-pink');
    
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

    // 5b. Render CHAKIB ELFIL Specific Families Progress Chart
    if (currentSelection && currentSelection.type === 'vendeur' && currentSelection.name.trim().toUpperCase() === 'CHAKIB ELFIL') {
        if (chakibFamiliesProgressCard) {
            applyCardVisibility('chakib-families-progress-card');
            
            // Group the all-family records of CHAKIB ELFIL (individual data matching the spreadsheet source of truth)
            const families = {};
            const sellerQuanti = (dashboardData && dashboardData.quantitative) ? 
                dashboardData.quantitative.filter(item => {
                    return (item.vendeur || '').trim().toLowerCase() === 'chakib elfil';
                }) : [];
                
            sellerQuanti.forEach(r => {
                if (r.famille) {
                    if (!families[r.famille]) {
                        families[r.famille] = { real: 0, obj: 0 };
                    }
                    families[r.famille].real += r.real;
                    families[r.famille].obj += r.obj;
                }
            });
            
            const customOrder = [
                "C.A (TTC)",
                "C.A (HT)",
                "LEVURE",
                "MOUSSES",
                "BOUILLON",
                "CONDIMENTS",
                "CONFITURE",
                "CONSERVES"
            ];
            
            const sortedFamilies = Object.keys(families).sort((a, b) => {
                const indexA = customOrder.indexOf(a.toUpperCase());
                const indexB = customOrder.indexOf(b.toUpperCase());
                
                if (indexA !== -1 && indexB !== -1) {
                    return indexA - indexB;
                }
                if (indexA !== -1) return -1;
                if (indexB !== -1) return 1;
                return a.localeCompare(b);
            });
            
            const labels = [];
            const dataRates = [];
            const backgroundColors = [];
            const borderColors = [];
            
            const styles = getComputedStyle(document.body);
            const gridColor = isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
            const textColor = isWhiteMode ? '#334155' : '#e2e8f0'; // Slate 700 / Slate 200 for excellent contrast
            
            // Resolve premium colors from current visual theme variables
            const greenColor = (styles.getPropertyValue('--neon-green').trim() || '#15803d').substring(0, 7);
            const amberColor = (styles.getPropertyValue('--neon-amber').trim() || '#b45309').substring(0, 7);
            const pinkColor = (styles.getPropertyValue('--neon-pink').trim() || '#be185d').substring(0, 7);
            
            sortedFamilies.forEach(fam => {
                const data = families[fam];
                let rate = 0;
                if (data.obj > 0) {
                    rate = Math.round((data.real / data.obj) * 100);
                } else if (data.real > 0) {
                    rate = 100;
                } else {
                    rate = 100; // default to 100% since objective is 0 and they achieved 0
                }
                
                const deviation = rate - 100;
                
                labels.push(fam);
                dataRates.push(deviation);
                
                // Color formatting: Green for positive, Orange for -20 to 0, Red/Pink for < -20
                let color = pinkColor;
                if (deviation >= 0) {
                    color = greenColor;
                } else if (deviation >= -20) {
                    color = amberColor;
                }
                
                backgroundColors.push(color + 'ba'); // translucent
                borderColors.push(color);
            });
            
            // Inline plugin to draw value labels (+X% / -Y%) directly next to each horizontal bar
            const deviationLabelsPlugin = {
                id: 'deviationLabels',
                afterDatasetsDraw(chart) {
                    const { ctx, data } = chart;
                    ctx.save();
                    ctx.textBaseline = 'middle';
                    ctx.font = 'bold 11px JetBrains Mono';
                    
                    chart.getDatasetMeta(0).data.forEach((bar, index) => {
                        const val = data.datasets[0].data[index];
                        const pctLabel = (val > 0 ? '+' : '') + val + '%';
                        
                        let color = pinkColor;
                        if (val >= 0) {
                            color = greenColor;
                        } else if (val >= -20) {
                            color = amberColor;
                        }
                        
                        // bar.x is the end of the bar, bar.y is the vertical center of the bar
                        if (val >= 0) {
                            ctx.textAlign = 'left';
                            ctx.fillStyle = color; // Match color of the positive bar (contrast-safe in both light and dark mode)
                            ctx.fillText(pctLabel, bar.x + 8, bar.y);
                        } else {
                            ctx.textAlign = 'right';
                            ctx.fillStyle = color; // Match color of the negative bar (contrast-safe in both light and dark mode)
                            ctx.fillText(pctLabel, bar.x - 8, bar.y);
                        }
                    });
                    ctx.restore();
                }
            };
            
            const canvas = document.getElementById('chakib-families-chart');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (chakibFamiliesChartInstance) {
                    chakibFamiliesChartInstance.destroy();
                }
                
                chakibFamiliesChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Écart de Réalisation (%)',
                            data: dataRates,
                            backgroundColor: backgroundColors,
                            borderColor: borderColors,
                            borderWidth: 1.5,
                            borderRadius: 4,
                            barPercentage: 0.65
                        }]
                    },
                    options: {
                        indexAxis: 'y', // Horizontal bar chart
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const fam = context.label;
                                        const val = context.raw;
                                        const data = families[fam];
                                        const pctLabel = (val > 0 ? '+' : '') + val + '%';
                                        return ` Écart: ${pctLabel} | Réal: ${formatNumber(data.real)} DH | Obj: ${formatNumber(data.obj)} DH`;
                                    }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grace: '10%', // Prevent labels from getting cut off at visual edges
                                suggestedMin: -20,
                                suggestedMax: 20,
                                grid: {
                                    color: function(context) {
                                        const val = context.tick ? context.tick.value : context.value;
                                        if (val === 0) {
                                            return isWhiteMode ? 'rgba(15, 23, 42, 0.6)' : '#00d4ff'; // Highlight origin
                                        }
                                        return gridColor;
                                    },
                                    lineWidth: function(context) {
                                        const val = context.tick ? context.tick.value : context.value;
                                        if (val === 0) {
                                            return 2.5;
                                        }
                                        return 1;
                                    }
                                },
                                ticks: {
                                    color: function(context) {
                                        const val = context.tick ? context.tick.value : context.value;
                                        if (val === 0) {
                                            return isWhiteMode ? '#0f172a' : '#00d4ff';
                                        }
                                        return isWhiteMode ? '#475569' : '#64748b';
                                    },
                                    font: function(context) {
                                        const val = context.tick ? context.tick.value : context.value;
                                        if (val === 0) {
                                            return { family: 'JetBrains Mono', size: 9, weight: 'bold' };
                                        }
                                        return { family: 'JetBrains Mono', size: 9 };
                                    },
                                    callback: function(value) {
                                        return (value > 0 ? '+' : '') + value + '%';
                                    }
                                }
                            },
                            y: {
                                grid: { display: false },
                                ticks: {
                                    color: textColor,
                                    font: { family: 'Inter', size: 11, weight: 'bold' }
                                }
                            }
                        }
                    },
                    plugins: [deviationLabelsPlugin]
                });
            }
        }
        
        if (chakibFocusProgressCard) {
            applyCardVisibility('chakib-focus-progress-card');
            if (!chakibFocusHistoryData) {
                fetch('/api/focus/trend?agence=AGADIR')
                .then(r => r.json())
                .then(res => {
                    if (res.status === 'success') {
                        chakibFocusHistoryData = res;
                        renderChakibFocusProgress(res.data, res.settings, res.total_days);
                    }
                })
                .catch(err => console.error("Error fetching CHAKIB ELFIL focus trend:", err));
            } else {
                renderChakibFocusProgress(chakibFocusHistoryData.data, chakibFocusHistoryData.settings, chakibFocusHistoryData.total_days);
            }
        }
    } else {
        if (chakibFamiliesProgressCard) {
            applyCardVisibility('chakib-families-progress-card');
        }
        if (chakibFamiliesChartInstance) {
            chakibFamiliesChartInstance.destroy();
            chakibFamiliesChartInstance = null;
        }
        if (chakibFocusProgressCard) {
            applyCardVisibility('chakib-focus-progress-card');
        }
        if (chakibFocusChartInstance) {
            chakibFocusChartInstance.destroy();
            chakibFocusChartInstance = null;
        }
    }

    // 6. Render System Alerts
    updateSystemAlerts(quantiRecords, qualiRecords, focusVmm, focusSom, wDays);

    // 7. Render Charts (separated Quanti and Quali)
    renderQuantiChart(quantiRecords);
    renderQualiChart(qualiRecords, quantiRecords);
    renderRadarChart();
}

// Populate product family table
function renderQuantiTable(records) {
    quantiTableBody.innerHTML = '';
    
    const headerRow = document.querySelector('#quanti-table thead tr');
    const isGlobal = !currentSelection || currentSelection.type !== 'vendeur';
    if (headerRow) {
        if (isGlobal) {
            headerRow.innerHTML = `
                <th>Famille</th>
                <th>Réalisé (DH)</th>
                <th>Objectif (DH)</th>
                <th>% Taux</th>
                <th>Réal 2025 (DH)</th>
                <th>Obj Mois (DH)</th>
                <th>Reste à Faire (RAF)</th>
                <th>RAF Jour</th>
            `;
        } else {
            headerRow.innerHTML = `
                <th>Famille</th>
                <th>Réalisé (DH)</th>
                <th>Objectif (DH)</th>
                <th>% Taux</th>
                <th>Réal 2025 (DH)</th>
                <th>Obj Mois (DH)</th>
                <th>Reste à Faire (RAF)</th>
            `;
        }
    }
    
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
        "CONSERVES"
    ];

    const sortedFamilies = Object.keys(families).sort((a, b) => {
        if (a === 'C.A (ht)' || a === 'C.A (TTC)') return 1;
        if (b === 'C.A (ht)' || b === 'C.A (TTC)') return -1;

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
        
        if (fam === 'C.A (ht)' || fam === 'C.A (TTC)') {
            tr.style.fontWeight = 'bold';
            tr.style.background = 'rgba(0,212,255,0.06)';
            tr.style.borderTop = '2px solid var(--neon-blue)';
        }

        const pctClass = pct >= 0 ? 'neon-text-green' : (pct >= -20 ? 'neon-text-amber' : 'neon-text-pink');
        const pctSign = pct >= 0 ? '+' : '';

        let cellsHtml = `
            <td><strong>${fam}</strong></td>
            <td>${formatNumber(data.real)}</td>
            <td>${formatNumber(data.obj)}</td>
            <td class="${pctClass}">${pctSign}${pct.toFixed(1)}%</td>
            <td>${formatNumber(data.real2025)}</td>
            <td>${formatNumber(data.objMois)}</td>
            <td class="neon-text-amber">${formatNumber(data.raf)}</td>
        `;

        if (isGlobal) {
            const restDays = (dashboardData && dashboardData.workdays) ? dashboardData.workdays.rest : 20;
            const rafJourVal = restDays > 0 ? Math.round(data.raf / restDays) : 0;
            cellsHtml += `<td class="neon-text-amber">${formatNumber(rafJourVal)}</td>`;
        }

        tr.innerHTML = cellsHtml;
        quantiTableBody.appendChild(tr);
    });

    if (sortedFamilies.length === 0) {
        const colspan = isGlobal ? 8 : 7;
        quantiTableBody.innerHTML = `<tr><td colspan="${colspan}" style="text-align:center;">Aucune donnée disponible</td></tr>`;
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
    const targetNameUpper = (currentSelection && currentSelection.type === 'vendeur') ? currentSelection.name.trim().toUpperCase() : '';
    const isCdzSelected = targetNameUpper === 'CHAKIB ELFIL' || targetNameUpper === 'BOUTMEZGUINE EL MOSTAFA' || 
        ((dashboardData && dashboardData.fdv) ? dashboardData.fdv.some(r => (r.cdz || '').trim().toUpperCase() === targetNameUpper) : false);

    // 1. If not provided, calculate based on active filters
    if (!quantiRecords) {
        if (dashboardData) {
            quantiRecords = dashboardData.quantitative;
            
            if (currentSelection && currentSelection.type === 'vendeur') {
                const targetName = (currentSelection.name || '').trim().toLowerCase();
                const teamSellers = [];
                if (dashboardData.fdv) {
                    dashboardData.fdv.forEach(r => {
                        if ((r.cdz || '').trim().toLowerCase() === targetName) {
                            teamSellers.push(r.vendeur.trim().toLowerCase());
                        }
                    });
                }
                quantiRecords = quantiRecords.filter(item => {
                    const val = (item.vendeur || '').trim().toLowerCase();
                    return val === targetName || teamSellers.includes(val) || val.includes(targetName) || targetName.includes(val);
                });
            } else if (currentSelection && currentSelection.type === 'secteur') {
                const sectorFocusVmm = dashboardData.focus_vmm.filter(item => item.secteur.toLowerCase() === currentSelection.name.toLowerCase());
                const sectorFocusSom = dashboardData.focus_som.filter(item => item.secteur.toLowerCase() === currentSelection.name.toLowerCase());
                const sellersForSector = new Set([
                    ...sectorFocusVmm.map(f => f.vendeur.toLowerCase()),
                    ...sectorFocusSom.map(f => f.vendeur.toLowerCase())
                ]);
                if (sellersForSector.size > 0) {
                    quantiRecords = quantiRecords.filter(item => sellersForSector.has(item.vendeur.toLowerCase()));
                }
            }

            if (currentFilterType === 'som') {
                const somSellers = new Set((dashboardData.fdv || []).filter(r => (r.role || '').toUpperCase().includes('SOM')).map(r => r.vendeur.trim().toUpperCase()));
                quantiRecords = quantiRecords.filter(item => {
                    const fam = item.famille.toUpperCase();
                    if (fam === 'C.A (HT)' || fam === 'C.A (TTC)' || fam === 'C.A (ht)' || fam === 'C.A (ttc)') {
                        const sellerName = item.vendeur.trim().toUpperCase();
                        return somSellers.has(sellerName) || sellerName === 'CHAKIB ELFIL' || sellerName === 'BOUTMEZGUINE EL MOSTAFA';
                    }
                    return fam !== 'VMM' && fam !== 'VIT' && fam !== 'CHAR' && !fam.includes('VMM');
                });
            } else if (currentFilterType === 'vmm') {
                const vmmSellers = new Set((dashboardData.fdv || []).filter(r => (r.role || '').toUpperCase().includes('VMM')).map(r => r.vendeur.trim().toUpperCase()));
                quantiRecords = quantiRecords.filter(item => {
                    const fam = item.famille.toUpperCase();
                    if (fam === 'C.A (HT)' || fam === 'C.A (TTC)' || fam === 'C.A (ht)' || fam === 'C.A (ttc)') {
                        const sellerName = item.vendeur.trim().toUpperCase();
                        return vmmSellers.has(sellerName) || sellerName === 'CHAKIB ELFIL' || sellerName === 'BOUTMEZGUINE EL MOSTAFA';
                    }
                    return fam === 'VMM' || fam === 'VIT' || fam === 'CHAR' || fam.includes('VMM') || fam === 'BOUILLON' || fam === 'CONDIMENTS';
                });
            }
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
    const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);

    // Extract top sellers performance by volume (real CA)
    const sellerPerformances = {};
    quantiRecords.forEach(r => {
        if (r.famille === 'C.A (ht)' || r.famille === 'C.A (TTC)') {
            if (!sellerPerformances[r.vendeur]) {
                sellerPerformances[r.vendeur] = { real: 0, obj: 0 };
            }
            sellerPerformances[r.vendeur].real += r.real;
            sellerPerformances[r.vendeur].obj += r.obj;
        }
    });

    let labels = Object.keys(sellerPerformances);
    labels.sort((a,b) => sellerPerformances[b].real - sellerPerformances[a].real);

    // Ensure selected CDZ is shown when selected (expand limit to 15 to include all CDZ team members)
    const maxLabels = isCdzSelected ? 15 : 7;
    if (isCdzSelected) {
        const cdzKey = Object.keys(sellerPerformances).find(k => k.trim().toUpperCase() === targetNameUpper);
        if (cdzKey) {
            const topCount = Math.min(labels.length, maxLabels);
            const topSlice = labels.slice(0, topCount);
            if (!topSlice.includes(cdzKey)) {
                topSlice[topSlice.length - 1] = cdzKey;
            }
            labels = topSlice;
        } else {
            labels = labels.slice(0, maxLabels);
        }
    } else {
        labels = labels.slice(0, maxLabels);
    }

    // Deviation percentage data calculation
    const deviationData = labels.map(l => {
        const perf = sellerPerformances[l];
        return perf.obj > 0 ? Math.round(((perf.real / perf.obj) - 1) * 100) : 0;
    });

    // Colors for positive (green) and negative (red/orange) points
    const pointBackgroundColors = deviationData.map(v => v >= 0 ? neonGreen : (v >= -20 ? neonAmber : neonPink));
    const pointBorderColors = deviationData.map(v => v >= 0 ? neonGreen : (v >= -20 ? neonAmber : neonPink));

    // Dynamic point radii/borders (highlight selected seller/CDZ)
    const pointRadii = labels.map(l => targetNameUpper && l.toUpperCase().includes(targetNameUpper) ? 9 : 5);
    const pointHoverRadii = labels.map(l => targetNameUpper && l.toUpperCase().includes(targetNameUpper) ? 11 : 7);
    const pointBorderWidths = labels.map(l => targetNameUpper && l.toUpperCase().includes(targetNameUpper) ? 4 : 2);

    // Plugin to display names and percentage values directly on top of each point
    const pointLabelsPlugin = {
        id: 'pointLabels',
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';

            chart.getDatasetMeta(0).data.forEach((point, index) => {
                const val = data.datasets[0].data[index];
                const rawLabel = labels[index] || '';
                const isSelectedVendeur = targetNameUpper && rawLabel.toUpperCase().includes(targetNameUpper);
                
                const parts = rawLabel.split(' ');
                const shortName = (parts[0] + ' ' + (parts[1] || '')).trim();
                const pctLabel = (val > 0 ? '+' : '') + val + '%';

                if (isSelectedVendeur) {
                    ctx.font = 'bold 13px JetBrains Mono';
                    ctx.fillStyle = '#00f0ff'; // Neon cyan highlight for selected seller/CDZ
                    ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
                    ctx.shadowBlur = 6;
                } else {
                    ctx.font = 'bold 11px JetBrains Mono';
                    ctx.fillStyle = val >= 0 ? neonGreen : (val >= -20 ? neonAmber : neonPink);
                    ctx.shadowBlur = 0;
                }

                if (val >= 0) {
                    ctx.fillText(shortName, point.x, point.y - 25);
                    ctx.fillText(pctLabel, point.x, point.y - 12);
                } else {
                    ctx.fillText(pctLabel, point.x, point.y + 14);
                    ctx.fillText(shortName, point.x, point.y + 27);
                }
                ctx.shadowBlur = 0;
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
                    pointRadius: pointRadii,
                    pointHoverRadius: pointHoverRadii,
                    pointBorderWidth: pointBorderWidths,
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
function renderQualiChart(qualiRecords, quantiRecords) {
    const targetNameUpper = (currentSelection && currentSelection.type === 'vendeur') ? currentSelection.name.trim().toUpperCase() : '';
    const isCdzSelected = targetNameUpper === 'CHAKIB ELFIL' || targetNameUpper === 'BOUTMEZGUINE EL MOSTAFA' || 
        ((dashboardData && dashboardData.fdv) ? dashboardData.fdv.some(r => (r.cdz || '').trim().toUpperCase() === targetNameUpper) : false);

    if (!qualiRecords) {
        if (dashboardData) {
            qualiRecords = dashboardData.qualitative;
            if (currentSelection && currentSelection.type === 'vendeur') {
                const targetName = (currentSelection.name || '').trim().toLowerCase();
                const teamSellers = [];
                if (dashboardData.fdv) {
                    dashboardData.fdv.forEach(r => {
                        if ((r.cdz || '').trim().toLowerCase() === targetName) {
                            teamSellers.push(r.vendeur.trim().toLowerCase());
                        }
                    });
                }
                qualiRecords = qualiRecords.filter(item => {
                    const val = (item.vendeur || '').trim().toLowerCase();
                    return val === targetName || teamSellers.includes(val) || val.includes(targetName) || targetName.includes(val);
                });
            } else if (currentSelection && currentSelection.type === 'secteur') {
                const sectorFocusVmm = dashboardData.focus_vmm.filter(item => item.secteur.toLowerCase() === currentSelection.name.toLowerCase());
                const sectorFocusSom = dashboardData.focus_som.filter(item => item.secteur.toLowerCase() === currentSelection.name.toLowerCase());
                const sellersForSector = new Set([
                    ...sectorFocusVmm.map(f => f.vendeur.toLowerCase()),
                    ...sectorFocusSom.map(f => f.vendeur.toLowerCase())
                ]);
                if (sellersForSector.size > 0) {
                    qualiRecords = qualiRecords.filter(item => sellersForSector.has(item.vendeur.toLowerCase()));
                }
            }
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

    // Extract the top sellers by sales volume (real CA) to keep x-axis consistent
    const sellerPerformances = {};
    
    let recordsForVol = quantiRecords;
    if (!recordsForVol) {
        if (dashboardData) {
            recordsForVol = dashboardData.quantitative;
            if (currentSelection && currentSelection.type === 'vendeur') {
                const targetName = (currentSelection.name || '').trim().toLowerCase();
                const teamSellers = [];
                if (dashboardData.fdv) {
                    dashboardData.fdv.forEach(r => {
                        if ((r.cdz || '').trim().toLowerCase() === targetName) {
                            teamSellers.push(r.vendeur.trim().toLowerCase());
                        }
                    });
                }
                recordsForVol = recordsForVol.filter(item => {
                    const val = (item.vendeur || '').trim().toLowerCase();
                    return val === targetName || teamSellers.includes(val) || val.includes(targetName) || targetName.includes(val);
                });
            } else if (currentSelection && currentSelection.type === 'secteur') {
                const sectorFocusVmm = dashboardData.focus_vmm.filter(item => item.secteur.toLowerCase() === currentSelection.name.toLowerCase());
                const sectorFocusSom = dashboardData.focus_som.filter(item => item.secteur.toLowerCase() === currentSelection.name.toLowerCase());
                const sellersForSector = new Set([
                    ...sectorFocusVmm.map(f => f.vendeur.toLowerCase()),
                    ...sectorFocusSom.map(f => f.vendeur.toLowerCase())
                ]);
                if (sellersForSector.size > 0) {
                    recordsForVol = recordsForVol.filter(item => sellersForSector.has(item.vendeur.toLowerCase()));
                }
            }
            if (currentFilterType === 'som') {
                const somSellers = new Set((dashboardData.fdv || []).filter(r => (r.role || '').toUpperCase().includes('SOM')).map(r => r.vendeur.trim().toUpperCase()));
                recordsForVol = recordsForVol.filter(item => {
                    const fam = item.famille.toUpperCase();
                    if (fam === 'C.A (HT)' || fam === 'C.A (TTC)' || fam === 'C.A (ht)' || fam === 'C.A (ttc)') {
                        const sellerName = item.vendeur.trim().toUpperCase();
                        return somSellers.has(sellerName) || sellerName === 'CHAKIB ELFIL' || sellerName === 'BOUTMEZGUINE EL MOSTAFA';
                    }
                    return fam !== 'VMM' && fam !== 'VIT' && fam !== 'CHAR' && !fam.includes('VMM');
                });
            } else if (currentFilterType === 'vmm') {
                const vmmSellers = new Set((dashboardData.fdv || []).filter(r => (r.role || '').toUpperCase().includes('VMM')).map(r => r.vendeur.trim().toUpperCase()));
                recordsForVol = recordsForVol.filter(item => {
                    const fam = item.famille.toUpperCase();
                    if (fam === 'C.A (HT)' || fam === 'C.A (TTC)' || fam === 'C.A (ht)' || fam === 'C.A (ttc)') {
                        const sellerName = item.vendeur.trim().toUpperCase();
                        return vmmSellers.has(sellerName) || sellerName === 'CHAKIB ELFIL' || sellerName === 'BOUTMEZGUINE EL MOSTAFA';
                    }
                    return fam === 'VMM' || fam === 'VIT' || fam === 'CHAR' || fam.includes('VMM') || fam === 'BOUILLON' || fam === 'CONDIMENTS';
                });
            }
        } else {
            recordsForVol = [];
        }
    }
    
    recordsForVol.forEach(r => {
        if (r.famille === 'C.A (ht)' || r.famille === 'C.A (TTC)') {
            if (!sellerPerformances[r.vendeur]) {
                sellerPerformances[r.vendeur] = { real: 0, obj: 0 };
            }
            sellerPerformances[r.vendeur].real += r.real;
            sellerPerformances[r.vendeur].obj += r.obj;
        }
    });

    let labels = Object.keys(sellerPerformances);
    labels.sort((a,b) => sellerPerformances[b].real - sellerPerformances[a].real);

    // Keep exact same label slicing logic as renderQuantiChart to keep x-axis consistent
    const maxLabels = isCdzSelected ? 15 : 7;
    if (isCdzSelected) {
        const cdzKey = Object.keys(sellerPerformances).find(k => k.trim().toUpperCase() === targetNameUpper);
        if (cdzKey) {
            const topCount = Math.min(labels.length, maxLabels);
            const topSlice = labels.slice(0, topCount);
            if (!topSlice.includes(cdzKey)) {
                topSlice[topSlice.length - 1] = cdzKey;
            }
            labels = topSlice;
        } else {
            labels = labels.slice(0, maxLabels);
        }
    } else {
        labels = labels.slice(0, maxLabels);
    }

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
    const linePointColors = lineData.map(v => v >= 100 ? neonGreen : (v >= 80 ? neonAmber : neonPink));
    const tsmPointColors = tsmData.map(v => v >= prorata ? neonGreen : (v >= prorata - 20 ? neonAmber : neonPink));
    const acmPointColors = acmData.map(v => v >= prorata ? neonGreen : (v >= prorata - 20 ? neonAmber : neonPink));

    // Plugin to display LINE percentages and vendor codes directly on the point
    const qualiLabelsPlugin = {
        id: 'qualiLabels',
        afterDatasetsDraw(chart) {
            const { ctx, data } = chart;
            ctx.save();
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';

            chart.getDatasetMeta(0).data.forEach((point, index) => {
                const val = data.datasets[0].data[index];
                const rawLabel = labels[index] || '';
                const isSelectedVendeur = targetNameUpper && rawLabel.toUpperCase().includes(targetNameUpper);
                
                const parts = rawLabel.split(' ');
                const code = parts[0];
                const label = val + '%';

                if (isSelectedVendeur) {
                    ctx.font = 'bold 13px JetBrains Mono';
                    ctx.fillStyle = '#00f0ff'; // Neon cyan highlight for selected vendeur/CDZ
                    ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
                    ctx.shadowBlur = 6;
                } else {
                    ctx.font = 'bold 11px JetBrains Mono';
                    ctx.fillStyle = val >= 100 ? neonGreen : (val >= 80 ? neonAmber : neonPink);
                    ctx.shadowBlur = 0;
                }

                if (val >= 100) {
                    ctx.fillText(code, point.x, point.y - 25);
                    ctx.fillText(label, point.x, point.y - 12);
                } else {
                    ctx.fillText(label, point.x, point.y + 14);
                    ctx.fillText(code, point.x, point.y + 27);
                }
                ctx.shadowBlur = 0;
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

// Radar Chart - Performance Globale par Famille
let radarChartInstance = null;
function renderRadarChart() {
    const canvas = document.getElementById('radar-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (radarChartInstance) {
        radarChartInstance.destroy();
    }

    if (!dashboardData || !dashboardData.quantitative) return;

    // Resolve theme colors
    const styles = getComputedStyle(document.body);
    const isWhiteMode = document.body.classList.contains('light-mode');
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
    const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);
    const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);
    const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);
    const neonPurple = (styles.getPropertyValue('--neon-purple').trim() || '#a855f7').substring(0, 7);

    // Aggregate CA by famille and calculate performance
    const familleData = {};
    dashboardData.quantitative.forEach(r => {
        if (r.famille && r.famille !== 'C.A (ht)' && r.famille !== 'C.A (TTC)') {
            if (!familleData[r.famille]) {
                familleData[r.famille] = { real: 0, obj: 0 };
            }
            familleData[r.famille].real += r.real;
            familleData[r.famille].obj += r.obj;
        }
    });

    // Get top 6 families by CA (real)
    const sortedFamilies = Object.keys(familleData).sort((a, b) =>
        familleData[b].real - familleData[a].real
    ).slice(0, 6);

    const labels = sortedFamilies;
    const realValues = sortedFamilies.map(f => familleData[f].real);
    const objValues = sortedFamilies.map(f => familleData[f].obj);

    // Normalize values to percentage of objective for radar chart
    const realPct = sortedFamilies.map((f, i) => {
        if (objValues[i] > 0) {
            return Math.min(100, Math.round((realValues[i] / objValues[i]) * 100));
        }
        return 0;
    });

    const objPct = sortedFamilies.map(() => 100); // Objective is 100% reference

    radarChartInstance = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Réalisé (%)',
                    data: realPct,
                    backgroundColor: 'rgba(0, 212, 255, 0.25)',
                    borderColor: neonBlue,
                    borderWidth: 2,
                    pointBackgroundColor: realPct.map(v => v >= 80 ? neonGreen : neonPink),
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'Objectif (100%)',
                    data: objPct,
                    backgroundColor: 'rgba(168, 85, 247, 0.1)',
                    borderColor: neonPurple,
                    borderWidth: 2,
                    borderDash: [5, 5],
                    pointBackgroundColor: neonPurple,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 3,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: {
                        color: isWhiteMode ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'
                    },
                    grid: {
                        color: isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)'
                    },
                    pointLabels: {
                        color: isWhiteMode ? '#1e293b' : '#e2e8f0',
                        font: {
                            family: 'Inter',
                            size: 11,
                            weight: 'bold'
                        }
                    },
                    ticks: {
                        color: isWhiteMode ? '#475569' : '#64748b',
                        backdropColor: 'transparent',
                        font: {
                            family: 'JetBrains Mono',
                            size: 9
                        },
                        callback: function(value) {
                            return value + '%';
                        }
                    },
                    suggestedMin: 0,
                    suggestedMax: 120
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: isWhiteMode ? '#1e293b' : '#e2e8f0',
                        font: {
                            family: 'Inter',
                            weight: 'bold',
                            size: 11
                        },
                        padding: 15,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    backgroundColor: isWhiteMode ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.85)',
                    titleColor: isWhiteMode ? '#1e293b' : '#fff',
                    bodyColor: isWhiteMode ? '#475569' : '#cbd5e1',
                    borderColor: neonBlue,
                    borderWidth: 1,
                    padding: 12,
                    displayColors: true,
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.r !== null) {
                                label += context.parsed.r + '%';
                            }
                            return label;
                        }
                    }
                }
            }
        }
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

// Holds the most recent AI report so the WhatsApp button can send it
let currentReportText = '';
let currentReportTitle = '';
// The vendeur name the report was generated for, if any. Used to
// auto-fill the WhatsApp number from the FDV database.
let currentReportVendeur = '';
let currentVendeurWhatsappMessage = '';

// Variable to track vendeur selection modal state
let selectedVendeurForReport = null;
let allVendeursList = [];
let filteredVendeursList = [];

// Main dashboard vendor/sector dropdown state
let mainVendeurSearchQuery = '';
let mainDropdownItems = [];

// Toggle main vendor dropdown
function toggleMainVendeurDropdown() {
    const menu = document.getElementById('main-vendeur-menu');
    const toggle = document.getElementById('main-vendeur-toggle');
    if (menu && toggle) {
        const isOpen = menu.classList.contains('open');
        if (isOpen) {
            closeMainVendeurDropdown();
        } else {
            // Close other dropdowns
            closeVendeurDropdown(); 
            
            menu.classList.add('open');
            toggle.classList.add('open');
            
            // Focus on search input
            setTimeout(() => {
                const searchInput = document.getElementById('main-vendeur-search');
                if (searchInput) searchInput.focus();
            }, 50);
        }
    }
}

// Close main vendor dropdown
function closeMainVendeurDropdown() {
    const menu = document.getElementById('main-vendeur-menu');
    const toggle = document.getElementById('main-vendeur-toggle');
    if (menu) menu.classList.remove('open');
    if (toggle) toggle.classList.remove('open');
    
    // Reset search query
    const searchInput = document.getElementById('main-vendeur-search');
    if (searchInput) searchInput.value = '';
    mainVendeurSearchQuery = '';
}

// Update toggle button text to show current selection
function updateMainVendeurSelectedText() {
    const selectedTextSpan = document.getElementById('main-vendeur-selected-text');
    if (!selectedTextSpan) return;

    if (!currentSelection || currentSelection.type === 'global') {
        selectedTextSpan.textContent = '-- TOUS LES VENDEURS --';
    } else {
        selectedTextSpan.textContent = `${currentSelection.type.toUpperCase()}: ${currentSelection.name}`;
    }
}

// Render main dropdown items
function renderMainVendeurDropdownList() {
    const listContainer = document.getElementById('main-vendeur-list');
    if (!listContainer) return;

    const query = mainVendeurSearchQuery.toLowerCase().trim();
    const filtered = mainDropdownItems.filter(item => {
        if (item.type === 'global') return !query;
        return item.label.toLowerCase().includes(query);
    });

    if (filtered.length === 0) {
        listContainer.innerHTML = '<div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.85rem; font-family: var(--font-mono);"><i class="fa-solid fa-magnifying-glass"></i> AUCUN RÉSULTAT</div>';
        return;
    }

    listContainer.innerHTML = filtered.map(item => {
        const isSelected = (item.type === 'global' && currentSelection.type === 'global') ||
            (item.type.startsWith('secteur') && currentSelection.type === 'secteur' && currentSelection.name === item.name) ||
            (item.type === currentSelection.type && currentSelection.name === item.name);

        const iconClass = item.type === 'global' ? 'fa-globe' : 
                          item.type === 'vendeur' ? 'fa-user' : 
                          item.type === 'secteur_vmm' ? 'fa-bolt' : 'fa-ice-cream';

        const badgeText = item.type === 'global' ? 'Tous' : 
                          item.type === 'vendeur' ? 'Vendeur' : 
                          item.type === 'secteur_vmm' ? 'VMM' : 'SOM';

        const badgeColor = item.type === 'global' ? 'badge-blue' : 
                            item.type === 'vendeur' ? 'badge-blue' : 
                            item.type === 'secteur_vmm' ? 'badge-green' : 'badge-green';

        const itemStyle = 'display: flex; align-items: center; gap: 0.75rem; padding: 0.65rem 0.85rem; margin-bottom: 0.25rem; border-radius: 6px; cursor: pointer; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-main); font-size: 0.85rem; transition: all 0.2s;';
        const selectedStyle = isSelected ? ' border-color: var(--primary-color); background: rgba(0, 212, 255, 0.12); font-weight: 600;' : '';

        return `
            <div class="main-dropdown-item ${isSelected ? 'selected' : ''}" data-type="${item.type}" data-name="${item.name}" style="${itemStyle}${selectedStyle}">
                <i class="fa-solid ${iconClass}" style="color: var(--primary-color); font-size: 0.85rem; width: 16px; text-align: center; flex-shrink: 0;"></i>
                <span style="flex: 1; color: var(--text-main); font-size: 0.85rem;">${item.label}</span>
                <span class="dropdown-item-meta ${badgeColor}" style="margin-right: 0.5rem; font-size: 0.7rem; padding: 0.15rem 0.45rem;">${badgeText}</span>
                ${isSelected ? '<i class="fa-solid fa-check" style="color: var(--primary-color); font-size: 0.85rem;"></i>' : ''}
            </div>
        `;
    }).join('');

    const items = listContainer.querySelectorAll('.main-dropdown-item');
    items.forEach(el => {
        el.addEventListener('click', () => {
            const type = el.dataset.type;
            const name = el.dataset.name;

            if (type === 'global') {
                resetSelection();
            } else {
                const normType = type.startsWith('secteur') ? 'secteur' : type;
                selectFilter(normType, name);
            }
            closeMainVendeurDropdown();
        });
    });
}

// Day-by-day Animated Timelapse playback state
let timelapseIsPlaying = false;
let timelapseTimer = null;
let timelapseSpeed = 2000; // default 2s per step
let timelapseCurrentIndex = -1;

// Beautiful, cyberpunk-themed non-blocking toast notification system
function showTransientToast(message, type = 'info') {
    let toastContainer = document.getElementById('transient-toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'transient-toast-container';
        toastContainer.style.cssText = 'position: fixed; bottom: 24px; right: 24px; z-index: 10000; display: flex; flex-direction: column; gap: 8px; pointer-events: none;';
        document.body.appendChild(toastContainer);
    }
    
    const toast = document.createElement('div');
    toast.className = 'cyber-toast';
    
    let icon = 'fa-circle-info';
    let colorClass = 'neon-text-blue';
    let borderColor = 'var(--neon-blue)';
    
    if (type === 'success') {
        icon = 'fa-circle-check';
        colorClass = 'neon-text-green';
        borderColor = 'var(--neon-green)';
    } else if (type === 'error' || type === 'warning') {
        icon = 'fa-triangle-exclamation';
        colorClass = 'neon-text-pink';
        borderColor = 'var(--neon-pink)';
    }
    
    toast.style.cssText = `
        background: rgba(10, 12, 22, 0.95);
        border: 1px solid ${borderColor};
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5), inset 0 0 10px rgba(0, 212, 255, 0.1);
        color: var(--text-main);
        padding: 10px 16px;
        border-radius: 8px;
        font-family: var(--font-mono);
        font-size: 0.85rem;
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 250px;
        max-width: 400px;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(20px);
        transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    
    toast.innerHTML = `
        <i class="fa-solid ${icon} ${colorClass}" style="font-size: 1.1rem;"></i>
        <span style="flex-grow: 1;">${message}</span>
    `;
    
    toastContainer.appendChild(toast);
    
    // Trigger transition
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    }, 10);
    
    // Auto remove after 2.8s
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 2800);
}

// Start day-by-day timelapse chronological playback
function startTimelapse() {
    if (availableDates.length <= 1) {
        showTransientToast("Pas assez de dates pour lancer le timelapse.", "warning");
        return;
    }
    
    // Switch to dashboard view if not already there
    if (activeView === 'details') {
        showView('dashboard');
    }
    
    timelapseIsPlaying = true;
    
    // Update UI controls
    const playBtn = document.getElementById('timelapse-play-btn');
    const stopBtn = document.getElementById('timelapse-stop-btn');
    const container = document.getElementById('timelapse-control');
    const progressContainer = document.getElementById('timelapse-progress-container');
    const progressText = document.getElementById('timelapse-progress-text');
    
    if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-pause"></i>';
    if (playBtn) playBtn.title = "Mettre en pause";
    if (stopBtn) stopBtn.style.display = 'inline-block';
    if (container) container.classList.add('playing');
    if (progressContainer) progressContainer.style.display = 'flex';
    if (progressText) progressText.style.display = 'inline-block';
    
    // Find where to start in chronological order (oldest first)
    const chronoDates = [...availableDates].reverse();
    const dateSelect = document.getElementById('date-select');
    const currentDate = dateSelect ? dateSelect.value : '';
    
    let currentChronoIdx = chronoDates.indexOf(currentDate);
    
    // If at the end, restart from the oldest date
    if (currentChronoIdx === -1 || currentChronoIdx >= chronoDates.length - 1) {
        timelapseCurrentIndex = 0;
    } else {
        timelapseCurrentIndex = currentChronoIdx;
    }
    
    showTransientToast("Démarrage du timelapse...", "info");
    
    // Execute first step
    runTimelapseStep();
}

// Pause timelapse playback
function pauseTimelapse() {
    timelapseIsPlaying = false;
    if (timelapseTimer) {
        clearTimeout(timelapseTimer);
        timelapseTimer = null;
    }
    
    const playBtn = document.getElementById('timelapse-play-btn');
    const container = document.getElementById('timelapse-control');
    if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (playBtn) playBtn.title = "Lancer le timelapse";
    if (container) container.classList.remove('playing');
    
    showTransientToast("Timelapse mis en pause.", "info");
}

// Stop timelapse playback
function stopTimelapse() {
    timelapseIsPlaying = false;
    if (timelapseTimer) {
        clearTimeout(timelapseTimer);
        timelapseTimer = null;
    }
    timelapseCurrentIndex = -1;
    
    const playBtn = document.getElementById('timelapse-play-btn');
    const stopBtn = document.getElementById('timelapse-stop-btn');
    const container = document.getElementById('timelapse-control');
    const progressContainer = document.getElementById('timelapse-progress-container');
    const progressText = document.getElementById('timelapse-progress-text');
    const progressBar = document.getElementById('timelapse-progress-bar');
    
    if (playBtn) playBtn.innerHTML = '<i class="fa-solid fa-play"></i>';
    if (playBtn) playBtn.title = "Lancer le timelapse";
    if (stopBtn) stopBtn.style.display = 'none';
    if (container) container.classList.remove('playing');
    if (progressContainer) progressContainer.style.display = 'none';
    if (progressText) progressText.style.display = 'none';
    if (progressBar) progressBar.style.width = '0%';
    
    // Restore latest date if playing was stopped
    const dateSelect = document.getElementById('date-select');
    if (dateSelect && availableDates.length > 0 && dateSelect.value !== availableDates[0]) {
        dateSelect.value = availableDates[0];
        fetchDashboardData();
    }
}

// Toggle play/pause
function toggleTimelapse() {
    if (timelapseIsPlaying) {
        pauseTimelapse();
    } else {
        startTimelapse();
    }
}

// Cycle speed: 2s -> 1s -> 4s -> 2s
function cycleTimelapseSpeed() {
    const indicator = document.getElementById('timelapse-speed-indicator');
    if (!indicator) return;
    
    if (timelapseSpeed === 2000) {
        timelapseSpeed = 1000;
        indicator.textContent = '1s';
    } else if (timelapseSpeed === 1000) {
        timelapseSpeed = 4000;
        indicator.textContent = '4s';
    } else {
        timelapseSpeed = 2000;
        indicator.textContent = '2s';
    }
    
    // If playing, restart the step delay
    if (timelapseIsPlaying) {
        if (timelapseTimer) {
            clearTimeout(timelapseTimer);
        }
        timelapseTimer = setTimeout(runTimelapseStep, timelapseSpeed);
    }
    
    showTransientToast(`Intervalle réglé à ${timelapseSpeed / 1000}s`, "success");
}

// Promise-safe frame-rate safe step execution
function runTimelapseStep() {
    if (!timelapseIsPlaying) return;
    
    const chronoDates = [...availableDates].reverse();
    if (timelapseCurrentIndex >= chronoDates.length) {
        stopTimelapse();
        showTransientToast("Timelapse terminé !", "success");
        return;
    }
    
    const targetDate = chronoDates[timelapseCurrentIndex];
    const dateSelect = document.getElementById('date-select');
    if (dateSelect) {
        dateSelect.value = targetDate;
    }
    
    // Update progress bar and text day-by-day
    const progressBar = document.getElementById('timelapse-progress-bar');
    const progressText = document.getElementById('timelapse-progress-text');
    if (chronoDates.length > 0) {
        const pct = Math.round(((timelapseCurrentIndex + 1) / chronoDates.length) * 100);
        if (progressBar) progressBar.style.width = `${pct}%`;
        if (progressText) progressText.textContent = `${timelapseCurrentIndex + 1}/${chronoDates.length}`;
    }
    
    prorataLabelEl.innerText = "TIMELAPSE...";
    const categorySelect = document.getElementById('category-select');
    const category = categorySelect ? categorySelect.value : 'All';
    
    let queryDate = targetDate;
    if (activeView === 'realisation') {
        const idx = availableDates.indexOf(targetDate);
        if (idx > 0) {
            queryDate = availableDates[idx - 1];
        }
    }
    
    fetch(`/api/data?category=${encodeURIComponent(category)}&date=${encodeURIComponent(queryDate)}&_=${Date.now()}`)
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success' && timelapseIsPlaying) {
                rawDashboardData = res.data;
                applyTaxMode();
                updateDashboard();
                populateFilters();
                
                prorataLabelEl.innerText = `TIMELAPSE: ${dashboardData.workdays.elapsed}/${dashboardData.workdays.total} J`;
                
                // Move to next index for the next frame
                timelapseCurrentIndex++;
                
                // Wait for speed delay, then run the next frame
                timelapseTimer = setTimeout(runTimelapseStep, timelapseSpeed);
            } else {
                stopTimelapse();
            }
        })
        .catch(err => {
            console.error("Timelapse fetch error:", err);
            stopTimelapse();
            showTransientToast("Erreur lors du timelapse.", "error");
        });
}

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
        dropdownText.textContent = 'Sélectionner un vendeur';
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
    if (!dropdownMenu) return;

    const isOpen = dropdownMenu.classList.toggle('open');
    if (dropdownToggle) {
        dropdownToggle.classList.toggle('open', isOpen);
    }

    if (isOpen) {
        // Focus search input
        setTimeout(() => {
            const searchInput = document.getElementById('vendeur-dropdown-search');
            if (searchInput) searchInput.focus();
        }, 50);
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
    if (!dropdownList) return;

    if (filteredVendeursList.length === 0) {
        dropdownList.innerHTML = '<div class="dropdown-empty"><i class="fa-solid fa-users-slash"></i><span>Aucun vendeur trouvé</span></div>';
        return;
    }

    // Show count header
    const countHtml = `<div style="padding: 0.5rem 0.85rem; font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-color); background: var(--bg-color);"><i class="fa-solid fa-list"></i> ${filteredVendeursList.length} vendeur${filteredVendeursList.length > 1 ? 's' : ''} disponible${filteredVendeursList.length > 1 ? 's' : ''}</div>`;
    const itemsHtml = filteredVendeursList.map((vendeur) => {
        const isSelected = selectedVendeurForReport === vendeur;
        const itemStyle = 'display: flex; align-items: center; gap: 0.75rem; padding: 0.7rem 0.85rem; margin-bottom: 0.25rem; border-radius: 6px; cursor: pointer; border: 1px solid var(--border-color); background: var(--card-bg); color: var(--text-main); font-size: 0.85rem;';
        const selectedStyle = isSelected ? ' border-color: var(--primary-color); background: rgba(0, 212, 255, 0.15);' : '';
        return `
            <div class="dropdown-item ${isSelected ? 'selected' : ''}" data-vendeur="${vendeur}" style="${itemStyle}${selectedStyle}">
                <i class="fa-solid fa-user-tie" style="color: var(--primary-color); font-size: 0.85rem; width: 16px; text-align: center; flex-shrink: 0;"></i>
                <span class="dropdown-item-text" style="flex: 1; color: var(--text-main); font-size: 0.85rem;">${vendeur}</span>
                ${isSelected ? '<i class="fa-solid fa-check" style="color: var(--primary-color); font-size: 0.9rem;"></i>' : ''}
            </div>
        `;
    }).join('');

    dropdownList.innerHTML = countHtml + itemsHtml;

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
    const resetVendeurBtn = document.getElementById('reset-vendeur-selection-btn');
    if (!display) return;
    if (selectedVendeurForReport) {
        display.innerHTML = `<i class="fa-solid fa-user-check" style="color: var(--neon-blue);"></i> <span style="color: var(--neon-blue); font-weight: 600;">${selectedVendeurForReport}</span>`;
        if (resetVendeurBtn) resetVendeurBtn.style.display = 'inline-block';
    } else {
        display.innerHTML = '<i class="fa-solid fa-user-check"></i> <span style="color: var(--text-muted);">Aucun vendeur sélectionné (Génération globale)</span>';
        if (resetVendeurBtn) resetVendeurBtn.style.display = 'none';
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
    // Get selected options
    const options = getSelectedAnalysisOptions();
    const selectedOptions = Object.keys(options).filter(k => options[k]);

    if (selectedOptions.length === 0) {
        showToast("Veuillez sélectionner au moins une option d'analyse", "warning");
        return;
    }

    const vendeurForReport = selectedVendeurForReport;

    // Update dashboard selection if a specific vendor is selected
    if (vendeurForReport) {
        if (typeof selectFilter === 'function') {
            selectFilter('vendeur', vendeurForReport);
        } else {
            currentSelection = { type: 'vendeur', name: vendeurForReport };
            if (typeof updateDashboard === 'function') {
                updateDashboard();
            }
        }
    }

    // Open AI report for the selected vendeur and options
    openAiReportModalForVendeur(vendeurForReport, options);
}

// Redirects header/modal calls to the new tab page
function openAiReportModal() {
    if (timelapseIsPlaying) stopTimelapse();
    window.location.href = '/rapport';
}

// Open AI Report for a specific vendeur (displays in the tab panel, not modal)
function openAiReportModalForVendeur(vendeurName, options = null) {
    const modal = document.getElementById('ai-report-modal'); // Keep reference for backwards compatibility
    const loading = document.getElementById('report-loading');
    const content = document.getElementById('report-content-wrapper');
    const generateBtn = document.getElementById('generate-vendeur-report-btn');
    const initialState = document.getElementById('report-initial-state');
    const actionsHeader = document.getElementById('report-actions-header');

    const copyBtn = document.getElementById('copy-report-btn');
    const downloadBtn = document.getElementById('download-report-btn');
    const okBtn = document.getElementById('ok-report-btn');
    const titleEl = document.getElementById('report-title-display') || document.getElementById('report-modal-title');

    // Show the result panel (hidden by default until first generate)
    const resultPanel = document.getElementById('rp-result-panel');
    if (resultPanel) resultPanel.style.display = 'block';

    if (modal) modal.classList.add('open');
    if (actionsHeader) actionsHeader.style.display = 'none';
    if (loading) loading.style.display = 'flex';
    if (content) content.style.display = 'none';

    if (copyBtn) copyBtn.style.display = 'none';
    if (downloadBtn) downloadBtn.style.display = 'none';
    if (okBtn) okBtn.style.display = 'none';

    if (generateBtn) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> EN COURS...';
    }

    const categorySelect = document.getElementById('category-select');
    const selectedCategory = categorySelect ? categorySelect.value : 'All';

    const dateSelect = document.getElementById('date-select');
    const selectedDate = dateSelect ? dateSelect.value : 'default';

    let url = '/api/generate_report';
    const params = [`tax_mode=${currentTaxMode}`];
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

    // Start Veo canvas animation
    startVeoAnimation();

    fetch(url, {
        method: 'POST'
    })
    .then(res => res.json())
    .then(data => {
        if (data.status === 'success') {
            if (loading) loading.style.display = 'none';
            if (content) content.style.display = 'block';
            if (actionsHeader) actionsHeader.style.display = 'flex';

            // Clear any previously queued charts
            window.reportChartsToRender = [];

            // Store the report text so the WhatsApp button can read it later
            currentReportText = data.report || '';
            currentReportTitle = (titleEl && titleEl.innerText) ? titleEl.innerText : 'Rapport IA';
            currentReportVendeur = vendeurName || '';

            if (content) content.innerHTML = parseMarkdown(data.report);

            // Render the charts!
            renderReportCharts();

            if (copyBtn) copyBtn.style.display = 'inline-block';
            if (downloadBtn) downloadBtn.style.display = 'inline-block';
            if (okBtn) okBtn.style.display = 'inline-block';
            const whatsappBtn = document.getElementById('whatsapp-report-btn');
            if (whatsappBtn) whatsappBtn.style.display = 'inline-flex';

            stopVeoAnimation(true);
        } else {
            stopVeoAnimation(false);
            closeAiReportModal();
            showToast("Erreur de génération du rapport: " + data.message, "error");
        }
    })
    .catch(err => {
        console.error(err);
        stopVeoAnimation(false);
        closeAiReportModal();
        showToast("Erreur de connexion lors de l'analyse IA.", "error");
    })
    .finally(() => {
        const aiIcon = document.getElementById('ai-report-icon');
        const aiLabel = document.getElementById('ai-report-label');
        const aiBtn = document.getElementById('ai-report-btn');
        if (aiIcon) aiIcon.className = 'fa-solid fa-brain';
        if (aiLabel) aiLabel.innerText = 'ANALYSE IA';
        if (aiBtn) aiBtn.disabled = false;
        
        if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.innerHTML = '<i class="fa-solid fa-brain"></i> GÉNÉRER LE RAPPORT';
        }
    });
}

// Resets/Clears the report view in the tab panel
function closeAiReportModal() {
    const modal = document.getElementById('ai-report-modal');
    currentReportVendeur = '';
    currentVendeurWhatsappMessage = '';
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
    
    const loading = document.getElementById('report-loading');
    const content = document.getElementById('report-content-wrapper');
    const actionsHeader = document.getElementById('report-actions-header');
    const resultPanel = document.getElementById('rp-result-panel');

    // Hide the entire result panel on reset
    if (resultPanel) resultPanel.style.display = 'none';
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'none';
    if (actionsHeader) actionsHeader.style.display = 'none';

    stopVeoAnimation();
}

// Build a WhatsApp-friendly version of the current AI report.
// WhatsApp has a hard limit (~65k chars for media, ~4k for the URL parameter
// used by wa.me), so we trim and adapt the markdown to plain text.
function buildWhatsappReportText() {
    if (!currentReportText) {
        return '';
    }
    // Convert common markdown to plain text
    let txt = currentReportText
        // Headings
        .replace(/^#+\s+(.*)$/gm, '*$1*')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '*$1*')
        // Italic (single asterisks already converted above)
        .replace(/_(.+?)_/g, '_$1_')
        // Bullets
        .replace(/^\s*[-*]\s+/gm, '• ')
        // Tables: keep simple text, drop pipes & dashes
        .replace(/^\|.*\|$/gm, (line) => line.replace(/\|/g, '  ').replace(/[-:]+/g, '').trim())
        // Code fences
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`([^`]+)`/g, '$1');

    // Compose a clean, short header + body
    const header = (currentReportTitle || 'Rapport IA') + '\n' + '='.repeat((currentReportTitle || 'Rapport IA').length) + '\n\n';
    const fullText = header + txt;

    // Hard cap to keep the wa.me URL within reasonable limits
    const MAX = 3500;
    if (fullText.length > MAX) {
        return fullText.substring(0, MAX) + '\n\n… [Rapport tronqué pour WhatsApp, voir le dashboard pour la version complète]';
    }
    return fullText;
}

// Short pointer message used when sending the rapport as a PDF.
// (The PDF is downloaded separately and the user attaches it manually
// in WhatsApp.)
function buildPdfPointerMessage() {
    const v = currentReportVendeur || (currentSelection && currentSelection.type === 'vendeur' ? currentSelection.name : '') || '';
    if (v) {
        return `Bonjour,\n\nVeuillez trouver ci-joint le rapport de performance de ${v} (KPI Analytics).\n\nLe PDF a été téléchargé sur votre appareil — il suffit de le joindre à ce message.\n\nCordialement,\n— KPI Analytics`;
    }
    return `Bonjour,\n\nVeuillez trouver ci-joint le rapport de performance global de l'agence (KPI Analytics).\n\nLe PDF a été téléchargé sur votre appareil — il suffit de le joindre à ce message.\n\nCordialement,\n— KPI Analytics`;
}

// Open WhatsApp with the current report pre-filled.
// If `phone` is provided (digits only, including country code), the chat
// is opened directly with that number. Otherwise WhatsApp lets the user
// pick the recipient.
//
// `format` is 'text' (default) or 'pdf':
//   - 'text': wa.me/?text=<full rapport>  (current behaviour)
//   - 'pdf' : the rapport is rendered as a PDF, downloaded to the user's
//             machine, then wa.me opens with a short pointer message.
//             The user attaches the downloaded PDF manually in the chat.
function sendReportViaWhatsapp(phone, format) {
    format = format || 'text';
    if (format === 'pdf') {
        return sendReportPdfViaWhatsapp(phone);
    }
    const text = currentVendeurWhatsappMessage || buildWhatsappReportText();
    if (!text) {
        showToast("Aucun rapport à envoyer. Générez d'abord un rapport.", "warning");
        return;
    }
    const encoded = encodeURIComponent(text);
    let url;
    if (phone && /^\+?\d{6,}$/.test(phone.replace(/[\s-]/g, ''))) {
        const cleanPhone = phone.replace(/[\s+\-]/g, '');
        url = `https://wa.me/${cleanPhone}?text=${encoded}`;
    } else {
        url = `https://wa.me/?text=${encoded}`;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast("WhatsApp ouvert avec le rapport pré-rempli.", "success");
}

// PDF variant: render the current report to a PDF, trigger a download,
// then open WhatsApp with a short "voir PDF ci-joint" message.
function sendReportPdfViaWhatsapp(phone) {
    const element = document.getElementById('report-content-wrapper');
    if (!element || element.style.display === 'none') {
        showToast("Aucun rapport disponible à exporter en PDF.", "error");
        return;
    }
    const selectedVendeur = (currentReportVendeur || (currentSelection && currentSelection.type === 'vendeur' ? currentSelection.name : null)) || '';
    const filename = selectedVendeur
        ? `Rapport_KPI_${selectedVendeur.replace(/\s+/g, '_')}.pdf`
        : 'Rapport_KPI_Agence_Agadir.pdf';
    const shortMsg = selectedVendeur
        ? `Bonjour,\n\nVeuillez trouver ci-joint le rapport de performance de ${selectedVendeur} (KPI Analytics).\n\nCordialement,\n— KPI Analytics`
        : `Bonjour,\n\nVeuillez trouver ci-joint le rapport de performance global de l'agence (KPI Analytics).\n\nCordialement,\n— KPI Analytics`;

    showPdfOverlay();
    element.classList.add('pdf-print-mode');
    advancePdfStep(1);

    // Freeze Chart.js canvases as static images so html2canvas captures them
    setTimeout(() => {
        advancePdfStep(2);
        const restoreCharts = freezeChartsForPdf(element);

        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.97 },
            html2canvas:  {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                scrollX: 0,
                scrollY: -window.scrollY,
                windowWidth: 794
            },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };
        advancePdfStep(3);
        return html2pdf().set(opt).from(element).outputPdf('blob')
            .then((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 5000);

                // Open WhatsApp with the short pointer message
                const encoded = encodeURIComponent(shortMsg);
                let waUrl;
                if (phone && /^\+?\d{6,}$/.test(phone.replace(/[\s-]/g, ''))) {
                    const cleanPhone = phone.replace(/[\s+\-]/g, '');
                    waUrl = `https://wa.me/${cleanPhone}?text=${encoded}`;
                } else {
                    waUrl = `https://wa.me/?text=${encoded}`;
                }
                advancePdfStep(4);
                setTimeout(() => {
                    hidePdfOverlay(true);
                    window.open(waUrl, '_blank', 'noopener,noreferrer');
                }, 400);
            })
            .catch((err) => {
                console.error('PDF generation failed', err);
                hidePdfOverlay(false);
                showToast('Erreur lors de la génération du PDF.', 'error');
            })
            .finally(() => {
                restoreCharts();
                element.classList.remove('pdf-print-mode');
            });
    }, 300);
}

// Small modal that asks for an optional phone number, then opens WhatsApp.
function openWhatsappShareDialog() {
    if (!currentReportText) {
        showToast("Aucun rapport à envoyer. Générez d'abord un rapport.", "warning");
        return;
    }
    // Build a small inline modal dynamically (no extra CSS needed —
    // reuses .modal-backdrop / .cyber-modal styling already in the page).
    let overlay = document.getElementById('whatsapp-share-modal');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'whatsapp-share-modal';
        overlay.className = 'modal-backdrop';
        overlay.innerHTML = `
            <div class="cyber-modal" style="max-width: 460px;">
                <div class="modal-header">
                    <h3 style="color: #25D366;"><i class="fa-brands fa-whatsapp"></i> ENVOYER VIA WHATSAPP</h3>
                    <button class="close-btn" id="whatsapp-share-close-btn" title="Fermer">&times;</button>
                </div>
                <div class="modal-body">
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">
                        <i class="fa-solid fa-circle-info"></i>
                        Le rapport sera copié dans le message WhatsApp. Si le rapport a été
                        généré pour un vendeur, son numéro est <b>récupéré automatiquement depuis
                        la base FDV</b> — vous pouvez le corriger ci-dessous si besoin.
                    </p>
                    <div class="form-group" id="whatsapp-share-vendeur-row" style="display:none;">
                        <label class="tech-label"><i class="fa-solid fa-user"></i> VENDEUR</label>
                        <div class="font-mono" id="whatsapp-share-vendeur" style="color:var(--neon-blue); font-weight:600;"></div>
                    </div>
                    <div class="form-group">
                        <label class="tech-label"><i class="fa-solid fa-phone"></i> NUMÉRO WHATSAPP</label>
                        <input type="tel" id="whatsapp-share-phone" class="cyber-input" placeholder="Ex: 212600000000 (indicatif +212 pour Maroc)">
                        <div id="whatsapp-share-fdv-info" style="display:none; margin-top:.4rem; font-size:.72rem; color:var(--neon-green);">
                            <i class="fa-solid fa-database"></i> <span id="whatsapp-share-fdv-info-text"></span>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top: 1rem;">
                        <label class="tech-label"><i class="fa-solid fa-file-export"></i> FORMAT D'ENVOI</label>
                        <div style="display:flex; gap:.5rem;">
                            <label id="whatsapp-share-fmt-text-label" class="cyber-select" style="flex:1; cursor:pointer; display:flex; align-items:center; gap:.5rem; padding:.6rem .8rem; border-radius:6px; background:rgba(37,211,102,0.12); border-color:#25D366;">
                                <input type="radio" name="whatsapp-share-format" value="text" checked style="accent-color:#25D366;">
                                <span><i class="fa-solid fa-message"></i> <b>Texte</b><br><small style="color:var(--text-muted);">Rapport complet collé dans le message</small></span>
                            </label>
                            <label id="whatsapp-share-fmt-pdf-label" class="cyber-select" style="flex:1; cursor:pointer; display:flex; align-items:center; gap:.5rem; padding:.6rem .8rem; border-radius:6px;">
                                <input type="radio" name="whatsapp-share-format" value="pdf" style="accent-color:#f87171;">
                                <span><i class="fa-solid fa-file-pdf" style="color:#f87171;"></i> <b>PDF</b><br><small style="color:var(--text-muted);">PDF téléchargé, à joindre manuellement</small></span>
                            </label>
                        </div>
                    </div>
                    <div class="form-group" style="margin-top: 1rem;">
                        <label class="tech-label"><i class="fa-solid fa-eye"></i> APERÇU DU MESSAGE</label>
                        <pre id="whatsapp-share-preview" class="font-mono" style="background: rgba(0,0,0,0.4); border: 1px solid var(--border-color); border-radius: 4px; padding: 0.75rem; max-height: 220px; overflow-y: auto; font-size: 0.72rem; white-space: pre-wrap; word-break: break-word; color: var(--text-main);"></pre>
                    </div>
                    <button id="whatsapp-share-send-btn" class="cyber-btn-submit" style="margin-top: 1rem; width: 100%; background: #25D366; color: #fff; border-color: #25D366;">
                        <i class="fa-brands fa-whatsapp"></i> <span id="whatsapp-share-send-label">OUVRIR WHATSAPP</span>
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Close on backdrop click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeWhatsappShareDialog();
        });
        document.getElementById('whatsapp-share-close-btn').addEventListener('click', closeWhatsappShareDialog);
        document.getElementById('whatsapp-share-send-btn').addEventListener('click', () => {
            const phoneInput = document.getElementById('whatsapp-share-phone');
            const fmtRadio = document.querySelector('input[name="whatsapp-share-format"]:checked');
            const format = fmtRadio ? fmtRadio.value : 'text';
            sendReportViaWhatsapp(phoneInput ? phoneInput.value.trim() : '', format);
            // Don't close the dialog if we're in PDF mode — the user
            // might want to confirm the download completed first.
            if (format !== 'pdf') {
                closeWhatsappShareDialog();
            }
        });

        // Update label + preview when the user toggles the format
        document.querySelectorAll('input[name="whatsapp-share-format"]').forEach((r) => {
            r.addEventListener('change', () => {
                updateWhatsappFormatUi();
            });
        });
    }

    function updateWhatsappFormatUi() {
        const fmtRadio = document.querySelector('input[name="whatsapp-share-format"]:checked');
        const format = fmtRadio ? fmtRadio.value : 'text';
        const label = document.getElementById('whatsapp-share-send-label');
        const textLabel = document.getElementById('whatsapp-share-fmt-text-label');
        const pdfLabel = document.getElementById('whatsapp-share-fmt-pdf-label');
        const preview = document.getElementById('whatsapp-share-preview');
        if (label) {
            label.textContent = (format === 'pdf') ? 'GÉNÉRER PDF + WHATSAPP' : 'OUVRIR WHATSAPP';
        }
        if (textLabel) textLabel.style.background = (format === 'text') ? 'rgba(37,211,102,0.12)' : '';
        if (textLabel) textLabel.style.borderColor = (format === 'text') ? '#25D366' : '';
        if (pdfLabel)  pdfLabel.style.background  = (format === 'pdf')  ? 'rgba(248,113,113,0.12)' : '';
        if (pdfLabel)  pdfLabel.style.borderColor  = (format === 'pdf')  ? '#f87171' : '';
        if (preview) {
            preview.textContent = (format === 'pdf') ? buildPdfPointerMessage() : (currentVendeurWhatsappMessage || buildWhatsappReportText());
        }
    }

    // Refresh the preview (text or PDF pointer)
    updateWhatsappFormatUi();

    // Reset the FDV hint
    const phoneInput = document.getElementById('whatsapp-share-phone');
    const fdvInfo = document.getElementById('whatsapp-share-fdv-info');
    const fdvInfoText = document.getElementById('whatsapp-share-fdv-info-text');
    const vendeurRow = document.getElementById('whatsapp-share-vendeur-row');
    const vendeurEl = document.getElementById('whatsapp-share-vendeur');
    if (fdvInfo) fdvInfo.style.display = 'none';
    if (vendeurRow) vendeurRow.style.display = 'none';
    if (phoneInput) phoneInput.value = '';

    // If the report was generated for a specific vendeur, fetch the
    // phone number and optimized WhatsApp message from the backend.
    if (currentReportVendeur && phoneInput) {
        if (vendeurRow) vendeurRow.style.display = '';
        if (vendeurEl) vendeurEl.textContent = currentReportVendeur;
        
        // Show placeholder during fetch
        const previewEl = document.getElementById('whatsapp-share-preview');
        const fmtRadio = document.querySelector('input[name="whatsapp-share-format"]:checked');
        const format = fmtRadio ? fmtRadio.value : 'text';
        if (previewEl && format === 'text') {
            previewEl.textContent = "Génération du rapport WhatsApp optimisé...";
        }
        
        // Fast lookup to auto-fill the phone number instantly (6ms)
        fetch('/api/fdv?vendeur=' + encodeURIComponent(currentReportVendeur))
            .then((r) => r.json())
            .then((d) => {
                if (d.status === 'success' && d.rows && d.rows.length > 0) {
                    const row = d.rows[0];
                    const rawPhone = row.whatsapp || row.telephone || '';
                    if (rawPhone) {
                        phoneInput.value = rawPhone.replace(/^\+/, '').trim();
                        if (fdvInfo) {
                            fdvInfo.style.display = '';
                            fdvInfo.style.color = 'var(--neon-green)';
                        }
                        if (fdvInfoText) {
                            fdvInfoText.textContent = 'Numéro récupéré depuis la base FDV. Vous pouvez le modifier ci-dessus.';
                        }
                        phoneInput.focus();
                    } else {
                        if (fdvInfo) {
                            fdvInfo.style.display = '';
                            fdvInfo.style.color = 'var(--neon-amber)';
                        }
                        if (fdvInfoText) {
                            fdvInfoText.textContent = 'Ce vendeur est dans la FDV mais n\'a pas de numéro WhatsApp — renseignez-le ci-dessus.';
                        }
                    }
                }
            })
            .catch((e) => console.error('FDV fast lookup failed', e));

        // Slow lookup to fetch the optimized message text
        fetch('/api/fdv/whatsapp_link?vendeur=' + encodeURIComponent(currentReportVendeur) + '&include_rapport=true')
            .then((r) => r.json())
            .then((d) => {
                if (d.status === 'success' && d.message) {
                    currentVendeurWhatsappMessage = d.message;
                    if (d.phone && !phoneInput.value) {
                        phoneInput.value = d.phone.replace(/^\+/, '').trim();
                        if (fdvInfo) {
                            fdvInfo.style.display = '';
                            fdvInfo.style.color = 'var(--neon-green)';
                        }
                        if (fdvInfoText) {
                            fdvInfoText.textContent = 'Numéro récupéré depuis la base FDV. Vous pouvez le modifier ci-dessus.';
                        }
                        phoneInput.focus();
                    }
                }
                updateWhatsappFormatUi();
            })
            .catch((e) => {
                console.error('FDV lookup failed', e);
                updateWhatsappFormatUi();
            });
    }

    overlay.classList.add('open');
    setTimeout(() => {
        if (phoneInput && !phoneInput.value) phoneInput.focus();
    }, 50);
}

function closeWhatsappShareDialog() {
    const overlay = document.getElementById('whatsapp-share-modal');
    if (overlay) overlay.classList.remove('open');
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
// ─── AI REPORT LOADER ────────────────────────────────────────────────────────
const AI_STATUS_MESSAGES = [
    'Initialisation de l\'analyse…',
    'Chargement des données KPI…',
    'Calcul des écarts de performance…',
    'Analyse des tendances mensuelles…',
    'Évaluation des objectifs terrain…',
    'Comparaison avec le prorata temporel…',
    'Identification des points critiques…',
    'Synthèse qualitative en cours…',
    'Rédaction du rapport par l\'IA…',
    'Finalisation du document…',
];

let aiLoaderTimerInterval = null;
let aiLoaderStatusInterval = null;
let aiLoaderProgressInterval = null;

function startVeoAnimation() {
    const shell = document.querySelector('.ai-loader-shell');
    if (!shell) return;

    // Reset state
    const bar   = document.getElementById('ai-loader-bar');
    const timer = document.getElementById('ai-loader-timer');
    const status = document.getElementById('ai-loader-status');
    if (bar)    bar.style.width = '0%';
    if (timer)  timer.textContent = '00:00';
    if (status) status.textContent = AI_STATUS_MESSAGES[0];

    // Timer clock
    let secs = 0;
    if (aiLoaderTimerInterval) clearInterval(aiLoaderTimerInterval);
    aiLoaderTimerInterval = setInterval(() => {
        secs++;
        const m = String(Math.floor(secs / 60)).padStart(2,'0');
        const s = String(secs % 60).padStart(2,'0');
        if (timer) timer.textContent = `${m}:${s}`;
    }, 1000);

    // Rotating status messages
    let msgIdx = 1;
    if (aiLoaderStatusInterval) clearInterval(aiLoaderStatusInterval);
    aiLoaderStatusInterval = setInterval(() => {
        if (!status) return;
        status.style.animation = 'none';
        void status.offsetWidth; // reflow
        status.style.animation = '';
        status.textContent = AI_STATUS_MESSAGES[msgIdx % AI_STATUS_MESSAGES.length];
        msgIdx++;
    }, 2800);

    // Simulated progress bar (fills to ~90%, the last 10% on success)
    let prog = 0;
    if (aiLoaderProgressInterval) clearInterval(aiLoaderProgressInterval);
    aiLoaderProgressInterval = setInterval(() => {
        if (!bar) return;
        const remaining = 90 - prog;
        prog += Math.random() * Math.min(remaining * 0.25, 8);
        prog = Math.min(prog, 90);
        bar.style.width = prog + '%';
    }, 1200);
}

function stopVeoAnimation(success = true) {
    clearInterval(aiLoaderTimerInterval);
    clearInterval(aiLoaderStatusInterval);
    clearInterval(aiLoaderProgressInterval);
    aiLoaderTimerInterval = null;
    aiLoaderStatusInterval = null;
    aiLoaderProgressInterval = null;

    const bar    = document.getElementById('ai-loader-bar');
    const status = document.getElementById('ai-loader-status');
    if (bar)    bar.style.width = success ? '100%' : '0%';
    if (status) status.textContent = success ? 'Rapport généré avec succès !' : 'Erreur lors de l\'analyse.';
}

// ─── PDF OVERLAY ─────────────────────────────────────────────────────────────
function showPdfOverlay() {
    const overlay = document.getElementById('pdf-overlay');
    if (!overlay) return;

    // Reset all steps
    for (let i = 1; i <= 4; i++) {
        const s = document.getElementById(`pdf-step-${i}`);
        if (s) s.className = 'pdf-step';
    }
    const ring  = document.getElementById('pdf-ring-fill');
    const icon  = document.getElementById('pdf-ring-icon');
    const label = document.getElementById('pdf-overlay-label');
    if (ring)  ring.style.strokeDashoffset = '263.9';
    if (icon)  { icon.className = 'fa-solid fa-file-pdf pdf-ring-icon'; }
    if (label) { label.textContent = 'Préparation…'; label.className = 'pdf-overlay-label font-mono'; }

    overlay.style.display = 'flex';
    _pdfStep(1);
}

function _pdfStep(n) {
    const steps = [
        { label: 'Mise en forme du contenu', pct: 0.18 },
        { label: 'Capture des graphiques',   pct: 0.48 },
        { label: 'Génération PDF A4',         pct: 0.82 },
        { label: 'Téléchargement du fichier', pct: 1.00 },
    ];
    for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`pdf-step-${i}`);
        if (!el) continue;
        if (i < n)  el.className = 'pdf-step done';
        else if (i === n) el.className = 'pdf-step active';
        else el.className = 'pdf-step';
    }
    const s = steps[n - 1];
    const ring  = document.getElementById('pdf-ring-fill');
    const label = document.getElementById('pdf-overlay-label');
    if (ring)  ring.style.strokeDashoffset = String(263.9 * (1 - s.pct));
    if (label) label.textContent = s.label + '…';
}

function advancePdfStep(n) { _pdfStep(n); }

function hidePdfOverlay(success = true) {
    const ring  = document.getElementById('pdf-ring-fill');
    const icon  = document.getElementById('pdf-ring-icon');
    const label = document.getElementById('pdf-overlay-label');
    if (ring)  ring.style.strokeDashoffset = '0';
    if (success) {
        if (icon)  icon.className = 'fa-solid fa-circle-check pdf-ring-icon done';
        if (label) { label.textContent = 'PDF Téléchargé !'; label.className = 'pdf-overlay-label font-mono done'; }
        for (let i = 1; i <= 4; i++) {
            const s = document.getElementById(`pdf-step-${i}`);
            if (s) s.className = 'pdf-step done';
        }
    }
    setTimeout(() => {
        const overlay = document.getElementById('pdf-overlay');
        if (overlay) overlay.style.display = 'none';
    }, success ? 1200 : 800);
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
        
    showPdfOverlay();
    
    // Apply printing visual mode override
    element.classList.add('pdf-print-mode');
    advancePdfStep(1);

    // Freeze Chart.js canvases as static images so html2canvas captures them
    setTimeout(() => {
        advancePdfStep(2);
        const restoreCharts = freezeChartsForPdf(element);
    
        const opt = {
            margin:       [10, 10, 10, 10],
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.97 },
            html2canvas:  {
                scale: 2,
                useCORS: true,
                allowTaint: true,
                logging: false,
                scrollX: 0,
                scrollY: -window.scrollY,
                windowWidth: 794
            },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };

        advancePdfStep(3);
        html2pdf().set(opt).from(element).save()
            .then(() => {
                advancePdfStep(4);
                setTimeout(() => hidePdfOverlay(true), 400);
            })
            .catch(err => {
                console.error(err);
                hidePdfOverlay(false);
                showToast('Erreur PDF: ' + err, 'error');
            })
            .finally(() => {
                restoreCharts();
                element.classList.remove('pdf-print-mode');
            });
    }, 300);
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
    let isDailySalesTable = headers.some(h => h.toLowerCase().includes('date')) && headers.some(h => h.toLowerCase().includes('ventes réelles')) && headers.some(h => h.toLowerCase().includes('objectif du jour'));
    
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
        // 32 px per seller row + 80 px for legend/axes
        const rankChartH = Math.max(400, dataRows.length * 32 + 80);
        html += `
        <div class="report-chart-card rank-chart-card">
            <div class="report-chart-header">
                <span class="tech-label"><i class="fa-solid fa-trophy neon-text-amber"></i> CLASSEMENT DES PERFORMANCES</span>
            </div>
            <div class="report-chart-body" style="height: ${rankChartH}px;">
                <canvas id="${chartCanvasId}"></canvas>
            </div>
        </div>
        `;
        
        if (!window.reportChartsToRender) window.reportChartsToRender = [];
        
        let items = [];
        dataRows.forEach(row => {
            if (row.length >= 3) {
                let seller = row[0].replace(/\*\*/g, '').trim();
                let realVal = parseFloat(row[1].replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '')) || 0;
                let objVal = parseFloat(row[2].replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '')) || 0;
                items.push({ seller, realVal, objVal });
            }
        });
        
        // Sort by realVal ascending (A to B)
        items.sort((a, b) => a.realVal - b.realVal);
        
        let labels = items.map(x => x.seller);
        let realVals = items.map(x => x.realVal);
        let objVals = items.map(x => x.objVal);
        
        window.reportChartsToRender.push({
            id: chartCanvasId,
            type: 'rank',
            data: { labels, realVals, objVals }
        });
    }
    // 5. If it's a daily sales table, render a bar chart comparing daily sales
    else if (isDailySalesTable && dataRows.length > 0) {
        html += `
        <div class="report-chart-card">
            <div class="report-chart-header">
                <span class="tech-label"><i class="fa-solid fa-chart-bar neon-text-pink"></i> VENTES QUOTIDIENNES NON CUMULÉES (DH)</span>
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
                let realVal = parseFloat(row[1].replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '')) || 0;
                let objVal = parseFloat(row[2].replace(/,/g, '').replace(/\s/g, '').replace(/\*/g, '')) || 0;
                
                labels.push(label);
                realVals.push(realVal);
                objVals.push(objVal);
            }
        });
        
        window.reportChartsToRender.push({
            id: chartCanvasId,
            type: 'dailySales',
            data: { labels, realVals, objVals }
        });
    }
    
    // Render the table
    if (!isDailySalesTable && !isRankTable) {
        html += `<div class="report-table-wrapper"><table class="cyber-table report-table"><thead><tr>`;
        headers.forEach(h => {
            html += `<th>${h.replace(/\*\*/g, '').trim()}</th>`;
        });
        html += `</tr></thead><tbody>`;
        
        dataRows.forEach(row => {
            let isCARow = row.length > 0 && (row[0].replace(/\*\*/g, '').trim().toUpperCase().includes('C.A (HT)') || row[0].replace(/\*\*/g, '').trim().toUpperCase().includes('C.A (TTC)'));
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
    }
    
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
                    animation: { duration: 0 },
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
                    animation: { duration: 0 },
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
            
            // Highlight currentReportVendeur if it matches the label
            const activeVendeurNormalized = (currentReportVendeur || '').trim().toUpperCase();
            
            const backgroundColors = labels.map(label => {
                const normalizedLabel = label.replace(/\(Sélectionné\)/gi, '').trim().toUpperCase();
                if (activeVendeurNormalized && normalizedLabel === activeVendeurNormalized) {
                    return neonPink + 'a0';
                }
                return neonAmber + '60';
            });
            
            const borderColors = labels.map(label => {
                const normalizedLabel = label.replace(/\(Sélectionné\)/gi, '').trim().toUpperCase();
                if (activeVendeurNormalized && normalizedLabel === activeVendeurNormalized) {
                    return neonPink;
                }
                return neonAmber;
            });

            const borderWidths = labels.map(label => {
                const normalizedLabel = label.replace(/\(Sélectionné\)/gi, '').trim().toUpperCase();
                if (activeVendeurNormalized && normalizedLabel === activeVendeurNormalized) {
                    return 2.5;
                }
                return 1.5;
            });

            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Réalisé (DH)',
                            data: realVals,
                            backgroundColor: backgroundColors,
                            borderColor: borderColors,
                            borderWidth: borderWidths
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
                    animation: { duration: 0 },
                    indexAxis: 'y',
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
        } else if (chartConfig.type === 'dailySales') {
            const { labels, realVals, objVals } = chartConfig.data;
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Vente Réelle (DH)',
                            data: realVals,
                            backgroundColor: neonPink + '80',
                            borderColor: neonPink,
                            borderWidth: 1.5,
                            borderRadius: 4
                        },
                        {
                            label: 'Objectif du Jour (DH)',
                            data: objVals,
                            backgroundColor: isLight ? 'rgba(71, 85, 105, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                            borderColor: isLight ? '#475569' : '#94a3b8',
                            borderWidth: 1.5,
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    animation: { duration: 0 },
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

// Converts all Chart.js canvas elements inside `element` to static <img> tags
// so that html2canvas can capture them correctly in the PDF.
// Returns a cleanup function that restores the original canvases.
function freezeChartsForPdf(element) {
    const canvases = Array.from(element.querySelectorAll('canvas'));
    const swaps = [];
    canvases.forEach(canvas => {
        try {
            // Snapshot the canvas at its current rendered state
            const dataUrl = canvas.toDataURL('image/png');
            const img = document.createElement('img');
            img.src = dataUrl;
            // Use fluid sizing so the image scales to fit the PDF column width
            // (A4 printable area is ~794px at 96dpi; fixed px would overflow)
            img.style.width      = '100%';
            img.style.height     = 'auto';
            img.style.display    = 'block';
            img.style.maxWidth   = '100%';
            canvas.parentNode.insertBefore(img, canvas);
            canvas.style.display = 'none';
            swaps.push({ canvas, img });
        } catch(e) {
            // cross-origin canvas – skip
        }
    });
    return function restoreCharts() {
        swaps.forEach(({ canvas, img }) => {
            canvas.style.display = '';
            img.remove();
        });
    };
}

// System Alerts engine (KPI dashboard design guidelines)
function updateSystemAlerts(quantiRecords, qualiRecords, focusVmm, focusSom, wDays) {
    const container = document.getElementById('alerts-container');
    if (!container) return;
    
    container.innerHTML = '';
    const alerts = [];

    // 1. Identify underperforming sellers (0 CA)
    const caRecords = quantiRecords.filter(r => r.famille === 'C.A (ht)' || r.famille === 'C.A (TTC)');
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
    fetch('/api/suivi_dates?_=' + Date.now())
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
let detailsDailySalesChartInstance = null;
let detailsQualiChartInstance = null;
let perDayQualiCharts = [];
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
            // Real navigation so the URL reflects the current page.
            window.location.href = '/details';
        });

        const goBack = (e) => {
            e.preventDefault();
            // Navigate to the Tableau de bord (the default landing page).
            window.location.href = '/';
        };

        navDashboard.addEventListener('click', goBack);
        if (backBtn) {
            backBtn.addEventListener('click', goBack);
        }
    }

    // Auto-load trends data when the page is opened directly at /details
    if (window.location.pathname === '/details') {
        const familySelect = document.getElementById('details-family-select');
        loadTrendsData(familySelect ? familySelect.value : 'C.A (TTC)');
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


function loadTrendsData(family = 'C.A (TTC)') {
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

    fetch(`/api/trends?family=${encodeURIComponent(family)}&category=${encodeURIComponent(category)}&_=${Date.now()}`)
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                rawTrendsData = data;
                applyTrendsTaxMode();

                // Populate Family Select dropdown if it has only one option
                if (familySelect && familySelect.options.length <= 1 && data.families.length > 0) {
                    const currentVal = familySelect.value;
                    familySelect.innerHTML = '<option value="C.A (TTC)">C.A (TTC)</option>';
                    data.families.forEach(f => {
                        if (f.trim().toUpperCase() !== 'C.A (HT)' && f.trim().toUpperCase() !== 'C.A (TTC)') {
                            const opt = document.createElement('option');
                            opt.value = f;
                            opt.innerText = f;
                            familySelect.appendChild(opt);
                        }
                    });
                    familySelect.value = currentVal || 'C.A (TTC)';
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
    
    // Render daily non-cumulative sales chart
    renderDailySalesChart(dates, realPoints, objPoints, formattedLabels, isWhiteMode, neonPink, neonBlue);
    
    // Render Qualitative trends chart and table
    renderQualiTrends(vendeursList);
}

function renderDailySalesChart(dates, realPoints, objPoints, formattedLabels, isWhiteMode, neonPink, neonBlue) {
    const canvas = document.getElementById('details-daily-sales-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (detailsDailySalesChartInstance) {
        detailsDailySalesChartInstance.destroy();
    }
    
    const dailyRealPoints = [];
    const dailyObjPoints = [];
    
    for (let i = 0; i < realPoints.length; i++) {
        if (i === 0) {
            const isFirstDayLegacy = (dates[0] === '2026-06-01' && realPoints.length > 1);
            if (isFirstDayLegacy && realPoints[0] > realPoints[1] * 2) {
                dailyRealPoints.push(0);
            } else {
                dailyRealPoints.push(realPoints[0]);
            }
            
            if (isFirstDayLegacy && objPoints[0] > objPoints[1] * 2) {
                dailyObjPoints.push(0);
            } else {
                dailyObjPoints.push(objPoints[0]);
            }
        } else {
            const dReal = realPoints[i] - realPoints[i-1];
            dailyRealPoints.push(dReal >= 0 ? dReal : realPoints[i]);
            
            const dObj = objPoints[i] - objPoints[i-1];
            dailyObjPoints.push(dObj >= 0 ? dObj : objPoints[i]);
        }
    }
    
    detailsDailySalesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: formattedLabels,
            datasets: [
                {
                    label: 'Vente Réelle (DH)',
                    data: dailyRealPoints,
                    backgroundColor: neonPink + '80', // Pink bar with 50% opacity
                    borderColor: neonPink,
                    borderWidth: 1.5,
                    borderRadius: 4,
                    borderSkipped: 'bottom'
                },
                {
                    label: 'Objectif du Jour (DH)',
                    data: dailyObjPoints,
                    backgroundColor: isWhiteMode ? 'rgba(71, 85, 105, 0.12)' : 'rgba(148, 163, 184, 0.12)',
                    borderColor: isWhiteMode ? '#475569' : '#94a3b8',
                    borderWidth: 1.5,
                    borderRadius: 4,
                    borderSkipped: 'bottom'
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
                            return formatNumber(value) + ' DH';
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
                            return `${datasetLabel} : ${formatNumber(val)} DH`;
                        }
                    }
                }
            }
        }
    });
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
                    <th>Réalisé (${currentTaxMode})</th>
                    <th>Objectif (${currentTaxMode})</th>
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
        const pctClass = devPct >= 0 ? 'neon-text-green' : (devPct < -20 ? 'neon-text-pink' : 'neon-text-amber');
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

        // Check if the date already exists in the database
        if (availableDates.includes(item.date)) {
            const dateParts = item.date.split('-');
            const formattedDate = dateParts.length === 3 ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}` : item.date;
            const confirmOverwrite = confirm(`Les données pour la date ${formattedDate} (fichier ${item.file.name}) existent déjà. Voulez-vous les remplacer ?`);
            if (!confirmOverwrite) {
                if (statusEl) {
                    statusEl.className = 'multi-file-status fail';
                    statusEl.innerText = 'annulé';
                }
                if (itemEl) {
                    itemEl.classList.remove('pending');
                    itemEl.classList.add('error');
                }
                failCount++;
                continue;
            }
        }

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
                loadTrendsData(familySelect ? familySelect.value : 'C.A (TTC)');
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
        fetch('/api/reload-check?_=' + Date.now())
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


/* ----------------------------------------------------
   CLIENTS FULL TAB
   ---------------------------------------------------- */

// State held by the clients view. `cfFilters` mirrors the URL params sent
// to /api/clients_full. `cfOptions` caches the distinct values used to
// populate the advanced-filter dropdowns.
const cfState = {
    filters: {
        search: '',
        secteurs: [],
        localites: [],
        vendeurs_som: [],
        vendeurs_vmm: [],
        is_repeat: null,        // null | 0 | 1
        sort_by: 'row_index',
        sort_dir: 'ASC',
    },
    view: 'all',                // 'all' | 'unique'
    unique_codes_count: 0,      // total unique codes (cached from /stats)
    page: 1,
    per_page: 25,
    total: 0,
    total_pages: 1,
    options: {
        secteurs: [],
        localites: [],
        vendeurs_som: [],
        vendeurs_vmm: [],
    },
};

function initClientsView() {
    const navClients = document.getElementById('nav-clients');
    const navDashboard = document.getElementById('nav-dashboard');
    const navDetails = document.getElementById('nav-details');
    const mainDashboard = document.getElementById('main-dashboard-container');
    const detailsContainer = document.getElementById('details-container');
    const clientsContainer = document.getElementById('clients-container');
    const backBtn = document.getElementById('cf-back');
    const dateSelect = document.getElementById('date-select');

    if (!navClients || !clientsContainer) return;

    const goToClients = (e) => {
        if (e) e.preventDefault();
        // Use real navigation so the URL reflects the current page
        // and refresh / share-link / back-button all work correctly.
        window.location.href = '/clients';
    };

    const goBackFromClients = (e) => {
        if (e) e.preventDefault();
        // Navigate to the Tableau de bord (the default landing page).
        window.location.href = '/';
    };

    navClients.addEventListener('click', goToClients);
    if (backBtn) backBtn.addEventListener('click', goBackFromClients);

    // Search input (debounced)
    const searchInput = document.getElementById('cf-search');
    if (searchInput) {
        let searchTimer = null;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                cfState.filters.search = searchInput.value.trim();
                cfState.page = 1;
                loadClientsData();
            }, 300);
        });
    }

    // Reset button
    const resetBtn = document.getElementById('cf-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            cfState.filters = {
                search: '',
                secteurs: [],
                localites: [],
                vendeurs_som: [],
                vendeurs_vmm: [],
                is_repeat: null,
                sort_by: 'row_index',
                sort_dir: 'ASC',
            };
            cfState.page = 1;
            if (searchInput) searchInput.value = '';
            // Reset all multi-selects
            document.querySelectorAll('.cf-multi-select').forEach(sel => {
                sel.dataset.selected = '[]';
                const lbl = sel.querySelector('.cf-multi-label');
                if (lbl) {
                    lbl.textContent = lbl.dataset.placeholder || lbl.textContent;
                }
                sel.querySelectorAll('.cf-multi-option').forEach(opt => {
                    const cb = opt.querySelector('input[type=checkbox]');
                    if (cb) cb.checked = false;
                    opt.classList.remove('is-checked');
                });
            });
            renderActiveChips();
            loadClientsData();
        });
    }

    // Export button
    const exportBtn = document.getElementById('cf-export');
    if (exportBtn) {
        exportBtn.addEventListener('click', () => {
            const params = buildClientsQueryString();
            window.location.href = '/api/clients_full/export?' + params;
        });
    }

    // Repeat select removed (DONT REPETE column no longer shown)

    // Per-page select
    const perPageSel = document.getElementById('cf-per-page');
    if (perPageSel) {
        perPageSel.addEventListener('change', () => {
            cfState.per_page = Number(perPageSel.value) || 25;
            cfState.page = 1;
            loadClientsData();
        });
    }

    // View toggle: TOUS / UNIQUES
    document.querySelectorAll('.cf-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const newView = btn.dataset.view;
            if (newView === cfState.view) return;
            cfState.view = newView;
            cfState.page = 1;
            // Update toggle UI
            document.querySelectorAll('.cf-view-btn').forEach(b => {
                b.classList.toggle('is-active', b.dataset.view === newView);
            });
            loadClientsData();
        });
    });

    // Advanced filter toggle
    const advToggle = document.getElementById('cf-toggle-advanced');
    const advPanel = document.getElementById('cf-advanced-panel');
    const advChevron = document.getElementById('cf-advanced-chevron');
    if (advToggle && advPanel) {
        advToggle.addEventListener('click', () => {
            const isOpen = advPanel.style.display !== 'none';
            advPanel.style.display = isOpen ? 'none' : 'block';
            if (advChevron) advChevron.style.transform = isOpen ? '' : 'rotate(180deg)';
        });
    }

    // Pagination buttons
    const firstBtn = document.getElementById('cf-page-first');
    const prevBtn = document.getElementById('cf-page-prev');
    const nextBtn = document.getElementById('cf-page-next');
    const lastBtn = document.getElementById('cf-page-last');
    if (firstBtn) firstBtn.addEventListener('click', () => goToPage(1));
    if (prevBtn) prevBtn.addEventListener('click', () => goToPage(Math.max(1, cfState.page - 1)));
    if (nextBtn) nextBtn.addEventListener('click', () => goToPage(Math.min(cfState.total_pages, cfState.page + 1)));
    if (lastBtn) lastBtn.addEventListener('click', () => goToPage(cfState.total_pages));

    // Sortable headers
    document.querySelectorAll('#cf-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (cfState.filters.sort_by === col) {
                cfState.filters.sort_dir = cfState.filters.sort_dir === 'ASC' ? 'DESC' : 'ASC';
            } else {
                cfState.filters.sort_by = col;
                cfState.filters.sort_dir = 'ASC';
            }
            loadClientsData();
        });
    });

    // Close multi-selects when clicking outside
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.cf-multi-select.is-open').forEach(sel => {
            if (!sel.contains(e.target)) {
                sel.classList.remove('is-open');
                const menu = sel.querySelector('.cf-multi-menu');
                if (menu) menu.style.display = 'none';
                const toggle = sel.querySelector('.cf-multi-toggle');
                if (toggle) toggle.classList.remove('is-open');
            }
        });
    });
}

function goToPage(p) {
    if (p < 1 || p > cfState.total_pages) return;
    cfState.page = p;
    loadClientsData();
}

function buildClientsQueryString() {
    const f = cfState.filters;
    const params = new URLSearchParams();
    if (f.search) params.set('search', f.search);
    if (f.secteurs.length) params.set('secteurs', f.secteurs.join(','));
    if (f.localites.length) params.set('localites', f.localites.join(','));
    if (f.vendeurs_som.length) params.set('vendeurs_som', f.vendeurs_som.join(','));
    if (f.vendeurs_vmm.length) params.set('vendeurs_vmm', f.vendeurs_vmm.join(','));
    if (f.is_repeat !== null) params.set('is_repeat', String(f.is_repeat));
    if (cfState.view === 'unique') params.set('unique', '1');
    params.set('sort_by', f.sort_by);
    params.set('sort_dir', f.sort_dir);
    params.set('page', String(cfState.page));
    params.set('per_page', String(cfState.per_page));
    return params.toString();
}

async function loadClientsData() {
    const loading = document.getElementById('cf-loading');
    const empty = document.getElementById('cf-empty');
    const tbody = document.getElementById('cf-tbody');
    if (loading) loading.style.display = 'block';
    if (empty) empty.style.display = 'none';

    try {
        const qs = buildClientsQueryString();
        const [listRes, statsRes, filtRes] = await Promise.all([
            fetch('/api/clients_full?' + qs + '&_=' + Date.now()).then(r => r.json()),
            fetch('/api/clients_full/stats?_=' + Date.now()).then(r => r.json()),
            fetch('/api/clients_full/filters?_=' + Date.now()).then(r => r.json()),
        ]);

        if (listRes.status !== 'success') {
            throw new Error(listRes.message || 'Erreur inconnue');
        }

        // Cache filter options
        if (filtRes.status === 'success') {
            cfState.options = filtRes.filters;
            populateAdvancedFilters();
        }

        // Render stats (KPI cards)
        if (statsRes.status === 'success') {
            const s = statsRes.stats;
            const totalEl = document.getElementById('cf-total');
            const uniqueEl = document.getElementById('cf-unique');
            const repeatEl = document.getElementById('cf-repeats');
            if (totalEl) totalEl.textContent = s.total.toLocaleString('fr-FR');
            if (uniqueEl) uniqueEl.textContent = s.unique_codes.toLocaleString('fr-FR');
            if (repeatEl) repeatEl.textContent = s.repeats.toLocaleString('fr-FR');
            // Update view toggle badges
            const allCount = document.getElementById('cf-view-count-all');
            const uniqueCount = document.getElementById('cf-view-count-unique');
            if (allCount) allCount.textContent = s.total.toLocaleString('fr-FR');
            if (uniqueCount) uniqueCount.textContent = s.unique_codes.toLocaleString('fr-FR');
            cfState.unique_codes_count = s.unique_codes;
        }

        cfState.total = listRes.total;
        cfState.total_pages = listRes.total_pages;
        cfState.page = listRes.page;
        cfState.per_page = listRes.per_page;

        // Filtered count
        const filteredEl = document.getElementById('cf-filtered');
        if (filteredEl) filteredEl.textContent = listRes.total.toLocaleString('fr-FR');

        // Render table
        renderClientsTable(listRes.rows);
        renderPagination();

        const badge = document.getElementById('cf-table-badge');
        if (badge) badge.textContent = `${listRes.total.toLocaleString('fr-FR')} LIGNES`;

        if (listRes.rows.length === 0 && listRes.total === 0) {
            if (empty) empty.style.display = 'block';
        }

        // Refresh chips and multi-select UI
        renderActiveChips();
        document.querySelectorAll('.cf-multi-select').forEach(sel => {
            const fk = sel.dataset.filter;
            const cfg = {
                filterKey: fk,
                label: sel.querySelector('.cf-multi-label')?.dataset.placeholder || '',
            };
            refreshMultiSelectState(sel, cfg);
        });
    } catch (e) {
        console.error('loadClientsData error:', e);
        showToast('Erreur chargement clients: ' + e.message, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

function renderClientsTable(rows) {
    const tbody = document.getElementById('cf-tbody');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '';
        return;
    }
    const html = rows.map(r => {
        const repeatClass = r.is_repeat ? 'cf-row-repeat' : '';
        return `
            <tr class="${repeatClass}">
                <td class="cf-code-cell">${escapeHtml(r.code)}</td>
                <td>${escapeHtml(r.name)}</td>
                <td>${escapeHtml(r.secteur)}</td>
                <td>${escapeHtml(r.localite)}</td>
                <td>${escapeHtml(r.vendeur_som)}</td>
                <td>${escapeHtml(r.vendeur_vmm)}</td>
            </tr>
        `;
    }).join('');
    tbody.innerHTML = html;

    // Highlight sorted column
    const sortCol = cfState.filters.sort_by;
    const sortDir = cfState.filters.sort_dir;
    document.querySelectorAll('#cf-table th[data-sort]').forEach(th => {
        th.classList.toggle('is-sorted', th.dataset.sort === sortCol);
        let arrow = th.querySelector('.sort-arrow');
        if (!arrow) {
            arrow = document.createElement('span');
            arrow.className = 'sort-arrow';
            th.appendChild(arrow);
        }
        if (th.dataset.sort === sortCol) {
            arrow.innerHTML = sortDir === 'ASC' ? '▲' : '▼';
        } else {
            arrow.innerHTML = '↕';
        }
    });
}

function renderPagination() {
    const info = document.getElementById('cf-pagination-info');
    const indicator = document.getElementById('cf-page-indicator');
    if (info) {
        const start = cfState.total === 0 ? 0 : (cfState.page - 1) * cfState.per_page + 1;
        const end = Math.min(cfState.page * cfState.per_page, cfState.total);
        info.textContent = `Affichage ${start.toLocaleString('fr-FR')}\u2013${end.toLocaleString('fr-FR')} sur ${cfState.total.toLocaleString('fr-FR')}`;
    }
    if (indicator) {
        indicator.textContent = `Page ${cfState.page} / ${cfState.total_pages}`;
    }
    const first = document.getElementById('cf-page-first');
    const prev = document.getElementById('cf-page-prev');
    const next = document.getElementById('cf-page-next');
    const last = document.getElementById('cf-page-last');
    if (first) first.disabled = cfState.page <= 1;
    if (prev) prev.disabled = cfState.page <= 1;
    if (next) next.disabled = cfState.page >= cfState.total_pages;
    if (last) last.disabled = cfState.page >= cfState.total_pages;
}

function populateAdvancedFilters() {
    const configs = [
        { key: 'secteurs', label: 'Tous les secteurs', filterKey: 'secteurs' },
        { key: 'localites', label: 'Toutes les localités', filterKey: 'localites' },
        { key: 'vendeurs_som', label: 'Tous les vendeurs SOM', filterKey: 'vendeurs_som' },
        { key: 'vendeurs_vmm', label: 'Tous les vendeurs VMM', filterKey: 'vendeurs_vmm' },
    ];
    configs.forEach(cfg => {
        const sel = document.querySelector(`.cf-multi-select[data-filter="${cfg.filterKey}"]`);
        if (!sel) return;
        const toggle = sel.querySelector('.cf-multi-toggle');
        const lbl = sel.querySelector('.cf-multi-label');
        const menu = sel.querySelector('.cf-multi-menu');
        if (!toggle || !menu) return;

        lbl.dataset.placeholder = cfg.label;
        const values = cfState.options[cfg.key] || [];

        // Skip full rebuild if the menu is already populated for the right size
        if (sel.dataset.optionsLen === String(values.length) && menu.dataset.built === '1') {
            // Just refresh checked state and label
            refreshMultiSelectState(sel, cfg);
            return;
        }

        // Build menu
        menu.innerHTML = `
            <input type="text" class="cf-multi-search" placeholder="Rechercher...">
            <div class="cf-multi-actions">
                <button type="button" data-act="all">Tout</button>
                <button type="button" data-act="none">Aucun</button>
            </div>
            <div class="cf-multi-options"></div>
        `;
        const optsContainer = menu.querySelector('.cf-multi-options');
        optsContainer.innerHTML = values.map(v => `
            <label class="cf-multi-option" data-value="${escapeAttr(v)}">
                <input type="checkbox" value="${escapeAttr(v)}">
                <span>${escapeHtml(v)}</span>
            </label>
        `).join('');
        if (values.length === 0) {
            optsContainer.innerHTML = '<div class="cf-multi-empty">Aucune valeur</div>';
        }
        menu.dataset.built = '1';
        sel.dataset.optionsLen = String(values.length);

        // Toggle menu on click
        toggle.onclick = (e) => {
            e.stopPropagation();
            const isOpen = sel.classList.contains('is-open');
            // Close all other menus
            document.querySelectorAll('.cf-multi-select.is-open').forEach(s => {
                if (s !== sel) {
                    s.classList.remove('is-open');
                    s.querySelector('.cf-multi-menu').style.display = 'none';
                    s.querySelector('.cf-multi-toggle').classList.remove('is-open');
                }
            });
            if (isOpen) {
                sel.classList.remove('is-open');
                menu.style.display = 'none';
                toggle.classList.remove('is-open');
            } else {
                sel.classList.add('is-open');
                menu.style.display = 'block';
                toggle.classList.add('is-open');
                const searchInput = menu.querySelector('.cf-multi-search');
                if (searchInput) {
                    setTimeout(() => searchInput.focus(), 30);
                }
            }
        };

        // Search filter inside menu
        const searchInput = menu.querySelector('.cf-multi-search');
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const q = searchInput.value.toLowerCase();
                optsContainer.querySelectorAll('.cf-multi-option').forEach(opt => {
                    const v = (opt.dataset.value || '').toLowerCase();
                    opt.style.display = v.includes(q) ? '' : 'none';
                });
            });
            searchInput.addEventListener('click', e => e.stopPropagation());
        }

        // Select all / none
        menu.querySelector('[data-act="all"]').onclick = (e) => {
            e.stopPropagation();
            optsContainer.querySelectorAll('.cf-multi-option').forEach(opt => {
                const cb = opt.querySelector('input[type=checkbox]');
                if (cb && opt.style.display !== 'none') cb.checked = true;
            });
            commitMultiSelect(sel, cfg);
        };
        menu.querySelector('[data-act="none"]').onclick = (e) => {
            e.stopPropagation();
            optsContainer.querySelectorAll('.cf-multi-option input[type=checkbox]').forEach(cb => {
                cb.checked = false;
            });
            commitMultiSelect(sel, cfg);
        };

        // Checkbox change
        optsContainer.querySelectorAll('.cf-multi-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const cb = opt.querySelector('input[type=checkbox]');
                if (e.target !== cb) cb.checked = !cb.checked;
                commitMultiSelect(sel, cfg);
            });
            const cb = opt.querySelector('input[type=checkbox]');
            if (cb) {
                cb.addEventListener('click', e => e.stopPropagation());
                cb.addEventListener('change', () => commitMultiSelect(sel, cfg));
            }
        });

        refreshMultiSelectState(sel, cfg);
    });
}

function refreshMultiSelectState(sel, cfg) {
    const lbl = sel.querySelector('.cf-multi-label');
    if (!lbl) return;
    const selected = cfState.filters[cfg.filterKey] || [];

    // Remove old count badge if any
    const oldBadge = sel.querySelector('.cf-multi-count');
    if (oldBadge) oldBadge.remove();

    if (selected.length === 0) {
        lbl.textContent = cfg.label;
        lbl.classList.add('is-empty');
        lbl.classList.remove('has-selection');
    } else {
        lbl.textContent = selected.length === 1
            ? selected[0]
            : `${selected.length} sélectionnés`;
        lbl.classList.remove('is-empty');
        lbl.classList.add('has-selection');
        // Add count badge
        const badge = document.createElement('span');
        badge.className = 'cf-multi-count';
        badge.textContent = String(selected.length);
        lbl.parentElement.appendChild(badge);
    }

    sel.querySelectorAll('.cf-multi-option').forEach(opt => {
        const cb = opt.querySelector('input[type=checkbox]');
        if (!cb) return;
        const checked = selected.includes(cb.value);
        cb.checked = checked;
        opt.classList.toggle('is-checked', checked);
    });
}

function commitMultiSelect(sel, cfg) {
    const checked = Array.from(sel.querySelectorAll('.cf-multi-option input[type=checkbox]:checked'))
        .map(cb => cb.value);
    cfState.filters[cfg.filterKey] = checked;
    cfState.page = 1;
    refreshMultiSelectState(sel, cfg);
    loadClientsData();
}

function renderActiveChips() {
    const wrap = document.getElementById('cf-active-chips');
    if (!wrap) return;
    const f = cfState.filters;
    const chips = [];

    if (f.search) {
        chips.push({
            label: `RECH: "${f.search}"`,
            cls: '',
            onRemove: () => {
                f.search = '';
                const inp = document.getElementById('cf-search');
                if (inp) inp.value = '';
                cfState.page = 1;
                loadClientsData();
            },
        });
    }
    f.secteurs.forEach(v => chips.push({
        label: `SECTEUR: ${v}`,
        onRemove: () => removeFromMulti('secteurs', v),
    }));
    f.localites.forEach(v => chips.push({
        label: `LOCALITÉ: ${v}`,
        onRemove: () => removeFromMulti('localites', v),
    }));
    f.vendeurs_som.forEach(v => chips.push({
        label: `SOM: ${v}`,
        onRemove: () => removeFromMulti('vendeurs_som', v),
    }));
    f.vendeurs_vmm.forEach(v => chips.push({
        label: `VMM: ${v}`,
        onRemove: () => removeFromMulti('vendeurs_vmm', v),
    }));

    if (chips.length === 0) {
        wrap.innerHTML = '';
        return;
    }
    wrap.innerHTML = chips.map(c => `
        <span class="cf-chip ${c.cls || ''}">
            ${escapeHtml(c.label)}
            <i class="fa-solid fa-xmark cf-chip-remove"></i>
        </span>
    `).join('');
    wrap.querySelectorAll('.cf-chip').forEach((el, i) => {
        el.querySelector('.cf-chip-remove').addEventListener('click', () => {
            const c = chips[i];
            if (c.onRemove) c.onRemove();
        });
    });
}

function removeFromMulti(filterKey, value) {
    const arr = cfState.filters[filterKey] || [];
    cfState.filters[filterKey] = arr.filter(v => v !== value);
    cfState.page = 1;
    // Refresh the corresponding dropdown UI
    const sel = document.querySelector(`.cf-multi-select[data-filter="${filterKey}"]`);
    const cfg = { filterKey };
    if (sel) refreshMultiSelectState(sel, cfg);
    loadClientsData();
}

// ====================================================
// LAYOUT MANAGER (DRAG & DROP, COLLAPSE, HIDE/SHOW)
// ====================================================

function initLayoutManager() {
    const layoutLeft = document.querySelector('.layout-left');
    const layoutRight = document.querySelector('.layout-right');
    if (!layoutLeft || !layoutRight) return;

    // 1. Load layout states from localStorage
    const savedLayout = localStorage.getItem('dashboard-layout-states');
    if (savedLayout) {
        try {
            layoutStates = JSON.parse(savedLayout);
            if (!layoutStates.visible) layoutStates.visible = {};
            if (!layoutStates.collapsed) layoutStates.collapsed = {};
            if (!layoutStates.order) layoutStates.order = { left: [], right: [] };
        } catch (e) {
            console.error("Error parsing layout states:", e);
        }
    }

    // 2. Restore order of cards
    if (layoutStates.order.left && layoutStates.order.left.length > 0) {
        layoutStates.order.left.forEach(id => {
            const card = document.getElementById(id);
            if (card) layoutLeft.appendChild(card);
        });
    }
    if (layoutStates.order.right && layoutStates.order.right.length > 0) {
        layoutStates.order.right.forEach(id => {
            const card = document.getElementById(id);
            if (card) layoutRight.appendChild(card);
        });
    }

    // 3. Set up each card (Draggable, collapse buttons, close buttons, restored states)
    const cards = [
        'quanti-chart-card',
        'quali-chart-card',
        'radar-chart-card',
        'focus-card',
        'chakib-families-progress-card',
        'chakib-focus-progress-card',
        'quanti-table-card',
        'quali-table-card',
        'alerts-section'
    ];

    cards.forEach(cardId => {
        const card = document.getElementById(cardId);
        if (!card) return;

        // Ensure card has a default draggable state of false
        card.setAttribute('draggable', 'false');

        // Dynamically inject header action buttons
        const header = card.querySelector('.card-header');
        if (header) {
            // Check if action container already exists to avoid double injection
            let actions = header.querySelector('.card-actions');
            if (!actions) {
                actions = document.createElement('div');
                actions.className = 'card-actions';
                actions.style.cssText = 'margin-left: auto; display: flex; gap: 0.5rem; align-items: center; z-index: 10;';
                
                const isCollapsed = layoutStates.collapsed[cardId] === true;
                const collapseIcon = isCollapsed ? 'fa-chevron-down' : 'fa-chevron-up';
                
                actions.innerHTML = `
                    <button class="card-action-btn collapse-btn" title="Minimiser/Maximiser" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px 6px; font-size: 0.8rem; transition: color 0.2s;">
                        <i class="fa-solid ${collapseIcon}"></i>
                    </button>
                    <button class="card-action-btn hide-btn" title="Masquer" style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 2px 6px; font-size: 0.8rem; transition: color 0.2s;">
                        <i class="fa-solid fa-eye-slash"></i>
                    </button>
                `;
                header.appendChild(actions);

                // Setup button listeners
                const collapseBtn = actions.querySelector('.collapse-btn');
                collapseBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleCardCollapse(cardId);
                });

                const hideBtn = actions.querySelector('.hide-btn');
                hideBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    setCardVisibility(cardId, false);
                });
            }

            // Draggable mouse trigger helpers (only drag when active on header, excluding actions)
            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('.card-actions') || e.target.closest('button')) {
                    return;
                }
                card.setAttribute('draggable', 'true');
            });
            header.addEventListener('mouseup', () => {
                card.setAttribute('draggable', 'false');
            });
            header.addEventListener('mouseleave', () => {
                card.setAttribute('draggable', 'false');
            });
        }

        // Setup HTML5 Drag and Drop events
        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', cardId);
            e.dataTransfer.effectAllowed = 'move';
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            card.setAttribute('draggable', 'false');
            // Save the new layout order
            saveLayoutOrder();
        });

        // Restore collapsed state
        if (layoutStates.collapsed[cardId] === true) {
            applyCardCollapse(cardId, true);
        }

        // Restore visibility state
        applyCardVisibility(cardId);
    });

    // 4. Set up sidebar checkboxes
    Object.keys(checkboxMap).forEach(cardId => {
        const checkboxId = checkboxMap[cardId];
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            // Remove any old event listeners by cloning
            const newCheckbox = checkbox.cloneNode(true);
            checkbox.parentNode.replaceChild(newCheckbox, checkbox);

            newCheckbox.addEventListener('change', (e) => {
                setCardVisibility(cardId, e.target.checked);
            });
        }
    });

    // Support secondary config checkbox for alerts-section
    const configAlertsCheckbox = document.getElementById('toggle-alerts-section-config');
    if (configAlertsCheckbox) {
        const newConfigCb = configAlertsCheckbox.cloneNode(true);
        configAlertsCheckbox.parentNode.replaceChild(newConfigCb, configAlertsCheckbox);
        newConfigCb.addEventListener('change', (e) => {
            setCardVisibility('alerts-section', e.target.checked);
        });
    }

    // 5. Setup Dragover on containers
    [layoutLeft, layoutRight].forEach(container => {
        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingCard = document.querySelector('.dragging');
            if (!draggingCard) return;

            const afterElement = getDragAfterElement(container, e.clientY);
            if (afterElement == null) {
                container.appendChild(draggingCard);
            } else {
                container.insertBefore(draggingCard, afterElement);
            }
        });
    });
}

function toggleCardCollapse(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    const isCurrentlyCollapsed = card.classList.contains('collapsed');
    const targetCollapse = !isCurrentlyCollapsed;
    
    layoutStates.collapsed[cardId] = targetCollapse;
    saveLayoutStates();
    applyCardCollapse(cardId, targetCollapse);
}

function applyCardCollapse(cardId, isCollapsed) {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    if (isCollapsed) {
        card.classList.add('collapsed');
    } else {
        card.classList.remove('collapsed');
    }
    
    // Toggle card children visibility
    Array.from(card.children).forEach(child => {
        if (!child.classList.contains('card-header') && !child.classList.contains('card-edge')) {
            child.style.display = isCollapsed ? 'none' : '';
        }
    });
    
    // Update chevron icon in actions
    const collapseBtn = card.querySelector('.collapse-btn i');
    if (collapseBtn) {
        if (isCollapsed) {
            collapseBtn.className = 'fa-solid fa-chevron-down';
        } else {
            collapseBtn.className = 'fa-solid fa-chevron-up';
        }
    }
}

function setCardVisibility(cardId, isVisible) {
    layoutStates.visible[cardId] = isVisible;
    saveLayoutStates();
    applyCardVisibility(cardId);
}

function applyCardVisibility(cardId) {
    const card = document.getElementById(cardId);
    if (!card) return;
    
    const isVisibleInManager = layoutStates.visible[cardId] !== false;
    
    let shouldBeVisible = isVisibleInManager;
    if (cardId === 'chakib-families-progress-card' || cardId === 'chakib-focus-progress-card') {
        const isChakib = currentSelection && currentSelection.type === 'vendeur' && currentSelection.name.trim().toUpperCase() === 'CHAKIB ELFIL';
        shouldBeVisible = isVisibleInManager && isChakib;
    }
    
    card.style.display = shouldBeVisible ? '' : 'none';
    
    // Update sidebar checkbox
    const checkboxId = checkboxMap[cardId];
    if (checkboxId) {
        const checkbox = document.getElementById(checkboxId);
        if (checkbox) {
            checkbox.checked = isVisibleInManager;
        }
    }

    // Also sync the secondary config checkbox for alerts-section if present
    if (cardId === 'alerts-section') {
        const configCheckbox = document.getElementById('toggle-alerts-section-config');
        if (configCheckbox) {
            configCheckbox.checked = isVisibleInManager;
        }
    }
}

function saveLayoutOrder() {
    const layoutLeft = document.querySelector('.layout-left');
    const layoutRight = document.querySelector('.layout-right');
    if (!layoutLeft || !layoutRight) return;
    
    layoutStates.order.left = [...layoutLeft.querySelectorAll('.cyber-card')].map(c => c.id);
    layoutStates.order.right = [...layoutRight.querySelectorAll('.cyber-card')].map(c => c.id);
    
    saveLayoutStates();
}

function saveLayoutStates() {
    localStorage.setItem('dashboard-layout-states', JSON.stringify(layoutStates));
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.cyber-card:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Initialise on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClientsView);
} else {
    initClientsView();
}

// Auto-load on /clients route
if (window.location.pathname === '/clients') {
    setTimeout(loadClientsData, 100);
}

// HTML escape helpers (used by the clients table / chips)
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeAttr(s) {
    if (s === null || s === undefined) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderChakibFocusProgress(historyData, settings, totalDays) {
    if (!historyData) return;
    
    const glaceCdz = (historyData.glace && historyData.glace.cdz) ? historyData.glace.cdz : [];
    const tomateCdz = (historyData.tomate && historyData.tomate.cdz) ? historyData.tomate.cdz : [];
    
    // Filter for CHAKIB EL FIL
    const chakibGlace = glaceCdz.filter(r => (r.cdz || '').replace(/\s+/g, '').toUpperCase() === 'CHAKIBELFIL');
    const chakibTomate = tomateCdz.filter(r => (r.cdz || '').replace(/\s+/g, '').toUpperCase() === 'CHAKIBELFIL');
    
    // Get all unique sorted dates
    const allDates = [...new Set([
        ...chakibGlace.map(r => r.upload_date.substring(0, 10)),
        ...chakibTomate.map(r => r.upload_date.substring(0, 10))
    ])].sort();
    
    // Populate Table
    const tbody = document.getElementById('chakib-focus-progress-tbody');
    if (tbody) {
        tbody.innerHTML = '';
        allDates.forEach(date => {
            const gRec = chakibGlace.find(r => r.upload_date.startsWith(date));
            const tRec = chakibTomate.find(r => r.upload_date.startsWith(date));
            
            const gDev = gRec ? Math.round(gRec.deviation * 100) : null;
            const tDev = tRec ? Math.round(tRec.deviation * 100) : null;
            
            const gText = gDev !== null ? (gDev > 0 ? '+' : '') + gDev + '%' : 'N/A';
            const tText = tDev !== null ? (tDev > 0 ? '+' : '') + tDev + '%' : 'N/A';
            
            // Color codes
            const gColorClass = gDev !== null ? (gDev >= 0 ? 'neon-text-green' : (gDev >= -20 ? 'neon-text-amber' : 'neon-text-pink')) : '';
            const tColorClass = tDev !== null ? (tDev >= 0 ? 'neon-text-green' : (tDev >= -20 ? 'neon-text-amber' : 'neon-text-pink')) : '';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${date}</td>
                <td class="${gColorClass}">${gText}</td>
                <td class="${tColorClass}">${tText}</td>
            `;
            tbody.appendChild(tr);
        });
    }
    
    // Render Line Chart
    const canvas = document.getElementById('chakib-focus-progress-chart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (chakibFocusChartInstance) {
        chakibFocusChartInstance.destroy();
    }
    
    const isWhiteMode = document.body.classList.contains('light-mode');
    const styles = getComputedStyle(document.body);
    const neonBlue = (styles.getPropertyValue('--neon-blue').trim() || '#00d4ff').substring(0, 7);
    const neonGreen = (styles.getPropertyValue('--neon-green').trim() || '#4cbb17').substring(0, 7);
    const neonPink = (styles.getPropertyValue('--neon-pink').trim() || '#ff2d55').substring(0, 7);
    const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);
    const gridColor = isWhiteMode ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
    const textColor = isWhiteMode ? '#334155' : '#e2e8f0';
    
    // Date formatting helper
    const formatShortDate = (dateStr) => {
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
        const idx = parseInt(parts[1]) - 1;
        return `${parts[2]} ${months[idx] || parts[1]}`;
    };
    
    const labels = allDates.map(formatShortDate);
    
    const glaceData = allDates.map(date => {
        const r = chakibGlace.find(x => x.upload_date.startsWith(date));
        return r ? Math.round(r.deviation * 100) : null;
    });
    
    const tomateData = allDates.map(date => {
        const r = chakibTomate.find(x => x.upload_date.startsWith(date));
        return r ? Math.round(r.deviation * 100) : null;
    });
    
    const prorataDeviations = allDates.map(date => {
        const rest = settings ? settings[date] : null;
        if (rest === null || rest === undefined) return null;
        const elapsed = totalDays - rest;
        const prorataVal = (elapsed / totalDays - 1.0) * 100;
        return Math.round(prorataVal);
    });
    
    chakibFocusChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Glace (SOM) (%)',
                    data: glaceData,
                    borderColor: neonBlue,
                    backgroundColor: neonBlue + '15',
                    borderWidth: 2.5,
                    pointBackgroundColor: neonBlue,
                    pointRadius: 4,
                    fill: false,
                    tension: 0.15
                },
                {
                    label: 'Tomate Frito (VMM) (%)',
                    data: tomateData,
                    borderColor: neonPink,
                    backgroundColor: neonPink + '15',
                    borderWidth: 2.5,
                    pointBackgroundColor: neonPink,
                    pointRadius: 4,
                    fill: false,
                    tension: 0.15
                },
                {
                    label: 'Cible Partielle (%)',
                    data: prorataDeviations,
                    borderColor: neonAmber,
                    borderWidth: 1.5,
                    borderDash: [5, 5],
                    pointRadius: 0,
                    fill: false,
                    tension: 0.1
                }
            ]
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
                        font: { family: 'JetBrains Mono', size: 9 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const val = context.raw;
                            if (val === null) return ` N/A`;
                            return ` ${context.dataset.label.split(' ')[0]}: ${(val > 0 ? '+' : '') + val}%`;
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
                                return isWhiteMode ? 'rgba(15, 23, 42, 0.6)' : '#00d4ff';
                            }
                            return gridColor;
                        },
                        lineWidth: function (context) {
                            if (context.tick && context.tick.value === 0) return 2;
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
