// app/static/js/reparation.js

// --- GLOBAL STATE ---
let allRepLogs = [];
let repOptions = { pannes: [], garages: [] };
let repUserRole = 'user';
let repCurrentPage = 1;
let repPageLimit = 10;
let filteredRepLogs = []; 
let selectedRepIds = new Set(); 
let repActionType = null;
let repActionId = null;

function getRepEl(id) {
    const sel = window.innerWidth < 768 ? '#app-content-mobile #' : '#app-content #';
    return document.querySelector(sel + id) || document.getElementById(id);
}

// =================================================================
// INITIALIZATION
// =================================================================
async function initReparation() {
    console.log("Reparation Module: Full Workflow Integration");
    repUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    
    const search = getRepEl('repSearch');
    const sFilter = getRepEl('repStatusFilter');
    const selectAll = getRepEl('selectAllRep');
    const confirmBtn = getRepEl('btnRepConfirmAction');
    
    if(search) search.addEventListener('input', () => { repCurrentPage = 1; renderRepTable(); });
    if(sFilter) sFilter.addEventListener('change', () => { repCurrentPage = 1; renderRepTable(); });
    if(selectAll) selectAll.addEventListener('change', toggleRepSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeRepConfirmAction);
    
    await Promise.all([loadRepData(), fetchRepDropdowns()]);
}

// =================================================================
// DATA LOADING
// =================================================================
async function loadRepData() {
    const tbody = getRepEl('repLogsBody');
    if(!tbody) return;
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="animate-spin mx-auto mb-2 text-indigo-500"></i>Refreshing mechanical logs...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/reparation/?limit=1000');
        allRepLogs = (data.items || data || []).sort((a,b) => b.id - a.id);
        selectedRepIds.clear();
        renderRepTable();
    } catch (e) { showRepAlert("Error", "Failed to fetch repair data.", false); }
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
        
        // Modal logic: Only show "active" pannes (incidents needing repair)
        const pSel = getRepEl('repPanneSelect');
        const activePannes = repOptions.pannes.filter(p => p.status === 'active');
        if(pSel) pSel.innerHTML = `<option value="">Select Active Incident...</option>` + 
            activePannes.map(p => `<option value="${p.id}">PAN-${p.id}: ${p.description.substring(0,30)}...</option>`).join('');
    } catch (e) {}
}

