// app/static/js/fuel.js

let allFuelLogs = [];
let fuelOptions = { vehicles: [], fuelTypes: [] };
let currentUserRole = 'user';
let selectedFuelIds = new Set(); // Stores IDs for bulk action

// Confirm Action State
let pendingActionType = null;
let pendingActionId = null;

async function initFuel() {
    console.log("Fuel Module: Init");
    currentUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // Listeners
    const searchInput = document.getElementById('fuelSearch');
    const vehicleFilter = document.getElementById('fuelVehicleFilter');
    const statusFilter = document.getElementById('fuelStatusFilter');
    const selectAllCheckbox = document.getElementById('selectAllFuel');
    
    if(searchInput) searchInput.addEventListener('input', renderFuelTable);
    if(vehicleFilter) vehicleFilter.addEventListener('change', renderFuelTable);
    if(statusFilter) statusFilter.addEventListener('change', renderFuelTable);
    if(selectAllCheckbox) selectAllCheckbox.addEventListener('change', toggleSelectAll);

    // Modal listeners
    const qtyInput = document.getElementById('fuelQuantity');
    const priceInput = document.getElementById('fuelPrice');
    const vehicleSelect = document.getElementById('fuelVehicleSelect');
    const confirmBtn = document.getElementById('btnConfirmAction');

    if(qtyInput) qtyInput.addEventListener('input', updateCostPreview);
    if(priceInput) priceInput.addEventListener('input', updateCostPreview);
    if(vehicleSelect) vehicleSelect.addEventListener('change', autoSelectFuelType);
    if(confirmBtn) confirmBtn.addEventListener('click', executeConfirmAction);

    await Promise.all([loadFuelData(), fetchFuelDropdowns()]);
}

