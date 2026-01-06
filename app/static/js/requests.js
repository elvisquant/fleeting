// app/static/js/requests.js

// Global State
let allRequests = [];
let availableVehicles = [];
let activeDrivers = [];
let requestUserRole = 'user';
let requestUserMatricule = '';
let currentRequestId = null;

/**
 * Element Getter for SPA compatibility
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
 * Module Initialization
 */
async function initRequests() {
    console.log("Requests Module: Full Professional Initialization");
    requestUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    requestUserMatricule = localStorage.getItem('user_matricule') || '';

    const searchInput = getReqEl('requestSearch');
    const statusFilter = getReqEl('requestStatusFilter');
    if (searchInput) searchInput.addEventListener('input', renderRequestsTable);
    if (statusFilter) statusFilter.addEventListener('change', renderRequestsTable);

    await loadRequestsData();
    
    // Elevated roles fetch vehicle/driver pools for assigning or editing
    const elevatedRoles = ['admin', 'superadmin', 'charoi', 'logistic', 'darh'];
    if (elevatedRoles.includes(requestUserRole)) {
        await Promise.all([
            fetchAvailableVehicles(),
            fetchActiveDrivers()
        ]);
    }
}

// =================================================================
// DATA FETCHING
// =================================================================

async function loadRequestsData() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
        <div class="text-[10px] font-black uppercase tracking-widest">${window.t('loading')}</div>
    </td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000');
        allRequests = Array.isArray(data) ? data : (data.items || []);
        renderRequestsTable();
    } catch (e) {
        console.error("Load Error", e);
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500 font-bold uppercase">Critical Sync Failure</td></tr>`;
    }
}

async function fetchAvailableVehicles() {
    const data = await window.fetchWithAuth('/vehicles/?limit=500');
    if (Array.isArray(data)) {
        availableVehicles = data.filter(v => v.status === 'available' || v.status === 'active');
    }
}

async function fetchActiveDrivers() {
    const data = await window.fetchWithAuth('/requests/drivers');
    activeDrivers = Array.isArray(data) ? data : [];
}

// =================================================================
// TABLE RENDERING
// =================================================================

function renderRequestsTable() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    const searchValue = (getReqEl('requestSearch')?.value || '').toLowerCase();
    const filterValue = getReqEl('requestStatusFilter')?.value || 'all';

    let filtered = allRequests.filter(r => {
        const searchPool = `${r.destination} ${r.requester?.full_name} ${r.requester?.matricule}`.toLowerCase();
        return searchPool.includes(searchValue) && (filterValue === 'all' || r.status === filterValue);
    });

    const countEl = getReqEl('requestsCount');
    if (countEl) countEl.innerText = `${filtered.length} entries synced`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-600 font-bold uppercase tracking-widest">${window.t('no_records')}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const depTime = new Date(r.departure_time).toLocaleString(window.APP_LOCALE, {month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'});
        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-all">
                <td class="p-4">
                    <div class="font-black text-white text-sm uppercase">${r.requester?.full_name || 'N/A'}</div>
                    <div class="text-[10px] text-slate-500 font-mono tracking-tighter">${r.requester?.matricule || ''}</div>
                </td>
                <td class="p-4 text-sm text-slate-300 font-bold tracking-tight">${r.destination}</td>
                <td class="p-4 text-[11px] text-slate-400 font-mono italic">${depTime}</td>
                <td class="p-4">${getStatusBadge(r.status)}</td>
                <td class="p-4">
                    ${r.vehicle ? `
                        <div class="text-blue-400 font-black text-[11px] tracking-widest uppercase">${r.vehicle.plate_number}</div>
                        <div class="text-[10px] text-slate-600 font-bold">${r.driver?.full_name || ''}</div>
                    ` : '<span class="text-slate-800 text-[10px] font-black uppercase italic">Pending Fleet</span>'}
                </td>
                <td class="p-4 text-right">
                    <div class="flex justify-end gap-2">
                        <button onclick="viewRequestDetails(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 rounded-lg border border-slate-700 hover:bg-blue-600 hover:text-white transition shadow-lg" title="View Dossier"><i data-lucide="eye" class="w-4 h-4"></i></button>
                        ${renderWorkflowActions(r)}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Dynamic Action Buttons based on Role & Status
 */