// =================================================================
// CORE TABLE RENDERING
// =================================================================
function renderRepTable() {
    const tbody = getRepEl('repLogsBody');
    if(!tbody) return;

    const sVal = getRepEl('repSearch')?.value.toLowerCase() || '';
    const stVal = getRepEl('repStatusFilter')?.value || 'all';

    filteredRepLogs = allRepLogs.filter(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const gName = garage ? garage.nom_garage.toLowerCase() : "";
        const matchesSearch = gName.includes(sVal) || (log.receipt || "").toLowerCase().includes(sVal);
        let matchesStatus = true;
        if(stVal === 'verified') matchesStatus = log.is_verified;
        if(stVal === 'pending') matchesStatus = !log.is_verified;
        return matchesSearch && matchesStatus;
    });

    updateRepPaginationUI();
    const items = filteredRepLogs.slice((repCurrentPage-1)*repPageLimit, repCurrentPage*repPageLimit);

    if(!items.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">No repair logs found.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(repUserRole);

    tbody.innerHTML = items.map(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const isLocked = log.status === 'Completed' && log.is_verified;

        const pBadge = log.status === 'Completed' 
            ? `<span class="px-2 py-1 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase">Completed</span>`
            : `<span class="px-2 py-1 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">In Progress</span>`;

        const vBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 uppercase">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] font-bold bg-slate-700 text-slate-400 uppercase">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="toggleRepRow(${log.id})" ${selectedRepIds.has(log.id)?'checked':''} class="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-0">`
            : `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30">`;

        let actions = `<button onclick="openViewRepModal(${log.id})" class="p-1.5 bg-slate-800 text-indigo-400 rounded hover:bg-indigo-600 hover:text-white transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(isLocked) {
            actions += `<span class="p-1.5 text-slate-600 cursor-not-allowed" title="Archived"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
            if(!log.is_verified) actions += `<button onclick="reqRepVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 rounded hover:bg-emerald-600 transition" title="Verify"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
            actions += `<button onclick="openEditRepModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-400 rounded hover:bg-amber-600 transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>`;
            actions += `<button onclick="reqRepDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 rounded hover:bg-red-600 transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30 transition-colors animate-in">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle text-white font-mono text-xs">PAN-${log.panne_id}</td>
                <td class="p-4 align-middle text-slate-300 text-sm">${garage?.nom_garage || '-'}</td>
                <td class="p-4 align-middle text-right font-bold text-emerald-400">${log.cost.toLocaleString()}</td>
                <td class="p-4 align-middle">${pBadge}</td>
                <td class="p-4 align-middle">${vBadge}</td>
                <td class="p-4 align-middle text-slate-500 text-xs">${new Date(log.repair_date).toLocaleDateString()}</td>
                <td class="p-4 align-middle text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    
    updateRepBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// SAVE & ACTIONS
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

    if(!payload.panne_id || !payload.garage_id) return showRepAlert("Error", "Panne Ref and Garage are required.", false);

    btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4 mr-2"></i> Saving...`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/reparation/${id}` : '/reparation/';
        const res = await window.fetchWithAuth(url, method, payload);
        
        if(res && !res.detail) {
            window.closeModal('addRepModal');
            await loadRepData();
            showRepAlert("Success", "Repair log updated and vehicle status synchronized.", true);
        } else { handleFriendlyRepError(res, "save"); }
    } catch(e) { showRepAlert("Error", "Server sync failed.", false); }
    
    btn.disabled = false; btn.innerHTML = "Save Record";
}

window.reqRepVerify = (id) => { repActionType='verify'; repActionId=id; showRepConfirmModal("Verify Repair", "Once verified and completed, this log cannot be changed.", "shield-check", "bg-emerald-600"); };
window.reqRepDelete = (id) => { repActionType='delete'; repActionId=id; showRepConfirmModal("Delete Repair", "Fleet status will be recalculated based on remaining incidents.", "trash-2", "bg-red-600"); };
window.executeRepBulkVerify = () => { repActionType='bulk-verify'; showRepConfirmModal("Bulk Verify", `Confirm inspection of ${selectedRepIds.size} records?`, "shield-check", "bg-emerald-600"); };

async function executeRepConfirmAction() {
    const btn = getRepEl('btnRepConfirmAction');
    btn.disabled = true;
    try {
        if(repActionType === 'delete') await window.fetchWithAuth(`/reparation/${repActionId}`, 'DELETE');
        else if(repActionType === 'verify') await window.fetchWithAuth(`/reparation/verify-bulk`, 'PUT', { ids: [parseInt(repActionId)] });
        else if(repActionType === 'bulk-verify') await window.fetchWithAuth('/reparation/verify-bulk', 'PUT', { ids: Array.from(selectedRepIds).map(i => parseInt(i)) });

        window.closeModal('repConfirmModal');
        await loadRepData();
        showRepAlert("Success", "Fleet synchronized successfully.", true);
    } catch(e) { showRepAlert("Error", "Action failed.", false); }
    btn.disabled = false;
}

// =================================================================
// MODALS & UI HELPERS
// =================================================================
window.openAddReparationModal = function() {
    getRepEl('repEditId').value = "";
    getRepEl('repModalTitle').innerText = "Log Reparation";
    fetchRepDropdowns(); // Refresh dropdowns to get new active pannes
    getRepEl('repCost').value = "";
    getRepEl('repDate').value = new Date().toISOString().split('T')[0];
    getRepEl('repReceipt').value = "";
    getRepEl('repProgressStatus').value = "Inprogress";
    getRepEl('addRepModal').classList.remove('hidden');
}

window.openEditRepModal = function(id) {
    const log = allRepLogs.find(l => l.id === id);
    if(!log || (log.status === 'Completed' && log.is_verified)) return showRepAlert("Locked", "Completed history is archived.", false);
    
    getRepEl('repEditId').value = log.id;
    getRepEl('repModalTitle').innerText = "Update Repair";
    populateSelect('repGarageSelect', repOptions.garages, log.garage_id, 'nom_garage', 'Garage');
    
    // In edit mode, allow the original panne to be selected even if status is active
    const pSel = getRepEl('repPanneSelect');
    pSel.innerHTML = `<option value="${log.panne_id}">PAN-${log.panne_id} (Linked)</option>`;
    pSel.disabled = true;

    getRepEl('repCost').value = log.cost;
    getRepEl('repDate').value = new Date(log.repair_date).toISOString().split('T')[0];
    getRepEl('repReceipt').value = log.receipt || '';
    getRepEl('repProgressStatus').value = log.status;
    getRepEl('addRepModal').classList.remove('hidden');
}

window.changeRepPage = (d) => { repCurrentPage += d; renderRepTable(); };
function updateRepPaginationUI() {
    getRepEl('repPageIndicator').innerText = `PAGE ${repCurrentPage}`;
    getRepEl('repCount').innerText = `${filteredRepLogs.length} logs found`;
    getRepEl('prevRepPage').disabled = (repCurrentPage === 1);
    const totalPages = Math.ceil(filteredRepLogs.length / repPageLimit) || 1;
    getRepEl('nextRepPage').disabled = (repCurrentPage === totalPages);
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
    let msg = "Check your input data.";
    if (res && res.detail) {
        const detail = JSON.stringify(res.detail).toLowerCase();
        if (detail.includes("already undergoing another repair")) msg = "This vehicle is already in the garage.";
        else if (detail.includes("locked")) msg = "Historical verified records are archived.";
        else msg = res.detail;
    }
    showRepAlert("Sync Blocked", msg, false);
}
function populateSelect(id, list, sel, key, def) {
    const el = getRepEl(id); if(!el) return;
    el.innerHTML = `<option value="">${def}</option>` + list.map(i => `<option value="${i.id}" ${i.id==sel?'selected':''}>${i[key]}</option>`).join('');
}
window.closeModal = (id) => getRepEl(id).classList.add('hidden');
function showRepConfirmModal(t, m, i, c) {
    getRepEl('repConfirmTitle').innerText = t; getRepEl('repConfirmMessage').innerText = m;
    getRepEl('repConfirmIcon').innerHTML = `<i data-lucide="${i}" class="w-8 h-8"></i>`;
    getRepEl('btnRepConfirmAction').className = `flex-1 px-4 py-3 rounded-xl text-white font-bold transition ${c}`;
    getRepEl('repConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}
function showRepAlert(t, m, s) {
    getRepEl('repAlertTitle').innerText = t; getRepEl('repAlertMessage').innerText = m;
    const iconDiv = getRepEl('repAlertIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${s ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`;
    iconDiv.innerHTML = `<i data-lucide="${s ? 'check' : 'x'}"></i>`;
    getRepEl('repAlertModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(s) setTimeout(() => getRepEl('repAlertModal').classList.add('hidden'), 3500);
}
document.addEventListener('DOMContentLoaded', initReparation);