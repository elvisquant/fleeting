// app/static/js/maintenance.js

// --- GLOBAL STATE ---
let allMaintLogs = [];
let maintOptions = { vehicles: [], cats: [], garages: [] };
let maintUserRole = 'user';

// --- ACTION STATE ---
let maintActionType = null; // 'delete', 'verify', 'bulk-verify'
let maintActionId = null;
let selectedMaintIds = new Set(); 

// =================================================================
// 1. INITIALIZATION
// =================================================================
async function initMaintenance() {
    console.log("Maintenance Module: Init");
    maintUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // DOM Elements
    const search = document.getElementById('maintSearch');
    const vFilter = document.getElementById('maintVehicleFilter');
    const sFilter = document.getElementById('maintStatusFilter');
    const selectAll = document.getElementById('selectAllMaint');
    const confirmBtn = document.getElementById('btnMaintConfirmAction');
    
    // Attach Listeners
    if(search) search.addEventListener('input', renderMaintTable);
    if(vFilter) vFilter.addEventListener('change', renderMaintTable);
    if(sFilter) sFilter.addEventListener('change', renderMaintTable);
    if(selectAll) selectAll.addEventListener('change', toggleMaintSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeMaintConfirmAction);

    await Promise.all([loadMaintData(), fetchMaintDropdowns()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadMaintData() {
    const tbody = document.getElementById('maintLogsBody');
    if(!tbody) return;
    
    // Loading State
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading logs...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    // FIX: Added trailing slash to prevent 307 Redirect
    const data = await window.fetchWithAuth('/maintenances/');
    
    // Handle pagination or list response
    const items = data.items || data;

    if (Array.isArray(items)) {
        allMaintLogs = items;
        selectedMaintIds.clear();
        updateMaintBulkUI();
        renderMaintTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load logs.";
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchMaintDropdowns() {
    try {
        // FIX: Added trailing slashes
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
        populateSelect('maintGarageSelect', maintOptions.garages, '', 'garage_name', 'Select Garage');

    } catch(e) { 
        console.warn("Maint Dropdown Error", e); 
    }
}

// =================================================================
// 3. TABLE RENDERING
// =================================================================
function renderMaintTable() {
    const tbody = document.getElementById('maintLogsBody');
    if(!tbody) return;

    // Get Filter Values
    const search = document.getElementById('maintSearch').value.toLowerCase();
    const vFilter = document.getElementById('maintVehicleFilter').value;
    const sFilter = document.getElementById('maintStatusFilter').value;

    // Filter Data
    let filtered = allMaintLogs.filter(log => {
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const receipt = log.receipt ? log.receipt.toLowerCase() : "";
        
        const matchesSearch = plate.includes(search) || receipt.includes(search);
        const matchesVehicle = vFilter === "" || log.vehicle_id == vFilter;
        
        let matchesStatus = true;
        if (sFilter === 'verified') matchesStatus = log.is_verified === true;
        if (sFilter === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    // Update Counts
    document.getElementById('maintLogsCount').innerText = `${filtered.length} logs found`;

    // Empty State
    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No records found.</td></tr>`;
        return;
    }

    // Role Check
    const canManage = ['admin', 'superadmin', 'charoi'].includes(maintUserRole);

    // Generate Rows
    tbody.innerHTML = filtered.map(log => {
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.cat_maintenance : '-';
        const date = new Date(log.maintenance_date).toLocaleDateString();

        // Status Badges
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        // Checkbox Logic
        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedMaintIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleMaintRow(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 focus:ring-0 cursor-pointer">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30 cursor-not-allowed">`;
        }

        // Action Buttons Logic
        let actions = '';
        const viewBtn = `<button onclick="openViewMaintModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(log.is_verified) {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed" title="Locked"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
        } else if (canManage) {
             actions = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqMaintVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditMaintModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="reqMaintDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30 group">
                <td class="p-4 text-center">${checkboxHtml}</td>
                <td class="p-4 font-mono text-white">${plate}</td>
                <td class="p-4 text-slate-400">${catName}</td>
                <td class="p-4 text-right font-bold text-emerald-400">${log.maintenance_cost.toFixed(2)}</td>
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

window.toggleMaintRow = function(id) {
    if (selectedMaintIds.has(id)) selectedMaintIds.delete(id);
    else selectedMaintIds.add(id);
    updateMaintBulkUI();
}

window.toggleMaintSelectAll = function() {
    const mainCheck = document.getElementById('selectAllMaint');
    const isChecked = mainCheck.checked;
    selectedMaintIds.clear();
    
    if (isChecked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(maintUserRole);
        allMaintLogs.forEach(log => {
             if(canManage && !log.is_verified) selectedMaintIds.add(log.id);
        });
    }
    renderMaintTable();
    updateMaintBulkUI();
}

function updateMaintBulkUI() {
    const btn = document.getElementById('btnMaintBulkVerify');
    const countSpan = document.getElementById('maintSelectedCount');
    if (!btn) return;

    countSpan.innerText = selectedMaintIds.size;
    if (selectedMaintIds.size > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

window.executeMaintBulkVerify = async function() {
    if (selectedMaintIds.size === 0) return;
    
    maintActionType = 'bulk-verify';
    maintActionId = null;
    
    showMaintConfirmModal(
        "Verify Selected?", 
        `Verify ${selectedMaintIds.size} records? This cannot be undone.`, 
        "check-circle", 
        "bg-emerald-600"
    );
}

// =================================================================
// 5. SINGLE ACTIONS (Trigger Modal)
// =================================================================

window.reqMaintVerify = function(id) {
    maintActionType = 'verify'; 
    maintActionId = id;
    showMaintConfirmModal("Verify Record?", "This locks the record permanently.", "check-circle", "bg-green-600");
}

window.reqMaintDelete = function(id) {
    maintActionType = 'delete'; 
    maintActionId = id;
    showMaintConfirmModal("Delete Record?", "Permanently remove this record?", "trash-2", "bg-red-600");
}

// =================================================================
// 6. EXECUTE ACTION (Confirm Modal Click)
// =================================================================

async function executeMaintConfirmAction() {
    const btn = document.getElementById('btnMaintConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let result;
        
        // --- DELETE ---
        if (maintActionType === 'delete') {
            result = await window.fetchWithAuth(`/maintenances/${maintActionId}`, 'DELETE');
        } 
        // --- VERIFY (Single) ---
        else if (maintActionType === 'verify') {
            // FIX: Use bulk endpoint for consistency (expecting List[int])
            const payload = { ids: [parseInt(maintActionId)] };
            result = await window.fetchWithAuth(`/maintenances/verify-bulk`, 'PUT', payload);
        }
        // --- VERIFY (Bulk) ---
        else if (maintActionType === 'bulk-verify') {
             const idList = Array.from(selectedMaintIds).map(id => parseInt(id));
             const payload = { ids: idList };
             result = await window.fetchWithAuth('/maintenances/verify-bulk', 'PUT', payload);
        }
        
        window.closeModal('maintConfirmModal');
        
        if(result !== null) {
            if (maintActionType === 'bulk-verify') selectedMaintIds.clear();
            await loadMaintData();
            showMaintAlert("Success", "Action completed.", true);
        } else {
            showMaintAlert("Failed", "Action could not be completed.", false);
        }
    } catch(e) {
        window.closeModal('maintConfirmModal');
        showMaintAlert("Error", e.message, false);
    }
    
    btn.disabled = false; btn.innerText = "Confirm"; 
    maintActionId = null; maintActionType = null;
}

// =================================================================
// 7. ADD / EDIT / VIEW LOGIC
// =================================================================

window.openAddMaintModal = function() {
    document.getElementById('maintEditId').value = "";
    document.getElementById('maintModalTitle').innerText = "Log Maintenance";
    document.getElementById('btnSaveMaint').innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> Save`;
    
    populateSelect('maintVehicleSelect', maintOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    populateSelect('maintCatSelect', maintOptions.cats, '', 'cat_maintenance', 'Select Category');
    populateSelect('maintGarageSelect', maintOptions.garages, '', 'garage_name', 'Select Garage');
    
    document.getElementById('maintCost').value = "";
    document.getElementById('maintDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('maintReceipt').value = "";
    
    document.getElementById('addMaintModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditMaintModal = function(id) {
    const log = allMaintLogs.find(l => l.id === id);
    if(!log) return;

    document.getElementById('maintEditId').value = log.id;
    document.getElementById('maintModalTitle').innerText = "Edit Record";
    document.getElementById('btnSaveMaint').innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Update`;
    
    populateSelect('maintVehicleSelect', maintOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('maintCatSelect', maintOptions.cats, log.cat_maintenance_id, 'cat_maintenance', 'Category');
    populateSelect('maintGarageSelect', maintOptions.garages, log.garage_id, 'garage_name', 'Garage');
    
    document.getElementById('maintCost').value = log.maintenance_cost;
    document.getElementById('maintDate').value = log.maintenance_date.split('T')[0];
    document.getElementById('maintReceipt').value = log.receipt;
    
    document.getElementById('addMaintModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveMaintenance = async function() {
    const id = document.getElementById('maintEditId').value;
    
    const vId = document.getElementById('maintVehicleSelect').value;
    const catId = document.getElementById('maintCatSelect').value;
    const garageId = document.getElementById('maintGarageSelect').value;
    const cost = document.getElementById('maintCost').value;
    const date = document.getElementById('maintDate').value;
    const receipt = document.getElementById('maintReceipt').value;

    if(!vId || isNaN(cost) || !date) { showMaintAlert("Validation", "Please fill required fields.", false); return; }

    const payload = {
        vehicle_id: parseInt(vId),
        cat_maintenance_id: parseInt(catId) || null,
        garage_id: parseInt(garageId) || null,
        maintenance_cost: parseFloat(cost),
        maintenance_date: new Date(date).toISOString(),
        receipt: receipt
    };

    const btn = document.getElementById('btnSaveMaint');
    btn.disabled = true; btn.innerHTML = "Saving...";
    
    try {
        let result;
        if(id) {
            // PUT (Update) - No trailing slash for ID
            result = await window.fetchWithAuth(`/maintenances/${id}`, 'PUT', payload);
        } else {
            // POST (Create) - FIX: Added trailing slash
            result = await window.fetchWithAuth('/maintenances/', 'POST', payload);
        }
        
        if(result && !result.detail) {
            window.closeModal('addMaintModal');
            await loadMaintData();
            showMaintAlert("Success", "Saved successfully.", true);
        } else {
            const msg = result?.detail ? JSON.stringify(result.detail) : "Failed";
            showMaintAlert("Error", msg, false);
        }
    } catch(e) {
        showMaintAlert("System Error", e.message, false);
    }
    
    btn.disabled = false; btn.innerHTML = id ? `<i data-lucide="save"></i> Update` : `<i data-lucide="plus"></i> Save`;
    if(window.lucide) window.lucide.createIcons();
}

window.openViewMaintModal = function(id) {
    const log = allMaintLogs.find(l => l.id === id);
    if (!log) return;
    const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
    const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
    const garage = maintOptions.garages.find(g => g.id === log.garage_id);

    const content = `
        <div class="grid grid-cols-2 gap-y-4">
            <div><span class="text-slate-500 text-xs uppercase block">Vehicle</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : log.vehicle_id}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Category</span><span class="text-white">${cat ? cat.cat_maintenance : '-'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Garage</span><span class="text-white">${garage ? garage.garage_name : '-'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Receipt</span><span class="text-white font-mono">${log.receipt}</span></div>
            <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                <span class="text-slate-500 text-xs uppercase">Total Cost</span>
                <span class="text-emerald-400 font-bold text-lg">BIF ${log.maintenance_cost.toFixed(2)}</span>
            </div>
             <div class="col-span-2 text-xs text-slate-600 text-center mt-2">
                Date: ${new Date(log.maintenance_date).toLocaleDateString()}
            </div>
        </div>
    `;
    document.getElementById('viewMaintContent').innerHTML = content;
    document.getElementById('viewMaintModal').classList.remove('hidden');
}

// =================================================================
// 8. HELPERS
// =================================================================

window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }

function showMaintConfirmModal(t, m, i, c) {
    const modal = document.getElementById('maintConfirmModal');
    if(!modal) return;
    document.getElementById('maintConfirmTitle').innerText = t;
    document.getElementById('maintConfirmMessage').innerText = m;
    const btn = document.getElementById('btnMaintConfirmAction');
    btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${c}`;
    
    // Icon Logic
    const iconDiv = document.getElementById('maintConfirmIcon');
    if(iconDiv) {
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${c.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
        iconDiv.innerHTML = `<i data-lucide="${i}" class="w-6 h-6"></i>`;
    }

    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showMaintAlert(title, message, isSuccess) {
    const modal = document.getElementById('maintAlertModal');
    if(!modal) { alert(message); return; }
    document.getElementById('maintAlertTitle').innerText = title;
    document.getElementById('maintAlertMessage').innerText = message;
    
    const iconDiv = document.getElementById('maintAlertIcon');
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