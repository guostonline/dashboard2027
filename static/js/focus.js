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
    let selectedCdzFilter = '';
    let selectedUploadFile = null;
    let selectedObjectivesUploadFile = null;
    let focusNames = {"GLACE": "GLACE", "TOMATE_FRITO": "TOMATE FRITO"};
    let focusWorkdays = null;
    let focusSettings = null;
    let focusTotalDays = 24;

    // Wait until DOM is ready
    document.addEventListener('DOMContentLoaded', function () {
        const focusContainer = document.getElementById('focus-container');
        if (focusContainer) {
            initFocusTab();
        }
    });

    document.addEventListener('taxModeChanged', function () {
        const focusContainer = document.getElementById('focus-container');
        if (focusContainer && focusData) {
            renderFocusView();
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

        // Bind Focus Objectives upload modal triggers
        const objectivesUploadBtn = document.getElementById('focus-objectifs-upload-btn');
        const objectivesUploadModal = document.getElementById('focus-objectifs-upload-modal');
        const closeObjectivesModalBtn = document.getElementById('close-focus-objectifs-upload-modal');
        const cancelObjectivesModalBtn = document.getElementById('cancel-focus-objectifs-upload');
        const submitObjectivesModalBtn = document.getElementById('submit-focus-objectifs-upload');
        const objectivesFileInput = document.getElementById('focus-objectifs-modal-file-input');
        const objectivesDropzone = document.getElementById('focus-objectifs-dropzone');

        if (objectivesUploadBtn && objectivesUploadModal) {
            // Open modal
            objectivesUploadBtn.addEventListener('click', function () {
                objectivesUploadModal.classList.add('open');
                selectedObjectivesUploadFile = null;
                resetObjectivesUploadModalState();
            });

            // Close modal functions
            const closeObjectivesModal = function () {
                objectivesUploadModal.classList.remove('open');
                selectedObjectivesUploadFile = null;
                resetObjectivesUploadModalState();
            };

            if (closeObjectivesModalBtn) closeObjectivesModalBtn.addEventListener('click', closeObjectivesModal);
            if (cancelObjectivesModalBtn) cancelObjectivesModalBtn.addEventListener('click', closeObjectivesModal);
            
            // Clicking backdrop closes modal
            objectivesUploadModal.addEventListener('click', function (e) {
                if (e.target === objectivesUploadModal) {
                    closeObjectivesModal();
                }
            });

            // Drag and Drop handlers for objectives
            if (objectivesDropzone && objectivesFileInput) {
                objectivesDropzone.addEventListener('click', function () {
                    objectivesFileInput.click();
                });

                objectivesFileInput.addEventListener('change', function () {
                    if (objectivesFileInput.files.length > 0) {
                        selectObjectivesUploadFileFunc(objectivesFileInput.files[0]);
                    }
                });

                ['dragenter', 'dragover'].forEach(eventName => {
                    objectivesDropzone.addEventListener(eventName, function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        objectivesDropzone.classList.add('dragover');
                    }, false);
                });

                ['dragleave', 'drop'].forEach(eventName => {
                    objectivesDropzone.addEventListener(eventName, function (e) {
                        e.preventDefault();
                        e.stopPropagation();
                        objectivesDropzone.classList.remove('dragover');
                    }, false);
                });

                objectivesDropzone.addEventListener('drop', function (e) {
                    const dt = e.dataTransfer;
                    const files = dt.files;
                    if (files.length > 0) {
                        selectObjectivesUploadFileFunc(files[0]);
                    }
                }, false);
            }

            // Confirm objectives upload
            if (submitObjectivesModalBtn) {
                submitObjectivesModalBtn.addEventListener('click', function () {
                    if (!selectedObjectivesUploadFile) {
                        if (window.showToast) {
                            window.showToast("Veuillez sélectionner ou glisser un fichier Excel d'objectifs.", "error");
                        } else {
                            alert("Veuillez sélectionner un fichier Excel d'objectifs.");
                        }
                        return;
                    }
                    handleObjectivesUpload(selectedObjectivesUploadFile, closeObjectivesModal);
                });
            }
        }

        // 3. Bind Vendeur filter select dropdown
        const vendeurFilter = document.getElementById('focus-vendeur-filter');
        if (vendeurFilter) {
            vendeurFilter.addEventListener('change', function () {
                selectedVendeurFilter = vendeurFilter.value;
                console.log("Selected vendeur filter:", selectedVendeurFilter);
                
                if (selectedVendeurFilter) {
                    selectedCdzFilter = ''; // Reset CDZ filter when vendor selected
                }
                
                const comparisonCard = document.getElementById('focus-comparison-card');
                if (comparisonCard) {
                    if (selectedVendeurFilter) {
                        comparisonCard.style.display = 'none';
                    } else {
                        comparisonCard.style.display = 'block';
                    }
                }
                
                renderFocusView();
                renderFocusTrendChart();
            });
        }

        // 5. Bind Objectives Edit Modal Triggers
        const editBtn = document.getElementById('focus-objectifs-edit-btn');
        const editModal = document.getElementById('focus-edit-objectifs-modal');
        const closeEditModalBtn = document.getElementById('close-focus-edit-objectifs-modal');
        const cancelEditModalBtn = document.getElementById('cancel-focus-edit-objectifs');
        const submitEditModalBtn = document.getElementById('submit-focus-edit-objectifs');
        
        if (editBtn && editModal) {
            editBtn.addEventListener('click', function () {
                openObjectivesEditor();
            });
            
            const closeEditModal = function () {
                editModal.classList.remove('open');
            };
            
            if (closeEditModalBtn) closeEditModalBtn.addEventListener('click', closeEditModal);
            if (cancelEditModalBtn) cancelEditModalBtn.addEventListener('click', closeEditModal);
            
            editModal.addEventListener('click', function (e) {
                if (e.target === editModal) {
                    closeEditModal();
                }
            });
            
            // Tab switches inside editor
            const editTabSom = document.getElementById('focus-edit-tab-som');
            const editTabVmm = document.getElementById('focus-edit-tab-vmm');
            const somContainer = document.getElementById('focus-edit-som-container');
            const vmmContainer = document.getElementById('focus-edit-vmm-container');
            
            if (editTabSom && editTabVmm && somContainer && vmmContainer) {
                editTabSom.addEventListener('click', function () {
                    editTabSom.classList.add('active');
                    editTabSom.style.borderBottom = '3px solid var(--neon-blue)';
                    editTabSom.style.color = 'var(--text-main)';
                    editTabVmm.classList.remove('active');
                    editTabVmm.style.borderBottom = '3px solid transparent';
                    editTabVmm.style.color = 'var(--text-muted)';
                    somContainer.style.display = 'block';
                    vmmContainer.style.display = 'none';
                });
                editTabVmm.addEventListener('click', function () {
                    editTabVmm.classList.add('active');
                    editTabVmm.style.borderBottom = '3px solid var(--neon-pink)';
                    editTabVmm.style.color = 'var(--text-main)';
                    editTabSom.classList.remove('active');
                    editTabSom.style.borderBottom = '3px solid transparent';
                    editTabSom.style.color = 'var(--text-muted)';
                    vmmContainer.style.display = 'block';
                    somContainer.style.display = 'none';
                });
            }
            
            // Add row triggers
            const addRowSomBtn = document.getElementById('focus-edit-add-row-som');
            const addRowVmmBtn = document.getElementById('focus-edit-add-row-vmm');
            
            if (addRowSomBtn) {
                addRowSomBtn.addEventListener('click', function () {
                    addObjectiveRow('GLACE');
                });
            }
            if (addRowVmmBtn) {
                addRowVmmBtn.addEventListener('click', function () {
                    addObjectiveRow('TOMATE_FRITO');
                });
            }
            
            // Submit trigger
            if (submitEditModalBtn) {
                submitEditModalBtn.addEventListener('click', function () {
                    saveObjectives(closeEditModal);
                });
            }
        }

        // 4. Load initial rankings and historical trend data
        loadFocusData();
        loadFocusTrendData();
    }

    function openObjectivesEditor() {
        const editModal = document.getElementById('focus-edit-objectifs-modal');
        if (!editModal) return;
        
        const somNameEls = editModal.querySelectorAll('.som-focus-name');
        const vmmNameEls = editModal.querySelectorAll('.vmm-focus-name');
        
        const somName = focusNames.GLACE || "GLACE";
        const vmmName = focusNames.TOMATE_FRITO || "TOMATE FRITO";
        
        somNameEls.forEach(el => el.innerText = somName);
        vmmNameEls.forEach(el => el.innerText = vmmName);
        
        fetch('/api/focus/objectives')
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                populateEditTables(res.objectives);
                editModal.classList.add('open');
            } else {
                if (window.showToast) {
                    window.showToast("Erreur lors de la récupération des objectifs.", "error");
                }
            }
        })
        .catch(err => {
            console.error("Fetch objectives failed:", err);
        });
    }

    function populateEditTables(objectives) {
        const somTbody = document.getElementById('focus-edit-som-tbody');
        const vmmTbody = document.getElementById('focus-edit-vmm-tbody');
        
        if (somTbody) somTbody.innerHTML = '';
        if (vmmTbody) vmmTbody.innerHTML = '';
        
        objectives.forEach(obj => {
            const tr = document.createElement('tr');
            const focusType = obj.focus_type;
            const rowHtml = createEditRowHtml(focusType, obj);
            tr.innerHTML = rowHtml;
            
            tr.querySelector('.edit-delete-row')?.addEventListener('click', function () {
                tr.remove();
            });
            
            if (focusType === 'GLACE') {
                if (somTbody) somTbody.appendChild(tr);
            } else {
                if (vmmTbody) vmmTbody.appendChild(tr);
            }
        });
    }

    function createEditRowHtml(focusType, obj = {}) {
        const vendeur = obj.vendeur || '';
        const secteur = obj.secteur || '';
        if (focusType === 'GLACE') {
            const glace_ht = obj.glace_ht || 0;
            const ttc = obj.ttc || 0;
            return `
                <td style="padding: 0.5rem;"><input type="text" class="cyber-input edit-vendeur" style="width: 100%; box-sizing: border-box; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${vendeur}" placeholder="ex: 03 ALAMI" required /></td>
                <td style="padding: 0.5rem;"><input type="text" class="cyber-input edit-secteur" style="width: 100%; box-sizing: border-box; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${secteur}" placeholder="ex: SECTEUR 1" required /></td>
                <td style="padding: 0.5rem;"><input type="number" step="any" class="cyber-input edit-glace-ht" style="width: 100%; box-sizing: border-box; text-align: right; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${glace_ht}" /></td>
                <td style="padding: 0.5rem;"><input type="number" step="any" class="cyber-input edit-ttc" style="width: 100%; box-sizing: border-box; text-align: right; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${ttc}" /></td>
                <td style="padding: 0.5rem; text-align: center;"><button type="button" class="cyber-btn edit-delete-row" style="border-color: var(--neon-red); color: var(--neon-red); padding: 0.2rem 0.5rem;"><i class="fa-solid fa-trash"></i></button></td>
            `;
        } else {
            const number_client = obj.number_client || 0;
            const obj_acm = obj.obj_acm || 0;
            const obj_juin = obj.obj_juin || 0;
            return `
                <td style="padding: 0.5rem;"><input type="text" class="cyber-input edit-vendeur" style="width: 100%; box-sizing: border-box; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${vendeur}" placeholder="ex: 03 ALAMI" required /></td>
                <td style="padding: 0.5rem;"><input type="text" class="cyber-input edit-secteur" style="width: 100%; box-sizing: border-box; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${secteur}" placeholder="ex: SECTEUR 1" required /></td>
                <td style="padding: 0.5rem;"><input type="number" step="any" class="cyber-input edit-nb-clients" style="width: 100%; box-sizing: border-box; text-align: right; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${number_client}" /></td>
                <td style="padding: 0.5rem;"><input type="number" step="any" class="cyber-input edit-obj-acm" style="width: 100%; box-sizing: border-box; text-align: right; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${obj_acm}" /></td>
                <td style="padding: 0.5rem;"><input type="number" step="any" class="cyber-input edit-obj-juin" style="width: 100%; box-sizing: border-box; text-align: right; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color);" value="${obj_juin}" /></td>
                <td style="padding: 0.5rem; text-align: center;"><button type="button" class="cyber-btn edit-delete-row" style="border-color: var(--neon-red); color: var(--neon-red); padding: 0.2rem 0.5rem;"><i class="fa-solid fa-trash"></i></button></td>
            `;
        }
    }

    function addObjectiveRow(focusType) {
        const tbodyId = focusType === 'GLACE' ? 'focus-edit-som-tbody' : 'focus-edit-vmm-tbody';
        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        
        const tr = document.createElement('tr');
        tr.innerHTML = createEditRowHtml(focusType);
        
        tr.querySelector('.edit-delete-row')?.addEventListener('click', function () {
            tr.remove();
        });
        
        tbody.appendChild(tr);
        const modalBody = tbody.closest('.modal-body');
        if (modalBody) {
            modalBody.scrollTop = modalBody.scrollHeight;
        }
    }

    function saveObjectives(callback) {
        const somTbody = document.getElementById('focus-edit-som-tbody');
        const vmmTbody = document.getElementById('focus-edit-vmm-tbody');
        const submitBtn = document.getElementById('submit-focus-edit-objectifs');
        
        const objectives = [];
        let isValid = true;
        
        const collectRows = function (tbody, focusType) {
            if (!tbody) return;
            const rows = tbody.querySelectorAll('tr');
            rows.forEach(row => {
                const vendeur = row.querySelector('.edit-vendeur')?.value.trim();
                const secteur = row.querySelector('.edit-secteur')?.value.trim();
                
                if (!vendeur || !secteur) {
                    isValid = false;
                    row.querySelector('.edit-vendeur')?.classList.add('error');
                    row.querySelector('.edit-secteur')?.classList.add('error');
                    return;
                }
                
                if (focusType === 'GLACE') {
                    const glace_ht = parseFloat(row.querySelector('.edit-glace-ht')?.value || '0');
                    const ttc = parseFloat(row.querySelector('.edit-ttc')?.value || '0');
                    objectives.push({
                        focus_type: 'GLACE',
                        vendeur: vendeur,
                        secteur: secteur,
                        glace_ht: glace_ht,
                        ttc: ttc
                    });
                } else {
                    const number_client = parseInt(row.querySelector('.edit-nb-clients')?.value || '0');
                    const obj_acm = parseFloat(row.querySelector('.edit-obj-acm')?.value || '0');
                    const obj_juin = parseFloat(row.querySelector('.edit-obj-juin')?.value || '0');
                    objectives.push({
                        focus_type: 'TOMATE_FRITO',
                        vendeur: vendeur,
                        secteur: secteur,
                        number_client: number_client,
                        obj_acm: obj_acm,
                        obj_juin: obj_juin
                    });
                }
            });
        };
        
        collectRows(somTbody, 'GLACE');
        collectRows(vmmTbody, 'TOMATE_FRITO');
        
        if (!isValid) {
            if (window.showToast) {
                window.showToast("Veuillez remplir le nom du vendeur et le secteur pour toutes les lignes.", "error");
            }
            return;
        }
        
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ENREGISTREMENT...';
        }
        
        fetch('/api/focus/objectives/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ objectives: objectives })
        })
        .then(response => response.json())
        .then(res => {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> SAUVEGARDER';
            }
            if (res.status === 'success') {
                if (window.showToast) {
                    window.showToast(res.message, "success");
                }
                if (callback) callback();
                loadFocusData();
            } else {
                if (window.showToast) {
                    window.showToast(res.message || "Erreur lors de l'enregistrement.", "error");
                }
            }
        })
        .catch(err => {
            console.error("Save objectives failed:", err);
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-save"></i> SAUVEGARDER';
            }
        });
    }

    function resetUploadModalState() {
        selectedUploadFile = null;
        const dropzone = document.getElementById('focus-dropzone');
        const fileInput = document.getElementById('focus-modal-file-input');
        const submitModalBtn = document.getElementById('submit-focus-upload');
        const mappingSection = document.getElementById('focus-sheet-mapping-section');
        
        if (submitModalBtn) {
            submitModalBtn.disabled = false;
            submitModalBtn.innerHTML = '<i class="fa-solid fa-check"></i> CONFIRMER';
        }
        
        if (fileInput) fileInput.value = '';
        if (mappingSection) {
            mappingSection.style.display = 'none';
            const mappingSelects = mappingSection.querySelectorAll('select');
            mappingSelects.forEach(select => select.innerHTML = '');
        }
        
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
        
        inspectExcelFile(file);
    }

    function inspectExcelFile(file) {
        const mappingSection = document.getElementById('focus-sheet-mapping-section');
        const submitModalBtn = document.getElementById('submit-focus-upload');
        if (!mappingSection) return;
        
        if (submitModalBtn) {
            submitModalBtn.disabled = true;
            submitModalBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> INSPECTION DU FICHIER...';
        }
        
        const formData = new FormData();
        formData.append('file', file);
        
        fetch('/api/focus/inspect', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(res => {
            if (submitModalBtn) {
                submitModalBtn.disabled = false;
                submitModalBtn.innerHTML = '<i class="fa-solid fa-check"></i> CONFIRMER';
            }
            if (res.status === 'success') {
                populateSheetMappings(res.sheets, res.focus_names);
                mappingSection.style.display = 'block';
            } else {
                if (window.showToast) {
                    window.showToast(res.message || "Impossible d'analyser le fichier.", "error");
                }
            }
        })
        .catch(err => {
            console.error("Inspect failed:", err);
            if (submitModalBtn) {
                submitModalBtn.disabled = false;
                submitModalBtn.innerHTML = '<i class="fa-solid fa-check"></i> CONFIRMER';
            }
        });
    }

    function populateSheetMappings(sheets, names) {
        const somNameEls = document.querySelectorAll('.som-focus-name');
        const vmmNameEls = document.querySelectorAll('.vmm-focus-name');
        
        const somName = names.GLACE || "GLACE";
        const vmmName = names.TOMATE_FRITO || "TOMATE FRITO";
        
        somNameEls.forEach(el => el.innerText = somName);
        vmmNameEls.forEach(el => el.innerText = vmmName);
        
        const somVendeursSelect = document.getElementById('focus-mapping-som-vendeurs');
        const somCdzSelect = document.getElementById('focus-mapping-som-cdz');
        const vmmVendeursSelect = document.getElementById('focus-mapping-vmm-vendeurs');
        const vmmCdzSelect = document.getElementById('focus-mapping-vmm-cdz');
        
        const selects = [somVendeursSelect, somCdzSelect, vmmVendeursSelect, vmmCdzSelect];
        
        selects.forEach(select => {
            if (!select) return;
            select.innerHTML = '<option value="none">-- Ignorer cette feuille --</option>';
            sheets.forEach(sheet => {
                const opt = document.createElement('option');
                opt.value = sheet;
                opt.innerText = sheet;
                select.appendChild(opt);
            });
        });
        
        const somUpper = somName.toUpperCase();
        const vmmUpper = vmmName.toUpperCase();
        
        sheets.forEach(sheet => {
            const su = sheet.toUpperCase();
            
            if (su.includes('DET') && (su.includes('SOM') || su.includes(somUpper) || su.includes('GLACE'))) {
                if (somVendeursSelect) somVendeursSelect.value = sheet;
            }
            else if (su.includes('CDZ') && (su.includes('SOM') || su.includes(somUpper) || su.includes('GLACE'))) {
                if (somCdzSelect) somCdzSelect.value = sheet;
            }
            else if (su.includes('DET') && (su.includes('VMM') || su.includes(vmmUpper) || su.includes('TOMATE'))) {
                if (vmmVendeursSelect) vmmVendeursSelect.value = sheet;
            }
            else if (su.includes('CDZ') && (su.includes('VMM') || su.includes(vmmUpper) || su.includes('TOMATE'))) {
                if (vmmCdzSelect) vmmCdzSelect.value = sheet;
            }
        });
    }

    function switchTab(type) {
        currentFocusType = type;
        selectedCdzFilter = ''; // Reset CDZ filter on tab switch
        
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

        const somVendeurs = document.getElementById('focus-mapping-som-vendeurs')?.value || '';
        const somCdz = document.getElementById('focus-mapping-som-cdz')?.value || '';
        const vmmVendeurs = document.getElementById('focus-mapping-vmm-vendeurs')?.value || '';
        const vmmCdz = document.getElementById('focus-mapping-vmm-cdz')?.value || '';

        const formData = new FormData();
        formData.append('file', file);
        formData.append('date', dateStr);
        formData.append('som_vendeurs_sheet', somVendeurs);
        formData.append('som_cdz_sheet', somCdz);
        formData.append('vmm_vendeurs_sheet', vmmVendeurs);
        formData.append('vmm_cdz_sheet', vmmCdz);

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

    function resetObjectivesUploadModalState() {
        selectedObjectivesUploadFile = null;
        const dropzone = document.getElementById('focus-objectifs-dropzone');
        const fileInput = document.getElementById('focus-objectifs-modal-file-input');
        const submitModalBtn = document.getElementById('submit-focus-objectifs-upload');
        const namesGroup = document.getElementById('focus-objectifs-names-group');
        const somNameInput = document.getElementById('focus-objectifs-som-name');
        const vmmNameInput = document.getElementById('focus-objectifs-vmm-name');
        
        if (submitModalBtn) {
            submitModalBtn.disabled = false;
            submitModalBtn.innerHTML = '<i class="fa-solid fa-check"></i> CONFIRMER';
        }
        
        if (fileInput) fileInput.value = '';
        if (namesGroup) namesGroup.style.display = 'none';
        if (somNameInput) somNameInput.value = '';
        if (vmmNameInput) vmmNameInput.value = '';
        
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

    function selectObjectivesUploadFileFunc(file) {
        if (!file.name.endsWith('.xlsx')) {
            if (window.showToast) {
                window.showToast("Seuls les fichiers Excel (.xlsx) sont acceptés.", "error");
            } else {
                alert("Fichier invalide.");
            }
            return;
        }
        selectedObjectivesUploadFile = file;
        
        // Dynamic dropzone update
        const dropzone = document.getElementById('focus-objectifs-dropzone');
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

        // Post to parse names endpoint to let the user edit them
        const formData = new FormData();
        formData.append('file', file);
        
        const namesGroup = document.getElementById('focus-objectifs-names-group');
        const somNameInput = document.getElementById('focus-objectifs-som-name');
        const vmmNameInput = document.getElementById('focus-objectifs-vmm-name');
        
        if (namesGroup) {
            namesGroup.style.display = 'block';
            if (somNameInput) somNameInput.value = 'Chargement...';
            if (vmmNameInput) vmmNameInput.value = 'Chargement...';
        }

        fetch('/api/focus/parse_sheet_names', {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                if (somNameInput) somNameInput.value = res.som_name;
                if (vmmNameInput) vmmNameInput.value = res.vmm_name;
            } else {
                if (somNameInput) somNameInput.value = 'GLACE';
                if (vmmNameInput) vmmNameInput.value = 'TOMATE FRITO';
            }
        })
        .catch(err => {
            console.error("Error parsing names:", err);
            if (somNameInput) somNameInput.value = 'GLACE';
            if (vmmNameInput) vmmNameInput.value = 'TOMATE FRITO';
        });
    }

    function handleObjectivesUpload(file, callback) {
        const submitModalBtn = document.getElementById('submit-focus-objectifs-upload');
        const somNameInput = document.getElementById('focus-objectifs-som-name');
        const vmmNameInput = document.getElementById('focus-objectifs-vmm-name');
        
        if (submitModalBtn) {
            submitModalBtn.disabled = true;
            submitModalBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> IMPORTATION...';
        }

        const formData = new FormData();
        formData.append('file', file);
        if (somNameInput && somNameInput.value) {
            formData.append('som_name', somNameInput.value.trim());
        }
        if (vmmNameInput && vmmNameInput.value) {
            formData.append('vmm_name', vmmNameInput.value.trim());
        }

        fetch('/api/focus/upload_objectives', {
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
                // Reload data and historical trend to reflect new objectives
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
            console.error("Objectives upload failed:", err);
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
                focusWorkdays = res.workdays || null;
                if (res.focus_names) {
                    focusNames = res.focus_names;
                    updateTabTitles();
                }
                if (statusEl) {
                    if (res.upload_date) {
                        statusEl.innerHTML = `<i class="fa-solid fa-clock"></i> Dernière mise à jour : <strong>${res.upload_date}</strong>`;
                    } else {
                        statusEl.innerHTML = `<i class="fa-solid fa-circle-info"></i> Objectifs chargés. Veuillez importer les classements (focus2.xlsx).`;
                    }
                }
                renderFocusView();
            } else {
                if (statusEl) {
                    statusEl.innerText = "Aucun historique ou donnée disponible. Veuillez importer focus2.xlsx ou les objectifs (focus_obj.xlsx).";
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

    function updateTabTitles() {
        const tabGlace = document.getElementById('focus-tab-glace');
        const tabTomate = document.getElementById('focus-tab-tomate');
        if (tabGlace) {
            tabGlace.innerHTML = `<i class="fa-solid fa-ice-cream neon-text-blue"></i> FOCUS ${focusNames.GLACE || "GLACE"} (SOM)`;
        }
        if (tabTomate) {
            tabTomate.innerHTML = `<i class="fa-solid fa-tomato neon-text-pink"></i> FOCUS ${focusNames.TOMATE_FRITO || "TOMATE FRITO"} (VMM)`;
        }
    }

    function loadFocusTrendData() {
        fetch('/api/focus/trend?agence=AGADIR')
        .then(response => response.json())
        .then(res => {
            if (res.status === 'success') {
                focusHistoryData = res.data;
                focusSettings = res.settings || null;
                focusTotalDays = res.total_days || 24;
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
        let reps = cohort.reps || [];
        const cdz = cohort.cdz || [];
        
        // Fallback to objectives if rankings are empty
        if (reps.length === 0 && focusData.objectives && focusData.objectives.length > 0) {
            const targetType = currentFocusType === 'GLACE' ? 'GLACE' : 'TOMATE_FRITO';
            const filteredObjs = focusData.objectives.filter(o => o.focus_type === targetType);
            
            reps = filteredObjs.map((o, idx) => {
                return {
                    rank: idx + 1,
                    representative: o.vendeur,
                    secteur: o.secteur,
                    obj_ttc: o.ttc,
                    obj_ht: o.glace_ht,
                    obj_acm: o.obj_acm,
                    nb_clients: o.number_client,
                    realised_ttc: 0,
                    realised_clients: 0,
                    deviation: 0.0,
                    cdz: "N/A"
                };
            });
            
            // Sort by objective value descending
            reps.sort((a, b) => {
                const valA = currentFocusType === 'GLACE' ? a.obj_ttc : a.obj_acm;
                const valB = currentFocusType === 'GLACE' ? b.obj_ttc : b.obj_acm;
                return valB - valA;
            });
            
            // Reset ranks
            reps.forEach((r, idx) => r.rank = idx + 1);
        }
        
        // Filter representatives based on vendedor selection
        if (selectedVendeurFilter) {
            reps = reps.filter(r => r.representative.startsWith(selectedVendeurFilter));
        }
        
        // Filter representatives based on CDZ selection
        if (selectedCdzFilter) {
            reps = reps.filter(r => (r.cdz || '').trim().toUpperCase() === selectedCdzFilter.trim().toUpperCase());
        }
        
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
            const taxMode = localStorage.getItem('taxMode') || 'TTC';
            tableTitle.innerHTML = `<i class="fa-solid fa-list-ol"></i> CLASSEMENT REPRÉSENTANTS ${focusNames.GLACE || "GLACE"} (SOM)`;
            repsHeaders.innerHTML = `
                <th>Rang</th>
                <th>Vendeur</th>
                <th>Secteur</th>
                <th>Objectif ${taxMode}</th>
                <th>Réalisé ${taxMode}</th>
                <th>Écart (%)</th>
                <th>Chef de Zone</th>
            `;

            reps.forEach(r => {
                const tr = document.createElement('tr');
                const devPct = r.deviation * 100;
                
                const devClass = devPct >= 0 ? 'neon-text-green' : (devPct >= -20 ? 'neon-text-amber' : 'neon-text-pink');
                const devSign = devPct > 0 ? '+' : '';
                const deviationFormatted = devSign + devPct.toFixed(1) + '%';
                
                const targetObj = taxMode === 'HT' ? r.obj_ht : r.obj_ttc;
                const targetReal = taxMode === 'HT' ? (r.realised_ttc / 1.2) : r.realised_ttc;

                const objVal = r.obj_ttc > 0 ? formatCurrency(targetObj) + ' DH' : 'N/A';
                const realVal = r.obj_ttc > 0 ? formatCurrency(targetReal) + ' DH' : 'N/A';
                
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
            tableTitle.innerHTML = `<i class="fa-solid fa-list-ol"></i> CLASSEMENT REPRÉSENTANTS ${focusNames.TOMATE_FRITO || "TOMATE FRITO"} (VMM)`;
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
            
            // Add custom interactivity for CDZ table click filtering
            tr.style.cursor = 'pointer';
            const isActive = selectedCdzFilter && c.cdz.trim().toUpperCase() === selectedCdzFilter.trim().toUpperCase();
            if (isActive) {
                const accentColor = currentFocusType === 'GLACE' ? 'rgba(0, 212, 255, 0.18)' : 'rgba(255, 45, 85, 0.18)';
                const borderNeon = currentFocusType === 'GLACE' ? 'var(--neon-blue)' : 'var(--neon-pink)';
                tr.style.background = accentColor;
                tr.style.borderLeft = `3px solid ${borderNeon}`;
                tr.style.boxShadow = `inset 0 0 10px ${accentColor}`;
            }
            
            tr.addEventListener('click', function () {
                const cdzName = c.cdz.trim().toUpperCase();
                if (selectedCdzFilter === cdzName) {
                    selectedCdzFilter = ''; // Deselect
                } else {
                    selectedCdzFilter = cdzName; // Select
                    selectedVendeurFilter = ''; // Reset seller dropdown
                    const vf = document.getElementById('focus-vendeur-filter');
                    if (vf) vf.value = '';
                    
                    // Show comparison card if it was hidden by vendor selection
                    const comparisonCard = document.getElementById('focus-comparison-card');
                    if (comparisonCard) {
                        comparisonCard.style.display = 'block';
                    }
                }
                renderFocusView();
            });
            
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
                const { ctx, data, chartArea, scales: { x } } = chart;
                ctx.save();
                
                // Draw vertical target/prorata line if workdays info is available
                if (focusWorkdays && focusWorkdays.total > 0 && chartArea) {
                    const total = focusWorkdays.total;
                    const rest = focusWorkdays.rest !== undefined ? focusWorkdays.rest : 20;
                    const elapsed = total - rest;
                    const prorataDeviation = (elapsed / total - 1.0) * 100;
                    
                    const xPx = x.getPixelForValue(prorataDeviation);
                    
                    if (xPx >= chartArea.left && xPx <= chartArea.right) {
                        ctx.beginPath();
                        ctx.setLineDash([5, 5]);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#f0a030'; // neonAmber
                        ctx.moveTo(xPx, chartArea.top);
                        ctx.lineTo(xPx, chartArea.bottom);
                        ctx.stroke();
                        
                        // Text label for vertical prorata line
                        ctx.font = 'bold 9px JetBrains Mono';
                        ctx.fillStyle = '#f0a030';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(`CIBLE PARTIELLE (${prorataDeviation.toFixed(1)}%)`, xPx, chartArea.top - 4);
                    }
                }
                
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

        const chartTitle = currentFocusType === 'GLACE' ? `ÉCARTS ${focusNames.GLACE || "GLACE"} (SOM) PAR VENDEUR (%)` : `ÉCARTS ${focusNames.TOMATE_FRITO || "TOMATE FRITO"} (VMM) PAR VENDEUR (%)`;
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
        const neonAmber = (styles.getPropertyValue('--neon-amber').trim() || '#f0a030').substring(0, 7);
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
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
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

        // Add CDZ (Chakib Elfil and Boutmezguine Mostafa) datasets to trend line chart
        const cdzs = history.cdz || [];
        
        const chakibDeviations = dates.map(d => {
            const record = cdzs.find(c => c.upload_date.startsWith(d) && (c.cdz || '').trim().toUpperCase().includes('CHAKIB'));
            return record ? Math.round(record.deviation * 100) : null;
        });

        const boutmezguineDeviations = dates.map(d => {
            const record = cdzs.find(c => c.upload_date.startsWith(d) && (c.cdz || '').trim().toUpperCase().includes('BOUTMEZGUINE'));
            return record ? Math.round(record.deviation * 100) : null;
        });

        const chakibColor = neonGreen;
        const boutmezguineColor = currentFocusType === 'GLACE' ? neonPink : neonBlue;

        datasets.push({
            label: 'Chakib Elfil (%)',
            data: chakibDeviations,
            borderColor: chakibColor,
            backgroundColor: chakibColor + '10',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: chakibColor,
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            fill: false,
            tension: 0.15
        });

        datasets.push({
            label: 'Boutmezguine Mostafa (%)',
            data: boutmezguineDeviations,
            borderColor: boutmezguineColor,
            backgroundColor: boutmezguineColor + '10',
            borderWidth: 2,
            pointRadius: 4,
            pointBackgroundColor: boutmezguineColor,
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            fill: false,
            tension: 0.15
        });

        // 3. Add Cible Partielle (Objectif Partiel) dataset to trend line chart
        const prorataDeviations = dates.map(d => {
            const rest = focusSettings ? focusSettings[d] : null;
            if (rest === null || rest === undefined) return null;
            const elapsed = focusTotalDays - rest;
            const prorataVal = (elapsed / focusTotalDays - 1.0) * 100;
            return Math.round(prorataVal);
        });

        datasets.push({
            label: 'Cible Partielle (%)',
            data: prorataDeviations,
            borderColor: neonAmber,
            borderWidth: 2,
            borderDash: [6, 4],
            pointRadius: 4,
            pointBackgroundColor: neonAmber,
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            fill: false,
            tension: 0.1
        });

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
