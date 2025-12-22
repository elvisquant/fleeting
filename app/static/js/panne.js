// app/static/js/panne.js

// --- GLOBAL STATE ---
let allPannes = [];
let panneOptions = { vehicles: [], cats: [] };
let panneUserRole = 'user';

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
    console.log("Panne Module: Init");
    panneUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    
    // DOM Elements using mobile-compatible getter
    const search = getPanneEl('panneSearch');
    const vFilter = getPanneEl('panneVehicleFilter');
    const sFilter = getPanneEl('panneStatusFilter');
    const selectAll = getPanneEl('selectAllPanne');
    const confirmBtn = getPanneEl('btnPanneConfirmAction');
    const bulkBtn = getPanneEl('btnPanneBulkVerify');
    
    // Attach Listeners
    if(search) search.addEventListener('input', renderPanneTable);
    if(vFilter) vFilter.addEventListener('change', renderPanneTable);
    if(sFilter) sFilter.addEventListener('change', renderPanneTable);
    if(selectAll) selectAll.addEventListener('change', togglePanneSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executePanneConfirmAction);
    if(bulkBtn) {
        bulkBtn.onclick = triggerPanneBulkVerify;
    }
    
    await Promise.all([loadPanneData(), fetchPanneDropdowns()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadPanneData() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;
    
    // Loading State
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
        <div class="text-sm mt-2">Loading reports...</div>
    </td></tr>`;
    
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/panne/');
        
        // Handle pagination or list response
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            allPannes = items;
            selectedPanneIds.clear();
            updatePanneBulkUI();
            renderPanneTable();
        } else {
            const msg = data && data.detail ? data.detail : "Failed to load data.";
            showPanneAlert("Error", msg, false);
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
                <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-2 text-red-400"></i>
                <div>Error loading data</div>
            </td></tr>`;
        }
    } catch (error) {
        console.error("Load panne error:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
            <i data-lucide="wifi-off" class="w-8 h-8 mx-auto mb-2 text-red-400"></i>
            <div>Network error. Please check connection.</div>
        </td></tr>`;
        if(window.lucide) window.lucide.createIcons();
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

    } catch(e) {
        console.warn("Panne Dropdown Error:", e);
        showPanneAlert("Warning", "Could not load all dropdown options", false);
    }
}

// =================================================================
// 3. TABLE RENDERING
// =================================================================
function renderPanneTable() {
    const tbody = getPanneEl('panneLogsBody');
    if(!tbody) return;

    // Get Filter Values
    const search = getPanneEl('panneSearch');
    const vFilter = getPanneEl('panneVehicleFilter');
    const sFilter = getPanneEl('panneStatusFilter');
    
    const searchValue = search ? search.value.toLowerCase() : '';
    const vFilterValue = vFilter ? vFilter.value : '';
    const sFilterValue = sFilter ? sFilter.value : '';

    // Filter Data
    let filtered = allPannes.filter(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const desc = log.description ? log.description.toLowerCase() : "";
        
        const matchesSearch = plate.includes(searchValue) || desc.includes(searchValue);
        const matchesVehicle = vFilterValue === "" || log.vehicle_id == vFilterValue;
        
        let matchesStatus = true;
        if (sFilterValue === 'verified') matchesStatus = log.is_verified === true;
        if (sFilterValue === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    // Update Counts
    const countEl = getPanneEl('panneCount');
    if (countEl) countEl.innerText = `${filtered.length} record${filtered.length !== 1 ? 's' : ''} found`;

    // Update Select All checkbox
    const selectAllCheckbox = getPanneEl('selectAllPanne');
    if (selectAllCheckbox) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    }

    // Empty State
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">
            <i data-lucide="search" class="w-8 h-8 mx-auto mb-2 text-slate-500"></i>
            <div>No records found</div>
        </td></tr>`;
        return;
    }

    // Role Check
    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);

    // Generate Rows
    tbody.innerHTML = filtered.map(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.panne_name : `Category ${log.category_panne_id}`;
        const date = new Date(log.panne_date).toLocaleDateString();
        const shortDesc = log.description 
            ? (log.description.length > 50 ? log.description.substring(0, 50) + '...' : log.description)
            : 'No description';
        
        // Status Badges
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1 w-fit">
                <i data-lucide="check-circle" class="w-3 h-3"></i> Verified
               </span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1 w-fit">
                <i data-lucide="clock" class="w-3 h-3"></i> Pending
               </span>`;

        // Checkbox Logic
        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedPanneIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="togglePanneRow(${log.id})" ${isChecked} 
                class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-1 focus:ring-blue-500 cursor-pointer hover:border-blue-500 transition">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled 
                class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
        }

        // Action Buttons Logic
        let actions = '';
        const viewBtn = `<button onclick="openViewPanneModal(${log.id})" 
            class="p-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-white rounded-md transition border border-slate-700 hover:border-blue-500" 
            title="View Details"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(log.is_verified) {
            actions = `<div class="flex items-center justify-end gap-2">
                ${viewBtn}
                <span class="text-slate-600 cursor-not-allowed p-1.5" title="Locked - Verified reports cannot be edited">
                    <i data-lucide="lock" class="w-4 h-4"></i>
                </span>
            </div>`;
        } else if (canManage) {
            actions = `<div class="flex items-center justify-end gap-2">
                ${viewBtn}
                <button onclick="reqPanneVerify(${log.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-md transition border border-slate-700 hover:border-emerald-500"
                    title="Verify Report"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                <button onclick="openEditPanneModal(${log.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-amber-600 text-amber-400 hover:text-white rounded-md transition border border-slate-700 hover:border-amber-500"
                    title="Edit Report"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqPanneDelete(${log.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-red-600 text-red-400 hover:text-white rounded-md transition border border-slate-700 hover:border-red-500"
                    title="Delete Report"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>`;
        } else {
            actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-colors">
                <td class="p-4 text-center align-middle">${checkboxHtml}</td>
                <td class="p-4 align-middle">
                    <div class="font-mono text-white text-sm">${plate}</div>
                    ${vehicle && vehicle.model ? `<div class="text-xs text-slate-500">${vehicle.model}</div>` : ''}
                </td>
                <td class="p-4 text-slate-400 align-middle text-sm">${catName}</td>
                <td class="p-4 align-middle">
                    <div class="text-slate-300 text-xs max-w-[200px] truncate" title="${log.description || ''}">${shortDesc}</div>
                </td>
                <td class="p-4 align-middle">${verifyBadge}</td>
                <td class="p-4 text-slate-500 text-xs align-middle">${date}</td>
                <td class="p-4 align-middle">
                    <div class="flex justify-end gap-2">${actions}</div>
                </td>
            </tr>`;
    }).join('');
    
    // Update select all checkbox state
    updateSelectAllCheckbox();
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. BULK OPERATIONS - FIXED
// =================================================================

window.togglePanneRow = function(id) {
    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);
    const log = allPannes.find(l => l.id === id);
    
    if (!log || !canManage || log.is_verified) {
        return;
    }
    
    if (selectedPanneIds.has(id)) {
        selectedPanneIds.delete(id);
    } else {
        selectedPanneIds.add(id);
    }
    
    updatePanneBulkUI();
    updateSelectAllCheckbox();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = getPanneEl('selectAllPanne');
    if (!selectAllCheckbox) return;
    
    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);
    const selectableLogs = allPannes.filter(log => canManage && !log.is_verified);
    
    if (selectableLogs.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }
    
    const selectedFromSelectable = selectableLogs.filter(log => selectedPanneIds.has(log.id));
    
    if (selectedFromSelectable.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (selectedFromSelectable.length === selectableLogs.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

window.togglePanneSelectAll = function() {
    const mainCheck = getPanneEl('selectAllPanne');
    if (!mainCheck) return;
    
    const isChecked = mainCheck.checked;
    
    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);
    const selectableLogs = allPannes.filter(log => canManage && !log.is_verified);
    
    selectedPanneIds.clear();
    
    if (isChecked && selectableLogs.length > 0) {
        selectableLogs.forEach(log => {
            selectedPanneIds.add(log.id);
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
    
    if (selectedPanneIds.size > 0) {
        btn.classList.remove('hidden');
        btn.classList.add('animate-pulse');
        setTimeout(() => btn.classList.remove('animate-pulse'), 1000);
    } else {
        btn.classList.add('hidden');
    }
}

// FIXED: Function name matches HTML onclick
window.triggerPanneBulkVerify = function() {
    if (selectedPanneIds.size === 0) {
        showPanneAlert("No Selection", "Please select at least one report to verify.", false);
        return;
    }
    
    panneActionType = 'bulk-verify';
    panneActionId = null;
    
    const confirmTitle = "Bulk Verify Reports";
    const confirmMessage = `Are you sure you want to verify ${selectedPanneIds.size} selected report${selectedPanneIds.size > 1 ? 's' : ''}?<br><span class="text-xs text-slate-400 mt-1 block">This action cannot be undone.</span>`;
    
    showPanneConfirmModal(confirmTitle, confirmMessage, "shield-check", "bg-emerald-600");
}

// =================================================================
// 5. SINGLE ACTIONS (Trigger Modal)
// =================================================================

window.reqPanneVerify = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    
    if (log.is_verified) {
        showPanneAlert("Already Verified", "This report is already verified.", false);
        return;
    }
    
    panneActionType = 'verify';
    panneActionId = id;
    
    const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
    const vehicleInfo = vehicle ? `(${vehicle.plate_number})` : '';
    
    showPanneConfirmModal(
        "Verify Report", 
        `Verify report #${id} ${vehicleInfo}?<br><span class="text-xs text-slate-400 mt-1 block">This will lock the report permanently.</span>`, 
        "check-circle", 
        "bg-green-600"
    );
}

