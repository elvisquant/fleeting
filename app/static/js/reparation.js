// app/static/js/reparation.js

// --- GLOBAL STATE ---
let allRepLogs = [];
let repOptions = { pannes: [], garages: [] };
let repUserRole = 'user';

// --- PAGINATION & FILTER STATE ---
let repCurrentPage = 1;
let repPageLimit = 10;
let filteredRepLogs = []; 
let selectedRepIds = new Set(); 

// --- ACTION STATE ---
let repActionType = null; // 'delete', 'verify', 'bulk-verify'
let repActionId = null;

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
    console.log("Reparation Module: Strict Verification Engine + Realistic Pagination");
    repUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    const search = getRepEl('repSearch');
    const statusFilter = getRepEl('repStatusFilter');
    const selectAll = getRepEl('selectAllRep');
    const confirmBtn = getRepEl('btnRepConfirmAction');
    
    if(search) search.addEventListener('input', () => { repCurrentPage = 1; renderRepTable(); });
    if(statusFilter) statusFilter.addEventListener('change', () => { repCurrentPage = 1; renderRepTable(); });
    if(selectAll) selectAll.addEventListener('change', toggleRepSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeRepConfirmAction);

    await Promise.all([loadRepData(), fetchRepDropdowns()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadRepData() {
    const tbody = getRepEl('repLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="animate-spin mx-auto mb-2 text-indigo-500"></i>Refreshing repair database...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/reparation/?limit=1000'); 
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            // LIFO sorting
            allRepLogs = items.sort((a, b) => b.id - a.id);
            selectedRepIds.clear(); 
            renderRepTable();
        } else {
            handleFriendlyRepError(data, "load");
        }
    } catch (e) {
        showRepAlert("Connection Error", "The server is unreachable.", false);
    }
}

async function fetchRepDropdowns() {
    try {
        const [pannes, garages] = await Promise.all([
            window.fetchWithAuth('/panne/?limit=1000'), 
            window.fetchWithAuth('/garage/') 
        ]);
        repOptions.pannes = pannes.items || pannes || [];
        repOptions.garages = garages.items || garages || [];
        
        populateSelect('repGarageSelect', repOptions.garages, '', 'nom_garage', 'Select Garage');
        
        const pSel = getRepEl('repPanneSelect');
        const activePannes = repOptions.pannes.filter(p => p.status === 'active');
        if(pSel) pSel.innerHTML = `<option value="">Select Reported Issue...</option>` + 
            activePannes.map(p => `<option value="${p.id}">PAN-${p.id}: ${p.description.substring(0,35)}...</option>`).join('');
    } catch (e) { console.warn("Dropdown load failed", e); }
}

