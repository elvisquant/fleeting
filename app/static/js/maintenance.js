// static/js/maintenance.js
(function() {
    'use strict';
    
    /**
     * ==============================================================================
     * FLEETDASH MAINTENANCE MODULE
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
    let allMaintLogs = [];
    let maintOptions = { vehicles: [], cats: [], garages: [] };
    let currentUserRole = 'user';
    let maintActionType = null;
    let maintActionId = null;
    let selectedMaintIds = new Set();

    // =================================================================
    // 1. INITIALIZATION
    // =================================================================
    function initMaintenance() {
        console.log("Maintenance Module: Initializing...");
        
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
        const search = getEl('maintSearch');
        const vFilter = getEl('maintVehicleFilter');
        const sFilter = getEl('maintStatusFilter');
        const selectAll = getEl('selectAllMaint');
        
        if (search) search.addEventListener('input', renderTable);
        if (vFilter) vFilter.addEventListener('change', renderTable);
        if (sFilter) sFilter.addEventListener('change', renderTable);
        if (selectAll) selectAll.addEventListener('change', toggleSelectAll);

        // Action buttons
        const bulkBtn = getEl('btnMaintBulkVerify');
        const addBtn = getEl('btnAddMaintenance');
        const saveBtn = getEl('btnSaveMaint');
        const confirmBtn = getEl('btnMaintConfirmAction');
        
        if (bulkBtn) bulkBtn.addEventListener('click', executeBulkVerify);
        if (addBtn) addBtn.addEventListener('click', openAddModal);
        if (saveBtn) saveBtn.addEventListener('click', saveMaintenance);
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
        const tbody = getEl('maintLogsBody');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500">
            <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
            ${window.t('msg_loading')}
        </td></tr>`;

        try {
            const data = await window.fetchWithAuth('/maintenances/');
            const items = data.items || data;

            if (Array.isArray(items)) {
                allMaintLogs = items;
                selectedMaintIds.clear();
                updateBulkUI();
                renderTable();
            } else {
                showAlert(window.t('title_error'), data?.detail || 'Failed to load', false);
            }
        } catch(e) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">
                ${window.t('msg_connection_fail')}
            </td></tr>`;
        }
    }

    async function fetchDropdowns() {
        try {
            const [vehicles, cats, garages] = await Promise.all([
                window.fetchWithAuth('/vehicles/?limit=1000'),
                window.fetchWithAuth('/category_maintenance/'), 
                window.fetchWithAuth('/garage/') 
            ]);

            maintOptions.vehicles = Array.isArray(vehicles) ? vehicles : (vehicles.items || []);
            maintOptions.cats = Array.isArray(cats) ? cats : (cats.items || []);
            maintOptions.garages = Array.isArray(garages) ? garages : (garages.items || []);
            
            populateSelect('maintVehicleFilter', maintOptions.vehicles, '', 'plate_number', window.t('vehicles') || 'All Vehicles');
            populateSelect('maintVehicleSelect', maintOptions.vehicles, '', 'plate_number', window.t('lbl_select_vehicle'));
            populateSelect('maintCatSelect', maintOptions.cats, '', 'cat_maintenance', window.t('lbl_select_category'));
            populateSelect('maintGarageSelect', maintOptions.garages, '', 'nom_garage', window.t('select_garage') || 'Select Garage');

        } catch(e) { 
            console.warn("Dropdown Error", e); 
        }
    }

    // =================================================================
    // 3. TABLE RENDERING
    // =================================================================
    function renderTable() {
        const tbody = getEl('maintLogsBody');
        if (!tbody) return;

        const search = getEl('maintSearch');
        const vFilter = getEl('maintVehicleFilter');
        const sFilter = getEl('maintStatusFilter');
        
        const searchValue = search ? search.value.toLowerCase() : '';
        const vFilterValue = vFilter ? vFilter.value : '';
        const sFilterValue = sFilter ? sFilter.value : '';

        let filtered = allMaintLogs.filter(log => {
            const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
            const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
            const receipt = log.receipt ? log.receipt.toLowerCase() : "";
            
            const matchesSearch = plate.includes(searchValue) || receipt.includes(searchValue);
            const matchesVehicle = vFilterValue === "" || log.vehicle_id == vFilterValue;
            
            let matchesStatus = true;
            if (sFilterValue === 'verified') matchesStatus = log.is_verified === true;
            if (sFilterValue === 'pending') matchesStatus = log.is_verified !== true;

            return matchesSearch && matchesVehicle && matchesStatus;
        });

        const countEl = getEl('maintLogsCount');
        if (countEl) countEl.innerText = `${filtered.length} ${window.t('maintenance')}`;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">
                <i data-lucide="search" class="w-8 h-8 mx-auto mb-2 text-slate-500"></i>
                ${window.t('msg_no_records')}
            </td></tr>`;
            return;
        }

        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);

        tbody.innerHTML = filtered.map(log => {
            const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
            const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
            const garage = maintOptions.garages.find(g => g.id === log.garage_id);
            const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
            const catName = cat ? cat.cat_maintenance : '-';
            const garageName = garage ? garage.nom_garage : '-';
            
            const date = new Date(log.maintenance_date).toLocaleDateString(window.APP_LOCALE);

            const verifyBadge = log.is_verified 
                ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">${window.t('status_verified')}</span>`
                : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">${window.t('status_pending')}</span>`;

            let checkboxHtml = '';
            if (canManage && !log.is_verified) {
                const isChecked = selectedMaintIds.has(log.id) ? 'checked' : '';
                checkboxHtml = `<input type="checkbox" onchange="window.maintenanceModule.toggleRow(${log.id})" ${isChecked} 
                    class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
            } else {
                checkboxHtml = `<input type="checkbox" disabled 
                    class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
            }

            let actions = '';
            const viewBtn = `<button onclick="window.maintenanceModule.openViewModal(${log.id})" 
                class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" 
                title="${window.t('view')}"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

            if (log.is_verified) {
                actions = `<div class="flex items-center justify-end gap-2">${viewBtn}
                    <span class="text-slate-600 cursor-not-allowed" title="${window.t('msg_locked')}">
                        <i data-lucide="lock" class="w-4 h-4"></i>
                    </span></div>`;
            } else if (canManage) {
                actions = `<div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="window.maintenanceModule.requestVerify(${log.id})" 
                        class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" 
                        title="${window.t('btn_verify')}"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="window.maintenanceModule.openEditModal(${log.id})" 
                        class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" 
                        title="${window.t('edit')}"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="window.maintenanceModule.requestDelete(${log.id})" 
                        class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" 
                        title="${window.t('delete')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
            } else {
                actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
            }

            return `
                <tr class="hover:bg-white/5 border-b border-slate-700/30 group">
                    <td class="p-4 text-center">${checkboxHtml}</td>
                    <td class="p-4 font-mono text-white">${plate}</td>
                    <td class="p-4 text-slate-400">${catName}</td>
                    <td class="p-4 text-slate-400">${garageName}</td>
                    <td class="p-4 text-right font-bold text-emerald-400">${log.maintenance_cost ? log.maintenance_cost.toFixed(2) : '0.00'}</td>
                    <td class="p-4">${verifyBadge}</td>
                    <td class="p-4 text-slate-500 text-xs">${date}</td>
                    <td class="p-4 text-right flex justify-end gap-2">${actions}</td>
                </tr>`;
        }).join('');
        
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 4. BULK OPERATIONS
    // =================================================================
    function toggleRow(id) {
        if (selectedMaintIds.has(id)) selectedMaintIds.delete(id);
        else selectedMaintIds.add(id);
        updateBulkUI();
    }

    function toggleSelectAll() {
        const mainCheck = getEl('selectAllMaint');
        if (!mainCheck) return;
        
        selectedMaintIds.clear();
        
        if (mainCheck.checked) {
            const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
            allMaintLogs.forEach(log => {
                if (canManage && !log.is_verified) selectedMaintIds.add(log.id);
            });
        }
        renderTable();
        updateBulkUI();
    }

    function updateBulkUI() {
        const btn = getEl('btnMaintBulkVerify');
        const countSpan = getEl('maintSelectedCount');
        if (!btn) return;

        if (countSpan) countSpan.innerText = selectedMaintIds.size;
        if (selectedMaintIds.size > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }

    function executeBulkVerify() {
        if (selectedMaintIds.size === 0) return;
        
        maintActionType = 'bulk-verify';
        maintActionId = null;
        
        showConfirmModal(
            window.t('btn_verify_selected'), 
            `${window.t('msg_verify_confirm')}?`, 
            "check-circle", 
            "bg-emerald-600"
        );
    }

    // =================================================================
    // 5. SINGLE ACTIONS
    // =================================================================
    function requestVerify(id) {
        maintActionType = 'verify';
        maintActionId = id;
        showConfirmModal(window.t('btn_verify'), window.t('msg_verify_confirm'), "check-circle", "bg-green-600");
    }

    function requestDelete(id) {
        maintActionType = 'delete';
        maintActionId = id;
        showConfirmModal(window.t('delete'), window.t('msg_confirm_delete'), "trash-2", "bg-red-600");
    }

    async function executeConfirmAction() {
        const btn = getEl('btnMaintConfirmAction');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('loading')}`;

        try {
            let result;
            if (maintActionType === 'delete') {
                result = await window.fetchWithAuth(`/maintenances/${maintActionId}`, 'DELETE');
            } else if (maintActionType === 'verify') {
                const payload = { ids: [parseInt(maintActionId)] };
                result = await window.fetchWithAuth(`/maintenances/verify-bulk`, 'PUT', payload);
            } else if (maintActionType === 'bulk-verify') {
                const idList = Array.from(selectedMaintIds).map(id => parseInt(id));
                const payload = { ids: idList };
                result = await window.fetchWithAuth('/maintenances/verify-bulk', 'PUT', payload);
            }
            
            closeModal('maintConfirmModal');
            
            if (result !== null && result !== false) {
                if (maintActionType === 'bulk-verify') selectedMaintIds.clear();
                await loadData();
                showAlert(window.t('title_success'), window.t('msg_updated'), true);
            } else {
                showAlert(window.t('title_error'), window.t('msg_operation_failed'), false);
            }
        } catch(e) {
            closeModal('maintConfirmModal');
            showAlert(window.t('title_error'), e.message || window.t('msg_operation_failed'), false);
        }
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        maintActionId = null;
        maintActionType = null;
    }

    // =================================================================
    // 6. MODAL OPERATIONS
    // =================================================================
    function openAddModal() {
        const editIdEl = getEl('maintEditId');
        const modalTitle = getEl('maintModalTitle');
        const saveBtn = getEl('btnSaveMaint');
        
        if (editIdEl) editIdEl.value = "";
        if (modalTitle) modalTitle.innerText = window.t('btn_log_maintenance');
        if (saveBtn) saveBtn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> ${window.t('btn_save')}`;
        
        populateSelect('maintVehicleSelect', maintOptions.vehicles, '', 'plate_number', window.t('lbl_select_vehicle'));
        populateSelect('maintCatSelect', maintOptions.cats, '', 'cat_maintenance', window.t('lbl_select_category'));
        populateSelect('maintGarageSelect', maintOptions.garages, '', 'nom_garage', window.t('select_garage') || 'Select Garage');
        
        const costEl = getEl('maintCost');
        const dateEl = getEl('maintDate');
        const receiptEl = getEl('maintReceipt');
        
        if (costEl) costEl.value = "";
        if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
        if (receiptEl) receiptEl.value = "";
        
        const modal = getEl('addMaintModal');
        if (modal) modal.classList.remove('hidden');
    }

    function openEditModal(id) {
        const log = allMaintLogs.find(l => l.id === id);
        if (!log) return;

        const editIdEl = getEl('maintEditId');
        const modalTitle = getEl('maintModalTitle');
        const saveBtn = getEl('btnSaveMaint');
        
        if (editIdEl) editIdEl.value = log.id;
        if (modalTitle) modalTitle.innerText = window.t('edit');
        if (saveBtn) saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> ${window.t('btn_update')}`;
        
        populateSelect('maintVehicleSelect', maintOptions.vehicles, log.vehicle_id, 'plate_number', window.t('lbl_select_vehicle'));
        populateSelect('maintCatSelect', maintOptions.cats, log.cat_maintenance_id, 'cat_maintenance', window.t('lbl_select_category'));
        populateSelect('maintGarageSelect', maintOptions.garages, log.garage_id, 'nom_garage', window.t('select_garage') || 'Select Garage');
        
        const costEl = getEl('maintCost');
        const dateEl = getEl('maintDate');
        const receiptEl = getEl('maintReceipt');
        
        if (costEl) costEl.value = log.maintenance_cost || '';
        if (dateEl) dateEl.value = log.maintenance_date ? log.maintenance_date.split('T')[0] : '';
        if (receiptEl) receiptEl.value = log.receipt || '';
        
        const modal = getEl('addMaintModal');
        if (modal) modal.classList.remove('hidden');
    }

    async function saveMaintenance() {
        const editIdEl = getEl('maintEditId');
        const vIdEl = getEl('maintVehicleSelect');
        const catIdEl = getEl('maintCatSelect');
        const garageIdEl = getEl('maintGarageSelect');
        const costEl = getEl('maintCost');
        const dateEl = getEl('maintDate');
        const receiptEl = getEl('maintReceipt');
        
        const id = editIdEl ? editIdEl.value : '';
        const vId = vIdEl ? vIdEl.value : '';
        const catId = catIdEl ? catIdEl.value : '';
        const garageId = garageIdEl ? garageIdEl.value : '';
        const cost = costEl ? costEl.value : '';
        const date = dateEl ? dateEl.value : '';
        const receipt = receiptEl ? receiptEl.value : '';

        if (!vId || isNaN(cost) || !date) { 
            showAlert(window.t('validation'), window.t('msg_validation_fail'), false); 
            return; 
        }

        const payload = {
            vehicle_id: parseInt(vId),
            cat_maintenance_id: catId ? parseInt(catId) : null,
            garage_id: garageId ? parseInt(garageId) : null,
            maintenance_cost: parseFloat(cost),
            maintenance_date: new Date(date).toISOString(),
            receipt: receipt
        };

        const btn = getEl('btnSaveMaint');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('msg_loading')}`;

        try {
            let result;
            if (id) {
                result = await window.fetchWithAuth(`/maintenances/${id}`, 'PUT', payload);
            } else {
                result = await window.fetchWithAuth('/maintenances/', 'POST', payload);
            }
            
            if (result && !result.detail) {
                closeModal('addMaintModal');
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
    }

    function openViewModal(id) {
        const log = allMaintLogs.find(l => l.id === id);
        if (!log) return;
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
        const garage = maintOptions.garages.find(g => g.id === log.garage_id);

        const dateStr = log.maintenance_date ? new Date(log.maintenance_date).toLocaleDateString(window.APP_LOCALE) : 'N/A';

        const content = `
            <div class="grid grid-cols-2 gap-y-4">
                <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_plate')}</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : log.vehicle_id}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_category')}</span><span class="text-white">${cat ? cat.cat_maintenance : '-'}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_garage')}</span><span class="text-white">${garage ? garage.nom_garage : '-'}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_receipt')}</span><span class="text-white font-mono">${log.receipt || '-'}</span></div>
                <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                    <span class="text-slate-500 text-xs uppercase">${window.t('col_cost')}</span>
                    <span class="text-emerald-400 font-bold text-lg">BIF ${log.maintenance_cost ? log.maintenance_cost.toFixed(2) : '0.00'}</span>
                </div>
                <div class="col-span-2 text-xs text-slate-600 text-center mt-2">
                    ${window.t('col_date')}: ${dateStr}
                </div>
            </div>
        `;
        
        const viewContent = getEl('viewMaintContent');
        if (viewContent) viewContent.innerHTML = content;
        
        const modal = getEl('viewMaintModal');
        if (modal) modal.classList.remove('hidden');
    }

    // =================================================================
    // 7. HELPER FUNCTIONS
    // =================================================================
    function closeModal(modalId) {
        const modal = getEl(modalId);
        if (modal) modal.classList.add('hidden');
    }

    function showConfirmModal(title, message, icon, color) {
        const modal = getEl('maintConfirmModal');
        if (!modal) return;
        
        const titleEl = getEl('maintConfirmTitle');
        const messageEl = getEl('maintConfirmMessage');
        
        if (titleEl) titleEl.innerText = title;
        if (messageEl) messageEl.innerText = message;
        
        const btn = getEl('btnMaintConfirmAction');
        if (btn) {
            btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color} hover:opacity-90`;
        }
        
        const iconDiv = getEl('maintConfirmIcon');
        if (iconDiv) {
            iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${color.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
            iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
        }

        modal.classList.remove('hidden');
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
        }, 3000);
    }

    function populateSelect(elementId, items, selectedValue, labelKey, defaultText) {
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

    // =================================================================
    // 8. MODULE EXPORT
    // =================================================================
    window.maintenanceModule = {
        init: initMaintenance,
        destroy: function() {
            // Cleanup will be handled by router
            console.log("Maintenance module cleanup");
        },
        refresh: loadData,
        toggleRow: toggleRow,
        executeBulkVerify: executeBulkVerify,
        requestVerify: requestVerify,
        requestDelete: requestDelete,
        openViewModal: openViewModal,
        openEditModal: openEditModal,
        openAddModal: openAddModal,
        saveMaintenance: saveMaintenance,
        closeModal: closeModal
    };

    // Auto-initialize if needed
    if (document.readyState === 'complete' && window.location.hash === '#maintenance') {
        setTimeout(initMaintenance, 100);
    }

    console.log('Maintenance module loaded');
})();