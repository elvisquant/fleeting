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
    // First try mobile container (if we're on mobile)
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    // Then try desktop container
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    // Fallback to global search
    return document.getElementById(id);
}

// =================================================================
// 1. INITIALIZATION
// =================================================================
async function initPanne() {
    console.log("Panne Module: Full Init (Pagination + LIFO + Lock-on-Resolved)");
    panneUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    
    // DOM Elements
    const search = getPanneEl('panneSearch');
    const vFilter = getPanneEl('panneVehicleFilter');
    const sFilter = getPanneEl('panneStatusFilter');
    const selectAll = getPanneEl('selectAllPanne');
    const confirmBtn = getPanneEl('btnPanneConfirmAction');
    const bulkBtn = getPanneEl('btnPanneBulkVerify');
    
    // Attach Listeners for Search and Filters (Resets to page 1)
    if(search) search.addEventListener('input', () => { panneCurrentPage = 1; renderPanneTable(); });
    if(vFilter) vFilter.addEventListener('change', () => { panneCurrentPage = 1; renderPanneTable(); });
    if(sFilter) sFilter.addEventListener('change', () => { panneCurrentPage = 1; renderPanneTable(); });
    
    if(selectAll) selectAll.addEventListener('change', togglePanneSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executePanneConfirmAction);
    if(bulkBtn) bulkBtn.onclick = triggerPanneBulkVerify;
    
    await Promise.all([fetchPanneDropdowns(), loadPanneData()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadPanneData() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;
    
    // Loading State (Colspan 8 for fixed alignment)
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading reports...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/panne/?limit=1000');
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            // LIFO SORTING: Sort by ID descending (newest entries first)
            allPannes = items.sort((a, b) => b.id - a.id);
            selectedPanneIds.clear();
            renderPanneTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">Error: Could not load data.</td></tr>`;
        }
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">System Error: ${error.message}</td></tr>`;
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
        
        populateSelect('panneVehicleFilter', panneOptions.vehicles, '', 'plate_number', 'All Vehicles');
        populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Vehicle');
        populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Select Category');
    } catch(e) { 
        console.warn("Dropdown load error", e); 
    }
}

