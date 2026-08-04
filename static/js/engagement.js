/**
 * engagement.js
 * Engagement Tab & Modal Management System (ELFIL CHAKIB Team)
 */

(function () {
    let globalEngagementsList = [];
    let sellersListCache = [];
    let chakibSellersCache = [];
    let currentVendeurRafData = null;
    let currentViewMode = "cards";

    const DEFAULT_FAMILLES = [
        "LEVURE",
        "MGM",
        "BOUILLON",
        "CONDIMENTS",
        "SAUCES",
        "CONSERVES",
        "MARGAFRIQUE",
        "SOM",
        "VMM",
        "CHAR",
        "AUTRES"
    ];

    document.addEventListener("DOMContentLoaded", function () {
        initEngagementModule();
    });

    function initEngagementModule() {
        // Setup Modal Events
        const addBtn = document.getElementById("add-engagement-btn");
        const modal = document.getElementById("engagement-modal");
        const closeBtn = document.getElementById("close-engagement-modal-btn");
        const cancelBtn = document.getElementById("cancel-engagement-modal-btn");
        const saveBtn = document.getElementById("save-engagement-btn");

        if (addBtn) addBtn.addEventListener("click", openEngagementModal);
        if (closeBtn) closeBtn.addEventListener("click", closeEngagementModal);
        if (cancelBtn) cancelBtn.addEventListener("click", closeEngagementModal);
        if (saveBtn) saveBtn.addEventListener("click", saveEngagement);

        // Backdrop click to close
        if (modal) {
            modal.addEventListener("click", function (e) {
                if (e.target === modal) closeEngagementModal();
            });
        }

        // Vendeur select change event -> fetch RAF info
        const modalVendeurSelect = document.getElementById("engagement-vendeur-select");
        if (modalVendeurSelect) {
            modalVendeurSelect.addEventListener("change", function () {
                const vendeurName = (this.value || "").trim();
                fetchVendeurRafData(vendeurName);
            });
        }

        // Period Option Buttons [Jour, Semaine, Mois]
        const periodBtns = document.querySelectorAll(".engagement-period-btn");
        periodBtns.forEach((btn) => {
            btn.addEventListener("click", function () {
                periodBtns.forEach((b) => {
                    b.classList.remove("active");
                    b.style.background = "transparent";
                    b.style.color = "var(--text-main)";
                    b.style.fontWeight = "500";
                });
                this.classList.add("active");
                this.style.background = "var(--neon-blue)";
                this.style.color = "#000";
                this.style.fontWeight = "bold";

                const periodVal = this.getAttribute("data-period");
                const hiddenPeriod = document.getElementById("engagement-periode-value");
                if (hiddenPeriod) hiddenPeriod.value = periodVal;
            });
        });

        // Setup Dropdown + Button for Adding Categories (CA, Famille, Focus, Autre)
        const dropdownToggle = document.getElementById("add-entry-dropdown-toggle");
        const dropdownMenu = document.getElementById("add-entry-dropdown-menu");
        const catOptionBtns = document.querySelectorAll(".add-cat-option-btn");

        if (dropdownToggle && dropdownMenu) {
            dropdownToggle.addEventListener("click", function (e) {
                e.stopPropagation();
                const isVisible = dropdownMenu.style.display === "block";
                dropdownMenu.style.display = isVisible ? "none" : "block";
            });

            // Close dropdown menu when clicking outside
            document.addEventListener("click", function () {
                if (dropdownMenu) dropdownMenu.style.display = "none";
            });
        }

        catOptionBtns.forEach((btn) => {
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                const category = this.getAttribute("data-category");
                addCategoryRow(category);
                if (dropdownMenu) dropdownMenu.style.display = "none";
            });
        });

        // View Toggle Listeners
        const cardsBtn = document.getElementById("btn-view-cards");
        const tableBtn = document.getElementById("btn-view-table");
        const cardsContainer = document.getElementById("engagements-list");
        const tableContainer = document.getElementById("engagements-table-container");

        if (cardsBtn && tableBtn && cardsContainer && tableContainer) {
            cardsBtn.addEventListener("click", function () {
                currentViewMode = "cards";
                cardsBtn.classList.add("active");
                cardsBtn.style.background = "var(--neon-blue)";
                cardsBtn.style.color = "#000";
                tableBtn.classList.remove("active");
                tableBtn.style.background = "transparent";
                tableBtn.style.color = "var(--text-main)";

                cardsContainer.style.display = "grid";
                tableContainer.style.display = "none";
            });

            tableBtn.addEventListener("click", function () {
                currentViewMode = "table";
                tableBtn.classList.add("active");
                tableBtn.style.background = "var(--neon-blue)";
                tableBtn.style.color = "#000";
                cardsBtn.classList.remove("active");
                cardsBtn.style.background = "transparent";
                cardsBtn.style.color = "var(--text-main)";

                cardsContainer.style.display = "none";
                tableContainer.style.display = "block";
            });
        }

        // Search and Filter Listeners
        const searchInput = document.getElementById("engagements-search-input");
        const vendeurFilter = document.getElementById("engagements-vendeur-filter");
        const periodFilter = document.getElementById("engagements-period-filter");

        if (searchInput) searchInput.addEventListener("input", filterAndRenderEngagements);
        if (vendeurFilter) vendeurFilter.addEventListener("change", filterAndRenderEngagements);
        if (periodFilter) periodFilter.addEventListener("change", filterAndRenderEngagements);

        // Preload Sellers & Engagements
        loadSellers();
        loadEngagements();
    }

    // Fetch RAF data for selected Vendeur
    async function fetchVendeurRafData(vendeurName) {
        currentVendeurRafData = null;
        if (!vendeurName) {
            updateAllRowHelpers();
            return;
        }

        try {
            const response = await fetch(`/api/vendeurs/raf?vendeur=${encodeURIComponent(vendeurName)}`);
            if (response.ok) {
                const data = await response.json();
                if (data.status === "success") {
                    currentVendeurRafData = data;
                }
            }
        } catch (e) {
            console.error("Error fetching vendeur RAF data:", e);
        } finally {
            updateAllRowHelpers();
        }
    }

    // Get list of available product families
    function getAvailableFamillesList() {
        if (currentVendeurRafData && currentVendeurRafData.familles) {
            const keys = Object.keys(currentVendeurRafData.familles);
            if (keys.length > 0) {
                const set = new Set([...keys, ...DEFAULT_FAMILLES]);
                return Array.from(set).sort();
            }
        }
        return DEFAULT_FAMILLES;
    }

    // Update all dynamic rows helpers
    function updateAllRowHelpers() {
        const rows = document.querySelectorAll("#engagement-modal .engagement-item-row");
        rows.forEach((row) => {
            const category = row.getAttribute("data-category");
            
            // If it's a Famille row, also update options in the select if needed
            if (category === "Famille") {
                const famSelect = row.querySelector(".item-famille-select");
                if (famSelect) {
                    const currentVal = famSelect.value;
                    const famillesList = getAvailableFamillesList();
                    let html = '<option value="">-- Choisir une Famille --</option>';
                    famillesList.forEach((f) => {
                        html += `<option value="${escapeHtml(f)}"${f === currentVal ? " selected" : ""}>${escapeHtml(f)}</option>`;
                    });
                    famSelect.innerHTML = html;
                }
            }

            const helperContainer = row.querySelector(".raf-helper-wrapper");
            if (helperContainer) {
                helperContainer.innerHTML = buildHelperHtml(category, row);
                attachHelperButtonEvents(row);
            }
        });
    }

    // Load Sellers list from API
    async function loadSellers() {
        try {
            // Fetch all sellers
            const respAll = await fetch("/api/vendeurs?category=All");
            if (respAll.ok) {
                const dataAll = await respAll.json();
                if (dataAll.status === "success" && Array.isArray(dataAll.vendeurs)) {
                    sellersListCache = dataAll.vendeurs;
                } else if (Array.isArray(dataAll)) {
                    sellersListCache = dataAll;
                }
            }

            // Fetch Chakib team sellers
            const respChakib = await fetch("/api/vendeurs?category=Chakib%20Equipe");
            if (respChakib.ok) {
                const dataChakib = await respChakib.json();
                if (dataChakib.status === "success" && Array.isArray(dataChakib.vendeurs)) {
                    chakibSellersCache = dataChakib.vendeurs;
                }
            }

            populateSellersDropdowns();
        } catch (e) {
            console.error("Error loading sellers for engagements:", e);
        }
    }

    function populateSellersDropdowns() {
        const modalSelect = document.getElementById("engagement-vendeur-select");
        const filterSelect = document.getElementById("engagements-vendeur-filter");

        if (modalSelect) {
            let optionsHtml = '<option value="">-- Choisir un Vendeur --</option>';
            if (chakibSellersCache.length > 0) {
                optionsHtml += '<optgroup label="Équipe Chakib">';
                chakibSellersCache.forEach((v) => {
                    optionsHtml += `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
                });
                optionsHtml += '</optgroup>';
            }
            const chakibSet = new Set(chakibSellersCache.map(s => s.toUpperCase()));
            const otherSellers = sellersListCache.filter(v => !chakibSet.has(v.toUpperCase()));
            if (otherSellers.length > 0) {
                optionsHtml += '<optgroup label="Autres Vendeurs">';
                otherSellers.forEach((v) => {
                    optionsHtml += `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
                });
                optionsHtml += '</optgroup>';
            }
            modalSelect.innerHTML = optionsHtml;
        }

        if (filterSelect) {
            let filterHtml = '<option value="All">TOUS LES VENDEURS (Toutes Équipes)</option>';
            filterHtml += '<option value="TEAM_CHAKIB">TOUTE L\'ÉQUIPE CHAKIB</option>';
            sellersListCache.forEach((v) => {
                filterHtml += `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`;
            });
            filterSelect.innerHTML = filterHtml;
        }
    }

    // Open Modal Function
    function openEngagementModal() {
        const modal = document.getElementById("engagement-modal");
        if (!modal) return;

        currentVendeurRafData = null;

        const editingInput = document.getElementById("editing-engagement-id");
        if (editingInput) editingInput.value = "";

        const titleSpan = document.getElementById("engagement-modal-title");
        if (titleSpan) titleSpan.textContent = "NOUVEL ENGAGEMENT VENDEUR";

        // Reset form inputs safely
        const vendeurSelect = document.getElementById("engagement-vendeur-select");
        if (vendeurSelect) vendeurSelect.value = "";
        
        // Default to today's date
        const today = new Date().toISOString().split("T")[0];
        const dateInput = document.getElementById("engagement-date-input");
        if (dateInput) dateInput.value = today;

        // Reset period buttons (default Jour)
        const periodBtns = document.querySelectorAll(".engagement-period-btn");
        periodBtns.forEach((b) => {
            const periodVal = b.getAttribute("data-period");
            if (periodVal === "Jour") {
                b.classList.add("active");
                b.style.background = "var(--neon-blue)";
                b.style.color = "#000";
                b.style.fontWeight = "bold";
            } else {
                b.classList.remove("active");
                b.style.background = "transparent";
                b.style.color = "var(--text-main)";
                b.style.fontWeight = "500";
            }
        });
        const hiddenPeriod = document.getElementById("engagement-periode-value");
        if (hiddenPeriod) hiddenPeriod.value = "Jour";

        // Clear container and close dropdown menu
        const container = document.getElementById("engagement-items-container");
        if (container) container.innerHTML = "";

        const dropdownMenu = document.getElementById("add-entry-dropdown-menu");
        if (dropdownMenu) dropdownMenu.style.display = "none";

        updateLiveTotalDH();

        // Open modal backdrop
        modal.classList.add("open");
    }

    // Open Modal for Editing existing Engagement
    async function openEditEngagementModal(engagementId) {
        const eng = globalEngagementsList.find((e) => String(e.id) === String(engagementId));
        if (!eng) return;

        openEngagementModal(); // Reset form first

        const editingInput = document.getElementById("editing-engagement-id");
        if (editingInput) editingInput.value = eng.id;

        const titleSpan = document.getElementById("engagement-modal-title");
        if (titleSpan) titleSpan.textContent = `MODIFIER L'ENGAGEMENT - ${eng.vendeur}`;

        const vendeurSelect = document.getElementById("engagement-vendeur-select");
        if (vendeurSelect) vendeurSelect.value = eng.vendeur || "";

        const hiddenPeriod = document.getElementById("engagement-periode-value");
        if (hiddenPeriod) hiddenPeriod.value = eng.periode || "Jour";

        const periodBtns = document.querySelectorAll(".engagement-period-btn");
        periodBtns.forEach((b) => {
            const periodVal = b.getAttribute("data-period");
            if (periodVal === (eng.periode || "Jour")) {
                b.classList.add("active");
                b.style.background = "var(--neon-blue)";
                b.style.color = "#000";
                b.style.fontWeight = "bold";
            } else {
                b.classList.remove("active");
                b.style.background = "transparent";
                b.style.color = "var(--text-main)";
                b.style.fontWeight = "500";
            }
        });

        const dateInput = document.getElementById("engagement-date-input");
        if (dateInput) dateInput.value = eng.date_engagement || "";

        const container = document.getElementById("engagement-items-container");
        if (container) container.innerHTML = "";

        // Populate items
        if (Array.isArray(eng.items)) {
            eng.items.forEach((item) => {
                addCategoryRow(item.category, item.title, item.amount_dh);
            });
        }

        if (eng.vendeur) {
            fetchVendeurRafData(eng.vendeur);
        }

        updateLiveTotalDH();
    }

    function closeEngagementModal() {
        const modal = document.getElementById("engagement-modal");
        if (modal) modal.classList.remove("open");
    }

    // Build RAF helper HTML string for a category row
    function buildHelperHtml(category, rowDiv = null) {
        if (!currentVendeurRafData) {
            return `<div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono); display: flex; align-items: center; gap: 0.35rem; width: 100%;">
                <i class="fa-solid fa-lightbulb" style="color: var(--neon-amber);"></i>
                <span>Sélectionnez un vendeur pour afficher le RAF / jour indicatif</span>
            </div>`;
        }

        const ca = currentVendeurRafData.ca || {};
        const restDays = currentVendeurRafData.rest_days || 20;
        const globalRafTotal = ca.raf || 0;
        const globalRafJour = ca.raf_jour || (restDays > 0 ? roundTwo(globalRafTotal / restDays) : 0);

        if (category === "CA") {
            return `
                <div style="font-size: 0.73rem; color: var(--text-main); font-family: var(--font-mono); display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 0.35rem;">
                    <span>
                        <i class="fa-solid fa-lightbulb" style="color: var(--neon-amber); margin-right: 0.25rem;"></i>
                        RAF Global CA: <strong>${formatDH(globalRafTotal)}</strong> &bull; Indicatif RAF / jour: <strong style="color: var(--neon-green);">${formatDH(globalRafJour)}/j</strong> <span style="color: var(--text-muted);">(${restDays}j restants)</span>
                    </span>
                    <button type="button" class="btn-use-raf-jour" data-val="${globalRafJour}" style="background: rgba(0, 255, 102, 0.12); border: 1px solid var(--neon-green); color: var(--neon-green); font-size: 0.7rem; font-weight: bold; font-family: var(--font-mono); padding: 0.15rem 0.5rem; border-radius: 4px; cursor: pointer; transition: all 0.2s;" title="Insérer cette valeur comme objectif">
                        <i class="fa-solid fa-arrow-up"></i> Insérer ${formatDH(globalRafJour)}
                    </button>
                </div>
            `;
        } else if (category === "Famille") {
            let selectedFam = "";
            if (rowDiv) {
                const famSelect = rowDiv.querySelector(".item-famille-select");
                selectedFam = famSelect ? famSelect.value : "";
            }

            if (!selectedFam) {
                return `
                    <div style="font-size: 0.73rem; color: var(--text-muted); font-family: var(--font-mono); display: flex; align-items: center; gap: 0.35rem; width: 100%;">
                        <i class="fa-solid fa-lightbulb" style="color: var(--neon-amber);"></i>
                        <span>Choisissez une famille ci-dessus pour afficher son RAF / jour spécifique</span>
                    </div>
                `;
            }

            const famData = (currentVendeurRafData.familles || {})[selectedFam] || {};
            const famRafTotal = famData.raf || 0;
            const famRafJour = famData.raf_jour || (restDays > 0 ? roundTwo(famRafTotal / restDays) : 0);

            return `
                <div style="font-size: 0.73rem; color: var(--text-main); font-family: var(--font-mono); display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 0.35rem;">
                    <span>
                        <i class="fa-solid fa-lightbulb" style="color: var(--neon-amber); margin-right: 0.25rem;"></i>
                        RAF ${escapeHtml(selectedFam)}: <strong>${formatDH(famRafTotal)}</strong> &bull; Indicatif: <strong style="color: var(--neon-green);">${formatDH(famRafJour)}/j</strong> <span style="color: var(--text-muted);">(${restDays}j restants)</span>
                    </span>
                    <button type="button" class="btn-use-raf-jour" data-val="${famRafJour}" style="background: rgba(0, 255, 102, 0.12); border: 1px solid var(--neon-green); color: var(--neon-green); font-size: 0.7rem; font-weight: bold; font-family: var(--font-mono); padding: 0.15rem 0.5rem; border-radius: 4px; cursor: pointer;">
                        <i class="fa-solid fa-arrow-up"></i> Insérer ${formatDH(famRafJour)}
                    </button>
                </div>
            `;
        } else {
            // Focus or Autre
            return `
                <div style="font-size: 0.73rem; color: var(--text-main); font-family: var(--font-mono); display: flex; align-items: center; justify-content: space-between; width: 100%; flex-wrap: wrap; gap: 0.35rem;">
                    <span>
                        <i class="fa-solid fa-lightbulb" style="color: var(--neon-amber); margin-right: 0.25rem;"></i>
                        Indicatif RAF / jour vendeur: <strong style="color: var(--neon-green);">${formatDH(globalRafJour)}/j</strong>
                    </span>
                    <button type="button" class="btn-use-raf-jour" data-val="${globalRafJour}" style="background: rgba(0, 255, 102, 0.12); border: 1px solid var(--neon-green); color: var(--neon-green); font-size: 0.7rem; font-weight: bold; font-family: var(--font-mono); padding: 0.15rem 0.5rem; border-radius: 4px; cursor: pointer;">
                        <i class="fa-solid fa-arrow-up"></i> Insérer ${formatDH(globalRafJour)}
                    </button>
                </div>
            `;
        }
    }

    // Attach insert button click event for a row
    function attachHelperButtonEvents(rowDiv) {
        const insertBtn = rowDiv.querySelector(".btn-use-raf-jour");
        const amountInput = rowDiv.querySelector(".item-amount-input");
        if (insertBtn && amountInput) {
            insertBtn.onclick = function (e) {
                e.preventDefault();
                const val = parseFloat(this.getAttribute("data-val")) || 0;
                amountInput.value = val;
                updateLiveTotalDH();
            };
        }
    }

    // Add dynamic row for a category (CA, Famille, Focus, Autre)
    function addCategoryRow(category, defaultTitle = "", defaultAmount = "") {
        const container = document.getElementById("engagement-items-container");
        if (!container) return;

        const rowDiv = document.createElement("div");
        rowDiv.className = "engagement-item-row";
        rowDiv.setAttribute("data-category", category);
        rowDiv.style.cssText = "display: flex; flex-direction: column; gap: 0.4rem; width: 100%; padding: 0.6rem 0.75rem; background: rgba(0,0,0,0.3); border-radius: 6px; border: 1px solid var(--border-color);";

        let catBadgeColor = "var(--text-muted)";
        let iconClass = "fa-tag";

        if (category === "CA") {
            catBadgeColor = "var(--neon-blue)";
            iconClass = "fa-chart-line";
            rowDiv.style.borderColor = "rgba(0, 240, 255, 0.35)";
        } else if (category === "Famille") {
            catBadgeColor = "var(--neon-green)";
            iconClass = "fa-boxes-packing";
            rowDiv.style.borderColor = "rgba(0, 255, 102, 0.35)";
        } else if (category === "Focus") {
            catBadgeColor = "var(--neon-amber)";
            iconClass = "fa-bullseye";
            rowDiv.style.borderColor = "rgba(255, 170, 0, 0.35)";
        } else if (category === "Autre") {
            catBadgeColor = "var(--neon-pink)";
            iconClass = "fa-pen-to-square";
            rowDiv.style.borderColor = "rgba(255, 0, 128, 0.35)";
        }

        let labelHtml = "";
        if (category === "Famille") {
            const famillesList = getAvailableFamillesList();
            let optionsHtml = '<option value="">-- Choisir une Famille --</option>';
            famillesList.forEach((f) => {
                optionsHtml += `<option value="${escapeHtml(f)}"${f === defaultTitle ? " selected" : ""}>${escapeHtml(f)}</option>`;
            });
            labelHtml = `
                <select class="cyber-input item-famille-select" style="flex: 2; min-width: 140px; height: 34px; font-size: 0.8rem; border-color: ${catBadgeColor}; font-weight: 600;">
                    ${optionsHtml}
                </select>
                <input type="hidden" class="item-title-input" value="${escapeHtml(defaultTitle)}">
            `;
        } else if (category === "Autre") {
            labelHtml = `<input type="text" class="cyber-input item-title-input" placeholder="Libellé Autre (ex: Challenge, Prime...)" value="${escapeHtml(defaultTitle)}" style="flex: 2; min-width: 140px; height: 34px; font-size: 0.8rem;">`;
        } else {
            labelHtml = `<input type="hidden" class="item-title-input" value="${escapeHtml(defaultTitle || category)}">`;
        }

        const helperHtml = buildHelperHtml(category, rowDiv);

        rowDiv.innerHTML = `
            <div style="display: flex; gap: 0.5rem; align-items: center; width: 100%;">
                <span style="background: rgba(0,0,0,0.5); border: 1px solid ${catBadgeColor}; color: ${catBadgeColor}; font-size: 0.72rem; font-weight: bold; font-family: var(--font-mono); padding: 0.35rem 0.65rem; border-radius: 4px; display: flex; align-items: center; gap: 0.35rem; min-width: 90px; justify-content: center; text-transform: uppercase;">
                    <i class="fa-solid ${iconClass}"></i> ${escapeHtml(category)}
                </span>
                ${labelHtml}
                <div style="flex: 1; min-width: 120px; position: relative; display: flex; align-items: center;">
                    <input type="number" step="any" min="0" class="cyber-input item-amount-input" placeholder="Objectif (DH)" value="${defaultAmount}" style="height: 34px; font-size: 0.88rem; font-weight: bold; padding-right: 2.2rem; width: 100%; text-align: right; border-color: ${catBadgeColor};">
                    <span style="position: absolute; right: 0.6rem; font-size: 0.75rem; font-weight: bold; color: var(--text-muted); font-family: var(--font-mono); pointer-events: none;">DH</span>
                </div>
                <button type="button" class="btn-remove-row" style="background: none; border: none; color: var(--neon-pink); cursor: pointer; font-size: 1.1rem; padding: 0.2rem 0.4rem;" title="Supprimer cette ligne">&times;</button>
            </div>
            
            <div class="raf-helper-wrapper" style="margin-top: 0.15rem; padding-top: 0.35rem; border-top: 1px dashed rgba(255,255,255,0.1);">
                ${helperHtml}
            </div>
        `;

        if (category === "Famille") {
            const famSelect = rowDiv.querySelector(".item-famille-select");
            const hiddenTitle = rowDiv.querySelector(".item-title-input");
            if (famSelect) {
                famSelect.addEventListener("change", function () {
                    if (hiddenTitle) hiddenTitle.value = this.value;
                    const helperContainer = rowDiv.querySelector(".raf-helper-wrapper");
                    if (helperContainer) {
                        helperContainer.innerHTML = buildHelperHtml("Famille", rowDiv);
                        attachHelperButtonEvents(rowDiv);
                    }
                });
            }
        }

        const amountInput = rowDiv.querySelector(".item-amount-input");
        if (amountInput) {
            amountInput.addEventListener("input", updateLiveTotalDH);
        }

        const removeBtn = rowDiv.querySelector(".btn-remove-row");
        if (removeBtn) {
            removeBtn.addEventListener("click", function () {
                rowDiv.remove();
                updateLiveTotalDH();
            });
        }

        attachHelperButtonEvents(rowDiv);

        container.appendChild(rowDiv);
        updateLiveTotalDH();
    }

    // Live update total DH in modal
    function updateLiveTotalDH() {
        const amountInputs = document.querySelectorAll("#engagement-modal .item-amount-input");
        let total = 0;
        amountInputs.forEach((input) => {
            const val = parseFloat(input.value) || 0;
            total += val;
        });

        const totalEl = document.getElementById("modal-engagement-total-dh");
        if (totalEl) {
            totalEl.textContent = formatDH(total);
        }
    }

    // Save Engagement to API (Create or Update)
    async function saveEngagement() {
        const vendeurSelect = document.getElementById("engagement-vendeur-select");
        const vendeur = (vendeurSelect ? vendeurSelect.value : "").trim();
        const hiddenPeriod = document.getElementById("engagement-periode-value");
        const periode = (hiddenPeriod ? hiddenPeriod.value : "Jour").trim();
        const dateInput = document.getElementById("engagement-date-input");
        const dateEngagement = (dateInput ? dateInput.value : "").trim();
        const editingId = (document.getElementById("editing-engagement-id")?.value || "").trim();

        if (!vendeur) {
            alert("Veuillez sélectionner un Vendeur.");
            return;
        }

        const rows = document.querySelectorAll("#engagement-modal .engagement-item-row");
        const items = [];
        let hasUnselectedFamille = false;

        rows.forEach((row) => {
            const category = row.getAttribute("data-category");
            const titleInput = row.querySelector(".item-title-input");
            const amountInput = row.querySelector(".item-amount-input");
            let title = (titleInput ? titleInput.value : "").trim();

            if (category === "Famille") {
                const famSelect = row.querySelector(".item-famille-select");
                if (famSelect && famSelect.value) {
                    title = famSelect.value.trim();
                } else if (!title) {
                    hasUnselectedFamille = true;
                }
            }

            const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;

            if (amount > 0 || (category === "Autre" && title)) {
                items.push({
                    category: category,
                    title: title || category,
                    amount_dh: amount
                });
            }
        });

        if (hasUnselectedFamille) {
            alert("Veuillez sélectionner une Famille dans la liste pour vos entrées de catégorie Famille.");
            return;
        }

        if (items.length === 0) {
            alert("Veuillez ajouter au moins une entrée avec un montant en DH.");
            return;
        }

        const payload = {
            vendeur: vendeur,
            periode: periode,
            date_engagement: dateEngagement,
            items: items
        };

        const saveBtn = document.getElementById("save-engagement-btn");
        const originalText = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enregistrement...';

        const url = editingId ? `/api/engagements/${editingId}` : "/api/engagements";
        const method = "POST";

        try {
            const response = await fetch(url, {
                method: method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            if (response.ok && data.status === "success") {
                closeEngagementModal();
                loadEngagements();
            } else {
                alert("Erreur lors de l'enregistrement: " + (data.message || response.statusText || "Erreur serveur"));
            }
        } catch (e) {
            console.error("Error saving engagement:", e);
            alert("Erreur de connexion au serveur: " + (e.message || "Impossible de contacter le serveur"));
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
        }
    }

    // Load Engagements from API
    async function loadEngagements() {
        const loadingEl = document.getElementById("engagements-loading");
        const emptyEl = document.getElementById("engagements-empty");
        const listEl = document.getElementById("engagements-list");

        if (loadingEl) loadingEl.style.display = "block";
        if (emptyEl) emptyEl.style.display = "none";
        if (listEl) listEl.innerHTML = "";

        try {
            const response = await fetch("/api/engagements");
            if (response.ok) {
                const data = await response.json();
                if (data.status === "success" && Array.isArray(data.engagements)) {
                    globalEngagementsList = data.engagements;
                }
            }
        } catch (e) {
            console.error("Error loading engagements:", e);
        } finally {
            if (loadingEl) loadingEl.style.display = "none";
            filterAndRenderEngagements();
        }
    }

    // Filter and Render Cards & Table
    function filterAndRenderEngagements() {
        const listEl = document.getElementById("engagements-list");
        const tableBodyEl = document.getElementById("engagements-table-body");
        const tableFootEl = document.getElementById("engagements-table-foot");
        const emptyEl = document.getElementById("engagements-empty");
        const badgeEl = document.getElementById("engagements-badge");

        if (!listEl) return;

        const searchText = (document.getElementById("engagements-search-input")?.value || "").toLowerCase().trim();
        const selectedVendeur = document.getElementById("engagements-vendeur-filter")?.value || "All";
        const selectedPeriod = document.getElementById("engagements-period-filter")?.value || "All";

        const chakibSet = new Set((chakibSellersCache || []).map((s) => s.toUpperCase()));

        const filtered = globalEngagementsList.filter((eng) => {
            const engVendeurUpper = (eng.vendeur || "").toUpperCase();

            // Search filter
            if (searchText) {
                const matchVendeur = (eng.vendeur || "").toLowerCase().includes(searchText);
                const matchPeriod = (eng.periode || "").toLowerCase().includes(searchText);
                const matchItems = (eng.items || []).some(
                    (it) => (it.title || "").toLowerCase().includes(searchText) || (it.category || "").toLowerCase().includes(searchText)
                );
                if (!matchVendeur && !matchPeriod && !matchItems) return false;
            }

            // Vendeur Filter
            if (selectedVendeur === "TEAM_CHAKIB") {
                if (chakibSet.size > 0 && !chakibSet.has(engVendeurUpper)) {
                    return false;
                }
            } else if (selectedVendeur !== "All" && eng.vendeur !== selectedVendeur) {
                return false;
            }

            // Period Filter
            if (selectedPeriod !== "All" && eng.periode !== selectedPeriod) {
                return false;
            }

            return true;
        });

        // Update Statistics
        updateSummaryStats(filtered);

        if (badgeEl) {
            badgeEl.textContent = `${filtered.length} engagement${filtered.length > 1 ? "s" : ""}`;
        }

        if (filtered.length === 0) {
            listEl.innerHTML = "";
            if (tableBodyEl) tableBodyEl.innerHTML = "";
            if (tableFootEl) tableFootEl.innerHTML = "";
            if (emptyEl) emptyEl.style.display = "block";
            return;
        }

        if (emptyEl) emptyEl.style.display = "none";

        let cardsHtml = "";
        let tableRowsHtml = "";
        let grandTotalDH = 0;

        filtered.forEach((eng) => {
            grandTotalDH += parseFloat(eng.total_dh) || 0;
            const periodBadgeColor =
                eng.periode === "Jour" ? "var(--neon-blue)" : eng.periode === "Semaine" ? "var(--neon-amber)" : "var(--neon-pink)";

            let itemsHtml = "";
            let tableItemsHtml = "";

            (eng.items || []).forEach((item) => {
                let catTagColor = "var(--text-muted)";
                let iconClass = "fa-tag";
                if (item.category === "CA") {
                    catTagColor = "var(--neon-blue)";
                    iconClass = "fa-chart-line";
                } else if (item.category === "Famille") {
                    catTagColor = "var(--neon-green)";
                    iconClass = "fa-boxes-packing";
                } else if (item.category === "Focus") {
                    catTagColor = "var(--neon-amber)";
                    iconClass = "fa-bullseye";
                } else if (item.category === "Autre") {
                    catTagColor = "var(--neon-pink)";
                    iconClass = "fa-pen-to-square";
                }

                const itemLabel = (item.title && item.title !== item.category)
                    ? escapeHtml(item.title)
                    : escapeHtml(item.category);

                itemsHtml += `
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; padding: 0.35rem 0.5rem; background: rgba(0,0,0,0.25); border-radius: 4px; border-left: 3px solid ${catTagColor};">
                        <span style="color: var(--text-main); display: flex; align-items: center; gap: 0.4rem;">
                            <i class="fa-solid ${iconClass}" style="color: ${catTagColor}; font-size: 0.75rem;"></i>
                            <strong style="color: ${catTagColor}; font-size: 0.72rem; font-family: var(--font-mono); text-transform: uppercase;">[${escapeHtml(item.category)}]</strong>
                            ${itemLabel}
                        </span>
                        <span style="font-weight: bold; color: var(--neon-green); font-family: var(--font-mono); font-size: 0.82rem;">
                            ${formatDH(item.amount_dh)}
                        </span>
                    </div>
                `;

                tableItemsHtml += `
                    <span style="display: inline-flex; align-items: center; gap: 0.35rem; padding: 0.25rem 0.55rem; background: rgba(0,0,0,0.3); border: 1px solid ${catTagColor}; border-radius: 4px; margin: 0.15rem; font-size: 0.75rem;">
                        <i class="fa-solid ${iconClass}" style="color: ${catTagColor}; font-size: 0.7rem;"></i>
                        <strong style="color: ${catTagColor}; text-transform: uppercase;">[${escapeHtml(item.category)}]</strong>
                        <span style="color: var(--text-main);">${itemLabel}:</span>
                        <strong style="color: var(--neon-green); font-family: var(--font-mono);">${formatDH(item.amount_dh)}</strong>
                    </span>
                `;
            });

            cardsHtml += `
                <div class="cyber-card engagement-card" data-id="${eng.id}" style="display: flex; flex-direction: column; justify-content: space-between; border-color: rgba(0, 240, 255, 0.25); padding: 1.25rem; cursor: pointer; transition: transform 0.2s, border-color 0.2s;" title="Cliquer pour modifier cet engagement">
                    <div class="card-edge"></div>
                    
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; margin-bottom: 0.75rem;">
                            <div>
                                <span style="font-size: 1.05rem; font-weight: bold; color: var(--text-main); font-family: var(--font-main);">
                                    <i class="fa-solid fa-user-tie neon-text-blue" style="margin-right: 0.35rem;"></i>
                                    ${escapeHtml(eng.vendeur)}
                                </span>
                                <div style="font-size: 0.75rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 0.25rem;">
                                    <i class="fa-solid fa-calendar-day" style="margin-right: 0.25rem;"></i> ${escapeHtml(eng.date_engagement)}
                                </div>
                            </div>
                            
                            <span class="badge" style="background: rgba(0,0,0,0.4); border: 1px solid ${periodBadgeColor}; color: ${periodBadgeColor}; font-family: var(--font-mono); font-size: 0.72rem; font-weight: bold; padding: 0.25rem 0.6rem; border-radius: 4px; text-transform: uppercase;">
                                <i class="fa-solid fa-clock" style="margin-right: 0.25rem;"></i> ${escapeHtml(eng.periode)}
                            </span>
                        </div>

                        <div style="display: flex; flex-direction: column; gap: 0.4rem; margin: 0.85rem 0 1rem 0;">
                            ${itemsHtml}
                        </div>
                    </div>

                    <div style="border-top: 1px solid var(--border-color); padding-top: 0.85rem; display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                        <div>
                            <span style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono); text-transform: uppercase; display: block;">Total Engagé</span>
                            <span style="font-size: 1.15rem; font-weight: bold; color: var(--neon-green); font-family: var(--font-mono);">
                                ${formatDH(eng.total_dh)}
                            </span>
                        </div>

                        <div style="display: flex; gap: 0.4rem; align-items: center;">
                            <button type="button" class="btn-edit-engagement" data-id="${eng.id}" style="background: rgba(0, 240, 255, 0.1); border: 1px solid rgba(0, 240, 255, 0.35); color: var(--neon-blue); padding: 0.35rem 0.65rem; border-radius: 4px; font-size: 0.78rem; cursor: pointer; transition: all 0.2s;" title="Modifier cet engagement">
                                <i class="fa-solid fa-pen-to-square"></i> Modifier
                            </button>
                            <button type="button" class="btn-delete-engagement" data-id="${eng.id}" style="background: rgba(255,0,85,0.1); border: 1px solid rgba(255,0,85,0.3); color: var(--neon-pink); padding: 0.35rem 0.65rem; border-radius: 4px; font-size: 0.78rem; cursor: pointer; transition: all 0.2s;" title="Supprimer cet engagement">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            tableRowsHtml += `
                <tr data-id="${eng.id}" style="border-bottom: 1px solid rgba(255,255,255,0.05); transition: background 0.2s; cursor: pointer;" title="Cliquer pour modifier">
                    <td style="padding: 0.85rem 1rem; color: var(--text-main); font-weight: bold; font-family: var(--font-main);">
                        <i class="fa-solid fa-user-tie neon-text-blue" style="margin-right: 0.4rem;"></i>
                        ${escapeHtml(eng.vendeur)}
                    </td>
                    <td style="padding: 0.85rem; text-align: center;">
                        <span style="background: rgba(0,0,0,0.4); border: 1px solid ${periodBadgeColor}; color: ${periodBadgeColor}; font-family: var(--font-mono); font-size: 0.72rem; font-weight: bold; padding: 0.2rem 0.5rem; border-radius: 4px; text-transform: uppercase;">
                            ${escapeHtml(eng.periode)}
                        </span>
                    </td>
                    <td style="padding: 0.85rem; text-align: center; color: var(--text-muted); font-family: var(--font-mono); font-size: 0.8rem;">
                        ${escapeHtml(eng.date_engagement)}
                    </td>
                    <td style="padding: 0.85rem 1rem;">
                        <div style="display: flex; flex-wrap: wrap; gap: 0.25rem;">
                            ${tableItemsHtml}
                        </div>
                    </td>
                    <td style="padding: 0.85rem 1rem; text-align: right; color: var(--neon-green); font-weight: bold; font-family: var(--font-mono); font-size: 0.95rem;">
                        ${formatDH(eng.total_dh)}
                    </td>
                    <td style="padding: 0.85rem; text-align: center;">
                        <div style="display: flex; gap: 0.35rem; justify-content: center; align-items: center;">
                            <button type="button" class="btn-edit-engagement" data-id="${eng.id}" style="background: rgba(0, 240, 255, 0.1); border: 1px solid rgba(0, 240, 255, 0.35); color: var(--neon-blue); padding: 0.3rem 0.55rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;" title="Modifier cet engagement">
                                <i class="fa-solid fa-pen-to-square"></i>
                            </button>
                            <button type="button" class="btn-delete-engagement" data-id="${eng.id}" style="background: rgba(255,0,85,0.1); border: 1px solid rgba(255,0,85,0.3); color: var(--neon-pink); padding: 0.3rem 0.55rem; border-radius: 4px; font-size: 0.75rem; cursor: pointer; transition: all 0.2s;" title="Supprimer cet engagement">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        listEl.innerHTML = cardsHtml;

        if (tableBodyEl) {
            tableBodyEl.innerHTML = tableRowsHtml;
        }

        if (tableFootEl) {
            tableFootEl.innerHTML = `
                <tr>
                    <td colspan="4" style="padding: 0.85rem 1rem; font-weight: bold; color: var(--text-main); font-family: var(--font-mono); text-transform: uppercase;">
                        TOTAL CUMULÉ (${filtered.length} ENGAGEMENT${filtered.length > 1 ? "S" : ""})
                    </td>
                    <td style="padding: 0.85rem 1rem; text-align: right; font-weight: bold; color: var(--neon-green); font-family: var(--font-mono); font-size: 1.05rem;">
                        ${formatDH(grandTotalDH)}
                    </td>
                    <td></td>
                </tr>
            `;
        }

        // Attach edit handlers
        const editBtns = document.querySelectorAll(".btn-edit-engagement");
        editBtns.forEach((btn) => {
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                const engId = this.getAttribute("data-id");
                openEditEngagementModal(engId);
            });
        });

        // Click card to edit
        const cards = listEl.querySelectorAll(".engagement-card");
        cards.forEach((card) => {
            card.addEventListener("click", function (e) {
                if (e.target.closest(".btn-delete-engagement")) return;
                const engId = this.getAttribute("data-id");
                if (engId) openEditEngagementModal(engId);
            });
        });

        // Click row to edit
        if (tableBodyEl) {
            const rows = tableBodyEl.querySelectorAll("tr");
            rows.forEach((row) => {
                row.addEventListener("click", function (e) {
                    if (e.target.closest(".btn-delete-engagement")) return;
                    const engId = this.getAttribute("data-id");
                    if (engId) openEditEngagementModal(engId);
                });
            });
        }

        // Attach delete handlers
        const deleteBtns = document.querySelectorAll(".btn-delete-engagement");
        deleteBtns.forEach((btn) => {
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                const engId = this.getAttribute("data-id");
                deleteEngagement(engId);
            });
        });
    }

    // Update Summary Header Stats
    function updateSummaryStats(engagements) {
        const totalCountEl = document.getElementById("stat-engagement-total-count");
        const totalDhEl = document.getElementById("stat-engagement-total-dh");
        const jourCountEl = document.getElementById("stat-engagement-jour-count");
        const periodCountEl = document.getElementById("stat-engagement-period-count");
        const caDhEl = document.getElementById("stat-engagement-ca-dh");
        const familleDhEl = document.getElementById("stat-engagement-famille-dh");
        const focusDhEl = document.getElementById("stat-engagement-focus-dh");
        const autreDhEl = document.getElementById("stat-engagement-autre-dh");

        let totalDH = 0;
        let jourCount = 0;
        let semaineCount = 0;
        let moisCount = 0;

        let totalCA = 0;
        let totalFamille = 0;
        let totalFocus = 0;
        let totalAutre = 0;

        engagements.forEach((eng) => {
            totalDH += parseFloat(eng.total_dh) || 0;
            if (eng.periode === "Jour") jourCount++;
            else if (eng.periode === "Semaine") semaineCount++;
            else if (eng.periode === "Mois") moisCount++;

            (eng.items || []).forEach((item) => {
                const amt = parseFloat(item.amount_dh) || 0;
                if (item.category === "CA") totalCA += amt;
                else if (item.category === "Famille") totalFamille += amt;
                else if (item.category === "Focus") totalFocus += amt;
                else if (item.category === "Autre") totalAutre += amt;
            });
        });

        if (totalCountEl) totalCountEl.textContent = engagements.length;
        if (totalDhEl) totalDhEl.textContent = formatDH(totalDH);
        if (jourCountEl) jourCountEl.textContent = jourCount;
        if (periodCountEl) periodCountEl.textContent = `${semaineCount} / ${moisCount}`;

        if (caDhEl) caDhEl.textContent = formatDH(totalCA);
        if (familleDhEl) familleDhEl.textContent = formatDH(totalFamille);
        if (focusDhEl) focusDhEl.textContent = formatDH(totalFocus);
        if (autreDhEl) autreDhEl.textContent = formatDH(totalAutre);
    }

    // Delete Engagement
    async function deleteEngagement(id) {
        if (!confirm("Voulez-vous vraiment supprimer cet engagement ?")) return;

        try {
            const response = await fetch(`/api/engagements/${id}`, {
                method: "DELETE"
            });
            const data = await response.json();
            if (response.ok && data.status === "success") {
                loadEngagements();
            } else {
                alert("Erreur lors de la suppression: " + (data.message || "Erreur inconnue"));
            }
        } catch (e) {
            console.error("Error deleting engagement:", e);
            alert("Erreur de connexion au serveur.");
        }
    }

    // Helper: format currency in DH
    function formatDH(val) {
        const num = parseFloat(val) || 0;
        return num.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DH";
    }

    // Helper: round two decimals
    function roundTwo(val) {
        return Math.round((parseFloat(val) || 0) * 100) / 100;
    }

    // Helper: sanitize HTML
    function escapeHtml(str) {
        if (!str) return "";
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
})();
