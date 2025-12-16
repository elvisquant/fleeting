// app/static/js/reparation.js

let allRepLogs = [];
let repOptions = { pannes: [], garages: [] };
let repUserRole = 'user';

// Action State
let repActionType = null;
let repActionId = null;
let selectedRepIds = new Set(); 

async function initReparation() {
    console.log("Reparation Module: Init");
    repUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    const search = document.getElementById('repSearch');
    const garageFilter = document.getElementById('repGarageFilter');
    const statusFilter = document.getElementById('repStatusFilter');
    const selectAll = document.getElementById('selectAllRep');
    
    if(search) search.addEventListener('input', renderRepTable);
    if(garageFilter) garageFilter.addEventListener('change', renderRepTable);
    if(statusFilter) statusFilter.addEventListener('change', renderRepTable);
    if(selectAll) selectAll.addEventListener('change', toggleRepSelectAll);
    
    // Attach Confirm Listener
    const confirmBtn = document.getElementById('btnRepConfirmAction');
    if(confirmBtn) confirmBtn.addEventListener('click', executeRepConfirmAction);

    await Promise.all([loadRepData(), fetchRepDropdowns()]);
}

async function loadRepData() {
    const tbody = document.getElementById('repLogsBody');
    if(!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    const data = await window.fetchWithAuth('/reparation'); 
    
    if (Array.isArray(data)) {
        allRepLogs = data;
        selectedRepIds.clear();
        updateRepBulkUI();
        renderRepTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load.";
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchRepDropdowns() {
    try {
        const [pannes, garages] = await Promise.all([
            window.fetchWithAuth('/panne'), 
            window.fetchWithAuth('/garage') 
        ]);

        if(pannes.items) repOptions.pannes = pannes.items;
        else if(Array.isArray(pannes)) repOptions.pannes = pannes;
        
        if(Array.isArray(garages)) repOptions.garages = garages;

        populateSelect('repGarageFilter', repOptions.garages, '', 'nom_garage', 'All Garages');
        populatePanneSelect('repPanneSelect', repOptions.pannes);

    } catch (e) { console.warn("Rep Dropdown Error:", e); }
}

function renderRepTable() {
    const tbody = document.getElementById('repLogsBody');
    if (!tbody) return;

    const search = document.getElementById('repSearch').value.toLowerCase();
    const gFilter = document.getElementById('repGarageFilter').value;
    const sFilter = document.getElementById('repStatusFilter').value;

    let filtered = allRepLogs.filter(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const gName = garage ? garage.nom_garage.toLowerCase() : "";
        const receipt = log.receipt ? log.receipt.toLowerCase() : "";
        
        const matchesSearch = gName.includes(search) || receipt.includes(search);
        const matchesGarage = gFilter === "" || log.garage_id == gFilter;
        let matchesStatus = true;
        if (sFilter === 'verified') matchesStatus = log.is_verified === true;
        if (sFilter === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesGarage && matchesStatus;
    });

    document.getElementById('repCount').innerText = `${filtered.length} records found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No records found.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(repUserRole);

    tbody.innerHTML = filtered.map(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const panne = repOptions.pannes.find(p => p.id === log.panne_id);
        
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        const progressBadge = log.status === 'Completed'
            ? `<span class="text-blue-400 text-xs font-medium bg-blue-400/10 px-2 py-0.5 rounded">Completed</span>`
            : `<span class="text-slate-400 text-xs font-medium bg-slate-700/50 px-2 py-0.5 rounded">In Progress</span>`;

        // Checkbox logic
        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedRepIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleRepRow(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
        }

        let actions = '';
        const viewBtn = `<button onclick="openViewRepModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (log.is_verified) {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed" title="Locked"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
        } else if (canManage) {
             actions = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqRepVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditRepModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="reqRepDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30">
                <td class="p-4 text-center">${checkboxHtml}</td>
                <td class="p-4">
                    <div class="text-white font-mono text-xs">Ref #${log.panne_id}</div>
                    <div class="text-xs text-slate-500 truncate max-w-[150px]">${panne ? panne.description : 'Unknown Panne'}</div>
                </td>
                <td class="p-4 text-slate-300 text-sm">${garage ? garage.nom_garage : log.garage_id}</td>
                <td class="p-4 text-right font-bold text-emerald-400">${log.cost.toFixed(2)}</td>
                <td class="p-4">${progressBadge}</td>
                <td class="p-4">${verifyBadge}</td>
                <td class="p-4 text-right">${actions}</td>
            </tr>`;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// === BULK LOGIC ===

window.toggleRepRow = function(id) {
    if (selectedRepIds.has(id)) selectedRepIds.delete(id);
    else selectedRepIds.add(id);
    updateRepBulkUI();
}

window.toggleRepSelectAll = function() {
    const mainCheck = document.getElementById('selectAllRep');
    const isChecked = mainCheck.checked;
    selectedRepIds.clear();
    
    if (isChecked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(repUserRole);
        allRepLogs.forEach(log => {
             if(canManage && !log.is_verified) selectedRepIds.add(log.id);
        });
    }
    renderRepTable();
    updateRepBulkUI();
}

function updateRepBulkUI() {
    const btn = document.getElementById('btnRepBulkVerify');
    const countSpan = document.getElementById('repSelectedCount');
    if (!btn) return;

    countSpan.innerText = selectedRepIds.size;
    if (selectedRepIds.size > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

// FIX: Replaced confirm() with Custom Modal
window.executeRepBulkVerify = function() {
    if (selectedRepIds.size === 0) return;
    
    repActionType = 'bulk-verify';
    repActionId = null;
    
    showRepConfirmModal(
        "Verify Selected?", 
        `Verify ${selectedRepIds.size} records? This cannot be undone.`, 
        "check-circle", 
        "bg-emerald-600"
    );
}

// === ACTIONS (Single) ===

window.reqRepVerify = function(id) {
    repActionType = 'verify'; 
    repActionId = id;
    showRepConfirmModal("Verify Reparation?", "This locks the record permanently.", "check-circle", "bg-green-600");
}

window.reqRepDelete = function(id) {
    repActionType = 'delete'; 
    repActionId = id;
    showRepConfirmModal("Delete Reparation?", "This cannot be undone.", "trash-2", "bg-red-600");
}

async function executeRepConfirmAction() {
    const btn = document.getElementById('btnRepConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let result;
        
        // SINGLE DELETE
        if (repActionType === 'delete') {
            result = await window.fetchWithAuth(`/reparation/${repActionId}`, 'DELETE');
        } 
        // SINGLE VERIFY (Using Bulk endpoint for consistency)
        else if (repActionType === 'verify') {
            const payload = { ids: [parseInt(repActionId)] };
            result = await window.fetchWithAuth(`/reparation/verify-bulk`, 'PUT', payload);
        }
        // BULK VERIFY
        else if (repActionType === 'bulk-verify') {
            const idList = Array.from(selectedRepIds).map(id => parseInt(id));
            const payload = { ids: idList };
            result = await window.fetchWithAuth('/reparation/verify-bulk', 'PUT', payload);
        }

        window.closeModal('repConfirmModal');
        
        // Handle Results (Delete = 204/True, Update = JSON)
        if (result !== null) {
            if (repActionType === 'bulk-verify') selectedRepIds.clear();
            await loadRepData();
            showRepAlert("Success", "Action completed.", true);
        } else {
            showRepAlert("Failed", "Action could not be completed.", false);
        }
    } catch(e) {
        window.closeModal('repConfirmModal');
        showRepAlert("Error", e.message, false);
    }
    
    btn.disabled = false; btn.innerText = "Confirm"; 
    repActionId = null; repActionType = null;
}

// === ADD/EDIT/VIEW MODALS ===

window.openAddReparationModal = function() {
    document.getElementById('repEditId').value = "";
    document.getElementById('repModalTitle').innerText = "Log Reparation";
    document.getElementById('btnSaveRep').innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> Save`;
    
    populatePanneSelect('repPanneSelect', repOptions.pannes);
    populateSelect('repGarageSelect', repOptions.garages, '', 'nom_garage', 'Select Garage');
    
    document.getElementById('repCost').value = "";
    document.getElementById('repDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('repReceipt').value = "";
    document.getElementById('repProgressStatus').value = "Inprogress";

    document.getElementById('addRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditRepModal = function(id) {
    const log = allRepLogs.find(l => l.id === id);
    if(!log) return;

    document.getElementById('repEditId').value = log.id;
    document.getElementById('repModalTitle').innerText = "Edit Reparation";
    document.getElementById('btnSaveRep').innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Update`;

    populatePanneSelect('repPanneSelect', repOptions.pannes, log.panne_id);
    populateSelect('repGarageSelect', repOptions.garages, log.garage_id, 'nom_garage', 'Select Garage');
    
    document.getElementById('repCost').value = log.cost;
    document.getElementById('repDate').value = log.repair_date.split('T')[0];
    document.getElementById('repReceipt').value = log.receipt;
    document.getElementById('repProgressStatus').value = log.status;

    document.getElementById('addRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveReparation = async function() {
    const id = document.getElementById('repEditId').value;
    const payload = {
        panne_id: parseInt(document.getElementById('repPanneSelect').value),
        garage_id: parseInt(document.getElementById('repGarageSelect').value),
        cost: parseFloat(document.getElementById('repCost').value),
        repair_date: new Date(document.getElementById('repDate').value).toISOString(),
        receipt: document.getElementById('repReceipt').value,
        status: document.getElementById('repProgressStatus').value
    };

    // FIX: Replaced alert() with showRepAlert()
    if(!payload.panne_id || !payload.garage_id || isNaN(payload.cost)) { 
        showRepAlert("Validation", "Please fill all required fields.", false); 
        return; 
    }

    const btn = document.getElementById('btnSaveRep');
    btn.disabled = true;
    
    try {
        let result;
        if(id) result = await window.fetchWithAuth(`/reparation/${id}`, 'PUT', payload);
        else result = await window.fetchWithAuth('/reparation', 'POST', payload);

        if(result && !result.detail) {
            window.closeModal('addRepModal');
            await loadRepData();
            showRepAlert("Success", "Saved successfully.", true);
        } else {
            showRepAlert("Error", result?.detail || "Failed", false);
        }
    } catch(e) { 
        showRepAlert("System Error", e.message, false); 
    }
    
    btn.disabled = false;
}

window.openViewRepModal = function(id) {
    const log = allRepLogs.find(l => l.id === id);
    if (!log) return;
    const garage = repOptions.garages.find(g => g.id === log.garage_id);
    const panne = repOptions.pannes.find(p => p.id === log.panne_id);

    const content = `
        <div class="grid grid-cols-2 gap-y-4">
            <div class="col-span-2">
                <span class="text-slate-500 text-xs uppercase block">Panne Description</span>
                <span class="text-white bg-slate-800 p-2 rounded block mt-1 text-sm">${panne ? panne.description : 'ID '+log.panne_id}</span>
            </div>
            <div><span class="text-slate-500 text-xs uppercase block">Garage</span><span class="text-white">${garage ? garage.nom_garage : log.garage_id}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Status</span><span class="text-blue-400 font-bold">${log.status}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Receipt</span><span class="text-white font-mono">${log.receipt}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Date</span><span class="text-white">${new Date(log.repair_date).toLocaleDateString()}</span></div>
            <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                <span class="text-slate-500 text-xs uppercase">Total Cost</span>
                <span class="text-emerald-400 font-bold text-lg">BIF ${log.cost.toFixed(2)}</span>
            </div>
        </div>`;
    document.getElementById('viewRepContent').innerHTML = content;
    document.getElementById('viewRepModal').classList.remove('hidden');
}

// Helpers
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }

function showRepConfirmModal(t, m, i, c) {
    const modal = document.getElementById('repConfirmModal');
    if(!modal) return;
    document.getElementById('repConfirmTitle').innerText = t;
    document.getElementById('repConfirmMessage').innerText = m;
    const btn = document.getElementById('btnRepConfirmAction');
    btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${c}`;
    
    // Icon Logic
    const iconDiv = document.getElementById('repConfirmIcon');
    if(iconDiv) {
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${c.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
        iconDiv.innerHTML = `<i data-lucide="${i}" class="w-6 h-6"></i>`;
    }

    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showRepAlert(title, message, isSuccess) {
    const modal = document.getElementById('repAlertModal');
    if(!modal) { alert(message); return; }
    document.getElementById('repAlertTitle').innerText = title;
    document.getElementById('repAlertMessage').innerText = message;
    
    const iconDiv = document.getElementById('repAlertIcon');
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

function populateSelect(id, list, sel, label, def) {
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = `<option value="">${def}</option>` + list.map(i => `<option value="${i.id}" ${i.id==sel?'selected':''}>${i[label]||i.name}</option>`).join('');
}
function populatePanneSelect(id, list, sel) {
    const el = document.getElementById(id);
    if(!el) return;
    if(!list || list.length === 0) { el.innerHTML = '<option disabled>No Active Pannes</option>'; return; }
    el.innerHTML = `<option value="">Select Panne</option>` + list.map(i => {
        const desc = i.description ? i.description.substring(0,30)+'...' : 'No Desc';
        return `<option value="${i.id}" ${i.id==sel?'selected':''}>#${i.id}: ${desc}</option>`;
    }).join('');
}