function renderWorkflowActions(r) {
    const role = requestUserRole;
    let html = '';

    // Upgrade: Logistic, DARH, Admin can edit resources at any stage before completion
    const canEdit = ['admin', 'superadmin', 'logistic', 'darh', 'charoi'].includes(role);
    if (canEdit && r.status !== 'fully_approved' && r.status !== 'denied') {
        html += `<button onclick="openAssignModal(${r.id})" class="p-1.5 bg-amber-600/20 text-amber-500 rounded-lg border border-amber-500/20 hover:bg-amber-600 hover:text-white transition" title="Modify Assets/Staff"><i data-lucide="edit-3" class="w-4 h-4"></i></button>`;
    }

    if (role === 'chef' && r.status === 'pending') 
        html += `<button onclick="openApprovalModal(${r.id}, 'chef')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition"><i data-lucide="check-circle" class="w-4 h-4"></i></button>`;
    
    if (role === 'charoi' && r.status === 'approved_by_chef' && r.vehicle_id) 
        html += `<button onclick="openApprovalModal(${r.id}, 'charoi')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition"><i data-lucide="user-check" class="w-4 h-4"></i></button>`;
    
    if (role === 'logistic' && r.status === 'approved_by_charoi') 
        html += `<button onclick="openApprovalModal(${r.id}, 'logistic')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition"><i data-lucide="clipboard-check" class="w-4 h-4"></i></button>`;
    
    if (['darh', 'admin', 'superadmin'].includes(role) && r.status === 'approved_by_logistic') 
        html += `<button onclick="openApprovalModal(${r.id}, 'darh')" class="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition shadow-lg shadow-purple-900/20"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;

    return html;
}

// =================================================================
// 3. PRINTING SYSTEM
// =================================================================

window.printMissionOrder = async (id) => {
    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> GENERATING...`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const response = await fetch(`${API_BASE}/approvals/${id}/pdf`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        });
        if (!response.ok) throw new Error("Restricted or Missing PDF");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const win = window.open(url, '_blank');
        if (!win) alert("Pop-up blocked! Allow pop-ups to view Mission Order.");
    } catch (e) {
        alert("System Error: Mission Order cannot be generated. Check approval status.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        if(window.lucide) window.lucide.createIcons();
    }
};

// =================================================================
// 4. MODALS (VIEW / ASSIGN / APPROVE)
// =================================================================