window.reqPanneDelete = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    
    panneActionType = 'delete';
    panneActionId = id;
    
    const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
    const vehicleInfo = vehicle ? `for vehicle ${vehicle.plate_number}` : '';
    
    showPanneConfirmModal(
        "Delete Report", 
        `Permanently delete report #${id} ${vehicleInfo}?<br><span class="text-xs text-red-400 mt-1 block">This action cannot be undone.</span>`, 
        "trash-2", 
        "bg-red-600"
    );
}

// =================================================================
// 6. EXECUTE ACTION (Confirm Modal Click) - FIXED
// =================================================================

async function executePanneConfirmAction() {
    const btn = getPanneEl('btnPanneConfirmAction');
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...`;
    
    try {
        let result = null;
        let successMessage = "";
        let idList = [];
        
        // --- DELETE ---
        if (panneActionType === 'delete') {
            result = await window.fetchWithAuth(`/panne/${panneActionId}`, 'DELETE');
            successMessage = "Report deleted successfully";
        }
        // --- VERIFY (Single) ---
        else if (panneActionType === 'verify') {
            idList = [parseInt(panneActionId)];
            const payload = { ids: idList };
            result = await window.fetchWithAuth(`/panne/verify-bulk`, 'PUT', payload);
            successMessage = "Report verified successfully";
        }
        // --- VERIFY (Bulk) ---
        else if (panneActionType === 'bulk-verify') {
            idList = Array.from(selectedPanneIds).map(id => parseInt(id));
            const payload = { ids: idList };
            result = await window.fetchWithAuth('/panne/verify-bulk', 'PUT', payload);
            successMessage = `${idList.length} report${idList.length > 1 ? 's' : ''} verified successfully`;
        }

        window.closeModal('panneConfirmModal');
        
        // Check if result is valid
        const isSuccess = result !== null && result !== false && !result.detail;
        
        if (isSuccess) {
            // Clear selections for bulk operations
            if (panneActionType === 'bulk-verify') {
                selectedPanneIds.clear();
            }
            
            // Reload data
            await loadPanneData();
            
            // Show success alert
            showPanneAlert("Success", successMessage, true);
            
        } else {
            // Handle API errors
            const errorMsg = result?.detail || "Action could not be completed";
            showPanneAlert("Failed", typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, false);
        }
        
    } catch(e) {
        console.error("Action error:", e);
        window.closeModal('panneConfirmModal');
        showPanneAlert("Error", e.message || "An unexpected error occurred", false);
    }
    
    // Reset button state
    btn.disabled = false;
    btn.innerHTML = originalText;
    
    // Reset action state
    panneActionId = null;
    panneActionType = null;
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 7. ADD / EDIT / VIEW LOGIC
// =================================================================

window.openAddPanneModal = function() {
    const editIdEl = getPanneEl('panneEditId');
    const modalTitle = getPanneEl('panneModalTitle');
    const saveBtn = getPanneEl('btnSavePanne');
    
    if (editIdEl) editIdEl.value = "";
    if (modalTitle) modalTitle.innerText = "Report Breakdown";
    if (saveBtn) saveBtn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> Save Report`;
    
    populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Select Category');
    
    const descEl = getPanneEl('panneDesc');
    const dateEl = getPanneEl('panneDate');
    
    if (descEl) descEl.value = "";
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    
    const modal = getPanneEl('addPanneModal');
    if (modal) modal.classList.remove('hidden');
    
    // Focus first field
    setTimeout(() => {
        const firstSelect = getPanneEl('panneVehicleSelect');
        if (firstSelect) firstSelect.focus();
    }, 100);
    
    if(window.lucide) window.lucide.createIcons();
}

