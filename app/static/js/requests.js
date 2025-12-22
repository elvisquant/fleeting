// app/static/js/requests.js

// --- GLOBAL STATE ---
let allRequests = [];
let availableVehicles = [];
let availableDrivers = [];
let reqUserRole = 'user';
let reqActionId = null;
let reqActionType = null;

// =================================================================
// 0. HELPER: DOM ELEMENT GETTER
// =================================================================
function getReqEl(id) {
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
async function initRequests() {
    console.log("Requests Module: Initializing...");
    reqUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    const search = getReqEl('reqSearch');
    const filter = getReqEl('reqStatusFilter');
    const btnExecute = getReqEl('btnExecuteApproval');
    const btnAssign = getReqEl('btnExecuteAssign');

    if (search) search.addEventListener('input', renderReqTable);
    if (filter) filter.addEventListener('change', renderReqTable);
    if (btnExecute) btnExecute.addEventListener('click', submitApprovalDecision);
    if (btnAssign) btnAssign.addEventListener('click', submitAssignment);

    // Initial Load
    await Promise.all([
        loadRequestsData(),
        loadAssignmentResources()
    ]);
}

// =================================================================
// 2. DATA LOADING
// =================================================================

async function loadRequestsData() {
    const tbody = getReqEl('reqLogsBody');
    if (!tbody) return;
    
    // TRANSLATED LOADING MESSAGE
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>${window.t('msg_loading')}</td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/'); 
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            allRequests = items;
            renderReqTable();
        } else {
            const msg = data && data.detail ? data.detail : window.t('msg_no_records');
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">${window.t('title_error')}: ${msg}</td></tr>`;
        }
    } catch (error) {
        console.error("Load Error:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">${window.t('msg_connection_fail')}</td></tr>`;
    }
}

async function loadAssignmentResources() {
    // Keep backend driver check to show names correctly
    try {
        const vData = await window.fetchWithAuth('/vehicles/?limit=1000');
        availableVehicles = Array.isArray(vData) ? vData : (vData.items || []);

        const dData = await window.fetchWithAuth('/requests/drivers'); 
        availableDrivers = Array.isArray(dData) ? dData : [];

    } catch (e) {
        console.warn("Failed to load assignment resources", e);
    }
}

// =================================================================
// 3. TABLE RENDERING
// =================================================================
function renderReqTable() {
    const tbody = getReqEl('reqLogsBody');
    if (!tbody) return;

    const search = getReqEl('reqSearch');
    const filter = getReqEl('reqStatusFilter');
    
    const searchValue = search ? search.value.toLowerCase() : '';
    const filterValue = filter ? filter.value : '';

    let filtered = allRequests.filter(r => {
        const requesterName = r.requester ? r.requester.full_name.toLowerCase() : "";
        const dest = r.destination ? r.destination.toLowerCase() : "";
        const matchSearch = requesterName.includes(searchValue) || dest.includes(searchValue);
        
        let matchFilter = true;
        if (filterValue === 'pending') matchFilter = r.status === 'pending';
        if (filterValue === 'step1') matchFilter = r.status === 'approved_by_chef';
        if (filterValue === 'step2') matchFilter = r.status === 'approved_by_logistic';
        if (filterValue === 'completed') matchFilter = ['fully_approved', 'in_progress', 'completed'].includes(r.status);
        if (filterValue === 'denied') matchFilter = r.status === 'denied';

        return matchSearch && matchFilter;
    });

    const countEl = getReqEl('reqCount');
    if (countEl) countEl.innerText = `${filtered.length} ${window.t('requests')}`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">${window.t('msg_no_records')}</td></tr>`;
        return;
    }

    const now = new Date();

    tbody.innerHTML = filtered.map(r => {
        const requester = r.requester ? r.requester.full_name : "Unknown";
        const service = r.requester && r.requester.service ? r.requester.service.service_name : "-";
        
        const safeDepString = r.departure_time.endsWith('Z') ? r.departure_time : r.departure_time + 'Z';
        const departureDate = new Date(safeDepString);
        
        // DATE TRANSLATION
        const dep = departureDate.toLocaleString(window.APP_LOCALE);
        const ret = r.return_time ? new Date(r.return_time).toLocaleString(window.APP_LOCALE) : 'N/A';

        const isLocked = now >= departureDate;
        const rowClass = isLocked 
            ? "hover:bg-white/5 border-b border-slate-700/30 opacity-60 bg-slate-900/30" 
            : "hover:bg-white/5 border-b border-slate-700/30";

        // PROGRESS BAR TRANSLATION
        let statusHtml = '';
        if (r.status === 'denied') {
            statusHtml = `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400 border border-red-500/20">${window.t('status_denied')}</span>`;
        } else {
            let step = 0; 
            let text = window.t('status_pending');
            let width = "5%";
            let color = "bg-slate-600";
            
            if (r.status === 'approved_by_chef') { step = 1; text = `1/3 ${window.t('status_approved_chef')}`; width = "33%"; color = "bg-blue-500"; }
            else if (r.status === 'approved_by_logistic') { step = 2; text = `2/3 ${window.t('status_approved_logistic')}`; width = "66%"; color = "bg-purple-500"; }
            else if (['fully_approved', 'in_progress', 'completed'].includes(r.status)) { step = 3; text = `3/3 ${window.t('status_fully_approved')}`; width = "100%"; color = "bg-emerald-500"; }

            statusHtml = `
                <div class="w-36">
                    <div class="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1"><span>${text}</span></div>
                    <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div class="${color} h-1.5 rounded-full" style="width: ${width}"></div>
                    </div>
                </div>`;
        }

        // BADGE TRANSLATION
        let badgeText = r.status.replace(/_/g, ' ');
        if(r.status === 'pending') badgeText = window.t('status_pending');
        else if(r.status === 'approved_by_chef') badgeText = window.t('status_approved_chef');
        else if(r.status === 'approved_by_logistic') badgeText = window.t('status_approved_logistic');
        else if(r.status === 'fully_approved') badgeText = window.t('status_fully_approved');
        else if(r.status === 'denied') badgeText = window.t('status_denied');

        let badgeClass = 'bg-slate-700 text-slate-400 border border-slate-600';
        if(r.status === 'pending') badgeClass = 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20';
        else if(r.status === 'denied') badgeClass = 'bg-red-500/10 text-red-400 border border-red-500/20';
        else if(r.status === 'fully_approved' || r.status === 'completed') badgeClass = 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
        else if(r.status.includes('approved')) badgeClass = 'bg-blue-500/10 text-blue-400 border border-blue-500/20';

        return `
            <tr class="${rowClass}">
                <td class="p-4">
                    <div class="text-white font-medium flex items-center gap-2">
                        ${isLocked ? '<i data-lucide="lock" class="w-3 h-3 text-slate-500"></i>' : ''}
                        ${requester}
                    </div>
                    <div class="text-xs text-slate-500">${service || '-'}</div>
                </td>
                <td class="p-4 text-slate-300 font-mono text-xs">${r.destination || 'N/A'}</td>
                <td class="p-4 text-slate-400 text-xs">${dep}</td>
                <td class="p-4 text-slate-400 text-xs">${ret}</td>
                <td class="p-4">${statusHtml}</td>
                <td class="p-4">
                    <span class="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase whitespace-nowrap ${badgeClass}">
                        ${badgeText}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="openViewRequestModal(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="${isLocked ? window.t('view') : window.t('edit')}">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. ADD REQUEST MODAL
// =================================================================

window.openAddRequestModal = function() {
    const modal = getReqEl('addRequestModal');
    if (!modal) return;
    
    ['reqDestination', 'reqDesc', 'reqPassengers'].forEach(id => {
        const el = getReqEl(id);
        if (el) el.value = "";
    });
    
    const now = new Date();
    const later = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const toLocalISO = (date) => {
        const offset = date.getTimezoneOffset() * 60000;
        return new Date(date.getTime() - offset).toISOString().slice(0, 16);
    };

    const depEl = getReqEl('reqDeparture');
    const retEl = getReqEl('reqReturn');
    if (depEl) depEl.value = toLocalISO(now);
    if (retEl) retEl.value = toLocalISO(later);
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

window.saveRequest = async function() {
    const btn = getReqEl('btnSaveReq');
    if (!btn) return;

    const dest = getReqEl('reqDestination')?.value.trim();
    const dep = getReqEl('reqDeparture')?.value;
    const ret = getReqEl('reqReturn')?.value;
    const desc = getReqEl('reqDesc')?.value.trim();
    const passStr = getReqEl('reqPassengers')?.value;

    if (!dest || !dep || !ret) { 
        showReqErrorAlert(window.t('validation'), window.t('msg_validation_fail')); 
        return; 
    }

    const departureDate = new Date(dep);
    const returnDate = new Date(ret);
    if (returnDate <= departureDate) {
        showReqErrorAlert(window.t('validation'), "Return date must be after departure.");
        return;
    }

    const passengers = passStr ? passStr.split(',').map(s => s.trim()).filter(s => s) : [];

    btn.disabled = true; 
    btn.innerHTML = `${window.t('loading')}`;

    try {
        const result = await window.fetchWithAuth('/requests/', 'POST', {
            destination: dest,
            departure_time: departureDate.toISOString(),
            return_time: returnDate.toISOString(),
            description: desc,
            passengers: passengers
        });
        
        if (result && !result.detail) {
            window.closeModal('addRequestModal');
            await loadRequestsData();
            showReqSuccessAlert(window.t('title_success'), window.t('req_submitted'));
        } else {
            let errorMsg = window.t('title_error');
            if (result.detail) {
                errorMsg = typeof result.detail === 'object' ? JSON.stringify(result.detail) : result.detail;
            }
            showReqErrorAlert(window.t('title_error'), errorMsg);
        }
    } catch(e) { 
        showReqErrorAlert(window.t('title_error'), e.message || window.t('msg_connection_fail')); 
    }
    
    btn.disabled = false; 
    btn.innerHTML = window.t('btn_save');
}

// =================================================================
// 5. VIEW / APPROVE / ASSIGN MODAL
// =================================================================

window.openViewRequestModal = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const viewContent = getReqEl('viewRequestContent');
    const footer = getReqEl('approvalActionsFooter');
    const modal = getReqEl('viewRequestModal');
    
    if (!viewContent || !footer || !modal) return;

    const safeDepString = r.departure_time.endsWith('Z') ? r.departure_time : r.departure_time + 'Z';
    const departureDate = new Date(safeDepString);
    const isLocked = new Date() >= departureDate;

    const requester = r.requester ? r.requester.full_name : "Unknown";
    const service = r.requester && r.requester.service ? r.requester.service.service_name : "-";
    const passengers = r.passengers ? (Array.isArray(r.passengers) ? r.passengers.join(", ") : r.passengers) : "None";
    
    let driverName = window.t('status_pending');
    if (r.driver) {
        if (r.driver.full_name) driverName = r.driver.full_name;
        else if (r.driver.first_name) driverName = `${r.driver.first_name} ${r.driver.last_name || ''}`;
        else driverName = r.driver.username || window.t('status_pending');
    }

    let assignmentHtml = '';
    if (r.vehicle || r.driver) {
        assignmentHtml = `
        <div class="col-span-2 mt-4 pt-4 border-t border-slate-700">
            <h4 class="text-xs uppercase font-bold text-slate-500 mb-2">${window.t('assign_resources')}</h4>
            <div class="grid grid-cols-2 gap-4">
                <div class="p-3 bg-slate-800 rounded-lg flex items-center gap-3">
                    <i data-lucide="car" class="w-5 h-5 text-blue-400"></i>
                    <div>
                        <p class="text-xs text-slate-500">${window.t('col_plate')}</p>
                        <p class="text-sm font-medium text-white">${r.vehicle ? r.vehicle.plate_number : window.t('status_pending')}</p>
                    </div>
                </div>
                <div class="p-3 bg-slate-800 rounded-lg flex items-center gap-3">
                    <i data-lucide="user" class="w-5 h-5 text-blue-400"></i>
                    <div>
                        <p class="text-xs text-slate-500">${window.t('col_driver')}</p>
                        <p class="text-sm font-medium text-white">${driverName}</p>
                    </div>
                </div>
            </div>
        </div>`;
    }

    let rejectionHtml = r.status === 'denied' && r.rejection_reason ? `
        <div class="col-span-2 mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <span class="text-red-400 text-xs uppercase font-bold block mb-1">${window.t('status_denied')} - Reason</span>
            <p class="text-red-200 text-sm">${r.rejection_reason || ''}</p>
        </div>` : '';

    let lockNotice = isLocked ? `
        <div class="col-span-2 mb-2 p-2 bg-slate-800/50 border border-slate-700 rounded text-xs text-slate-400 flex items-center gap-2">
            <i data-lucide="lock" class="w-3 h-3"></i>
            ${window.t('locked_msg')}
        </div>` : '';

    viewContent.innerHTML = `
        <div class="grid grid-cols-2 gap-y-4 gap-x-6">
            ${lockNotice}
            <div class="col-span-2 border-b border-slate-700 pb-3 mb-2 flex justify-between items-center">
                <div>
                    <div class="text-white font-bold text-lg">${requester}</div>
                    <div class="text-slate-500 text-xs">${service || '-'}</div>
                </div>
                <div class="text-right">
                    <div class="text-blue-400 font-mono text-sm">ID #${r.id}</div>
                    <div class="text-slate-500 text-xs uppercase">${r.status.replace(/_/g, ' ')}</div>
                </div>
            </div>
            <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_destination')}</span><span class="text-white">${r.destination || 'N/A'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">${window.t('passengers')}</span><span class="text-white">${passengers}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_departure')}</span><span class="text-white">${r.departure_time ? new Date(r.departure_time).toLocaleString(window.APP_LOCALE) : 'N/A'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">${window.t('col_return')}</span><span class="text-white">${r.return_time ? new Date(r.return_time).toLocaleString(window.APP_LOCALE) : 'N/A'}</span></div>
            <div class="col-span-2">
                <span class="text-slate-500 text-xs uppercase block mb-1">${window.t('col_description')}</span>
                <p class="text-slate-300 text-sm bg-slate-800 p-3 rounded-lg">${r.description || '-'}</p>
            </div>
            ${assignmentHtml}
            ${rejectionHtml}
        </div>`;

    // TRANSLATED BUTTONS
    let buttons = `<button onclick="closeModal('viewRequestModal')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg">${window.t('btn_close')}</button>`;

    if (!isLocked) {
        if (reqUserRole === 'chef' && r.status === 'pending') {
            buttons = getApproveRejectButtons(r.id, "Chef Approval");
        }
        else if (reqUserRole === 'logistic' && r.status === 'approved_by_chef') {
            buttons = getApproveRejectButtons(r.id, "Logistic Approval");
        }
        else if (['charoi', 'admin', 'superadmin'].includes(reqUserRole) && r.status === 'approved_by_logistic') {
            buttons = getApproveRejectButtons(r.id, "Final Approval");
        }

        if (['charoi', 'admin', 'superadmin'].includes(reqUserRole) && 
            ['approved_by_logistic', 'fully_approved', 'in_progress'].includes(r.status)) {
            
            const assignBtn = `
                <button onclick="openAssignmentModal(${r.id})" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2 mr-2">
                    <i data-lucide="steering-wheel" class="w-4 h-4"></i> ${window.t('btn_assign')}
                </button>
            `;
            buttons = assignBtn + buttons;
        }
    }

    footer.innerHTML = buttons;
    modal.classList.remove('hidden');
    
    if (window.lucide) window.lucide.createIcons();
}

function getApproveRejectButtons(id, label) {
    return `
        <button onclick="closeModal('viewRequestModal')" class="px-3 py-2 text-slate-400 hover:text-white text-sm font-medium">${window.t('btn_cancel')}</button>
        <button onclick="openApprovalModal(${id}, 'reject')" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg flex items-center gap-2"><i data-lucide="x-circle" class="w-4 h-4"></i> ${window.t('btn_deny')}</button>
        <button onclick="openApprovalModal(${id}, 'approve')" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4"></i> ${window.t('btn_approve')}</button>
    `;
}

// =================================================================
// 6. RESOURCE ASSIGNMENT LOGIC
// =================================================================

window.openAssignmentModal = function(requestId) {
    window.closeModal('viewRequestModal');
    
    const modal = getReqEl('assignmentModal');
    const vSelect = getReqEl('assignVehicle');
    const dSelect = getReqEl('assignDriver');
    const idInput = getReqEl('assignReqId');
    
    if (!modal) return;

    idInput.value = requestId;

    vSelect.innerHTML = `<option value="">${window.t('lbl_select_vehicle')}</option>`;
    availableVehicles.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        option.text = `${v.plate_number} ${v.make_ref ? '('+v.make_ref.make_name+')' : ''}`;
        vSelect.appendChild(option);
    });

    dSelect.innerHTML = `<option value="">${window.t('lbl_select_driver')}</option>`;
    availableDrivers.forEach(d => {
        const option = document.createElement('option');
        option.value = d.id;
        option.text = d.full_name;
        dSelect.appendChild(option);
    });

    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

async function submitAssignment() {
    const btn = getReqEl('btnExecuteAssign');
    const reqId = getReqEl('assignReqId').value;
    const vId = getReqEl('assignVehicle').value;
    const dId = getReqEl('assignDriver').value;

    if (!vId || !dId) {
        showReqErrorAlert(window.t('validation'), window.t('msg_validation_fail'));
        return;
    }

    btn.disabled = true;
    btn.innerText = window.t('loading');

    try {
        const payload = { vehicle_id: parseInt(vId), driver_id: parseInt(dId) };
        const result = await window.fetchWithAuth(`/requests/${reqId}/assign`, 'PUT', payload);
        
        if (result && !result.detail) {
            window.closeModal('assignmentModal');
            await loadRequestsData(); 
            showReqSuccessAlert(window.t('title_success'), window.t('msg_assigned'));
        } else {
            const msg = result?.detail ? (typeof result.detail === 'object' ? JSON.stringify(result.detail) : result.detail) : "Failed";
            showReqErrorAlert(window.t('title_error'), msg);
        }
    } catch (e) {
        showReqErrorAlert(window.t('title_error'), window.t('msg_connection_fail'));
    }

    btn.disabled = false;
    btn.innerText = window.t('btn_save');
}

// =================================================================
// 7. CONFIRM APPROVE/REJECT
// =================================================================

window.openApprovalModal = function(id, type) {
    window.closeModal('viewRequestModal');
    reqActionId = id;
    reqActionType = type;
    
    const commentEl = getReqEl('approvalComment');
    const titleEl = getReqEl('approvalTitle');
    const btn = getReqEl('btnExecuteApproval');
    const iconDiv = getReqEl('approvalIcon');
    const modal = getReqEl('approvalModal');
    
    if (!titleEl || !btn || !modal) return;
    
    if (commentEl) commentEl.value = "";
    
    if (type === 'approve') {
        titleEl.innerText = window.t('btn_approve');
        btn.innerText = window.t('btn_confirm');
        btn.className = "px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm w-full font-medium shadow-lg";
        if (iconDiv) {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500 bg-green-500/10";
            iconDiv.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6"></i>';
        }
    } else {
        titleEl.innerText = window.t('btn_deny');
        btn.innerText = window.t('btn_confirm');
        btn.className = "px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm w-full font-medium shadow-lg";
        if (iconDiv) {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500 bg-red-500/10";
            iconDiv.innerHTML = '<i data-lucide="x-circle" class="w-6 h-6"></i>';
        }
    }
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

async function submitApprovalDecision() {
    const commentEl = getReqEl('approvalComment');
    const btn = getReqEl('btnExecuteApproval');
    
    if (!btn) return;
    
    const comment = commentEl ? commentEl.value : '';

    if (reqActionType === 'reject' && !comment.trim()) { 
        showReqErrorAlert(window.t('validation'), window.t('msg_validation_fail')); 
        return; 
    }

    btn.disabled = true; 
    btn.innerText = window.t('loading');

    const payload = { 
        status: reqActionType === 'approve' ? 'approved' : 'denied',
        comment: comment.trim() || null 
    };

    try {
        const result = await window.fetchWithAuth(`/approvals/${reqActionId}`, 'POST', payload);
        window.closeModal('approvalModal');
        
        if (result && !result.detail) {
            await loadRequestsData();
            showReqSuccessAlert(window.t('title_success'), window.t('title_success'));
        } else {
            const msg = result?.detail ? (typeof result.detail === 'object' ? JSON.stringify(result.detail) : result.detail) : "Action failed.";
            showReqErrorAlert(window.t('title_error'), msg);
        }
    } catch(e) {
        window.closeModal('approvalModal');
        showReqErrorAlert(window.t('title_error'), window.t('msg_connection_fail'));
    }
    
    btn.disabled = false;
    btn.innerText = window.t('btn_confirm');
}

// =================================================================
// 8. HELPERS
// =================================================================

window.closeModal = function(id) { 
    const modal = getReqEl(id) || document.getElementById(id);
    if (modal) modal.classList.add('hidden'); 
}

function showReqAlert(title, message, isError = false) {
    const modal = getReqEl('reqAlertModal'); 
    
    if (!modal) {
        alert(`${title}: ${message}`);
        return;
    }
    
    const titleEl = getReqEl('reqAlertTitle');
    const messageEl = getReqEl('reqAlertMessage');
    const iconEl = getReqEl('reqAlertIcon');
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerText = message;
    
    if (iconEl) {
        if (isError) {
            iconEl.innerHTML = '<i data-lucide="alert-circle" class="w-6 h-6 text-red-500"></i>';
            iconEl.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-red-500/10";
        } else {
            iconEl.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6 text-green-500"></i>';
            iconEl.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 bg-green-500/10";
        }
    }
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();

    if (!isError) {
        setTimeout(() => modal.classList.add('hidden'), 3000);
    }
}

function showReqSuccessAlert(title, message) { showReqAlert(title, message, false); }
function showReqErrorAlert(title, message) { showReqAlert(title, message, true); }

// =================================================================
// 9. STARTUP
// =================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRequests);
} else {
    initRequests();
}