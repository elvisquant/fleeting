/**
 * app/static/js/panne.js
 * 
 * Professional Fleet Panne (Breakdown) Module
 * Handles incident reporting, verification, and fleet status synchronization.
 * 100% Full Generation - All logic preserved.
 */

// --- GLOBAL STATE ---
let allPannes = [];
let panneOptions = { vehicles: [], cats: [] };
let panneUserRole = 'user';

// --- PAGINATION & FILTER STATE ---
let panneCurrentPage = 1;
let pannePageLimit = 10;
let filteredPannes = []; 

// --- ACTION STATE ---
let panneActionType = null; 
let panneActionId = null;
let selectedPanneIds = new Set();

/**
 * Professional Element Getter
 * Ensures compatibility between Desktop and Mobile SPA containers
 */
function getPanneEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

/**
 * Initialization
 */
async function initPanne() {
    console.log("Panne Module: Initializing Professional Fleet Incident UI");
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
// 2. DATA SYNCHRONIZATION
// =================================================================

async function loadPanneData() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
        <div class="text-[10px] font-black uppercase tracking-widest">${window.t('loading')}</div>
    </td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/panne/?limit=1000');
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            // LIFO: Newest incidents at the top
            allPannes = items.sort((a, b) => b.id - a.id);
            selectedPanneIds.clear();
            renderPanneTable();
        } else {
            handleFriendlyPanneError(data, "load");
        }
    } catch (error) {
        showPanneAlert("Sync Error", "Connection to fleet database lost.", false);
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
        populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Unit');
        populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'System Category');
    } catch(e) { console.warn("Dropdown sync error", e); }
}

// =================================================================
// 3. TABLE RENDERING ENGINE
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
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-600 italic font-medium uppercase tracking-widest">${window.t('no_records')}</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);

    tbody.innerHTML = paginatedItems.map(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.panne_name : `-`;
        const date = new Date(log.panne_date).toLocaleDateString(window.APP_LOCALE, {month:'short', day:'2-digit'});
        const shortDesc = log.description ? (log.description.length > 30 ? log.description.substring(0, 30) + '...' : log.description) : 'No detail';
        
        // Strict Lock Logic for verified records
        const isLocked = log.status === 'resolved' && log.is_verified === true;

        const pBadge = log.status === 'resolved' 
            ? `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-tighter">Fixed</span>`
            : `<span class="px-2 py-0.5 rounded text-[9px] font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase tracking-tighter">Active Panne</span>`;

        const vBadge = log.is_verified 
            ? `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-tighter">Verified</span>`
            : `<span class="px-2 py-0.5 rounded text-[9px] uppercase font-black bg-slate-800 text-slate-500 border border-slate-700 tracking-tighter">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="togglePanneRow(${log.id})" ${selectedPanneIds.has(log.id) ? 'checked' : ''} class="rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-0 cursor-pointer">`
            : `<input type="checkbox" disabled class="rounded border-slate-800 bg-slate-950 opacity-20 cursor-not-allowed">`;

        let actions = `
            <button onclick="openViewPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 rounded-lg border border-slate-700 hover:bg-blue-600 hover:text-white transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (isLocked) {
            actions += `<span class="p-1.5 text-slate-700 cursor-not-allowed" title="Archived"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
            if(!log.is_verified) {
                actions += `<button onclick="reqPanneVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 rounded-lg border border-slate-700 hover:bg-emerald-600 hover:text-white transition" title="Verify"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
            }
            actions += `
                <button onclick="openEditPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-500 rounded-lg border border-slate-700 hover:bg-amber-600 hover:text-white transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqPanneDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 rounded-lg border border-slate-700 hover:bg-red-600 hover:text-white transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-all duration-200">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle">
                    <div class="font-black text-white text-xs uppercase tracking-widest">${plate}</div>
                </td>
                <td class="p-4 align-middle text-slate-400 text-[11px] font-bold uppercase">${catName}</td>
                <td class="p-4 align-middle text-slate-500 text-[10px] font-medium italic truncate max-w-[200px]">${shortDesc}</td>
                <td class="p-4 align-middle text-center">${pBadge}</td>
                <td class="p-4 align-middle text-center">${vBadge}</td>
                <td class="p-4 align-middle text-slate-500 text-[10px] font-mono">${date}</td>
                <td class="p-4 align-middle text-right flex justify-end gap-1.5">${actions}</td>
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
    if(indicator) indicator.innerText = `PHASE ${panneCurrentPage} / ${totalPages}`;
    if(countEl) countEl.innerText = `${totalLogs} records synchronized`;
    getPanneEl('prevPannePage').disabled = (panneCurrentPage === 1);
    getPanneEl('nextPannePage').disabled = (panneCurrentPage === totalPages || totalLogs === 0);
}

window.togglePanneRow = (id) => { 
    selectedPanneIds.has(id) ? selectedPanneIds.delete(id) : selectedPanneIds.add(id); 
    updatePanneBulkUI(); 
};

window.togglePanneSelectAll = function() {
    const mainCheck = getPanneEl('selectAllPanne');
    selectedPanneIds.clear();
    if (mainCheck.checked) {
        filteredPannes.forEach(log => { 
            if(['admin', 'superadmin', 'charoi'].includes(panneUserRole) && !log.is_verified) {
                selectedPanneIds.add(log.id);
            } 
        });
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
    showPanneConfirmModal("System Verification", `Confirm verification for ${selectedPanneIds.size} breakdown logs?`, "shield-check", "bg-emerald-700");
}

window.reqPanneVerify = function(id) { 
    panneActionType = 'verify'; panneActionId = id; 
    showPanneConfirmModal("Archive Validation", "Permanently verify and lock this incident log?", "check-circle", "bg-emerald-700"); 
}

window.reqPanneDelete = function(id) { 
    panneActionType = 'delete'; panneActionId = id; 
    showPanneConfirmModal("Purge Protocol", "Permanently delete this breakdown entry?", "trash-2", "bg-red-900"); 
}

async function executePanneConfirmAction() {
    const btn = getPanneEl('btnPanneConfirmAction');
    if(!btn) return;
    const original = btn.innerHTML;
    btn.disabled = true; btn.innerText = "PROCESSING...";

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
            showPanneAlert("Success", "Incident ledger synchronized.", true);
        } else {
            handleFriendlyPanneError(res, "action");
        }
    } catch(e) { showPanneAlert("Error", "Server uplink failure.", false); }
    btn.disabled = false; btn.innerHTML = original;
}

