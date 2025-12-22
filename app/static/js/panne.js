// app/static/js/panne.js

/**
 * ==============================================================================
 * FLEETDASH PANNE MODULE (Multi-Language)
 * Handles vehicle breakdown reporting and verification.
 * ==============================================================================
 */

// --- GLOBAL STATE ---
let allPannes = [];
let panneOptions = { vehicles: [], cats: [] };
let panneUserRole = 'user';

// --- ACTION STATE ---
let panneActionType = null; // 'delete', 'verify', 'bulk-verify'
let panneActionId = null;
let selectedPanneIds = new Set();

// =================================================================
// 0. HELPER: DOM ELEMENT GETTER
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
    console.log("Panne Module: Init");
    panneUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    
    // DOM Elements
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
    if(bulkBtn) bulkBtn.onclick = triggerPanneBulkVerify;
    
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
        <div class="text-sm mt-2">${window.t('msg_loading')}</div>
    </td></tr>`;
    
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/panne/');
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            allPannes = items;
            selectedPanneIds.clear();
            updatePanneBulkUI();
            renderPanneTable();
        } else {
            const msg = data && data.detail ? data.detail : window.t('msg_no_records');
            showPanneAlert(window.t('title_error'), msg, false);
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
                <i data-lucide="alert-circle" class="w-8 h-8 mx-auto mb-2 text-red-400"></i>
                <div>${window.t('title_error')}</div>
            </td></tr>`;
        }
    } catch (error) {
        console.error("Load panne error:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">
            <i data-lucide="wifi-off" class="w-8 h-8 mx-auto mb-2 text-red-400"></i>
            <div>${window.t('msg_connection_fail')}</div>
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
        
        // Populate Filters
        populateSelect('panneVehicleFilter', panneOptions.vehicles, '', 'plate_number', window.t('vehicles') || 'All Vehicles');
        
        // Populate Modals
        populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', window.t('lbl_select_vehicle'));
        populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', window.t('lbl_select_category'));

    } catch(e) {
        console.warn("Panne Dropdown Error:", e);
        showPanneAlert(window.t('title_warning'), "Dropdown error", false);
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
    if (countEl) countEl.innerText = `${filtered.length} ${window.t('panne')}`;

    updateSelectAllCheckbox();

    // Empty State
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">
            <i data-lucide="search" class="w-8 h-8 mx-auto mb-2 text-slate-500"></i>
            <div>${window.t('msg_no_records')}</div>
        </td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);

    // Generate Rows
    tbody.innerHTML = filtered.map(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
        const plate = vehicle ? vehicle.plate_number : `ID ${log.vehicle_id}`;
        const catName = cat ? cat.panne_name : `Category ${log.category_panne_id}`;
        
        // Date Formatting
        const date = log.panne_date ? new Date(log.panne_date).toLocaleDateString(window.APP_LOCALE) : 'N/A';
        
        const shortDesc = log.description 
            ? (log.description.length > 50 ? log.description.substring(0, 50) + '...' : log.description)
            : '-';
        
        // Status Badges
        const verifyBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1 w-fit">
                <i data-lucide="check-circle" class="w-3 h-3"></i> ${window.t('status_verified')}
               </span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 flex items-center gap-1 w-fit">
                <i data-lucide="clock" class="w-3 h-3"></i> ${window.t('status_pending')}
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
            title="${window.t('view')}"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(log.is_verified) {
            actions = `<div class="flex items-center justify-end gap-2">
                ${viewBtn}
                <span class="text-slate-600 cursor-not-allowed p-1.5" title="${window.t('msg_locked')}">
                    <i data-lucide="lock" class="w-4 h-4"></i>
                </span>
            </div>`;
        } else if (canManage) {
            actions = `<div class="flex items-center justify-end gap-2">
                ${viewBtn}
                <button onclick="reqPanneVerify(${log.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-md transition border border-slate-700 hover:border-emerald-500"
                    title="${window.t('btn_verify')}"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                <button onclick="openEditPanneModal(${log.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-amber-600 text-amber-400 hover:text-white rounded-md transition border border-slate-700 hover:border-amber-500"
                    title="${window.t('edit')}"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                <button onclick="reqPanneDelete(${log.id})" 
                    class="p-1.5 bg-slate-800 hover:bg-red-600 text-red-400 hover:text-white rounded-md transition border border-slate-700 hover:border-red-500"
                    title="${window.t('delete')}"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
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
    
    updateSelectAllCheckbox();
    if(window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. BULK OPERATIONS
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

window.triggerPanneBulkVerify = function() {
    if (selectedPanneIds.size === 0) {
        showPanneAlert(window.t('title_warning'), window.t('msg_validation_fail'), false);
        return;
    }
    
    panneActionType = 'bulk-verify';
    panneActionId = null;
    
    showPanneConfirmModal(
        window.t('btn_verify_selected'), 
        `${window.t('confirm')} ${selectedPanneIds.size} ${window.t('panne')}?`, 
        "shield-check", 
        "bg-emerald-600"
    );
}

// =================================================================
// 5. SINGLE ACTIONS
// =================================================================

window.reqPanneVerify = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    
    panneActionType = 'verify';
    panneActionId = id;
    
    showPanneConfirmModal(
        window.t('btn_verify'), 
        window.t('msg_verify_confirm'), 
        "check-circle", 
        "bg-green-600"
    );
}

window.reqPanneDelete = function(id) {
    panneActionType = 'delete';
    panneActionId = id;
    
    showPanneConfirmModal(
        window.t('delete'), 
        window.t('msg_confirm_delete'), 
        "trash-2", 
        "bg-red-600"
    );
}

// =================================================================
// 6. EXECUTE ACTION
// =================================================================

async function executePanneConfirmAction() {
    const btn = getPanneEl('btnPanneConfirmAction');
    if (!btn) return;
    
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('loading')}`;
    
    try {
        let result = null;
        let successMessage = "";
        let idList = [];
        
        if (panneActionType === 'delete') {
            result = await window.fetchWithAuth(`/panne/${panneActionId}`, 'DELETE');
            successMessage = window.t('msg_deleted');
        }
        else if (panneActionType === 'verify') {
            idList = [parseInt(panneActionId)];
            const payload = { ids: idList };
            result = await window.fetchWithAuth(`/panne/verify-bulk`, 'PUT', payload);
            successMessage = window.t('msg_updated');
        }
        else if (panneActionType === 'bulk-verify') {
            idList = Array.from(selectedPanneIds).map(id => parseInt(id));
            const payload = { ids: idList };
            result = await window.fetchWithAuth('/panne/verify-bulk', 'PUT', payload);
            successMessage = window.t('msg_updated');
        }

        window.closeModal('panneConfirmModal');
        
        const isSuccess = result !== null && result !== false && !result.detail;
        
        if (isSuccess) {
            if (panneActionType === 'bulk-verify') {
                selectedPanneIds.clear();
            }
            await loadPanneData();
            showPanneAlert(window.t('title_success'), successMessage, true);
        } else {
            const errorMsg = result?.detail || "Action failed";
            showPanneAlert(window.t('title_error'), errorMsg, false);
        }
        
    } catch(e) {
        window.closeModal('panneConfirmModal');
        showPanneAlert(window.t('title_error'), e.message || "Error", false);
    }
    
    btn.disabled = false;
    btn.innerHTML = originalText;
    
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
    if (modalTitle) modalTitle.innerText = window.t('btn_report_panne');
    if (saveBtn) saveBtn.innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> ${window.t('btn_save')}`;
    
    populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', window.t('lbl_select_vehicle'));
    populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', window.t('lbl_select_category'));
    
    const descEl = getPanneEl('panneDesc');
    const dateEl = getPanneEl('panneDate');
    
    if (descEl) descEl.value = "";
    if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
    
    const modal = getPanneEl('addPanneModal');
    if (modal) modal.classList.remove('hidden');
    
    if(window.lucide) window.lucide.createIcons();
}

window.openEditPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if(!log) return;
    
    if (log.is_verified) {
        showPanneAlert(window.t('title_warning'), window.t('msg_locked'), false);
        return;
    }

    const editIdEl = getPanneEl('panneEditId');
    const modalTitle = getPanneEl('panneModalTitle');
    const saveBtn = getPanneEl('btnSavePanne');
    
    if (editIdEl) editIdEl.value = log.id;
    if (modalTitle) modalTitle.innerText = window.t('edit');
    if (saveBtn) saveBtn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> ${window.t('btn_update')}`;

    populateSelect('panneVehicleSelect', panneOptions.vehicles, log.vehicle_id, 'plate_number', window.t('lbl_select_vehicle'));
    populateSelect('panneCatSelect', panneOptions.cats, log.category_panne_id, 'panne_name', window.t('lbl_select_category'));
    
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

    if(!vId || !catId || !date || !desc) {
        showPanneAlert(window.t('validation'), window.t('msg_validation_fail'), false);
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
    
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('loading')}`;
    
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
            showPanneAlert(window.t('title_success'), window.t('msg_saved'), true);
        } else {
            const errorMsg = result?.detail || "Failed";
            showPanneAlert(window.t('title_error'), typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg, false);
        }
    } catch(e) { 
        showPanneAlert(window.t('title_error'), e.message, false); 
    }
    
    btn.disabled = false; 
    btn.innerHTML = id ? `<i data-lucide="save"></i> ${window.t('btn_update')}` : `<i data-lucide="plus"></i> ${window.t('btn_save')}`;
    if(window.lucide) window.lucide.createIcons();
}

window.openViewPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    
    const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
    const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
    
    // DATE FORMAT
    const dateStr = log.panne_date ? new Date(log.panne_date).toLocaleDateString(window.APP_LOCALE) : 'N/A';

    const content = `
        <div class="space-y-5">
            <div class="grid grid-cols-2 gap-4">
                <div>
                    <span class="text-slate-500 text-xs uppercase block mb-1">${window.t('col_plate')}</span>
                    <div class="text-white font-mono text-sm">${vehicle ? vehicle.plate_number : 'ID ' + log.vehicle_id}</div>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block mb-1">${window.t('col_category')}</span>
                    <span class="text-white">${cat ? cat.panne_name : '-'}</span>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block mb-1">${window.t('col_date')}</span>
                    <span class="text-white">${dateStr}</span>
                </div>
                <div>
                    <span class="text-slate-500 text-xs uppercase block mb-1">${window.t('col_status')}</span>
                    ${log.is_verified 
                        ? `<span class="text-emerald-400 uppercase font-bold text-xs flex items-center gap-1">
                            <i data-lucide="check-circle" class="w-3 h-3"></i> ${window.t('status_verified')}
                          </span>`
                        : `<span class="text-yellow-400 uppercase font-bold text-xs flex items-center gap-1">
                            <i data-lucide="clock" class="w-3 h-3"></i> ${window.t('status_pending')}
                          </span>`}
                </div>
            </div>
            <div class="border-t border-slate-700 pt-4">
                <span class="text-slate-500 text-xs uppercase block mb-2">${window.t('col_description')}</span>
                <div class="text-slate-300 text-sm bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                    ${log.description || '-'}
                </div>
            </div>
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
    if (modal) modal.classList.add('hidden');
}

function showPanneConfirmModal(title, message, icon, color) {
    const modal = getPanneEl('panneConfirmModal');
    if(!modal) {
        if(confirm(title + ": " + message)) executePanneConfirmAction();
        return;
    }
    
    const titleEl = getPanneEl('panneConfirmTitle');
    const messageEl = getPanneEl('panneConfirmMessage');
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerHTML = message;
    
    const btn = getPanneEl('btnPanneConfirmAction');
    if (btn) btn.className = `px-4 py-2.5 text-white rounded-lg text-sm w-full font-medium transition-all duration-200 ${color}`;
    
    const iconDiv = getPanneEl('panneConfirmIcon');
    if(iconDiv) {
        const textColor = color === 'bg-red-600' ? 'text-red-500' : 'text-emerald-500';
        iconDiv.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${textColor} bg-opacity-20 border border-current/20`;
        iconDiv.innerHTML = `<i data-lucide="${icon}" class="w-6 h-6"></i>`;
    }
    
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

function showPanneAlert(title, message, isSuccess) {
    const modal = getPanneEl('panneAlertModal');
    if(!modal) { alert(`${title}: ${message}`); return; }
    
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
    
    modal.classList.remove('hidden');
    
    if(isSuccess) {
        setTimeout(() => modal.classList.add('hidden'), 3000);
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPanne);
} else {
    setTimeout(initPanne, 100);
}

window.initPanne = initPanne;