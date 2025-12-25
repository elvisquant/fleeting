// app/static/js/maintenance.js

// --- GLOBAL STATE ---
let allMaintLogs = [];
let maintOptions = { vehicles: [], cats: [], garages: [] };
let maintUserRole = 'user';

// --- PAGINATION & FILTER STATE ---
let maintCurrentPage = 1;
let maintPageLimit = 10;
let filteredMaintLogs = []; 

// --- ACTION STATE ---
let maintActionType = null; 
let maintActionId = null;
let selectedMaintIds = new Set(); 

// =================================================================
// MOBILE-COMPATIBLE ELEMENT GETTER
// =================================================================
function getMaintEl(id) {
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
async function initMaintenance() {
    console.log("Maintenance Module: Column Sync + Vehicle Status Integration");
    maintUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    const searchInput = getMaintEl('maintSearch');
    const vFilter = getMaintEl('maintVehicleFilter');
    const sFilter = getMaintEl('maintStatusFilter');
    const selectAll = getMaintEl('selectAllMaint');
    const confirmBtn = getMaintEl('btnMaintConfirmAction');
    
    if(searchInput) searchInput.addEventListener('input', () => { maintCurrentPage = 1; renderMaintTable(); });
    if(vFilter) vFilter.addEventListener('change', () => { maintCurrentPage = 1; renderMaintTable(); });
    if(sFilter) sFilter.addEventListener('change', () => { maintCurrentPage = 1; renderMaintTable(); });
    
    if(selectAll) selectAll.addEventListener('change', toggleMaintSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeMaintConfirmAction);

    await Promise.all([fetchMaintDropdowns(), loadMaintData()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadMaintData() {
    const tbody = getMaintEl('maintLogsBody');
    if(!tbody) return;
    
    // Exact 9 columns for loading state
    tbody.innerHTML = `<tr><td colspan="9" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Syncing maintenance & vehicle records...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/maintenances/?limit=1000');
        const items = data.items || data;

        if (Array.isArray(items)) {
            // Sort by Date (Newest first)
            allMaintLogs = items.sort((a, b) => new Date(b.maintenance_date) - new Date(a.maintenance_date));
            selectedMaintIds.clear();
            renderMaintTable();
        } else {
            handleFriendlyMaintError(data, "load");
        }
    } catch (e) {
        showMaintAlert("Connection Error", "Could not reach the server.", false);
    }
}

async function fetchMaintDropdowns() {
    try {
        const [vehicles, cats, garages] = await Promise.all([
            window.fetchWithAuth('/vehicles/?limit=1000'),
            window.fetchWithAuth('/category_maintenance/'), 
            window.fetchWithAuth('/garage/') 
        ]);

        if(vehicles) maintOptions.vehicles = Array.isArray(vehicles) ? vehicles : (vehicles.items || []);
        if(cats) maintOptions.cats = Array.isArray(cats) ? cats : (cats.items || []);
        if(garages) maintOptions.garages = Array.isArray(garages) ? garages : (garages.items || []);
        
        populateSelect('maintVehicleFilter', maintOptions.vehicles, '', 'plate_number', 'All Vehicles');
        populateSelect('maintVehicleSelect', maintOptions.vehicles, '', 'plate_number', 'Select Vehicle');
        populateSelect('maintCatSelect', maintOptions.cats, '', 'cat_maintenance', 'Select Category');
        populateSelect('maintGarageSelect', maintOptions.garages, '', 'nom_garage', 'Select Garage');
    } catch(e) { console.warn("Dropdown load error", e); }
}

// =================================================================
// 3. CORE RENDERING (9 COLUMNS)
// =================================================================
function renderMaintTable() {
    const tbody = getMaintEl('maintLogsBody');
    if(!tbody) return;

    const searchVal = getMaintEl('maintSearch')?.value.toLowerCase() || '';
    const vFilterVal = getMaintEl('maintVehicleFilter')?.value || '';
    const sFilterVal = getMaintEl('maintStatusFilter')?.value || 'all';

    filteredMaintLogs = allMaintLogs.filter(log => {
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const matchesSearch = plate.includes(searchVal) || (log.receipt || "").toLowerCase().includes(searchVal);
        const matchesVehicle = vFilterVal === "" || log.vehicle_id == vFilterVal;
        
        let matchesStatus = true;
        if (sFilterVal === 'verified') matchesStatus = log.is_verified === true;
        else if (sFilterVal === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    updateMaintPaginationUI();

    const start = (maintCurrentPage - 1) * maintPageLimit;
    const paginatedItems = filteredMaintLogs.slice(start, start + maintPageLimit);

    if(paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-8 text-center text-slate-500">No matching records.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(maintUserRole);

    tbody.innerHTML = paginatedItems.map(log => {
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
        const garage = maintOptions.garages.find(g => g.id === log.garage_id);
        
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.cat_maintenance : '-';
        const garageName = garage ? garage.nom_garage : '-'; 
        const date = new Date(log.maintenance_date).toLocaleDateString();

        // LOCK LOGIC: Locked only if both Verified AND Resolved
        const isLocked = log.status === 'resolved' && log.is_verified === true;

        const progressBadge = log.status === 'resolved' 
            ? `<span class="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Resolved</span>`
            : `<span class="px-2 py-1 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Active</span>`;

        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="toggleMaintRow(${log.id})" ${selectedMaintIds.has(log.id) ? 'checked' : ''} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`
            : `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30">`;

        let actions = `<button onclick="openViewMaintModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(isLocked) {
            actions += `<span class="p-1.5 text-slate-600 cursor-not-allowed" title="Record Locked"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
            if(!log.is_verified) {
                actions += `<button onclick="reqMaintVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>`;
            }
            actions += `
                <button onclick="openEditMaintModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqMaintDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        }

        // Output exactly 9 <td> tags
        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30 group animate-in">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle font-mono text-white text-sm">${plate}</td>
                <td class="p-4 align-middle text-slate-400 text-xs">${catName}</td>
                <td class="p-4 align-middle text-slate-400 text-xs">${garageName}</td>
                <td class="p-4 align-middle text-right font-bold text-emerald-400">${log.maintenance_cost.toLocaleString()}</td>
                <td class="p-4 align-middle">${progressBadge}</td>
                <td class="p-4 align-middle">${verifyBadge}</td>
                <td class="p-4 align-middle text-slate-500 text-xs">${date}</td>
                <td class="p-4 align-middle text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    
    updateMaintBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. PAGINATION CONTROLS
// =================================================================
window.changeMaintPage = function(direction) {
    const totalPages = Math.ceil(filteredMaintLogs.length / maintPageLimit);
    const nextStep = maintCurrentPage + direction;

    if(nextStep >= 1 && nextStep <= totalPages) {
        maintCurrentPage = nextStep;
        renderMaintTable();
        const container = getMaintEl('maintLogsBody');
        if(container) container.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateMaintPaginationUI() {
    const indicator = getMaintEl('maintPageIndicator');
    const countEl = getMaintEl('maintLogsCount');
    const prevBtn = getMaintEl('prevMaintPage');
    const nextBtn = getMaintEl('nextMaintPage');

    const totalLogs = filteredMaintLogs.length;
    const totalPages = Math.ceil(totalLogs / maintPageLimit) || 1;

    if(indicator) indicator.innerText = `Page ${maintCurrentPage} / ${totalPages}`;
    if(prevBtn) prevBtn.disabled = (maintCurrentPage === 1);
    if(nextBtn) nextBtn.disabled = (maintCurrentPage === totalPages || totalLogs === 0);

    if(countEl) {
        const startIdx = (maintCurrentPage - 1) * maintPageLimit + 1;
        const endIdx = Math.min(startIdx + maintPageLimit - 1, totalLogs);
        countEl.innerText = totalLogs > 0 ? `Showing ${startIdx}-${endIdx} of ${totalLogs} logs` : "0 logs found";
    }
}

// =================================================================
// 5. ACTIONS & SYNC
// =================================================================
window.toggleMaintRow = function(id) {
    selectedMaintIds.has(id) ? selectedMaintIds.delete(id) : selectedMaintIds.add(id);
    updateMaintBulkUI();
}

window.toggleMaintSelectAll = function() {
    const mainCheck = getMaintEl('selectAllMaint');
    if (!mainCheck) return;
    selectedMaintIds.clear();
    if (mainCheck.checked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(maintUserRole);
        filteredMaintLogs.forEach(log => { if(canManage && !log.is_verified) selectedMaintIds.add(log.id); });
    }
    renderMaintTable();
    updateMaintBulkUI();
}

function updateMaintBulkUI() {
    const btn = getMaintEl('btnMaintBulkVerify');
    const countSpan = getMaintEl('maintSelectedCount');
    if (countSpan) countSpan.innerText = selectedMaintIds.size;
    if (btn) selectedMaintIds.size > 0 ? btn.classList.remove('hidden') : btn.classList.add('hidden');
}

window.executeMaintBulkVerify = async function() {
    maintActionType = 'bulk-verify';
    showMaintConfirmModal("Bulk Verify", `Verify ${selectedMaintIds.size} records? This may lock records marked as Resolved.`, "shield-check", "bg-emerald-600");
}

window.reqMaintVerify = function(id) { 
    maintActionType = 'verify'; 
    maintActionId = id; 
    showMaintConfirmModal("Verify Record?", "Review this record. If status is Resolved, it will be locked.", "check-circle", "bg-green-600"); 
}

window.reqMaintDelete = function(id) { 
    maintActionType = 'delete'; 
    maintActionId = id; 
    showMaintConfirmModal("Delete Record?", "Permanently delete this log? Vehicle status will be recalculated.", "trash-2", "bg-red-600"); 
}

async function executeMaintConfirmAction() {
    const btn = getMaintEl('btnMaintConfirmAction');
    if(!btn) return;
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let res;
        if (maintActionType === 'delete') res = await window.fetchWithAuth(`/maintenances/${maintActionId}`, 'DELETE');
        else if (maintActionType === 'verify') res = await window.fetchWithAuth(`/maintenances/verify-bulk`, 'PUT', { ids: [parseInt(maintActionId)] });
        else if (maintActionType === 'bulk-verify') res = await window.fetchWithAuth('/maintenances/verify-bulk', 'PUT', { ids: Array.from(selectedMaintIds).map(id => parseInt(id)) });

        window.closeModal('maintConfirmModal');
        if(res !== null && !res.detail) {
            await loadMaintData();
            showMaintAlert("Success", "Record updated and vehicle status synchronized.", true);
        } else {
            handleFriendlyMaintError(res, "action");
        }
    } catch(e) { window.closeModal('maintConfirmModal'); showMaintAlert("Error", "Server connection lost.", false); }
    btn.disabled = false; btn.innerText = "Confirm";
}

// =================================================================
// 6. SAVE LOGIC
// =================================================================
window.openAddMaintModal = function() {
    getMaintEl('maintEditId').value = "";
    getMaintEl('maintModalTitle').innerText = "Log Maintenance";
    populateSelect('maintVehicleSelect', maintOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    populateSelect('maintCatSelect', maintOptions.cats, '', 'cat_maintenance', 'Select Category');
    populateSelect('maintGarageSelect', maintOptions.garages, '', 'nom_garage', 'Select Garage');
    
    getMaintEl('maintCost').value = "";
    getMaintEl('maintDate').value = new Date().toISOString().split('T')[0];
    getMaintEl('maintReceipt').value = "";
    if(getMaintEl('maintStatusSelect')) getMaintEl('maintStatusSelect').value = "active";

    getMaintEl('addMaintModal').classList.remove('hidden');
}

window.openEditMaintModal = function(id) {
    const log = allMaintLogs.find(l => l.id === id);
    if(!log) return;
    if(log.status === 'resolved' && log.is_verified) {
        showMaintAlert("Locked", "Verified and Resolved records cannot be modified.", false);
        return;
    }

    getMaintEl('maintEditId').value = log.id;
    getMaintEl('maintModalTitle').innerText = "Edit Record";
    populateSelect('maintVehicleSelect', maintOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('maintCatSelect', maintOptions.cats, log.cat_maintenance_id, 'cat_maintenance', 'Category');
    populateSelect('maintGarageSelect', maintOptions.garages, log.garage_id, 'nom_garage', 'Garage');
    
    getMaintEl('maintCost').value = log.maintenance_cost;
    getMaintEl('maintDate').value = log.maintenance_date ? log.maintenance_date.split('T')[0] : '';
    getMaintEl('maintReceipt').value = log.receipt || '';
    if(getMaintEl('maintStatusSelect')) getMaintEl('maintStatusSelect').value = log.status;

    getMaintEl('addMaintModal').classList.remove('hidden');
}

window.saveMaintenance = async function() {
    const id = getMaintEl('maintEditId').value;
    const btn = getMaintEl('btnSaveMaint');
    const payload = {
        vehicle_id: parseInt(getMaintEl('maintVehicleSelect').value),
        cat_maintenance_id: parseInt(getMaintEl('maintCatSelect').value) || null,
        garage_id: parseInt(getMaintEl('maintGarageSelect').value) || null,
        maintenance_cost: parseFloat(getMaintEl('maintCost').value) || 0,
        maintenance_date: new Date(getMaintEl('maintDate').value).toISOString(),
        receipt: getMaintEl('maintReceipt').value.trim(),
        status: getMaintEl('maintStatusSelect').value
    };

    if(!payload.vehicle_id || !payload.receipt) {
        showMaintAlert("Validation", "Vehicle and Receipt Reference are required.", false);
        return;
    }

    btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4 mr-2"></i> Saving...`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/maintenances/${id}` : '/maintenances/';
        const res = await window.fetchWithAuth(url, method, payload);
        
        if(res && !res.detail) {
            window.closeModal('addMaintModal');
            await loadMaintData();
            showMaintAlert("Success", "Maintenance saved. Vehicle status updated.", true);
        } else {
            handleFriendlyMaintError(res, "save");
        }
    } catch(e) { showMaintAlert("Error", "A system error occurred.", false); }
    btn.disabled = false; btn.innerHTML = id ? "Update" : "Save Record";
}

// =================================================================
// 7. HELPERS
// =================================================================
function handleFriendlyMaintError(res, type) {
    let msg = "Check your connection and try again.";
    let title = "Process Blocked";

    if (res && res.detail) {
        const detail = JSON.stringify(res.detail).toLowerCase();
        if (detail.includes("already undergoing active maintenance")) {
            msg = "This vehicle is already in maintenance. Complete the previous log first.";
        } else if (detail.includes("locked")) {
            msg = "This record is verified and resolved, meaning it is archived.";
        } else { msg = res.detail; }
    }
    showMaintAlert(title, msg, false);
}

window.openViewMaintModal = function(id) {
    const log = allMaintLogs.find(l => l.id === id);
    if (!log) return;
    const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
    const garage = maintOptions.garages.find(g => g.id === log.garage_id);
    const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
    
    const content = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div><span class="text-slate-500 text-[10px] uppercase block mb-1">Vehicle</span><span class="text-white font-mono text-sm">${vehicle?.plate_number || '-'}</span></div>
                <div><span class="text-slate-500 text-[10px] uppercase block mb-1">Cost</span><span class="text-emerald-400 font-bold text-sm">BIF ${log.maintenance_cost.toLocaleString()}</span></div>
            </div>
            <div class="p-3 bg-slate-800/50 rounded-lg border border-slate-700 flex justify-between">
                <span class="text-slate-500 text-[10px] uppercase">Status</span>
                <span class="font-bold text-blue-400 uppercase text-xs">${log.status}</span>
            </div>
            <div class="text-xs text-slate-300">
                <p>Category: ${cat?.cat_maintenance || '-'}</p>
                <p>Garage: ${garage?.nom_garage || '-'}</p>
                <p class="mt-2 font-mono text-slate-400">Ref: ${log.receipt || '-'}</p>
            </div>
            <div class="text-[10px] text-slate-500 text-right pt-2 border-t border-slate-800">Date: ${new Date(log.maintenance_date).toLocaleDateString()}</div>
        </div>`;
    getMaintEl('viewMaintContent').innerHTML = content;
    getMaintEl('viewMaintModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.closeModal = function(id) { const el = getMaintEl(id) || document.getElementById(id); if(el) el.classList.add('hidden'); }

function showMaintConfirmModal(title, message, icon, color) {
    getMaintEl('maintConfirmTitle').innerText = title;
    getMaintEl('maintConfirmMessage').innerText = message;
    const btn = getMaintEl('btnMaintConfirmAction');
    if(btn) btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color} hover:opacity-90`;
    getMaintEl('maintConfirmIcon').innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    getMaintEl('maintConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showMaintAlert(title, message, isSuccess) {
    let modal = getMaintEl('maintAlertModal');
    if(!modal) {
        modal = document.createElement('div');
        modal.id = 'maintAlertModal';
        modal.className = 'fixed inset-0 z-[70] hidden bg-black/90 backdrop-blur-sm flex items-center justify-center p-4';
        modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl p-6 text-center animate-up"><div id="maintAlertIcon" class="mb-4"></div><h3 id="maintAlertTitle" class="text-white font-bold mb-2"></h3><p id="maintAlertMessage" class="text-slate-400 text-sm mb-6"></p><button onclick="closeModal('maintAlertModal')" class="w-full py-2 bg-blue-600 text-white rounded-lg text-sm">Dismiss</button></div>`;
        document.body.appendChild(modal);
    }
    modal.querySelector('#maintAlertTitle').innerText = title;
    modal.querySelector('#maintAlertMessage').innerHTML = message;
    const iconDiv = modal.querySelector('#maintAlertIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${isSuccess ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`;
    iconDiv.innerHTML = `<i data-lucide="${isSuccess ? 'check' : 'x'}"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(isSuccess) setTimeout(() => modal.classList.add('hidden'), 4000);
}

function populateSelect(id, list, selectedValue, labelKey, defaultText) {
    const el = getMaintEl(id); if(!el) return;
    let opt = `<option value="">${defaultText}</option>`;
    if (Array.isArray(list)) opt += list.map(i => `<option value="${i.id}" ${i.id == selectedValue ? 'selected' : ''}>${i[labelKey] || i.id}</option>`).join('');
    el.innerHTML = opt;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMaintenance);
else initMaintenance();