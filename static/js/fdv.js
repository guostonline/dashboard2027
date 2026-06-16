/* ------------------------------------------------------------------
 *  FDV (Force De Vente) — sales-force roster tab
 *  - Loads /api/fdv and renders a filterable table
 *  - Add / Edit / Delete vendeur through a modal
 *  - Per-row "WhatsApp" button that builds a wa.me link with the
 *    latest AI rapport for that vendeur.
 *  - Bulk "WHATSAPP TOUS" opens a sequence of wa.me tabs (one per
 *    active vendeur) and then refreshes the Agent Monitor.
 * ------------------------------------------------------------------ */

(function () {
    'use strict';

    const state = {
        rows: [],
        filters: { etats: [], roles: [], typeRoles: [], secteurs: [], cdzs: [], etatOptions: [], activiteOptions: [], typeRoleOptions: [] },
        search: '',
        etat: '',
        role: '',
        typeRole: '',
        secteur: '',
        cdz: '',
        busy: false,
    };

    const $ = (id) => document.getElementById(id);
    const els = {};

    function cacheEls() {
        els.search = $('fdv-search');
        els.filterEtat = $('fdv-filter-etat');
        els.filterRole = $('fdv-filter-role');
        els.filterTypeRole = $('fdv-filter-type-role');
        els.filterSecteur = $('fdv-filter-secteur');
        els.filterCdz = $('fdv-filter-cdz');
        els.addBtn = $('fdv-add');
        els.bulkBtn = $('fdv-bulk-whatsapp');
        els.resetBtn = $('fdv-reset');
        els.backBtn = $('fdv-back');
        els.tbody = $('fdv-tbody');
        els.badge = $('fdv-table-badge');
        els.empty = $('fdv-empty');
        els.loading = $('fdv-loading');
        els.total = $('fdv-total');
        els.totalSub = $('fdv-total-sub');
        els.actifs = $('fdv-actifs');
        els.inactifs = $('fdv-inactifs');
        els.secteurs = $('fdv-secteurs');

        els.modal = $('fdv-modal');
        els.modalTitle = $('fdv-modal-title');
        els.modalClose = $('fdv-modal-close');
        els.modalCancel = $('fdv-modal-cancel');
        els.form = $('fdv-form');
        els.fldId = $('fdv-id');
        els.fldVendeur = $('fdv-vendeur');
        els.fldRole = $('fdv-role');
        els.fldTypeRole = $('fdv-type-role');
        els.fldEtat = $('fdv-etat');
        els.fldSecteur = $('fdv-secteur');
        els.fldRecrutement = $('fdv-recrutement');
        els.fldCdz = $('fdv-cdz');
        els.fldTelephone = $('fdv-telephone');
        els.fldWhatsapp = $('fdv-whatsapp');
        els.fldNotes = $('fdv-notes');
    }

    /* -------- API helpers -------- */
    async function api(path, options = {}) {
        const res = await fetch(path, {
            headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
            ...options,
        });
        if (!res.ok) {
            let detail = '';
            try { detail = (await res.json()).message || ''; } catch (e) {}
            throw new Error(detail || ('HTTP ' + res.status));
        }
        return res.json();
    }

    function showLoading(v) {
        if (els.loading) els.loading.style.display = v ? 'block' : 'none';
    }

    function toast(message, kind = 'info') {
        if (typeof window.showToast === 'function') {
            window.showToast(message, kind);
            return;
        }
        // Lightweight fallback
        const wrap = document.createElement('div');
        wrap.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#151823;color:#f4f5fa;padding:10px 16px;border:1px solid #232838;border-radius:8px;z-index:9999;font-family:Inter,sans-serif;font-size:13px;box-shadow:0 10px 30px rgba(0,0,0,.5);';
        wrap.textContent = message;
        document.body.appendChild(wrap);
        setTimeout(() => wrap.remove(), 2800);
    }

    /* -------- Data -------- */
    async function loadFilters() {
        try {
            const r = await api('/api/fdv/filters');
            const f = r.filters || {};
            state.filters.etats = f.activites || [];
            state.filters.roles = f.roles || [];
            state.filters.typeRoles = f.type_roles || [];
            state.filters.secteurs = f.secteurs || [];
            state.filters.cdzs = f.cdzs || [];
            state.filters.etatOptions = r.etat_options || [];
            state.filters.activiteOptions = r.activite_options || [];
            state.filters.typeRoleOptions = r.type_role_options || [];

            // Populate the filter selects
            populateSelect(els.filterEtat, ['', ...state.filters.etats],
                (v) => v === '' ? 'Tous les états' : prettyEtat(v));
            populateSelect(els.filterRole, ['', ...state.filters.roles],
                (v) => v === '' ? 'Toutes les activités' : v);
            populateSelect(els.filterTypeRole, ['', ...state.filters.typeRoles],
                (v) => v === '' ? 'Tous les rôles' : prettyTypeRole(v));
            populateSelect(els.filterSecteur, ['', ...state.filters.secteurs],
                (v) => v === '' ? 'Tous les secteurs' : v);
            populateSelect(els.filterCdz, ['', ...state.filters.cdzs],
                (v) => v === '' ? 'Tous les CDZ' : v);

            // Populate the modal selects
            const activiteValues = state.filters.activiteOptions.length
                ? state.filters.activiteOptions.map((o) => o.value)
                : ['SOM', 'VMM', 'SOM VMM'];
            const typeRoleValues = state.filters.typeRoleOptions.length
                ? state.filters.typeRoleOptions.map((o) => o.value)
                : ['PREV', 'CNV'];
            populateSelect(els.fldRole, activiteValues, (v) => prettyActivite(v));
            populateSelect(els.fldTypeRole, typeRoleValues, (v) => prettyTypeRole(v));
            populateSelect(els.fldEtat, state.filters.etatOptions.length
                ? state.filters.etatOptions.map((o) => o.value) : ['ACTIF', 'CONGE', 'REMPLACER', 'MALADE', 'SUSPENDU'],
                (v) => prettyEtat(v));
            // Default the etat to ACTIF when adding
            els.fldEtat.value = 'ACTIF';
        } catch (e) {
            console.error('loadFilters', e);
        }
    }

    function populateSelect(sel, values, label) {
        if (!sel) return;
        sel.innerHTML = values
            .map((v) => `<option value="${escapeAttr(v)}">${escapeHtml(label(v))}</option>`)
            .join('');
    }

    async function loadList() {
        showLoading(true);
        try {
            const params = new URLSearchParams();
            if (state.search) params.set('search', state.search);
            if (state.etat) params.set('activite', state.etat);
            if (state.role) params.set('role', state.role);
            if (state.typeRole) params.set('type_role', state.typeRole);
            if (state.secteur) params.set('secteur', state.secteur);
            if (state.cdz) params.set('cdz', state.cdz);
            params.set('sort_by', 'vendeur');
            params.set('sort_dir', 'ASC');
            const r = await api('/api/fdv?' + params.toString());
            state.rows = r.rows || [];
            render();
        } catch (e) {
            console.error('loadList', e);
            toast('Erreur de chargement: ' + e.message, 'error');
        } finally {
            showLoading(false);
        }
    }

    async function loadStats() {
        try {
            const r = await api('/api/fdv/stats');
            const s = r.stats || {};
            els.total.textContent = s.total || 0;
            els.totalSub.textContent = `${s.total || 0} vendeur${(s.total || 0) > 1 ? 's' : ''} enregistré${(s.total || 0) > 1 ? 's' : ''}`;
            els.actifs.textContent = s.actifs || 0;
            els.inactifs.textContent = s.inactifs || 0;
            els.secteurs.textContent = (s.by_secteur || []).filter((x) => x.secteur).length;
        } catch (e) {
            console.error('loadStats', e);
        }
    }

    /* -------- Rendering -------- */
    function render() {
        if (!state.rows.length) {
            els.tbody.innerHTML = '';
            els.empty.style.display = 'block';
            els.badge.textContent = '0 vendeur';
            return;
        }
        els.empty.style.display = 'none';
        els.badge.textContent = `${state.rows.length} vendeur${state.rows.length > 1 ? 's' : ''}`;

        els.tbody.innerHTML = state.rows.map((r) => {
            const code = r.code || '';
            const nom = r.name || r.vendeur;
            const [actCls, actLabel] = activiteBadge(r.role);
            const [typeCls, typeLabel] = typeRoleBadge(r.type_role);
            const secteur = r.secteur || '—';
            const phone = r.whatsapp || r.telephone || '';
            const etat = (r.etat || r.activite || 'ACTIF').toUpperCase();
            const etatClass = etatClassFor(etat);
            const etatLabel = prettyEtat(etat);
            return `
                <tr data-id="${r.id}">
                    <td><span class="font-mono" style="color:var(--neon-blue);">${escapeHtml(code || '—')}</span></td>
                    <td>
                        <div style="font-weight:600;color:var(--text-main);">${escapeHtml(nom)}</div>
                        ${r.recrutement ? `<div style="color:var(--text-muted);font-size:.72rem;">Recruté le ${escapeHtml(r.recrutement)}</div>` : ''}
                    </td>
                    <td>${actCls ? `<span class="badge ${actCls}">${actLabel}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                    <td>${typeCls ? `<span class="badge ${typeCls}">${typeLabel}</span>` : '<span style="color:var(--text-muted);">—</span>'}</td>
                    <td>${escapeHtml(secteur || '—')}</td>
                    <td><span style="color:var(--text-main); font-weight: 500;">${escapeHtml(r.cdz || '—')}</span></td>
                    <td>
                        ${phone ? `<a href="${buildWaLink(phone, '')}" target="_blank" rel="noopener" class="font-mono" style="color:var(--neon-green);text-decoration:none;">${escapeHtml(phone)}</a>` : '<span style="color:var(--text-muted);">—</span>'}
                    </td>
                    <td><span class="badge ${etatClass}">${etatLabel.toUpperCase()}</span></td>
                    <td>
                        <div style="display:flex; gap:.3rem; flex-wrap:nowrap; justify-content:flex-end;">
                            <button class="cyber-btn-mini fdv-wa" data-id="${r.id}" title="Envoyer le rapport IA sur WhatsApp" style="border-color: var(--neon-green); color: var(--neon-green);">
                                <i class="fa-brands fa-whatsapp"></i>
                            </button>
                            <button class="cyber-btn-mini fdv-edit" data-id="${r.id}" title="Modifier">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="cyber-btn-mini fdv-delete" data-id="${r.id}" title="Supprimer" style="border-color: var(--neon-pink); color: var(--neon-pink);">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function buildWaLink(phone, message) {
        const raw = (phone || '').trim();
        if (!raw) return '#';
        const keepPlus = raw.startsWith('+');
        let digits = raw.replace(/\D/g, '');
        if (!digits) return '#';
        if (!keepPlus) {
            if (digits.startsWith('0')) digits = digits.slice(1);
            digits = '212' + digits;  // default Morocco
        }
        const url = 'https://wa.me/' + digits;
        return message ? url + '?text=' + encodeURIComponent(message) : url;
    }

    function etatClassFor(etat) {
        const e = (etat || '').toUpperCase();
        if (e === 'ACTIF') return 'badge-green';
        if (e === 'CONGE' || e === 'MALADE') return 'badge-amber';
        if (e === 'REMPLACER') return 'badge-blue';
        if (e === 'SUSPENDU') return 'badge-pink';
        return 'badge-amber';
    }

    function prettyEtat(etat) {
        const e = (etat || '').toUpperCase();
        if (e === 'ACTIF') return 'Active';
        if (e === 'CONGE') return 'Congé';
        if (e === 'REMPLACER') return 'Remplacer';
        if (e === 'MALADE') return 'Maladé';
        if (e === 'SUSPENDU') return 'Suspendu';
        return e || '—';
    }

    function prettyActivite(a) {
        const v = (a || '').toUpperCase();
        if (v === 'SOM') return 'SOM';
        if (v === 'VMM') return 'VMM';
        if (v === 'SOM VMM' || v === 'SOM+VMM') return 'SOM + VMM';
        return v || '—';
    }

    function prettyTypeRole(t) {
        const v = (t || '').toUpperCase();
        if (v === 'PREV') return 'PREV (Pré-vendeur)';
        if (v === 'CNV') return 'CNV (Conventionnel)';
        if (v === 'CDZ') return 'CDZ (Chef de Zone)';
        return v || '—';
    }

    function activiteBadge(act) {
        const v = (act || '').toUpperCase();
        if (v === 'SOM') return ['badge-blue', 'SOM'];
        if (v === 'VMM') return ['badge-pink', 'VMM'];
        if (v === 'SOM VMM' || v === 'SOM+VMM') return ['badge-blue', 'SOM + VMM'];
        return ['', '—'];
    }

    function typeRoleBadge(t) {
        const v = (t || '').toUpperCase();
        if (v === 'PREV') return ['badge-blue', 'PREV'];
        if (v === 'CNV') return ['badge-amber', 'CNV'];
        if (v === 'CDZ') return ['badge-cyan', 'CDZ'];
        return ['', '—'];
    }

    /* -------- Modal -------- */
    function openModal(row) {
        if (row) {
            els.modalTitle.innerHTML = '<i class="fa-solid fa-user-pen"></i> MODIFIER LE VENDEUR';
            els.fldId.value = row.id;
            els.fldVendeur.value = row.vendeur || '';
            els.fldVendeur.disabled = false;  // Allow editing seller name/code
            els.fldRole.value = row.role || '';
            els.fldTypeRole.value = row.type_role || '';
            els.fldEtat.value = (row.activite || row.etat || 'ACTIF').toUpperCase();
            els.fldSecteur.value = row.secteur || '';
            els.fldRecrutement.value = row.recrutement || '';
            els.fldCdz.value = row.cdz || '';
            els.fldTelephone.value = row.telephone || '';
            els.fldWhatsapp.value = row.whatsapp || '';
            els.fldNotes.value = row.notes || '';
        } else {
            els.modalTitle.innerHTML = '<i class="fa-solid fa-user-plus"></i> AJOUTER UN VENDEUR';
            els.fldId.value = '';
            els.fldVendeur.value = '';
            els.fldVendeur.disabled = false;
            els.fldRole.value = '';
            els.fldTypeRole.value = '';
            els.fldEtat.value = 'ACTIF';
            els.fldSecteur.value = '';
            els.fldRecrutement.value = '';
            els.fldCdz.value = '';
            els.fldTelephone.value = '';
            els.fldWhatsapp.value = '';
            els.fldNotes.value = '';
        }
        els.modal.classList.add('open');
        els.modal.style.display = 'flex';
        setTimeout(() => els.fldVendeur.focus(), 50);
    }

    function closeModal() {
        els.modal.classList.remove('open');
        els.modal.style.display = 'none';
    }

    async function submitForm(e) {
        e.preventDefault();
        if (state.busy) return;
        const data = {
            vendeur: els.fldVendeur.value.trim(),
            role: els.fldRole.value,
            type_role: els.fldTypeRole.value,
            activite: els.fldEtat.value,
            secteur: els.fldSecteur.value.trim(),
            recrutement: els.fldRecrutement.value,
            cdz: els.fldCdz.value,
            telephone: els.fldTelephone.value.trim(),
            whatsapp: els.fldWhatsapp.value.trim() || els.fldTelephone.value.trim(),
            notes: els.fldNotes.value.trim(),
        };
        if (!data.vendeur) {
            toast('Le nom du vendeur est obligatoire.', 'error');
            return;
        }
        state.busy = true;
        try {
            const id = els.fldId.value;
            let r;
            if (id) {
                r = await api('/api/fdv/' + id, { method: 'PUT', body: JSON.stringify(data) });
                toast('Vendeur mis à jour.', 'success');
            } else {
                r = await api('/api/fdv', { method: 'POST', body: JSON.stringify(data) });
                toast('Vendeur ajouté.', 'success');
            }
            closeModal();
            await Promise.all([loadList(), loadStats(), loadFilters()]);
        } catch (e) {
            toast('Erreur: ' + e.message, 'error');
        } finally {
            state.busy = false;
        }
    }

    async function deleteRow(id) {
        const row = state.rows.find((r) => r.id === id);
        if (!row) return;
        if (!confirm(`Supprimer "${row.vendeur}" de la FDV ? Cette action est irréversible.`)) return;
        try {
            await api('/api/fdv/' + id, { method: 'DELETE' });
            toast('Vendeur supprimé.', 'success');
            await Promise.all([loadList(), loadStats(), loadFilters()]);
        } catch (e) {
            toast('Erreur: ' + e.message, 'error');
        }
    }

    /* -------- WhatsApp -------- */
    async function sendRapport(id) {
        if (state.busy) return;
        state.busy = true;
        const btn = els.tbody.querySelector('button.fdv-wa[data-id="' + id + '"]');
        if (btn) {
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled = true;
        }
        try {
            const r = await api('/api/fdv/whatsapp_link', {
                method: 'POST',
                body: JSON.stringify({ id: id, include_rapport: true }),
            });
            if (r.url) {
                window.open(r.url, '_blank', 'noopener');
                toast(r.rapport_used
                    ? `Rapport IA envoyé à ${r.vendeur}`
                    : `Lien WhatsApp ouvert pour ${r.vendeur}`, 'success');
            } else {
                toast('Numéro WhatsApp manquant pour ' + r.vendeur, 'error');
            }
        } catch (e) {
            toast('Erreur: ' + e.message, 'error');
        } finally {
            state.busy = false;
            if (btn) {
                btn.innerHTML = '<i class="fa-brands fa-whatsapp"></i>';
                btn.disabled = false;
            }
        }
    }

    async function sendAllActifs() {
        if (state.busy) return;
        const actifs = state.rows.filter((r) => (r.etat || r.activite || 'ACTIF').toUpperCase() === 'ACTIF');
        const withPhone = actifs.filter((r) => r.whatsapp || r.telephone);
        if (!withPhone.length) {
            toast('Aucun vendeur actif avec un numéro WhatsApp.', 'error');
            return;
        }
        if (!confirm(`Envoyer le rapport IA à ${withPhone.length} vendeur(s) actif(s) ?\n\n(Un onglet WhatsApp s'ouvrira pour chacun.)`)) {
            return;
        }
        state.busy = true;
        els.bulkBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>EN COURS...</span>';
        els.bulkBtn.disabled = true;
        let ok = 0, fail = 0;
        for (let i = 0; i < withPhone.length; i++) {
            const v = withPhone[i];
            try {
                const r = await api('/api/fdv/whatsapp_link', {
                    method: 'POST',
                    body: JSON.stringify({ id: v.id, include_rapport: true }),
                });
                if (r.url) {
                    window.open(r.url, '_blank', 'noopener');
                    ok++;
                } else fail++;
            } catch (e) {
                fail++;
            }
            // Small delay so the browser doesn't block popups.
            await new Promise((res) => setTimeout(res, 350));
        }
        state.busy = false;
        els.bulkBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i><span>WHATSAPP TOUS</span>';
        els.bulkBtn.disabled = false;
        toast(`Terminé : ${ok} envoyé(s), ${fail} échec(s).`, ok ? 'success' : 'error');

        // Refresh the agent monitor after the bulk send.
        await refreshAgentMonitor();
    }

    async function refreshAgentMonitor() {
        try {
            // Ping the agent monitor to make sure it's reachable, then
            // open / reload it in a new tab. If the user has it open
            // they get a refresh; otherwise it opens the page.
            const probe = await fetch('/agent-monitor', { method: 'HEAD' });
            if (probe.ok) {
                // Open in a new tab — most browsers will reuse an
                // existing tab if it shares the same URL.
                window.open('/agent-monitor', 'agent-monitor', 'noopener');
                toast('Agent Monitor rafraîchi.', 'success');
            } else {
                toast("La page Agent Monitor n'est pas accessible.", 'error');
            }
        } catch (e) {
            toast('Erreur de rafraîchissement: ' + e.message, 'error');
        }
    }

    /* -------- Helpers -------- */
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }
    function escapeAttr(s) {
        return escapeHtml(s);
    }

    /* -------- Wire up -------- */
    function wireEvents() {
        // Debounced search
        let t = null;
        els.search.addEventListener('input', () => {
            clearTimeout(t);
            t = setTimeout(() => {
                state.search = els.search.value.trim();
                loadList();
            }, 250);
        });

        els.filterEtat.addEventListener('change', () => { state.etat = els.filterEtat.value; loadList(); });
        els.filterRole.addEventListener('change', () => { state.role = els.filterRole.value; loadList(); });
        if (els.filterTypeRole) {
            els.filterTypeRole.addEventListener('change', () => { state.typeRole = els.filterTypeRole.value; loadList(); });
        }
        els.filterSecteur.addEventListener('change', () => { state.secteur = els.filterSecteur.value; loadList(); });
        if (els.filterCdz) {
            els.filterCdz.addEventListener('change', () => { state.cdz = els.filterCdz.value; loadList(); });
        }

        els.addBtn.addEventListener('click', () => openModal(null));
        els.bulkBtn.addEventListener('click', sendAllActifs);
        els.resetBtn.addEventListener('click', () => {
            els.search.value = '';
            els.filterEtat.value = '';
            els.filterRole.value = '';
            if (els.filterTypeRole) els.filterTypeRole.value = '';
            els.filterSecteur.value = '';
            if (els.filterCdz) els.filterCdz.value = '';
            state.search = '';
            state.etat = '';
            state.role = '';
            state.typeRole = '';
            state.secteur = '';
            state.cdz = '';
            loadList();
        });
        els.backBtn.addEventListener('click', () => { window.location.href = '/dashboard'; });

        els.modalClose.addEventListener('click', closeModal);
        els.modalCancel.addEventListener('click', closeModal);
        els.modal.addEventListener('click', (e) => { if (e.target === els.modal) closeModal(); });
        els.form.addEventListener('submit', submitForm);

        // Delegate row buttons
        els.tbody.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.fdv-edit');
            const delBtn = e.target.closest('.fdv-delete');
            const waBtn = e.target.closest('.fdv-wa');
            if (editBtn) {
                const id = parseInt(editBtn.dataset.id, 10);
                const row = state.rows.find((r) => r.id === id);
                if (row) openModal(row);
            } else if (delBtn) {
                deleteRow(parseInt(delBtn.dataset.id, 10));
            } else if (waBtn) {
                sendRapport(parseInt(waBtn.dataset.id, 10));
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && els.modal.classList.contains('open')) closeModal();
        });
    }

    /* -------- Init -------- */
    async function init() {
        cacheEls();
        if (!els.tbody) return;  // we're not on the FDV page
        await loadFilters();
        await Promise.all([loadList(), loadStats()]);
        wireEvents();

        // Auto-load on the /fdv route
        if (window.location.pathname === '/fdv') {
            // already loaded above
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
