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
    console.log("Panne Module: Full Feature Initialization Started");
    panneUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    
    const search = getPanneEl('panneSearch');
    const vFilter = getPanneEl('panneVehicleFilter');
    const sFilter = getPanneEl('panneStatusFilter');
    const selectAll = getPanneEl('selectAllPanne');
    const confirmBtn = getPanneEl('btnPanneConfirmAction');
    const bulkBtn = getPanneEl('btnPanneBulkVerify');
    
    // Attach Listeners for Search and Filters (Resets to page 1 on every input)
    if(search) search.addEventListener('input', () => { panneCurrentPage = 1; renderPanneTable(); });
    if(vFilter) vFilter.addEventListener('change', () => { panneCurrentPage = 1; renderPanneTable(); });
    if(sFilter) sFilter.addEventListener('change', () => { panneCurrentPage = 1; renderPanneTable(); });
    
    // Bulk Selection Listeners
    if(selectAll) selectAll.addEventListener('change', togglePanneSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executePanneConfirmAction);
    
    // Bulk Verify Logic
    if(bulkBtn) {
        bulkBtn.onclick = triggerPanneBulkVerify;
    }
    
    // Fetch dropdown data first, then the logs
    await Promise.all([fetchPanneDropdowns(), loadPanneData()]);
}

// =================================================================
// 2. DATA LOADING (LIFO LOGIC)
// =================================================================
async function loadPanneData() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;
    
    // Loading State across 8 columns
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Refreshing logs...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        // Fetch all records to handle client-side sorting/filtering/pagination
        const data = await window.fetchWithAuth('/panne/?limit=1000');
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            // LIFO SORTING: Highest ID first (Newest records at the top)
            allPannes = items.sort((a, b) => b.id - a.id);
            selectedPanneIds.clear();
            renderPanneTable();
        } else {
            handleFriendlyError(data, "load");
        }
    } catch (error) {
        console.error("Panne Fetch Error:", error);
        showPanneAlert("Connection Problem", "The system could not reach the server. Please try again.", false);
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">Server connection failed.</td></tr>`;
    }
}

async function fetchPanneDropdowns() {
    try {
        const [vehicles, cats] = await Promise.all([
            window.fetchWithAuth('/vehicles/?limit=1000'),
            window.fetchWithAuth('/category_panne/')
        ]);

        if(vehicles) panneOptions.vehicles = Array.isArray(vehicles) ? vehicles : (vehicles.items || []);
        if(cats) panneOptions.cats = Array.isArray(cats) ? cats : (cats.items || []);
        
        // Populate select elements
        populateSelect('panneVehicleFilter', panneOptions.vehicles, '', 'plate_number', 'All Vehicles');
        populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Vehicle');
        populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Select Category');

    } catch(e) { 
        console.warn("Dropdown Loading Failed:", e); 
    }
}

