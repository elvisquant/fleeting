// app/static/js/requests.js

// Global Module State
let allRequests = [];
let availableVehicles = [];
let activeDrivers = [];
let requestUserRole = 'user';
let requestUserMatricule = '';
let currentRequestId = null;

/**
 * SPA Element Getter
 * Finds elements in either the desktop or mobile content containers
 */
function getReqEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

/**
 * Module Entry Point
 */
async function initRequests() {
    console.log("Requests Module: Initializing Professional Workflow...");
    requestUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    requestUserMatricule = localStorage.getItem('user_matricule') || '';

    // UI Listeners
    const searchInput = getReqEl('requestSearch');
    const statusFilter = getReqEl('requestStatusFilter');
    if (searchInput) searchInput.addEventListener('input', renderRequestsTable);
    if (statusFilter) statusFilter.addEventListener('change', renderRequestsTable);

    await loadRequestsData();
    
    // Authorization check for resource loading (Mandatory for Assign/Edit roles)
    const canAssignRoles = ['admin', 'superadmin', 'charoi', 'logistic', 'darh'];
    if (canAssignRoles.includes(requestUserRole)) {
        await Promise.all([
            fetchAvailableVehicles(),
            fetchActiveDrivers()
        ]);
    }
}

// =================================================================
// 1. DATA SYNCHRONIZATION
// =================================================================

async function loadRequestsData() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="p-10 text-center">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
        <div class="text-[10px] font-black uppercase tracking-widest text-slate-500">${window.t('loading')}</div>
    </td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000');
        allRequests = Array.isArray(data) ? data : (data.items || []);
        renderRequestsTable();
    } catch (e) {
        console.error("Critical Sync Error:", e);
    }
}

async function fetchAvailableVehicles() {
    const data = await window.fetchWithAuth('/vehicles/?limit=500');
    if (Array.isArray(data)) {
        availableVehicles = data.filter(v => v.status.toLowerCase() === 'available' || v.status.toLowerCase() === 'active');
    }
}

async function fetchActiveDrivers() {
    const data = await window.fetchWithAuth('/requests/drivers');
    activeDrivers = Array.isArray(data) ? data : [];
}

/**
 * Helper: Calculate Trip Duration
 */
