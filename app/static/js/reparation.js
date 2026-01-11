/**
 * app/static/js/reparation.js
 * 
 * Professional Fleet Reparation Module
 * Handles mechanical repair logging, garage management, and status validation.
 * 100% Full Generation - All logic preserved.
 */

let allRepLogs = [];
let repOptions = { pannes: [], garages: [] };
let repUserRole = 'user';
let repCurrentPage = 1;
let repPageLimit = 10;
let filteredRepLogs = []; 
let selectedRepIds = new Set(); 
let repActionType = null;
let repActionId = null;

/**
 * Professional Element Getter
 * Ensures compatibility between Desktop and Mobile SPA containers
 */
function getRepEl(id) {
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
async function initReparation() {
    console.log("Reparation Module: Initializing Mechanical Workflow Interface");
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

/**
 * 2. DATA LOADING
 */
async function loadRepData() {
    const tbody = getRepEl('repLogsBody');
    if(!tbody) return;

    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
        <div class="text-[10px] font-black uppercase tracking-widest text-slate-500">Syncing mechanical records...</div>
    </td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/reparation/?limit=1000');
        // LIFO: Newest first
        allRepLogs = (Array.isArray(data) ? data : (data.items || [])).sort((a,b) => b.id - a.id);
        selectedRepIds.clear();
        renderRepTable();
    } catch (e) { 
        console.error("Load failed", e);
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-500 uppercase font-black">Connection Failure</td></tr>`;
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
        
        populateSelect('repGarageSelect', repOptions.garages, '', 'nom_garage', 'Executing Garage');
        
        const pSel = getRepEl('repPanneSelect');
        const activePannes = repOptions.pannes.filter(p => p.status === 'active');
        if(pSel) pSel.innerHTML = `<option value="">-- CHOOSE INCIDENT --</option>` + 
            activePannes.map(p => `<option value="${p.id}">PAN-${p.id}: ${p.description.substring(0,40)}...</option>`).join('');
    } catch (e) { console.warn("Dropdown sync error", e); }
}

/**
 * 3. CORE RENDERING ENGINE (8 COLUMNS)
 */
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
        if(stVal === 'verified') matchesStatus = log.is_verified === true;
        if(stVal === 'pending') matchesStatus = log.is_verified !== true;
        return matchesSearch && matchesStatus;
    });

    updateRepPaginationUI();
    const items = filteredRepLogs.slice((repCurrentPage-1)*repPageLimit, repCurrentPage*repPageLimit);

    if(!items.length) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-600 italic font-bold uppercase tracking-widest">${window.t('no_records')}</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(repUserRole);

    tbody.innerHTML = items.map(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const isLocked = log.status === 'Completed' && log.is_verified;

        const pBadge = log.status === 'Completed' 
            ? `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-tighter">Completed</span>`
            : `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-tighter">In Progress</span>`;

        const vBadge = log.is_verified 
            ? `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-tighter">Verified</span>`
            : `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-slate-800 text-slate-500 border border-slate-700 tracking-tighter">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="toggleRepRow(${log.id})" ${selectedRepIds.has(log.id)?'checked':''} class="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer">`
            : `<input type="checkbox" disabled class="rounded border-slate-800 bg-slate-950 opacity-20">`;

        let actions = `
            <button onclick="openViewRepModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 rounded-lg border border-slate-700 hover:bg-blue-600 hover:text-white transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(isLocked) {
            actions += `<span class="p-1.5 text-slate-700 cursor-not-allowed" title="Archived"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
            if(!log.is_verified) {
                actions += `<button onclick="reqRepVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 rounded-lg border border-slate-700 hover:bg-emerald-600 hover:text-white transition" title="Verify"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
            }
            actions += `
                <button onclick="openEditRepModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-500 rounded-lg border border-slate-700 hover:bg-amber-600 hover:text-white transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqRepDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 rounded-lg border border-slate-700 hover:bg-red-600 hover:text-white transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-all duration-200">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle text-white font-mono text-xs font-black uppercase tracking-widest">PAN-${log.panne_id}</td>
                <td class="p-4 align-middle text-slate-300 text-[11px] font-bold uppercase tracking-tight">${garage?.nom_garage || 'ID '+log.garage_id}</td>
                <td class="p-4 align-middle text-right font-black text-emerald-400 font-mono">BIF ${log.cost.toLocaleString()}</td>
                <td class="p-4 align-middle text-center">${pBadge}</td>
                <td class="p-4 align-middle text-center">${vBadge}</td>
                <td class="p-4 align-middle text-slate-500 text-[10px] font-mono">${new Date(log.repair_date).toLocaleDateString()}</td>
                <td class="p-4 align-middle text-right flex justify-end gap-1.5">${actions}</td>
            </tr>`;
    }).join('');
    
    updateRepBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

/**
 * 4. THE CORE VERIFICATION ENGINE
 */
window.executeRepBulkVerify = function() {
    repActionType = 'bulk-verify';
    showRepConfirmModal("System Validation", `Verify ${selectedRepIds.size} mechanical records? This archives completed entries.`, "shield-check", "bg-emerald-700");
}

window.reqRepVerify = (id) => { 
    repActionType='verify'; 
    repActionId=id; 
    showRepConfirmModal("Archive Log", "Validate this repair? Resolved records will be locked permanently.", "check-circle", "bg-emerald-700"); 
};

window.reqRepDelete = function(id) { 
    repActionType = 'delete'; 
    repActionId = id; 
    showRepConfirmModal("Purge Protocol", "Are you sure? This removes the repair log and re-syncs fleet state.", "trash-2", "bg-red-900"); 
}

async function executeRepConfirmAction() {
    const btn = getRepEl('btnRepConfirmAction');
    if(!btn) return;
    const original = btn.innerHTML;
    btn.disabled = true; btn.innerText = "SYNCING...";

    try {
        let res;
        if (repActionType === 'delete') {
            res = await window.fetchWithAuth(`/reparation/${repActionId}`, 'DELETE');
        } else if (repActionType === 'verify') {
            res = await window.fetchWithAuth('/reparation/verify-bulk', 'PUT', { ids: [parseInt(repActionId)] });
        } else if (repActionType === 'bulk-verify') {
            res = await window.fetchWithAuth('/reparation/verify-bulk', 'PUT', { ids: Array.from(selectedRepIds).map(i => parseInt(i)) });
        }

        window.closeModal('repConfirmModal');
        await loadRepData();
        showRepAlert("Success", "Incident ledger synchronized.", true);
        
    } catch(e) { 
        showRepAlert("Error", "Server uplink failed.", false); 
    } finally {
        btn.disabled = false; btn.innerHTML = original;
    }
}

/**
 * 5. MODAL SAVE LOGIC
 */
window.saveReparation = async function() {
    const id = getRepEl('repEditId').value;
    const btn = getRepEl('btnSaveRep');
    const original = btn.innerHTML;

    const payload = {
        panne_id: parseInt(getRepEl('repPanneSelect').value),
        garage_id: parseInt(getRepEl('repGarageSelect').value),
        cost: parseFloat(getRepEl('repCost').value) || 0,
        repair_date: new Date(getRepEl('repDate').value).toISOString(),
        receipt: getRepEl('repReceipt').value.trim(),
        status: getRepEl('repProgressStatus').value
    };

    if(!payload.panne_id || !payload.garage_id) return showRepAlert("Validation", "Required parameters missing.", false);

    btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/reparation/${id}` : '/reparation/';
        const res = await window.fetchWithAuth(url, method, payload);
        if(res && !res.detail) {
            window.closeModal('addRepModal');
            await loadRepData();
            showRepAlert("Success", "Mechanical log committed.", true);
        } else { showRepAlert("Action Blocked", res.detail, false); }
    } catch(e) { showRepAlert("Error", "Transaction aborted.", false); }
    btn.disabled = false; btn.innerHTML = original;
    if(window.lucide) window.lucide.createIcons();
}

