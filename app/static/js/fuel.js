/**
 * ==============================================================================
 * FLEETDASH FUEL MODULE - PROFESSIONAL VERSION
 * Optimized for Mobile + Multi-Role Approval Workflow
 * ==============================================================================
 */

// --- GLOBAL STATE ---
let allFuelLogs = [];
let fuelOptions = { vehicles: [], fuelTypes: [] };
let currentUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
let selectedFuelIds = new Set(); 

let fuelActionType = null; 
let fuelActionId = null;
let fuelCurrentPage = 1;
const fuelPageLimit = 10;
let filteredFuelLogs = [];

// =================================================================
// 0. MOBILE-COMPATIBLE ELEMENT GETTER (FIXES MOBILE DISPLAY)
// =================================================================
function getFuelEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

// =================================================================
// 1. INITIALIZATION
// =================================================================
async function initFuel() {
    console.log("Fuel Module: Initializing High-Performance Logic...");
    
    // Role-based pruning for filters
    setupFuelRoleFilters();

    // Attach Table Listeners
    const search = getFuelEl('fuelSearch');
    const vFilter = getFuelEl('fuelVehicleFilter');
    const sFilter = getFuelEl('fuelStatusFilter');
    const selectAll = getFuelEl('selectAllFuel');

    if(search) search.addEventListener('input', () => { fuelCurrentPage = 1; renderFuelTable(); });
    if(vFilter) vFilter.addEventListener('change', () => { fuelCurrentPage = 1; renderFuelTable(); });
    if(sFilter) sFilter.addEventListener('change', () => { fuelCurrentPage = 1; renderFuelTable(); });
    if(selectAll) selectAll.addEventListener('change', toggleFuelSelectAll);

    // Form Calculation Listeners
    getFuelEl('fuelQuantity')?.addEventListener('input', updateCostPreview);
    getFuelEl('fuelPrice')?.addEventListener('input', updateCostPreview);
    getFuelEl('fuelVehicleSelect')?.addEventListener('change', autoSelectFuelType);
    
    // Action Confirmation
    getFuelEl('btnFuelConfirmAction')?.addEventListener('click', executeFuelConfirmAction);

    // Load Data via Promise.all
    await Promise.all([loadFuelData(), fetchFuelDropdowns()]);
}

function setupFuelRoleFilters() {
    const sFilter = getFuelEl('fuelStatusFilter');
    if (!sFilter) return;
    if (!['admin', 'superadmin', 'charoi'].includes(currentUserRole)) {
        sFilter.innerHTML = `
            <option value="all">All Consumption Logs</option>
            <option value="verified">Verified Records</option>
            <option value="pending">Awaiting Review</option>`;
    }
}

// =================================================================
// 2. DATA PIPELINE
// =================================================================
async function loadFuelData() {
    const tbody = getFuelEl('fuelLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="animate-spin mx-auto mb-2 text-indigo-500"></i>Syncing fuel archives...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/fuel/'); 
        const items = Array.isArray(data) ? data : (data.items || []);
        
        // LIFO SORTING (Newest entries first)
        allFuelLogs = items.sort((a, b) => b.id - a.id);
        
        selectedFuelIds.clear(); 
        renderFuelTable();
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400 font-medium">Network timeout. Refresh required.</td></tr>`;
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
        
        populateSelect('fuelVehicleFilter', fuelOptions.vehicles, '', 'plate_number', 'All Vehicles');
        
        // Modal Dropdown: Only show vehicles that aren't in repair
        const activeUnits = fuelOptions.vehicles.filter(v => v.status === 'available');
        populateSelect('fuelVehicleSelect', activeUnits, '', 'plate_number', 'Select Active Vehicle');
        populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', 'Select Fuel Grade');
        
    } catch (e) { console.warn("Resource fetch error", e); }
}

