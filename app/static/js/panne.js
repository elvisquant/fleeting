// app/static/js/panne.js

// --- GLOBAL STATE ---
let allPannes = [];
let panneOptions = { vehicles: [], cats: [] };
let panneUserRole = 'user';

// --- PAGINATION & FILTER STATE ---
let panneCurrentPage = 1;
let pannePageLimit = 10;
let filteredPannes = []; 

// --- ACTION STATE ---
let panneActionType = null; // 'delete', 'verify', 'bulk-verify'
let panneActionId = null;
let selectedPanneIds = new Set();

// =================================================================
// MOBILE-COMPATIBLE ELEMENT GETTER
// =================================================================
function getPanneEl(id) {
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
async function initPanne() {
    console.log("Panne Module: Final 100% Regeneration (Strict Lock + Status Locked)");
    panneUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    
    const search = getPanneEl('panneSearch');
    const vFilter = getPanneEl('panneVehicleFilter');
    const sFilter = getPanneEl('panneStatusFilter');
    const selectAll = getPanneEl('selectAllPanne');
    const confirmBtn = getPanneEl('btnPanneConfirmAction');
    
    if(search) search.addEventListener('input', () => { panneCurrentPage = 1; renderPanneTable(); });
    if(vFilter) vFilter.addEventListener('change', () => { panneCurrentPage = 1; renderPanneTable(); });
    if(sFilter) sFilter.addEventListener('change', () => { panneCurrentPage = 1; renderPanneTable(); });
    
    if(selectAll) selectAll.addEventListener('change', togglePanneSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executePanneConfirmAction);
    
    await Promise.all([fetchPanneDropdowns(), loadPanneData()]);
}

// =================================================================
// 2. DATA LOADING (LIFO)
// =================================================================
async function loadPanneData() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;
    
    // Column span 9
    tbody.innerHTML = `<tr><td colspan="9" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500"></i>Syncing breakdown reports...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/panne/?limit=1000');
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            // Newest first
            allPannes = items.sort((a, b) => b.id - a.id);
            selectedPanneIds.clear();
            renderPanneTable();
        } else {
            handleFriendlyPanneError(data, "load");
        }
    } catch (error) {
        showPanneAlert("Connection Error", "Could not reach the database.", false);
    }
}

async function fetchPanneDropdowns() {
    try {
        const [vehicles, cats] = await Promise.all([
            window.fetchWithAuth('/vehicles/?limit=1000'),
            window.fetchWithAuth('/category_panne/')
        ]);

        panneOptions.vehicles = Array.isArray(vehicles) ? vehicles : (vehicles.items || []);
        panneOptions.cats = Array.isArray(cats) ? cats : (cats.items || []);
        
        populateSelect('panneVehicleFilter', panneOptions.vehicles, '', 'plate_number', 'All Vehicles');
        populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Vehicle');
        populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Select Category');
    } catch(e) { console.warn("Dropdown sync error", e); }
}

// =================================================================
// 3. CORE RENDERING (9 COLUMNS)
// =================================================================
function renderPanneTable() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;

    const sVal = getPanneEl('panneSearch')?.value.toLowerCase() || '';
    const vVal = getPanneEl('panneVehicleFilter')?.value || '';
    const stVal = getPanneEl('panneStatusFilter')?.value || 'all';

    filteredPannes = allPannes.filter(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const matchesSearch = plate.includes(sVal) || (log.description || "").toLowerCase().includes(sVal);
        const matchesVehicle = vVal === "" || log.vehicle_id == vVal;
        
        let matchesStatus = true;
        if (stVal === 'verified') matchesStatus = log.is_verified === true;
        else if (stVal === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    updatePannePaginationUI();

    const startIdx = (panneCurrentPage - 1) * pannePageLimit;
    const paginatedItems = filteredPannes.slice(startIdx, startIdx + pannePageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="p-12 text-center text-slate-500">No incident records found.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);

    tbody.innerHTML = paginatedItems.map(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.panne_name : `-`;
        const date = new Date(log.panne_date).toLocaleDateString();
        const shortDesc = log.description ? (log.description.length > 25 ? log.description.substring(0, 25) + '...' : log.description) : '-';
        
        // --- STRICT LOCK LOGIC ---
        const isLocked = log.status === 'resolved' && log.is_verified === true;

        const pBadge = log.status === 'resolved' 
            ? `<span class="px-2 py-1 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">Resolved</span>`
            : `<span class="px-2 py-1 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Active Panne</span>`;

        const vBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="togglePanneRow(${log.id})" ${selectedPanneIds.has(log.id) ? 'checked' : ''} class="rounded border-slate-600 bg-slate-800 text-indigo-600 focus:ring-0 cursor-pointer">`
            : `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30">`;

        let actions = `<button onclick="openViewPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (isLocked) {
            actions += `<span class="p-1.5 text-slate-600 cursor-not-allowed" title="Archived"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
            // Show Verify button only if not verified
            if(!log.is_verified) {
                actions += `<button onclick="reqPanneVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
            }
            actions += `
                <button onclick="openEditPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqPanneDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30 transition-colors">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle font-mono text-white text-sm">${plate}</td>
                <td class="p-4 align-middle text-slate-400 text-sm">${catName}</td>
                <td class="p-4 align-middle text-slate-500 text-xs italic">${shortDesc}</td>
                <td class="p-4 align-middle">${pBadge}</td>
                <td class="p-4 align-middle">${vBadge}</td>
                <td class="p-4 align-middle text-slate-500 text-xs">${date}</td>
                <td class="p-4 align-middle text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    
    updatePanneBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. PAGINATION & SELECTION
// =================================================================
window.changePannePage = function(direction) {
    const totalPages = Math.ceil(filteredPannes.length / pannePageLimit);
    if (panneCurrentPage + direction >= 1 && panneCurrentPage + direction <= totalPages) {
        panneCurrentPage += direction;
        renderPanneTable();
    }
}

function updatePannePaginationUI() {
    const totalLogs = filteredPannes.length;
    const totalPages = Math.ceil(totalLogs / pannePageLimit) || 1;
    const indicator = getPanneEl('pannePageIndicator');
    const countEl = getPanneEl('panneCount');
    if(indicator) indicator.innerText = `Page ${panneCurrentPage} / ${totalPages}`;
    if(countEl) countEl.innerText = `${totalLogs} records total`;
    getPanneEl('prevPannePage').disabled = (panneCurrentPage === 1);
    getPanneEl('nextPannePage').disabled = (panneCurrentPage === totalPages || totalLogs === 0);
}

window.togglePanneRow = (id) => { selectedPanneIds.has(id) ? selectedPanneIds.delete(id) : selectedPanneIds.add(id); updatePanneBulkUI(); };

window.togglePanneSelectAll = function() {
    const mainCheck = getPanneEl('selectAllPanne');
    selectedPanneIds.clear();
    if (mainCheck.checked) {
        filteredPannes.forEach(log => { if(['admin', 'superadmin', 'charoi'].includes(panneUserRole) && !log.is_verified) selectedPanneIds.add(log.id); });
    }
    renderPanneTable();
}

function updatePanneBulkUI() {
    const btn = getPanneEl('btnPanneBulkVerify');
    const span = getPanneEl('panneSelectedCount');
    if (span) span.innerText = selectedPanneIds.size;
    if (btn) selectedPanneIds.size > 0 ? btn.classList.remove('hidden') : btn.classList.add('hidden');
}

// =================================================================
// 5. THE CONFIRMATION ENGINE
// =================================================================
window.executePanneBulkVerify = function() {
    panneActionType = 'bulk-verify';
    showPanneConfirmModal("Bulk Verify", `Verify ${selectedPanneIds.size} breakdown reports? This locks Resolved records.`, "shield-check", "bg-emerald-600");
}

window.reqPanneVerify = function(id) { 
    panneActionType = 'verify'; panneActionId = id; 
    showPanneConfirmModal("Verify Report", "Review and lock this incident for archive.", "check-circle", "bg-emerald-600"); 
}

window.reqPanneDelete = function(id) { 
    panneActionType = 'delete'; panneActionId = id; 
    showPanneConfirmModal("Delete Report", "Permanently remove this log? Fleet status will re-sync.", "trash-2", "bg-red-600"); 
}

async function executePanneConfirmAction() {
    const btn = getPanneEl('btnPanneConfirmAction');
    if(!btn) return;
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let res;
        if (panneActionType === 'delete') {
            res = await window.fetchWithAuth(`/panne/${panneActionId}`, 'DELETE');
        } else if (panneActionType === 'verify') {
            res = await window.fetchWithAuth(`/panne/verify-bulk`, 'PUT', { ids: [parseInt(panneActionId)] });
        } else if (panneActionType === 'bulk-verify') {
            res = await window.fetchWithAuth('/panne/verify-bulk', 'PUT', { ids: Array.from(selectedPanneIds).map(id => parseInt(id)) });
        }

        window.closeModal('panneConfirmModal');
        if (res !== null && !res.detail) {
            await loadPanneData();
            showPanneAlert("Success", "Fleet status successfully synchronized.", true);
        } else {
            handleFriendlyPanneError(res, "action");
        }
    } catch(e) { showPanneAlert("Error", "Server sync failed.", false); }
    btn.disabled = false; btn.innerText = "Confirm";
}

// =================================================================
// 6. SAVE & MODAL LOGIC (STATUS DISABLED)
// =================================================================
window.openAddPanneModal = function() {
    getPanneEl('panneEditId').value = "";
    getPanneEl('panneModalTitle').innerText = "Report Panne";
    populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Category');
    getPanneEl('panneDesc').value = "";
    getPanneEl('panneDate').value = new Date().toISOString().split('T')[0];
    
    // STRICT RULE: Status always disabled
    const s = getPanneEl('panneStatusSelect');
    s.value = "active";
    s.disabled = true;

    getPanneEl('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if(!log || (log.status === 'resolved' && log.is_verified)) {
        showPanneAlert("Locked", "Verified and Resolved reports are archived.", false);
        return;
    }
    getPanneEl('panneEditId').value = log.id;
    getPanneEl('panneModalTitle').innerText = "Update Breakdown";
    populateSelect('panneVehicleSelect', panneOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, log.category_panne_id, 'panne_name', 'Category');
    getPanneEl('panneDesc').value = log.description || '';
    getPanneEl('panneDate').value = new Date(log.panne_date).toISOString().split('T')[0];
    
    // STRICT RULE: Status always disabled
    const s = getPanneEl('panneStatusSelect');
    s.value = log.status;
    s.disabled = true;

    getPanneEl('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.savePanne = async function() {
    const id = getPanneEl('panneEditId').value;
    const btn = getPanneEl('btnSavePanne');
    
    const payload = {
        vehicle_id: parseInt(getPanneEl('panneVehicleSelect').value),
        category_panne_id: parseInt(getPanneEl('panneCatSelect').value),
        description: getPanneEl('panneDesc').value.trim(),
        panne_date: new Date(getPanneEl('panneDate').value).toISOString(),
        status: getPanneEl('panneStatusSelect').value // Always 'active' for new
    };

    if(!payload.vehicle_id || !payload.description) return showPanneAlert("Validation", "Required fields missing.", false);

    btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4 mr-2"></i> Saving...`;
    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/panne/${id}` : '/panne/';
        const res = await window.fetchWithAuth(url, method, payload);
        if(res && !res.detail) {
            window.closeModal('addPanneModal');
            await loadPanneData(); // Use correctly spelled function
            showPanneAlert("Success", "Incident reported. Fleet: Panne.", true);
        } else {
            handleFriendlyPanneError(res, "save");
        }
    } catch(e) { showPanneAlert("Error", "Save failed.", false); }
    btn.disabled = false; btn.innerHTML = "Save Report";
}

// =================================================================
// 7. VIEW & HELPERS
// =================================================================
window.openViewPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    const v = panneOptions.vehicles.find(x => x.id === log.vehicle_id);
    const content = `
        <div class="space-y-4">
            <div class="bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                <span class="text-slate-500 text-[10px] uppercase font-bold block mb-1">Vehicle</span>
                <span class="text-white font-mono text-sm">${v?.plate_number || 'N/A'}</span>
            </div>
            <div>
                <span class="text-slate-500 text-[10px] uppercase block mb-1">Incident Detail</span>
                <div class="text-slate-300 text-sm bg-slate-900/50 p-4 rounded italic border border-slate-800">${log.description || 'No notes.'}</div>
            </div>
            <div class="text-[10px] text-slate-500 text-right pt-2 border-t border-slate-800">Date: ${new Date(log.panne_date).toLocaleDateString()}</div>
        </div>`;
    getPanneEl('viewPanneContent').innerHTML = content;
    getPanneEl('viewPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function handleFriendlyPanneError(res, type) {
    let msg = "Check your inputs.";
    if (res && res.detail) {
        const detail = JSON.stringify(res.detail).toLowerCase();
        if (detail.includes("already has an active breakdown")) msg = "Vehicle is already in Panne state.";
        else if (detail.includes("locked")) msg = "Archived records are immutable.";
        else msg = res.detail;
    }
    showPanneAlert("Action Blocked", msg, false);
}

function populateSelect(id, list, sel, key, def) {
    const el = getPanneEl(id); if(!el) return;
    el.innerHTML = `<option value="">${def}</option>` + list.map(i => `<option value="${i.id}" ${i.id == sel ? 'selected' : ''}>${i[key]}</option>`).join('');
}

window.closeModal = function(id) { const el = getPanneEl(id) || document.getElementById(id); if(el) el.classList.add('hidden'); }

function showPanneConfirmModal(title, message, icon, color) {
    getPanneEl('panneConfirmTitle').innerText = title;
    getPanneEl('panneConfirmMessage').innerHTML = message;
    const btn = getPanneEl('btnPanneConfirmAction');
    if(btn) btn.className = `px-4 py-2.5 text-white rounded-lg text-sm w-full font-medium ${color} hover:opacity-90 transition-all`;
    const iconDiv = getPanneEl('panneConfirmIcon');
    if(iconDiv) iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    getPanneEl('panneConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showPanneAlert(title, message, isSuccess) {
    let modal = getPanneEl('panneAlertModal');
    if(!modal) {
        modal = document.createElement('div'); modal.id = 'panneAlertModal';
        modal.className = 'fixed inset-0 z-[70] hidden bg-black/90 backdrop-blur-sm flex items-center justify-center p-4';
        modal.innerHTML = `<div class="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl p-6 text-center animate-up"><div id="panneAlertIcon" class="mb-4"></div><h3 id="panneAlertTitle" class="text-white font-bold mb-2"></h3><p id="panneAlertMessage" class="text-slate-400 text-sm mb-6"></p><button onclick="closeModal('panneAlertModal')" class="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium">Dismiss</button></div>`;
        document.body.appendChild(modal);
    }
    modal.querySelector('#panneAlertTitle').innerText = title;
    modal.querySelector('#panneAlertMessage').innerHTML = message;
    const iconDiv = modal.querySelector('#panneAlertIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${isSuccess ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`;
    iconDiv.innerHTML = `<i data-lucide="${isSuccess ? 'check' : 'x'}"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(isSuccess) setTimeout(() => modal.classList.add('hidden'), 4000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPanne);
else initPanne();