function calculateDuration(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const diffMs = e - s;
    if (diffMs < 0) return "0d 0h";
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}d ${hrs}h`;
}

// =================================================================
// 2. UI RENDERING ENGINE
// =================================================================

function renderRequestsTable() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    const searchValue = (getReqEl('requestSearch')?.value || '').toLowerCase();
    const filterValue = getReqEl('requestStatusFilter')?.value || 'all';

    let filtered = allRequests.filter(r => {
        const searchPool = `${r.destination} ${r.requester?.full_name} ${r.requester?.matricule}`.toLowerCase();
        const matchesSearch = searchPool.includes(searchValue);
        const matchesStatus = filterValue === 'all' || r.status === filterValue;
        return matchesSearch && matchesStatus;
    });

    tbody.innerHTML = filtered.map(r => {
        const depDate = new Date(r.departure_time).toLocaleString(window.APP_LOCALE, {month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'});
        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-all duration-200">
                <td class="p-4">
                    <div class="font-black text-white text-xs md:text-sm uppercase">${r.requester?.full_name || 'System'}</div>
                    <div class="text-[9px] text-slate-500 font-mono tracking-tighter">${r.requester?.matricule || 'N/A'}</div>
                </td>
                <td class="p-4 text-xs md:text-sm text-slate-300 font-bold tracking-tight">${r.destination}</td>
                <td class="p-4 text-[10px] md:text-xs text-slate-400 font-mono italic">${depDate}</td>
                <td class="p-4">${getStatusBadge(r.status)}</td>
                <td class="p-4">
                    ${r.vehicle ? `<div class="text-blue-400 font-black text-[10px] uppercase tracking-widest">${r.vehicle.plate_number}</div>` : '<span class="text-slate-800 text-[9px] font-black uppercase italic tracking-widest">Unassigned</span>'}
                </td>
                <td class="p-4 text-right">
                    <div class="flex justify-end gap-1 md:gap-2">
                        <button onclick="viewRequestDetails(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 rounded-lg border border-slate-700 hover:bg-blue-600 hover:text-white transition shadow-lg" title="View Dossier"><i data-lucide="eye" class="w-4 h-4"></i></button>
                        ${renderWorkflowActions(r)}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

function renderWorkflowActions(r) {
    const role = requestUserRole;
    let html = '';

    // EDIT/ASSIGN BUTTON: Visible for elevated roles if not finalized or denied
    const elevatedRoles = ['admin', 'superadmin', 'logistic', 'darh', 'charoi'];
    if (elevatedRoles.includes(role) && r.status !== 'fully_approved' && r.status !== 'denied') {
        html += `<button onclick="openAssignModal(${r.id})" class="p-1.5 bg-amber-600/20 text-amber-500 rounded-lg border border-amber-500/20 hover:bg-amber-600 hover:text-white transition shadow-sm" title="Edit Assets"><i data-lucide="edit-3" class="w-4 h-4"></i></button>`;
    }

    // Workflow Decision Buttons
    if (role === 'chef' && r.status === 'pending') {
        html += `<button onclick="openApprovalModal(${r.id}, 'chef')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="check-circle" class="w-4 h-4"></i></button>`;
    }
    if (role === 'charoi' && r.status === 'approved_by_chef' && r.vehicle_id) {
        html += `<button onclick="openApprovalModal(${r.id}, 'charoi')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="user-check" class="w-4 h-4"></i></button>`;
    }
    if (role === 'logistic' && r.status === 'approved_by_charoi') {
        html += `<button onclick="openApprovalModal(${r.id}, 'logistic')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="clipboard-check" class="w-4 h-4"></i></button>`;
    }
    if (['darh', 'admin', 'superadmin'].includes(role) && r.status === 'approved_by_logistic') {
        html += `<button onclick="openApprovalModal(${r.id}, 'darh')" class="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition shadow-lg shadow-purple-900/20"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
    }

    return html;
}

// =================================================================
// 3. PRINTING & PDF EXPORT
// =================================================================

window.printMissionOrder = async (id) => {
    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const response = await fetch(`${API_BASE}/approvals/${id}/pdf`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        });
        if (!response.ok) throw new Error("Document locked");
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (win) win.focus();
        else alert("Pop-up blocked! Allow pop-ups for this site.");
    } catch (e) {
        alert("Mission Order document is not finalized or ready for output.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        if(window.lucide) window.lucide.createIcons();
    }
};

// =================================================================
// 4. MODALS (VIEW / ASSIGN / APPROVAL)
// =================================================================

/**
 * MODAL: VIEW DETAILS
 */
window.viewRequestDetails = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const duration = calculateDuration(r.departure_time, r.return_time);
    const printingRoles = ['admin', 'superadmin', 'darh', 'charoi', 'account', 'comptabilite'];
    const canPrint = printingRoles.includes(requestUserRole) && r.status === 'fully_approved';

    const content = `
        <div class="space-y-6 text-left">
            <div class="flex justify-between items-start border-b border-slate-800 pb-4">
                <div>
                    <h4 class="text-2xl font-black text-white uppercase tracking-tighter">${r.destination}</h4>
                    <p class="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-1 italic">${r.description || 'General Mission'}</p>
                </div>
                ${getStatusBadge(r.status)}
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 text-center">
                    <span class="label-text">Departure</span>
                    <p class="text-white text-[11px] font-black">${new Date(r.departure_time).toLocaleString()}</p>
                </div>
                <div class="bg-slate-800/40 p-3 rounded-xl border border-slate-700/50 text-center">
                    <span class="label-text">Return</span>
                    <p class="text-white text-[11px] font-black">${new Date(r.return_time).toLocaleString()}</p>
                </div>
            </div>

            <div class="bg-blue-600/10 border border-blue-500/20 p-2 rounded-xl flex justify-between items-center px-4">
                <span class="label-text">Trip Duration</span>
                <span class="text-blue-400 font-black text-xs uppercase tracking-widest">${duration}</span>
            </div>

            <div class="bg-slate-900/50 p-4 rounded-2xl border border-slate-800 shadow-inner">
                <span class="label-text mb-2 block text-center">Manifest (Matricules)</span>
                <div class="flex flex-wrap justify-center gap-2">
                    ${r.passengers.map(m => `<span class="bg-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-slate-700 font-mono font-black">${m}</span>`).join('')}
                </div>
            </div>

            ${r.vehicle ? `
            <div class="grid grid-cols-2 gap-3 p-3 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                <div class="text-center border-r border-blue-500/10"><span class="label-text block mb-1 text-[8px]">Fleet Unit</span><p class="text-blue-400 font-black text-sm uppercase">${r.vehicle.plate_number}</p></div>
                <div class="text-center"><span class="label-text block mb-1 text-[8px]">Designated Driver</span><p class="text-white font-black text-sm uppercase">${r.driver?.full_name || 'N/A'}</p></div>
            </div>` : ''}

            <div class="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-800">
                <span class="text-[10px] text-slate-600 font-black uppercase tracking-widest">Requested by: ${r.requester?.full_name}</span>
                ${canPrint ? `<button onclick="printMissionOrder(${r.id})" class="flex items-center gap-3 bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black tracking-widest transition-all shadow-xl active:scale-95"><i data-lucide="printer" class="w-4 h-4"></i> PRINT MISSION ORDER</button>` : ''}
            </div>
        </div>
    `;
    getReqEl('viewRequestContent').innerHTML = content;
    getReqEl('viewRequestModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

/**
 * MODAL: CREATE NEW
 */
window.openAddRequestModal = () => {
    getReqEl('addRequestModal').classList.remove('hidden');
    getReqEl('reqPassengersList').value = requestUserMatricule;
};

window.saveNewRequest = async () => {
    const payload = {
        destination: getReqEl('reqDest').value,
        description: getReqEl('reqDesc').value,
        departure_time: getReqEl('reqStart').value,
        return_time: getReqEl('reqEnd').value,
        passengers: getReqEl('reqPassengersList').value.split(',').map(m => m.trim()).filter(m => m !== "")
    };
    const res = await window.fetchWithAuth('/requests/', 'POST', payload);
    if (res && !res.detail) { window.closeModal('addRequestModal'); await loadRequestsData(); }
};

/**
 * MODAL: ASSIGN RESOURCES
 */
window.openAssignModal = (id) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;
    
    const duration = calculateDuration(r.departure_time, r.return_time);
    getReqEl('assignSummary').innerHTML = `<div class="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl mb-6 text-[10px] font-bold uppercase text-center"><p class="text-blue-400 font-black">${r.destination}</p><p class="text-slate-500 font-mono mt-1">${duration} Mission</p></div>`;
    
    // Pre-fill dropdowns with current assignments
    getReqEl('assignVehicle').innerHTML = `<option value="">-- CHOOSE UNIT --</option>` + availableVehicles.map(v => `<option value="${v.id}" ${r.vehicle_id == v.id ? 'selected':''}>${v.plate_number} [${v.make} ${v.model}]</option>`).join('');
    getReqEl('assignDriver').innerHTML = `<option value="">-- CHOOSE DRIVER --</option>` + activeDrivers.map(d => `<option value="${d.id}" ${r.driver_id == d.id ? 'selected':''}>${d.full_name} (${d.matricule})</option>`).join('');
    getReqEl('assignPassengers').value = r.passengers.join(', ');
    getReqEl('assignResourceModal').classList.remove('hidden');
};

window.submitAssignment = async () => {
    const payload = {
        vehicle_id: parseInt(getReqEl('assignVehicle').value),
        driver_id: parseInt(getReqEl('assignDriver').value),
        passengers: getReqEl('assignPassengers').value.split(',').map(m => m.trim()).filter(m => m !== "")
    };
    const res = await window.fetchWithAuth(`/requests/${currentRequestId}/assign`, 'PUT', payload);
    if (res && !res.detail) { window.closeModal('assignResourceModal'); await loadRequestsData(); }
};

/**
 * MODAL: DECISION (Redesigned & Professional)
 */
window.openApprovalModal = (id, stage) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const duration = calculateDuration(r.departure_time, r.return_time);
    getReqEl('approvalStageTitle').innerText = `${stage.toUpperCase()} DECISION GATE`;
    getReqEl('approvalComments').value = "";

    // Mission Details Context Section
    getReqEl('approvalSummary').innerHTML = `
        <div class="text-left bg-slate-900/40 p-5 rounded-2xl border border-slate-800 mb-6 shadow-inner space-y-4">
            <div class="flex justify-between items-start">
                <div>
                    <p class="text-white font-black text-sm tracking-tighter uppercase">${r.destination}</p>
                    <p class="text-[9px] text-slate-500 font-black uppercase tracking-widest mt-0.5">${r.description || 'Routine Operational Mission'}</p>
                </div>
                <span class="text-[9px] bg-slate-800 text-blue-400 px-2 py-1 rounded font-black border border-slate-700 uppercase tracking-widest">${duration}</span>
            </div>
            <div class="grid grid-cols-2 gap-4 text-[10px] font-black uppercase text-slate-400">
                <p>Start: ${new Date(r.departure_time).toLocaleString()}</p>
                <p>End: ${new Date(r.return_time).toLocaleString()}</p>
            </div>
            <div class="pt-3 border-t border-slate-800">
                <p class="text-[9px] font-black text-slate-600 uppercase mb-2">Current Manifest</p>
                <p class="text-[10px] text-slate-300 font-mono tracking-tighter italic overflow-hidden text-ellipsis">${r.passengers.join(', ')}</p>
            </div>
        </div>
    `;

    // OPTIONAL Editing Section for elevated roles
    const managerRoles = ['admin', 'superadmin', 'logistic', 'darh'];
    const editSection = getReqEl('approvalEditSection');

    if (managerRoles.includes(requestUserRole)) {
        editSection.classList.remove('hidden');
        getReqEl('approveVehicle').innerHTML = `<option value="">-- PRESERVE ORIGINAL --</option>` + availableVehicles.map(v => `<option value="${v.id}" ${r.vehicle_id == v.id ? 'selected':''}>${v.plate_number}</option>`).join('');
        getReqEl('approveDriver').innerHTML = `<option value="">-- PRESERVE ORIGINAL --</option>` + activeDrivers.map(d => `<option value="${d.id}" ${r.driver_id == d.id ? 'selected':''}>${d.full_name}</option>`).join('');
        getReqEl('approvePassengers').value = r.passengers.join(', ');
    } else {
        editSection.classList.add('hidden');
    }

    getReqEl('approvalModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

window.submitDecision = async (decision) => {
    const managerRoles = ['admin', 'superadmin', 'logistic', 'darh'];
    
    // Sync optional resource changes first
    if (managerRoles.includes(requestUserRole) && decision === 'approved') {
        const vVal = getReqEl('approveVehicle').value;
        const dVal = getReqEl('approveDriver').value;
        const pVal = getReqEl('approvePassengers').value;

        if (vVal || dVal || pVal) {
            const req = allRequests.find(r => r.id === currentRequestId);
            const assignPayload = {
                vehicle_id: vVal ? parseInt(vVal) : req.vehicle_id,
                driver_id: dVal ? parseInt(dVal) : req.driver_id,
                passengers: pVal ? pVal.split(',').map(m => m.trim()) : req.passengers
            };
            await window.fetchWithAuth(`/requests/${currentRequestId}/assign`, 'PUT', assignPayload);
        }
    }

    const payload = { status: decision, comments: getReqEl('approvalComments').value || "Processed." };
    const res = await window.fetchWithAuth(`/approvals/${currentRequestId}`, 'POST', payload);
    if (res && !res.detail) { window.closeModal('approvalModal'); await loadRequestsData(); }
};

/**
 * UI Helpers
 */
function getStatusBadge(status) {
    const map = { 'pending': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', 'approved_by_chef': 'bg-blue-500/10 text-blue-400 border-blue-500/20', 'approved_by_charoi': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', 'approved_by_logistic': 'bg-purple-500/10 text-purple-400 border-purple-500/20', 'fully_approved': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', 'denied': 'bg-red-500/10 text-red-400 border-red-500/20' };
    const cls = map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    return `<span class="px-2 py-0.5 rounded-full text-[9px] font-black border ${cls} uppercase tracking-tighter shadow-sm">${status.replace(/_/g, ' ')}</span>`;
}

window.closeModal = (id) => getReqEl(id).classList.add('hidden');
initRequests();