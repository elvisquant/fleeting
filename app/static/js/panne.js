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
// 1. INITIALIZATION
// =================================================================
async function initPanne() {
    console.log("Panne Module: Init");
    panneUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    
    // DOM Elements
    const search = document.getElementById('panneSearch');
    const vFilter = document.getElementById('panneVehicleFilter');
    const sFilter = document.getElementById('panneStatusFilter');
    const selectAll = document.getElementById('selectAllPanne');
    const confirmBtn = document.getElementById('btnPanneConfirmAction');
    
    // Attach Listeners
    if(search) search.addEventListener('input', renderPanneTable);
    if(vFilter) vFilter.addEventListener('change', renderPanneTable);
    if(sFilter) sFilter.addEventListener('change', renderPanneTable);
    if(selectAll) selectAll.addEventListener('change', togglePanneSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executePanneConfirmAction);
    
    await Promise.all([loadPanneData(), fetchPanneDropdowns()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadPanneData() {
    const tbody = document.getElementById('panneLogsBody');
    if(!tbody) return;
    
    // Loading State
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading reports...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    // FIX: Added trailing slash
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
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchPanneDropdowns() {
    try {
        // FIX: Added trailing slashes
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
    }
}

// =================================================================
// 3. TABLE RENDERING
// =================================================================
function renderPanneTable() {
    const tbody = document.getElementById('panneLogsBody');
    if(!tbody) return;

    // Get Filter Values
    const search = document.getElementById('panneSearch').value.toLowerCase();
    const vFilter = document.getElementById('panneVehicleFilter').value;
    const sFilter = document.getElementById('panneStatusFilter').value;

    // Filter Data
    let filtered = allPannes.filter(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const desc = log.description ? log.description.toLowerCase() : "";
        
        const matchesSearch = plate.includes(search) || desc.includes(search);
        const matchesVehicle = vFilter === "" || log.vehicle_id == vFilter;
        
        let matchesStatus = true;
        if (sFilter === 'verified') matchesStatus = log.is_verified === true;
        if (sFilter === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    // Update Counts
    document.getElementById('panneCount').innerText = `${filtered.length} records found`;

    // Empty State
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No records found.</td></tr>`;
        return;
    }

    // Role Check
    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);

    // Generate Rows
    tbody.innerHTML = filtered.map(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.panne_name : `Cat ${log.category_panne_id}`;
        const date = new Date(log.panne_date).toLocaleDateString();
        
        // Status Badges
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        // Checkbox Logic
        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedPanneIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="togglePanneRow(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
        }

        // Action Buttons Logic
        let actions = '';
        const viewBtn = `<button onclick="openViewPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(log.is_verified) {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed" title="Locked"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
        } else if (canManage) {
             actions = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqPanneVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="reqPanneDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30 group">
                <td class="p-4 text-center">${checkboxHtml}</td>
                <td class="p-4 font-mono text-white">${plate}</td>
                <td class="p-4 text-slate-400">${catName}</td>
                <td class="p-4 text-slate-300 text-xs truncate max-w-[200px]">${log.description || 'No description'}</td>
                <td class="p-4">${verifyBadge}</td>
                <td class="p-4 text-slate-500 text-xs">${date}</td>
                <td class="p-4 text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. BULK OPERATIONS
// =================================================================

window.togglePanneRow = function(id) {
    if (selectedPanneIds.has(id)) selectedPanneIds.delete(id);
    else selectedPanneIds.add(id);
    updatePanneBulkUI();
}

window.togglePanneSelectAll = function() {
    const mainCheck = document.getElementById('selectAllPanne');
    const isChecked = mainCheck.checked;
    selectedPanneIds.clear();
    
    if (isChecked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);
        allPannes.forEach(log => {
             if(canManage && !log.is_verified) selectedPanneIds.add(log.id);
        });
    }
    renderPanneTable();
    updatePanneBulkUI();
}

function updatePanneBulkUI() {
    const btn = document.getElementById('btnPanneBulkVerify');
    const countSpan = document.getElementById('panneSelectedCount');
    if (!btn) return;
    countSpan.innerText = selectedPanneIds.size;
    if (selectedPanneIds.size > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

window.executePanneBulkVerify = function() {
    if (selectedPanneIds.size === 0) return;
    
    panneActionType = 'bulk-verify';
    panneActionId = null;
    showPanneConfirmModal(
        "Verify Selected?", 
        `Verify ${selectedPanneIds.size} reports? This cannot be undone.`, 
        "check-circle", 
        "bg-emerald-600"
    );
}

// =================================================================
// 5. SINGLE ACTIONS (Trigger Modal)
// =================================================================

window.reqPanneVerify = function(id) {
    panneActionType = 'verify'; 
    panneActionId = id;
    showPanneConfirmModal("Verify Report?", "This locks the report permanently.", "check-circle", "bg-green-600");
}

window.reqPanneDelete = function(id) {
    panneActionType = 'delete'; 
    panneActionId = id;
    showPanneConfirmModal("Delete Report?", "Permanently remove this report?", "trash-2", "bg-red-600");
}

// =================================================================
// 6. EXECUTE ACTION (Confirm Modal Click)
// =================================================================

async function executePanneConfirmAction() {
    const btn = document.getElementById('btnPanneConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let result;
        
        // --- DELETE ---
        if (panneActionType === 'delete') {
            result = await window.fetchWithAuth(`/panne/${panneActionId}`, 'DELETE');
        } 
        // --- VERIFY (Single) ---
        else if (panneActionType === 'verify') {
            // Use bulk endpoint for consistency with backend
            const payload = { ids: [parseInt(panneActionId)] };
            result = await window.fetchWithAuth(`/panne/verify-bulk`, 'PUT', payload);
        }
        // --- VERIFY (Bulk) ---
        else if (panneActionType === 'bulk-verify') {
            const idList = Array.from(selectedPanneIds).map(id => parseInt(id));
            const payload = { ids: idList };
            // FIX: Ensure we're using the correct endpoint and method
            result = await window.fetchWithAuth('/panne/verify-bulk', 'PUT', payload);
        }

        window.closeModal('panneConfirmModal');
        
        if (result !== null && result !== false) { 
            if (panneActionType === 'bulk-verify') {
                selectedPanneIds.clear();
            }
            await loadPanneData();
            showPanneSuccessAlert("Success", "Action completed successfully.");
        } else {
            showPanneErrorAlert("Failed", "Action could not be completed.");
        }
    } catch(e) {
        window.closeModal('panneConfirmModal');
        showPanneErrorAlert("Error", e.message || "An unexpected error occurred.");
    }
    
    btn.disabled = false; btn.innerText = "Confirm"; 
    panneActionId = null; panneActionType = null;
}

// =================================================================
// 7. ADD / EDIT / VIEW LOGIC
// =================================================================

window.openAddPanneModal = function() {
    document.getElementById('panneEditId').value = "";
    document.getElementById('panneModalTitle').innerText = "Report Breakdown";
    document.getElementById('btnSavePanne').innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> Save`;
    
    populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Select Category');
    
    document.getElementById('panneDesc').value = "";
    document.getElementById('panneDate').value = new Date().toISOString().split('T')[0];
    
    document.getElementById('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if(!log) return;

    document.getElementById('panneEditId').value = log.id;
    document.getElementById('panneModalTitle').innerText = "Edit Report";
    document.getElementById('btnSavePanne').innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Update`;

    populateSelect('panneVehicleSelect', panneOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, log.category_panne_id, 'panne_name', 'Category');
    
    document.getElementById('panneDesc').value = log.description || '';
    document.getElementById('panneDate').value = log.panne_date.split('T')[0];

    document.getElementById('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.savePanne = async function() {
    const id = document.getElementById('panneEditId').value;
    const vId = document.getElementById('panneVehicleSelect').value;
    const catId = document.getElementById('panneCatSelect').value;
    const desc = document.getElementById('panneDesc').value;
    const date = document.getElementById('panneDate').value;

    if(!vId || !catId || !date) { 
        showPanneErrorAlert("Validation", "Please fill required fields (Vehicle, Category, Date)."); 
        return; 
    }

    const payload = {
        vehicle_id: parseInt(vId),
        category_panne_id: parseInt(catId),
        description: desc,
        panne_date: new Date(date).toISOString()
    };

    const btn = document.getElementById('btnSavePanne');
    btn.disabled = true; btn.innerHTML = "Saving...";
    
    try {
        let result;
        if(id) {
            // PUT (Update) - No slash for ID
            result = await window.fetchWithAuth(`/panne/${id}`, 'PUT', payload);
        } else {
            // POST (Create) - FIX: Added trailing slash
            result = await window.fetchWithAuth('/panne/', 'POST', payload);
        }
        
        if(result && !result.detail) {
            window.closeModal('addPanneModal');
            await loadPanneData();
            showPanneSuccessAlert("Success", "Saved successfully.");
        } else { 
            const msg = result?.detail ? JSON.stringify(result.detail) : "Failed to save.";
            showPanneErrorAlert("Error", msg); 
        }
    } catch(e) { 
        showPanneErrorAlert("System Error", e.message || "Failed to save panne report."); 
    }
    
    btn.disabled = false; 
    btn.innerHTML = id ? `<i data-lucide="save"></i> Update` : `<i data-lucide="plus"></i> Save`;
    if(window.lucide) window.lucide.createIcons();
}

window.openViewPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
    const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
    
    const content = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div><span class="text-slate-500 text-xs uppercase block">Vehicle</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : log.vehicle_id}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">Category</span><span class="text-white">${cat ? cat.panne_name : '-'}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">Date</span><span class="text-white">${new Date(log.panne_date).toLocaleDateString()}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">Status</span><span class="text-blue-400 uppercase font-bold text-xs">${log.is_verified ? "Verified" : "Pending"}</span></div>
            </div>
            <div class="border-t border-slate-700 pt-3">
                <span class="text-slate-500 text-xs uppercase block mb-1">Description</span>
                <p class="text-slate-300 text-sm bg-slate-800 p-3 rounded-lg">${log.description || 'No description provided.'}</p>
            </div>
        </div>`;
    document.getElementById('viewPanneContent').innerHTML = content;
    document.getElementById('viewPanneModal').classList.remove('hidden');
}

// =================================================================
// 8. HELPER FUNCTIONS
// =================================================================

window.closeModal = function(id) { 
    document.getElementById(id).classList.add('hidden'); 
}

function showPanneConfirmModal(title, message, icon, color) {
    const modal = document.getElementById('panneConfirmModal');
    if(!modal) return;
    
    document.getElementById('panneConfirmTitle').innerText = title;
    document.getElementById('panneConfirmMessage').innerText = message;
    
    const btn = document.getElementById('btnPanneConfirmAction');
    btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color}`;
    
    // Update icon color and icon
    const iconDiv = document.getElementById('panneConfirmIcon');
    if(iconDiv) {
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${color.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
        iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    }

    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

// NEW: Custom success alert modal
function showPanneSuccessAlert(title, message) {
    const modal = document.getElementById('panneSuccessAlertModal');
    if(!modal) {
        // Fallback to browser alert if modal doesn't exist
        alert(`${title}: ${message}`);
        return;
    }
    
    document.getElementById('panneSuccessAlertTitle').innerText = title;
    document.getElementById('panneSuccessAlertMessage').innerText = message;
    
    modal.classList.remove('hidden');
    
    // Auto close after 3 seconds
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 3000);
    
    if(window.lucide) window.lucide.createIcons();
}

// NEW: Custom error alert modal
function showPanneErrorAlert(title, message) {
    const modal = document.getElementById('panneErrorAlertModal');
    if(!modal) {
        // Fallback to browser alert if modal doesn't exist
        alert(`${title}: ${message}`);
        return;
    }
    
    document.getElementById('panneErrorAlertTitle').innerText = title;
    document.getElementById('panneErrorAlertMessage').innerText = message;
    
    modal.classList.remove('hidden');
    
    // Auto close after 5 seconds for errors
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 5000);
    
    if(window.lucide) window.lucide.createIcons();
}

function populateSelect(id, list, selectedValue, labelKey, defaultText) {
    const el = document.getElementById(id);
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

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPanne);
} else {
    initPanne();
}