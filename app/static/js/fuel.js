// static/js/fuel.js
(function() {
    'use strict';
    
    /**
     * ==============================================================================
     * FLEETDASH FUEL MODULE (Multi-Language)
     * Handles fuel logs, verification, bulk actions, and CRUD operations.
     * ==============================================================================
     */

    // =================================================================
    // MOBILE-COMPATIBLE ELEMENT GETTER
    // =================================================================
    function getFuelEl(id) {
        // First try mobile container (if we're on mobile)
        if (window.innerWidth < 768) {
            const mobileEl = document.querySelector('#app-content-mobile #' + id);
            if (mobileEl) return mobileEl;
        }
        // Then try desktop container
        const desktopEl = document.querySelector('#app-content #' + id);
        if (desktopEl) return desktopEl;
        // Fallback to global search
        return document.getElementById(id);
    }

    // =================================================================
    // GLOBAL STATE
    // =================================================================
    let allFuelLogs = [];
    let fuelOptions = { vehicles: [], fuelTypes: [] };
    let currentUserRole = 'user';
    let selectedFuelIds = new Set(); 

    // Action state variables
    let fuelActionType = null; 
    let fuelActionId = null;

    // =================================================================
    // 1. INITIALIZATION (Called by router when #fuel is loaded)
    // =================================================================

    function initFuel() {
        console.log("Fuel Module: Initializing...");
        
        // Check for required globals
        if (typeof window.fetchWithAuth !== 'function') {
            console.error('fetchWithAuth not available');
            return;
        }
        
        if (typeof window.t !== 'function') {
            console.error('Translation function t() not available');
            return;
        }

        // Get current user role
        currentUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

        // Attach event listeners
        attachFuelListeners();

        // Load initial data
        loadInitialFuelData();

        // Set theme icon if exists
        setFuelThemeIcon();

        // Create icons
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        console.log("Fuel module initialized");
    }

    // Attach all event listeners for fuel module
    function attachFuelListeners() {
        // Table filters
        const searchInput = getFuelEl('fuelSearch');
        const vehicleFilter = getFuelEl('fuelVehicleFilter');
        const statusFilter = getFuelEl('fuelStatusFilter');
        const selectAllCheckbox = getFuelEl('selectAllFuel');
        
        if (searchInput) searchInput.addEventListener('input', renderFuelTable);
        if (vehicleFilter) vehicleFilter.addEventListener('change', renderFuelTable);
        if (statusFilter) statusFilter.addEventListener('change', renderFuelTable);
        if (selectAllCheckbox) selectAllCheckbox.addEventListener('change', toggleFuelSelectAll);

        // Modal inputs
        const qtyInput = getFuelEl('fuelQuantity');
        const priceInput = getFuelEl('fuelPrice');
        const vehicleSelect = getFuelEl('fuelVehicleSelect');
        
        if (qtyInput) qtyInput.addEventListener('input', updateCostPreview);
        if (priceInput) priceInput.addEventListener('input', updateCostPreview);
        if (vehicleSelect) vehicleSelect.addEventListener('change', autoSelectFuelType);

        // Action buttons
        const confirmBtn = getFuelEl('btnFuelConfirmAction');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', executeFuelConfirmAction);
        }

        // Save button
        const saveBtn = getFuelEl('btnSaveFuel');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveFuelLog);
        }

        // Bulk verify button
        const bulkVerifyBtn = getFuelEl('btnFuelBulkVerify');
        if (bulkVerifyBtn) {
            bulkVerifyBtn.addEventListener('click', executeFuelBulkVerify);
        }

        // Theme toggle (if exists in fuel module)
        const themeToggle = getFuelEl('theme-toggle-header');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleTheme);
        }
    }

    // =================================================================
    // 2. UTILITY FUNCTIONS
    // =================================================================

    function setFuelThemeIcon() {
        const themeToggleButtonHeader = getFuelEl('theme-toggle-header');
        if (!themeToggleButtonHeader) return;

        if (document.documentElement.classList.contains('dark')) {
            themeToggleButtonHeader.innerHTML = '<i data-lucide="sun" class="w-5 h-5"></i>';
        } else {
            themeToggleButtonHeader.innerHTML = '<i data-lucide="moon" class="w-5 h-5"></i>';
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function toggleTheme() {
        document.documentElement.classList.toggle('dark');
        setFuelThemeIcon();
        renderFuelTable(); // Re-render table to update theme colors
    }

    function showFuelToast(message, duration = 3000, type = 'info') {
        const container = getFuelEl('toast-container') || getFuelEl('fuel-toast-container');
        if (!container) {
            console.log(`${type}: ${message}`);
            return;
        }

        const toastElement = document.createElement('div');
        toastElement.textContent = message;
        toastElement.className = `px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-up ${type === 'error' ? 'bg-red-500' :
                type === 'success' ? 'bg-green-500' : 'bg-blue-500'
            }`;
        container.appendChild(toastElement);
        setTimeout(() => {
            toastElement.style.opacity = '0';
            setTimeout(() => {
                if (toastElement.parentNode) toastElement.parentNode.removeChild(toastElement);
            }, 300);
        }, duration);
    }

    function closeFuelModal(modalId) {
        const modal = getFuelEl(modalId);
        if (modal) modal.classList.add('hidden');
    }

    function populateSelect(elementId, items, selectedValue, labelKey, defaultText) {
        const el = getFuelEl(elementId);
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
    // 3. DATA LOADING
    // =================================================================

    async function loadInitialFuelData() {
        await Promise.all([loadFuelData(), fetchFuelDropdowns()]);
    }

    async function loadFuelData() {
        const tbody = getFuelEl('fuelLogsBody');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>${window.t('msg_loading')}</td></tr>`;
        
        if (window.lucide) window.lucide.createIcons();

        try {
            const data = await window.fetchWithAuth('/fuel/'); 
            const items = data.items || data;
            
            if (Array.isArray(items)) {
                allFuelLogs = items;
                selectedFuelIds.clear(); 
                updateFuelBulkUI();
                renderFuelTable();
            } else {
                const msg = data && data.detail ? data.detail : window.t('title_error');
                tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">${window.t('title_error')}: ${msg}</td></tr>`;
            }
        } catch (e) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">${window.t('msg_connection_fail')}</td></tr>`;
        }
    }

    async function fetchFuelDropdowns() {
        try {
            const [vehicles, types] = await Promise.all([
                window.fetchWithAuth('/vehicles/?limit=1000'),
                window.fetchWithAuth('/fuel-types/')
            ]);
            
            fuelOptions.vehicles = Array.isArray(vehicles) ? vehicles : (vehicles.items || []);
            fuelOptions.fuelTypes = Array.isArray(types) ? types : (types.items || []);
            
            populateSelect('fuelVehicleFilter', fuelOptions.vehicles, '', 'plate_number', window.t('vehicles') || 'All Vehicles');
            populateSelect('fuelVehicleSelect', fuelOptions.vehicles, '', 'plate_number', window.t('lbl_select_vehicle'));
            populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', window.t('col_fuel_type'));
            
        } catch (e) { 
            console.warn("Fuel Dropdown Error:", e); 
        }
    }

    // =================================================================
    // 4. TABLE RENDERING & BULK OPERATIONS
    // =================================================================

    function renderFuelTable() {
        const tbody = getFuelEl('fuelLogsBody');
        if (!tbody) return;

        const search = getFuelEl('fuelSearch');
        const vFilter = getFuelEl('fuelVehicleFilter');
        const sFilter = getFuelEl('fuelStatusFilter');
        
        const searchValue = search ? search.value.toLowerCase() : '';
        const vFilterValue = vFilter ? vFilter.value : '';
        const sFilterValue = sFilter ? sFilter.value : '';

        let filtered = allFuelLogs.filter(log => {
            const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
            const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
            
            const matchesSearch = plate.includes(searchValue);
            const matchesVehicle = vFilterValue === "" || log.vehicle_id == vFilterValue;
            let matchesStatus = true;
            if (sFilterValue === 'verified') matchesStatus = log.is_verified === true;
            if (sFilterValue === 'pending') matchesStatus = log.is_verified !== true;

            return matchesSearch && matchesVehicle && matchesStatus;
        });

        const countEl = getFuelEl('fuelLogsCount');
        if (countEl) countEl.innerText = `${filtered.length} ${window.t('fuel')}`;

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">${window.t('msg_no_records')}</td></tr>`;
            return;
        }

        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);

        tbody.innerHTML = filtered.map(log => {
            const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
            const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);
            const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
            const typeName = type ? type.fuel_type : '-';
            
            // Date Formatting
            const date = new Date(log.created_at).toLocaleDateString(window.APP_LOCALE);
            
            const statusBadge = log.is_verified 
                ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">${window.t('status_verified')}</span>`
                : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">${window.t('status_pending')}</span>`;

            let checkboxHtml = '';
            if (canManage && !log.is_verified) {
                const isChecked = selectedFuelIds.has(log.id) ? 'checked' : '';
                checkboxHtml = `<input type="checkbox" onchange="window.fuelModule.toggleFuelRow(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
            } else {
                checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
            }

            let actionButtons = '';
            const viewBtn = `<button onclick="window.fuelModule.openViewFuelModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="${window.t('view')}"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

            if (log.is_verified) {
                actionButtons = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed" title="${window.t('msg_locked')}"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
            } else if (canManage) {
                actionButtons = `
                    <div class="flex items-center justify-end gap-2">
                        ${viewBtn}
                        <button onclick="window.fuelModule.reqFuelVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" title="${window.t('btn_verify')}"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                        <button onclick="window.fuelModule.openEditFuelModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="${window.t('edit')}"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                        <button onclick="window.fuelModule.reqFuelDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="${window.t('delete')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>`;
            } else {
                actionButtons = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
            }

            return `
                <tr class="hover:bg-white/5 transition group border-b border-slate-700/30">
                    <td class="p-4 text-center">${checkboxHtml}</td>
                    <td class="p-4 font-mono text-white">${plate}</td>
                    <td class="p-4 text-slate-400">${typeName}</td>
                    <td class="p-4 text-right"><div class="text-slate-200">${log.quantity ? log.quantity.toFixed(2) : '0.00'} L</div><div class="text-xs text-slate-500">@ ${log.price_little ? log.price_little.toFixed(2) : '0.00'}</div></td>
                    <td class="p-4 text-right font-bold text-emerald-400">${log.cost ? log.cost.toFixed(2) : '0.00'}</td>
                    <td class="p-4">${statusBadge}</td>
                    <td class="p-4 text-slate-500 text-xs">${date}</td>
                    <td class="p-4 text-right">${actionButtons}</td>
                </tr>
            `;
        }).join('');
        
        if (window.lucide) window.lucide.createIcons();
    }

    // === BULK OPERATIONS ===

    function toggleFuelRow(id) {
        if (selectedFuelIds.has(id)) {
            selectedFuelIds.delete(id);
        } else {
            selectedFuelIds.add(id);
        }
        updateFuelBulkUI();
    }

    function toggleFuelSelectAll() {
        const mainCheck = getFuelEl('selectAllFuel');
        if (!mainCheck) return;
        
        const isChecked = mainCheck.checked;
        selectedFuelIds.clear();
        
        if (isChecked) {
            const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
            allFuelLogs.forEach(log => {
                if (canManage && !log.is_verified) selectedFuelIds.add(log.id);
            });
        }
        renderFuelTable();
        updateFuelBulkUI();
    }

    function updateFuelBulkUI() {
        const btn = getFuelEl('btnFuelBulkVerify');
        const countSpan = getFuelEl('fuelSelectedCount');
        if (!btn) return;

        if (countSpan) countSpan.innerText = selectedFuelIds.size;
        if (selectedFuelIds.size > 0) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }

    function executeFuelBulkVerify() {
        if (selectedFuelIds.size === 0) return;
        
        fuelActionType = 'bulk-verify';
        fuelActionId = null;
        showFuelConfirmModal(
            window.t('btn_verify_selected'), 
            `${window.t('msg_verify_confirm')}?`, 
            "check-circle", 
            "bg-emerald-600"
        );
    }

    // =================================================================
    // 5. SINGLE RECORD OPERATIONS
    // =================================================================

    function reqFuelVerify(id) {
        fuelActionType = 'verify';
        fuelActionId = id;
        showFuelConfirmModal(window.t('btn_verify'), window.t('msg_verify_confirm'), 'check-circle', 'bg-green-600');
    }

    function reqFuelDelete(id) {
        fuelActionType = 'delete';
        fuelActionId = id;
        showFuelConfirmModal(window.t('delete'), window.t('msg_confirm_delete'), 'trash-2', 'bg-red-600');
    }

    async function executeFuelConfirmAction() {
        const btn = getFuelEl('btnFuelConfirmAction');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.disabled = true; 
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('loading')}`;
        
        if (window.lucide) window.lucide.createIcons();

        try {
            let result;
            
            if (fuelActionType === 'delete') {
                result = await window.fetchWithAuth(`/fuel/${fuelActionId}`, 'DELETE');
            } 
            else if (fuelActionType === 'verify') {
                const payload = { ids: [parseInt(fuelActionId)] }; 
                result = await window.fetchWithAuth(`/fuel/verify-bulk`, 'PUT', payload);
            }
            else if (fuelActionType === 'bulk-verify') {
                const idList = Array.from(selectedFuelIds).map(id => parseInt(id));
                const payload = { ids: idList };
                result = await window.fetchWithAuth(`/fuel/verify-bulk`, 'PUT', payload);
            }

            closeFuelModal('fuelConfirmModal');
            
            if (result !== null && result !== false) {
                if (fuelActionType === 'bulk-verify') selectedFuelIds.clear();
                await loadFuelData();
                showFuelAlert(window.t('title_success'), window.t('msg_updated'), true);
            } else {
                showFuelAlert(window.t('title_error'), window.t('msg_operation_failed'), false);
            }
        } catch(e) {
            closeFuelModal('fuelConfirmModal');
            showFuelAlert(window.t('title_error'), e.message || window.t('msg_operation_failed'), false);
        }
        
        btn.disabled = false; 
        btn.innerHTML = originalText;
        fuelActionId = null; 
        fuelActionType = null;
    }

    // =================================================================
    // 6. MODAL OPERATIONS (Add/Edit/View)
    // =================================================================

    function openAddFuelModal() {
        const editIdEl = getFuelEl('fuelEditId');
        const modalTitle = getFuelEl('fuelModalTitle');
        const saveBtn = getFuelEl('btnSaveFuel');
        
        if (editIdEl) editIdEl.value = ""; 
        if (modalTitle) modalTitle.innerText = window.t('btn_add_fuel_log');
        if (saveBtn) saveBtn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> ${window.t('btn_save')}`;
        
        populateSelect('fuelVehicleSelect', fuelOptions.vehicles, '', 'plate_number', window.t('lbl_select_vehicle'));
        
        const qtyEl = getFuelEl('fuelQuantity');
        const priceEl = getFuelEl('fuelPrice');
        const costPreview = getFuelEl('costPreview');
        
        if (qtyEl) qtyEl.value = "";
        if (priceEl) priceEl.value = "";
        if (costPreview) costPreview.classList.add('hidden');
        
        const modal = getFuelEl('addFuelModal');
        if (modal) modal.classList.remove('hidden');
        
        if (window.lucide) window.lucide.createIcons();
    }

    function openEditFuelModal(id) {
        const log = allFuelLogs.find(l => l.id === id);
        if (!log) return;
        
        const editIdEl = getFuelEl('fuelEditId');
        const modalTitle = getFuelEl('fuelModalTitle');
        const saveBtn = getFuelEl('btnSaveFuel');
        
        if (editIdEl) editIdEl.value = log.id; 
        if (modalTitle) modalTitle.innerText = window.t('edit');
        if (saveBtn) saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> ${window.t('btn_update')}`;

        populateSelect('fuelVehicleSelect', fuelOptions.vehicles, log.vehicle_id, 'plate_number', window.t('lbl_select_vehicle'));
        populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, log.fuel_type_id, 'fuel_type', window.t('col_fuel_type'));
        
        const qtyEl = getFuelEl('fuelQuantity');
        const priceEl = getFuelEl('fuelPrice');
        
        if (qtyEl) qtyEl.value = log.quantity || '';
        if (priceEl) priceEl.value = log.price_little || '';
        
        updateCostPreview();

        const modal = getFuelEl('addFuelModal');
        if (modal) modal.classList.remove('hidden');
        
        if (window.lucide) window.lucide.createIcons();
    }

    async function saveFuelLog() {
        const editIdEl = getFuelEl('fuelEditId');
        const vIdEl = getFuelEl('fuelVehicleSelect');
        const typeIdEl = getFuelEl('fuelTypeSelect');
        const qtyEl = getFuelEl('fuelQuantity');
        const priceEl = getFuelEl('fuelPrice');
        
        const id = editIdEl ? editIdEl.value : '';
        const vId = vIdEl ? vIdEl.value : '';
        const typeId = typeIdEl ? typeIdEl.value : '';
        const qty = qtyEl ? qtyEl.value : '';
        const price = priceEl ? priceEl.value : '';

        if (!vId || !typeId || !qty || !price) { 
            showFuelAlert(window.t('validation'), window.t('msg_validation_fail'), false); 
            return; 
        }

        const payload = {
            vehicle_id: parseInt(vId),
            fuel_type_id: parseInt(typeId),
            quantity: parseFloat(qty),
            price_little: parseFloat(price)
        };

        const btn = getFuelEl('btnSaveFuel');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('msg_loading')}`;
        btn.disabled = true;

        try {
            let result;
            if (id) {
                result = await window.fetchWithAuth(`/fuel/${id}`, 'PUT', payload);
            } else {
                result = await window.fetchWithAuth('/fuel/', 'POST', payload);
            }

            if (result && !result.detail) {
                closeFuelModal('addFuelModal');
                await loadFuelData();
                showFuelAlert(window.t('title_success'), window.t('msg_saved'), true);
            } else {
                const msg = result?.detail ? JSON.stringify(result.detail) : window.t('msg_operation_failed');
                showFuelAlert(window.t('title_error'), msg, false);
            }
        } catch(e) {
            showFuelAlert(window.t('title_error'), e.message, false);
        }
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
    }

    function openViewFuelModal(id) {
        const log = allFuelLogs.find(l => l.id === id);
        if (!log) return;
        const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
        const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);

        // Date Format
        const dateStr = log.created_at ? new Date(log.created_at).toLocaleDateString(window.APP_LOCALE) : 'N/A';

        const content = `
            <div class="grid grid-cols-2 gap-y-4">
                <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_plate')}</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : log.vehicle_id}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_fuel_type')}</span><span class="text-white">${type ? type.fuel_type : '-'}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_mileage')}</span><span class="text-white">${log.quantity ? log.quantity.toFixed(2) : '0.00'} L</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_cost')}</span><span class="text-white">${log.price_little ? log.price_little.toFixed(2) : '0.00'}</span></div>
                <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                    <span class="text-slate-500 text-xs uppercase">${window.t('col_total_cost')}</span>
                    <span class="text-emerald-400 font-bold text-lg">BIF ${log.cost ? log.cost.toFixed(2) : '0.00'}</span>
                </div>
                <div class="col-span-2 text-xs text-slate-600 text-center mt-2">
                    ${window.t('col_date')}: ${dateStr}
                </div>
            </div>
        `;
        
        const viewContent = getFuelEl('viewFuelContent');
        if (viewContent) viewContent.innerHTML = content;
        
        const modal = getFuelEl('viewFuelModal');
        if (modal) modal.classList.remove('hidden');
    }

    // =================================================================
    // 7. HELPER MODAL FUNCTIONS
    // =================================================================

    function showFuelConfirmModal(title, msg, icon, btnClass) {
        const titleEl = getFuelEl('fuelConfirmTitle');
        const messageEl = getFuelEl('fuelConfirmMessage');
        const iconDiv = getFuelEl('fuelConfirmIcon');
        const btn = getFuelEl('btnFuelConfirmAction');
        const modal = getFuelEl('fuelConfirmModal');
        
        if (!modal) return;
        
        if (titleEl) titleEl.innerText = title;
        if (messageEl) messageEl.innerText = msg;
        
        if (iconDiv) {
            iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${btnClass.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
            iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
        }
        
        if (btn) {
            btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${btnClass} hover:opacity-90`;
        }
        
        modal.classList.remove('hidden');
        
        if (window.lucide) window.lucide.createIcons();
    }

    function showFuelAlert(title, message, isSuccess) {
        const modal = getFuelEl('fuelAlertModal');
        if (!modal) { 
            // Fallback to toast
            showFuelToast(`${title}: ${message}`, 3000, isSuccess ? 'success' : 'error');
            return; 
        }
        
        const titleEl = getFuelEl('fuelAlertTitle');
        const messageEl = getFuelEl('fuelAlertMessage');
        
        if (titleEl) titleEl.innerText = title;
        if (messageEl) messageEl.innerText = message;
        
        const iconDiv = getFuelEl('fuelAlertIcon');
        if (iconDiv) {
            if (isSuccess) {
                iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-green-500/10 text-green-500";
                iconDiv.innerHTML = '<i data-lucide="check" class="w-6 h-6"></i>';
            } else {
                iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/10 text-red-500";
                iconDiv.innerHTML = '<i data-lucide="x" class="w-6 h-6"></i>';
            }
        }
        
        modal.classList.remove('hidden');
        
        // Auto close after appropriate time
        const closeTime = isSuccess ? 3000 : 5000; 
        setTimeout(() => {
            modal.classList.add('hidden');
        }, closeTime);
        
        if (window.lucide) window.lucide.createIcons();
    }

    function autoSelectFuelType() {
        const vIdEl = getFuelEl('fuelVehicleSelect');
        const typeSelect = getFuelEl('fuelTypeSelect');
        
        if (!vIdEl || !typeSelect) return;
        
        const vId = vIdEl.value;
        
        if (!vId) { 
            typeSelect.innerHTML = `<option value="">${window.t('msg_select_vehicle_first')}</option>`; 
            return; 
        }
        
        const vehicle = fuelOptions.vehicles.find(v => v.id == vId);
        if (vehicle && vehicle.vehicle_fuel_type) {
            const type = fuelOptions.fuelTypes.find(t => t.id === vehicle.vehicle_fuel_type);
            if (type) {
                typeSelect.innerHTML = `<option value="${type.id}" selected>${type.fuel_type}</option>`;
            } else {
                populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', window.t('col_fuel_type'));
            }
        } else {
            populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', window.t('col_fuel_type'));
        }
    }

    function updateCostPreview() {
        const qtyEl = getFuelEl('fuelQuantity');
        const priceEl = getFuelEl('fuelPrice');
        const preview = getFuelEl('costPreview');
        const totalCostDisplay = getFuelEl('totalCostDisplay');
        
        if (!qtyEl || !priceEl || !preview || !totalCostDisplay) return;
        
        const qty = parseFloat(qtyEl.value) || 0;
        const price = parseFloat(priceEl.value) || 0;
        const total = qty * price;
        
        if (total > 0) {
            preview.classList.remove('hidden');
            totalCostDisplay.innerText = `BIF ${total.toFixed(2)}`;
        } else {
            preview.classList.add('hidden');
        }
    }

    // =================================================================
    // 8. MODULE EXPORT
    // =================================================================

    window.fuelModule = {
        init: initFuel,
        destroy: function() {
            // Clean up event listeners
            const searchInput = getFuelEl('fuelSearch');
            const vehicleFilter = getFuelEl('fuelVehicleFilter');
            const statusFilter = getFuelEl('fuelStatusFilter');
            const selectAllCheckbox = getFuelEl('selectAllFuel');
            
            if (searchInput) searchInput.removeEventListener('input', renderFuelTable);
            if (vehicleFilter) vehicleFilter.removeEventListener('change', renderFuelTable);
            if (statusFilter) statusFilter.removeEventListener('change', renderFuelTable);
            if (selectAllCheckbox) selectAllCheckbox.removeEventListener('change', toggleFuelSelectAll);

            // Clean up modal listeners
            const qtyInput = getFuelEl('fuelQuantity');
            const priceInput = getFuelEl('fuelPrice');
            const vehicleSelect = getFuelEl('fuelVehicleSelect');
            
            if (qtyInput) qtyInput.removeEventListener('input', updateCostPreview);
            if (priceInput) priceInput.removeEventListener('input', updateCostPreview);
            if (vehicleSelect) vehicleSelect.removeEventListener('change', autoSelectFuelType);

            // Clean up action buttons
            const confirmBtn = getFuelEl('btnFuelConfirmAction');
            const saveBtn = getFuelEl('btnSaveFuel');
            const bulkVerifyBtn = getFuelEl('btnFuelBulkVerify');
            const themeToggle = getFuelEl('theme-toggle-header');
            
            if (confirmBtn) confirmBtn.removeEventListener('click', executeFuelConfirmAction);
            if (saveBtn) saveBtn.removeEventListener('click', saveFuelLog);
            if (bulkVerifyBtn) bulkVerifyBtn.removeEventListener('click', executeFuelBulkVerify);
            if (themeToggle) themeToggle.removeEventListener('click', toggleTheme);

            // Clear data
            allFuelLogs = [];
            fuelOptions = { vehicles: [], fuelTypes: [] };
            selectedFuelIds.clear();
            fuelActionType = null;
            fuelActionId = null;

            console.log("Fuel module cleaned up");
        },
        refresh: function() {
            loadInitialFuelData();
        },
        // Public API methods
        toggleFuelRow: toggleFuelRow,
        executeFuelBulkVerify: executeFuelBulkVerify,
        reqFuelVerify: reqFuelVerify,
        reqFuelDelete: reqFuelDelete,
        openViewFuelModal: openViewFuelModal,
        openEditFuelModal: openEditFuelModal,
        openAddFuelModal: openAddFuelModal,
        saveFuelLog: saveFuelLog,
        closeModal: closeFuelModal
    };

    // Auto-initialize if fuel is loaded directly
    if (document.readyState === 'complete' && window.location.hash === '#fuel') {
        setTimeout(() => {
            if (window.fuelModule && typeof window.fuelModule.init === 'function') {
                window.fuelModule.init();
            }
        }, 100);
    }

    console.log('Fuel module loaded');
})();