// =================================================================
// 3. CORE TABLE RENDERING (8 COLUMNS + LIFO)
// =================================================================
function renderFuelTable() {
    const tbody = getFuelEl('fuelLogsBody');
    if (!tbody) return;

    const sVal = getFuelEl('fuelSearch')?.value.toLowerCase() || '';
    const vVal = getFuelEl('fuelVehicleFilter')?.value || '';
    const stVal = getFuelEl('fuelStatusFilter')?.value || 'all';

    filteredFuelLogs = allFuelLogs.filter(log => {
        const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        
        const matchesSearch = plate.includes(sVal);
        const matchesVehicle = vVal === "" || log.vehicle_id == vVal;
        let matchesStatus = true;
        if (stVal === 'verified') matchesStatus = log.is_verified === true;
        if (stVal === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    updateFuelPaginationUI();

    const startIdx = (fuelCurrentPage - 1) * fuelPageLimit;
    const paginatedItems = filteredFuelLogs.slice(startIdx, startIdx + fuelPageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500 font-bold tracking-widest italic text-xs uppercase">No audit records match your query.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);

    tbody.innerHTML = paginatedItems.map(log => {
        const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
        const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);
        
        const statusBadge = log.is_verified 
            ? `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]">Verified</span>`
            : `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="toggleFuelRow(${log.id})" ${selectedFuelIds.has(log.id)?'checked':''} class="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0 cursor-pointer">`
            : `<i data-lucide="lock" class="w-3.5 h-3.5 text-slate-700 mx-auto"></i>`;

        const viewBtn = `<button onclick="openViewFuelModal(${log.id})" class="p-2 bg-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl transition border border-slate-700"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        let actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        if (!log.is_verified && canManage) {
            actions = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqFuelVerify(${log.id})" class="p-2 bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-xl transition border border-slate-700" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditFuelModal(${log.id})" class="p-2 bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white rounded-xl transition border border-slate-700" title="Edit"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                    <button onclick="reqFuelDelete(${log.id})" class="p-2 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-xl transition border border-slate-700" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else if (log.is_verified) {
            actions = `<div class="flex items-center justify-end gap-3">${viewBtn}<i data-lucide="shield-check" class="w-4 h-4 text-emerald-600/50"></i></div>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition duration-300">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 font-mono font-bold text-white text-sm">${vehicle ? vehicle.plate_number : 'ID: '+log.vehicle_id}</td>
                <td class="p-4 text-slate-400 uppercase text-[10px] font-black tracking-widest">${type?.fuel_type || '-'}</td>
                <td class="p-4 text-right">
                    <div class="text-slate-200 font-bold">${log.quantity?.toFixed(2)} L</div>
                    <div class="text-[9px] text-slate-500 font-mono tracking-tighter">@ ${log.price_little?.toLocaleString()} BIF</div>
                </td>
                <td class="p-4 text-right">
                    <div class="text-indigo-400 font-black tracking-tight">${log.cost?.toLocaleString()}</div>
                    <div class="text-[8px] text-slate-600 uppercase font-black">Total Cost (BIF)</div>
                </td>
                <td class="p-4 align-middle">${statusBadge}</td>
                <td class="p-4 text-slate-500 text-[10px] font-medium italic">${new Date(log.created_at).toLocaleDateString()}</td>
                <td class="p-4 text-right">${actions}</td>
            </tr>`;
    }).join('');
    
    updateFuelBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. PAGINATION ENGINE
// =================================================================
window.changeFuelPage = function(direction) {
    const totalPages = Math.ceil(filteredFuelLogs.length / fuelPageLimit);
    if (fuelCurrentPage + direction >= 1 && fuelCurrentPage + direction <= totalPages) {
        fuelCurrentPage += direction;
        renderFuelTable();
    }
}

function updateFuelPaginationUI() {
    const total = filteredFuelLogs.length;
    const totalPages = Math.ceil(total / fuelPageLimit) || 1;
    const indicator = getFuelEl('fuelPageIndicator');
    const countEl = getFuelEl('fuelLogsCount');
    
    if (indicator) indicator.innerText = `PAGE ${fuelCurrentPage} OF ${totalPages}`;
    if (getFuelEl('prevFuelPage')) getFuelEl('prevFuelPage').disabled = (fuelCurrentPage === 1);
    if (getFuelEl('nextFuelPage')) getFuelEl('nextFuelPage').disabled = (fuelCurrentPage >= totalPages || total === 0);
    if (countEl) countEl.innerText = `${total} transactions in record`;
}

// =================================================================
// 5. BULK SELECTION
// =================================================================
window.toggleFuelRow = function(id) {
    selectedFuelIds.has(id) ? selectedFuelIds.delete(id) : selectedFuelIds.add(id);
    updateFuelBulkUI();
}

window.toggleFuelSelectAll = function() {
    const mainCheck = getFuelEl('selectAllFuel');
    selectedFuelIds.clear();
    if (mainCheck?.checked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
        allFuelLogs.forEach(log => { if(canManage && !log.is_verified) selectedFuelIds.add(log.id); });
    }
    renderFuelTable();
}

function updateFuelBulkUI() {
    const container = getFuelEl('fuelBulkActions');
    const span = getFuelEl('fuelSelectedCount');
    if (span) span.innerText = selectedFuelIds.size;
    if (container) selectedFuelIds.size > 0 ? container.classList.remove('hidden') : container.classList.add('hidden');
}

// =================================================================
// 6. ACTION CONFIRMATION ENGINE (FIXED payload)
// =================================================================
window.executeFuelBulkVerify = function() {
    fuelActionType = 'bulk-verify';
    showFuelConfirmModal("Audit Verification", `Review and authorize ${selectedFuelIds.size} logs. These records will lock for accounting.`, "shield-check", "bg-indigo-600");
}

window.reqFuelVerify = (id) => { 
    fuelActionType = 'verify'; fuelActionId = id; 
    showFuelConfirmModal("Verify Log", "Authorize this consumption record? It will be locked from future modification.", "check-circle", "bg-emerald-600"); 
}

window.reqFuelDelete = (id) => { 
    fuelActionType = 'delete'; fuelActionId = id; 
    showFuelConfirmModal("Remove Log", "Permanently delete this fuel entry from history? This cannot be undone.", "trash-2", "bg-red-600"); 
}

async function executeFuelConfirmAction() {
    const btn = getFuelEl('btnFuelConfirmAction');
    btn.disabled = true; btn.innerText = "Processing Sync...";

    try {
        let result;
        if (fuelActionType === 'delete') {
            result = await window.fetchWithAuth(`/fuel/${fuelActionId}`, 'DELETE');
        } else {
            const ids = fuelActionId ? [parseInt(fuelActionId)] : Array.from(selectedFuelIds).map(id => parseInt(id));
            result = await window.fetchWithAuth(`/fuel/verify-bulk`, 'PUT', { ids: ids });
        }

        window.closeModal('fuelConfirmModal');
        if (result !== null) {
            await loadFuelData();
            showFuelAlert("Success", "Fleet logs have been successfully updated.", true);
        }
    } catch(e) { showFuelAlert("Error", "Server returned an invalid response.", false); }
    finally { btn.disabled = false; btn.innerText = "Confirm Action"; }
}

// =================================================================
// 7. SAVE / MODAL LOGIC
// =================================================================
window.openAddFuelModal = function() {
    getFuelEl('fuelEditId').value = ""; 
    getFuelEl('fuelModalTitle').innerText = "Record Fuel Transaction";
    getFuelEl('fuelQuantity').value = "";
    getFuelEl('fuelPrice').value = "";
    getFuelEl('costPreview').classList.add('hidden');
    
    // Refresh vehicles: Strictly available only
    const availableUnits = fuelOptions.vehicles.filter(v => v.status === 'available');
    populateSelect('fuelVehicleSelect', availableUnits, '', 'plate_number', 'Select Available Fleet Unit');
    
    getFuelEl('addFuelModal').classList.remove('hidden');
}

window.openEditFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if(!log) return;
    if(log.is_verified) return showFuelAlert("Locked", "Verified entries are archived.", false);

    getFuelEl('fuelEditId').value = log.id; 
    getFuelEl('fuelModalTitle').innerText = "Modify Transaction Record";
    populateSelect('fuelVehicleSelect', fuelOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, log.fuel_type_id, 'fuel_type', 'Select Grade');
    
    getFuelEl('fuelQuantity').value = log.quantity || '';
    getFuelEl('fuelPrice').value = log.price_little || '';
    updateCostPreview();
    getFuelEl('addFuelModal').classList.remove('hidden');
}

window.saveFuelLog = async function() {
    const id = getFuelEl('fuelEditId').value;
    const btn = getFuelEl('btnSaveFuel');
    const payload = {
        vehicle_id: parseInt(getFuelEl('fuelVehicleSelect').value),
        fuel_type_id: parseInt(getFuelEl('fuelTypeSelect').value),
        quantity: parseFloat(getFuelEl('fuelQuantity').value),
        price_little: parseFloat(getFuelEl('fuelPrice').value)
    };

    if(!payload.vehicle_id || isNaN(payload.quantity)) return showFuelAlert("Validation", "Required fields are missing.", false);

    btn.disabled = true; btn.innerHTML = "Authenticating...";
    try {
        const method = id ? 'PUT' : 'POST';
        const res = await window.fetchWithAuth(id ? `/fuel/${id}` : '/fuel/', method, payload);
        if(res && !res.detail) {
            window.closeModal('addFuelModal');
            await loadFuelData();
            showFuelAlert("Success", "Fuel entry recorded and audit log generated.", true);
        } else { showFuelAlert("Error", res.detail, false); }
    } catch(e) { showFuelAlert("Connection Error", "Check server connectivity.", false); }
    finally { btn.disabled = false; btn.innerText = "Save Log Entry"; }
}

// =================================================================
// 8. CALCULATIONS & HELPERS
// =================================================================
function updateCostPreview() {
    const qty = parseFloat(getFuelEl('fuelQuantity').value) || 0;
    const price = parseFloat(getFuelEl('fuelPrice').value) || 0;
    const total = qty * price;
    const preview = getFuelEl('costPreview');
    if(total > 0) {
        preview.classList.remove('hidden');
        getFuelEl('totalCostDisplay').innerText = `${total.toLocaleString()} BIF`;
    } else { preview.classList.add('hidden'); }
}

function autoSelectFuelType() {
    const vId = getFuelEl('fuelVehicleSelect').value;
    const v = fuelOptions.vehicles.find(v => v.id == vId);
    if(v && v.vehicle_fuel_type) populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, v.vehicle_fuel_type, 'fuel_type', 'Select Grade');
}

window.openViewFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if (!log) return;
    const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
    getFuelEl('viewFuelContent').innerHTML = `
        <div class="space-y-6">
            <div class="grid grid-cols-2 gap-4 text-center">
                <div class="bg-slate-950/60 p-4 rounded-3xl border border-white/5 shadow-inner">
                    <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Fleet Unit</span>
                    <span class="text-white font-mono font-bold text-sm tracking-tighter">${vehicle ? vehicle.plate_number : 'ID: '+log.vehicle_id}</span>
                </div>
                <div class="bg-slate-950/60 p-4 rounded-3xl border border-white/5 shadow-inner">
                    <span class="text-[9px] font-black text-slate-500 uppercase tracking-widest block mb-1">Status</span>
                    <span class="text-indigo-400 font-black text-xs uppercase">${log.is_verified ? 'Authorized' : 'Awaiting Audit'}</span>
                </div>
            </div>
            <div class="bg-indigo-500/5 p-6 rounded-[2.5rem] border border-indigo-500/10 text-center">
                <span class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] block mb-2">Total Financial Commitment</span>
                <span class="text-3xl font-black text-white tracking-tighter">${log.cost?.toLocaleString()} <span class="text-indigo-500 text-lg">BIF</span></span>
            </div>
        </div>`;
    getFuelEl('viewFuelModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function populateSelect(id, list, sel, key, def) {
    const el = getFuelEl(id); if(!el) return;
    el.innerHTML = `<option value="">${def}</option>` + list.map(i => `<option value="${i.id}" ${i.id == sel ? 'selected' : ''}>${i[key]}</option>`).join('');
}

window.closeModal = (id) => getFuelEl(id).classList.add('hidden');

function showFuelConfirmModal(t, m, i, c) {
    getFuelEl('fuelConfirmTitle').innerText = t; 
    getFuelEl('fuelConfirmMessage').innerText = m;
    getFuelEl('fuelConfirmIcon').innerHTML = `<i data-lucide="${i}" class="w-10 h-10 text-indigo-500"></i>`;
    getFuelEl('btnFuelConfirmAction').className = `flex-1 py-4 rounded-2xl text-[11px] font-black uppercase tracking-widest text-white shadow-2xl transition-all active:scale-95 ${c}`;
    getFuelEl('fuelConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showFuelAlert(t, m, s) {
    const modal = getFuelEl('fuelAlertModal');
    getFuelEl('fuelAlertTitle').innerText = t;
    getFuelEl('fuelAlertMessage').innerText = m;
    const iconDiv = getFuelEl('fuelAlertIcon');
    iconDiv.className = `w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 border ${s ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-red-500/10 text-red-500 border-red-500/20'}`;
    iconDiv.innerHTML = `<i data-lucide="${s ? 'check-circle' : 'alert-circle'}" class="w-10 h-10"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(s) setTimeout(() => modal.classList.add('hidden'), 3500);
}

document.addEventListener('DOMContentLoaded', initFuel);