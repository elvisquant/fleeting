// static/js/reparation.js
(function() {
    'use strict';
    
    /**
     * ==============================================================================
     * FLEETDASH REPARATION MODULE (Multi-Language)
     * Handles reparation tracking, garage assignments, and cost verification.
     * ==============================================================================
     */

    // =================================================================
    // ELEMENT GETTER
    // =================================================================
    function getEl(id) {
        if (window.innerWidth < 768) {
            const mobileEl = document.querySelector('#app-content-mobile #' + id);
            if (mobileEl) return mobileEl;
        }
        const desktopEl = document.querySelector('#app-content #' + id);
        if (desktopEl) return desktopEl;
        return document.getElementById(id);
    }

    // =================================================================
    // GLOBAL STATE
    // =================================================================
    let allRepLogs = [];
    let repOptions = { pannes: [], garages: [] };
    let currentUserRole = 'user';
    let repActionType = null;
    let repActionId = null;
    let selectedRepIds = new Set();

    // =================================================================
    // 1. INITIALIZATION
    // =================================================================
    function initReparation() {
        console.log("Reparation Module: Initializing...");
        
        if (typeof window.fetchWithAuth !== 'function' || typeof window.t !== 'function') {
            console.error('Required globals not available');
            return;
        }

        currentUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
        attachEventListeners();
        loadInitialData();
        
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function attachEventListeners() {
        // Table filters
        const search = getEl('repSearch');
        const garageFilter = getEl('repGarageFilter');
        const statusFilter = getEl('repStatusFilter');
        const selectAll = getEl('selectAllRep');
        
        if (search) search.addEventListener('input', renderTable);
        if (garageFilter) garageFilter.addEventListener('change', renderTable);
        if (statusFilter) statusFilter.addEventListener('change', renderTable);
        if (selectAll) selectAll.addEventListener('change', toggleSelectAll);

        // Action buttons
        const addBtn = getEl('btnAddReparation');
        const saveBtn = getEl('btnSaveRep');
        const bulkBtn = getEl('btnRepBulkVerify');
        const confirmBtn = getEl('btnRepConfirmAction');
        
        if (addBtn) addBtn.addEventListener('click', openAddModal);
        if (saveBtn) saveBtn.addEventListener('click', saveReparation);
        if (bulkBtn) bulkBtn.addEventListener('click', executeBulkVerify);
        if (confirmBtn) confirmBtn.addEventListener('click', executeConfirmAction);

        // Modal close buttons
        document.addEventListener('click', function(e) {
            if (e.target.closest('[data-close-modal]')) {
                const modalId = e.target.closest('[data-close-modal]').getAttribute('data-close-modal');
                closeModal(modalId);
            }
        });
    }

    // =================================================================
    // 2. DATA LOADING
    // =================================================================
    async function loadInitialData() {
        await Promise.all([loadData(), fetchDropdowns()]);
    }

    async function loadData() {
        const tbody = getEl('repLogsBody');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500">
            <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
            ${window.t('msg_loading')}
        </td></tr>`;

        try {
            const data = await window.fetchWithAuth('/reparation/'); 
            const items = data.items || data;
            
            if (Array.isArray(items)) {
                allRepLogs = items;
                selectedRepIds.clear(); 
                updateBulkUI();
                renderTable();
            } else {
                const msg = data && data.detail ? data.detail : window.t('title_error');
                tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
                    ${window.t('title_error')}: ${msg}
                </td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
                ${window.t('msg_connection_fail')}
            </td></tr>`;
        }
    }

    async function fetchDropdowns() {
        try {
            const [pannes, garages] = await Promise.all([
                window.fetchWithAuth('/panne/'), 
                window.fetchWithAuth('/garage/') 
            ]);

            repOptions.pannes = Array.isArray(pannes) ? pannes : (pannes.items || []);
            repOptions.garages = Array.isArray(garages) ? garages : (garages.items || []);
            
            populateSelect('repGarageFilter', repOptions.garages, '', 'nom_garage', window.t('col_garage') || 'All Garages');
            populatePanneSelect('repPanneSelect', repOptions.pannes);
            populateSelect('repGarageSelect', repOptions.garages, '', 'nom_garage', window.t('select_vehicle') || 'Select Garage');

        } catch (e) { 
            console.warn("Rep Dropdown Error:", e); 
        }
    }

    // =================================================================
    // 3. TABLE RENDERING
    // =================================================================
    function renderTable() {
        const tbody = getEl('repLogsBody');
        if (!tbody) return;

        const search = getEl('repSearch');
        const garageFilter = getEl('repGarageFilter');
        const statusFilter = getEl('repStatusFilter');
        
        const searchValue = search ? search.value.toLowerCase() : '';
        const gFilter = garageFilter ? garageFilter.value : '';
        const sFilter = statusFilter ? statusFilter.value : '';

        let filtered = allRepLogs.filter(log => {
            const garage = repOptions.garages.find(g => g.id === log.garage_id);
            const gName = garage ? garage.nom_garage.toLowerCase() : "";
            const receipt = log.receipt ? log.receipt.toLowerCase() : "";
            
            const matchesSearch = gName.includes(searchValue) || receipt.includes(searchValue);
            const matchesGarage = gFilter === "" || log.garage_id == gFilter;
            
            let matchesStatus = true;
            if (sFilter === 'verified') matchesStatus = log.is_verified === true;
            if (sFilter === 'pending') matchesStatus = log.is_verified !== true;

            return matchesSearch && matchesGarage && matchesStatus;
        });

        const repCountEl = getEl('repCount');
        if (repCountEl) repCountEl.innerText = `${filtered.length} ${window.t('reparations')}`;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">
                ${window.t('msg_no_records')}
            </td></tr>`;
            return;
        }

        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);

        tbody.innerHTML = filtered.map(log => {
            const garage = repOptions.garages.find(g => g.id === log.garage_id);
            const panne = repOptions.pannes.find(p => p.id === log.panne_id);
            
            const date = log.repair_date ? new Date(log.repair_date).toLocaleDateString(window.APP_LOCALE) : 'N/A';

            const verifyBadge = log.is_verified 
                ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                    ${window.t('btn_verify')}
                   </span>`
                : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                    ${window.t('status_pending')}
                   </span>`;

            const progressText = log.status === 'Completed' ? window.t('status_completed') : window.t('status_in_progress');
            const progressBadge = log.status === 'Completed'
                ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    ${progressText}
                   </span>`
                : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">
                    ${progressText}
                   </span>`;

            const isLocked = log.is_verified && log.status === 'Completed';

            let checkboxHtml = '';
            if (canManage && !isLocked) {
                const isChecked = selectedRepIds.has(log.id) ? 'checked' : '';
                checkboxHtml = `<input type="checkbox" onchange="window.reparationModule.toggleRow(${log.id})" ${isChecked} 
                    class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
            } else {
                checkboxHtml = `<input type="checkbox" disabled 
                    class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
            }

            let actions = '';
            const viewBtn = `<button onclick="window.reparationModule.openViewModal(${log.id})" 
                class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" 
                title="${window.t('view')}"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

            if (isLocked) {
                actions = `<div class="flex items-center justify-end gap-2">${viewBtn}
                    <span class="text-slate-600 cursor-not-allowed" title="${window.t('msg_locked')}">
                        <i data-lucide="lock" class="w-4 h-4"></i>
                    </span></div>`;
            } else if (canManage) {
                actions = `<div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    ${!log.is_verified ? `<button onclick="window.reparationModule.requestVerify(${log.id})" 
                        class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" 
                        title="${window.t('btn_verify')}"><i data-lucide="check-circle" class="w-4 h-4"></i></button>` : ''}
                    <button onclick="window.reparationModule.openEditModal(${log.id})" 
                        class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" 
                        title="${window.t('edit')}"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="window.reparationModule.requestDelete(${log.id})" 
                        class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" 
                        title="${window.t('delete')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
            } else {
                actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
            }

            return `
                <tr class="hover:bg-white/5 border-b border-slate-700/30 ${isLocked ? 'opacity-70 bg-slate-800/30' : ''}">
                    <td class="p-4 text-center">${checkboxHtml}</td>
                    <td class="p-4">
                        <div class="text-white font-mono text-xs">#${log.panne_id}</div>
                        <div class="text-xs text-slate-500 truncate max-w-[150px]">
                            ${panne && panne.description ? panne.description.substring(0, 30) + (panne.description.length > 30 ? '...' : '') : 'Unknown'}
                        </div>
                    </td>
                    <td class="p-4 text-slate-300 text-sm">${garage ? garage.nom_garage : log.garage_id}</td>
                    <td class="p-4 text-right font-bold text-emerald-400">${log.cost ? log.cost.toFixed(2) : '0.00'}</td>
                    <td class="p-4">${progressBadge}</td>
                    <td class="p-4">${verifyBadge}</td>
                    <td class="p-4 text-right">${actions}</td>
                </tr>`;
        }).join('');
        
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 4. BULK OPERATIONS
    // =================================================================
    function toggleRow(id) {
        if (selectedRepIds.has(id)) selectedRepIds.delete(id);
        else selectedRepIds.add(id);
        updateBulkUI();
    }

    function toggleSelectAll() {
        const mainCheck = getEl('selectAllRep');
        if (!mainCheck) return;
        
        const isChecked = mainCheck.checked;
        selectedRepIds.clear();
        
        if (isChecked) {
            const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
            allRepLogs.forEach(log => {
                const isLocked = log.is_verified && log.status === 'Completed';
                if (canManage && !isLocked && !log.is_verified) selectedRepIds.add(log.id);
            });
        }
        renderTable();
        updateBulkUI();
    }

    function updateBulkUI() {
        const btn = getEl('btnRepBulkVerify');
        const countSpan = getEl('repSelectedCount');
        if (!btn) return;

        if (countSpan) countSpan.innerText = selectedRepIds.size;
        if (selectedRepIds.size > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }

    function executeBulkVerify() {
        if (selectedRepIds.size === 0) return;
        
        repActionType = 'bulk-verify';
        repActionId = null;
        
        showConfirmModal(
            window.t('btn_verify'), 
            `${window.t('msg_verify_confirm')}?`, 
            "check-circle", 
            "bg-emerald-600"
        );
    }

    // =================================================================
    // 5. SINGLE ACTIONS
    // =================================================================
    function requestVerify(id) {
        repActionType = 'verify'; 
        repActionId = id;
        showConfirmModal(window.t('btn_verify'), window.t('msg_verify_confirm'), "check-circle", "bg-green-600");
    }

    function requestDelete(id) {
        repActionType = 'delete'; 
        repActionId = id;
        showConfirmModal(window.t('delete'), window.t('msg_confirm_delete'), "trash-2", "bg-red-600");
    }

    async function executeConfirmAction() {
        const btn = getEl('btnRepConfirmAction');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('loading')}`;

        try {
            let result;
            if (repActionType === 'delete') {
                result = await window.fetchWithAuth(`/reparation/${repActionId}`, 'DELETE');
            } 
            else if (repActionType === 'verify') {
                const payload = { ids: [parseInt(repActionId)] };
                result = await window.fetchWithAuth(`/reparation/verify-bulk`, 'PUT', payload);
            }
            else if (repActionType === 'bulk-verify') {
                const idList = Array.from(selectedRepIds).map(id => parseInt(id));
                const payload = { ids: idList };
                result = await window.fetchWithAuth('/reparation/verify-bulk', 'PUT', payload);
            }

            closeModal('repConfirmModal');
            
            if (result !== null && result !== false) {
                if (repActionType === 'bulk-verify') selectedRepIds.clear();
                await loadData();
                showAlert(window.t('title_success'), window.t('msg_updated'), true);
            } else {
                showAlert(window.t('title_error'), window.t('msg_operation_failed'), false);
            }
        } catch(e) {
            closeModal('repConfirmModal');
            showAlert(window.t('title_error'), e.message || window.t('msg_operation_failed'), false);
        }
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        repActionId = null;
        repActionType = null;
        
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 6. MODAL OPERATIONS
    // =================================================================
    function openAddModal() {
        const editIdEl = getEl('repEditId');
        const modalTitle = getEl('repModalTitle');
        const saveBtn = getEl('btnSaveRep');
        
        if (editIdEl) editIdEl.value = "";
        if (modalTitle) modalTitle.innerText = window.t('btn_log_reparation');
        if (saveBtn) saveBtn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> ${window.t('btn_save')}`;
        
        populatePanneSelect('repPanneSelect', repOptions.pannes);
        populateSelect('repGarageSelect', repOptions.garages, '', 'nom_garage', window.t('select_vehicle') || 'Select');
        
        const costEl = getEl('repCost');
        const dateEl = getEl('repDate');
        const receiptEl = getEl('repReceipt');
        const statusEl = getEl('repProgressStatus');
        
        if (costEl) costEl.value = "";
        if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
        if (receiptEl) receiptEl.value = "";
        if (statusEl) statusEl.value = "Inprogress";

        const modal = getEl('addRepModal');
        if (modal) modal.classList.remove('hidden');
    }

    function openEditModal(id) {
        const log = allRepLogs.find(l => l.id === id);
        if (!log) return;

        const editIdEl = getEl('repEditId');
        const modalTitle = getEl('repModalTitle');
        const saveBtn = getEl('btnSaveRep');
        
        if (editIdEl) editIdEl.value = log.id;
        if (modalTitle) modalTitle.innerText = window.t('edit');
        if (saveBtn) saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> ${window.t('btn_update')}`;

        populatePanneSelect('repPanneSelect', repOptions.pannes, log.panne_id);
        populateSelect('repGarageSelect', repOptions.garages, log.garage_id, 'nom_garage', window.t('select_vehicle') || 'Select');
        
        const costEl = getEl('repCost');
        const dateEl = getEl('repDate');
        const receiptEl = getEl('repReceipt');
        const statusEl = getEl('repProgressStatus');
        
        if (costEl) costEl.value = log.cost || "";
        if (dateEl) dateEl.value = log.repair_date ? new Date(log.repair_date).toISOString().split('T')[0] : "";
        if (receiptEl) receiptEl.value = log.receipt || "";
        if (statusEl) statusEl.value = log.status || "Inprogress";

        const modal = getEl('addRepModal');
        if (modal) modal.classList.remove('hidden');
    }

    async function saveReparation() {
        const editIdEl = getEl('repEditId');
        const id = editIdEl ? editIdEl.value : '';
        
        const panneId = getEl('repPanneSelect');
        const garageId = getEl('repGarageSelect');
        const cost = getEl('repCost');
        const dateVal = getEl('repDate');
        const receipt = getEl('repReceipt');
        const statusVal = getEl('repProgressStatus');

        if (!panneId || !panneId.value) { 
            showAlert(window.t('validation'), window.t('msg_validation_fail'), false); 
            return; 
        }
        if (!garageId || !garageId.value) { 
            showAlert(window.t('validation'), window.t('msg_validation_fail'), false); 
            return; 
        }
        if (!cost || !cost.value || isNaN(cost.value) || parseFloat(cost.value) <= 0) { 
            showAlert(window.t('validation'), window.t('msg_validation_fail'), false); 
            return; 
        }
        if (!dateVal || !dateVal.value) { 
            showAlert(window.t('validation'), window.t('msg_validation_fail'), false); 
            return; 
        }
        if (!receipt || !receipt.value.trim()) { 
            showAlert(window.t('validation'), window.t('msg_validation_fail'), false); 
            return; 
        }

        const payload = {
            panne_id: parseInt(panneId.value),
            garage_id: parseInt(garageId.value),
            cost: parseFloat(cost.value),
            repair_date: new Date(dateVal.value).toISOString(),
            receipt: receipt.value.trim(),
            status: statusVal ? statusVal.value : "Inprogress"
        };

        const btn = getEl('btnSaveRep');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('msg_loading')}`;
        
        try {
            let result;
            if (id) {
                result = await window.fetchWithAuth(`/reparation/${id}`, 'PUT', payload);
            } else {
                result = await window.fetchWithAuth('/reparation/', 'POST', payload);
            }

            if (result && !result.detail) {
                closeModal('addRepModal');
                await loadData();
                showAlert(window.t('title_success'), window.t('msg_saved'), true);
            } else {
                const msg = result?.detail ? JSON.stringify(result.detail) : window.t('msg_operation_failed');
                showAlert(window.t('title_error'), msg, false);
            }
        } catch(e) { 
            showAlert(window.t('title_error'), e.message || window.t('msg_operation_failed'), false); 
        }
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
    }

    function openViewModal(id) {
        const log = allRepLogs.find(l => l.id === id);
        if (!log) return;
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const panne = repOptions.pannes.find(p => p.id === log.panne_id);

        const dateStr = log.repair_date ? new Date(log.repair_date).toLocaleDateString(window.APP_LOCALE) : 'N/A';

        const content = `
            <div class="grid grid-cols-2 gap-y-4">
                <div class="col-span-2">
                    <span class="text-slate-500 text-xs uppercase block">${window.t('lbl_related_panne')}</span>
                    <span class="text-white bg-slate-800 p-2 rounded block mt-1 text-sm">
                        ${panne && panne.description ? panne.description : 'ID '+log.panne_id}
                    </span>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block">${window.t('col_garage')}</span>
                    <span class="text-white">${garage ? garage.nom_garage : 'ID ' + log.garage_id}</span>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block">${window.t('col_status')}</span>
                    <span class="text-blue-400 font-bold capitalize">${log.status || 'Unknown'}</span>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block">${window.t('col_receipt')}</span>
                    <span class="text-white font-mono">${log.receipt || 'N/A'}</span>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block">${window.t('col_date')}</span>
                    <span class="text-white">${dateStr}</span>
                </div>
                <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                    <span class="text-slate-500 text-xs uppercase">${window.t('col_cost')}</span>
                    <span class="text-emerald-400 font-bold text-lg">BIF ${log.cost ? log.cost.toFixed(2) : '0.00'}</span>
                </div>
            </div>`;
        
        const viewContent = getEl('viewRepContent');
        if (viewContent) viewContent.innerHTML = content;
        
        const modal = getEl('viewRepModal');
        if (modal) modal.classList.remove('hidden');
        
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 7. HELPER FUNCTIONS
    // =================================================================
    function closeModal(modalId) {
        const modal = getEl(modalId);
        if (modal) modal.classList.add('hidden');
    }

    function showConfirmModal(title, message, icon, color) {
        const modal = getEl('repConfirmModal');
        if (!modal) return;
        
        const titleEl = getEl('repConfirmTitle');
        const messageEl = getEl('repConfirmMessage');
        
        if (titleEl) titleEl.innerText = title;
        if (messageEl) messageEl.innerText = message;
        
        const btn = getEl('btnRepConfirmAction');
        if (btn) {
            btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color} hover:opacity-90`;
        }
        
        const iconDiv = getEl('repConfirmIcon');
        if (iconDiv) {
            iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${color.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
            iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
        }

        modal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    }

    function showAlert(title, message, isSuccess) {
        const container = getEl('toast-container');
        if (!container) {
            console.log(`${title}: ${message}`);
            return;
        }

        const toast = document.createElement('div');
        toast.textContent = `${title}: ${message}`;
        toast.className = `px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-up ${
            isSuccess ? 'bg-green-500' : 'bg-red-500'
        }`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, isSuccess ? 3000 : 5000);
    }

    function populateSelect(elementId, items, selectedValue, labelKey, defaultText = 'Select...') {
        const el = getEl(elementId);
        if (!el) return;
        
        let options = `<option value="">${defaultText}</option>`;
        
        if (Array.isArray(items)) {
            options += items.map(item => {
                const value = item.id;
                const label = item[labelKey] || item.name || `ID ${value}`;
                const isSelected = value == selectedValue ? 'selected' : '';
                return `<option value="${value}" ${isSelected}>${label}</option>`;
            }).join('');
        }
        
        el.innerHTML = options;
    }

    function populatePanneSelect(elementId, list, selectedValue) {
        const el = getEl(elementId);
        if (!el) return;
        
        if (!list || list.length === 0) { 
            el.innerHTML = '<option disabled>No Active Pannes Found</option>'; 
            return; 
        }
        
        let options = `<option value="">Select Panne</option>`;
        options += list.map(item => {
            const desc = item.description ? 
                (item.description.length > 30 ? item.description.substring(0, 30) + '...' : item.description) : 
                'No description';
            const isSelected = item.id == selectedValue ? 'selected' : '';
            return `<option value="${item.id}" ${isSelected}>#${item.id}: ${desc}</option>`;
        }).join('');
        
        el.innerHTML = options;
    }

    // =================================================================
    // 8. MODULE EXPORT
    // =================================================================
    window.reparationModule = {
        init: initReparation,
        destroy: function() {
            console.log("Reparation module cleanup");
        },
        refresh: loadData,
        toggleRow: toggleRow,
        executeBulkVerify: executeBulkVerify,
        requestVerify: requestVerify,
        requestDelete: requestDelete,
        openViewModal: openViewModal,
        openEditModal: openEditModal,
        openAddModal: openAddModal,
        saveReparation: saveReparation,
        closeModal: closeModal
    };

    // Auto-initialize if needed
    if (document.readyState === 'complete' && window.location.hash === '#reparation') {
        setTimeout(initReparation, 100);
    }

    console.log('Reparation module loaded');
})();