// =================================================================
// 6. MODAL & SAVE LOGIC
// =================================================================

window.openAddPanneModal = function() {
    getPanneEl('panneEditId').value = "";
    getPanneEl('panneModalTitle').innerText = "Initiate Panne Report";
    populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Choose Fleet Unit');
    populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Breakdown Category');
    getPanneEl('panneDesc').value = "";
    getPanneEl('panneDate').value = new Date().toISOString().split('T')[0];
    
    const s = getPanneEl('panneStatusSelect');
    s.value = "active";
    s.disabled = true;

    getPanneEl('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if(!log || (log.status === 'resolved' && log.is_verified)) {
        showPanneAlert("Access Denied", "Immutable archived record.", false);
        return;
    }
    getPanneEl('panneEditId').value = log.id;
    getPanneEl('panneModalTitle').innerText = "Update System Log";
    populateSelect('panneVehicleSelect', panneOptions.vehicles, log.vehicle_id, 'plate_number', 'Choose Fleet Unit');
    populateSelect('panneCatSelect', panneOptions.cats, log.category_panne_id, 'panne_name', 'Breakdown Category');
    getPanneEl('panneDesc').value = log.description || '';
    getPanneEl('panneDate').value = new Date(log.panne_date).toISOString().split('T')[0];
    
    const s = getPanneEl('panneStatusSelect');
    s.value = log.status;
    s.disabled = true;

    getPanneEl('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.savePanne = async function() {
    const id = getPanneEl('panneEditId').value;
    const btn = getPanneEl('btnSavePanne');
    const original = btn.innerHTML;
    
    const payload = {
        vehicle_id: parseInt(getPanneEl('panneVehicleSelect').value),
        category_panne_id: parseInt(getPanneEl('panneCatSelect').value),
        description: getPanneEl('panneDesc').value.trim(),
        panne_date: new Date(getPanneEl('panneDate').value).toISOString(),
        status: getPanneEl('panneStatusSelect').value 
    };

    if(!payload.vehicle_id || !payload.description) return showPanneAlert("Validation", "Required data fields empty.", false);

    btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4"></i>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/panne/${id}` : '/panne/';
        const res = await window.fetchWithAuth(url, method, payload);
        if(res && !res.detail) {
            window.closeModal('addPanneModal');
            await loadPanneData();
            showPanneAlert("Success", "Incident report committed.", true);
        } else {
            handleFriendlyPanneError(res, "save");
        }
    } catch(e) { showPanneAlert("Error", "Transaction aborted.", false); }
    btn.disabled = false; btn.innerHTML = original;
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 7. VIEW & HELPERS
// =================================================================

window.openViewPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    const v = panneOptions.vehicles.find(x => x.id === log.vehicle_id);
    
    const content = `
        <div class="space-y-6 text-left animate-up">
            <div class="flex justify-between items-start border-b border-slate-800 pb-4">
                <div>
                    <h4 class="text-2xl font-black text-white uppercase tracking-tighter">${v?.plate_number || 'UNKNOWN'}</h4>
                    <p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">Breakdown Dossier #${log.id}</p>
                </div>
                ${getStatusBadge(log.status)}
            </div>
            
            <div class="bg-slate-950 p-5 rounded-[2rem] border border-slate-800 shadow-inner">
                <span class="text-[8px] font-black text-slate-600 uppercase mb-3 block tracking-widest">Incident Rational</span>
                <div class="text-slate-300 text-sm leading-relaxed font-medium">${log.description || 'No detailed log.'}</div>
            </div>

            <div class="flex justify-between items-center pt-4 border-t border-slate-800">
                <span class="text-[10px] text-slate-600 font-black uppercase tracking-widest">Logged on: ${new Date(log.panne_date).toLocaleDateString()}</span>
                <span class="text-[10px] ${log.is_verified ? 'text-emerald-500' : 'text-slate-600'} font-black uppercase tracking-widest">
                    ${log.is_verified ? 'Archive Verified' : 'System Pending'}
                </span>
            </div>
        </div>`;
        
    getPanneEl('viewPanneContent').innerHTML = content;
    getReqEl('viewPanneModal').classList.remove('hidden'); // Uses request.js modal stylings
    if(window.lucide) window.lucide.createIcons();
}

