/**
 * ==============================================================================
 * FLEETDASH FUEL MODULE - FULL PRODUCTION VERSION
 * ==============================================================================
 */

let allFuelLogs = [];
let fuelOptions = { vehicles: [], fuelTypes: [] };
let currentUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
let selectedFuelIds = new Set(); 

let fuelActionType = null; 
let fuelActionId = null;
let fuelCurrentPage = 1;
const fuelPageLimit = 10;

function getFuelEl(id) {
    return document.getElementById(id);
}

// =================================================================
// 1. INITIALIZATION
// =================================================================
async function initFuel() {
    console.log("Fuel Module: Initializing Full Feature Set...");
    
    // Setup Role-Based Filter UI
    setupFuelRoleFilters();

    // Attach Main Listeners
    getFuelEl('fuelSearch')?.addEventListener('input', () => { fuelCurrentPage = 1; renderFuelTable(); });
    getFuelEl('fuelVehicleFilter')?.addEventListener('change', () => { fuelCurrentPage = 1; renderFuelTable(); });
    getFuelEl('fuelStatusFilter')?.addEventListener('change', () => { fuelCurrentPage = 1; renderFuelTable(); });
    getFuelEl('selectAllFuel')?.addEventListener('change', toggleFuelSelectAll);

    // Form Calculation Listeners
    getFuelEl('fuelQuantity')?.addEventListener('input', updateCostPreview);
    getFuelEl('fuelPrice')?.addEventListener('input', updateCostPreview);
    getFuelEl('fuelVehicleSelect')?.addEventListener('change', autoSelectFuelType);
    
    // Modal Action Confirmation
    getFuelEl('btnFuelConfirmAction')?.addEventListener('click', executeFuelConfirmAction);

    // Load Initial Data
    await loadFuelData();
    await fetchFuelDropdowns();
}

/**
 * Prunes the filter dropdown based on user permissions.
 */
function setupFuelRoleFilters() {
    const sFilter = getFuelEl('fuelStatusFilter');
    if (!sFilter) return;

    if (!['admin', 'superadmin', 'charoi'].includes(currentUserRole)) {
        sFilter.innerHTML = `
            <option value="all">All My Logs</option>
            <option value="verified">Verified Records</option>
            <option value="pending">Awaiting Verification</option>`;
    }
}

// =================================================================
// 2. DATA LOADING & DROPDOWNS
// =================================================================
async function loadFuelData() {
    const tbody = getFuelEl('fuelLogsBody');
    if(!tbody) return;
    
    try {
        const data = await window.fetchWithAuth('/fuel/'); 
        const items = Array.isArray(data) ? data : (data.items || []);
        
        // LIFO SORTING: Highest ID first
        allFuelLogs = items.sort((a, b) => b.id - a.id);
        
        selectedFuelIds.clear(); 
        updateFuelBulkUI();
        renderFuelTable();
    } catch (error) {
        console.error("Load Error:", error);
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400 font-medium">Failed to communicate with server.</td></tr>`;
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
        
        // POPULATE FILTERS (Show all vehicles)
        populateSelect('fuelVehicleFilter', fuelOptions.vehicles, '', 'plate_number', 'All Vehicles');
        
        // POPULATE ADD FORM (Strictly Available Only as requested)
        const availableOnly = fuelOptions.vehicles.filter(v => v.status.toLowerCase() === 'available');
        populateSelect('fuelVehicleSelect', availableOnly, '', 'plate_number', 'Select Available Vehicle');
        
        populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', 'Select Type');
        
    } catch (e) { 
        console.warn("Dropdown Load Error:", e); 
    }
}