/**
 * 6. UI MODAL HELPERS
 */
window.openAddReparationModal = function() {
    getRepEl('repEditId').value = "";
    getRepEl('repModalTitle').innerText = "Log Garage Repair";
    fetchRepDropdowns(); 
    getRepEl('repCost').value = "";
    getRepEl('repDate').value = new Date().toISOString().split('T')[0];
    getRepEl('repReceipt').value = "";
    
    const pSel = getRepEl('repPanneSelect');
    pSel.disabled = false;
    
    getRepEl('addRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditRepModal = function(id) {
    const log = allRepLogs.find(l => l.id === id);
    if(!log) return;
    if(log.status === 'Completed' && log.is_verified) return showRepAlert("Access Denied", "Archived record is immutable.", false);
    
    getRepEl('repEditId').value = log.id;
    getRepEl('repModalTitle').innerText = "Update Incident Log";
    populateSelect('repGarageSelect', repOptions.garages, log.garage_id, 'nom_garage', 'Executing Garage');
    
    const pSel = getRepEl('repPanneSelect');
    pSel.innerHTML = `<option value="${log.panne_id}">PAN-${log.panne_id} (Linked)</option>`;
    pSel.disabled = true; 

    getRepEl('repCost').value = log.cost;
    getRepEl('repDate').value = new Date(log.repair_date).toISOString().split('T')[0];
    getRepEl('repReceipt').value = log.receipt || '';
    getRepEl('repProgressStatus').value = log.status;
    getRepEl('addRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openViewRepModal = function(id) {
    const log = allRepLogs.find(l => l.id === id);
    if (!log) return;
    const g = repOptions.garages.find(x => x.id === log.garage_id);
    const content = `
        <div class="space-y-6 text-left animate-up">
            <div class="flex justify-between items-start border-b border-slate-800 pb-4">
                <div>
                    <h4 class="text-2xl font-black text-white uppercase tracking-tighter">Repair Log #${log.id}</h4>
                    <p class="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1 italic font-mono">Linked to Panne: PAN-${log.panne_id}</p>
                </div>
                ${getStatusBadge(log.status)}
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
                    <span class="label-text">Expenditure</span>
                    <p class="text-emerald-400 text-sm font-black font-mono">BIF ${log.cost.toLocaleString()}</p>
                </div>
                <div class="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
                    <span class="label-text">Invoice Ref</span>
                    <p class="text-white text-[11px] font-mono font-bold tracking-widest">${log.receipt || 'NONE'}</p>
                </div>
            </div>

            <div class="bg-slate-950 p-5 rounded-[2rem] border border-slate-800 shadow-inner">
                <span class="label-text mb-2 block tracking-widest uppercase">Service Provider</span>
                <p class="text-slate-300 text-xs font-bold uppercase tracking-widest">${g?.nom_garage || 'Internal Repair'}</p>
            </div>

            <div class="flex justify-between items-center pt-4 border-t border-slate-800">
                <span class="text-[10px] text-slate-600 font-black uppercase tracking-widest">Repair Date: ${new Date(log.repair_date).toLocaleDateString()}</span>
                <span class="text-[10px] ${log.is_verified ? 'text-emerald-500' : 'text-slate-700'} font-black uppercase tracking-widest">
                    ${log.is_verified ? 'Validation Secured' : 'System Pending'}
                </span>
            </div>
        </div>`;
    getRepEl('viewRepContent').innerHTML = content;
    getRepEl('viewRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

/**
 * Pagination & Bulk Logic
 */
window.changeRepPage = (d) => { 
    const totalPages = Math.ceil(filteredRepLogs.length / repPageLimit) || 1;
    if(repCurrentPage + d >= 1 && repCurrentPage + d <= totalPages) {
        repCurrentPage += d; renderRepTable(); 
        const container = getRepEl('repLogsBody');
        if(container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

function updateRepPaginationUI() {
    const totalLogs = filteredRepLogs.length;
    const totalPages = Math.ceil(totalLogs / repPageLimit) || 1;
    getRepEl('repPageIndicator').innerText = `PHASE ${repCurrentPage} / ${totalPages}`;
    getRepEl('repCount').innerText = `${totalLogs} records synchronized`;
    getRepEl('prevRepPage').disabled = (repCurrentPage === 1);
    getRepEl('nextRepPage').disabled = (repCurrentPage === totalPages || totalLogs === 0);
}

window.toggleRepRow = (id) => { selectedRepIds.has(id) ? selectedRepIds.delete(id) : selectedRepIds.add(id); updateRepBulkUI(); };

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
    if(b) selectedRepIds.size > 0 ? b.classList.remove('hidden') : b.classList.add('hidden');
}

function populateSelect(id, list, sel, key, def) {
    const el = getRepEl(id); if(!el) return;
    el.innerHTML = `<option value="">-- ${def.toUpperCase()} --</option>` + list.map(i => `<option value="${i.id}" ${i.id == sel ? 'selected' : ''}>${i[key]}</option>`).join('');
}

window.closeModal = (id) => getRepEl(id).classList.add('hidden');

function showRepConfirmModal(t, m, i, c) {
    getRepEl('repConfirmTitle').innerText = t.toUpperCase(); 
    getRepEl('repConfirmMessage').innerText = m;
    const iconDiv = getRepEl('repConfirmIcon');
    iconDiv.innerHTML = `<i data-lucide="${i}" class="w-8 h-8"></i>`;
    iconDiv.className = `w-16 h-16 rounded-[1.5rem] bg-slate-900 flex items-center justify-center mx-auto mb-6 text-white border border-slate-800 shadow-2xl`;
    const btn = getRepEl('btnRepConfirmAction');
    btn.className = `flex-1 px-4 py-4 rounded-2xl text-white font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all ${c}`;
    getRepEl('repConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showRepAlert(t, m, s) {
    getRepEl('repAlertTitle').innerText = t.toUpperCase();
    getRepEl('repAlertMessage').innerText = m;
    const iconDiv = getRepEl('repAlertIcon');
    const color = s ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10';
    if(iconDiv) {
        iconDiv.className = `w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${color} border border-current/20`;
        iconDiv.innerHTML = `<i data-lucide="${s ? 'check' : 'x'}" class="w-8 h-8"></i>`;
    }
    getRepEl('repAlertModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(s) setTimeout(() => closeModal('repAlertModal'), 3000);
}

initReparation();