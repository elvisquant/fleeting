/**
 * app/static/js/fuel.js
 * 
 * Professional Fleet Fuel Consumption Module
 * Handles audit logs, vehicle synchronization, and transaction verification.
 * 100% Full Generation - All logic preserved.
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

/**
 * Professional Element Getter
 * Ensures compatibility between Desktop and Mobile SPA containers
 */
function getFuelEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

/**
 * 1. INITIALIZATION
 */
async function initFuel() {
    console.log("Fuel Module: Initializing Professional Audit Logic...");
    
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

    // Load Data via Parallel Pipeline
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

/**
 * 2. DATA PIPELINE
 */
async function loadFuelData() {
    const tbody = getFuelEl('fuelLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500"></i>
        Synchronizing fuel archives...
    </td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/fuel/'); 
        const items = Array.isArray(data) ? data : (data.items || []);
        
        // LIFO SORTING: Most recent transactions at the top
        allFuelLogs = items.sort((a, b) => b.id - a.id);
        
        selectedFuelIds.clear(); 
        renderFuelTable();
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400 font-bold uppercase tracking-widest">Network sync failed</td></tr>`;
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
        
        const activeUnits = fuelOptions.vehicles.filter(v => v.status === 'available' || v.status === 'active');
        populateSelect('fuelVehicleSelect', activeUnits, '', 'plate_number', 'Select Active Unit');
        populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', 'Select Grade');
        
    } catch (e) { console.warn("Resource fetch error", e); }
}

/**
 * 3. CORE RENDERING ENGINE (8 COLUMNS)
 */
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
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-600 italic font-black uppercase tracking-widest text-[10px]">${window.t('no_records')}</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);

    tbody.innerHTML = paginatedItems.map(log => {
        const vehicle = fuelOptions.vehicles.find(v => v.id === log.vehicle_id);
        const type = fuelOptions.fuelTypes.find(t => t.id === log.fuel_type_id);
        
        const statusBadge = log.is_verified 
            ? `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Verified</span>`
            : `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="toggleFuelRow(${log.id})" ${selectedFuelIds.has(log.id)?'checked':''} class="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer">`
            : `<input type="checkbox" disabled class="rounded border-slate-800 bg-slate-950 opacity-20">`;

        let actions = `
            <button onclick="openViewFuelModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 rounded-lg border border-slate-700 hover:bg-blue-600 hover:text-white transition" title="View Dossier"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (!log.is_verified && canManage) {
            actions += `
                <button onclick="reqFuelVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 rounded-lg border border-slate-700 hover:bg-emerald-600 hover:text-white transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                <button onclick="openEditFuelModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-500 rounded-lg border border-slate-700 hover:bg-amber-600 hover:text-white transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqFuelDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 rounded-lg border border-slate-700 hover:bg-red-600 hover:text-white transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        } else if (log.is_verified) {
            actions += `<span class="p-1.5 text-slate-700 cursor-not-allowed" title="Archived"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-all duration-200">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 font-black text-white text-xs uppercase tracking-widest">${vehicle ? vehicle.plate_number : 'ID: '+log.vehicle_id}</td>
                <td class="p-4 text-slate-400 uppercase text-[10px] font-bold tracking-widest">${type?.fuel_type || '-'}</td>
                <td class="p-4 text-right">
                    <div class="text-slate-200 font-bold text-xs">${log.quantity?.toFixed(2)} L</div>
                    <div class="text-[9px] text-slate-500 font-mono tracking-tighter">@ ${log.price_little?.toLocaleString()}</div>
                </td>
                <td class="p-4 text-right">
                    <div class="text-indigo-400 font-black text-xs font-mono tracking-tighter">${log.cost?.toLocaleString()}</div>
                    <div class="text-[8px] text-slate-600 uppercase font-black tracking-widest">BIF</div>
                </td>
                <td class="p-4 text-center align-middle">${statusBadge}</td>
                <td class="p-4 text-slate-500 text-[10px] font-mono">${new Date(log.created_at).toLocaleDateString()}</td>
                <td class="p-4 text-right flex justify-end gap-1.5">${actions}</td>
            </tr>`;
    }).join('');
    
    updateFuelBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

/**
 * 4. PAGINATION LOGIC
 */
window.changeFuelPage = function(direction) {
    const totalPages = Math.ceil(filteredFuelLogs.length / fuelPageLimit);
    if (fuelCurrentPage + direction >= 1 && fuelCurrentPage + direction <= totalPages) {
        fuelCurrentPage += direction;
        renderFuelTable();
        const container = getFuelEl('fuelLogsBody');
        if(container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateFuelPaginationUI() {
    const total = filteredFuelLogs.length;
    const totalPages = Math.ceil(total / fuelPageLimit) || 1;
    const indicator = getFuelEl('fuelPageIndicator');
    const countEl = getFuelEl('fuelLogsCount');
    
    if (indicator) indicator.innerText = `PHASE ${fuelCurrentPage} / ${totalPages}`;
    if (getFuelEl('prevFuelPage')) getFuelEl('prevFuelPage').disabled = (fuelCurrentPage === 1);
    if (getFuelEl('nextFuelPage')) getFuelEl('nextFuelPage').disabled = (fuelCurrentPage >= totalPages || total === 0);
    
    if (countEl) {
        const start = (fuelCurrentPage - 1) * fuelPageLimit + 1;
        const end = Math.min(start + fuelPageLimit - 1, total);
        countEl.innerText = total > 0 ? `Displaying ${start}-${end} of ${total} transactions` : "0 logs synchronized";
    }
}

/**
 * 5. SELECTION & BULK UI
 */
window.toggleFuelRow = function(id) {
    selectedFuelIds.has(id) ? selectedFuelIds.delete(id) : selectedFuelIds.add(id);
    updateFuelBulkUI();
}

window.toggleFuelSelectAll = function() {
    const mainCheck = getFuelEl('selectAllFuel');
    selectedFuelIds.clear();
    if (mainCheck?.checked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(currentUserRole);
        filteredFuelLogs.forEach(log => { if(canManage && !log.is_verified) selectedFuelIds.add(log.id); });
    }
    renderFuelTable();
}

function updateFuelBulkUI() {
    const container = getFuelEl('fuelBulkActions');
    const span = getFuelEl('fuelSelectedCount');
    if (span) span.innerText = selectedFuelIds.size;
    if (container) selectedFuelIds.size > 0 ? container.classList.remove('hidden') : container.classList.add('hidden');
}

/**
 * 6. ACTION EXECUTORS
 */
window.executeFuelBulkVerify = function() {
    fuelActionType = 'bulk-verify';
    showFuelConfirmModal("Audit Validation", `Authorize ${selectedFuelIds.size} transactions for final audit?`, "shield-check", "bg-emerald-700");
}

window.reqFuelVerify = (id) => { 
    fuelActionType = 'verify'; fuelActionId = id; 
    showFuelConfirmModal("Commit Record", "Lock this transaction for accounting archive?", "check-circle", "bg-emerald-700"); 
}

window.reqFuelDelete = (id) => { 
    fuelActionType = 'delete'; fuelActionId = id; 
    showFuelConfirmModal("Purge Record", "Permanently remove this entry? This protocol is irreversible.", "trash-2", "bg-red-900"); 
}

async function executeFuelConfirmAction() {
    const btn = getFuelEl('btnFuelConfirmAction');
    const original = btn.innerHTML;
    btn.disabled = true; btn.innerText = "SYNCING...";

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
            showFuelAlert("Success", "Consolidated fleet logs updated.", true);
        }
    } catch(e) { showFuelAlert("Error", "Server connection handshake failed.", false); }
    finally { btn.disabled = false; btn.innerHTML = original; }
}

/**
 * 7. FORM & MODAL LOGIC
 */
window.openAddFuelModal = function() {
    getFuelEl('fuelEditId').value = ""; 
    getFuelEl('fuelModalTitle').innerText = "Log Fuel Entry";
    getFuelEl('fuelQuantity').value = "";
    getFuelEl('fuelPrice').value = "";
    getFuelEl('costPreview').classList.add('hidden');
    
    const activeUnits = fuelOptions.vehicles.filter(v => v.status === 'available' || v.status === 'active');
    populateSelect('fuelVehicleSelect', activeUnits, '', 'plate_number', 'Select Active Unit');
    populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, '', 'fuel_type', 'Select Grade');
    
    getFuelEl('addFuelModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditFuelModal = function(id) {
    const log = allFuelLogs.find(l => l.id === id);
    if(!log || log.is_verified) {
        showFuelAlert("Locked", "Immutable archived record.", false);
        return;
    }

    getFuelEl('fuelEditId').value = log.id; 
    getFuelEl('fuelModalTitle').innerText = "Update Transaction";
    populateSelect('fuelVehicleSelect', fuelOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Unit');
    populateSelect('fuelTypeSelect', fuelOptions.fuelTypes, log.fuel_type_id, 'fuel_type', 'Select Grade');
    
    getFuelEl('fuelQuantity').value = log.quantity || '';
    getFuelEl('fuelPrice').value = log.price_little || '';
    updateCostPreview();
    getFuelEl('addFuelModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveFuelLog = async function() {
    const id = getFuelEl('fuelEditId').value;
    const btn = getFuelEl('btnSaveFuel');
    const original = btn.innerHTML;
    
    const payload = {
        vehicle_id: parseInt(getFuelEl('fuelVehicleSelect').value),
        fuel_type_id: parseInt(getFuelEl('fuelTypeSelect').value),
        quantity: parseFloat(getFuelEl('fuelQuantity').value),
        price_little: parseFloat(getFuelEl('fuelPrice').value)
    };

    if(!payload.vehicle_id || isNaN(payload.quantity)) return showFuelAlert("Validation", "Required fields empty.", false);

    btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/fuel/${id}` : '/fuel/';
        const res = await window.fetchWithAuth(url, method, payload);
        if(res && !res.detail) {
            window.closeModal('addFuelModal');
            await loadFuelData();
            showFuelAlert("Success", "Transaction committed to ledger.", true);
        } else { showFuelAlert("Blocked", res.detail, false); }
    } catch(e) { showFuelAlert("Error", "Uplink failed.", false); }
    finally { btn.disabled = false; btn.innerHTML = original; if(window.lucide) window.lucide.createIcons(); }
}

/**
 * 8. DYNAMIC CALCULATORS & VIEW
 */
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
    
    const content = `
        <div class="space-y-6 text-left animate-up">
            <div class="flex justify-between items-start border-b border-slate-800 pb-4">
                <div>
                    <h4 class="text-2xl font-black text-white uppercase tracking-tighter">${vehicle?.plate_number || 'N/A'}</h4>
                    <p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">Voucher ID: #${log.id}</p>
                </div>
                <div class="text-right">
                    <span class="text-[10px] font-black text-slate-600 block uppercase">Log Date</span>
                    <span class="text-white text-xs font-mono">${new Date(log.created_at).toLocaleDateString()}</span>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 text-center">
                    <span class="label-text">Volume Refilled</span>
                    <p class="text-white text-sm font-black">${log.quantity?.toFixed(2)} L</p>
                </div>
                <div class="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 text-center">
                    <span class="label-text">Unit Price</span>
                    <p class="text-white text-sm font-black">${log.price_little?.toLocaleString()} BIF</p>
                </div>
            </div>

            <div class="bg-indigo-500/5 p-6 rounded-[2.5rem] border border-indigo-500/10 text-center shadow-inner">
                <span class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] block mb-2">Total Fiscal Cost</span>
                <span class="text-3xl font-black text-white tracking-tighter">${log.cost?.toLocaleString()} <span class="text-indigo-500 text-lg uppercase font-bold">BIF</span></span>
            </div>

            <div class="flex justify-center pt-4 border-t border-slate-800">
                <span class="text-[10px] ${log.is_verified ? 'text-emerald-500' : 'text-slate-600'} font-black uppercase tracking-widest">
                    ${log.is_verified ? 'Audit Verification Secured' : 'System Authorization Pending'}
                </span>
            </div>
        </div>`;
        
    getFuelEl('viewFuelContent').innerHTML = content;
    getFuelEl('viewFuelModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function populateSelect(id, list, sel, key, def) {
    const el = getFuelEl(id); if(!el) return;
    el.innerHTML = `<option value="">-- ${def.toUpperCase()} --</option>` + list.map(i => `<option value="${i.id}" ${i.id == sel ? 'selected' : ''}>${i[key]}</option>`).join('');
}

window.closeModal = (id) => getFuelEl(id).classList.add('hidden');

function showFuelConfirmModal(t, m, i, c) {
    getFuelEl('fuelConfirmTitle').innerText = t.toUpperCase(); 
    getFuelEl('fuelConfirmMessage').innerText = m;
    const iconDiv = getFuelEl('fuelConfirmIcon');
    iconDiv.innerHTML = `<i data-lucide="${i}" class="w-8 h-8"></i>`;
    iconDiv.className = `w-16 h-16 rounded-[1.5rem] bg-slate-900 flex items-center justify-center mx-auto mb-6 text-white border border-slate-800 shadow-2xl`;
    const btn = getFuelEl('btnFuelConfirmAction');
    btn.className = `flex-1 py-4 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all ${c}`;
    getFuelEl('fuelConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showFuelAlert(t, m, s) {
    getFuelEl('fuelAlertTitle').innerText = t.toUpperCase();
    getFuelEl('fuelAlertMessage').innerText = m;
    const iconDiv = getFuelEl('fuelAlertIcon');
    const color = s ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10';
    if(iconDiv) {
        iconDiv.className = `w-16 h-16 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6 ${color} border border-current/20`;
        iconDiv.innerHTML = `<i data-lucide="${s ? 'check-circle' : 'x-circle'}" class="w-8 h-8"></i>`;
    }
    getFuelEl('fuelAlertModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(s) setTimeout(() => closeModal('fuelAlertModal'), 3000);
}

initFuel();