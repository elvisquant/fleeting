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
// 0. HELPER: DOM ELEMENT GETTER
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
    console.log("Maintenance Module: Init");
    maintUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // DOM Elements
    const search = getMaintEl('maintSearch');
    const vFilter = getMaintEl('maintVehicleFilter');
    const sFilter = getMaintEl('maintStatusFilter');
    const selectAll = getMaintEl('selectAllMaint');
    const confirmBtn = getMaintEl('btnMaintConfirmAction');
    
    // Attach Listeners
    if(search) search.addEventListener('input', renderMaintTable);
    if(vFilter) vFilter.addEventListener('change', renderMaintTable);
    if(sFilter) sFilter.addEventListener('change', renderMaintTable);
    if(selectAll) selectAll.addEventListener('change', toggleMaintSelectAll);
    if(confirmBtn) confirmBtn.addEventListener('click', executeMaintConfirmAction);

    // Initial Load
    await Promise.all([loadMaintData(), fetchMaintDropdowns()]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadMaintData() {
    const tbody = getMaintEl('maintLogsBody');
    if(!tbody) return;
    
    // Translated Loading
    tbody.innerHTML = `<tr><td colspan="8" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>${window.t('msg_loading')}</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/maintenances/');
        const items = data.items || data;

        if (Array.isArray(items)) {
            allMaintLogs = items;
            selectedMaintIds.clear();
            updateMaintBulkUI();
            renderMaintTable();
        } else {
            const msg = data && data.detail ? data.detail : window.t('title_error');
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">${window.t('title_error')}: ${msg}</td></tr>`;
        }
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-red-400">${window.t('msg_connection_fail')}</td></tr>`;
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
        
        populateSelect('maintVehicleFilter', maintOptions.vehicles, '', 'plate_number', window.t('vehicles') || 'All Vehicles');
        populateSelect('maintVehicleSelect', maintOptions.vehicles, '', 'plate_number', window.t('lbl_select_vehicle'));
        populateSelect('maintCatSelect', maintOptions.cats, '', 'cat_maintenance', window.t('lbl_select_category'));
        populateSelect('maintGarageSelect', maintOptions.garages, '', 'nom_garage', window.t('select_garage') || 'Select Garage');

    } catch(e) { 
        console.warn("Maint Dropdown Error", e); 
    }
}

