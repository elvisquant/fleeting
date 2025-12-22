// static/js/vehicles.js
(function() {
    'use strict';
    
    /**
     * ==============================================================================
     * FLEETDASH VEHICLES MODULE (Multi-Language)
     * Handles vehicles management, verification, bulk actions, and CRUD operations.
     * ==============================================================================
     */

    // =================================================================
    // MOBILE-COMPATIBLE ELEMENT GETTER
    // =================================================================
    function getVehicleEl(id) {
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
    let allVehicles = [];
    let vehicleOptions = { makes: [], models: [], types: [], trans: [], fuels: [] };
    let currentUserRole = 'user';
    let selectedVehicleIds = new Set();
    
    // Action state variables
    let vehicleActionType = null; 
    let vehicleActionId = null;

    // =================================================================
    // 1. INITIALIZATION (Called by router when #vehicles is loaded)
    // =================================================================

    function initVehicles() {
        console.log("Vehicles Module: Initializing...");
        
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
        attachVehiclesListeners();

        // Load initial data
        loadInitialVehiclesData();

        // Set theme icon if exists
        setVehicleThemeIcon();

        // Create icons
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        console.log("Vehicles module initialized");
    }

    // Attach all event listeners for vehicles module
    function attachVehiclesListeners() {
        // Table filters
        const searchInput = getVehicleEl('vehicleSearch');
        const statusFilter = getVehicleEl('vehicleStatusFilter');
        const selectAllCheckbox = getVehicleEl('selectAllVehicles');
        
        if (searchInput) searchInput.addEventListener('input', renderVehiclesTable);
        if (statusFilter) statusFilter.addEventListener('change', renderVehiclesTable);
        if (selectAllCheckbox) selectAllCheckbox.addEventListener('change', toggleVehicleSelectAll);

        // Action buttons
        const confirmBtn = getVehicleEl('btnVehicleConfirmAction');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', executeVehicleConfirmAction);
        }

        // Save button
        const saveBtn = getVehicleEl('btnSaveVehicle');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveVehicle);
        }

        // Bulk verify button
        const bulkVerifyBtn = getVehicleEl('btnVehicleBulkVerify');
        if (bulkVerifyBtn) {
            bulkVerifyBtn.addEventListener('click', reqVehicleBulkVerify);
        }

        // Export buttons
        const exportExcelBtn = getVehicleEl('exportExcelBtn');
        const exportPdfBtn = getVehicleEl('exportPdfBtn');
        
        if (exportExcelBtn) exportExcelBtn.addEventListener('click', exportVehiclesExcel);
        if (exportPdfBtn) exportPdfBtn.addEventListener('click', exportVehiclesPDF);

        // Theme toggle (if exists in vehicles module)
        const themeToggle = getVehicleEl('theme-toggle-header');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleVehicleTheme);
        }

        // Modal close buttons
        const closeButtons = document.querySelectorAll('[data-close-modal]');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const modalId = this.getAttribute('data-close-modal');
                closeVehicleModal(modalId);
            });
        });
    }

    // =================================================================
    // 2. UTILITY FUNCTIONS
    // =================================================================

    function setVehicleThemeIcon() {
        const themeToggleButtonHeader = getVehicleEl('theme-toggle-header');
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

    function toggleVehicleTheme() {
        document.documentElement.classList.toggle('dark');
        setVehicleThemeIcon();
        renderVehiclesTable(); // Re-render table to update theme colors
    }

    function showVehicleToast(message, duration = 3000, type = 'info') {
        const container = getVehicleEl('toast-container') || getVehicleEl('vehicle-toast-container');
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

    function closeVehicleModal(modalId) {
        const modal = getVehicleEl(modalId);
        if (modal) modal.classList.add('hidden');
    }

    function populateSelect(elementId, items, selectedValue, labelKey, defaultText) {
        const el = getVehicleEl(elementId);
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

    function getOptionName(list, id, label) {
        if (!list || id === null || id === undefined) return id || 'N/A';
        const found = list.find(i => i.id === id);
        return found ? found[label] : (id || 'N/A');
    }

    function getStatusClass(status) {
        const map = {
            'available': 'bg-green-500/10 text-green-400 border-green-500/20',
            'in_use': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
            'in_repair': 'bg-red-500/10 text-red-400 border-red-500/20',
            'sold': 'bg-slate-500/10 text-slate-400 border-slate-500/20'
        };
        return map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }

    // =================================================================
    // 3. DATA LOADING
    // =================================================================

    async function loadInitialVehiclesData() {
        await Promise.all([loadVehiclesData(), fetchVehicleDropdowns()]);
    }

    async function loadVehiclesData() {
        const tbody = getVehicleEl('vehiclesBody');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500">
            <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
            <div class="text-sm mt-2">${window.t('msg_loading')}</div>
        </td></tr>`;
        
        if (window.lucide) window.lucide.createIcons();

        try {
            const data = await window.fetchWithAuth('/vehicles/?limit=1000');
            const items = data.items || data;
            
            if (Array.isArray(items)) {
                allVehicles = items;
                selectedVehicleIds.clear();
                updateVehicleBulkUI();
                renderVehiclesTable();
            } else {
                const msg = data && data.detail ? data.detail : window.t('title_error');
                showVehicleAlert(window.t('title_error'), msg, false);
                tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
                    <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-2 text-red-400"></i>
                    <div>${window.t('title_error')}</div>
                </td></tr>`;
            }
        } catch (error) {
            console.error("Load vehicles error:", error);
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
                <i data-lucide="wifi-off" class="w-8 h-8 mx-auto mb-2 text-red-400"></i>
                <div>${window.t('msg_connection_fail')}</div>
            </td></tr>`;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    async function fetchVehicleDropdowns() {
        try {
            const [makes, models, types, trans, fuels] = await Promise.all([
                window.fetchWithAuth('/vehicle-makes/?limit=200'),
                window.fetchWithAuth('/vehicle-models/?limit=1000'),
                window.fetchWithAuth('/vehicle-types/?limit=200'),
                window.fetchWithAuth('/vehicle-transmissions/?limit=200'),
                window.fetchWithAuth('/fuel-types/?limit=200')
            ]);
            
            vehicleOptions.makes = Array.isArray(makes) ? makes : (makes.items || []);
            vehicleOptions.models = Array.isArray(models) ? models : (models.items || []);
            vehicleOptions.types = Array.isArray(types) ? types : (types.items || []);
            vehicleOptions.trans = Array.isArray(trans) ? trans : (trans.items || []);
            vehicleOptions.fuels = Array.isArray(fuels) ? fuels : (fuels.items || []);
            
        } catch (e) {
            console.warn("Dropdown Error", e);
            showVehicleAlert(window.t('title_warning'), "Dropdown Error", false);
        }
    }

    // =================================================================
    // 4. TABLE RENDERING
    // =================================================================

    function renderVehiclesTable() {
        const tbody = getVehicleEl('vehiclesBody');
        if (!tbody) return;

        const search = getVehicleEl('vehicleSearch');
        const statusFilter = getVehicleEl('vehicleStatusFilter');
        
        const searchValue = search ? search.value.toLowerCase() : '';
        const sFilter = statusFilter ? statusFilter.value : "all";
        
        let filtered = allVehicles.filter(v => {
            const makeName = getOptionName(vehicleOptions.makes, v.make, 'vehicle_make').toLowerCase();
            const modelName = getOptionName(vehicleOptions.models, v.model, 'vehicle_model').toLowerCase();
            const plate = v.plate_number ? v.plate_number.toLowerCase() : '';
            const vin = v.vin ? v.vin.toLowerCase() : '';
            
            const matchesSearch = 
                plate.includes(searchValue) ||
                vin.includes(searchValue) ||
                makeName.includes(searchValue) ||
                modelName.includes(searchValue);
                
            let matchesStatus = true;
            if (sFilter === 'verified') matchesStatus = v.is_verified === true;
            if (sFilter === 'pending') matchesStatus = v.is_verified !== true;

            return matchesSearch && matchesStatus;
        });

        const countEl = getVehicleEl('vehiclesCount');
        if (countEl) countEl.innerText = `${filtered.length} ${window.t('vehicles')}`;

        const selectAllCheckbox = getVehicleEl('selectAllVehicles');
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">
                <i data-lucide="search" class="w-8 h-8 mx-auto mb-2 text-slate-500"></i>
                <div>${window.t('msg_no_records')}</div>
            </td></tr>`;
            return;
        }

        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);

        tbody.innerHTML = filtered.map(v => {
            const make = getOptionName(vehicleOptions.makes, v.make, 'vehicle_make');
            const model = getOptionName(vehicleOptions.models, v.model, 'vehicle_model');
            const statusClass = getStatusClass(v.status);
            
            const verifyBadge = v.is_verified 
                ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1 w-fit">
                    <i data-lucide="check-circle" class="w-3 h-3"></i> ${window.t('status_verified')}
                   </span>`
                : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1 w-fit">
                    <i data-lucide="clock" class="w-3 h-3"></i> ${window.t('status_pending')}
                   </span>`;

            // Checkbox logic
            let checkboxHtml = '';
            if (canManage && !v.is_verified) {
                const isChecked = selectedVehicleIds.has(v.id) ? 'checked' : '';
                checkboxHtml = `<input type="checkbox" onchange="window.vehiclesModule.toggleVehicleRow(${v.id})" ${isChecked} 
                    class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-1 focus:ring-blue-500 cursor-pointer hover:border-blue-500 transition">`;
            } else {
                checkboxHtml = `<input type="checkbox" disabled 
                    class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
            }

            let actions = '';
            const viewBtn = `<button onclick="window.vehiclesModule.viewVehicle(${v.id})" 
                class="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-white rounded-md transition border border-slate-700 hover:border-blue-500"
                title="${window.t('view')}"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

            if (v.is_verified) {
                actions = `<div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <span class="text-slate-600 cursor-not-allowed p-1.5" title="${window.t('msg_locked')}">
                        <i data-lucide="lock" class="w-4 h-4"></i>
                    </span>
                </div>`;
            } else if (canManage) {
                actions = `<div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="window.vehiclesModule.reqVehicleVerify(${v.id})" 
                        class="p-1.5 bg-slate-800 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-md transition border border-slate-700 hover:border-emerald-500"
                        title="${window.t('btn_verify')}"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="window.vehiclesModule.openEditVehicleModal(${v.id})" 
                        class="p-1.5 bg-slate-800 hover:bg-amber-600 text-amber-400 hover:text-white rounded-md transition border border-slate-700 hover:border-amber-500"
                        title="${window.t('edit')}"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="window.vehiclesModule.reqVehicleDelete(${v.id})" 
                        class="p-1.5 bg-slate-800 hover:bg-red-600 text-red-400 hover:text-white rounded-md transition border border-slate-700 hover:border-red-500"
                        title="${window.t('delete')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
            } else {
                actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
            }
            
            return `
                <tr class="hover:bg-white/[0.02] transition-colors border-b border-slate-700/30">
                    <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                    <td class="p-4 align-middle">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                                <i data-lucide="car" class="w-5 h-5"></i>
                            </div>
                            <div>
                                <div class="font-medium text-white text-sm">${make} ${model}</div>
                                <div class="text-xs text-slate-500">ID: ${v.id} • ${v.year || ''}</div>
                            </div>
                        </div>
                    </td>
                    <td class="p-4 align-middle">
                        <div class="font-mono text-white text-sm">${v.plate_number || 'No Plate'}</div>
                        <div class="text-xs text-slate-500 truncate max-w-[150px]">${v.vin || 'No VIN'}</div>
                    </td>
                    <td class="p-4 text-slate-400 align-middle text-sm">${v.year || '-'}</td>
                    <td class="p-4 align-middle">
                        <span class="px-2 py-1 rounded-full text-[10px] uppercase font-bold border ${statusClass}">
                            ${v.status ? v.status.replace('_', ' ') : 'N/A'}
                        </span>
                    </td>
                    <td class="p-4 align-middle">${verifyBadge}</td>
                    <td class="p-4 align-middle text-right">
                        <div class="flex justify-end gap-2">${actions}</div>
                    </td>
                </tr>
            `;
        }).join('');
        
        updateSelectAllCheckbox();
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 5. BULK OPERATIONS
    // =================================================================

    function toggleVehicleRow(id) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
        const vehicle = allVehicles.find(v => v.id === id);
        
        if (!vehicle || !canManage || vehicle.is_verified) {
            return;
        }
        
        if (selectedVehicleIds.has(id)) {
            selectedVehicleIds.delete(id);
        } else {
            selectedVehicleIds.add(id);
        }
        
        updateVehicleBulkUI();
        updateSelectAllCheckbox();
    }

    function updateSelectAllCheckbox() {
        const selectAllCheckbox = getVehicleEl('selectAllVehicles');
        if (!selectAllCheckbox) return;
        
        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
        const selectableVehicles = allVehicles.filter(v => canManage && !v.is_verified);
        
        if (selectableVehicles.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
            return;
        }
        
        const selectedFromSelectable = selectableVehicles.filter(v => selectedVehicleIds.has(v.id));
        
        if (selectedFromSelectable.length === 0) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        } else if (selectedFromSelectable.length === selectableVehicles.length) {
            selectAllCheckbox.checked = true;
            selectAllCheckbox.indeterminate = false;
        } else {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = true;
        }
    }

    function toggleVehicleSelectAll() {
        const mainCheck = getVehicleEl('selectAllVehicles');
        if (!mainCheck) return;
        
        const isChecked = mainCheck.checked;
        
        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
        const selectableVehicles = allVehicles.filter(v => canManage && !v.is_verified);
        
        selectedVehicleIds.clear();
        
        if (isChecked && selectableVehicles.length > 0) {
            selectableVehicles.forEach(v => {
                selectedVehicleIds.add(v.id);
            });
        }
        
        renderVehiclesTable();
        updateVehicleBulkUI();
    }

    function updateVehicleBulkUI() {
        const btn = getVehicleEl('btnVehicleBulkVerify');
        const countSpan = getVehicleEl('vehicleSelectedCount');
        
        if (!btn || !countSpan) return;
        
        if (countSpan) countSpan.innerText = selectedVehicleIds.size;
        
        if (selectedVehicleIds.size > 0) {
            btn.classList.remove('hidden');
            btn.classList.add('animate-pulse');
            setTimeout(() => btn.classList.remove('animate-pulse'), 1000);
        } else {
            btn.classList.add('hidden');
        }
    }

    function reqVehicleBulkVerify() {
        if (selectedVehicleIds.size === 0) {
            showVehicleAlert(window.t('title_warning'), window.t('msg_validation_fail'), false);
            return;
        }
        
        vehicleActionType = 'bulk-verify';
        vehicleActionId = null;
        
        showVehicleConfirmModal(
            window.t('btn_verify_selected'), 
            `${window.t('msg_verify_confirm')}?`, 
            "shield-check", 
            "bg-emerald-600"
        );
    }

    // =================================================================
    // 6. SINGLE RECORD OPERATIONS
    // =================================================================

    function reqVehicleVerify(id) {
        const vehicle = allVehicles.find(v => v.id === id);
        if (!vehicle) return;
        
        if (vehicle.is_verified) {
            showVehicleAlert(window.t('title_warning'), window.t('msg_locked'), false);
            return;
        }
        
        vehicleActionType = 'verify';
        vehicleActionId = id;
        
        const make = getOptionName(vehicleOptions.makes, vehicle.make, 'vehicle_make');
        const model = getOptionName(vehicleOptions.models, vehicle.model, 'vehicle_model');
        const vehicleInfo = `${make} ${model} (${vehicle.plate_number})`;
        
        showVehicleConfirmModal(
            window.t('btn_verify'), 
            `${window.t('msg_verify_confirm')} ${vehicleInfo}`, 
            "check-circle", 
            "bg-green-600"
        );
    }

    function reqVehicleDelete(id) {
        const vehicle = allVehicles.find(v => v.id === id);
        if (!vehicle) return;
        
        vehicleActionType = 'delete';
        vehicleActionId = id;
        
        showVehicleConfirmModal(
            window.t('delete'), 
            window.t('msg_confirm_delete'), 
            "trash-2", 
            "bg-red-600"
        );
    }

    async function executeVehicleConfirmAction() {
        const btn = getVehicleEl('btnVehicleConfirmAction');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('loading')}`;
        
        try {
            let result = null;
            let successMessage = "";
            let idList = [];
            
            // --- DELETE ---
            if (vehicleActionType === 'delete') {
                result = await window.fetchWithAuth(`/vehicles/${vehicleActionId}`, 'DELETE');
                successMessage = window.t('msg_vehicle_deleted');
            }
            // --- VERIFY (Single) ---
            else if (vehicleActionType === 'verify') {
                idList = [parseInt(vehicleActionId)];
                const payload = { ids: idList };
                result = await window.fetchWithAuth(`/vehicles/verify-bulk`, 'PUT', payload);
                successMessage = window.t('msg_vehicle_verified');
            }
            // --- VERIFY (Bulk) ---
            else if (vehicleActionType === 'bulk-verify') {
                idList = Array.from(selectedVehicleIds).map(id => parseInt(id));
                const payload = { ids: idList };
                result = await window.fetchWithAuth('/vehicles/verify-bulk', 'PUT', payload);
                successMessage = window.t('msg_vehicle_verified');
            }

            closeVehicleModal('vehicleConfirmModal');
            
            if (result !== null && result !== false && !result.detail) {
                if (vehicleActionType === 'bulk-verify') {
                    selectedVehicleIds.clear();
                }
                await loadVehiclesData();
                showVehicleAlert(window.t('title_success'), successMessage, true);
            } else {
                const errorMsg = result?.detail || window.t('title_error');
                showVehicleAlert(window.t('title_error'), typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, false);
            }
            
        } catch(e) {
            closeVehicleModal('vehicleConfirmModal');
            showVehicleAlert(window.t('title_error'), e.message || "Error", false);
        }
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        
        vehicleActionId = null;
        vehicleActionType = null;
        
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 7. MODAL OPERATIONS (Add/Edit/View)
    // =================================================================

    function openAddVehicleModal() {
        const editIdEl = getVehicleEl('vehicleEditId');
        const modalTitle = getVehicleEl('vehicleModalTitle');
        const saveBtn = getVehicleEl('btnSaveVehicle');
        
        if (editIdEl) editIdEl.value = "";
        if (modalTitle) modalTitle.innerText = window.t('btn_add_vehicle');
        if (saveBtn) saveBtn.innerHTML = `<i data-lucide="plus" class="w-4 h-4 mr-2"></i> ${window.t('btn_save')}`;
        
        resetVehicleForm();
        populateVehicleDropdowns();
        
        const modal = getVehicleEl('addVehicleModal');
        if (modal) modal.classList.remove('hidden');
        
        setTimeout(() => {
            const firstSelect = getVehicleEl('vehicleMake');
            if (firstSelect) firstSelect.focus();
        }, 100);
        
        if (window.lucide) window.lucide.createIcons();
    }

    function openEditVehicleModal(id) {
        const vehicle = allVehicles.find(v => v.id === id);
        if (!vehicle) return;
        
        if (vehicle.is_verified) {
            showVehicleAlert(window.t('title_warning'), window.t('msg_locked'), false);
            return;
        }

        const editIdEl = getVehicleEl('vehicleEditId');
        const modalTitle = getVehicleEl('vehicleModalTitle');
        const saveBtn = getVehicleEl('btnSaveVehicle');
        
        if (editIdEl) editIdEl.value = vehicle.id;
        if (modalTitle) modalTitle.innerText = window.t('edit');
        if (saveBtn) saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4 mr-2"></i> ${window.t('btn_update')}`;
        
        populateVehicleDropdowns(vehicle);
        
        const setVal = (id, val) => { 
            const el = getVehicleEl(id);
            if (el && val !== null && val !== undefined) {
                el.value = val;
            }
        };
        
        setVal('vehicleYear', vehicle.year);
        setVal('vehiclePlate', vehicle.plate_number);
        setVal('vehicleVin', vehicle.vin);
        setVal('vehicleColor', vehicle.color);
        setVal('vehicleMileage', vehicle.mileage);
        setVal('vehicleEngine', vehicle.engine_size);
        setVal('vehiclePrice', vehicle.purchase_price);
        if (vehicle.purchase_date) setVal('vehicleDate', vehicle.purchase_date.split('T')[0]);

        const modal = getVehicleEl('addVehicleModal');
        if (modal) modal.classList.remove('hidden');
        
        if (window.lucide) window.lucide.createIcons();
    }

    async function saveVehicle() {
        const editIdEl = getVehicleEl('vehicleEditId');
        const id = editIdEl ? editIdEl.value : '';
        
        const getVal = (id) => {
            const el = getVehicleEl(id);
            return el ? el.value.trim() : '';
        };
        
        const getInt = (id) => {
            const el = getVehicleEl(id);
            return el && el.value ? parseInt(el.value) || null : null;
        };
        
        const getFloat = (id) => {
            const el = getVehicleEl(id);
            return el && el.value ? parseFloat(el.value) || null : null;
        };

        const makeId = getInt('vehicleMake');
        const modelId = getInt('vehicleModel');
        const plateNumber = getVal('vehiclePlate');

        // Validation
        const errors = [];
        if (!makeId) errors.push(window.t('msg_validation_make'));
        if (!modelId) errors.push(window.t('msg_validation_model'));
        if (!plateNumber) errors.push(window.t('msg_validation_plate'));
        
        if (errors.length > 0) {
            showVehicleAlert(window.t('validation'), errors.join("<br>"), false);
            return;
        }

        const payload = {
            make: makeId,
            model: modelId,
            year: getInt('vehicleYear'),
            plate_number: plateNumber,
            vin: getVal('vehicleVin'),
            color: getVal('vehicleColor'),
            vehicle_type: getInt('vehicleType'),
            mileage: getFloat('vehicleMileage'),
            engine_size: getFloat('vehicleEngine'),
            vehicle_transmission: getInt('vehicleTrans'),
            vehicle_fuel_type: getInt('vehicleFuel'),
            purchase_price: getFloat('vehiclePrice')
        };

        const dateVal = getVal('vehicleDate');
        if (dateVal) {
            payload.purchase_date = new Date(dateVal).toISOString();
        }

        const btn = getVehicleEl('btnSaveVehicle');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i> ${window.t('loading')}`;

        try {
            let result;
            if (id) {
                result = await window.fetchWithAuth(`/vehicles/${id}`, 'PUT', payload);
            } else {
                result = await window.fetchWithAuth('/vehicles/', 'POST', payload);
            }

            if (result && !result.detail) {
                closeVehicleModal('addVehicleModal');
                await loadVehiclesData();
                showVehicleAlert(window.t('title_success'), window.t('msg_vehicle_saved'), true);
            } else {
                const errorMsg = result?.detail || window.t('title_error');
                showVehicleAlert(window.t('title_error'), typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, false);
            }
        } catch(e) { 
            showVehicleAlert(window.t('title_error'), e.message || "Failed to save vehicle", false); 
        }
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        if (window.lucide) window.lucide.createIcons();
    }

    function viewVehicle(id) {
        const vehicle = allVehicles.find(v => v.id === id);
        if (!vehicle) {
            showVehicleAlert(window.t('title_error'), "Vehicle not found", false);
            return;
        }
        
        const make = getOptionName(vehicleOptions.makes, vehicle.make, 'vehicle_make');
        const model = getOptionName(vehicleOptions.models, vehicle.model, 'vehicle_model');
        const type = getOptionName(vehicleOptions.types, vehicle.vehicle_type, 'vehicle_type');
        const transmission = getOptionName(vehicleOptions.trans, vehicle.vehicle_transmission, 'vehicle_transmission');
        const fuel = getOptionName(vehicleOptions.fuels, vehicle.vehicle_fuel_type, 'fuel_type');
        
        const verifyStatus = vehicle.is_verified 
            ? `<span class="px-2 py-1 rounded text-xs uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20 inline-flex items-center gap-1">
                <i data-lucide="check-circle" class="w-3 h-3"></i> ${window.t('status_verified')}
               </span>`
            : `<span class="px-2 py-1 rounded text-xs uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 inline-flex items-center gap-1">
                <i data-lucide="clock" class="w-3 h-3"></i> ${window.t('status_pending')}
               </span>`;

        // Date formatting
        const createdDate = vehicle.created_at ? new Date(vehicle.created_at).toLocaleString(window.APP_LOCALE) : 'N/A';
        const purchaseDate = vehicle.purchase_date ? new Date(vehicle.purchase_date).toLocaleDateString(window.APP_LOCALE) : 'N/A';

        const content = `
            <div class="space-y-6">
                <div class="flex items-center gap-4 pb-4 border-b border-slate-700">
                    <div class="w-16 h-16 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400 border border-blue-500/20">
                        <i data-lucide="car" class="w-8 h-8"></i>
                    </div>
                    <div>
                        <h4 class="text-xl font-bold text-white">${make} ${model} ${vehicle.year || ''}</h4>
                        <div class="flex items-center gap-3 mt-1">
                            <span class="text-slate-400 font-mono">${vehicle.plate_number || 'No Plate'}</span>
                            <span class="text-slate-500">•</span>
                            ${verifyStatus}
                        </div>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_vin')}</span><span class="text-white font-mono">${vehicle.vin || 'N/A'}</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_color')}</span><span class="text-white">${vehicle.color || 'N/A'}</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_type')}</span><span class="text-white">${type || 'N/A'}</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('col_status')}</span><span class="text-white capitalize">${vehicle.status ? vehicle.status.replace('_', ' ') : 'N/A'}</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_mileage')}</span><span class="text-white">${vehicle.mileage ? vehicle.mileage.toLocaleString() : 0} km</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_engine')}</span><span class="text-white">${vehicle.engine_size || 'N/A'}L</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_transmission')}</span><span class="text-white">${transmission || 'N/A'}</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_fuel_type')}</span><span class="text-white">${fuel || 'N/A'}</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_purchase_price')}</span><span class="text-white">${vehicle.purchase_price ? 'BIF ' + vehicle.purchase_price.toFixed(2) : 'N/A'}</span></div>
                    <div><span class="text-xs text-slate-500 uppercase block mb-1">${window.t('lbl_purchase_date')}</span><span class="text-white">${purchaseDate}</span></div>
                </div>
                
                <div class="border-t border-slate-700 pt-4 text-xs text-slate-500">
                    <div class="flex justify-between">
                        <span>ID:</span>
                        <span class="text-slate-400">#${vehicle.id}</span>
                    </div>
                    <div class="flex justify-between mt-1">
                        <span>${window.t('col_created')}:</span>
                        <span class="text-slate-400">${createdDate}</span>
                    </div>
                </div>
            </div>
        `;
        
        const viewContent = getVehicleEl('viewVehicleContent');
        if (viewContent) viewContent.innerHTML = content;
        
        const modal = getVehicleEl('viewVehicleModal');
        if (modal) modal.classList.remove('hidden');
        
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 8. HELPER MODAL FUNCTIONS
    // =================================================================

    function showVehicleConfirmModal(title, message, icon, color) {
        const modal = getVehicleEl('vehicleConfirmModal');
        if (!modal) {
            if (confirm(title + ": " + message)) executeVehicleConfirmAction();
            return;
        }
        
        const titleEl = getVehicleEl('vehicleConfirmTitle');
        const messageEl = getVehicleEl('vehicleConfirmMessage');
        
        if (titleEl) titleEl.innerText = title;
        if (messageEl) messageEl.innerHTML = message;
        
        const btn = getVehicleEl('btnVehicleConfirmAction');
        if (btn) {
            btn.className = `px-4 py-2.5 text-white rounded-lg text-sm w-full font-medium transition-all duration-200 ${color} hover:opacity-90`;
        }
        
        // Update icon
        const iconDiv = getVehicleEl('vehicleConfirmIcon');
        if (iconDiv) {
            const textColor = color === 'bg-red-600' ? 'text-red-500' :
                             color === 'bg-green-600' ? 'text-green-500' : 'text-emerald-500';
            iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${textColor} bg-opacity-20 border border-current/20`;
            iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
        }
        
        modal.classList.remove('hidden');
        if (window.lucide) window.lucide.createIcons();
    }

    function showVehicleAlert(title, message, isSuccess) {
        const modal = getVehicleEl('vehicleAlertModal');
        
        if (!modal) {
            alert(`${title}: ${message}`);
            return;
        }
        
        const titleEl = getVehicleEl('vehicleAlertTitle');
        const messageEl = getVehicleEl('vehicleAlertMessage');
        
        if (titleEl) titleEl.innerText = title;
        if (messageEl) messageEl.innerHTML = message;
        
        const iconDiv = getVehicleEl('vehicleAlertIcon');
        if (iconDiv) {
            if (isSuccess) {
                iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
                iconDiv.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6"></i>';
            } else {
                iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/10 text-red-500 border border-red-500/20";
                iconDiv.innerHTML = '<i data-lucide="alert-circle" class="w-6 h-6"></i>';
            }
        }
        
        const okBtn = modal.querySelector('button');
        if (okBtn) {
            okBtn.className = isSuccess 
                ? "px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm w-full font-medium transition"
                : "px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm w-full font-medium transition";
        }
        
        modal.classList.remove('hidden');
        
        if (isSuccess) {
            setTimeout(() => {
                if (!modal.classList.contains('hidden')) {
                    modal.classList.add('hidden');
                }
            }, 3000);
        }
        
        if (window.lucide) window.lucide.createIcons();
    }

    function resetVehicleForm() {
        ['vehicleYear','vehiclePlate','vehicleVin','vehicleColor','vehicleMileage','vehicleEngine','vehiclePrice','vehicleDate'].forEach(id => {
            const el = getVehicleEl(id);
            if (el) el.value = "";
        });
    }

    function populateVehicleDropdowns(selectedV = null) {
        populateSelect('vehicleMake', vehicleOptions.makes, selectedV?.make, 'vehicle_make', window.t('lbl_make') || 'Make');
        populateSelect('vehicleModel', vehicleOptions.models, selectedV?.model, 'vehicle_model', window.t('lbl_model') || 'Model');
        populateSelect('vehicleType', vehicleOptions.types, selectedV?.vehicle_type, 'vehicle_type', window.t('lbl_type') || 'Type');
        populateSelect('vehicleTrans', vehicleOptions.trans, selectedV?.vehicle_transmission, 'vehicle_transmission', window.t('lbl_transmission') || 'Transmission');
        populateSelect('vehicleFuel', vehicleOptions.fuels, selectedV?.vehicle_fuel_type, 'fuel_type', window.t('lbl_fuel_type') || 'Fuel');
    }

    // =================================================================
    // 9. EXPORT FUNCTIONS
    // =================================================================

    function exportVehiclesExcel() {
        showVehicleAlert("Info", "Excel export feature coming soon!", false);
    }

    function exportVehiclesPDF() {
        showVehicleAlert("Info", "PDF export feature coming soon!", false);
    }

    // =================================================================
    // 10. MODULE EXPORT
    // =================================================================

    window.vehiclesModule = {
        init: initVehicles,
        destroy: function() {
            // Clean up event listeners
            const searchInput = getVehicleEl('vehicleSearch');
            const statusFilter = getVehicleEl('vehicleStatusFilter');
            const selectAllCheckbox = getVehicleEl('selectAllVehicles');
            const confirmBtn = getVehicleEl('btnVehicleConfirmAction');
            const saveBtn = getVehicleEl('btnSaveVehicle');
            const bulkVerifyBtn = getVehicleEl('btnVehicleBulkVerify');
            const exportExcelBtn = getVehicleEl('exportExcelBtn');
            const exportPdfBtn = getVehicleEl('exportPdfBtn');
            const themeToggle = getVehicleEl('theme-toggle-header');
            
            if (searchInput) searchInput.removeEventListener('input', renderVehiclesTable);
            if (statusFilter) statusFilter.removeEventListener('change', renderVehiclesTable);
            if (selectAllCheckbox) selectAllCheckbox.removeEventListener('change', toggleVehicleSelectAll);
            if (confirmBtn) confirmBtn.removeEventListener('click', executeVehicleConfirmAction);
            if (saveBtn) saveBtn.removeEventListener('click', saveVehicle);
            if (bulkVerifyBtn) bulkVerifyBtn.removeEventListener('click', reqVehicleBulkVerify);
            if (exportExcelBtn) exportExcelBtn.removeEventListener('click', exportVehiclesExcel);
            if (exportPdfBtn) exportPdfBtn.removeEventListener('click', exportVehiclesPDF);
            if (themeToggle) themeToggle.removeEventListener('click', toggleVehicleTheme);

            // Remove modal close listeners
            const closeButtons = document.querySelectorAll('[data-close-modal]');
            closeButtons.forEach(btn => {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
            });

            // Clear data
            allVehicles = [];
            vehicleOptions = { makes: [], models: [], types: [], trans: [], fuels: [] };
            selectedVehicleIds.clear();
            vehicleActionType = null;
            vehicleActionId = null;

            console.log("Vehicles module cleaned up");
        },
        refresh: function() {
            loadInitialVehiclesData();
        },
        // Public API methods
        toggleVehicleRow: toggleVehicleRow,
        reqVehicleBulkVerify: reqVehicleBulkVerify,
        reqVehicleVerify: reqVehicleVerify,
        reqVehicleDelete: reqVehicleDelete,
        viewVehicle: viewVehicle,
        openEditVehicleModal: openEditVehicleModal,
        openAddVehicleModal: openAddVehicleModal,
        saveVehicle: saveVehicle,
        closeModal: closeVehicleModal,
        exportVehiclesExcel: exportVehiclesExcel,
        exportVehiclesPDF: exportVehiclesPDF
    };

    // Auto-initialize if vehicles is loaded directly
    if (document.readyState === 'complete' && window.location.hash === '#vehicles') {
        setTimeout(() => {
            if (window.vehiclesModule && typeof window.vehiclesModule.init === 'function') {
                window.vehiclesModule.init();
            }
        }, 100);
    }

    console.log('Vehicles module loaded');
})();