// app/static/js/reparation.js

// --- GLOBAL STATE ---
let allRepLogs = [];
let repOptions = { pannes: [], garages: [] };
let repUserRole = 'user';

// --- PAGINATION & FILTER STATE ---
let repCurrentPage = 1;
let repPageLimit = 10;
let filteredRepLogs = []; // Stores logs after search/filters are applied

// --- ACTION STATE ---
let repActionType = null; // 'delete', 'verify', 'bulk-verify'
let repActionId = null;
let selectedRepIds = new Set(); 

// =================================================================
// MOBILE-COMPATIBLE ELEMENT GETTER
// =================================================================
function getRepEl(id) {
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
async function initReparation() {
    console.log("Reparation Module: Full Logic Start");
    repUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // DOM Elements
    const search = getRepEl('repSearch');
    const garageFilter = getRepEl('repGarageFilter');
    const statusFilter = getRepEl('repStatusFilter');
    const selectAll = getRepEl('selectAllRep');
    const confirmBtn = getRepEl('btnRepConfirmAction');
    const bulkBtn = getRepEl('btnRepBulkVerify');
    
    // Attach Listeners for Search and Filters (Resets to page 1)
    if(search) search.addEventListener('input', () => { repCurrentPage = 1; renderRepTable(); });
    if(garageFilter) garageFilter.addEventListener('change', () => { repCurrentPage = 1; renderRepTable(); });
    if(statusFilter) statusFilter.addEventListener('change', () => { repCurrentPage = 1; renderRepTable(); });
    
    // Selection listeners
    if(selectAll) selectAll.addEventListener('change', toggleRepSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeRepConfirmAction);
    
    if(bulkBtn) bulkBtn.onclick = triggerRepBulkVerify;

    await Promise.all([loadRepData(), fetchRepDropdowns()]);
}

// =================================================================
// 2. DATA LOADING (LIFO SORTING)
// =================================================================
async function loadRepData() {
    const tbody = getRepEl('repLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Refreshing Reparation Logs...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/reparation/?limit=1000'); 
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            // LIFO SORTING: Newest repairs (highest ID) first
            allRepLogs = items.sort((a, b) => b.id - a.id);
            selectedRepIds.clear(); 
            renderRepTable();
        } else {
            handleFriendlyRepError(data, "load");
        }
    } catch (e) {
        showRepAlert("Connection Error", "Could not connect to the server.", false);
    }
}

async function fetchRepDropdowns() {
    try {
        const [pannes, garages] = await Promise.all([
            window.fetchWithAuth('/panne/?limit=1000'), 
            window.fetchWithAuth('/garage/') 
        ]);

        repOptions.pannes = Array.isArray(pannes) ? pannes : (pannes.items || []);
        repOptions.garages = Array.isArray(garages) ? garages : (garages.items || []);
        
        populateSelect('repGarageFilter', repOptions.garages, '', 'nom_garage', 'All Garages');
        populateSelect('repGarageSelect', repOptions.garages, '', 'nom_garage', 'Select Garage');
        
        // Modal Dropdown: Only show ACTIVE pannes for new repairs
        populateActivePanneSelect('repPanneSelect', repOptions.pannes);

    } catch (e) { console.warn("Dropdown load error", e); }
}

