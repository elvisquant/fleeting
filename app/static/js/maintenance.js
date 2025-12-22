// app/static/js/maintenance.js

// --- GLOBAL STATE ---
let allMaintLogs = [];
let maintOptions = { vehicles: [], cats: [], garages: [] };
let maintUserRole = 'user';

// --- PAGINATION & FILTER STATE ---
let maintCurrentPage = 1;
let maintPageLimit = 10;
let filteredMaintLogs = []; // Stores logs after search/filters are applied

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
    console.log("Maintenance Module: Init (Search + Filters + Pagination + LIFO)");
    maintUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // DOM Elements
    const searchInput = getMaintEl('maintSearch');
    const vFilter = getMaintEl('maintVehicleFilter');
    const sFilter = getMaintEl('maintStatusFilter');
    const selectAll = getMaintEl('selectAllMaint');
    const confirmBtn = getMaintEl('btnMaintConfirmAction');
    
    // Attach Listeners for Search and Filters
    // When a filter changes, we reset to page 1 and re-render the table
    if(searchInput) searchInput.addEventListener('input', () => { maintCurrentPage = 1; renderMaintTable(); });
    if(vFilter) vFilter.addEventListener('change', () => { maintCurrentPage = 1; renderMaintTable(); });
    if(sFilter) sFilter.addEventListener('change', () => { maintCurrentPage = 1; renderMaintTable(); });
    
    if(selectAll) selectAll.addEventListener('change', toggleMaintSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeMaintConfirmAction);

    // Load static data then dynamic data
    await Promise.all([fetchMaintDropdowns(), loadMaintData()]);
}

