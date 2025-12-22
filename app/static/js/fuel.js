// app/static/js/fuel.js

let allFuelLogs = [];
let fuelOptions = { vehicles: [], fuelTypes: [] };
let currentUserRole = 'user';
let selectedFuelIds = new Set(); 

// --- ACTION STATE VARIABLES ---
let fuelActionType = null; 
let fuelActionId = null;

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

async function initFuel() {
    console.log("Fuel Module: Init");
    currentUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // Listeners
    const searchInput = getFuelEl('fuelSearch');
    const vehicleFilter = getFuelEl('fuelVehicleFilter');
    const statusFilter = getFuelEl('fuelStatusFilter');
    const selectAllCheckbox = getFuelEl('selectAllFuel');
    
    if(searchInput) searchInput.addEventListener('input', renderFuelTable);
    if(vehicleFilter) vehicleFilter.addEventListener('change', renderFuelTable);
    if(statusFilter) statusFilter.addEventListener('change', renderFuelTable);
    if(selectAllCheckbox) selectAllCheckbox.addEventListener('change', toggleFuelSelectAll);

    // Modal listeners
    const qtyInput = getFuelEl('fuelQuantity');
    const priceInput = getFuelEl('fuelPrice');
    const vehicleSelect = getFuelEl('fuelVehicleSelect');
    
    // Confirm Button Listener
    const confirmBtn = getFuelEl('btnFuelConfirmAction');

    if(qtyInput) qtyInput.addEventListener('input', updateCostPreview);
    if(priceInput) priceInput.addEventListener('input', updateCostPreview);
    if(vehicleSelect) vehicleSelect.addEventListener('change', autoSelectFuelType);
    
    if(confirmBtn) {
        confirmBtn.addEventListener('click', executeFuelConfirmAction);
    } else {
        console.error("Critical: btnFuelConfirmAction not found in HTML");
    }

    await Promise.all([loadFuelData(), fetchFuelDropdowns()]);
}