// =================================================================
// 3. TABLE RENDERING
// =================================================================
function renderMaintTable() {
    const tbody = getMaintEl('maintLogsBody');
    if(!tbody) return;

    // Get Filter Values
    const search = getMaintEl('maintSearch');
    const vFilter = getMaintEl('maintVehicleFilter');
    const sFilter = getMaintEl('maintStatusFilter');
    
    const searchValue = search ? search.value.toLowerCase() : '';
    const vFilterValue = vFilter ? vFilter.value : '';
    const sFilterValue = sFilter ? sFilter.value : '';

    // Filter Data
    let filtered = allMaintLogs.filter(log => {
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const receipt = log.receipt ? log.receipt.toLowerCase() : "";
        
        const matchesSearch = plate.includes(searchValue) || receipt.includes(searchValue);
        const matchesVehicle = vFilterValue === "" || log.vehicle_id == vFilterValue;
        
        let matchesStatus = true;
        if (sFilterValue === 'verified') matchesStatus = log.is_verified === true;
        if (sFilterValue === 'pending') matchesStatus = log.is_verified !== true;

        return matchesSearch && matchesVehicle && matchesStatus;
    });

    const countEl = getMaintEl('maintLogsCount');
    if (countEl) countEl.innerText = `${filtered.length} ${window.t('maintenance')}`;

    if(filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500">${window.t('msg_no_records')}</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(maintUserRole);

    // Generate Rows
    tbody.innerHTML = filtered.map(log => {
        const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
        const garage = maintOptions.garages.find(g => g.id === log.garage_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.cat_maintenance : '-';
        const garageName = garage ? garage.nom_garage : '-';
        
        // Date Format
        const date = new Date(log.maintenance_date).toLocaleDateString(window.APP_LOCALE);

        // Status Badges (Translated)
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">${window.t('status_verified')}</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">${window.t('status_pending')}</span>`;

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
        const viewBtn = `<button onclick="openViewMaintModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="${window.t('view')}"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(log.is_verified) {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed" title="${window.t('msg_locked')}"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
        } else if (canManage) {
             actions = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqMaintVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition" title="${window.t('btn_verify')}"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditMaintModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="${window.t('edit')}"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="reqMaintDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="${window.t('delete')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30 group">
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
// 4. BULK OPERATIONS
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
        allMaintLogs.forEach(log => {
             if(canManage && !log.is_verified) selectedMaintIds.add(log.id);
        });
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
    maintActionId = null;
    
    showMaintConfirmModal(
        window.t('btn_verify_selected'), 
        `${window.t('msg_verify_confirm')}?`, 
        "check-circle", 
        "bg-emerald-600"
    );
}

// =================================================================
// 5. SINGLE ACTIONS
// =================================================================

window.reqMaintVerify = function(id) {
    maintActionType = 'verify'; 
    maintActionId = id;
    showMaintConfirmModal(window.t('btn_verify'), window.t('msg_verify_confirm'), "check-circle", "bg-green-600");
}

window.reqMaintDelete = function(id) {
    maintActionType = 'delete'; 
    maintActionId = id;
    showMaintConfirmModal(window.t('delete'), window.t('msg_confirm_delete'), "trash-2", "bg-red-600");
}

async function executeMaintConfirmAction() {
    const btn = getMaintEl('btnMaintConfirmAction');
    if (!btn) return;
    
    btn.disabled = true; 
    btn.innerText = window.t('loading');

    try {
        let result;
        if (maintActionType === 'delete') {
            result = await window.fetchWithAuth(`/maintenances/${maintActionId}`, 'DELETE');
        } 
        else if (maintActionType === 'verify') {
            const payload = { ids: [parseInt(maintActionId)] };
            result = await window.fetchWithAuth(`/maintenances/verify-bulk`, 'PUT', payload);
        }
        else if (maintActionType === 'bulk-verify') {
             const idList = Array.from(selectedMaintIds).map(id => parseInt(id));
             const payload = { ids: idList };
             result = await window.fetchWithAuth('/maintenances/verify-bulk', 'PUT', payload);
        }
        
        window.closeModal('maintConfirmModal');
        
        if(result !== null) {
            if (maintActionType === 'bulk-verify') selectedMaintIds.clear();
            await loadMaintData();
            showMaintAlert(window.t('title_success'), window.t('msg_updated'), true);
        } else {
            showMaintAlert(window.t('title_error'), "Failed", false);
        }
    } catch(e) {
        window.closeModal('maintConfirmModal');
        showMaintAlert(window.t('title_error'), e.message || "Error", false);
    }
    
    btn.disabled = false; 
    btn.innerText = window.t('btn_confirm'); 
    maintActionId = null; 
    maintActionType = null;
}

// =================================================================
// 7. ADD / EDIT / VIEW LOGIC
// =================================================================

window.openAddMaintModal = function() {
    const editIdEl = getMaintEl('maintEditId');
    const modalTitle = getMaintEl('maintModalTitle');
    const saveBtn = getMaintEl('btnSaveMaint');
    
    if (editIdEl) editIdEl.value = "";
    if (modalTitle) modalTitle.innerText = window.t('btn_log_maintenance');
    if (saveBtn) saveBtn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> ${window.t('btn_save')}`;
    
    populateSelect('maintVehicleSelect', maintOptions.vehicles, '', 'plate_number', window.t('lbl_select_vehicle'));
    populateSelect('maintCatSelect', maintOptions.cats, '', 'cat_maintenance', window.t('lbl_select_category'));
    populateSelect('maintGarageSelect', maintOptions.garages, '', 'nom_garage', window.t('select_garage') || 'Select Garage');
    
    const costEl = getMaintEl('maintCost');
    const dateEl = getMaintEl('maintDate');
    const receiptEl = getMaintEl('maintReceipt');
    
    if (costEl) costEl.value = "";
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    if (receiptEl) receiptEl.value = "";
    
    const modal = getMaintEl('addMaintModal');
    if (modal) modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditMaintModal = function(id) {
    const log = allMaintLogs.find(l => l.id === id);
    if(!log) return;

    const editIdEl = getMaintEl('maintEditId');
    const modalTitle = getMaintEl('maintModalTitle');
    const saveBtn = getMaintEl('btnSaveMaint');
    
    if (editIdEl) editIdEl.value = log.id;
    if (modalTitle) modalTitle.innerText = window.t('edit');
    if (saveBtn) saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> ${window.t('btn_update')}`;
    
    populateSelect('maintVehicleSelect', maintOptions.vehicles, log.vehicle_id, 'plate_number', window.t('lbl_select_vehicle'));
    populateSelect('maintCatSelect', maintOptions.cats, log.cat_maintenance_id, 'cat_maintenance', window.t('lbl_select_category'));
    populateSelect('maintGarageSelect', maintOptions.garages, log.garage_id, 'nom_garage', window.t('select_garage') || 'Select Garage');
    
    const costEl = getMaintEl('maintCost');
    const dateEl = getMaintEl('maintDate');
    const receiptEl = getMaintEl('maintReceipt');
    
    if (costEl) costEl.value = log.maintenance_cost;
    if (dateEl) dateEl.value = log.maintenance_date ? log.maintenance_date.split('T')[0] : '';
    if (receiptEl) receiptEl.value = log.receipt || '';
    
    const modal = getMaintEl('addMaintModal');
    if (modal) modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveMaintenance = async function() {
    const editIdEl = getMaintEl('maintEditId');
    const vIdEl = getMaintEl('maintVehicleSelect');
    const catIdEl = getMaintEl('maintCatSelect');
    const garageIdEl = getMaintEl('maintGarageSelect');
    const costEl = getMaintEl('maintCost');
    const dateEl = getMaintEl('maintDate');
    const receiptEl = getMaintEl('maintReceipt');
    
    const id = editIdEl ? editIdEl.value : '';
    const vId = vIdEl ? vIdEl.value : '';
    const catId = catIdEl ? catIdEl.value : '';
    const garageId = garageIdEl ? garageIdEl.value : '';
    const cost = costEl ? costEl.value : '';
    const date = dateEl ? dateEl.value : '';
    const receipt = receiptEl ? receiptEl.value : '';

    if(!vId || isNaN(cost) || !date) { 
        showMaintAlert(window.t('validation'), window.t('msg_validation_fail'), false); 
        return; 
    }

    const payload = {
        vehicle_id: parseInt(vId),
        cat_maintenance_id: catId ? parseInt(catId) : null,
        garage_id: garageId ? parseInt(garageId) : null,
        maintenance_cost: parseFloat(cost),
        maintenance_date: new Date(date).toISOString(),
        receipt: receipt
    };

    const btn = getMaintEl('btnSaveMaint');
    if (!btn) return;
    
    btn.disabled = true; 
    btn.innerHTML = window.t('msg_loading');
    
    try {
        let result;
        if(id) {
            result = await window.fetchWithAuth(`/maintenances/${id}`, 'PUT', payload);
        } else {
            result = await window.fetchWithAuth('/maintenances/', 'POST', payload);
        }
        
        if(result && !result.detail) {
            window.closeModal('addMaintModal');
            await loadMaintData();
            showMaintAlert(window.t('title_success'), window.t('msg_saved'), true);
        } else {
            const msg = result?.detail ? JSON.stringify(result.detail) : "Failed to save.";
            showMaintAlert(window.t('title_error'), msg, false);
        }
    } catch(e) {
        showMaintAlert(window.t('title_error'), e.message || "Failed to save.", false);
    }
    
    btn.disabled = false; 
    btn.innerHTML = id ? `<i data-lucide="save"></i> ${window.t('btn_update')}` : `<i data-lucide="plus"></i> ${window.t('btn_save')}`;
    if(window.lucide) window.lucide.createIcons();
}

window.openViewMaintModal = function(id) {
    const log = allMaintLogs.find(l => l.id === id);
    if (!log) return;
    const vehicle = maintOptions.vehicles.find(v => v.id === log.vehicle_id);
    const cat = maintOptions.cats.find(c => c.id === log.cat_maintenance_id);
    const garage = maintOptions.garages.find(g => g.id === log.garage_id);

    const dateStr = log.maintenance_date ? new Date(log.maintenance_date).toLocaleDateString(window.APP_LOCALE) : 'N/A';

    const content = `
        <div class="grid grid-cols-2 gap-y-4">
            <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_plate')}</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : log.vehicle_id}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_category')}</span><span class="text-white">${cat ? cat.cat_maintenance : '-'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_garage')}</span><span class="text-white">${garage ? garage.nom_garage : '-'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_receipt')}</span><span class="text-white font-mono">${log.receipt || '-'}</span></div>
            <div class="col-span-2 border-t border-slate-700 pt-2 flex justify-between items-center">
                <span class="text-slate-500 text-xs uppercase">${window.t('col_cost')}</span>
                <span class="text-emerald-400 font-bold text-lg">BIF ${log.maintenance_cost ? log.maintenance_cost.toFixed(2) : '0.00'}</span>
            </div>
             <div class="col-span-2 text-xs text-slate-600 text-center mt-2">
                ${window.t('col_date')}: ${dateStr}
            </div>
        </div>
    `;
    
    const viewContent = getMaintEl('viewMaintContent');
    if (viewContent) viewContent.innerHTML = content;
    
    const modal = getMaintEl('viewMaintModal');
    if (modal) modal.classList.remove('hidden');
}

// =================================================================
// 8. HELPER FUNCTIONS
// =================================================================

window.closeModal = function(id) { 
    const modal = getMaintEl(id) || document.getElementById(id);
    if (modal) modal.classList.add('hidden'); 
}

function showMaintConfirmModal(title, message, icon, color) {
    const modal = getMaintEl('maintConfirmModal');
    if(!modal) return;
    
    const titleEl = getMaintEl('maintConfirmTitle');
    const messageEl = getMaintEl('maintConfirmMessage');
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerText = message;
    
    const btn = getMaintEl('btnMaintConfirmAction');
    if (btn) {
        btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${color}`;
    }
    
    const iconDiv = getMaintEl('maintConfirmIcon');
    if(iconDiv) {
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${color.replace('bg-', 'text-').replace('600', '500')} bg-opacity-20`;
        iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    }

    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showMaintAlert(title, message, isSuccess) {
    // Dynamically create modal if needed (or reuse a generic one)
    let modal = getMaintEl('maintAlertModal');
    
    if(!modal) {
        // Fallback or dynamic creation logic (omitted for brevity, assumes HTML exists)
        alert(`${title}: ${message}`);
        return;
    }
    
    const titleEl = getMaintEl('maintAlertTitle'); // Adjust ID in HTML if needed or rename here
    const messageEl = getMaintEl('maintAlertMessage'); // Adjust ID
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerText = message;
    
    const iconDiv = getMaintEl('maintAlertIcon'); // Adjust ID
    if(iconDiv) {
        if(isSuccess) {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-green-500/10 text-green-500";
            iconDiv.innerHTML = '<i data-lucide="check" class="w-6 h-6"></i>';
        } else {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/10 text-red-500";
            iconDiv.innerHTML = '<i data-lucide="x" class="w-6 h-6"></i>';
        }
    }
    
    modal.classList.remove('hidden');
    
    if(isSuccess) {
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 3000);
    }
    
    if(window.lucide) window.lucide.createIcons();
}

function populateSelect(id, list, selectedValue, labelKey, defaultText) {
    const el = getMaintEl(id);
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMaintenance);
} else {
    initMaintenance();
}