window.openEditPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if(!log) {
        showPanneAlert("Error", "Report not found", false);
        return;
    }
    
    if (log.is_verified) {
        showPanneAlert("Locked", "Verified reports cannot be edited", false);
        return;
    }

    const editIdEl = getPanneEl('panneEditId');
    const modalTitle = getPanneEl('panneModalTitle');
    const saveBtn = getPanneEl('btnSavePanne');
    
    if (editIdEl) editIdEl.value = log.id;
    if (modalTitle) modalTitle.innerText = "Edit Breakdown Report";
    if (saveBtn) saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Update Report`;

    populateSelect('panneVehicleSelect', panneOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, log.category_panne_id, 'panne_name', 'Category');
    
    const descEl = getPanneEl('panneDesc');
    const dateEl = getPanneEl('panneDate');
    
    if (descEl) descEl.value = log.description || '';
    if (dateEl) dateEl.value = new Date(log.panne_date).toISOString().split('T')[0];

    const modal = getPanneEl('addPanneModal');
    if (modal) modal.classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons();
}

window.savePanne = async function() {
    const editIdEl = getPanneEl('panneEditId');
    const vIdEl = getPanneEl('panneVehicleSelect');
    const catIdEl = getPanneEl('panneCatSelect');
    const descEl = getPanneEl('panneDesc');
    const dateEl = getPanneEl('panneDate');
    
    const id = editIdEl ? editIdEl.value : '';
    const vId = vIdEl ? vIdEl.value : '';
    const catId = catIdEl ? catIdEl.value : '';
    const desc = descEl ? descEl.value.trim() : '';
    const date = dateEl ? dateEl.value : '';

    // Validation
    const errors = [];
    if(!vId) errors.push("Please select a vehicle");
    if(!catId) errors.push("Please select a category");
    if(!date) errors.push("Please select a date");
    if(!desc) errors.push("Please enter a description");
    
    if(errors.length > 0) {
        showPanneAlert("Validation Error", errors.join("<br>"), false);
        return;
    }

    const payload = {
        vehicle_id: parseInt(vId),
        category_panne_id: parseInt(catId),
        description: desc,
        panne_date: new Date(date).toISOString()
    };

    const btn = getPanneEl('btnSavePanne');
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
    
    try {
        let result;
        if(id) {
            result = await window.fetchWithAuth(`/panne/${id}`, 'PUT', payload);
        } else {
            result = await window.fetchWithAuth('/panne/', 'POST', payload);
        }
        
        if(result && !result.detail) {
            window.closeModal('addPanneModal');
            await loadPanneData();
            showPanneAlert("Success", `Report ${id ? 'updated' : 'created'} successfully`, true);
        } else {
            const errorMsg = result?.detail || "Failed to save report";
            showPanneAlert("Error", typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, false);
        }
    } catch(e) { 
        showPanneAlert("System Error", e.message || "Failed to save panne report.", false); 
    }
    
    btn.disabled = false; 
    btn.innerHTML = originalText;
    if(window.lucide) window.lucide.createIcons();
}

window.openViewPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) {
        showPanneAlert("Error", "Report not found", false);
        return;
    }
    
    const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
    const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
    
    const content = `
        <div class="space-y-5">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <span class="text-slate-500 text-xs uppercase block mb-1">Vehicle</span>
                    <div class="text-white font-mono text-sm">${vehicle ? vehicle.plate_number : 'ID ' + log.vehicle_id}</div>
                    ${vehicle && vehicle.model ? `<div class="text-xs text-slate-400">${vehicle.model}</div>` : ''}
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block mb-1">Category</span>
                    <span class="text-white">${cat ? cat.panne_name : '-'}</span>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block mb-1">Date of Incident</span>
                    <span class="text-white">${new Date(log.panne_date).toLocaleDateString()}</span>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block mb-1">Status</span>
                    ${log.is_verified 
                        ? `<span class="text-emerald-400 uppercase font-bold text-xs flex items-center gap-1">
                            <i data-lucide="check-circle" class="w-3 h-3"></i> Verified
                          </span>`
                        : `<span class="text-yellow-400 uppercase font-bold text-xs flex items-center gap-1">
                            <i data-lucide="clock" class="w-3 h-3"></i> Pending
                          </span>`}
                </div>
            </div>
            <div class="border-t border-slate-700 pt-4">
                <span class="text-slate-500 text-xs uppercase block mb-2">Description</span>
                <div class="text-slate-300 text-sm bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    ${log.description || '<span class="text-slate-500 italic">No description provided</span>'}
                </div>
            </div>
            ${log.created_at ? `
            <div class="border-t border-slate-700 pt-4 text-xs text-slate-500">
                <div class="flex justify-between">
                    <span>Report ID:</span>
                    <span class="text-slate-400">#${log.id}</span>
                </div>
                <div class="flex justify-between mt-1">
                    <span>Created:</span>
                    <span class="text-slate-400">${new Date(log.created_at).toLocaleString()}</span>
                </div>
                ${log.updated_at && log.updated_at !== log.created_at ? `
                <div class="flex justify-between mt-1">
                    <span>Last Updated:</span>
                    <span class="text-slate-400">${new Date(log.updated_at).toLocaleString()}</span>
                </div>` : ''}
            </div>` : ''}
        </div>`;
    
    const viewContent = getPanneEl('viewPanneContent');
    if (viewContent) viewContent.innerHTML = content;
    
    const modal = getPanneEl('viewPanneModal');
    if (modal) modal.classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 8. HELPER FUNCTIONS
// =================================================================

window.closeModal = function(id) {
    const modal = getPanneEl(id) || document.getElementById(id);
    if (modal) {
        modal.classList.add('hidden');
    }
}

function showPanneConfirmModal(title, message, icon, color) {
    const modal = getPanneEl('panneConfirmModal');
    if(!modal) {
        // Fallback to browser confirm
        if(confirm(title + ": " + message.replace(/<br>|<span.*?>|<\/span>/g, ' '))) {
            executePanneConfirmAction();
        }
        return;
    }
    
    // Update modal content
    const titleEl = getPanneEl('panneConfirmTitle');
    const messageEl = getPanneEl('panneConfirmMessage');
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerHTML = message;
    
    const btn = getPanneEl('btnPanneConfirmAction');
    if (btn) {
        btn.className = `px-4 py-2.5 text-white rounded-lg text-sm w-full font-medium transition-all duration-200 ${color} hover:opacity-90`;
    }
    
    // Update icon
    const iconDiv = getPanneEl('panneConfirmIcon');
    if(iconDiv) {
        const textColor = color === 'bg-red-600' ? 'text-red-500' :
                         color === 'bg-green-600' ? 'text-green-500' : 'text-emerald-500';
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${textColor} bg-opacity-20 border border-current/20`;
        iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    }
    
    // Show modal with animation
    modal.classList.remove('hidden');
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.style.transform = 'scale(1)';
    }, 10);
    
    if(window.lucide) window.lucide.createIcons();
}