async function loadFuelData() {
    const tbody = getFuelEl('fuelLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading logs...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    // FIX: Added trailing slash
    const data = await window.fetchWithAuth('/fuel/'); 
    
    // Handle pagination or list response
    const items = data.items || data;
    
    if (Array.isArray(items)) {
        allFuelLogs = items;
        selectedFuelIds.clear(); 
        updateFuelBulkUI();
        renderFuelTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load logs.";
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchFuelDropdowns() {
    try {
        // FIX: Added trailing slashes
        const [vehicles, types] = await Promise.all([
            window.fetchWithAuth('/vehicles/?limit=1000'),
            window.fetchWithAuth('/fuel-types/')
        ]);
        
        // Handle pagination
        fuelOptions.vehicles = Array.isArray(vehicles) ? vehicles : (vehicles.items || []);
        fuelOptions.fuelTypes = Array.isArray(types) ? types : (types.items || []);
        
        populateSelect('fuelVehicleFilter', fuelOptions.vehicles, '', 'plate_number', 'All Vehicles');
        populateSelect('fuelVehicleSelect', fuelOptions.vehicles, '', 'plate_number', 'Select Vehicle');
        populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', 'Select Type');
        
    } catch (e) { 
        console.warn("Fuel Dropdown Error:", e); 
    }
}

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
    if (countEl) countEl.innerText = `${filtered.length} logs found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">No fuel logs found.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);

    tbody.innerHTML = filtered.map(log => {
        const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
        const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const typeName = type ? type.fuel_type : '-';
        const date = new Date(log.created_at).toLocaleDateString();
        
        const statusBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedFuelIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleFuelRow(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
        }

        let actionButtons = '';
        const viewBtn = `<button onclick="openViewFuelModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (log.is_verified) {
            actionButtons = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed" title="Locked"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
        } else if (canManage) {
            actionButtons = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqFuelVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditFuelModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="reqFuelDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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
    
    if(window.lucide) window.lucide.createIcons();
}

// === BULK LOGIC ===

window.toggleFuelRow = function(id) {
    if (selectedFuelIds.has(id)) {
        selectedFuelIds.delete(id);
    } else {
        selectedFuelIds.add(id);
    }
    updateFuelBulkUI();
}

window.toggleFuelSelectAll = function() {
    const mainCheck = getFuelEl('selectAllFuel');
    if (!mainCheck) return;
    
    const isChecked = mainCheck.checked;
    selectedFuelIds.clear();
    
    if (isChecked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
        allFuelLogs.forEach(log => {
             if(canManage && !log.is_verified) selectedFuelIds.add(log.id);
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

window.executeFuelBulkVerify = async function() {
    if (selectedFuelIds.size === 0) return;
    
    fuelActionType = 'bulk-verify';
    fuelActionId = null;
    showFuelConfirmModal("Verify Selected?", `Verify ${selectedFuelIds.size} records? This cannot be undone.`, "check-circle", "bg-emerald-600");
}

// === ACTIONS (Single) ===

window.reqFuelVerify = function(id) {
    fuelActionType = 'verify';
    fuelActionId = id;
    showFuelConfirmModal('Verify Record?', 'Once verified, this record cannot be edited or deleted.', 'check-circle', 'bg-green-600');
}

window.reqFuelDelete = function(id) {
    fuelActionType = 'delete';
    fuelActionId = id;
    showFuelConfirmModal('Delete Record?', 'This action is permanent.', 'trash-2', 'bg-red-600');
}

async function executeFuelConfirmAction() {
    const btn = getFuelEl('btnFuelConfirmAction');
    if (!btn) return;
    
    btn.disabled = true; 
    btn.innerText = "Processing...";

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

        window.closeModal('fuelConfirmModal');
        
        if (result !== null && result !== false) {
            if (fuelActionType === 'bulk-verify') selectedFuelIds.clear();
            await loadFuelData();
            showFuelAlert("Success", "Action completed successfully.", true);
        } else {
            showFuelAlert("Failed", "Action could not be completed.", false);
        }
    } catch(e) {
        window.closeModal('fuelConfirmModal');
        showFuelAlert("Error", e.message || "An unexpected error occurred.", false);
    }
    
    btn.disabled = false; 
    btn.innerText = "Confirm"; 
    fuelActionId = null; 
    fuelActionType = null;
}

// === ADD/EDIT/VIEW MODALS ===

window.openAddFuelModal = function() {
    const editIdEl = getFuelEl('fuelEditId');
    const modalTitle = getFuelEl('fuelModalTitle');
    const saveBtn = getFuelEl('btnSaveFuel');
    
    if (editIdEl) editIdEl.value = ""; 
    if (modalTitle) modalTitle.innerText = "Add Fuel Log";
    if (saveBtn) saveBtn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> Add Log`;
    
    populateSelect('fuelVehicleSelect', fuelOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    
    const qtyEl = getFuelEl('fuelQuantity');
    const priceEl = getFuelEl('fuelPrice');
    const costPreview = getFuelEl('costPreview');
    
    if (qtyEl) qtyEl.value = "";
    if (priceEl) priceEl.value = "";
    if (costPreview) costPreview.classList.add('hidden');
    
    const modal = getFuelEl('addFuelModal');
    if (modal) modal.classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons();
}

window.openEditFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if(!log) return;
    
    const editIdEl = getFuelEl('fuelEditId');
    const modalTitle = getFuelEl('fuelModalTitle');
    const saveBtn = getFuelEl('btnSaveFuel');
    
    if (editIdEl) editIdEl.value = log.id; 
    if (modalTitle) modalTitle.innerText = "Edit Fuel Log";
    if (saveBtn) saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Save Changes`;

    populateSelect('fuelVehicleSelect', fuelOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, log.fuel_type_id, 'fuel_type', 'Select Type');
    
    const qtyEl = getFuelEl('fuelQuantity');
    const priceEl = getFuelEl('fuelPrice');
    
    if (qtyEl) qtyEl.value = log.quantity || '';
    if (priceEl) priceEl.value = log.price_little || '';
    
    updateCostPreview();

    const modal = getFuelEl('addFuelModal');
    if (modal) modal.classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons();
}

window.saveFuelLog = async function() {
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

    if(!vId || !typeId || !qty || !price) { 
        showFuelAlert("Validation", "Please fill all required fields.", false); 
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
    
    btn.innerHTML = "Saving...";
    btn.disabled = true;

    try {
        let result;
        if(id) {
            result = await window.fetchWithAuth(`/fuel/${id}`, 'PUT', payload);
        } else {
            // FIX: Added trailing slash
            result = await window.fetchWithAuth('/fuel/', 'POST', payload);
        }

        if(result && !result.detail) {
            window.closeModal('addFuelModal');
            await loadFuelData();
            showFuelAlert("Success", "Saved successfully.", true);
        } else {
            const msg = result?.detail ? JSON.stringify(result.detail) : "Failed to save.";
            showFuelAlert("Error", msg, false);
        }
    } catch(e) {
        showFuelAlert("System Error", e.message || "Failed to save fuel log.", false);
    }
    
    btn.disabled = false;
    btn.innerHTML = id ? `<i data-lucide="save" class="w-4 h-4"></i> Save Changes` : `<i data-lucide="plus" class="w-4 h-4"></i> Add Log`;
    if(window.lucide) window.lucide.createIcons();
}

window.openViewFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if (!log) return;
    const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
    const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);

    const content = `
        <div class="grid grid-cols-2 gap-y-4">
            <div><span class="text-slate-500 text-xs uppercase block">Vehicle</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : log.vehicle_id}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Fuel Type</span><span class="text-white">${type ? type.fuel_type : '-'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Quantity</span><span class="text-white">${log.quantity ? log.quantity.toFixed(2) : '0.00'} L</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Price/Unit</span><span class="text-white">${log.price_little ? log.price_little.toFixed(2) : '0.00'}</span></div>
            <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                <span class="text-slate-500 text-xs uppercase">Total Cost</span>
                <span class="text-emerald-400 font-bold text-lg">BIF ${log.cost ? log.cost.toFixed(2) : '0.00'}</span>
            </div>
            <div class="col-span-2 text-xs text-slate-600 text-center mt-2">
                Date: ${log.created_at ? new Date(log.created_at).toLocaleDateString() : 'N/A'}
            </div>
        </div>
    `;
    
    const viewContent = getFuelEl('viewFuelContent');
    if (viewContent) viewContent.innerHTML = content;
    
    const modal = getFuelEl('viewFuelModal');
    if (modal) modal.classList.remove('hidden');
}

// === HELPER FUNCTIONS ===

window.closeModal = function(id) { 
    const modal = getFuelEl(id) || document.getElementById(id);
    if (modal) modal.classList.add('hidden'); 
}

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
    
    if(window.lucide) window.lucide.createIcons();
}

// FIXED: Use the existing fuelAlertModal with isSuccess parameter
function showFuelAlert(title, message, isSuccess) {
    const modal = getFuelEl('fuelAlertModal');
    if(!modal) { 
        // Fallback to browser alert if modal doesn't exist
        alert(`${title}: ${message}`);
        return; 
    }
    
    const titleEl = getFuelEl('fuelAlertTitle');
    const messageEl = getFuelEl('fuelAlertMessage');
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerText = message;
    
    const iconDiv = getFuelEl('fuelAlertIcon');
    if(iconDiv) {
        if(isSuccess) {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-green-500/10 text-green-500";
            iconDiv.innerHTML = '<i data-lucide="check" class="w-6 h-6"></i>';
        } else {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/10 text-red-500";
            iconDiv.innerHTML = '<i data-lucide="x" class="w-6 h-6"></i>';
        }
    }
    
    modal.classList.remove('hidden');
    
    // Auto close after appropriate time
    const closeTime = isSuccess ? 3000 : 5000; // 3 seconds for success, 5 for errors
    setTimeout(() => {
        modal.classList.add('hidden');
    }, closeTime);
    
    if(window.lucide) window.lucide.createIcons();
}

function autoSelectFuelType() {
    const vIdEl = getFuelEl('fuelVehicleSelect');
    const typeSelect = getFuelEl('fuelTypeSelect');
    
    if (!vIdEl || !typeSelect) return;
    
    const vId = vIdEl.value;
    
    if(!vId) { 
        typeSelect.innerHTML = '<option value="">Select Vehicle First</option>'; 
        return; 
    }
    
    const vehicle = fuelOptions.vehicles.find(v => v.id == vId);
    if(vehicle && vehicle.vehicle_fuel_type) {
        const type = fuelOptions.fuelTypes.find(t => t.id === vehicle.vehicle_fuel_type);
        if(type) {
            typeSelect.innerHTML = `<option value="${type.id}" selected>${type.fuel_type}</option>`;
        } else {
            populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', 'Select Type');
        }
    } else {
        populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', 'Select Type');
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
    
    if(total > 0) {
        preview.classList.remove('hidden');
        totalCostDisplay.innerText = `BIF ${total.toFixed(2)}`;
    } else {
        preview.classList.add('hidden');
    }
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

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initFuel);
} else {
    initFuel();
}