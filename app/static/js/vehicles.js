// app/static/js/vehicles.js

// Global State
let allVehicles = [];
let vehicleOptions = { makes: [], models: [], types: [], trans: [], fuels: [] };
let vehicleUserRole = 'user';
let vehicleActionType = null; 
let vehicleActionId = null;
let selectedVehicleIds = new Set();

// =================================================================
// 1. INITIALIZATION - FIXED
// =================================================================
async function initVehicles() {
    console.log("Vehicles Module: Init");
    vehicleUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // Attach Listeners
    const searchInput = document.getElementById('vehicleSearch');
    const statusFilter = document.getElementById('vehicleStatusFilter');
    const selectAll = document.getElementById('selectAllVehicles');
    const confirmBtn = document.getElementById('btnVehicleConfirmAction');
    const bulkBtn = document.getElementById('btnVehicleBulkVerify'); // NEW
    
    if(searchInput) searchInput.addEventListener('input', renderVehiclesTable);
    if(statusFilter) statusFilter.addEventListener('change', renderVehiclesTable);
    if(selectAll) selectAll.addEventListener('change', toggleVehicleSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeVehicleConfirmAction);
    if(bulkBtn) { // NEW: Ensure bulk button has correct onclick
        bulkBtn.onclick = reqVehicleBulkVerify;
    }

    await Promise.all([loadVehiclesData(), fetchVehicleDropdowns()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadVehiclesData() {
    const tbody = document.getElementById('vehiclesBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
        <div class="text-sm mt-2">Loading vehicles...</div>
    </td></tr>`;
    
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/vehicles/?limit=1000');
        
        // Handle pagination or list response
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            allVehicles = items;
            selectedVehicleIds.clear();
            updateVehicleBulkUI();
            renderVehiclesTable();
        } else {
            const msg = data && data.detail ? data.detail : "Failed to load data.";
            showVehicleAlert("Error", msg, false);
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
                <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-2 text-red-400"></i>
                <div>Error loading vehicles</div>
            </td></tr>`;
        }
    } catch (error) {
        console.error("Load vehicles error:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
            <i data-lucide="wifi-off" class="w-8 h-8 mx-auto mb-2 text-red-400"></i>
            <div>Network error. Please check connection.</div>
        </td></tr>`;
        if(window.lucide) window.lucide.createIcons();
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
        showVehicleAlert("Warning", "Could not load all dropdown options", false);
    }
}

// =================================================================
// 3. TABLE RENDERING
// =================================================================
function renderVehiclesTable() {
    const tbody = document.getElementById('vehiclesBody');
    if(!tbody) return;

    const search = document.getElementById('vehicleSearch').value.toLowerCase();
    const sFilter = document.getElementById('vehicleStatusFilter') ? document.getElementById('vehicleStatusFilter').value : "all";
    
    let filtered = allVehicles.filter(v => {
        const makeName = getOptionName(vehicleOptions.makes, v.make, 'vehicle_make').toLowerCase();
        const modelName = getOptionName(vehicleOptions.models, v.model, 'vehicle_model').toLowerCase();
        const plate = v.plate_number ? v.plate_number.toLowerCase() : '';
        const vin = v.vin ? v.vin.toLowerCase() : '';
        
        const matchesSearch = 
            plate.includes(search) ||
            vin.includes(search) ||
            makeName.includes(search) ||
            modelName.includes(search);
            
        let matchesStatus = true;
        if (sFilter === 'verified') matchesStatus = v.is_verified === true;
        if (sFilter === 'pending') matchesStatus = v.is_verified !== true;

        return matchesSearch && matchesStatus;
    });

    document.getElementById('vehiclesCount').innerText = `${filtered.length} vehicle${filtered.length !== 1 ? 's' : ''} found`;

    // Update Select All checkbox
    const selectAllCheckbox = document.getElementById('selectAllVehicles');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">
            <i data-lucide="search" class="w-8 h-8 mx-auto mb-2 text-slate-500"></i>
            <div>No vehicles found</div>
        </td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(vehicleUserRole);

    tbody.innerHTML = filtered.map(v => {
        const make = getOptionName(vehicleOptions.makes, v.make, 'vehicle_make');
        const model = getOptionName(vehicleOptions.models, v.model, 'vehicle_model');
        const statusClass = getStatusClass(v.status);
        
        const verifyBadge = v.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1 w-fit">
                <i data-lucide="check-circle" class="w-3 h-3"></i> Verified
               </span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1 w-fit">
                <i data-lucide="clock" class="w-3 h-3"></i> Pending
               </span>`;

        // Checkbox logic
        let checkboxHtml = '';
        if (canManage && !v.is_verified) {
            const isChecked = selectedVehicleIds.has(v.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleVehicleRow(${v.id})" ${isChecked} 
                class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-1 focus:ring-blue-500 cursor-pointer hover:border-blue-500 transition">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled 
                class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
        }

        let actions = '';
        const viewBtn = `<button onclick="viewVehicle(${v.id})" 
            class="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-white rounded-md transition border border-slate-700 hover:border-blue-500"
            title="View Details"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (v.is_verified) {
            actions = `<div class="flex items-center justify-end gap-2">
                ${viewBtn}
                <span class="text-slate-600 cursor-not-allowed p-1.5" title="Locked - Verified vehicles cannot be edited">
                    <i data-lucide="lock" class="w-4 h-4"></i>
                </span>
            </div>`;
        } else if (canManage) {
            actions = `<div class="flex items-center justify-end gap-2">
                ${viewBtn}
                <button onclick="reqVehicleVerify(${v.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-md transition border border-slate-700 hover:border-emerald-500"
                    title="Verify Vehicle"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                <button onclick="openEditVehicleModal(${v.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-amber-600 text-amber-400 hover:text-white rounded-md transition border border-slate-700 hover:border-amber-500"
                    title="Edit Vehicle"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqVehicleDelete(${v.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-red-600 text-red-400 hover:text-white rounded-md transition border border-slate-700 hover:border-red-500"
                    title="Delete Vehicle"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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
    
    // Update select all checkbox state
    updateSelectAllCheckbox();
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. BULK OPERATIONS - FIXED
// =================================================================

window.toggleVehicleRow = function(id) {
    const canManage = ['admin', 'superadmin', 'charoi'].includes(vehicleUserRole);
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
    const selectAllCheckbox = document.getElementById('selectAllVehicles');
    if (!selectAllCheckbox) return;
    
    const canManage = ['admin', 'superadmin', 'charoi'].includes(vehicleUserRole);
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

window.toggleVehicleSelectAll = function() {
    const mainCheck = document.getElementById('selectAllVehicles');
    const isChecked = mainCheck.checked;
    
    const canManage = ['admin', 'superadmin', 'charoi'].includes(vehicleUserRole);
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
    const btn = document.getElementById('btnVehicleBulkVerify');
    const countSpan = document.getElementById('vehicleSelectedCount');
    
    if (!btn || !countSpan) return;
    
    countSpan.innerText = selectedVehicleIds.size;
    
    if (selectedVehicleIds.size > 0) {
        btn.classList.remove('hidden');
        btn.classList.add('animate-pulse');
        setTimeout(() => btn.classList.remove('animate-pulse'), 1000);
    } else {
        btn.classList.add('hidden');
    }
}

// FIXED: Function name matches HTML onclick
window.reqVehicleBulkVerify = function() {
    if (selectedVehicleIds.size === 0) {
        showVehicleAlert("No Selection", "Please select at least one vehicle to verify.", false);
        return;
    }
    
    vehicleActionType = 'bulk-verify';
    vehicleActionId = null;
    
    showVehicleConfirmModal(
        "Bulk Verify Vehicles", 
        `Are you sure you want to verify ${selectedVehicleIds.size} selected vehicle${selectedVehicleIds.size > 1 ? 's' : ''}?<br><span class="text-xs text-slate-400 mt-1 block">This action cannot be undone.</span>`, 
        "shield-check", 
        "bg-emerald-600"
    );
}

// =================================================================
// 5. SINGLE ACTIONS (Trigger Modal)
// =================================================================

window.reqVehicleVerify = function(id) {
    const vehicle = allVehicles.find(v => v.id === id);
    if (!vehicle) return;
    
    if (vehicle.is_verified) {
        showVehicleAlert("Already Verified", "This vehicle is already verified.", false);
        return;
    }
    
    vehicleActionType = 'verify';
    vehicleActionId = id;
    
    const make = getOptionName(vehicleOptions.makes, vehicle.make, 'vehicle_make');
    const model = getOptionName(vehicleOptions.models, vehicle.model, 'vehicle_model');
    const vehicleInfo = `${make} ${model} (${vehicle.plate_number})`;
    
    showVehicleConfirmModal(
        "Verify Vehicle", 
        `Verify vehicle #${id} ${vehicleInfo}?<br><span class="text-xs text-slate-400 mt-1 block">This will lock the vehicle permanently.</span>`, 
        "check-circle", 
        "bg-green-600"
    );
}

window.reqVehicleDelete = function(id) {
    const vehicle = allVehicles.find(v => v.id === id);
    if (!vehicle) return;
    
    vehicleActionType = 'delete';
    vehicleActionId = id;
    
    const make = getOptionName(vehicleOptions.makes, vehicle.make, 'vehicle_make');
    const model = getOptionName(vehicleOptions.models, vehicle.model, 'vehicle_model');
    const vehicleInfo = `${make} ${model} (${vehicle.plate_number})`;
    
    showVehicleConfirmModal(
        "Delete Vehicle", 
        `Permanently delete vehicle #${id} ${vehicleInfo}?<br><span class="text-xs text-red-400 mt-1 block">This action cannot be undone.</span>`, 
        "trash-2", 
        "bg-red-600"
    );
}

// =================================================================
// 6. EXECUTE ACTION (Confirm Modal Click) - FIXED
// =================================================================

async function executeVehicleConfirmAction() {
    const btn = document.getElementById('btnVehicleConfirmAction');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...`;
    
    try {
        let result = null;
        let successMessage = "";
        let idList = [];
        
        // --- DELETE ---
        if (vehicleActionType === 'delete') {
            result = await window.fetchWithAuth(`/vehicles/${vehicleActionId}`, 'DELETE');
            successMessage = "Vehicle deleted successfully";
        }
        // --- VERIFY (Single) ---
        else if (vehicleActionType === 'verify') {
            idList = [parseInt(vehicleActionId)];
            const payload = { ids: idList };
            result = await window.fetchWithAuth(`/vehicles/verify-bulk`, 'PUT', payload);
            successMessage = "Vehicle verified successfully";
        }
        // --- VERIFY (Bulk) ---
        else if (vehicleActionType === 'bulk-verify') {
            idList = Array.from(selectedVehicleIds).map(id => parseInt(id));
            const payload = { ids: idList };
            result = await window.fetchWithAuth('/vehicles/verify-bulk', 'PUT', payload);
            successMessage = `${idList.length} vehicle${idList.length > 1 ? 's' : ''} verified successfully`;
        }

        window.closeModal('vehicleConfirmModal');
        
        // Check if result is valid
        const isSuccess = result !== null && result !== false && !result.detail;
        
        if (isSuccess) {
            // Clear selections for bulk operations
            if (vehicleActionType === 'bulk-verify') {
                selectedVehicleIds.clear();
            }
            
            // Reload data
            await loadVehiclesData();
            
            // Show success alert
            showVehicleAlert("Success", successMessage, true);
            
        } else {
            // Handle API errors
            const errorMsg = result?.detail || "Action could not be completed";
            showVehicleAlert("Failed", typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, false);
        }
        
    } catch(e) {
        console.error("Action error:", e);
        window.closeModal('vehicleConfirmModal');
        showVehicleAlert("Error", e.message || "An unexpected error occurred", false);
    }
    
    // Reset button state
    btn.disabled = false;
    btn.innerHTML = originalText;
    
    // Reset action state
    vehicleActionId = null;
    vehicleActionType = null;
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 7. ADD / EDIT / VIEW LOGIC
// =================================================================

window.openAddVehicleModal = function() {
    document.getElementById('vehicleEditId').value = "";
    document.getElementById('vehicleModalTitle').innerText = "Add New Vehicle";
    document.getElementById('btnSaveVehicle').innerHTML = `<i data-lucide="plus" class="w-4 h-4 mr-2"></i> Save Vehicle`;
    resetForm();
    populateVehicleDropdowns();
    document.getElementById('addVehicleModal').classList.remove('hidden');
    
    // Focus first field
    setTimeout(() => {
        const firstSelect = document.getElementById('vehicleMake');
        if (firstSelect) firstSelect.focus();
    }, 100);
    
    if(window.lucide) window.lucide.createIcons();
}

window.openEditVehicleModal = function(id) {
    const vehicle = allVehicles.find(v => v.id === id);
    if(!vehicle) {
        showVehicleAlert("Error", "Vehicle not found", false);
        return;
    }
    
    if (vehicle.is_verified) {
        showVehicleAlert("Locked", "Verified vehicles cannot be edited", false);
        return;
    }

    document.getElementById('vehicleEditId').value = vehicle.id;
    document.getElementById('vehicleModalTitle').innerText = "Edit Vehicle";
    document.getElementById('btnSaveVehicle').innerHTML = `<i data-lucide="save" class="w-4 h-4 mr-2"></i> Update Vehicle`;
    
    populateVehicleDropdowns(vehicle);
    
    const setVal = (id, val) => { 
        if(document.getElementById(id) && val !== null && val !== undefined) {
            document.getElementById(id).value = val;
        }
    };
    
    setVal('vehicleYear', vehicle.year);
    setVal('vehiclePlate', vehicle.plate_number);
    setVal('vehicleVin', vehicle.vin);
    setVal('vehicleColor', vehicle.color);
    setVal('vehicleMileage', vehicle.mileage);
    setVal('vehicleEngine', vehicle.engine_size);
    setVal('vehiclePrice', vehicle.purchase_price);
    if(vehicle.purchase_date) setVal('vehicleDate', vehicle.purchase_date.split('T')[0]);

    document.getElementById('addVehicleModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveVehicle = async function() {
    const id = document.getElementById('vehicleEditId').value;
    const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value.trim() : '';
    const getInt = (id) => parseInt(document.getElementById(id).value) || null;
    const getFloat = (id) => parseFloat(document.getElementById(id).value) || null;

    const makeId = getInt('vehicleMake');
    const modelId = getInt('vehicleModel');
    const plateNumber = getVal('vehiclePlate');

    // Validation
    const errors = [];
    if(!makeId) errors.push("Please select a make");
    if(!modelId) errors.push("Please select a model");
    if(!plateNumber) errors.push("Please enter a plate number");
    
    if(errors.length > 0) {
        showVehicleAlert("Validation Error", errors.join("<br>"), false);
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
    if(dateVal) {
        payload.purchase_date = new Date(dateVal).toISOString();
    }

    const btn = document.getElementById('btnSaveVehicle');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i> Saving...`;

    try {
        let result;
        if(id) {
            result = await window.fetchWithAuth(`/vehicles/${id}`, 'PUT', payload);
        } else {
            result = await window.fetchWithAuth('/vehicles/', 'POST', payload);
        }

        if(result && !result.detail) {
            window.closeModal('addVehicleModal');
            await loadVehiclesData();
            showVehicleAlert("Success", `Vehicle ${id ? 'updated' : 'created'} successfully`, true);
        } else {
            const errorMsg = result?.detail || "Failed to save vehicle";
            showVehicleAlert("Error", typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, false);
        }
    } catch(e) { 
        showVehicleAlert("Error", e.message || "Failed to save vehicle", false); 
    }
    
    btn.disabled = false;
    btn.innerHTML = originalText;
    if(window.lucide) window.lucide.createIcons();
}

window.viewVehicle = function(id) {
    const vehicle = allVehicles.find(v => v.id === id);
    if(!vehicle) {
        showVehicleAlert("Error", "Vehicle not found", false);
        return;
    }
    
    const make = getOptionName(vehicleOptions.makes, vehicle.make, 'vehicle_make');
    const model = getOptionName(vehicleOptions.models, vehicle.model, 'vehicle_model');
    const type = getOptionName(vehicleOptions.types, vehicle.vehicle_type, 'vehicle_type');
    const transmission = getOptionName(vehicleOptions.trans, vehicle.vehicle_transmission, 'vehicle_transmission');
    const fuel = getOptionName(vehicleOptions.fuels, vehicle.vehicle_fuel_type, 'fuel_type');
    
    const verifyStatus = vehicle.is_verified 
        ? `<span class="px-2 py-1 rounded text-xs uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20 inline-flex items-center gap-1">
            <i data-lucide="check-circle" class="w-3 h-3"></i> Verified
           </span>`
        : `<span class="px-2 py-1 rounded text-xs uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 inline-flex items-center gap-1">
            <i data-lucide="clock" class="w-3 h-3"></i> Pending
           </span>`;

    const content = `
        <div class="space-y-6">
            <div class="flex items-center gap-4 pb-4 border-b border-slate-700">
                <div class="w-16 h-16 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400 border border-blue-500/20">
                    <i data-lucide="car" class="w-8 h-8"></i>
                </div>
                <div>
                    <h4 class="text-xl font-bold text-white">${make} ${model} ${vehicle.year}</h4>
                    <div class="flex items-center gap-3 mt-1">
                        <span class="text-slate-400 font-mono">${vehicle.plate_number || 'No Plate'}</span>
                        <span class="text-slate-500">•</span>
                        ${verifyStatus}
                    </div>
                </div>
            </div>
            
            <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
                <div><span class="text-xs text-slate-500 uppercase block mb-1">VIN</span><span class="text-white font-mono">${vehicle.vin || 'N/A'}</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Color</span><span class="text-white">${vehicle.color || 'N/A'}</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Type</span><span class="text-white">${type || 'N/A'}</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Status</span><span class="text-white capitalize">${vehicle.status ? vehicle.status.replace('_', ' ') : 'N/A'}</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Mileage</span><span class="text-white">${vehicle.mileage ? vehicle.mileage.toLocaleString() : 0} km</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Engine Size</span><span class="text-white">${vehicle.engine_size || 'N/A'}L</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Transmission</span><span class="text-white">${transmission || 'N/A'}</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Fuel Type</span><span class="text-white">${fuel || 'N/A'}</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Purchase Price</span><span class="text-white">${vehicle.purchase_price ? '$' + vehicle.purchase_price.toFixed(2) : 'N/A'}</span></div>
                <div><span class="text-xs text-slate-500 uppercase block mb-1">Purchase Date</span><span class="text-white">${vehicle.purchase_date ? new Date(vehicle.purchase_date).toLocaleDateString() : 'N/A'}</span></div>
            </div>
            
            ${vehicle.created_at ? `
            <div class="border-t border-slate-700 pt-4 text-xs text-slate-500">
                <div class="flex justify-between">
                    <span>Vehicle ID:</span>
                    <span class="text-slate-400">#${vehicle.id}</span>
                </div>
                <div class="flex justify-between mt-1">
                    <span>Created:</span>
                    <span class="text-slate-400">${new Date(vehicle.created_at).toLocaleString()}</span>
                </div>
                ${vehicle.updated_at && vehicle.updated_at !== vehicle.created_at ? `
                <div class="flex justify-between mt-1">
                    <span>Last Updated:</span>
                    <span class="text-slate-400">${new Date(vehicle.updated_at).toLocaleString()}</span>
                </div>` : ''}
            </div>` : ''}
        </div>
    `;
    
    document.getElementById('viewVehicleContent').innerHTML = content;
    document.getElementById('viewVehicleModal').classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 8. HELPER FUNCTIONS
// =================================================================

window.closeModal = function(id) { 
    document.getElementById(id).classList.add('hidden'); 
}

function showVehicleConfirmModal(title, message, icon, color) {
    const modal = document.getElementById('vehicleConfirmModal');
    if(!modal) {
        // Fallback to browser confirm
        if(confirm(title + ": " + message.replace(/<br>|<span.*?>|<\/span>/g, ' '))) {
            executeVehicleConfirmAction();
        }
        return;
    }
    
    document.getElementById('vehicleConfirmTitle').innerText = title;
    document.getElementById('vehicleConfirmMessage').innerHTML = message;
    
    const btn = document.getElementById('btnVehicleConfirmAction');
    btn.className = `px-4 py-2.5 text-white rounded-lg text-sm w-full font-medium transition-all duration-200 ${color} hover:opacity-90`;
    
    // Update icon
    const iconDiv = document.getElementById('vehicleConfirmIcon');
    if(iconDiv) {
        const textColor = color === 'bg-red-600' ? 'text-red-500' :
                         color === 'bg-green-600' ? 'text-green-500' : 'text-emerald-500';
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${textColor} bg-opacity-20 border border-current/20`;
        iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    }
    
    // Show modal with animation
    modal.classList.remove('hidden');
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.style.transform = 'scale(1)';
    }, 10);
    
    if(window.lucide) window.lucide.createIcons();
}

function showVehicleAlert(title, message, isSuccess) {
    const modal = document.getElementById('vehicleAlertModal');
    
    if(!modal) {
        // Fallback to browser alert
        alert(`${title}: ${message}`);
        return;
    }
    
    document.getElementById('vehicleAlertTitle').innerText = title;
    document.getElementById('vehicleAlertMessage').innerHTML = message;
    
    const iconDiv = document.getElementById('vehicleAlertIcon');
    if(iconDiv) {
        if(isSuccess) {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
            iconDiv.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6"></i>';
        } else {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/10 text-red-500 border border-red-500/20";
            iconDiv.innerHTML = '<i data-lucide="alert-circle" class="w-6 h-6"></i>';
        }
    }
    
    const okBtn = modal.querySelector('button');
    if(okBtn) {
        okBtn.className = isSuccess 
            ? "px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm w-full font-medium transition"
            : "px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm w-full font-medium transition";
    }
    
    // Show modal with animation
    modal.classList.remove('hidden');
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.style.transform = 'scale(1)';
    }, 10);
    
    // Auto close for success messages
    if(isSuccess) {
        setTimeout(() => {
            if(!modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        }, 3000);
    }
    
    if(window.lucide) window.lucide.createIcons();
}

function resetForm() {
    ['vehicleYear','vehiclePlate','vehicleVin','vehicleColor','vehicleMileage','vehicleEngine','vehiclePrice','vehicleDate'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = "";
    });
}

function populateVehicleDropdowns(selectedV = null) {
    populateSelect('vehicleMake', vehicleOptions.makes, selectedV?.make, 'vehicle_make', 'Select Make');
    populateSelect('vehicleModel', vehicleOptions.models, selectedV?.model, 'vehicle_model', 'Select Model');
    populateSelect('vehicleType', vehicleOptions.types, selectedV?.vehicle_type, 'vehicle_type', 'Select Type');
    populateSelect('vehicleTrans', vehicleOptions.trans, selectedV?.vehicle_transmission, 'vehicle_transmission', 'Select Transmission');
    populateSelect('vehicleFuel', vehicleOptions.fuels, selectedV?.vehicle_fuel_type, 'fuel_type', 'Select Fuel Type');
}

function populateSelect(id, list, selectedValue, labelKey, defaultText = 'Select...') {
    const el = document.getElementById(id);
    if(!el) return;
    
    let options = `<option value="">${defaultText}</option>`;
    
    if (Array.isArray(list)) {
        options += list.map(item => {
            const value = item.id;
            const label = item[labelKey] || item.name || `ID ${value}`;
            const isSelected = value == selectedValue ? 'selected' : '';
            return `<option value="${value}" ${isSelected}>${label}</option>`;
        }).join('');
    }
    
    el.innerHTML = options;
}

function getOptionName(list, id, label) {
    if(!list || id === null || id === undefined) return id || 'N/A';
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
// 9. EXPORT FUNCTIONS (Optional - Add if needed)
// =================================================================

window.exportVehiclesExcel = async function() {
    showVehicleAlert("Info", "Excel export feature coming soon!", false);
}

window.exportVehiclesPDF = async function() {
    showVehicleAlert("Info", "PDF export feature coming soon!", false);
}

// =================================================================
// 10. INITIALIZATION
// =================================================================

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVehicles);
} else {
    // DOM already loaded
    setTimeout(initVehicles, 100);
}

// Make functions available globally
window.initVehicles = initVehicles;
window.loadVehiclesData = loadVehiclesData;
window.renderVehiclesTable = renderVehiclesTable;