// =================================================================
// 3. TABLE RENDERING (8 COLUMNS + LOCK LOGIC)
// =================================================================
function renderPanneTable() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;

    // A. Filter Data
    const searchVal = getPanneEl('panneSearch')?.value.toLowerCase() || '';
    const vFilterVal = getPanneEl('panneVehicleFilter')?.value || '';
    const sFilterVal = getPanneEl('panneStatusFilter')?.value || 'all';

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

    // B. Update Pagination Info
    updatePannePaginationUI();

    // C. Slice for Pagination
    const start = (panneCurrentPage - 1) * pannePageLimit;
    const paginatedItems = filteredPannes.slice(start, start + pannePageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">No records found matching filters.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);

    tbody.innerHTML = paginatedItems.map(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.panne_name : `-`;
        const date = new Date(log.panne_date).toLocaleDateString();
        const shortDesc = log.description ? (log.description.length > 30 ? log.description.substring(0, 30) + '...' : log.description) : '-';
        
        // LOCK LOGIC: Locked if Progress Status is 'resolved'
        const isLocked = log.status === 'resolved';

        // Progress Badge
        const progressBadge = isLocked 
            ? `<span class="px-2 py-1 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Resolved</span>`
            : `<span class="px-2 py-1 rounded text-[10px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">Active</span>`;

        // Verification Badge (Does NOT lock the row)
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedPanneIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="togglePanneRow(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30">`;
        }

        let actions = `<button onclick="openViewPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (isLocked) {
            // Row is Locked
            actions += `<span class="p-1.5 text-slate-600" title="Locked: Resolved reports cannot be modified"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        } else if (canManage) {
            // Row is Editable
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
// 4. PAGINATION CONTROLS
// =================================================================
window.changePannePage = function(direction) {
    const totalPages = Math.ceil(filteredPannes.length / pannePageLimit);
    const newPage = panneCurrentPage + direction;
    if (newPage >= 1 && newPage <= totalPages) {
        panneCurrentPage = newPage;
        renderPanneTable();
        // Scroll to top of table for UX
        getPanneEl('panneLogsBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updatePannePaginationUI() {
    const prevBtn = getPanneEl('prevPannePage');
    const nextBtn = getPanneEl('nextPannePage');
    const indicator = getPanneEl('pannePageIndicator');
    const countEl = getPanneEl('panneCount');

    const totalLogs = filteredPannes.length;
    const totalPages = Math.ceil(totalLogs / pannePageLimit) || 1;

    if(indicator) indicator.innerText = `Page ${panneCurrentPage} / ${totalPages}`;
    if(prevBtn) prevBtn.disabled = (panneCurrentPage === 1);
    if(nextBtn) nextBtn.disabled = (panneCurrentPage === totalPages || totalLogs === 0);

    if(countEl) {
        const start = (panneCurrentPage - 1) * pannePageLimit + 1;
        const end = Math.min(start + pannePageLimit - 1, totalLogs);
        countEl.innerText = totalLogs > 0 ? `Showing ${start}-${end} of ${totalLogs} records` : "0 records found";
    }
}

// =================================================================
// 5. BULK SELECTION
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
        filteredPannes.forEach(log => { if(canManage && !log.is_verified) selectedPanneIds.add(log.id); });
    }
    renderPanneTable();
    updatePanneBulkUI();
}

function updatePanneBulkUI() {
    const btn = getPanneEl('btnPanneBulkVerify');
    const countSpan = getPanneEl('panneSelectedCount');
    if (countSpan) countSpan.innerText = selectedPanneIds.size;
    if (btn) {
        if (selectedPanneIds.size > 0) btn.classList.remove('hidden');
        else btn.classList.add('hidden');
    }
}

// =================================================================
// 6. ACTIONS (Verify/Delete/Confirm)
// =================================================================
window.triggerPanneBulkVerify = function() {
    if (selectedPanneIds.size === 0) return;
    panneActionType = 'bulk-verify';
    panneActionId = null;
    showPanneConfirmModal("Bulk Verify", `Verify ${selectedPanneIds.size} selected reports?`, "shield-check", "bg-emerald-600");
}

window.reqPanneVerify = function(id) { 
    panneActionType = 'verify'; 
    panneActionId = id; 
    showPanneConfirmModal("Verify Report", "Mark this report as verified?", "check-circle", "bg-green-600"); 
}

window.reqPanneDelete = function(id) { 
    panneActionType = 'delete'; 
    panneActionId = id; 
    showPanneConfirmModal("Delete Report", "Permanently remove this record?", "trash-2", "bg-red-600"); 
}

async function executePanneConfirmAction() {
    const btn = getPanneEl('btnPanneConfirmAction');
    if(!btn) return;
    
    btn.disabled = true; 
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...`;

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
            await loadPanneData();
            showPanneAlert("Success", "Action completed successfully.", true);
        } else {
            showPanneAlert("Error", res?.detail || "Action failed.", false);
        }
    } catch(e) { 
        window.closeModal('panneConfirmModal'); 
        showPanneAlert("Error", e.message, false); 
    }
    
    btn.disabled = false; 
    btn.innerText = "Confirm";
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 7. SAVE / EDIT / VIEW MODALS
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

    const modal = getPanneEl('addPanneModal');
    if (modal) modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if(!log || log.status === 'resolved') return; // Double check lock

    getPanneEl('panneEditId').value = log.id;
    getPanneEl('panneModalTitle').innerText = "Edit Breakdown Report";
    populateSelect('panneVehicleSelect', panneOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, log.category_panne_id, 'panne_name', 'Category');
    
    getPanneEl('panneDesc').value = log.description || '';
    getPanneEl('panneDate').value = new Date(log.panne_date).toISOString().split('T')[0];
    
    const statusSelect = getPanneEl('panneStatusSelect');
    if(statusSelect) statusSelect.value = log.status || "active";

    const modal = getPanneEl('addPanneModal');
    if (modal) modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.savePanne = async function() {
    const id = getPanneEl('panneEditId').value;
    const btn = getPanneEl('btnSavePanne');

    const payload = {
        vehicle_id: parseInt(getPanneEl('panneVehicleSelect').value),
        category_panne_id: parseInt(getPanneEl('panneCatSelect').value),
        description: getPanneEl('panneDesc').value,
        panne_date: new Date(getPanneEl('panneDate').value).toISOString(),
        status: getPanneEl('panneStatusSelect').value 
    };

    if(!payload.vehicle_id || !payload.category_panne_id || !payload.description) {
        showPanneAlert("Validation", "Please fill in all required fields.", false);
        return;
    }

    btn.disabled = true; btn.innerHTML = "Saving...";
    try {
        const url = id ? `/panne/${id}` : '/panne/';
        const method = id ? 'PUT' : 'POST';
        const res = await window.fetchWithAuth(url, method, payload);
        
        if(res && !res.detail) {
            window.closeModal('addPanneModal');
            await loadPanneData();
            showPanneAlert("Success", "Report saved. Vehicle status has been updated.", true);
        } else {
            showPanneAlert("Error", res?.detail || "Failed to save record.", false);
        }
    } catch(e) { showPanneAlert("Error", e.message, false); }
    
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
                <div><span class="text-slate-500 text-[10px] uppercase block mb-1">Vehicle</span><span class="text-white font-mono text-sm">${vehicle?.plate_number || '-'}</span></div>
                <div><span class="text-slate-500 text-[10px] uppercase block mb-1">Category</span><span class="text-white text-sm">${cat?.panne_name || '-'}</span></div>
            </div>
            <div class="flex justify-between items-center bg-slate-800/50 p-3 rounded-lg border border-slate-700">
                <span class="text-slate-500 text-[10px] uppercase">Progress Status</span>
                <span class="font-bold ${log.status === 'active' ? 'text-red-400' : 'text-blue-400'} uppercase text-xs">${log.status}</span>
            </div>
            <div>
                <span class="text-slate-500 text-[10px] uppercase block mb-1">Description</span>
                <div class="text-slate-300 text-sm bg-slate-900/50 p-3 rounded border border-slate-800">${log.description || 'No description provided'}</div>
            </div>
            <div class="flex justify-between items-center text-[10px] text-slate-500 pt-2">
                <span>Incident Date: ${new Date(log.panne_date).toLocaleDateString()}</span>
                <span>ID: #${log.id}</span>
            </div>
        </div>`;
    
    const viewContent = getPanneEl('viewPanneContent');
    if (viewContent) viewContent.innerHTML = content;
    const modal = getPanneEl('viewPanneModal');
    if (modal) modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 8. GLOBAL HELPERS
// =================================================================
window.closeModal = function(id) { const el = getPanneEl(id) || document.getElementById(id); if(el) el.classList.add('hidden'); }

function showPanneConfirmModal(title, message, icon, color) {
    getPanneEl('panneConfirmTitle').innerText = title;
    getPanneEl('panneConfirmMessage').innerHTML = message;
    const btn = getPanneEl('btnPanneConfirmAction');
    if(btn) btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color}`;
    getPanneEl('panneConfirmIcon').innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
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
                <button onclick="closeModal('panneAlertModal')" class="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition">OK</button>
            </div>`;
        document.body.appendChild(modal);
    }
    modal.querySelector('#panneAlertTitle').innerText = title;
    modal.querySelector('#panneAlertMessage').innerHTML = message;
    const iconDiv = modal.querySelector('#panneAlertIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${isSuccess ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`;
    iconDiv.innerHTML = `<i data-lucide="${isSuccess ? 'check' : 'x'}"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(isSuccess) setTimeout(() => modal.classList.add('hidden'), 3000);
}

function populateSelect(id, list, selectedValue, labelKey, defaultText) {
    const el = getPanneEl(id); if(!el) return;
    let opt = `<option value="">${defaultText}</option>`;
    if (Array.isArray(list)) opt += list.map(i => `<option value="${i.id}" ${i.id == selectedValue ? 'selected' : ''}>${i[labelKey] || i.id}</option>`).join('');
    el.innerHTML = opt;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPanne);
else initPanne();