function showPanneAlert(title, message, isSuccess) {
    const modal = getPanneEl('panneAlertModal');
    
    if(!modal) {
        // Fallback to browser alert
        alert(`${title}: ${message}`);
        return;
    }
    
    const titleEl = getPanneEl('panneAlertTitle');
    const messageEl = getPanneEl('panneAlertMessage');
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerHTML = message;
    
    const iconDiv = getPanneEl('panneAlertIcon');
    if(iconDiv) {
        if(isSuccess) {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20";
            iconDiv.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6"></i>';
        } else {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/10 text-red-500 border border-red-500/20";
            iconDiv.innerHTML = '<i data-lucide="alert-circle" class="w-6 h-6"></i>';
        }
    }
    
    const okBtn = modal.querySelector('button');
    if(okBtn) {
        okBtn.className = isSuccess 
            ? "px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm w-full font-medium transition"
            : "px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm w-full font-medium transition";
    }
    
    // Show modal with animation
    modal.classList.remove('hidden');
    modal.style.opacity = '0';
    modal.style.transform = 'scale(0.95)';
    
    setTimeout(() => {
        modal.style.opacity = '1';
        modal.style.transform = 'scale(1)';
    }, 10);
    
    // Auto close for success messages
    if(isSuccess) {
        setTimeout(() => {
            if(!modal.classList.contains('hidden')) {
                modal.classList.add('hidden');
            }
        }, 3000);
    }
    
    if(window.lucide) window.lucide.createIcons();
}

function populateSelect(id, list, selectedValue, labelKey, defaultText) {
    const el = getPanneEl(id);
    if(!el) return;
    
    let options = `<option value="">${defaultText}</option>`;
    
    if (Array.isArray(list)) {
        options += list.map(item => {
            const value = item.id;
            const label = item[labelKey] || item.name || `ID ${value}`;
            const selected = value == selectedValue ? 'selected' : '';
            return `<option value="${value}" ${selected}>${label}</option>`;
        }).join('');
    }
    
    el.innerHTML = options;
}

// =================================================================
// 9. INITIALIZATION
// =================================================================

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPanne);
} else {
    // DOM already loaded
    setTimeout(initPanne, 100);
}

// Make functions available globally
window.initPanne = initPanne;
window.loadPanneData = loadPanneData;
window.renderPanneTable = renderPanneTable;