// =================================================================
// 3. TABLE RENDERING (8 COLUMNS ALIGNED)
// =================================================================
function renderFuelTable() {
    const tbody = getFuelEl('fuelLogsBody');
    if (!tbody) return;

    const searchValue = getFuelEl('fuelSearch')?.value.toLowerCase() || '';
    const vFilterValue = getFuelEl('fuelVehicleFilter')?.value || '';
    const sFilterValue = getFuelEl('fuelStatusFilter')?.value || 'all';

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
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500 font-medium italic">No fuel records found matching filters.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);

    tbody.innerHTML = filtered.map(log => {
        const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
        const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        
        const statusBadge = log.is_verified 
            ? `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Verified</span>`
            : `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-amber-500/10 text-amber-500 border border-amber-500/20">Pending</span>`;

        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedFuelIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleFuelRow(${log.id})" ${isChecked} class="w-4 h-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer">`;
        } else {
            checkboxHtml = `<i data-lucide="minus" class="w-3 h-3 text-slate-700 mx-auto"></i>`;
        }

        const viewBtn = `<button onclick="openViewFuelModal(${log.id})" class="p-2 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition shadow-lg"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        let actionButtons = '';
        if (log.is_verified) {
            actionButtons = `<div class="flex items-center justify-end gap-2">${viewBtn}<i data-lucide="lock" class="w-3 h-3 text-slate-600" title="Locked"></i></div>`;
        } else if (canManage) {
            actionButtons = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqFuelVerify(${log.id})" class="p-2 bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditFuelModal(${log.id})" class="p-2 bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white rounded-xl transition" title="Edit"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="reqFuelDelete(${log.id})" class="p-2 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-xl transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
            actionButtons = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition text-sm">
                <td class="p-4 text-center">${checkboxHtml}</td>
                <td class="p-4 font-mono font-bold text-white">${plate}</td>
                <td class="p-4 text-slate-400 uppercase text-[10px] font-bold tracking-tighter">${type?.fuel_type || '-'}</td>
                <td class="p-4 text-right">
                    <div class="text-slate-200 font-bold">${log.quantity?.toFixed(2)} L</div>
                    <div class="text-[10px] text-slate-500">@ ${log.price_little?.toLocaleString()} BIF</div>
                </td>
                <td class="p-4 text-right">
                    <div class="text-emerald-400 font-black">${log.cost?.toLocaleString()}</div>
                    <div class="text-[8px] text-slate-600 uppercase">Total BIF</div>
                </td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-slate-500 text-[10px]">${new Date(log.created_at).toLocaleDateString()}</td>
                <td class="p-4 text-right">${actionButtons}</td>
            </tr>`;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. BULK OPERATIONS
// =================================================================
window.toggleFuelRow = function(id) {
    if (selectedFuelIds.has(id)) selectedFuelIds.delete(id);
    else selectedFuelIds.add(id);
    updateFuelBulkUI();
}

window.toggleFuelSelectAll = function() {
    const mainCheck = getFuelEl('selectAllFuel');
    if (!mainCheck) return;
    
    selectedFuelIds.clear();
    if (mainCheck.checked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
        allFuelLogs.forEach(log => {
             if(canManage && !log.is_verified) selectedFuelIds.add(log.id);
        });
    }
    renderFuelTable();
    updateFuelBulkUI();
}

function updateFuelBulkUI() {
    const container = getFuelEl('fuelBulkActions');
    const countSpan = getFuelEl('fuelSelectedCount');
    if (!container) return;

    if (countSpan) countSpan.innerText = selectedFuelIds.size;
    if (selectedFuelIds.size > 0) container.classList.remove('hidden');
    else container.classList.add('hidden');
}

window.executeFuelBulkVerify = function() {
    fuelActionType = 'bulk-verify';
    fuelActionId = null;
    showFuelConfirmModal("Verify Records?", `Authorize ${selectedFuelIds.size} selected entries? This will lock them permanently.`, "shield-check", "bg-indigo-600");
}

// =================================================================
// 5. ACTION EXECUTION (SINGLE & BULK)
// =================================================================
window.reqFuelVerify = function(id) {
    fuelActionType = 'verify';
    fuelActionId = id;
    showFuelConfirmModal('Verify Entry?', 'Once verified, this cost is finalized and cannot be changed.', 'check-circle', 'bg-emerald-600');
}

window.reqFuelDelete = function(id) {
    fuelActionType = 'delete';
    fuelActionId = id;
    showFuelConfirmModal('Permanently Delete?', 'This will remove the entry from all history reports.', 'trash-2', 'bg-red-600');
}

async function executeFuelConfirmAction() {
    const btn = getFuelEl('btnFuelConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let result;
        if (fuelActionType === 'delete') {
            result = await window.fetchWithAuth(`/fuel/${fuelActionId}`, 'DELETE');
        } else if (fuelActionType === 'verify' || fuelActionType === 'bulk-verify') {
            const idList = fuelActionId ? [parseInt(fuelActionId)] : Array.from(selectedFuelIds).map(id => parseInt(id));
            result = await window.fetchWithAuth(`/fuel/verify-bulk`, 'PUT', { ids: idList });
        }

        window.closeModal('fuelConfirmModal');
        if (result !== null) {
            selectedFuelIds.clear();
            await loadFuelData();
            showFuelAlert("Success", "Fuel database updated successfully.", true);
        }
    } catch(e) {
        window.closeModal('fuelConfirmModal');
        showFuelAlert("Error", e.message, false);
    }
    btn.disabled = false; btn.innerText = "Confirm Action";
}

// =================================================================
// 6. CRUD MODALS (ADD/EDIT/VIEW)
// =================================================================
window.openAddFuelModal = function() {
    getFuelEl('fuelEditId').value = ""; 
    getFuelEl('fuelModalTitle').innerText = "New Fuel Transaction";
    getFuelEl('fuelQuantity').value = "";
    getFuelEl('fuelPrice').value = "";
    getFuelEl('costPreview').classList.add('hidden');
    
    // RE-FILTER: Only available vehicles for NEW logs
    const availableOnly = fuelOptions.vehicles.filter(v => v.status.toLowerCase() === 'available');
    populateSelect('fuelVehicleSelect', availableOnly, '', 'plate_number', 'Select Available Vehicle');
    
    getFuelEl('addFuelModal').classList.remove('hidden');
}

window.openEditFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if(!log) return;
    
    getFuelEl('fuelEditId').value = log.id; 
    getFuelEl('fuelModalTitle').innerText = "Modify Fuel Entry";

    // For edits, show ALL vehicles to preserve current selection
    populateSelect('fuelVehicleSelect', fuelOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, log.fuel_type_id, 'fuel_type', 'Select Type');
    
    getFuelEl('fuelQuantity').value = log.quantity || '';
    getFuelEl('fuelPrice').value = log.price_little || '';
    
    updateCostPreview();
    getFuelEl('addFuelModal').classList.remove('hidden');
}

window.saveFuelLog = async function() {
    const payload = {
        vehicle_id: parseInt(getFuelEl('fuelVehicleSelect').value),
        fuel_type_id: parseInt(getFuelEl('fuelTypeSelect').value),
        quantity: parseFloat(getFuelEl('fuelQuantity').value),
        price_little: parseFloat(getFuelEl('fuelPrice').value)
    };

    if(!payload.vehicle_id || !payload.quantity || !payload.price_little) {
        return showFuelAlert("Incomplete Form", "All fields are required to calculate costs.", false);
    }

    const id = getFuelEl('fuelEditId').value;
    const btn = getFuelEl('btnSaveFuel');
    btn.disabled = true; btn.innerText = "Saving Data...";

    try {
        const res = id 
            ? await window.fetchWithAuth(`/fuel/${id}`, 'PUT', payload)
            : await window.fetchWithAuth('/fuel/', 'POST', payload);

        if(res && !res.detail) {
            window.closeModal('addFuelModal');
            await loadFuelData();
            showFuelAlert("Saved", "Transaction record updated.", true);
        } else {
            showFuelAlert("Backend Error", res.detail || "Validation failed.", false);
        }
    } catch(e) { showFuelAlert("Network Error", "Connection to API failed.", false); }
    
    btn.disabled = false; btn.innerText = "Save Entry";
}

window.openViewFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if (!log) return;
    const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
    const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);

    getFuelEl('viewFuelContent').innerHTML = `
        <div class="space-y-6">
            <div class="grid grid-cols-2 gap-4">
                <div class="p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                    <span class="text-[9px] text-slate-500 uppercase font-black block mb-1">Vehicle Plate</span>
                    <span class="text-white font-mono font-bold">${vehicle ? vehicle.plate_number : 'ID: '+log.vehicle_id}</span>
                </div>
                <div class="p-4 bg-slate-950/50 rounded-2xl border border-white/5">
                    <span class="text-[9px] text-slate-500 uppercase font-black block mb-1">Fuel Category</span>
                    <span class="text-white font-bold">${type ? type.fuel_type : 'N/A'}</span>
                </div>
            </div>
            <div class="flex justify-between items-center p-4 bg-emerald-500/5 rounded-2xl border border-emerald-500/10">
                <div>
                    <span class="text-[9px] text-emerald-600 uppercase font-black block">Quantity & Unit Price</span>
                    <span class="text-slate-200 text-sm font-bold">${log.quantity?.toFixed(2)} L @ ${log.price_little?.toLocaleString()} BIF</span>
                </div>
                <div class="text-right">
                    <span class="text-[9px] text-emerald-600 uppercase font-black block">Total Cost</span>
                    <span class="text-emerald-400 text-xl font-black">${log.cost?.toLocaleString()} BIF</span>
                </div>
            </div>
            <p class="text-[10px] text-slate-600 text-center uppercase tracking-widest">Recorded on ${new Date(log.created_at).toLocaleString()}</p>
        </div>`;
    
    getFuelEl('viewFuelModal').classList.remove('hidden');
}

