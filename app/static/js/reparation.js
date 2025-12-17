// app/static/js/reparation.js

// --- GLOBAL STATE ---
let allRepLogs = [];
let repOptions = { pannes: [], garages: [] };
let repUserRole = 'user';

// --- ACTION STATE ---
let repActionType = null; // 'delete', 'verify', 'bulk-verify'
let repActionId = null;
let selectedRepIds = new Set(); 

// =================================================================
// 1. INITIALIZATION
// =================================================================
async function initReparation() {
    console.log("Reparation Module: Init");
    repUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // DOM Elements
    const search = document.getElementById('repSearch');
    const garageFilter = document.getElementById('repGarageFilter');
    const statusFilter = document.getElementById('repStatusFilter');
    const selectAll = document.getElementById('selectAllRep');
    const confirmBtn = document.getElementById('btnRepConfirmAction');
    
    // Attach Listeners
    if(search) search.addEventListener('input', renderRepTable);
    if(garageFilter) garageFilter.addEventListener('change', renderRepTable);
    if(statusFilter) statusFilter.addEventListener('change', renderRepTable);
    if(selectAll) selectAll.addEventListener('change', toggleRepSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeRepConfirmAction);

    await Promise.all([loadRepData(), fetchRepDropdowns()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadRepData() {
    const tbody = document.getElementById('repLogsBody');
    if(!tbody) return;
    
    // Loading State
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    // FIX: Added trailing slash to prevent 307 Redirect
    const data = await window.fetchWithAuth('/reparation/'); 
    
    // Handle pagination or list response
    const items = data.items || data;
    
    if (Array.isArray(items)) {
        allRepLogs = items;
        selectedRepIds.clear(); // Clear selections on reload
        updateRepBulkUI();
        renderRepTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load data.";
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchRepDropdowns() {
    try {
        // FIX: Added trailing slashes to prevent 307 Redirects
        const [pannes, garages] = await Promise.all([
            window.fetchWithAuth('/panne/'), 
            window.fetchWithAuth('/garage/') 
        ]);

        // Handle Potential Pagination Wrappers
        repOptions.pannes = Array.isArray(pannes) ? pannes : (pannes.items || []);
        repOptions.garages = Array.isArray(garages) ? garages : (garages.items || []);
        
        // Populate Filter Dropdowns
        populateSelect('repGarageFilter', repOptions.garages, '', 'nom_garage', 'All Garages');
        
        // Populate Modal Dropdowns
        populatePanneSelect('repPanneSelect', repOptions.pannes);
        populateSelect('repGarageSelect', repOptions.garages, '', 'nom_garage', 'Select Garage');

    } catch (e) { 
        console.warn("Rep Dropdown Error:", e); 
    }
}

// =================================================================
// 3. TABLE RENDERING
// =================================================================
function renderRepTable() {
    const tbody = document.getElementById('repLogsBody');
    if (!tbody) return;

    // Get Filter Values
    const search = document.getElementById('repSearch').value.toLowerCase();
    const gFilter = document.getElementById('repGarageFilter').value;
    const sFilter = document.getElementById('repStatusFilter').value;

    // Filter Data
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

    // Update Counts
    document.getElementById('repCount').innerText = `${filtered.length} records found`;

    // Empty State
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No records found.</td></tr>`;
        return;
    }

    // Role Check
    const canManage = ['admin', 'superadmin', 'charoi'].includes(repUserRole);

    // Generate Rows
    tbody.innerHTML = filtered.map(log => {
        const garage = repOptions.garages.find(g => g.id === log.garage_id);
        const panne = repOptions.pannes.find(p => p.id === log.panne_id);
        const date = new Date(log.repair_date).toLocaleDateString();

        // Status Badges
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        const progressBadge = log.status === 'Completed'
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">Completed</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-slate-500/10 text-slate-400 border border-slate-500/20">In Progress</span>`;

        // Checkbox Logic
        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedRepIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleRepRow(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
        }

        // Action Buttons Logic
        let actions = '';
        const viewBtn = `<button onclick="openViewRepModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if (log.is_verified) {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed" title="Locked"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
        } else if (canManage) {
             actions = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqRepVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditRepModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="reqRepDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30">
                <td class="p-4 text-center">${checkboxHtml}</td>
                <td class="p-4">
                    <div class="text-white font-mono text-xs">Pan #${log.panne_id}</div>
                    <div class="text-xs text-slate-500 truncate max-w-[150px]">${panne && panne.description ? panne.description.substring(0, 30) + (panne.description.length > 30 ? '...' : '') : 'Unknown Panne'}</div>
                </td>
                <td class="p-4 text-slate-300 text-sm">${garage ? garage.nom_garage : 'ID ' + log.garage_id}</td>
                <td class="p-4 text-right font-bold text-emerald-400">${log.cost ? log.cost.toFixed(2) : '0.00'}</td>
                <td class="p-4">${progressBadge}</td>
                <td class="p-4">${verifyBadge}</td>
                <td class="p-4 text-right">${actions}</td>
            </tr>`;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. BULK OPERATIONS
// =================================================================

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

window.executeRepBulkVerify = async function() {
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

// =================================================================
// 5. SINGLE ACTIONS (Trigger Modal)
// =================================================================

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

// =================================================================
// 6. EXECUTE ACTION (Confirm Modal Click)
// =================================================================

async function executeRepConfirmAction() {
    const btn = document.getElementById('btnRepConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let result;
        
        // --- DELETE ---
        if (repActionType === 'delete') {
            // FIX: No slash for ID
            result = await window.fetchWithAuth(`/reparation/${repActionId}`, 'DELETE');
        } 
        // --- VERIFY (Single) ---
        else if (repActionType === 'verify') {
            const payload = { ids: [parseInt(repActionId)] };
            result = await window.fetchWithAuth(`/reparation/verify-bulk`, 'PUT', payload);
        }
        // --- VERIFY (Bulk) ---
        else if (repActionType === 'bulk-verify') {
            const idList = Array.from(selectedRepIds).map(id => parseInt(id));
            const payload = { ids: idList };
            result = await window.fetchWithAuth('/reparation/verify-bulk', 'PUT', payload);
        }

        window.closeModal('repConfirmModal');
        
        if (result !== null && result !== false) {
            if (repActionType === 'bulk-verify') selectedRepIds.clear();
            await loadRepData();
            showRepSuccessAlert("Success", "Action completed successfully.");
        } else {
            showRepErrorAlert("Failed", "Action could not be completed.");
        }
    } catch(e) {
        window.closeModal('repConfirmModal');
        showRepErrorAlert("Error", e.message || "An unexpected error occurred.");
    }
    
    btn.disabled = false; 
    btn.innerText = "Confirm"; 
    repActionId = null; 
    repActionType = null;
}

// =================================================================
// 7. ADD / EDIT / VIEW LOGIC
// =================================================================

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
    
    document.getElementById('repCost').value = log.cost || "";
    document.getElementById('repDate').value = log.repair_date ? new Date(log.repair_date).toISOString().split('T')[0] : "";
    document.getElementById('repReceipt').value = log.receipt || "";
    document.getElementById('repProgressStatus').value = log.status || "Inprogress";

    document.getElementById('addRepModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveReparation = async function() {
    const id = document.getElementById('repEditId').value;
    
    // Get form values
    const panneId = document.getElementById('repPanneSelect').value;
    const garageId = document.getElementById('repGarageSelect').value;
    const cost = document.getElementById('repCost').value;
    const dateVal = document.getElementById('repDate').value;
    const receipt = document.getElementById('repReceipt').value;
    const statusVal = document.getElementById('repProgressStatus').value;

    // VALIDATION
    if(!panneId) { 
        showRepErrorAlert("Validation", "Please select a Panne."); 
        return; 
    }
    if(!garageId) { 
        showRepErrorAlert("Validation", "Please select a Garage."); 
        return; 
    }
    if(!cost || isNaN(cost) || parseFloat(cost) <= 0) { 
        showRepErrorAlert("Validation", "Please enter a valid cost."); 
        return; 
    }
    if(!dateVal) { 
        showRepErrorAlert("Validation", "Please select a date."); 
        return; 
    }
    if(!receipt.trim()) { 
        showRepErrorAlert("Validation", "Please enter receipt reference."); 
        return; 
    }

    const payload = {
        panne_id: parseInt(panneId),
        garage_id: parseInt(garageId),
        cost: parseFloat(cost),
        repair_date: new Date(dateVal).toISOString(),
        receipt: receipt.trim(),
        status: statusVal
    };

    const btn = document.getElementById('btnSaveRep');
    btn.disabled = true; 
    btn.innerHTML = "Saving...";
    
    try {
        let result;
        if(id) {
            // PUT (Update) - No trailing slash for ID
            result = await window.fetchWithAuth(`/reparation/${id}`, 'PUT', payload);
        } else {
            // POST (Create) - FIX: Added trailing slash to avoid 307
            result = await window.fetchWithAuth('/reparation/', 'POST', payload);
        }

        if(result && !result.detail) {
            window.closeModal('addRepModal');
            await loadRepData();
            showRepSuccessAlert("Success", "Saved successfully.");
        } else {
            // Handle Pydantic Error Details
            const msg = result?.detail ? JSON.stringify(result.detail) : "Failed to save reparation.";
            showRepErrorAlert("Error", msg);
        }
    } catch(e) { 
        showRepErrorAlert("System Error", e.message || "Failed to save reparation."); 
    }
    
    btn.disabled = false; 
    btn.innerHTML = id ? `<i data-lucide="save"></i> Update` : `<i data-lucide="plus"></i> Save`;
    if(window.lucide) window.lucide.createIcons();
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
                <span class="text-white bg-slate-800 p-2 rounded block mt-1 text-sm">${panne && panne.description ? panne.description : 'ID '+log.panne_id}</span>
            </div>
            <div><span class="text-slate-500 text-xs uppercase block">Garage</span><span class="text-white">${garage ? garage.nom_garage : 'ID ' + log.garage_id}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Status</span><span class="text-blue-400 font-bold capitalize">${log.status || 'Unknown'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Receipt</span><span class="text-white font-mono">${log.receipt || 'N/A'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Date</span><span class="text-white">${log.repair_date ? new Date(log.repair_date).toLocaleDateString() : 'N/A'}</span></div>
            <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                <span class="text-slate-500 text-xs uppercase">Total Cost</span>
                <span class="text-emerald-400 font-bold text-lg">BIF ${log.cost ? log.cost.toFixed(2) : '0.00'}</span>
            </div>
        </div>`;
    document.getElementById('viewRepContent').innerHTML = content;
    document.getElementById('viewRepModal').classList.remove('hidden');
}

// =================================================================
// 8. HELPER FUNCTIONS
// =================================================================

window.closeModal = function(id) { 
    document.getElementById(id).classList.add('hidden'); 
}

function showRepConfirmModal(title, message, icon, color) {
    const modal = document.getElementById('repConfirmModal');
    if(!modal) return;
    
    document.getElementById('repConfirmTitle').innerText = title;
    document.getElementById('repConfirmMessage').innerText = message;
    
    const btn = document.getElementById('btnRepConfirmAction');
    btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color}`;
    
    // Icon Logic
    const iconDiv = document.getElementById('repConfirmIcon');
    if(iconDiv) {
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${color.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
        iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    }

    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

// NEW: Custom success alert modal
function showRepSuccessAlert(title, message) {
    const modal = document.getElementById('repSuccessAlertModal');
    if(!modal) {
        // Fallback to browser alert if modal doesn't exist
        alert(`${title}: ${message}`);
        return;
    }
    
    document.getElementById('repSuccessAlertTitle').innerText = title;
    document.getElementById('repSuccessAlertMessage').innerText = message;
    
    modal.classList.remove('hidden');
    
    // Auto close after 3 seconds
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 3000);
    
    if(window.lucide) window.lucide.createIcons();
}

// NEW: Custom error alert modal
function showRepErrorAlert(title, message) {
    const modal = document.getElementById('repErrorAlertModal');
    if(!modal) {
        // Fallback to browser alert if modal doesn't exist
        alert(`${title}: ${message}`);
        return;
    }
    
    document.getElementById('repErrorAlertTitle').innerText = title;
    document.getElementById('repErrorAlertMessage').innerText = message;
    
    modal.classList.remove('hidden');
    
    // Auto close after 5 seconds for errors
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 5000);
    
    if(window.lucide) window.lucide.createIcons();
}

function populateSelect(id, list, selectedValue, labelKey, defaultText = 'Select...') {
    const el = document.getElementById(id);
    if(!el) return;
    
    let options = `<option value="">${defaultText}</option>`;
    
    if (Array.isArray(list)) {
        options += list.map(item => {
            const value = item.id;
            const label = item[labelKey] || item.name || `ID ${value}`;
            const isSelected = value == selectedValue ? 'selected' : '';
            return `<option value="${value}" ${isSelected}>${label}</option>`;
        }).join('');
    }
    
    el.innerHTML = options;
}

function populatePanneSelect(id, list, selectedValue) {
    const el = document.getElementById(id);
    if(!el) return;
    
    if(!list || list.length === 0) { 
        el.innerHTML = '<option disabled>No Active Pannes Found</option>'; 
        return; 
    }
    
    let options = `<option value="">Select Panne</option>`;
    options += list.map(item => {
        const desc = item.description ? 
            (item.description.length > 30 ? item.description.substring(0, 30) + '...' : item.description) : 
            'No description';
        const isSelected = item.id == selectedValue ? 'selected' : '';
        return `<option value="${item.id}" ${isSelected}>#${item.id}: ${desc}</option>`;
    }).join('');
    
    el.innerHTML = options;
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initReparation);
} else {
    initReparation();
}