// =================================================================
// 3. TABLE RENDERING (8 COLUMNS)
// =================================================================
function renderRepTable() {
    const tbody = getRepEl('repLogsBody');
    if (!tbody) return;

    const sVal = getRepEl('repSearch')?.value.toLowerCase() || '';
    const stVal = getRepEl('repStatusFilter')?.value || 'all';

    filteredRepLogs = allRepLogs.filter(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const gName = garage ? garage.nom_garage.toLowerCase() : "";
        const matchesSearch = gName.includes(sVal) || (log.receipt || "").toLowerCase().includes(sVal);
        let matchesStatus = true;
        if (stVal === 'verified') matchesStatus = log.is_verified === true;
        else if (stVal === 'pending') matchesStatus = log.is_verified !== true;
        return matchesSearch && matchesStatus;
    });

    updateRepPaginationUI();

    const start = (repCurrentPage - 1) * repPageLimit;
    const paginatedItems = filteredRepLogs.slice(start, start + repPageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500">No repair logs found matching these filters.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(repUserRole);

    tbody.innerHTML = paginatedItems.map(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const isLocked = log.status === 'Completed' && log.is_verified === true;

        const progressBadge = log.status === 'Completed'
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Completed</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">In Progress</span>`;

        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-slate-700 text-slate-400 border border-slate-600">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="toggleRepRow(${log.id})" ${selectedRepIds.has(log.id) ? 'checked' : ''} class="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-0 cursor-pointer">`
            : `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30">`;

        let actions = `<button onclick="openViewRepModal(${log.id})" class="p-1.5 bg-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (isLocked) {
             actions += `<span class="p-1.5 text-slate-600" title="Archived"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
             if(!log.is_verified) {
                 actions += `<button onclick="reqRepVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
             }
             actions += `
                <button onclick="openEditRepModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqRepDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-colors">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle text-white font-mono text-xs">PAN-${log.panne_id}</td>
                <td class="p-4 align-middle text-slate-300 text-sm">${garage ? garage.nom_garage : 'ID ' + log.garage_id}</td>
                <td class="p-4 align-middle text-right font-bold text-emerald-400">${log.cost.toLocaleString()}</td>
                <td class="p-4 align-middle">${progressBadge}</td>
                <td class="p-4 align-middle">${verifyBadge}</td>
                <td class="p-4 align-middle text-slate-500 text-xs">${new Date(log.repair_date).toLocaleDateString()}</td>
                <td class="p-4 align-middle text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    
    updateRepBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. VERIFICATION & ACTIONS ENGINE (FIXED)
// =================================================================
window.reqRepVerify = function(id) { 
    repActionType = 'verify'; 
    repActionId = id; 
    showRepConfirmModal("Verify Repair?", "This confirms the work is inspected. If record is Completed, it will be locked.", "shield-check", "bg-emerald-600"); 
}

window.executeRepBulkVerify = function() {
    repActionType = 'bulk-verify';
    showRepConfirmModal("Bulk Verify", `You are verifying ${selectedRepIds.size} records. Are you sure?`, "shield-check", "bg-emerald-600");
}

async function executeRepConfirmAction() {
    const btn = getRepEl('btnRepConfirmAction');
    if(!btn) return;
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let res;
        if (repActionType === 'delete') {
            res = await window.fetchWithAuth(`/reparation/${repActionId}`, 'DELETE');
        } else if (repActionType === 'verify') {
            // CRITICAL FIX: Ensure the correct endpoint and payload for single verify
            res = await window.fetchWithAuth(`/reparation/verify-bulk`, 'PUT', { ids: [parseInt(repActionId)] });
        } else if (repActionType === 'bulk-verify') {
            res = await window.fetchWithAuth('/reparation/verify-bulk', 'PUT', { ids: Array.from(selectedRepIds).map(id => parseInt(id)) });
        }

        window.closeModal('repConfirmModal');
        
        // Wait for server state to stabilize then reload
        if (res !== null) {
            await loadRepData();
            showRepAlert("Success", "Action completed and database synchronized.", true);
        } else {
            handleFriendlyRepError(res, "action");
        }
    } catch(e) { 
        window.closeModal('repConfirmModal');
        showRepAlert("Error", "Communication with server failed.", false); 
    } finally {
        btn.disabled = false; btn.innerText = "Confirm";
    }
}

// =================================================================
// 5. SAVE / MODAL LOGIC
// =================================================================
window.saveReparation = async function() {
    const id = getRepEl('repEditId').value;
    const btn = getRepEl('btnSaveRep');
    const payload = {
        panne_id: parseInt(getRepEl('repPanneSelect').value),
        garage_id: parseInt(getRepEl('repGarageSelect').value),
        cost: parseFloat(getRepEl('repCost').value) || 0,
        repair_date: new Date(getRepEl('repDate').value).toISOString(),
        receipt: getRepEl('repReceipt').value.trim(),
        status: getRepEl('repProgressStatus').value
    };

    if(!payload.panne_id || !payload.garage_id) {
        showRepAlert("Validation", "Required fields missing.", false);
        return;
    }

    btn.disabled = true; btn.innerHTML = "Saving...";
    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/reparation/${id}` : '/reparation/';
        const res = await window.fetchWithAuth(url, method, payload);
        
        if(res && !res.detail) {
            window.closeModal('addRepModal');
            await loadRepData();
            showRepAlert("Success", "Repair log updated. Vehicle status recalculated.", true);
        } else { handleFriendlyRepError(res, "save"); }
    } catch(e) { showRepAlert("Error", "System error.", false); }
    btn.disabled = false; btn.innerHTML = "Save Record";
}

window.openAddReparationModal = function() {
    getRepEl('repEditId').value = "";
    getRepEl('repModalTitle').innerText = "Log New Reparation";
    fetchRepDropdowns(); 
    getRepEl('repCost').value = "";
    getRepEl('repDate').value = new Date().toISOString().split('T')[0];
    getRepEl('repReceipt').value = "";
    getRepEl('repProgressStatus').value = "Inprogress";
    getRepEl('addRepModal').classList.remove('hidden');
}

window.openEditRepModal = function(id) {
    const log = allRepLogs.find(l => l.id === id);
    if(!log || (log.status === 'Completed' && log.is_verified)) return showRepAlert("Locked", "Historical records are immutable.", false);
    
    getRepEl('repEditId').value = log.id;
    getRepEl('repModalTitle').innerText = "Edit Repair Log";
    populateSelect('repGarageSelect', repOptions.garages, log.garage_id, 'nom_garage', 'Garage');
    
    const pSel = getRepEl('repPanneSelect');
    pSel.innerHTML = `<option value="${log.panne_id}">PAN-${log.panne_id} (Locked to this incident)</option>`;
    pSel.disabled = true;

    getRepEl('repCost').value = log.cost;
    getRepEl('repDate').value = new Date(log.repair_date).toISOString().split('T')[0];
    getRepEl('repReceipt').value = log.receipt || '';
    getRepEl('repProgressStatus').value = log.status;
    getRepEl('addRepModal').classList.remove('hidden');
}

// =================================================================
// 6. UTILITIES (PAGINATION / HELPERS)
// =================================================================
window.changeRepPage = (d) => { 
    const totalPages = Math.ceil(filteredRepLogs.length / repPageLimit);
    if(repCurrentPage + d >= 1 && repCurrentPage + d <= totalPages) {
        repCurrentPage += d; renderRepTable(); 
    }
};

function updateRepPaginationUI() {
    const totalLogs = filteredRepLogs.length;
    const totalPages = Math.ceil(totalLogs / repPageLimit) || 1;
    getRepEl('repPageIndicator').innerText = `PAGE ${repCurrentPage} OF ${totalPages}`;
    getRepEl('repCount').innerText = `${totalLogs} repairs logs in history`;
    getRepEl('prevRepPage').disabled = (repCurrentPage === 1);
    getRepEl('nextRepPage').disabled = (repCurrentPage === totalPages || totalLogs === 0);
}

window.toggleRepSelectAll = () => {
    const chk = getRepEl('selectAllRep').checked;
    selectedRepIds.clear();
    if(chk) filteredRepLogs.forEach(l => { if(!l.is_verified) selectedRepIds.add(l.id); });
    renderRepTable();
};

function updateRepBulkUI() { 
    const b = getRepEl('btnRepBulkVerify'); 
    const s = getRepEl('repSelectedCount');
    if(s) s.innerText = selectedRepIds.size;
    if(b) selectedRepIds.size ? b.classList.remove('hidden') : b.classList.add('hidden');
}

function handleFriendlyRepError(res, type) {
    let msg = "Please check your inputs.";
    if (res && res.detail) {
        const detail = JSON.stringify(res.detail).toLowerCase();
        if (detail.includes("locked")) msg = "Verified history is archived.";
        else msg = res.detail;
    }
    showRepAlert("Sync Blocked", msg, false);
}

function populateSelect(id, list, sel, key, def) {
    const el = getRepEl(id); if(!el) return;
    el.innerHTML = `<option value="">${def}</option>` + list.map(i => `<option value="${i.id}" ${i.id == sel ? 'selected' : ''}>${i[key]}</option>`).join('');
}

window.closeModal = (id) => getRepEl(id).classList.add('hidden');

function showRepConfirmModal(t, m, i, c) {
    getRepEl('repConfirmTitle').innerText = t; 
    getRepEl('repConfirmMessage').innerText = m;
    getRepEl('repConfirmIcon').innerHTML = `<i data-lucide="${i}" class="w-8 h-8"></i>`;
    getRepEl('btnRepConfirmAction').className = `flex-1 px-4 py-3 rounded-xl text-white font-bold transition ${c}`;
    getRepEl('repConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showRepAlert(t, m, s) {
    const modal = getRepEl('repAlertModal');
    modal.querySelector('#repAlertTitle').innerText = t;
    modal.querySelector('#repAlertMessage').innerText = m;
    const iconDiv = modal.querySelector('#repAlertIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${s ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`;
    iconDiv.innerHTML = `<i data-lucide="${s ? 'check' : 'x'}"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(s) setTimeout(() => modal.classList.add('hidden'), 3000);
}

document.addEventListener('DOMContentLoaded', initReparation);