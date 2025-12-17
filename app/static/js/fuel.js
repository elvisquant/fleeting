// app/static/js/fuel.js

let allFuelLogs = [];
let fuelOptions = { vehicles: [], fuelTypes: [] };
let currentUserRole = 'user';
let selectedFuelIds = new Set(); 

// --- ACTION STATE VARIABLES ---
let fuelActionType = null; 
let fuelActionId = null;

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
    if(selectAllCheckbox) selectAllCheckbox.addEventListener('change', toggleFuelSelectAll);

    // Modal listeners
    const qtyInput = document.getElementById('fuelQuantity');
    const priceInput = document.getElementById('fuelPrice');
    const vehicleSelect = document.getElementById('fuelVehicleSelect');
    
    // Confirm Button Listener
    const confirmBtn = document.getElementById('btnFuelConfirmAction');

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
    const tbody = document.getElementById('fuelLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading logs...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    const data = await window.fetchWithAuth('/fuel'); 
    
    if (Array.isArray(data)) {
        allFuelLogs = data;
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
    const mainCheck = document.getElementById('selectAllFuel');
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
    const btn = document.getElementById('btnFuelBulkVerify');
    const countSpan = document.getElementById('fuelSelectedCount');
    if (!btn) return;

    countSpan.innerText = selectedFuelIds.size;
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
    const btn = document.getElementById('btnFuelConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";

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
        
        if (result !== null) {
            if (fuelActionType === 'bulk-verify') selectedFuelIds.clear();
            await loadFuelData();
            showFuelAlert("Success", "Action completed successfully.", true);
        } else {
            showFuelAlert("Failed", "Action could not be completed.", false);
        }
    } catch(e) {
        window.closeModal('fuelConfirmModal');
        showFuelAlert("Error", e.message, false);
    }
    
    btn.disabled = false; btn.innerText = "Confirm"; 
    fuelActionId = null; fuelActionType = null;
}

// === ADD/EDIT/VIEW MODALS ===

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

    if(!vId || !qty || !price) { 
        showFuelAlert("Validation", "Please fill all fields.", false); 
        return; 
    }

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
            showFuelAlert("Success", "Saved successfully.", true);
        } else {
            showFuelAlert("Error", result?.detail || "Failed", false);
        }
    } catch(e) {
        showFuelAlert("System Error", e.message, false);
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

// Helpers
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }

function showFuelConfirmModal(title, msg, icon, btnClass) {
    document.getElementById('fuelConfirmTitle').innerText = title;
    document.getElementById('fuelConfirmMessage').innerText = msg;
    const iconDiv = document.getElementById('fuelConfirmIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${btnClass.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
    iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    const btn = document.getElementById('btnFuelConfirmAction');
    btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${btnClass} hover:opacity-90`;
    document.getElementById('fuelConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showFuelAlert(title, message, isSuccess) {
    const modal = document.getElementById('fuelAlertModal');
    if(!modal) { alert(message); return; }
    document.getElementById('fuelAlertTitle').innerText = title;
    document.getElementById('fuelAlertMessage').innerText = message;
    
    const iconDiv = document.getElementById('fuelAlertIcon');
    if(isSuccess) {
        iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-green-500/10 text-green-500";
        iconDiv.innerHTML = '<i data-lucide="check" class="w-6 h-6"></i>';
    } else {
        iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/10 text-red-500";
        iconDiv.innerHTML = '<i data-lucide="x" class="w-6 h-6"></i>';
    }
    
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

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