// =================================================================
// 7. HELPER UTILITIES
// =================================================================
function updateCostPreview() {
    const qty = parseFloat(getFuelEl('fuelQuantity').value) || 0;
    const price = parseFloat(getFuelEl('fuelPrice').value) || 0;
    const total = qty * price;
    
    const preview = getFuelEl('costPreview');
    if(total > 0) {
        preview.classList.remove('hidden');
        getFuelEl('totalCostDisplay').innerText = `${total.toLocaleString()} BIF`;
    } else {
        preview.classList.add('hidden');
    }
}

function autoSelectFuelType() {
    const vId = getFuelEl('fuelVehicleSelect').value;
    const vehicle = fuelOptions.vehicles.find(v => v.id == vId);
    if(vehicle && vehicle.vehicle_fuel_type) {
        populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, vehicle.vehicle_fuel_type, 'fuel_type', 'Select Type');
    }
}

function showFuelConfirmModal(title, msg, icon, btnClass) {
    getFuelEl('fuelConfirmTitle').innerText = title;
    getFuelEl('fuelConfirmMessage').innerText = msg;
    getFuelEl('fuelConfirmIcon').innerHTML = `<i data-lucide="${icon}" class="w-8 h-8"></i>`;
    getFuelEl('fuelConfirmIcon').className = `w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 ${btnClass.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
    getFuelEl('btnFuelConfirmAction').className = `flex-1 py-3 text-white rounded-xl font-bold shadow-lg ${btnClass} transition transform active:scale-95`;
    getFuelEl('fuelConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showFuelAlert(title, message, isSuccess) {
    const modal = getFuelEl('fuelAlertModal');
    getFuelEl('fuelAlertTitle').innerText = title;
    getFuelEl('fuelAlertMessage').innerText = message;
    
    const iconDiv = getFuelEl('fuelAlertIcon');
    iconDiv.innerHTML = isSuccess ? '<i data-lucide="check-circle" class="w-12 h-12"></i>' : '<i data-lucide="alert-triangle" class="w-12 h-12"></i>';
    iconDiv.className = isSuccess ? "w-24 h-24 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6" : "w-24 h-24 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6";
    
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    setTimeout(() => modal.classList.add('hidden'), 3500);
}

function populateSelect(id, items, selected, key, def) {
    const el = getFuelEl(id); 
    if(!el) return;
    el.innerHTML = `<option value="">${def}</option>` + 
        items.map(i => `<option value="${i.id}" ${i.id == selected ? 'selected':''}>${i[key] || i.name}</option>`).join('');
}

window.closeModal = (id) => getFuelEl(id).classList.add('hidden');

// Entry Point
document.addEventListener('DOMContentLoaded', initFuel);