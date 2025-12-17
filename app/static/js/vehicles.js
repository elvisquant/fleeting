// app/static/js/vehicles.js

// Global State
let allVehicles = [];
let vehicleOptions = { makes: [], models: [], types: [], trans: [], fuels: [] };
let vehicleUserRole = 'user';
let vehicleActionType = null; 
let vehicleActionId = null;
let selectedVehicleIds = new Set();

async function initVehicles() {
    console.log("Vehicles Module: Init");
    vehicleUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // Attach Listeners
    const searchInput = document.getElementById('vehicleSearch');
    const statusFilter = document.getElementById('vehicleStatusFilter');
    const selectAll = document.getElementById('selectAllVehicles');
    const confirmBtn = document.getElementById('btnVehicleConfirmAction');

    if(searchInput) searchInput.addEventListener('input', renderVehiclesTable);
    if(statusFilter) statusFilter.addEventListener('change', renderVehiclesTable);
    if(selectAll) selectAll.addEventListener('change', toggleVehicleSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeVehicleConfirmAction);

    await Promise.all([loadVehiclesData(), fetchVehicleDropdowns()]);
}

async function loadVehiclesData() {
    const tbody = document.getElementById('vehiclesBody');
    if(!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    // FIX: Use trailing slash
    const data = await window.fetchWithAuth('/vehicles/?limit=1000');
    
    if (Array.isArray(data)) {
        allVehicles = data;
        selectedVehicleIds.clear();
        updateVehicleBulkUI();
        renderVehiclesTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load data.";
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchVehicleDropdowns() {
    try {
        // FIX: Use trailing slashes to prevent 307 Redirects
        const [makes, models, types, trans, fuels] = await Promise.all([
            window.fetchWithAuth('/vehicle-makes/?limit=200'),
            window.fetchWithAuth('/vehicle-models/?limit=1000'),
            window.fetchWithAuth('/vehicle-types/?limit=200'),
            window.fetchWithAuth('/vehicle-transmissions/?limit=200'),
            window.fetchWithAuth('/fuel-types/?limit=200')
        ]);
        vehicleOptions = { 
            makes: Array.isArray(makes) ? makes : [], 
            models: Array.isArray(models) ? models : [], 
            types: Array.isArray(types) ? types : [], 
            trans: Array.isArray(trans) ? trans : [], 
            fuels: Array.isArray(fuels) ? fuels : [] 
        };
    } catch (e) {
        console.warn("Dropdown Error", e);
    }
}

function renderVehiclesTable() {
    const tbody = document.getElementById('vehiclesBody');
    if(!tbody) return;

    const search = document.getElementById('vehicleSearch').value.toLowerCase();
    const sFilter = document.getElementById('vehicleStatusFilter') ? document.getElementById('vehicleStatusFilter').value : "all";
    
    let filtered = allVehicles.filter(v => {
        const matchesSearch = 
            (v.plate_number && v.plate_number.toLowerCase().includes(search)) ||
            (v.vin && v.vin.toLowerCase().includes(search)) ||
            (getOptionName(vehicleOptions.makes, v.make).toLowerCase().includes(search));
            
        let matchesStatus = true;
        if (sFilter === 'verified') matchesStatus = v.is_verified === true;
        if (sFilter === 'pending') matchesStatus = v.is_verified !== true;

        return matchesSearch && matchesStatus;
    });

    document.getElementById('vehiclesCount').innerText = `${filtered.length} vehicles found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No vehicles found.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(vehicleUserRole);

    tbody.innerHTML = filtered.map(v => {
        const make = getOptionName(vehicleOptions.makes, v.make, 'vehicle_make');
        const model = getOptionName(vehicleOptions.models, v.model, 'vehicle_model');
        const statusClass = getStatusClass(v.status);
        const purchaseDate = v.purchase_date ? new Date(v.purchase_date).toLocaleDateString() : '-';
        
        const verifyBadge = v.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        // Checkbox logic
        let checkboxHtml = '';
        if (canManage && !v.is_verified) {
            const isChecked = selectedVehicleIds.has(v.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleVehicleRow(${v.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
        }

        let actions = '';
        const viewBtn = `<button onclick="viewVehicle(${v.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (v.is_verified) {
            actions = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
        } else if (canManage) {
            actions = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqVehicleVerify(${v.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditVehicleModal(${v.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="reqVehicleDelete(${v.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
            actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }
        
        return `
            <tr class="hover:bg-white/5 transition group border-b border-slate-700/30">
                <td class="p-4 text-center">${checkboxHtml}</td>
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400"><i data-lucide="car" class="w-5 h-5"></i></div>
                        <div><div class="font-medium text-white">${make} ${model}</div><div class="text-xs text-slate-500">ID: ${v.id}</div></div>
                    </div>
                </td>
                <td class="p-4 font-mono text-slate-300 text-sm">${v.plate_number}<br><span class="text-xs text-slate-500">${v.vin}</span></td>
                <td class="p-4 text-slate-400 text-sm">${v.year}</td>
                <td class="p-4 text-slate-400 text-right text-sm">${v.mileage ? v.mileage.toLocaleString() : 0} km</td>
                <td class="p-4"><span class="px-2 py-1 rounded-full text-[10px] uppercase font-bold border ${statusClass}">${v.status ? v.status.replace('_', ' ') : 'N/A'}</span></td>
                <td class="p-4">${verifyBadge}</td>
                <td class="p-4 text-right">${actions}</td>
            </tr>
        `;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// === BULK LOGIC ===
window.toggleVehicleRow = function(id) {
    if (selectedVehicleIds.has(id)) selectedVehicleIds.delete(id);
    else selectedVehicleIds.add(id);
    updateVehicleBulkUI();
}

window.toggleVehicleSelectAll = function() {
    const mainCheck = document.getElementById('selectAllVehicles');
    const isChecked = mainCheck.checked;
    selectedVehicleIds.clear();
    
    if (isChecked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(vehicleUserRole);
        allVehicles.forEach(v => {
             if(canManage && !v.is_verified) selectedVehicleIds.add(v.id);
        });
    }
    renderVehiclesTable();
    updateVehicleBulkUI();
}

function updateVehicleBulkUI() {
    const btn = document.getElementById('btnVehicleBulkVerify');
    const countSpan = document.getElementById('vehicleSelectedCount');
    if (!btn) return;

    countSpan.innerText = selectedVehicleIds.size;
    if (selectedVehicleIds.size > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

window.executeVehicleBulkVerify = async function() {
    if (selectedVehicleIds.size === 0) return;
    
    vehicleActionType = 'bulk-verify';
    vehicleActionId = null;
    showVehicleConfirmModal("Verify Selected?", `Verify ${selectedVehicleIds.size} vehicles? This cannot be undone.`, "check-circle", "bg-emerald-600");
}

// === ACTIONS ===
window.reqVehicleVerify = function(id) {
    vehicleActionType = 'verify'; vehicleActionId = id;
    showVehicleConfirmModal("Verify Vehicle?", "This action locks the record.", "check-circle", "bg-green-600");
}
window.reqVehicleDelete = function(id) {
    vehicleActionType = 'delete'; vehicleActionId = id;
    showVehicleConfirmModal("Delete Vehicle?", "This action cannot be undone.", "trash-2", "bg-red-600");
}

async function executeVehicleConfirmAction() {
    const btn = document.getElementById('btnVehicleConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let result;
        if (vehicleActionType === 'delete') {
            result = await window.fetchWithAuth(`/vehicles/${vehicleActionId}`, 'DELETE');
        } 
        else if (vehicleActionType === 'verify') {
            const payload = { ids: [parseInt(vehicleActionId)] }; // Reuse bulk endpoint
            result = await window.fetchWithAuth(`/vehicles/verify-bulk`, 'PUT', payload); 
        }
        else if (vehicleActionType === 'bulk-verify') {
            const idList = Array.from(selectedVehicleIds).map(id => parseInt(id));
            const payload = { ids: idList };
            result = await window.fetchWithAuth('/vehicles/verify-bulk', 'PUT', payload);
        }
        
        window.closeModal('vehicleConfirmModal');
        if(result !== null) {
            if (vehicleActionType === 'bulk-verify') selectedVehicleIds.clear();
            await loadVehiclesData();
            showVehicleAlert("Success", "Action completed successfully.", true);
        } else {
            showVehicleAlert("Failed", "Action could not be completed.", false);
        }
    } catch(e) {
        window.closeModal('vehicleConfirmModal');
        showVehicleAlert("Error", e.message, false);
    }
    btn.disabled = false; btn.innerText = "Confirm"; vehicleActionId = null; vehicleActionType = null;
}

// === MODALS ===
window.openAddVehicleModal = function() {
    document.getElementById('vehicleEditId').value = "";
    document.getElementById('vehicleModalTitle').innerText = "Add New Vehicle";
    document.getElementById('btnSaveVehicle').innerHTML = `<i data-lucide="plus" class="w-4 h-4 mr-2"></i> Save Vehicle`;
    resetForm();
    populateVehicleDropdowns();
    document.getElementById('addVehicleModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditVehicleModal = function(id) {
    const v = allVehicles.find(x => x.id === id);
    if(!v) return;
    document.getElementById('vehicleEditId').value = v.id;
    document.getElementById('vehicleModalTitle').innerText = "Edit Vehicle";
    document.getElementById('btnSaveVehicle').innerHTML = `<i data-lucide="save" class="w-4 h-4 mr-2"></i> Update`;
    populateVehicleDropdowns(v);
    
    const setVal = (id, val) => { if(document.getElementById(id)) document.getElementById(id).value = val; };
    setVal('vehicleYear', v.year);
    setVal('vehiclePlate', v.plate_number);
    setVal('vehicleVin', v.vin);
    setVal('vehicleColor', v.color);
    setVal('vehicleMileage', v.mileage);
    setVal('vehicleEngine', v.engine_size);
    setVal('vehiclePrice', v.purchase_price);
    if(v.purchase_date) setVal('vehicleDate', v.purchase_date.split('T')[0]);

    document.getElementById('addVehicleModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveVehicle = async function() {
    const id = document.getElementById('vehicleEditId').value;
    const getVal = (id) => document.getElementById(id).value;
    const getInt = (id) => parseInt(document.getElementById(id).value) || 0;
    const getFloat = (id) => parseFloat(document.getElementById(id).value) || 0.0;

    const payload = {
        make: getInt('vehicleMake'),
        model: getInt('vehicleModel'),
        year: getInt('vehicleYear'),
        plate_number: getVal('vehiclePlate'),
        vin: getVal('vehicleVin'),
        color: getVal('vehicleColor'),
        vehicle_type: getInt('vehicleType'),
        mileage: getFloat('vehicleMileage'),
        engine_size: getFloat('vehicleEngine'),
        vehicle_transmission: getInt('vehicleTrans'),
        vehicle_fuel_type: getInt('vehicleFuel'),
        purchase_price: getFloat('vehiclePrice'),
        purchase_date: new Date(getVal('vehicleDate')).toISOString()
    };

    if(!payload.make || !payload.model || !payload.plate_number) { 
        showVehicleAlert("Validation", "Please fill required fields.", false); 
        return; 
    }

    const btn = document.getElementById('btnSaveVehicle');
    btn.disabled = true; btn.innerHTML = "Saving...";

    try {
        let result;
        if(id) result = await window.fetchWithAuth(`/vehicles/${id}`, 'PUT', payload);
        else result = await window.fetchWithAuth('/vehicles/', 'POST', payload);

        if(result && !result.detail) {
            window.closeModal('addVehicleModal');
            await loadVehiclesData();
            showVehicleAlert("Success", "Vehicle saved successfully.", true);
        } else {
            showVehicleAlert("Error", result?.detail || "Failed", false);
        }
    } catch(e) { showVehicleAlert("System Error", e.message, false); }
    btn.disabled = false;
}

window.viewVehicle = function(id) {
    const v = allVehicles.find(x => x.id === id);
    if(!v) return;
    const make = getOptionName(vehicleOptions.makes, v.make, 'vehicle_make');
    const model = getOptionName(vehicleOptions.models, v.model, 'vehicle_model');

    const content = `
        <div class="grid grid-cols-2 gap-y-4 gap-x-6 text-sm">
            <div class="col-span-2 flex items-center gap-4 mb-4 pb-4 border-b border-slate-700">
                <div class="w-16 h-16 rounded-xl bg-blue-600 flex items-center justify-center text-white"><i data-lucide="car" class="w-8 h-8"></i></div>
                <div>
                    <h4 class="text-xl font-bold text-white">${make} ${model} ${v.year}</h4>
                    <p class="text-slate-400">Plate: ${v.plate_number} | VIN: ${v.vin}</p>
                </div>
            </div>
            <div><span class="text-xs text-slate-500 uppercase block">Status</span><span class="text-white">${v.status}</span></div>
            <div><span class="text-xs text-slate-500 uppercase block">Mileage</span><span class="text-white">${v.mileage} km</span></div>
            <div><span class="text-xs text-slate-500 uppercase block">Color</span><span class="text-white">${v.color}</span></div>
            <div><span class="text-xs text-slate-500 uppercase block">Engine</span><span class="text-white">${v.engine_size}L</span></div>
            <div><span class="text-xs text-slate-500 uppercase block">Price</span><span class="text-white">$${v.purchase_price}</span></div>
            <div><span class="text-xs text-slate-500 uppercase block">Date</span><span class="text-white">${new Date(v.purchase_date).toLocaleDateString()}</span></div>
        </div>
    `;
    document.getElementById('viewVehicleContent').innerHTML = content;
    document.getElementById('viewVehicleModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

// Helpers
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }

function showVehicleConfirmModal(t, m, i, c) {
    document.getElementById('vehicleConfirmTitle').innerText = t;
    document.getElementById('vehicleConfirmMessage').innerText = m;
    const btn = document.getElementById('btnVehicleConfirmAction');
    btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${c}`;
    document.getElementById('vehicleConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showVehicleAlert(title, message, isSuccess) {
    const modal = document.getElementById('vehicleAlertModal');
    if(!modal) { alert(message); return; }
    document.getElementById('vehicleAlertTitle').innerText = title;
    document.getElementById('vehicleAlertMessage').innerText = message;
    
    const iconDiv = document.getElementById('vehicleAlertIcon');
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

function resetForm() {
    ['vehicleYear','vehiclePlate','vehicleVin','vehicleColor','vehicleMileage','vehicleEngine','vehiclePrice','vehicleDate'].forEach(id => {
        if(document.getElementById(id)) document.getElementById(id).value = "";
    });
}

function populateVehicleDropdowns(selectedV = null) {
    populateSelect('vehicleMake', vehicleOptions.makes, selectedV?.make, 'vehicle_make');
    populateSelect('vehicleModel', vehicleOptions.models, selectedV?.model, 'vehicle_model');
    populateSelect('vehicleType', vehicleOptions.types, selectedV?.vehicle_type, 'vehicle_type');
    populateSelect('vehicleTrans', vehicleOptions.trans, selectedV?.vehicle_transmission, 'vehicle_transmission');
    populateSelect('vehicleFuel', vehicleOptions.fuels, selectedV?.vehicle_fuel_type, 'fuel_type');
}

function populateSelect(id, list, sel, label) {
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = `<option value="">Select...</option>` + list.map(i => `<option value="${i.id}" ${i.id==sel?'selected':''}>${i[label]}</option>`).join('');
}

function getOptionName(list, id, label) {
    if(!list) return id;
    const found = list.find(i => i.id === id);
    return found ? found[label] : id;
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