async function loadFuelData() {
    const tbody = document.getElementById('fuelLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading logs...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    const data = await window.fetchWithAuth('/fuel'); 
    
    if (Array.isArray(data)) {
        allFuelLogs = data;
        selectedFuelIds.clear(); // Reset selection on reload
        updateBulkUI();
        renderFuelTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load logs.";
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchFuelDropdowns() {
    try {
        const [vehicles, types] = await Promise.all([
            window.fetchWithAuth('/vehicles?limit=1000'),
            window.fetchWithAuth('/fuel-types')
        ]);
        if(Array.isArray(vehicles)) fuelOptions.vehicles = vehicles;
        if(Array.isArray(types)) fuelOptions.fuelTypes = types;
        populateSelect('fuelVehicleFilter', fuelOptions.vehicles, '', 'plate_number', 'All Vehicles');
    } catch (e) { console.warn("Fuel Dropdown Error:", e); }
}

function renderFuelTable() {
    const tbody = document.getElementById('fuelLogsBody');
    if (!tbody) return;

    const search = document.getElementById('fuelSearch').value.toLowerCase();
    const vFilter = document.getElementById('fuelVehicleFilter').value;
    const sFilter = document.getElementById('fuelStatusFilter').value;

    let filtered = allFuelLogs.filter(log => {
        const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const matchesSearch = plate.includes(search);
        const matchesVehicle = vFilter === "" || log.vehicle_id == vFilter;
        let matchesStatus = true;
        if (sFilter === 'verified') matchesStatus = log.is_verified === true;
        if (sFilter === 'pending') matchesStatus = log.is_verified !== true;
        return matchesSearch && matchesVehicle && matchesStatus;
    });

    document.getElementById('fuelLogsCount').innerText = `${filtered.length} logs found`;

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

        // Checkbox logic: Only show if user can manage AND it's not yet verified
        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedFuelIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleRowSelection(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
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
                    <button onclick="requestVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditFuelModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="requestDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
            actionButtons = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/5 transition border-b border-slate-700/30 group">
                <td class="p-4 text-center">${checkboxHtml}</td>
                <td class="p-4 font-mono text-white">${plate}</td>
                <td class="p-4 text-slate-400">${typeName}</td>
                <td class="p-4 text-right"><div class="text-slate-200">${log.quantity.toFixed(2)} L</div><div class="text-xs text-slate-500">@ ${log.price_little}</div></td>
                <td class="p-4 text-right font-bold text-emerald-400">${log.cost.toFixed(2)}</td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-slate-500 text-xs">${date}</td>
                <td class="p-4 text-right">${actionButtons}</td>
            </tr>
        `;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// === SELECTION LOGIC ===

window.toggleRowSelection = function(id) {
    if (selectedFuelIds.has(id)) {
        selectedFuelIds.delete(id);
    } else {
        selectedFuelIds.add(id);
    }
    updateBulkUI();
}

window.toggleSelectAll = function() {
    const checkboxes = document.querySelectorAll('#fuelLogsBody input[type="checkbox"]:not(:disabled)');
    const mainCheck = document.getElementById('selectAllFuel');
    const isChecked = mainCheck.checked;

    checkboxes.forEach(cb => {
        cb.checked = isChecked;
        // Extract ID from the onclick attribute or parent row
        // Since I bound onclick="toggleRowSelection(ID)", let's rely on the Set logic manually here
        // to be cleaner, let's reset the Set and fill it if checked
    });

    selectedFuelIds.clear();
    if (isChecked) {
        // Find all selectable IDs in current view
        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
        allFuelLogs.forEach(log => {
             // Respect current filters if you want, but for simplicity, let's select visible unverified ones
             if(canManage && !log.is_verified) selectedFuelIds.add(log.id);
        });
    }
    // Re-render to sync visual state properly
    renderFuelTable();
    updateBulkUI();
}

function updateBulkUI() {
    const btn = document.getElementById('btnBulkVerify');
    const countSpan = document.getElementById('selectedCount');
    if (!btn) return;

    countSpan.innerText = selectedFuelIds.size;
    if (selectedFuelIds.size > 0) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

// === BULK ACTION ===

window.executeBulkVerify = async function() {
    if (selectedFuelIds.size === 0) return;
    
    if(!confirm(`Verify ${selectedFuelIds.size} records? This cannot be undone.`)) return;

    const btn = document.getElementById('btnBulkVerify');
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...`;
    btn.disabled = true;
    if(window.lucide) window.lucide.createIcons();

    try {
        const payload = { ids: Array.from(selectedFuelIds) };
        const result = await window.fetchWithAuth('/fuel/verify-bulk', 'PUT', payload);
        
        if (result && !result.detail) {
            selectedFuelIds.clear();
            await loadFuelData();
            // alert("Batch verification successful.");
        } else {
            alert("Error: " + (result?.detail || "Unknown"));
        }
    } catch (e) {
        alert("System Error: " + e.message);
    }
}

// === EXISTING ACTIONS (Verify, Edit, Delete) ===

window.requestVerify = function(id) {
    pendingActionType = 'verify';
    pendingActionId = id;
    showConfirmModal('Verify Record?', 'Once verified, this record cannot be edited or deleted.', 'check-circle', 'bg-green-600');
}

window.requestDelete = function(id) {
    pendingActionType = 'delete';
    pendingActionId = id;
    showConfirmModal('Delete Record?', 'This action is permanent.', 'trash-2', 'bg-red-600');
}

function showConfirmModal(title, msg, icon, btnClass) {
    document.getElementById('confirmTitle').innerText = title;
    document.getElementById('confirmMessage').innerText = msg;
    
    const iconDiv = document.getElementById('confirmIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${btnClass.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
    iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    
    const btn = document.getElementById('btnConfirmAction');
    btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${btnClass} hover:opacity-90`;
    
    document.getElementById('confirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

async function executeConfirmAction() {
    if(!pendingActionId) return;
    const btn = document.getElementById('btnConfirmAction');
    btn.disabled = true;
    btn.innerText = "Processing...";

    try {
        let result;
        if (pendingActionType === 'delete') {
            result = await window.fetchWithAuth(`/fuel/${pendingActionId}`, 'DELETE');
        } else if (pendingActionType === 'verify') {
            result = await window.fetchWithAuth(`/fuel/${pendingActionId}`, 'PUT', { is_verified: true });
        }

        window.closeModal('confirmModal');
        if (result !== null || pendingActionType === 'delete') {
            await loadFuelData(); 
        } else {
            alert("Action failed.");
        }
    } catch(e) {
        window.closeModal('confirmModal');
        alert("Error: " + e.message);
    }
    btn.disabled = false;
    btn.innerText = "Confirm";
    pendingActionId = null;
}

// === ADD/EDIT/VIEW MODALS ===
// (Same as before, ensure openAddFuelModal, openEditFuelModal, saveFuelLog, closeFuelModal, openViewFuelModal exist here)
// ... [Paste the remaining functions from previous working version here] ...

window.openAddFuelModal = function() {
    document.getElementById('fuelEditId').value = ""; 
    document.getElementById('fuelModalTitle').innerText = "Add Fuel Log";
    document.getElementById('btnSaveFuel').innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> Add Log`;
    
    populateSelect('fuelVehicleSelect', fuelOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    document.getElementById('fuelQuantity').value = "";
    document.getElementById('fuelPrice').value = "";
    document.getElementById('costPreview').classList.add('hidden');
    document.getElementById('addFuelModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if(!log) return;
    document.getElementById('fuelEditId').value = log.id; 
    document.getElementById('fuelModalTitle').innerText = "Edit Fuel Log";
    document.getElementById('btnSaveFuel').innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Save Changes`;
    populateSelect('fuelVehicleSelect', fuelOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    document.getElementById('fuelQuantity').value = log.quantity;
    document.getElementById('fuelPrice').value = log.price_little;
    autoSelectFuelType();
    updateCostPreview();
    document.getElementById('addFuelModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveFuelLog = async function() {
    const id = document.getElementById('fuelEditId').value;
    const vId = document.getElementById('fuelVehicleSelect').value;
    const typeId = document.getElementById('fuelTypeSelect').value;
    const qty = document.getElementById('fuelQuantity').value;
    const price = document.getElementById('fuelPrice').value;

    if(!vId || !qty || !price) { alert("Please fill all fields."); return; }

    const payload = {
        vehicle_id: parseInt(vId),
        fuel_type_id: parseInt(typeId),
        quantity: parseFloat(qty),
        price_little: parseFloat(price)
    };

    const btn = document.getElementById('btnSaveFuel');
    btn.innerHTML = "Saving...";
    btn.disabled = true;

    try {
        let result;
        if(id) {
            result = await window.fetchWithAuth(`/fuel/${id}`, 'PUT', payload);
        } else {
            result = await window.fetchWithAuth('/fuel', 'POST', payload);
        }

        if(result && !result.detail) {
            window.closeModal('addFuelModal');
            await loadFuelData();
        } else {
            alert("Error: " + (result?.detail || "Failed"));
        }
    } catch(e) {
        alert("System Error: " + e.message);
    }
    btn.disabled = false;
}

window.openViewFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if (!log) return;
    const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
    const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);

    const content = `
        <div class="grid grid-cols-2 gap-y-4">
            <div><span class="text-slate-500 text-xs uppercase block">Vehicle</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : log.vehicle_id}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Fuel Type</span><span class="text-white">${type ? type.fuel_type : log.fuel_type_id}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Quantity</span><span class="text-white">${log.quantity} L</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Price/Unit</span><span class="text-white">${log.price_little}</span></div>
            <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                <span class="text-slate-500 text-xs uppercase">Total Cost</span>
                <span class="text-emerald-400 font-bold text-lg">${log.cost.toFixed(2)}</span>
            </div>
        </div>
    `;
    document.getElementById('viewFuelContent').innerHTML = content;
    document.getElementById('viewFuelModal').classList.remove('hidden');
}

window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }

function autoSelectFuelType() {
    const vId = document.getElementById('fuelVehicleSelect').value;
    const typeSelect = document.getElementById('fuelTypeSelect');
    if(!vId) { typeSelect.innerHTML = "<option>Select a vehicle first</option>"; return; }
    const vehicle = fuelOptions.vehicles.find(v => v.id == vId);
    if(vehicle && vehicle.vehicle_fuel_type) {
        const type = fuelOptions.fuelTypes.find(t => t.id === vehicle.vehicle_fuel_type);
        typeSelect.innerHTML = type ? `<option value="${type.id}" selected>${type.fuel_type}</option>` : `<option disabled>Unknown</option>`;
    }
}

function updateCostPreview() {
    const qty = parseFloat(document.getElementById('fuelQuantity').value) || 0;
    const price = parseFloat(document.getElementById('fuelPrice').value) || 0;
    const total = qty * price;
    const preview = document.getElementById('costPreview');
    if(total > 0) {
        preview.classList.remove('hidden');
        document.getElementById('totalCostDisplay').innerText = `BIF ${total.toFixed(2)}`;
    } else {
        preview.classList.add('hidden');
    }
}

function populateSelect(elementId, items, selectedValue, labelKey, defaultText) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = `<option value="">${defaultText}</option>` + items.map(item => {
        const isSelected = item.id === selectedValue ? 'selected' : '';
        const label = item[labelKey] || item.name || item.id; 
        return `<option value="${item.id}" ${isSelected}>${label}</option>`;
    }).join('');
}