// =================================================================
// 3. CORE TABLE RENDERING (8 COLUMNS + LOCK LOGIC)
// =================================================================
function renderRepTable() {
    const tbody = getRepEl('repLogsBody');
    if (!tbody) return;

    const searchVal = getRepEl('repSearch')?.value.toLowerCase() || '';
    const gFilterVal = getRepEl('repGarageFilter')?.value || '';
    const sFilterVal = getRepEl('repStatusFilter')?.value || 'all';

    // A. Apply Filtering
    filteredRepLogs = allRepLogs.filter(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const gName = garage ? garage.nom_garage.toLowerCase() : "";
        const receipt = (log.receipt || "").toLowerCase();
        
        const matchesSearch = gName.includes(searchVal) || receipt.includes(searchVal);
        const matchesGarage = gFilterVal === "" || log.garage_id == gFilterVal;
        
        let matchesStatus = true;
        if (sFilterVal === 'verified') matchesStatus = log.is_verified === true;
        else if (sFilterVal === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesGarage && matchesStatus;
    });

    // B. Handle Pagination State
    updateRepPaginationUI();

    // C. Slice for current page
    const start = (repCurrentPage - 1) * repPageLimit;
    const paginatedItems = filteredRepLogs.slice(start, start + repPageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">No records found matching filters.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(repUserRole);

    // D. Generate Rows
    tbody.innerHTML = paginatedItems.map(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const date = new Date(log.repair_date).toLocaleDateString();

        // Lock Logic: Lock if status is 'Completed'
        const isLocked = log.status === 'Completed';

        const progressBadge = isLocked
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Completed</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">In Progress</span>`;

        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="toggleRepRow(${log.id})" ${selectedRepIds.has(log.id) ? 'checked' : ''} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`
            : `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30">`;

        let actions = `<button onclick="openViewRepModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View Details"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (isLocked) {
             // LOCKED row: Only View and Lock icon
             actions += `<span class="p-1.5 text-slate-600 cursor-not-allowed" title="Record Locked: Completed repairs cannot be modified."><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
             // EDITABLE row: All buttons
             actions += `
                <button onclick="reqRepVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                <button onclick="openEditRepModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqRepDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-colors">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle text-white font-mono text-xs">PAN-${log.panne_id}</td>
                <td class="p-4 align-middle text-slate-300 text-sm">${garage ? garage.nom_garage : 'ID ' + log.garage_id}</td>
                <td class="p-4 align-middle text-right font-bold text-emerald-400">${log.cost ? log.cost.toFixed(2) : '0.00'}</td>
                <td class="p-4 align-middle">${progressBadge}</td>
                <td class="p-4 align-middle">${verifyBadge}</td>
                <td class="p-4 align-middle text-slate-500 text-xs">${date}</td>
                <td class="p-4 align-middle text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    
    updateRepBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. PAGINATION UI CONTROLS
// =================================================================
window.changeRepPage = function(direction) {
    const totalPages = Math.ceil(filteredRepLogs.length / repPageLimit);
    const newPage = repCurrentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
        repCurrentPage = newPage;
        renderRepTable();
        // Return to top of table
        const body = getRepEl('repLogsBody');
        if(body) body.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateRepPaginationUI() {
    const totalLogs = filteredRepLogs.length;
    const totalPages = Math.ceil(totalLogs / repPageLimit) || 1;
    
    const indicator = getRepEl('repPageIndicator');
    const countEl = getRepEl('repCount');
    const prevBtn = getRepEl('prevRepPage');
    const nextBtn = getRepEl('nextRepPage');

    if(indicator) indicator.innerText = `Page ${repCurrentPage} / ${totalPages}`;
    if(prevBtn) prevBtn.disabled = (repCurrentPage === 1);
    if(nextBtn) nextBtn.disabled = (repCurrentPage === totalPages || totalLogs === 0);

    if(countEl) {
        const start = (repCurrentPage - 1) * repPageLimit + 1;
        const end = Math.min(start + repPageLimit - 1, totalLogs);
        countEl.innerText = totalLogs > 0 ? `Showing ${start}-${end} of ${totalLogs} repairs` : "0 records found";
    }
}

// =================================================================
// 5. BULK SELECTION
// =================================================================
window.toggleRepRow = function(id) {
    if (selectedRepIds.has(id)) selectedRepIds.delete(id);
    else selectedRepIds.add(id);
    updateRepBulkUI();
}

window.toggleRepSelectAll = function() {
    const mainCheck = getRepEl('selectAllRep');
    if (!mainCheck) return;
    
    selectedRepIds.clear();
    if (mainCheck.checked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(repUserRole);
        // Select only visible, unverified items
        filteredRepLogs.forEach(log => {
             if(canManage && !log.is_verified) selectedRepIds.add(log.id);
        });
    }
    renderRepTable();
    updateRepBulkUI();
}

function updateRepBulkUI() {
    const btn = getRepEl('btnRepBulkVerify');
    const countSpan = getRepEl('repSelectedCount');
    if (!btn || !countSpan) return;

    countSpan.innerText = selectedRepIds.size;
    if (selectedRepIds.size > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

window.triggerRepBulkVerify = function() {
    if (selectedRepIds.size === 0) return;
    repActionType = 'bulk-verify';
    showRepConfirmModal("Bulk Verify", `You are verifying ${selectedRepIds.size} records. This confirms they have been reviewed.`, "shield-check", "bg-emerald-600");
}

// =================================================================
// 6. SAVE / EDIT / VIEW LOGIC
// =================================================================
window.openAddReparationModal = function() {
    getRepEl('repEditId').value = "";
    getRepEl('repModalTitle').innerText = "Log Reparation";
    
    // Only show ACTIVE pannes for new repairs
    populateActivePanneSelect('repPanneSelect', repOptions.pannes);
    populateSelect('repGarageSelect', repOptions.garages, '', 'nom_garage', 'Select Garage');
    
    getRepEl('repCost').value = "";
    getRepEl('repDate').value = new Date().toISOString().split('T')[0];
    getRepEl('repReceipt').value = "";
    getRepEl('repProgressStatus').value = "Inprogress";

    getRepEl('addRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditRepModal = function(id) {
    const log = allRepLogs.find(l => l.id === id);
    if(!log || log.status === 'Completed') {
        showRepAlert("Record Locked", "Completed repairs cannot be edited.", false);
        return;
    }

    getRepEl('repEditId').value = log.id;
    getRepEl('repModalTitle').innerText = "Update Repair Progress";
    
    // During edit, include the current panne in dropdown even if it were resolved
    populateSelect('repPanneSelect', repOptions.pannes, log.panne_id, 'description', 'Select Panne');
    populateSelect('repGarageSelect', repOptions.garages, log.garage_id, 'nom_garage', 'Select Garage');
    
    getRepEl('repCost').value = log.cost;
    getRepEl('repDate').value = new Date(log.repair_date).toISOString().split('T')[0];
    getRepEl('repReceipt').value = log.receipt;
    getRepEl('repProgressStatus').value = log.status;

    getRepEl('addRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveReparation = async function() {
    const id = getRepEl('repEditId').value;
    const btn = getRepEl('btnSaveRep');

    const payload = {
        panne_id: parseInt(getRepEl('repPanneSelect').value),
        garage_id: parseInt(getRepEl('repGarageSelect').value),
        cost: parseFloat(getRepEl('repCost').value),
        repair_date: new Date(getRepEl('repDate').value).toISOString(),
        receipt: getRepEl('repReceipt').value.trim(),
        status: getRepEl('repProgressStatus').value
    };

    if(!payload.panne_id || !payload.garage_id || isNaN(payload.cost)) {
        showRepAlert("Validation Error", "Please select a Panne, Garage, and enter a valid cost.", false);
        return;
    }

    btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4 mr-2"></i> Saving...`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/reparation/${id}` : '/reparation/';
        const res = await window.fetchWithAuth(url, method, payload);
        
        if(res && !res.detail) {
            window.closeModal('addRepModal');
            await loadRepData();
            showRepAlert("Success", "Repair log saved. Vehicle status updated.", true);
        } else {
            handleFriendlyRepError(res, "save");
        }
    } catch(e) { showRepAlert("Error", "Server unreachable. Please try again.", false); }
    btn.disabled = false; btn.innerHTML = "Save Record";
}

// =================================================================
// 7. ACTIONS (VERIFY / DELETE / EXECUTION)
// =================================================================
window.reqRepVerify = function(id) { 
    repActionType = 'verify'; 
    repActionId = id; 
    showRepConfirmModal("Verify Repair?", "Mark this record as inspected?", "check-circle", "bg-green-600"); 
}

window.reqRepDelete = function(id) { 
    repActionType = 'delete'; 
    repActionId = id; 
    showRepConfirmModal("Delete Repair?", "Permanently remove this repair record?", "trash-2", "bg-red-600"); 
}

async function executeRepConfirmAction() {
    const btn = getRepEl('btnRepConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";
    try {
        let res;
        if (repActionType === 'delete') {
            res = await window.fetchWithAuth(`/reparation/${repActionId}`, 'DELETE');
        } else if (repActionType === 'verify') {
            res = await window.fetchWithAuth(`/reparation/verify-bulk`, 'PUT', { ids: [parseInt(repActionId)] });
        } else if (repActionType === 'bulk-verify') {
            res = await window.fetchWithAuth('/reparation/verify-bulk', 'PUT', { ids: Array.from(selectedRepIds).map(id => parseInt(id)) });
        }

        window.closeModal('repConfirmModal');
        if(res !== null && !res.detail) {
            await loadRepData();
            showRepAlert("Success", "Action completed.", true);
        } else {
            handleFriendlyRepError(res, "action");
        }
    } catch(e) { window.closeModal('repConfirmModal'); showRepAlert("Error", "Check network connection.", false); }
    btn.disabled = false; btn.innerText = "Confirm";
}

// =================================================================
// 8. ERROR HANDLING & UI HELPERS
// =================================================================
function handleFriendlyRepError(res, type) {
    let msg = "An unexpected error occurred.";
    let title = "Action Blocked";

    if (res && res.detail) {
        const detail = JSON.stringify(res.detail).toLowerCase();
        if (detail.includes("verified and cannot be modified")) {
            title = "Verification Lock";
            msg = "This record is verified. To modify its progress, please ask an admin to unverify it first.";
        } else if (detail.includes("completed and verified records are locked")) {
            title = "History Locked";
            msg = "Resolved and verified repairs cannot be changed. Create a new entry if needed.";
        } else if (detail.includes("already undergoing another repair")) {
            title = "Repair Conflict";
            msg = "This vehicle already has an active repair session. Complete that one first.";
        } else { msg = res.detail; }
    }
    showRepAlert(title, msg, false);
}

function populateActivePanneSelect(id, list) {
    const el = getRepEl(id); if(!el) return;
    const activeOnes = list.filter(p => p.status === 'active');
    
    let opt = `<option value="">Select Active Panne...</option>`;
    if(activeOnes.length === 0) opt = `<option disabled>No Broken Vehicles Found</option>`;
    else opt += activeOnes.map(i => `<option value="${i.id}">#${i.id} - ${i.description.substring(0,35)}...</option>`).join('');
    el.innerHTML = opt;
}

window.openViewRepModal = function(id) {
    const log = allRepLogs.find(l => l.id === id);
    if (!log) return;
    const panne = repOptions.pannes.find(p => p.id === log.panne_id);
    const garage = repOptions.garages.find(g => g.id === log.garage_id);

    const content = `
        <div class="space-y-4">
            <div class="bg-slate-800/50 p-3 rounded border border-slate-700">
                <span class="text-slate-500 text-[10px] uppercase block mb-1">Issue Details</span>
                <span class="text-white text-sm">#${log.panne_id} - ${panne?.description || 'N/A'}</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div><span class="text-slate-500 text-[10px] uppercase block">Garage</span><span class="text-white text-xs">${garage?.nom_garage || '-'}</span></div>
                <div><span class="text-slate-500 text-[10px] uppercase block">Cost</span><span class="text-emerald-400 font-bold text-xs">BIF ${log.cost.toFixed(2)}</span></div>
            </div>
            <div class="flex justify-between items-center bg-blue-500/10 p-2 rounded">
                <span class="text-slate-400 text-[10px] uppercase">Progress</span>
                <span class="font-bold text-blue-400 uppercase text-xs">${log.status}</span>
            </div>
        </div>`;
    getRepEl('viewRepContent').innerHTML = content;
    getRepEl('viewRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.closeModal = function(id) { const el = getRepEl(id) || document.getElementById(id); if(el) el.classList.add('hidden'); }

function showRepConfirmModal(title, message, icon, color) {
    getRepEl('repConfirmTitle').innerText = title;
    getRepEl('repConfirmMessage').innerText = message;
    const btn = getRepEl('btnRepConfirmAction');
    if(btn) btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color}`;
    getRepEl('repConfirmIcon').innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    getRepEl('repConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showRepAlert(title, message, isSuccess) {
    const modal = getRepEl('repAlertModal');
    if(!modal) return;
    modal.querySelector('#repAlertTitle').innerText = title;
    modal.querySelector('#repAlertMessage').innerText = message;
    const iconDiv = modal.querySelector('#repAlertIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${isSuccess ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`;
    iconDiv.innerHTML = `<i data-lucide="${isSuccess ? 'check' : 'x'}"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(isSuccess) setTimeout(() => modal.classList.add('hidden'), 4000);
}

function populateSelect(id, list, selectedValue, labelKey, defaultText) {
    const el = getRepEl(id); if(!el) return;
    let opt = `<option value="">${defaultText}</option>`;
    if (Array.isArray(list)) opt += list.map(i => `<option value="${i.id}" ${i.id == selectedValue ? 'selected' : ''}>${i[labelKey] || i.id}</option>`).join('');
    el.innerHTML = opt;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initReparation);
else initReparation();