window.viewRequestDetails = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    // Check Print Permissions
    const canPrintRoles = ['admin', 'superadmin', 'darh', 'charoi', 'account', 'comptabilite'];
    const hasPermission = canPrintRoles.includes(requestUserRole);
    const isApproved = r.status === 'fully_approved';

    // The PRINT BUTTON Logic requested
    let printButtonHtml = '';
    if (hasPermission && isApproved) {
        printButtonHtml = `
            <button onclick="printMissionOrder(${r.id})" class="flex items-center gap-3 bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black tracking-widest transition-all shadow-xl shadow-emerald-900/30 active:scale-95">
                <i data-lucide="printer" class="w-4 h-4"></i> PRINT MISSION ORDER
            </button>
        `;
    }

    const content = `
        <div class="space-y-8">
            <div class="flex justify-between items-start border-b border-slate-800 pb-6">
                <div>
                    <h4 class="text-3xl font-black text-white tracking-tighter uppercase">${r.destination}</h4>
                    <p class="text-slate-400 text-xs mt-1 font-bold tracking-widest uppercase italic">${r.description || 'General mission request'}</p>
                </div>
                ${getStatusBadge(r.status)}
            </div>

            <div class="grid grid-cols-2 gap-4">
                <div class="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
                    <span class="label-text">Departure Schedule</span>
                    <p class="text-white text-sm font-black">${new Date(r.departure_time).toLocaleString()}</p>
                </div>
                <div class="bg-slate-800/40 p-4 rounded-2xl border border-slate-700/50">
                    <span class="label-text">Return Schedule</span>
                    <p class="text-white text-sm font-black">${new Date(r.return_time).toLocaleString()}</p>
                </div>
            </div>

            <div class="bg-slate-950 p-5 rounded-[2rem] border border-slate-800 shadow-inner">
                <span class="label-text mb-4 block text-center">Manifest (Passenger Matricules)</span>
                <div class="flex flex-wrap justify-center gap-2">
                    ${r.passengers.map(m => `<span class="bg-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-slate-700 font-mono font-black shadow-sm">${m}</span>`).join('')}
                </div>
            </div>

            ${r.vehicle ? `
            <div class="grid grid-cols-2 gap-4 p-4 bg-blue-500/5 border border-blue-500/10 rounded-[2rem]">
                <div class="text-center"><span class="label-text block mb-1">Fleet Unit</span><p class="text-blue-400 font-black text-xl uppercase">${r.vehicle.plate_number}</p></div>
                <div class="text-center"><span class="label-text block mb-1">Operator</span><p class="text-white font-black text-lg">${r.driver?.full_name || 'N/A'}</p></div>
            </div>` : ''}

            <div class="flex flex-col md:flex-row justify-between items-center gap-4 pt-6 border-t border-slate-800">
                <span class="text-[10px] text-slate-600 font-black uppercase tracking-[0.2em]">Origin: ${r.requester?.full_name}</span>
                ${printButtonHtml}
            </div>
        </div>
    `;
    
    getReqEl('viewRequestContent').innerHTML = content;
    getReqEl('viewRequestModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

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

window.openAssignModal = (id) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;
    getReqEl('assignSummary').innerHTML = `<div class="bg-blue-600/10 border border-blue-500/20 p-4 rounded-2xl mb-6 text-xs font-black uppercase tracking-[0.1em] text-center"><p class="text-blue-400">${r.destination}</p><p class="text-slate-500 font-mono mt-1">${new Date(r.departure_time).toLocaleString()}</p></div>`;
    
    getReqEl('assignVehicle').innerHTML = `<option value="">-- NO UNIT SELECTED --</option>` + availableVehicles.map(v => `<option value="${v.id}" ${r.vehicle_id === v.id ? 'selected':''}>${v.plate_number} [${v.make} ${v.model}]</option>`).join('');
    getReqEl('assignDriver').innerHTML = `<option value="">-- NO DRIVER SELECTED --</option>` + activeDrivers.map(d => `<option value="${d.id}" ${r.driver_id === d.id ? 'selected':''}>${d.full_name} (${d.matricule})</option>`).join('');
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

window.openApprovalModal = (id, stage) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    getReqEl('approvalStageTitle').innerText = `${stage.toUpperCase()} DECISION`;
    getReqEl('approvalSummary').innerHTML = `<div class="text-center bg-slate-900 p-4 rounded-2xl border border-slate-800 mb-6 text-[10px] font-black uppercase tracking-widest text-white">${r.destination}</div>`;
    getReqEl('approvalModal').classList.remove('hidden');
};

window.submitDecision = async (decision) => {
    const payload = { status: decision, comments: getReqEl('approvalComments').value || "Manual Administrative Action" };
    const res = await window.fetchWithAuth(`/approvals/${currentRequestId}`, 'POST', payload);
    if (res && !res.detail) { window.closeModal('approvalModal'); await loadRequestsData(); }
};

function getStatusBadge(status) {
    const map = { 'pending': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', 'approved_by_chef': 'bg-blue-500/10 text-blue-400 border-blue-500/20', 'approved_by_charoi': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', 'approved_by_logistic': 'bg-purple-500/10 text-purple-400 border-purple-500/20', 'fully_approved': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', 'denied': 'bg-red-500/10 text-red-400 border-red-500/20' };
    const cls = map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    return `<span class="px-3 py-1 rounded-full text-[9px] font-black border ${cls} uppercase tracking-tighter shadow-sm">${status.replace(/_/g, ' ')}</span>`;
}

window.closeModal = (id) => getReqEl(id).classList.add('hidden');
initRequests();