function handleFriendlyPanneError(res, type) {
    let msg = "Invalid protocol parameters.";
    if (res && res.detail) {
        const detail = JSON.stringify(res.detail).toLowerCase();
        if (detail.includes("already has an active breakdown")) msg = "Unit is already flagged for Panne.";
        else if (detail.includes("locked")) msg = "Immutable record.";
        else msg = res.detail;
    }
    showPanneAlert("Operation Blocked", msg, false);
}

function populateSelect(id, list, sel, key, def) {
    const el = getPanneEl(id); if(!el) return;
    el.innerHTML = `<option value="">-- ${def.toUpperCase()} --</option>` + list.map(i => `<option value="${i.id}" ${i.id == sel ? 'selected' : ''}>${i[key]}</option>`).join('');
}

window.closeModal = function(id) { const el = getPanneEl(id); if(el) el.classList.add('hidden'); }

function showPanneConfirmModal(title, message, icon, color) {
    getPanneEl('panneConfirmTitle').innerText = title.toUpperCase();
    getPanneEl('panneConfirmMessage').innerHTML = message;
    const btn = getPanneEl('btnPanneConfirmAction');
    if(btn) {
        btn.className = `flex-1 px-4 py-4 ${color} text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl active:scale-95 transition-all`;
    }
    const iconDiv = getPanneEl('panneConfirmIcon');
    if(iconDiv) {
        iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-8 h-8"></i>`;
        iconDiv.className = `w-16 h-16 rounded-[1.5rem] bg-slate-900 flex items-center justify-center mx-auto mb-6 text-white border border-slate-800 shadow-2xl`;
    }
    getPanneEl('panneConfirmModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showPanneAlert(title, message, isSuccess) {
    getPanneEl('panneAlertTitle').innerText = title.toUpperCase();
    getPanneEl('panneAlertMessage').innerHTML = message;
    const iconDiv = getPanneEl('panneAlertIcon');
    const color = isSuccess ? 'text-emerald-500 bg-emerald-500/10' : 'text-red-500 bg-red-500/10';
    if(iconDiv) {
        iconDiv.className = `w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${color} border border-current/20`;
        iconDiv.innerHTML = `<i data-lucide="${isSuccess ? 'check' : 'x'}" class="w-8 h-8"></i>`;
    }
    getPanneEl('panneAlertModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(isSuccess) setTimeout(() => closeModal('panneAlertModal'), 3000);
}

// Auto-bootstrap
initPanne();