// =================================================================
// 3. TABLE RENDERING (8 COLUMNS + PROGRESS LOCK)
// =================================================================
function renderPanneTable() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;

    const searchVal = getPanneEl('panneSearch')?.value.toLowerCase() || '';
    const vFilterVal = getPanneEl('panneVehicleFilter')?.value || '';
    const sFilterVal = getPanneEl('panneStatusFilter')?.value || 'all';

    // A. Apply Filtering Logic
    filteredPannes = allPannes.filter(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const desc = (log.description || "").toLowerCase();
        
        const matchesSearch = plate.includes(searchVal) || desc.includes(searchVal);
        const matchesVehicle = vFilterVal === "" || log.vehicle_id == vFilterVal;
        
        let matchesStatus = true;
        if (sFilterVal === 'verified') matchesStatus = log.is_verified === true;
        else if (sFilterVal === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    // B. Slice Data for Pagination
    updatePannePaginationUI();
    const startIdx = (panneCurrentPage - 1) * pannePageLimit;
    const paginatedItems = filteredPannes.slice(startIdx, startIdx + pannePageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500">No incident reports match your search criteria.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);

    // C. Generate HTML Rows
    tbody.innerHTML = paginatedItems.map(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.panne_name : `-`;
        const date = new Date(log.panne_date).toLocaleDateString();
        const shortDesc = log.description ? (log.description.length > 30 ? log.description.substring(0, 30) + '...' : log.description) : 'No description';
        
        // ROW LOCKING LOGIC: Lock row ONLY if progress status is 'resolved'
        const isResolved = log.status === 'resolved';

        // Progress Status Badge (Active/Resolved)
        const progressBadge = isResolved 
            ? `<span class="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Resolved</span>`
            : `<span class="px-2 py-1 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">Active</span>`;

        // Verification Badge (Verification does not lock editing anymore)
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        let checkboxHtml = (canManage && !log.is_verified) 
            ? `<input type="checkbox" onchange="togglePanneRow(${log.id})" ${selectedPanneIds.has(log.id) ? 'checked' : ''} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`
            : `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30">`;

        let actions = `<button onclick="openViewPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (isResolved) {
            // LOCKED ROW
            actions += `<span class="p-1.5 text-slate-600 cursor-not-allowed" title="Record Locked: Completed reports cannot be modified."><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
            // EDITABLE ROW
            actions += `
                <button onclick="reqPanneVerify(${log.id})" class="p-1.5 bg-slate-800 text-emerald-400 hover:bg-emerald-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                <button onclick="openEditPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-amber-400 hover:bg-amber-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqPanneDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-colors">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle font-mono text-white text-sm">${plate}</td>
                <td class="p-4 align-middle text-slate-400 text-sm">${catName}</td>
                <td class="p-4 align-middle text-slate-500 text-xs">${shortDesc}</td>
                <td class="p-4 align-middle">${progressBadge}</td>
                <td class="p-4 align-middle">${verifyBadge}</td>
                <td class="p-4 align-middle text-slate-500 text-xs">${date}</td>
                <td class="p-4 align-middle text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    
    updatePanneBulkUI();
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. PAGINATION ENGINE
// =================================================================
window.changePannePage = function(direction) {
    const totalPages = Math.ceil(filteredPannes.length / pannePageLimit);
    const newPage = panneCurrentPage + direction;
    
    if (newPage >= 1 && newPage <= totalPages) {
        panneCurrentPage = newPage;
        renderPanneTable();
        // Return to top of table
        const el = getPanneEl('panneLogsBody');
        if(el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updatePannePaginationUI() {
    const indicator = getPanneEl('pannePageIndicator');
    const countEl = getPanneEl('panneCount');
    const prevBtn = getPanneEl('prevPannePage');
    const nextBtn = getPanneEl('nextPannePage');

    const totalLogs = filteredPannes.length;
    const totalPages = Math.ceil(totalLogs / pannePageLimit) || 1;

    if(indicator) indicator.innerText = `Page ${panneCurrentPage} / ${totalPages}`;
    if(prevBtn) prevBtn.disabled = (panneCurrentPage === 1);
    if(nextBtn) nextBtn.disabled = (panneCurrentPage === totalPages || totalLogs === 0);

    if(countEl) {
        const start = (panneCurrentPage - 1) * pannePageLimit + 1;
        const end = Math.min(start + pannePageLimit - 1, totalLogs);
        countEl.innerText = totalLogs > 0 ? `Showing ${start}-${end} of ${totalLogs} reports` : "0 reports found";
    }
}

// =================================================================
// 5. BULK SELECTION LOGIC
// =================================================================
window.togglePanneRow = function(id) {
    if (selectedPanneIds.has(id)) selectedPanneIds.delete(id);
    else selectedPanneIds.add(id);
    updatePanneBulkUI();
}

window.togglePanneSelectAll = function() {
    const mainCheck = getPanneEl('selectAllPanne');
    if (!mainCheck) return;
    
    const isChecked = mainCheck.checked;
    selectedPanneIds.clear();
    
    if (isChecked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);
        // Select items visible in the current filter that aren't verified
        filteredPannes.forEach(log => {
             if(canManage && !log.is_verified) selectedPanneIds.add(log.id);
        });
    }
    renderPanneTable();
    updatePanneBulkUI();
}

function updatePanneBulkUI() {
    const btn = getPanneEl('btnPanneBulkVerify');
    const countSpan = getPanneEl('panneSelectedCount');
    if (!btn || !countSpan) return;

    countSpan.innerText = selectedPanneIds.size;
    if (selectedPanneIds.size > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

window.triggerPanneBulkVerify = function() {
    if (selectedPanneIds.size === 0) return;
    panneActionType = 'bulk-verify';
    panneActionId = null;
    showPanneConfirmModal("Bulk Verify", `You are about to verify ${selectedPanneIds.size} reports. This confirms they have been reviewed and inspected.`, "shield-check", "bg-emerald-600");
}

// =================================================================
// 6. SINGLE ACTIONS & DIALOGS
// =================================================================
window.reqPanneVerify = function(id) { 
    panneActionType = 'verify'; 
    panneActionId = id; 
    showPanneConfirmModal("Verify Report", "Mark this report as verified? You can still update it until it is Resolved.", "check-circle", "bg-green-600"); 
}

window.reqPanneDelete = function(id) { 
    panneActionType = 'delete'; 
    panneActionId = id; 
    showPanneConfirmModal("Delete Report", "Are you sure? This action will permanently remove the record and cannot be reversed.", "trash-2", "bg-red-600"); 
}

async function executePanneConfirmAction() {
    const btn = getPanneEl('btnPanneConfirmAction');
    if(!btn) return;

    btn.disabled = true; 
    btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4 mr-2"></i> Processing...`;
    if(window.lucide) window.lucide.createIcons();

    try {
        let res;
        if (panneActionType === 'delete') {
            res = await window.fetchWithAuth(`/panne/${panneActionId}`, 'DELETE');
        } else if (panneActionType === 'verify') {
            res = await window.fetchWithAuth(`/panne/verify-bulk`, 'PUT', { ids: [parseInt(panneActionId)] });
        } else if (panneActionType === 'bulk-verify') {
            const ids = Array.from(selectedPanneIds).map(id => parseInt(id));
            res = await window.fetchWithAuth('/panne/verify-bulk', 'PUT', { ids: ids });
        }

        window.closeModal('panneConfirmModal');
        
        if(res !== null && !res.detail) {
            if(panneActionType === 'bulk-verify') selectedPanneIds.clear();
            await loadPanneData(); // Reload all to maintain sorting and count
            showPanneAlert("Success", "The action was completed successfully.", true);
        } else {
            handleFriendlyError(res, "action");
        }
    } catch(e) { 
        window.closeModal('panneConfirmModal'); 
        showPanneAlert("Error", "Server connection lost. Please check your network.", false); 
    }
    
    btn.disabled = false; 
    btn.innerText = "Confirm";
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 7. SAVE / EDIT / VIEW MODAL LOGIC
// =================================================================
window.openAddPanneModal = function() {
    getPanneEl('panneEditId').value = "";
    getPanneEl('panneModalTitle').innerText = "Report Breakdown";
    
    populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Select Category');
    
    getPanneEl('panneDesc').value = "";
    getPanneEl('panneDate').value = new Date().toISOString().split('T')[0];
    
    const statusSelect = getPanneEl('panneStatusSelect');
    if(statusSelect) statusSelect.value = "active";

    getPanneEl('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    // Double check lock status
    if(!log || log.status === 'resolved') {
        showPanneAlert("Locked", "Completed reports are archived and cannot be modified.", false);
        return;
    }

    getPanneEl('panneEditId').value = log.id;
    getPanneEl('panneModalTitle').innerText = "Edit Breakdown Report";
    
    populateSelect('panneVehicleSelect', panneOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, log.category_panne_id, 'panne_name', 'Category');
    
    getPanneEl('panneDesc').value = log.description || '';
    getPanneEl('panneDate').value = new Date(log.panne_date).toISOString().split('T')[0];
    
    const statusSelect = getPanneEl('panneStatusSelect');
    if(statusSelect) statusSelect.value = log.status || "active";

    getPanneEl('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.savePanne = async function() {
    const id = getPanneEl('panneEditId').value;
    const btn = getPanneEl('btnSavePanne');
    const vehicleId = parseInt(getPanneEl('panneVehicleSelect').value);
    const status = getPanneEl('panneStatusSelect').value;

    // FRONTEND DUPLICATE ACTIVE PREVENTION: 
    // If it's a NEW report, check if vehicle is already in an 'active' panne
    if (!id && status === "active") {
        const alreadyBroken = allPannes.some(p => p.vehicle_id === vehicleId && p.status === "active");
        if (alreadyBroken) {
            showPanneAlert("Vehicle Unavailable", "This vehicle already has an active report. Resolve the current report before adding a new breakdown.", false);
            return;
        }
    }

    const payload = {
        vehicle_id: vehicleId,
        category_panne_id: parseInt(getPanneEl('panneCatSelect').value),
        description: getPanneEl('panneDesc').value.trim(),
        panne_date: new Date(getPanneEl('panneDate').value).toISOString(),
        status: status 
    };

    if(!payload.vehicle_id || !payload.category_panne_id || !payload.description) {
        showPanneAlert("Validation Error", "Vehicle, Category, and Description are required fields.", false);
        return;
    }

    btn.disabled = true; btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin w-4 h-4 mr-2"></i> Saving...`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/panne/${id}` : '/panne/';
        const res = await window.fetchWithAuth(url, method, payload);
        
        if(res && !res.detail) {
            window.closeModal('addPanneModal');
            await loadPanneData(); // Reload to apply LIFO sorting
            showPanneAlert("Success", "Incident report saved. The vehicle status has been updated.", true);
        } else {
            handleFriendlyError(res, "save");
        }
    } catch(e) { 
        showPanneAlert("System Error", "An error occurred while saving. Please try again.", false); 
    }
    
    btn.disabled = false; 
    btn.innerHTML = id ? "Update Report" : "Save Report";
}

window.openViewPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
    const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
    
    const content = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div><span class="text-slate-500 text-[10px] uppercase block mb-1">Vehicle</span><span class="text-white font-mono text-sm">${vehicle?.plate_number || 'N/A'}</span></div>
                <div><span class="text-slate-500 text-[10px] uppercase block mb-1">Category</span><span class="text-white text-sm">${cat?.panne_name || 'N/A'}</span></div>
            </div>
            <div class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                <span class="text-slate-500 text-[10px] uppercase">Incident Progress</span>
                <span class="font-bold ${log.status === 'active' ? 'text-red-400' : 'text-blue-400'} uppercase text-xs">${log.status}</span>
            </div>
            <div>
                <span class="text-slate-500 text-[10px] uppercase block mb-1">Detailed Description</span>
                <div class="text-slate-300 text-sm bg-slate-900/50 p-4 rounded border border-slate-800 italic">${log.description || 'No detailed notes provided.'}</div>
            </div>
            <div class="flex justify-between items-center text-[10px] text-slate-600 pt-2 border-t border-slate-800">
                <span>Logged on: ${new Date(log.panne_date).toLocaleDateString()}</span>
                <span>Ref: #${log.id}</span>
            </div>
        </div>`;
    
    const viewContent = getPanneEl('viewPanneContent');
    if (viewContent) viewContent.innerHTML = content;
    const modal = getPanneEl('viewPanneModal');
    if (modal) modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 8. PROFESSIONAL ERROR HANDLER (Friendly Instructions)
// =================================================================
function handleFriendlyError(res, type) {
    let msg = "An unexpected error occurred. Please try again.";
    let title = "Action Blocked";

    if (res && res.detail) {
        const detail = (typeof res.detail === 'string') ? res.detail.toLowerCase() : JSON.stringify(res.detail).toLowerCase();
        
        if (detail.includes("verified and cannot be modified")) {
            title = "Verification Lock";
            msg = "This report is officially verified. To update its progress, please ask an administrator to unverify it first.";
        } else if (detail.includes("completed reports are locked")) {
            title = "Archived Record";
            msg = "Resolved reports cannot be edited. If the vehicle is broken again, please create a new report.";
        } else if (detail.includes("already has an active breakdown")) {
            title = "Duplicate Active Report";
            msg = "This vehicle already has a pending breakdown report. Resolve the previous one before adding another.";
        } else {
            msg = res.detail;
        }
    }
    showPanneAlert(title, msg, false);
}

// =================================================================
// 9. HELPERS (Alerts, Selects, Modals)
// =================================================================
window.closeModal = function(id) { 
    const el = getPanneEl(id) || document.getElementById(id); 
    if(el) el.classList.add('hidden'); 
}

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
        modal = document.createElement('div');
        modal.id = 'panneAlertModal';
        modal.className = 'fixed inset-0 z-[70] hidden bg-black/90 backdrop-blur-sm flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl p-6 text-center animate-up">
                <div id="panneAlertIcon" class="mb-4"></div>
                <h3 id="panneAlertTitle" class="text-white font-bold mb-2"></h3>
                <p id="panneAlertMessage" class="text-slate-400 text-sm mb-6"></p>
                <button onclick="closeModal('panneAlertModal')" class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all">Dismiss</button>
            </div>`;
        document.body.appendChild(modal);
    }
    modal.querySelector('#panneAlertTitle').innerText = title;
    modal.querySelector('#panneAlertMessage').innerHTML = message;
    const iconDiv = modal.querySelector('#panneAlertIcon');
    if(iconDiv) {
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${isSuccess ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`;
        iconDiv.innerHTML = `<i data-lucide="${isSuccess ? 'check' : 'x'}"></i>`;
    }
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(isSuccess) setTimeout(() => modal.classList.add('hidden'), 4000);
}

function populateSelect(id, list, selectedValue, labelKey, defaultText) {
    const el = getPanneEl(id); if(!el) return;
    let opt = `<option value="">${defaultText}</option>`;
    if (Array.isArray(list)) opt += list.map(i => `<option value="${i.id}" ${i.id == selectedValue ? 'selected' : ''}>${i[labelKey] || i.id}</option>`).join('');
    el.innerHTML = opt;
}

// Initial Kick-off
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPanne);
else initPanne();