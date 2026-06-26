/* ------------------------------------------------------------------
 *  Stock View JS Logic
 *  - Handles state for search, filters (site, soc, fournisseur, date), sorting
 *  - Fetches data from /api/stock
 *  - Supports stock excel upload via a drag and drop zone + date picker
 *  - Supports favoriting products with client-side state saved to localStorage
 * ------------------------------------------------------------------ */

(function () {
    'use strict';

    const state = {
        search: '',
        sites: [],
        socs: [],
        fournisseurs: [],
        gammes: [],
        familles: [],
        statuts: [],
        date: '', // Selected stock date (empty is default/latest)
        sort_by: 'Produit',
        sort_dir: 'ASC',
        view: 'all', // 'all' or 'favorites'
        favorites: [], // Array of favorited product codes
        allFetchedRows: [], // Cache for latest server-side rows
        page: 1,
        limit: 50, // Items per page
        qteMin: '',
        qteMax: '',
        options: {
            sites: [],
            socs: [],
            fournisseurs: [],
            gammes: [],
            familles: [],
            statuts: [],
            dates: []
        },
        initialized: false,
        busy: false
    };

    const $ = (id) => document.getElementById(id);
    
    // Elements Cache
    const els = {};

    function cacheEls() {
        els.container = $('stock-container');
        els.search = $('stk-search');
        els.resetBtn = $('stk-reset');
        els.backBtn = $('stk-back');
        els.tbody = $('stk-tbody');
        els.table = $('stk-table');
        els.empty = $('stk-empty');
        els.loading = $('stk-loading');
        els.badge = $('stk-table-badge');
        
        // Summary KPIs
        els.totalProducts = $('stk-total-products');
        els.totalQuantity = $('stk-total-quantity');
        els.filteredProducts = $('stk-filtered-products');
        els.filteredQuantity = $('stk-filtered-quantity');
        
        // Filter widgets
        els.dateSelect = $('stk-filter-date');
        els.sitePills = $('stk-site-pills');
        els.socPills = $('stk-soc-pills');
        els.sortSelect = $('stk-sort-select');
        els.sortDefault = $('stk-sort-default');
        els.fournisseurToggle = $('stk-fournisseur-toggle');
        els.fournisseurMenu = $('stk-fournisseur-menu');
        els.fournisseurSearch = $('stk-fournisseur-search');
        els.fournisseurList = $('stk-fournisseur-list');
        els.fournisseurSelectedText = $('stk-fournisseur-selected-text');
        
        els.gammeToggle = $('stk-gamme-toggle');
        els.gammeMenu = $('stk-gamme-menu');
        els.gammeSearch = $('stk-gamme-search');
        els.gammeList = $('stk-gamme-list');
        els.gammeSelectedText = $('stk-gamme-selected-text');

        // Modal triggers & elements
        els.uploadTrigger = $('stk-upload-trigger');
        els.uploadModal = $('stock-upload-modal');
        els.uploadModalClose = $('close-stock-upload-modal');
        els.uploadModalCancel = $('cancel-stock-upload');
        els.uploadModalSubmit = $('submit-stock-upload');
        els.uploadDateInput = $('stock-upload-date');
        els.dropzone = $('stock-dropzone');
        els.uploadFileInput = $('stock-modal-file-input');
        els.syncGoogleSheet = $('stk-sync-google-sheet');

        // Sub tabs
        els.btnAll = $('stk-btn-all');
        els.btnFav = $('stk-btn-fav');

        // Pagination Elements
        els.pagination = $('stk-pagination');
        els.paginationInfo = $('stk-pagination-info');
        els.pageLimit = $('stk-page-limit');
        els.pagePrev = $('stk-page-prev');
        els.pageNext = $('stk-page-next');
        els.pageNum = $('stk-page-num');

        // Product Details Drawer
        els.productDrawer = $('product-details-drawer');
        els.productDrawerClose = $('close-product-details-drawer');
        els.productDrawerBody = $('product-details-body');

        // Stock Filters Popup Modal
        els.filtersTrigger = $('stk-btn-filters');
        els.filtersModal = $('stock-filters-modal');
        els.filtersClose = $('close-stock-filters-modal');
        els.filtersApply = $('submit-stock-filters');

        // Quick Search Bar
        els.quickSearch = $('stk-quick-search');

        // Quantity range min/max elements
        els.qteMin = $('stk-filter-qte-min');
        els.qteMax = $('stk-filter-qte-max');
        
        els.thFav = $('stk-th-fav');
    }

    // HTML escape helpers
    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Attribute escape helper
    function escapeAttr(s) {
        return escapeHtml(s).replace(/"/g, '&quot;');
    }

    // French date format helper (2026-06-24 -> 24/06/2026)
    function formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return dateStr;
    }

    // Dynamic toast messages
    function toast(message, kind = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, kind);
            return;
        }
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#151823;color:#f4f5fa;padding:10px 16px;border:1px solid #232838;border-radius:8px;z-index:9999;font-family:Inter,sans-serif;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.5);';
        wrap.textContent = message;
        document.body.appendChild(wrap);
        setTimeout(() => wrap.remove(), 2800);
    }

    // Debounce helper for search input
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Initializer
    window.initStockView = async function () {
        cacheEls();
        if (!els.container) return;

        // Load favorites from Database (and fallback to LocalStorage if needed)
        try {
            const resp = await fetch('/api/stock/favorites');
            const data = await resp.json();
            if (data.status === 'success') {
                state.favorites = data.favorites || [];
            } else {
                throw new Error("API error");
            }
        } catch (e) {
            console.warn("Failed to load favorites from database, falling back to LocalStorage:", e);
            try {
                state.favorites = JSON.parse(localStorage.getItem('stk-favorites')) || [];
            } catch (err) {
                state.favorites = [];
            }
        }

        const urlParams = new URLSearchParams(window.location.search);
        const viewParam = urlParams.get('view');
        if (viewParam === 'favorites' || viewParam === 'favorit') {
            state.view = 'favorites';
            if (els.btnFav) els.btnFav.classList.add('is-active');
            if (els.btnAll) els.btnAll.classList.remove('is-active');
        } else {
            state.view = 'all';
            if (els.btnAll) els.btnAll.classList.add('is-active');
            if (els.btnFav) els.btnFav.classList.remove('is-active');
        }

        if (!state.initialized) {
            setupEventListeners();
            setupDragAndDrop();
            state.initialized = true;
        }
        loadStockData();
    };

    // Load data from API
    async function loadStockData() {
        if (state.busy) return;
        state.busy = true;
        
        // Reset page to 1 on fresh reload
        state.page = 1;
        
        if (els.loading) els.loading.style.display = 'block';
        if (els.empty) els.empty.style.display = 'none';
        if (els.tbody) els.tbody.innerHTML = '';
        
        try {
            const params = new URLSearchParams();
            if (state.search) params.set('search', state.search);
            if (state.sites.length) params.set('sites', state.sites.join(','));
            if (state.socs.length) params.set('socs', state.socs.join(','));
            if (state.fournisseurs.length) params.set('fournisseurs', state.fournisseurs.join(','));
            if (state.date) params.set('date', state.date);
            params.set('sort_by', state.sort_by);
            params.set('sort_dir', state.sort_dir);
            
            const response = await fetch('/api/stock?' + params.toString());
            const data = await response.json();
            
            if (data.status === 'success') {
                // Cache server-returned rows
                state.allFetchedRows = data.rows || [];

                // Populate filter options from backend
                if (data.filters) {
                    state.options.sites = data.filters.sites || [];
                    state.options.socs = data.filters.socs || [];
                    state.options.fournisseurs = data.filters.fournisseurs || [];
                }
                
                // Dynamically populate options from actual records for UI lists
                state.options.gammes = [...new Set(state.allFetchedRows.map(r => r['GAMME']))].filter(Boolean).sort();
                state.options.familles = [...new Set(state.allFetchedRows.map(r => r['FAMILLE']))].filter(Boolean).sort();
                state.options.statuts = [...new Set(state.allFetchedRows.map(r => r['Statut']))].filter(Boolean).sort();

                // Render all quick filter pills
                renderQuickFilters();
                
                // Populate date options dropdown
                if (data.dates) {
                    state.options.dates = data.dates || [];
                    populateDateDropdown(data.selected_date);
                }
                
                // Render table
                renderTable(state.allFetchedRows);
            } else {
                toast(data.message || "Erreur de chargement des stocks.", "error");
            }
        } catch (e) {
            console.error("loadStockData error:", e);
            toast("Impossible de charger les données de stock.", "error");
        } finally {
            state.busy = false;
            if (els.loading) els.loading.style.display = 'none';
        }
    }

    // Populate stock dates select list
    function populateDateDropdown(selectedDate) {
        if (!els.dateSelect) return;
        
        const currentSelected = selectedDate || state.date;
        state.date = currentSelected;
        
        const datesList = state.options.dates || [];
        
        const optionsHtml = datesList.map(d => {
            const isSel = d === currentSelected ? 'selected' : '';
            return `<option value="${escapeAttr(d)}" ${isSel}>Stock du ${escapeHtml(formatDate(d))}</option>`;
        }).join('');
        
        if (datesList.length === 0) {
            els.dateSelect.innerHTML = '<option value="">Aucune date disponible</option>';
        } else {
            els.dateSelect.innerHTML = optionsHtml;
        }
    }

    // Render quick pills & dropdown checklists
    function renderQuickFilters() {
        renderPills(els.sitePills, state.options.sites, state.sites, (val) => {
            state.page = 1;
            const idx = state.sites.indexOf(val);
            if (idx > -1) state.sites.splice(idx, 1);
            else state.sites.push(val);
            renderQuickFilters();
            renderTable(state.allFetchedRows);
        });

        renderPills(els.socPills, state.options.socs, state.socs, (val) => {
            state.page = 1;
            const idx = state.socs.indexOf(val);
            if (idx > -1) state.socs.splice(idx, 1);
            else state.socs.push(val);
            renderQuickFilters();
            renderTable(state.allFetchedRows);
        });

        renderFournisseursDropdown();
        renderGammesDropdown();
    }

    function renderFournisseursDropdown() {
        const searchVal = els.fournisseurSearch ? els.fournisseurSearch.value.trim() : '';
        renderDropdownChecklist(
            els.fournisseurList,
            state.options.fournisseurs,
            state.fournisseurs,
            els.fournisseurSelectedText,
            'Tous les fournisseurs',
            (val) => {
                state.page = 1;
                const idx = state.fournisseurs.indexOf(val);
                if (idx > -1) state.fournisseurs.splice(idx, 1);
                else state.fournisseurs.push(val);
                renderFournisseursDropdown();
                renderTable(state.allFetchedRows);
            },
            searchVal
        );
    }

    function renderGammesDropdown() {
        const searchVal = els.gammeSearch ? els.gammeSearch.value.trim() : '';
        renderDropdownChecklist(
            els.gammeList,
            state.options.gammes,
            state.gammes,
            els.gammeSelectedText,
            'Toutes les gammes',
            (val) => {
                state.page = 1;
                const idx = state.gammes.indexOf(val);
                if (idx > -1) state.gammes.splice(idx, 1);
                else state.gammes.push(val);
                renderGammesDropdown();
                renderTable(state.allFetchedRows);
            },
            searchVal
        );
    }

    function renderDropdownChecklist(containerEl, optionList, activeList, selectedTextEl, defaultText, onToggle, searchVal = '') {
        if (!containerEl) return;
        
        let filteredOptions = optionList || [];
        if (searchVal) {
            const q = searchVal.toLowerCase();
            filteredOptions = filteredOptions.filter(opt => opt.toLowerCase().includes(q));
        }

        if (filteredOptions.length === 0) {
            containerEl.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted); padding: 0.5rem; display: block;">Aucune option</span>';
        } else {
            containerEl.innerHTML = filteredOptions.map(val => {
                const isActive = activeList.includes(val);
                return `
                    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.8rem; padding: 0.35rem 0.5rem; cursor: pointer; color: var(--text-main); user-select: none; border-radius: 3px; transition: background 0.2s;" class="stk-check-item">
                        <input type="checkbox" class="stk-check-cb" data-val="${escapeAttr(val)}" ${isActive ? 'checked' : ''} style="accent-color: var(--neon-blue); cursor: pointer;">
                        <span style="${isActive ? 'color: var(--neon-blue); font-weight: 500;' : ''}">${escapeHtml(val)}</span>
                    </label>
                `;
            }).join('');

            // Bind checkbox clicks
            containerEl.querySelectorAll('.stk-check-cb').forEach(cb => {
                cb.onclick = (e) => {
                    e.stopPropagation();
                    const val = cb.dataset.val;
                    onToggle(val);
                };
            });
            
            // Also label clicks to allow clicking the row
            containerEl.querySelectorAll('.stk-check-item').forEach(lbl => {
                lbl.onclick = (e) => {
                    if (e.target.classList.contains('stk-check-cb')) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const cb = lbl.querySelector('.stk-check-cb');
                    if (cb) {
                        const val = cb.dataset.val;
                        onToggle(val);
                    }
                };
            });
        }

        // Update selected text element
        if (selectedTextEl) {
            if (activeList.length === 0) {
                selectedTextEl.textContent = defaultText;
                selectedTextEl.style.color = 'var(--text-muted)';
            } else if (activeList.length === 1) {
                selectedTextEl.textContent = activeList[0];
                selectedTextEl.style.color = 'var(--text-main)';
            } else {
                selectedTextEl.textContent = `${activeList.length} sélectionnés`;
                selectedTextEl.style.color = 'var(--neon-blue)';
            }
        }
    }

    // Helper to render pills inside a container
    function renderPills(containerEl, optionList, activeList, onToggle) {
        if (!containerEl) return;
        if (optionList.length === 0) {
            containerEl.innerHTML = '<span style="font-size:0.75rem; color:var(--text-muted);">Aucune option</span>';
            return;
        }
        containerEl.innerHTML = optionList.map(val => {
            const isActive = activeList.includes(val);
            return `
                <span class="stk-pill ${isActive ? 'active' : ''}" data-val="${escapeAttr(val)}">
                    ${escapeHtml(val)}
                    ${isActive ? '<i class="fa-solid fa-xmark"></i>' : ''}
                </span>
            `;
        }).join('');

        // Attach click handlers
        containerEl.querySelectorAll('.stk-pill').forEach(pill => {
            pill.onclick = () => {
                const val = pill.dataset.val;
                onToggle(val);
            };
        });
    }

    // Render table rows
    function renderTable(allRows) {
        if (!els.tbody) return;

        // Apply filters locally on the cached database entries
        let rows = allRows || [];

        // 1. Search text filter (Produit / DESIGNATION)
        if (state.search) {
            const q = state.search.toLowerCase();
            rows = rows.filter(r => 
                (r['Produit'] && r['Produit'].toLowerCase().includes(q)) ||
                (r['DESIGNATION'] && r['DESIGNATION'].toLowerCase().includes(q))
            );
        }

        // Apply quantity min/max range filters
        if (state.qteMin !== '') {
            const minVal = parseFloat(state.qteMin);
            if (!isNaN(minVal)) {
                rows = rows.filter(r => r['STK QTE'] >= minVal);
            }
        }
        if (state.qteMax !== '') {
            const maxVal = parseFloat(state.qteMax);
            if (!isNaN(maxVal)) {
                rows = rows.filter(r => r['STK QTE'] <= maxVal);
            }
        }

        // 2. Sites filter
        if (state.sites.length > 0) {
            rows = rows.filter(r => state.sites.includes(r['Site']));
        }

        // 3. SOCs filter
        if (state.socs.length > 0) {
            rows = rows.filter(r => state.socs.includes(r['SOC']));
        }

        // 4. Fournisseurs filter
        if (state.fournisseurs.length > 0) {
            rows = rows.filter(r => state.fournisseurs.includes(r['Fournisseur']));
        }

        // 5. Gammes filter
        if (state.gammes.length > 0) {
            rows = rows.filter(r => state.gammes.includes(r['GAMME']));
        }

        // 6. Familles filter
        if (state.familles.length > 0) {
            rows = rows.filter(r => state.familles.includes(r['FAMILLE']));
        }

        // 7. Statuts filter
        if (state.statuts.length > 0) {
            rows = rows.filter(r => state.statuts.includes(r['Statut']));
        }

        // 8. Tab View filter (favorites)
        if (state.view === 'favorites') {
            rows = rows.filter(r => state.favorites.includes(r['Produit']));
        }

        // Recalculate KPIs based on currently filtered items
        const totalProducts = state.allFetchedRows.length;
        const totalQuantity = state.allFetchedRows.reduce((sum, r) => sum + r['STK QTE'], 0);
        const filteredProducts = rows.length;
        const filteredQuantity = rows.reduce((sum, r) => sum + r['STK QTE'], 0);

        if (els.totalProducts) els.totalProducts.textContent = totalProducts.toLocaleString('fr-FR');
        if (els.totalQuantity) els.totalQuantity.textContent = totalQuantity.toLocaleString('fr-FR');
        if (els.filteredProducts) els.filteredProducts.textContent = filteredProducts.toLocaleString('fr-FR');
        if (els.filteredQuantity) els.filteredQuantity.textContent = filteredQuantity.toLocaleString('fr-FR');
        
        if (els.badge) {
            els.badge.textContent = `${filteredProducts} article${filteredProducts > 1 ? 's' : ''}`;
        }
        
        if (rows.length === 0) {
            els.tbody.innerHTML = '';
            if (els.empty) els.empty.style.display = 'block';
            if (els.pagination) els.pagination.style.display = 'none';
            return;
        }
        
        if (els.empty) els.empty.style.display = 'none';

        // Calculate pagination bounds
        const totalItems = rows.length;
        const totalPages = Math.ceil(totalItems / state.limit) || 1;
        
        if (state.page > totalPages) {
            state.page = totalPages;
        }
        if (state.page < 1) {
            state.page = 1;
        }

        const startIdx = (state.page - 1) * state.limit;
        const endIdx = Math.min(startIdx + state.limit, totalItems);
        const pageRows = rows.slice(startIdx, endIdx);

        // Update pagination UI
        if (els.pagination) {
            els.pagination.style.display = 'flex';
            if (els.paginationInfo) {
                els.paginationInfo.textContent = `Affichage de ${startIdx + 1}-${endIdx} sur ${totalItems}`;
            }
            if (els.pageNum) {
                els.pageNum.textContent = `${state.page} / ${totalPages}`;
            }
            if (els.pagePrev) {
                els.pagePrev.disabled = state.page === 1;
                els.pagePrev.style.opacity = state.page === 1 ? '0.5' : '1';
            }
            if (els.pageNext) {
                els.pageNext.disabled = state.page === totalPages;
                els.pageNext.style.opacity = state.page === totalPages ? '0.5' : '1';
            }
        }
        
        els.tbody.innerHTML = pageRows.map((r, i) => {
            let quantityClass = '';
            const qty = r['STK QTE'];
            if (qty === 0) quantityClass = 'neon-text-pink';
            else if (qty <= 5) quantityClass = 'neon-text-amber';
            else quantityClass = 'neon-text-green';

            // Favorite star state
            const isFav = state.favorites.includes(r['Produit']);
            
            return `
                <tr class="stk-row" data-index="${i}" style="cursor: pointer;">
                    <td style="text-align: center; cursor: pointer; vertical-align: middle;" class="stk-fav-cell" data-code="${escapeAttr(r['Produit'])}">
                        <i class="${isFav ? 'fa-solid fa-star' : 'fa-regular fa-star'}" style="color: ${isFav ? 'var(--neon-amber)' : 'var(--text-muted)'}; font-size: 0.95rem; transition: color 0.2s, transform 0.2s;"></i>
                    </td>
                    <td class="font-mono" style="color: var(--neon-blue); font-weight: bold;">${escapeHtml(r['Produit'])}</td>
                    <td style="color: var(--text-main); font-weight: 500;">${escapeHtml(r['DESIGNATION'])}</td>
                    <td><span class="cyber-badge" style="background: rgba(57, 255, 20, 0.1); border-color: var(--neon-green); color: var(--neon-green);">${escapeHtml(r['SOC'])}</span></td>
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(r['Fournisseur'])}</td>
                    <td style="text-align: right; font-weight: bold; font-family: var(--font-mono);" class="${quantityClass}">${qty.toLocaleString('fr-FR')}</td>
                </tr>
            `;
        }).join('');

        // Bind row clicks
        els.tbody.querySelectorAll('.stk-row').forEach(rowEl => {
            rowEl.onclick = (e) => {
                if (e.target.closest('.stk-fav-cell')) return;
                const idx = parseInt(rowEl.dataset.index, 10);
                const rowData = pageRows[idx];
                if (rowData) {
                    showProductDetails(rowData);
                }
            };
        });

        // Re-bind favorite click events
        els.tbody.querySelectorAll('.stk-fav-cell').forEach(cell => {
            cell.onclick = async (e) => {
                e.stopPropagation();
                const code = cell.dataset.code;
                if (!code) return;

                const index = state.favorites.indexOf(code);
                let added = false;
                if (index > -1) {
                    state.favorites.splice(index, 1);
                } else {
                    state.favorites.push(code);
                    added = true;
                }

                // Save to local storage fallback
                localStorage.setItem('stk-favorites', JSON.stringify(state.favorites));

                // Save to database
                try {
                    fetch('/api/stock/favorites/toggle', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ produit: code, action: added ? 'add' : 'remove' })
                    });
                } catch (err) {
                    console.error("Failed to save favorite in DB:", err);
                }

                // Toggle visual state snappily
                const icon = cell.querySelector('i');
                if (icon) {
                    if (added) {
                        icon.className = 'fa-solid fa-star';
                        icon.style.color = 'var(--neon-amber)';
                        icon.style.transform = 'scale(1.2)';
                        setTimeout(() => icon.style.transform = '', 200);
                    } else {
                        icon.className = 'fa-regular fa-star';
                        icon.style.color = 'var(--text-muted)';
                    }
                }

                // If in favorites view, redraw to filter out un-starred item
                if (state.view === 'favorites') {
                    setTimeout(() => renderTable(state.allFetchedRows), 300);
                }
            };
        });

        // Bind header th star click event to add/remove all currently filtered products from favorites bulkwise
        if (els.thFav) {
            // Determine if all filtered products are currently favorited
            const allFilteredCodes = rows.map(r => r['Produit']);
            const isAllFav = allFilteredCodes.every(code => state.favorites.includes(code));
            
            // Adjust visual state of header star
            const thIcon = els.thFav.querySelector('i');
            if (thIcon) {
                if (isAllFav && allFilteredCodes.length > 0) {
                    thIcon.className = 'fa-solid fa-star';
                    thIcon.style.color = 'var(--neon-amber)';
                } else {
                    thIcon.className = 'fa-regular fa-star';
                    thIcon.style.color = 'var(--text-muted)';
                }
            }

            els.thFav.onclick = async () => {
                const codes = rows.map(r => r['Produit']);
                if (codes.length === 0) return;

                const shouldAdd = !isAllFav;

                // Sync frontend state
                codes.forEach(code => {
                    const idx = state.favorites.indexOf(code);
                    if (shouldAdd) {
                        if (idx === -1) state.favorites.push(code);
                    } else {
                        if (idx > -1) state.favorites.splice(idx, 1);
                    }
                });

                // Update LocalStorage fallback
                localStorage.setItem('stk-favorites', JSON.stringify(state.favorites));

                // Send bulk updates to backend API
                try {
                    // Send requests in batches or concurrently
                    await Promise.all(codes.map(code => 
                        fetch('/api/stock/favorites/toggle', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ produit: code, action: shouldAdd ? 'add' : 'remove' })
                        })
                    ));
                } catch (err) {
                    console.error("Failed to sync favorites in DB bulk:", err);
                }

                // Force full table re-render
                renderTable(state.allFetchedRows);
            };
        }

        // Apply sorting header visual arrows
        const sortCol = state.sort_by;
        const sortDir = state.sort_dir;
        
        els.table.querySelectorAll('th[data-sort]').forEach(th => {
            const matches = th.dataset.sort === sortCol;
            th.classList.toggle('is-sorted', matches);
            
            let arrow = th.querySelector('.sort-arrow');
            if (!arrow) {
                arrow = document.createElement('span');
                arrow.className = 'sort-arrow';
                th.appendChild(arrow);
            }
            if (matches) {
                arrow.innerHTML = sortDir === 'ASC' ? ' ▲' : ' ▼';
                arrow.style.color = 'var(--neon-blue)';
            } else {
                arrow.innerHTML = ' ↕';
                arrow.style.color = 'var(--text-muted)';
            }
        });
    }

    // Show product details drawer on the right side
    function showProductDetails(row) {
        if (!els.productDrawer || !els.productDrawerBody) return;

        const qty = row['STK QTE'] !== undefined ? row['STK QTE'] : 0;
        let qtyClass = 'neon-text-green';
        if (qty === 0) qtyClass = 'neon-text-pink';
        else if (qty <= 5) qtyClass = 'neon-text-amber';

        els.productDrawerBody.innerHTML = `
            <div class="drawer-info-group">
                <span class="drawer-info-label">Code Produit</span>
                <span class="drawer-info-value highlight-blue">${escapeHtml(row['Produit'])}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Désignation</span>
                <span class="drawer-info-value" style="font-size: 1.1rem; color: var(--text-main); font-weight: bold;">${escapeHtml(row['DESIGNATION'])}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Quantité en Stock</span>
                <span class="drawer-info-value ${qtyClass}" style="font-size: 1.5rem; font-family: var(--font-mono);">${qty.toLocaleString('fr-FR')} pièces</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Société (SOC)</span>
                <span class="drawer-info-value"><span class="cyber-badge" style="background: rgba(57, 255, 20, 0.1); border-color: var(--neon-green); color: var(--neon-green);">${escapeHtml(row['SOC'])}</span></span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Gamme</span>
                <span class="drawer-info-value highlight-amber">${escapeHtml(row['GAMME'] || 'Non spécifiée')}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Famille</span>
                <span class="drawer-info-value">${escapeHtml(row['FAMILLE'] || 'Non spécifiée')}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Fournisseur</span>
                <span class="drawer-info-value">${escapeHtml(row['Fournisseur'])}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Site / Dépôt</span>
                <span class="drawer-info-value">${escapeHtml(row['Site'])}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Statut</span>
                <span class="drawer-info-value">${escapeHtml(row['Statut'])}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Activité</span>
                <span class="drawer-info-value">${escapeHtml(row['ACT CODE'])}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Source</span>
                <span class="drawer-info-value" style="font-size: 0.8rem; color: var(--text-muted); font-family: var(--font-mono);">${escapeHtml(row['Source'])}</span>
            </div>
            <div class="drawer-info-group">
                <span class="drawer-info-label">Date du Stock</span>
                <span class="drawer-info-value" style="font-family: var(--font-mono);">${escapeHtml(formatDate(row['date']))}</span>
            </div>
        `;

        els.productDrawer.classList.add('open');
    }

    // Setup Drag & Drop File upload
    function setupDragAndDrop() {
        if (!els.dropzone || !els.uploadFileInput) return;

        els.dropzone.onclick = () => {
            els.uploadFileInput.click();
        };

        els.uploadFileInput.onchange = () => {
            const files = els.uploadFileInput.files;
            if (files.length > 0) {
                showFileSelected(files[0].name);
            }
        };

        const preventDefaults = (e) => {
            e.preventDefault();
            e.stopPropagation();
        };

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            els.dropzone.addEventListener(eventName, preventDefaults, false);
        });

        els.dropzone.addEventListener('dragover', () => {
            els.dropzone.classList.add('hover');
        }, false);

        els.dropzone.addEventListener('dragleave', () => {
            els.dropzone.classList.remove('hover');
        }, false);

        els.dropzone.addEventListener('drop', (e) => {
            els.dropzone.classList.remove('hover');
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                els.uploadFileInput.files = files;
                showFileSelected(files[0].name);
            }
        }, false);
    }

    function showFileSelected(fileName) {
        const nameEl = els.dropzone.querySelector('.dropzone-file-name');
        const textEl = els.dropzone.querySelector('.dropzone-text');
        
        if (nameEl && textEl) {
            nameEl.textContent = fileName;
            nameEl.style.display = 'block';
            textEl.style.display = 'none';
        }
    }

    function resetDropzone() {
        const nameEl = els.dropzone.querySelector('.dropzone-file-name');
        const textEl = els.dropzone.querySelector('.dropzone-text');
        
        if (nameEl && textEl) {
            nameEl.textContent = '';
            nameEl.style.display = 'none';
            textEl.style.display = 'block';
            els.uploadFileInput.value = '';
        }
    }

    // Setup events
    function setupEventListeners() {
        // Search Input (debounced)
        if (els.search) {
            els.search.addEventListener('input', debounce(() => {
                const val = els.search.value.trim();
                state.page = 1;
                state.search = val;
                if (els.quickSearch) {
                    els.quickSearch.value = val;
                }
                renderTable(state.allFetchedRows);
            }, 250));
        }

        // Quick Search Input (debounced)
        if (els.quickSearch) {
            els.quickSearch.addEventListener('input', debounce(() => {
                const val = els.quickSearch.value.trim();
                state.page = 1;
                state.search = val;
                if (els.search) {
                    els.search.value = val;
                }
                renderTable(state.allFetchedRows);
            }, 250));
        }

        // Quantity Min Selector
        if (els.qteMin) {
            els.qteMin.addEventListener('input', () => {
                state.page = 1;
                state.qteMin = els.qteMin.value.trim();
                renderTable(state.allFetchedRows);
            });
        }
        // Quantity Max Selector
        if (els.qteMax) {
            els.qteMax.addEventListener('input', () => {
                state.page = 1;
                state.qteMax = els.qteMax.value.trim();
                renderTable(state.allFetchedRows);
            });
        }

        // Date selection dropdown
        if (els.dateSelect) {
            els.dateSelect.addEventListener('change', () => {
                state.date = els.dateSelect.value;
                loadStockData();
            });
        }

        // Sort Selector
        if (els.sortSelect) {
            els.sortSelect.addEventListener('change', () => {
                const parts = els.sortSelect.value.split('_');
                state.sort_by = parts[0];
                state.sort_dir = parts[1];
                loadStockData();
            });
        }

        // Default Sort Link
        if (els.sortDefault) {
            els.sortDefault.onclick = () => {
                state.sort_by = 'Produit';
                state.sort_dir = 'ASC';
                if (els.sortSelect) els.sortSelect.value = 'Produit_ASC';
                loadStockData();
            };
        }
        
        // Reset Button
        if (els.resetBtn) {
            els.resetBtn.addEventListener('click', () => {
                state.search = '';
                state.sites = [];
                state.socs = [];
                state.fournisseurs = [];
                state.gammes = [];
                state.familles = [];
                state.statuts = [];
                state.qteMin = '';
                state.qteMax = '';
                state.limit = 50;
                state.date = state.options.dates.length > 0 ? state.options.dates[0] : '';
                state.sort_by = 'Produit';
                state.sort_dir = 'ASC';
                
                if (els.search) els.search.value = '';
                if (els.quickSearch) els.quickSearch.value = '';
                if (els.fournisseurSearch) els.fournisseurSearch.value = '';
                if (els.gammeSearch) els.gammeSearch.value = '';
                if (els.qteMin) els.qteMin.value = '';
                if (els.qteMax) els.qteMax.value = '';
                if (els.pageLimit) els.pageLimit.value = '50';
                if (els.dateSelect) els.dateSelect.value = state.date;
                if (els.sortSelect) els.sortSelect.value = 'Produit_ASC';
                
                renderQuickFilters();
                renderTable(state.allFetchedRows);
            });
        }
        
        // Clear filter buttons
        document.querySelectorAll('.stk-clear-filter-btn').forEach(btn => {
            btn.onclick = () => {
                state.page = 1;
                const filterType = btn.dataset.filter;
                if (filterType === 'sites') {
                    state.sites = [];
                } else if (filterType === 'socs') {
                    state.socs = [];
                } else if (filterType === 'fournisseurs') {
                    state.fournisseurs = [];
                } else if (filterType === 'gammes') {
                    state.gammes = [];
                }
                renderQuickFilters();
                renderTable(state.allFetchedRows);
            };
        });
        
        // Back Button
        if (els.backBtn) {
            els.backBtn.addEventListener('click', () => {
                if (typeof window.switchView === 'function') {
                    window.switchView('dashboard');
                } else {
                    window.location.href = '/dashboard';
                }
            });
        }
        
        // Table sorting header clicks
        if (els.table) {
            els.table.querySelectorAll('th[data-sort]').forEach(th => {
                th.addEventListener('click', () => {
                    const col = th.dataset.sort;
                    if (state.sort_by === col) {
                        state.sort_dir = state.sort_dir === 'ASC' ? 'DESC' : 'ASC';
                    } else {
                        state.sort_by = col;
                        state.sort_dir = 'ASC';
                    }
                    if (els.sortSelect) {
                        // Keep dropdown sync'd if match found
                        const val = `${state.sort_by}_${state.sort_dir}`;
                        const opt = els.sortSelect.querySelector(`option[value="${val}"]`);
                        if (opt) els.sortSelect.value = val;
                    }
                    loadStockData();
                });
            });
        }

        // Open Upload Modal Trigger
        if (els.uploadTrigger) {
            els.uploadTrigger.onclick = () => {
                if (els.uploadModal) {
                    els.uploadModal.classList.add('open');
                    resetDropzone();
                    
                    if (els.uploadDateInput) {
                        const today = new Date().toISOString().split('T')[0];
                        els.uploadDateInput.value = today;
                    }
                }
            };
        }

        // Close Modal Triggers
        const closeModal = () => {
            if (els.uploadModal) {
                els.uploadModal.classList.remove('open');
            }
        };

        if (els.uploadModalClose) els.uploadModalClose.onclick = closeModal;
        if (els.uploadModalCancel) els.uploadModalCancel.onclick = closeModal;

        // Click backdrop to close
        if (els.uploadModal) {
            els.uploadModal.onclick = (e) => {
                if (e.target === els.uploadModal) {
                    closeModal();
                }
            };
        }

        // Submit Upload button click
        if (els.uploadModalSubmit) {
            els.uploadModalSubmit.onclick = async () => {
                const date = els.uploadDateInput.value;
                const files = els.uploadFileInput.files;
                
                if (!date) {
                    toast("Veuillez sélectionner la date du stock.", "warning");
                    return;
                }
                if (files.length === 0) {
                    toast("Veuillez choisir un fichier Excel stock2.xlsx à importer.", "warning");
                    return;
                }

                els.uploadModalSubmit.disabled = true;
                els.uploadModalSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ENVOI EN COURS...';

                try {
                    const formData = new FormData();
                    formData.append('file', files[0]);
                    formData.append('date', date);

                    const response = await fetch('/api/stock/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const res = await response.json();

                    if (res.status === 'success') {
                        toast(res.message || "Importation réussie.", "success");
                        closeModal();
                        
                        state.date = date;
                        loadStockData();

                        // Auto-trigger Google Sheet sync after upload
                        setTimeout(() => {
                            if (els.syncGoogleSheet) {
                                els.syncGoogleSheet.click();
                            }
                        }, 500);
                    } else {
                        toast(res.message || "Erreur d'importation.", "error");
                    }
                } catch (e) {
                    console.error("Upload error:", e);
                    toast("Erreur lors de la communication avec le serveur.", "error");
                } finally {
                    els.uploadModalSubmit.disabled = false;
                    els.uploadModalSubmit.innerHTML = '<i class="fa-solid fa-check"></i> CONFIRMER';
                }
            };
        }

        // Google Sheet sync button click
        if (els.syncGoogleSheet) {
            els.syncGoogleSheet.onclick = async () => {
                els.syncGoogleSheet.disabled = true;
                const originalHtml = els.syncGoogleSheet.innerHTML;
                els.syncGoogleSheet.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> EN SYNC...';
                
                try {
                    const response = await fetch('/api/google/sync', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ date: state.date })
                    });
                    const res = await response.json();
                    
                    if (res.status === 'success') {
                        alert(res.message || "Synchronisé avec succès.");
                        toast(res.message || "Synchronisation réussie.", "success");
                    } else if (res.status === 'auth_required') {
                        if (confirm("Authentification Google requise pour synchroniser. Voulez-vous associer votre compte Google ?")) {
                            window.location.href = res.auth_url;
                        }
                    } else {
                        alert("Erreur: " + (res.message || "Échec de la synchronisation."));
                        toast(res.message || "Erreur de synchronisation.", "error");
                    }
                } catch (e) {
                    console.error("Sync error:", e);
                    alert("Erreur de communication avec le serveur.");
                    toast("Erreur de communication avec le serveur.", "error");
                } finally {
                    els.syncGoogleSheet.disabled = false;
                    els.syncGoogleSheet.innerHTML = originalHtml;
                }
            };
        }

        // View Toggles (All vs Favorites)
        if (els.btnAll && els.btnFav) {
            els.btnAll.onclick = () => {
                if (state.view === 'all') return;
                state.page = 1;
                state.view = 'all';
                els.btnAll.classList.add('is-active');
                els.btnFav.classList.remove('is-active');
                
                // Sync URL and sidebar
                try {
                    const url = new URL(window.location);
                    url.searchParams.delete('view');
                    window.history.pushState({}, '', url);
                } catch (e) {
                    console.error("Failed to pushState:", e);
                }
                const navStock = document.getElementById('nav-stock');
                const navStockFavorites = document.getElementById('nav-stock-favorites');
                if (navStock) navStock.classList.add('active');
                if (navStockFavorites) navStockFavorites.classList.remove('active');
                
                renderTable(state.allFetchedRows);
            };

            els.btnFav.onclick = () => {
                if (state.view === 'favorites') return;
                state.page = 1;
                state.view = 'favorites';
                els.btnFav.classList.add('is-active');
                els.btnAll.classList.remove('is-active');
                
                // Sync URL and sidebar
                try {
                    const url = new URL(window.location);
                    url.searchParams.set('view', 'favorit');
                    window.history.pushState({}, '', url);
                } catch (e) {
                    console.error("Failed to pushState:", e);
                }
                const navStock = document.getElementById('nav-stock');
                const navStockFavorites = document.getElementById('nav-stock-favorites');
                if (navStockFavorites) navStockFavorites.classList.add('active');
                if (navStock) navStock.classList.remove('active');
                
                renderTable(state.allFetchedRows);
            };
        }

        // Pagination buttons handlers
        if (els.pageLimit) {
            els.pageLimit.addEventListener('change', () => {
                state.limit = parseInt(els.pageLimit.value, 10) || 50;
                state.page = 1;
                renderTable(state.allFetchedRows);
            });
        }

        if (els.pagePrev) {
            els.pagePrev.onclick = () => {
                if (state.page > 1) {
                    state.page--;
                    renderTable(state.allFetchedRows);
                }
            };
        }

        if (els.pageNext) {
            els.pageNext.onclick = () => {
                state.page++;
                renderTable(state.allFetchedRows);
            };
        }

        // Close product details drawer
        if (els.productDrawerClose) {
            els.productDrawerClose.onclick = () => {
                if (els.productDrawer) {
                    els.productDrawer.classList.remove('open');
                }
            };
        }

        if (els.productDrawer) {
            els.productDrawer.onclick = (e) => {
                if (e.target === els.productDrawer) {
                    els.productDrawer.classList.remove('open');
                }
            };
        }

        // Open Stock Filters Modal
        if (els.filtersTrigger) {
            els.filtersTrigger.onclick = () => {
                if (els.filtersModal) {
                    els.filtersModal.classList.add('open');
                }
            };
        }

        // Close Stock Filters Modal
        const closeFiltersModal = () => {
            if (els.filtersModal) {
                els.filtersModal.classList.remove('open');
            }
        };

        if (els.filtersClose) els.filtersClose.onclick = closeFiltersModal;
        if (els.filtersApply) els.filtersApply.onclick = closeFiltersModal;

        if (els.filtersModal) {
            els.filtersModal.onclick = (e) => {
                if (e.target === els.filtersModal) {
                    closeFiltersModal();
                }
            };
        }

        // Dropdown toggle for Fournisseur
        if (els.fournisseurToggle) {
            els.fournisseurToggle.onclick = (e) => {
                e.stopPropagation();
                const isOpen = els.fournisseurMenu.style.display === 'block';
                if (els.gammeMenu) els.gammeMenu.style.display = 'none';
                els.fournisseurMenu.style.display = isOpen ? 'none' : 'block';
            };
        }

        // Search input for Fournisseur
        if (els.fournisseurSearch) {
            els.fournisseurSearch.onclick = (e) => e.stopPropagation();
            els.fournisseurSearch.oninput = () => {
                renderFournisseursDropdown();
            };
        }

        // Dropdown toggle for Gamme
        if (els.gammeToggle) {
            els.gammeToggle.onclick = (e) => {
                e.stopPropagation();
                const isOpen = els.gammeMenu.style.display === 'block';
                if (els.fournisseurMenu) els.fournisseurMenu.style.display = 'none';
                els.gammeMenu.style.display = isOpen ? 'none' : 'block';
            };
        }

        // Search input for Gamme
        if (els.gammeSearch) {
            els.gammeSearch.onclick = (e) => e.stopPropagation();
            els.gammeSearch.oninput = () => {
                renderGammesDropdown();
            };
        }

        // Click outside dropdowns to close them
        document.addEventListener('click', (e) => {
            if (els.fournisseurMenu && !e.target.closest('#stk-fournisseur-dropdown-container')) {
                els.fournisseurMenu.style.display = 'none';
            }
            if (els.gammeMenu && !e.target.closest('#stk-gamme-dropdown-container')) {
                els.gammeMenu.style.display = 'none';
            }
        });
    }

    // Auto-initialize when the DOM content loads
    document.addEventListener('DOMContentLoaded', () => {
        const container = document.getElementById('stock-container');
        if (container) {
            cacheEls();
            const isTabActive = window.location.pathname === '/stock';
            if (isTabActive) {
                window.initStockView();
            }
        }
    });

})();