// =================================================================
// 2. DATA FETCHING
// =================================================================
async function loadMaintData() {
    const tbody = getMaintEl('maintLogsBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading logs...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        // Fetch all records (limit=1000 to ensure we get a full set for client-side filtering)
        const data = await window.fetchWithAuth('/maintenances/?limit=1000');
        const items = data.items || data;

        if (Array.isArray(items)) {
            // LIFO: Sort all items by ID descending immediately
            allMaintLogs = items.sort((a, b) => b.id - a.id);
            selectedMaintIds.clear();
            renderMaintTable();
        } else {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">Error: Could not parse data.</td></tr>`;
        }
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">System Error: ${e.message}</td></tr>`;
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
// 3. CORE LOGIC: FILTERING -> SORTING -> PAGINATION -> RENDERING
// =================================================================
function renderMaintTable() {
    const tbody = getMaintEl('maintLogsBody');
    if(!tbody) return;

    // A. Get Current Filter Values
    const searchVal = getMaintEl('maintSearch')?.value.toLowerCase() || '';
    const vehicleVal = getMaintEl('maintVehicleFilter')?.value || '';
    const statusVal = getMaintEl('maintStatusFilter')?.value || 'all';

    // B. APPLY FILTERS
    filteredMaintLogs = allMaintLogs.filter(log => {
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const receipt = (log.receipt || "").toLowerCase();
        
        const matchesSearch = plate.includes(searchVal) || receipt.includes(searchVal);
        const matchesVehicle = vehicleVal === "" || log.vehicle_id == vehicleVal;
        
        let matchesStatus = true;
        if (statusVal === 'verified') matchesStatus = log.is_verified === true;
        else if (statusVal === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    // C. UPDATE UI COUNTS & PAGINATION
    updateMaintPaginationUI();

    // D. SLICE FOR PAGINATION
    const start = (maintCurrentPage - 1) * maintPageLimit;
    const paginatedItems = filteredMaintLogs.slice(start, start + maintPageLimit);

    if(paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">No records found matching filters.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(maintUserRole);

    // E. GENERATE HTML
    tbody.innerHTML = paginatedItems.map(log => {
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
        const garage = maintOptions.garages.find(g => g.id === log.garage_id);
        
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.cat_maintenance : '-';
        const garageName = garage ? garage.nom_garage : '-'; 
        const date = new Date(log.maintenance_date).toLocaleDateString();

        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        let checkboxHtml = '';
        if (canManage && !log.is_verified) {
            const isChecked = selectedMaintIds.has(log.id) ? 'checked' : '';
            checkboxHtml = `<input type="checkbox" onchange="toggleMaintRow(${log.id})" ${isChecked} class="rounded border-slate-600 bg-slate-800 text-blue-600 cursor-pointer">`;
        } else {
            checkboxHtml = `<input type="checkbox" disabled class="rounded border-slate-700 bg-slate-900 opacity-30">`;
        }

        let actions = `<button onclick="openViewMaintModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(!log.is_verified && canManage) {
            actions += `
                <button onclick="reqMaintVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" title="Verify"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                <button onclick="openEditMaintModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="Edit"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqMaintDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            `;
        } else if (log.is_verified) {
            actions += `<span class="p-1.5 text-slate-600" title="Locked"><i data-lucide="lock" class="w-4 h-4"></i></span>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30 group animate-in">
                <td class="p-4 text-center">${checkboxHtml}</td>
                <td class="p-4 font-mono text-white">${plate}</td>
                <td class="p-4 text-slate-400">${catName}</td>
                <td class="p-4 text-slate-400">${garageName}</td>
                <td class="p-4 text-right font-bold text-emerald-400">${log.maintenance_cost.toFixed(2)}</td>
                <td class="p-4">${verifyBadge}</td>
                <td class="p-4 text-slate-500 text-xs">${date}</td>
                <td class="p-4 text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    
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
        // Scroll to top of table
        getMaintEl('maintLogsBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

function updateMaintPaginationUI() {
    const prevBtn = getMaintEl('prevMaintPage');
    const nextBtn = getMaintEl('nextMaintPage');
    const indicator = getMaintEl('maintPageIndicator');
    const countEl = getMaintEl('maintLogsCount');

    const totalLogs = filteredMaintLogs.length;
    const totalPages = Math.ceil(totalLogs / maintPageLimit) || 1;

    if(indicator) indicator.innerText = `Page ${maintCurrentPage} / ${totalPages}`;
    if(prevBtn) prevBtn.disabled = (maintCurrentPage === 1);
    if(nextBtn) nextBtn.disabled = (maintCurrentPage === totalPages);

    if(countEl) {
        const startIdx = (maintCurrentPage - 1) * maintPageLimit + 1;
        const endIdx = Math.min(startIdx + maintPageLimit - 1, totalLogs);
        countEl.innerText = totalLogs > 0 ? `Showing ${startIdx}-${endIdx} of ${totalLogs} logs` : "0 logs found";
    }
}

// =================================================================
// 5. BULK & SINGLE ACTIONS
// =================================================================
window.toggleMaintRow = function(id) {
    if (selectedMaintIds.has(id)) selectedMaintIds.delete(id);
    else selectedMaintIds.add(id);
    updateMaintBulkUI();
}

window.toggleMaintSelectAll = function() {
    const mainCheck = getMaintEl('selectAllMaint');
    if (!mainCheck) return;
    const isChecked = mainCheck.checked;
    selectedMaintIds.clear();
    if (isChecked) {
        const canManage = ['admin', 'superadmin', 'charoi'].includes(maintUserRole);
        // We only select items that are visible and unverified
        filteredMaintLogs.forEach(log => { if(canManage && !log.is_verified) selectedMaintIds.add(log.id); });
    }
    renderMaintTable();
    updateMaintBulkUI();
}

function updateMaintBulkUI() {
    const btn = getMaintEl('btnMaintBulkVerify');
    const countSpan = getMaintEl('maintSelectedCount');
    if (!btn) return;
    if (countSpan) countSpan.innerText = selectedMaintIds.size;
    if (selectedMaintIds.size > 0) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

window.executeMaintBulkVerify = async function() {
    if (selectedMaintIds.size === 0) return;
    maintActionType = 'bulk-verify';
    showMaintConfirmModal("Verify Selected?", `Confirm validation for ${selectedMaintIds.size} records?`, "check-circle", "bg-emerald-600");
}

window.reqMaintVerify = function(id) { maintActionType = 'verify'; maintActionId = id; showMaintConfirmModal("Verify Record?", "This locks the record permanently.", "check-circle", "bg-green-600"); }
window.reqMaintDelete = function(id) { maintActionType = 'delete'; maintActionId = id; showMaintConfirmModal("Delete Record?", "Permanently remove this record?", "trash-2", "bg-red-600"); }

async function executeMaintConfirmAction() {
    const btn = getMaintEl('btnMaintConfirmAction');
    if (!btn) return;
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let result;
        if (maintActionType === 'delete') {
            result = await window.fetchWithAuth(`/maintenances/${maintActionId}`, 'DELETE');
        } else if (maintActionType === 'verify') {
            result = await window.fetchWithAuth(`/maintenances/verify-bulk`, 'PUT', { ids: [parseInt(maintActionId)] });
        } else if (maintActionType === 'bulk-verify') {
             const idList = Array.from(selectedMaintIds).map(id => parseInt(id));
             result = await window.fetchWithAuth('/maintenances/verify-bulk', 'PUT', { ids: idList });
        }
        
        window.closeModal('maintConfirmModal');
        if(result !== null) {
            await loadMaintData(); // Refresh all data
            showMaintAlert("Success", "Action completed successfully.", true);
        }
    } catch(e) {
        window.closeModal('maintConfirmModal');
        showMaintAlert("Error", e.message, false);
    }
    btn.disabled = false; btn.innerText = "Confirm";
}

// =================================================================
// 6. SAVE & MODAL LOGIC
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
    getMaintEl('addMaintModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditMaintModal = function(id) {
    const log = allMaintLogs.find(l => l.id === id);
    if(!log) return;
    getMaintEl('maintEditId').value = log.id;
    getMaintEl('maintModalTitle').innerText = "Edit Record";
    populateSelect('maintVehicleSelect', maintOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('maintCatSelect', maintOptions.cats, log.cat_maintenance_id, 'cat_maintenance', 'Category');
    populateSelect('maintGarageSelect', maintOptions.garages, log.garage_id, 'nom_garage', 'Garage');
    getMaintEl('maintCost').value = log.maintenance_cost;
    getMaintEl('maintDate').value = log.maintenance_date ? log.maintenance_date.split('T')[0] : '';
    getMaintEl('maintReceipt').value = log.receipt || '';
    getMaintEl('addMaintModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveMaintenance = async function() {
    const id = getMaintEl('maintEditId').value;
    const vId = getMaintEl('maintVehicleSelect').value;
    const cost = getMaintEl('maintCost').value;
    const date = getMaintEl('maintDate').value;

    if(!vId || isNaN(cost) || !date) { 
        showMaintAlert("Validation", "Required fields missing.", false); return; 
    }

    const payload = {
        vehicle_id: parseInt(vId),
        cat_maintenance_id: parseInt(getMaintEl('maintCatSelect').value) || null,
        garage_id: parseInt(getMaintEl('maintGarageSelect').value) || null,
        maintenance_cost: parseFloat(cost),
        maintenance_date: new Date(date).toISOString(),
        receipt: getMaintEl('maintReceipt').value
    };

    const btn = getMaintEl('btnSaveMaint');
    btn.disabled = true; btn.innerHTML = "Saving...";
    try {
        const method = id ? 'PUT' : 'POST';
        const url = id ? `/maintenances/${id}` : '/maintenances/';
        const res = await window.fetchWithAuth(url, method, payload);
        
        if(res && !res.detail) {
            window.closeModal('addMaintModal');
            await loadMaintData();
            showMaintAlert("Success", "Record saved.", true);
        } else {
            showMaintAlert("Error", res?.detail || "Save failed.", false);
        }
    } catch(e) { showMaintAlert("System Error", e.message, false); }
    btn.disabled = false; btn.innerHTML = id ? "Update" : "Save";
}

window.openViewMaintModal = function(id) {
    const log = allMaintLogs.find(l => l.id === id);
    if (!log) return;
    const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
    const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
    const garage = maintOptions.garages.find(g => g.id === log.garage_id);

    const content = `
        <div class="space-y-4">
            <div class="flex justify-between border-b border-slate-700 pb-2"><span class="text-slate-500">Vehicle</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : '-'}</span></div>
            <div class="flex justify-between border-b border-slate-700 pb-2"><span class="text-slate-500">Category</span><span class="text-white">${cat ? cat.cat_maintenance : '-'}</span></div>
            <div class="flex justify-between border-b border-slate-700 pb-2"><span class="text-slate-500">Garage</span><span class="text-white">${garage ? garage.nom_garage : '-'}</span></div>
            <div class="flex justify-between border-b border-slate-700 pb-2"><span class="text-slate-500">Receipt</span><span class="text-white">${log.receipt || '-'}</span></div>
            <div class="flex justify-between text-lg font-bold pt-2"><span class="text-slate-400">Total Cost</span><span class="text-emerald-400">BIF ${log.maintenance_cost.toFixed(2)}</span></div>
        </div>`;
    getMaintEl('viewMaintContent').innerHTML = content;
    getMaintEl('viewMaintModal').classList.remove('hidden');
}

// =================================================================
// 7. GLOBAL HELPERS
// =================================================================
window.closeModal = function(id) { const el = getMaintEl(id); if(el) el.classList.add('hidden'); }

function showMaintConfirmModal(title, message, icon, color) {
    getMaintEl('maintConfirmTitle').innerText = title;
    getMaintEl('maintConfirmMessage').innerText = message;
    getMaintEl('btnMaintConfirmAction').className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color}`;
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
        modal.innerHTML = `
            <div class="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl p-6 text-center animate-up">
                <div class="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4" id="maintAlertIcon"></div>
                <h3 class="text-lg font-bold text-white mb-2" id="maintAlertTitle"></h3>
                <p class="text-slate-400 text-sm mb-6" id="maintAlertMessage"></p>
                <button onclick="closeModal('maintAlertModal')" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm w-full">OK</button>
            </div>`;
        document.body.appendChild(modal);
    }
    modal.querySelector('#maintAlertTitle').innerText = title;
    modal.querySelector('#maintAlertMessage').innerText = message;
    const iconDiv = modal.querySelector('#maintAlertIcon');
    iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${isSuccess ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`;
    iconDiv.innerHTML = `<i data-lucide="${isSuccess ? 'check' : 'x'}"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    setTimeout(() => modal.classList.add('hidden'), isSuccess ? 3000 : 6000);
}

function populateSelect(id, list, selectedValue, labelKey, defaultText) {
    const el = getMaintEl(id); if(!el) return;
    let opt = `<option value="">${defaultText}</option>`;
    if (Array.isArray(list)) opt += list.map(i => `<option value="${i.id}" ${i.id == selectedValue ? 'selected' : ''}>${i[labelKey] || i.id}</option>`).join('');
    el.innerHTML = opt;
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initMaintenance);
else initMaintenance();