// app/static/js/requests.js

// Global State for Requests Module
let allRequests = [];
let availableVehicles = [];
let activeDrivers = [];
let requestUserRole = 'user';
let requestUserMatricule = '';
let currentRequestId = null;

/**
 * Mobile-compatible element getter
 * Checks mobile container first, then desktop
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
 * Initialization function called by router.js
 */
async function initRequests() {
    console.log("Requests Module: Init");
    requestUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    requestUserMatricule = localStorage.getItem('user_matricule') || '';

    // Attach Search and Filter Listeners
    const searchInput = getReqEl('requestSearch');
    const statusFilter = getReqEl('requestStatusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', renderRequestsTable);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', renderRequestsTable);
    }

    // Load initial data
    await loadRequestsData();
    
    // Fetch background data for managers
    const managementRoles = ['admin', 'superadmin', 'charoi', 'logistic', 'darh'];
    if (managementRoles.includes(requestUserRole)) {
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
        <div>${window.t('loading')}</div>
    </td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000');
        allRequests = Array.isArray(data) ? data : (data.items || []);
        renderRequestsTable();
    } catch (error) {
        console.error("Load requests error:", error);
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-400">Error loading requests</td></tr>`;
    }
}

async function fetchAvailableVehicles() {
    try {
        const data = await window.fetchWithAuth('/vehicles/?limit=500');
        if (Array.isArray(data)) {
            // Only show active/available vehicles for assignment
            availableVehicles = data.filter(v => v.status.toLowerCase() === 'available' || v.status.toLowerCase() === 'active');
        }
    } catch (e) { console.warn("Vehicles fetch error", e); }
}

async function fetchActiveDrivers() {
    try {
        const data = await window.fetchWithAuth('/requests/drivers');
        activeDrivers = Array.isArray(data) ? data : [];
    } catch (e) { console.warn("Drivers fetch error", e); }
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
        const matchesSearch = 
            r.destination.toLowerCase().includes(searchValue) || 
            (r.requester?.full_name || '').toLowerCase().includes(searchValue);
        const matchesStatus = filterValue === 'all' || r.status === filterValue;
        return matchesSearch && matchesStatus;
    });

    const countEl = getReqEl('requestsCount');
    if (countEl) countEl.innerText = `${filtered.length} ${window.t('requests')} found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500">${window.t('no_records')}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const statusBadge = getStatusBadge(r.status);
        const depDate = new Date(r.departure_time).toLocaleString(window.APP_LOCALE, { 
            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' 
        });

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-colors">
                <td class="p-4">
                    <div class="font-medium text-white text-sm">${r.requester?.full_name || 'Unknown'}</div>
                    <div class="text-[10px] text-slate-500 font-mono">${r.requester?.matricule || ''}</div>
                </td>
                <td class="p-4">
                    <div class="flex items-center gap-2 text-sm text-slate-200">
                        <i data-lucide="map-pin" class="w-3 h-3 text-blue-400"></i>
                        ${r.destination}
                    </div>
                </td>
                <td class="p-4 text-xs text-slate-400">
                    ${depDate}
                </td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4">
                    ${r.vehicle ? `
                        <div class="text-[11px] text-blue-400 font-bold">${r.vehicle.plate_number}</div>
                        <div class="text-[10px] text-slate-500">${r.driver?.full_name || 'No Driver'}</div>
                    ` : '<span class="text-slate-700 text-xs italic">Not Assigned</span>'}
                </td>
                <td class="p-4 text-right">
                    <div class="flex justify-end gap-2">
                        <button onclick="viewRequestDetails(${r.id})" 
                            class="p-1.5 bg-slate-800 text-blue-400 rounded-md hover:bg-slate-700 border border-slate-700 transition" 
                            title="${window.t('view')}">
                            <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                        ${renderActionButtons(r)}
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

function renderActionButtons(r) {
    const role = requestUserRole;
    let btns = '';

    // Step 1: Chef Approval
    if (role === 'chef' && r.status === 'pending') {
        btns += `<button onclick="openApprovalModal(${r.id}, 'chef')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-md hover:bg-emerald-600 hover:text-white transition border border-emerald-500/20"><i data-lucide="check-square" class="w-4 h-4"></i></button>`;
    }

    // Step 2: Charoi / Logistic Assignment
    // Can assign if Chef has approved or if Admin/Logistic needs to step in
    const canAssign = ['admin', 'superadmin', 'charoi', 'logistic'].includes(role);
    if (canAssign && r.status === 'approved_by_chef') {
        btns += `<button onclick="openAssignModal(${r.id})" class="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-500 transition shadow-lg shadow-blue-500/20"><i data-lucide="truck" class="w-4 h-4"></i></button>`;
    }

    // Step 2.5: Charoi Formal Approval (after resources are set)
    if (role === 'charoi' && r.status === 'approved_by_chef' && r.vehicle_id) {
        btns += `<button onclick="openApprovalModal(${r.id}, 'charoi')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-md hover:bg-emerald-600 hover:text-white transition border border-emerald-500/20"><i data-lucide="user-check" class="w-4 h-4"></i></button>`;
    }

    // Step 3: Logistic Approval
    if (role === 'logistic' && r.status === 'approved_by_charoi') {
        btns += `<button onclick="openApprovalModal(${r.id}, 'logistic')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-md hover:bg-emerald-600 hover:text-white transition border border-emerald-500/20"><i data-lucide="clipboard-check" class="w-4 h-4"></i></button>`;
    }

    // Step 4: DARH Validation
    if (['darh', 'admin', 'superadmin'].includes(role) && r.status === 'approved_by_logistic') {
        btns += `<button onclick="openApprovalModal(${r.id}, 'darh')" class="p-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-500 transition shadow-lg shadow-purple-500/20"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
    }

    return btns;
}

// =================================================================
// MODAL ACTIONS
// =================================================================

/**
 * FIXED: View Detailed Request Information
 */
window.viewRequestDetails = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const content = `
        <div class="space-y-6">
            <div class="flex justify-between items-start border-b border-slate-800 pb-4">
                <div>
                    <h4 class="text-xl font-bold text-white">${r.destination}</h4>
                    <p class="text-sm text-slate-400 mt-1">${r.description || 'No detailed description provided.'}</p>
                </div>
                ${getStatusBadge(r.status)}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div class="space-y-4">
                    <div>
                        <span class="label-text">${window.t('departure')}</span>
                        <p class="text-white font-medium">${new Date(r.departure_time).toLocaleString()}</p>
                    </div>
                    <div>
                        <span class="label-text">${window.t('return')}</span>
                        <p class="text-white font-medium">${new Date(r.return_time).toLocaleString()}</p>
                    </div>
                </div>
                <div class="space-y-4">
                    <div>
                        <span class="label-text">${window.t('requester')}</span>
                        <p class="text-white font-medium">${r.requester?.full_name} (${r.requester?.matricule})</p>
                    </div>
                    <div>
                        <span class="label-text">Creation Date</span>
                        <p class="text-slate-400 text-xs">${new Date(r.created_at).toLocaleString()}</p>
                    </div>
                </div>
            </div>

            <div class="bg-slate-800/50 p-4 rounded-xl border border-slate-700">
                <span class="label-text mb-2">Passengers on board (Matricules)</span>
                <div class="flex flex-wrap gap-2 mt-2">
                    ${r.passengers.map(m => `<span class="bg-slate-700 text-slate-200 px-2 py-1 rounded text-[10px] font-mono border border-slate-600">${m}</span>`).join('')}
                </div>
            </div>

            ${r.vehicle ? `
            <div class="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                        <i data-lucide="car" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <span class="label-text">Vehicle Assigned</span>
                        <p class="text-sm font-bold text-white">${r.vehicle.plate_number}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                        <i data-lucide="user" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <span class="label-text">Driver Assigned</span>
                        <p class="text-sm font-bold text-white">${r.driver?.full_name || 'N/A'}</p>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
    `;

    getReqEl('viewRequestContent').innerHTML = content;
    getReqEl('viewRequestModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

window.openAddRequestModal = () => {
    getReqEl('addRequestModal').classList.remove('hidden');
    // Pre-fill requester's matricule
    getReqEl('reqPassengersList').value = requestUserMatricule;
};

window.saveNewRequest = async () => {
    const btn = getReqEl('btnSaveRequest');
    const originalText = btn.innerHTML;
    
    const payload = {
        destination: getReqEl('reqDest').value,
        description: getReqEl('reqDesc').value,
        departure_time: getReqEl('reqStart').value,
        return_time: getReqEl('reqEnd').value,
        passengers: getReqEl('reqPassengersList').value.split(',').map(m => m.trim()).filter(m => m !== "")
    };

    if (!payload.destination || !payload.departure_time || !payload.return_time) {
        alert("Please fill in all mandatory fields.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>`;

    const res = await window.fetchWithAuth('/requests/', 'POST', payload);
    if (res) {
        window.closeModal('addRequestModal');
        await loadRequestsData();
    }
    btn.disabled = false;
    btn.innerHTML = originalText;
};

/**
 * FIXED: Assignment Modal with Context Summary
 */
window.openAssignModal = (id) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    // Show context summary
    getReqEl('assignSummary').innerHTML = `
        <div class="bg-blue-600/10 border border-blue-500/20 p-3 rounded-lg mb-4">
            <div class="flex justify-between items-center mb-1">
                <span class="text-blue-400 font-bold text-sm">${r.destination}</span>
                <span class="text-[10px] text-slate-500 font-mono">ID: #${r.id}</span>
            </div>
            <p class="text-[10px] text-slate-400">
                <i data-lucide="calendar" class="w-3 h-3 inline mr-1"></i>
                ${new Date(r.departure_time).toLocaleString()} to ${new Date(r.return_time).toLocaleString()}
            </p>
        </div>
    `;

    // Populate Selects
    const vSelect = getReqEl('assignVehicle');
    const dSelect = getReqEl('assignDriver');

    vSelect.innerHTML = `<option value="">-- Choose Vehicle --</option>` + 
        availableVehicles.map(v => `<option value="${v.id}">${v.plate_number} (${v.make} ${v.model})</option>`).join('');
    
    dSelect.innerHTML = `<option value="">-- Choose Driver --</option>` + 
        activeDrivers.map(d => `<option value="${d.id}">${d.full_name} [${d.matricule}]</option>`).join('');

    getReqEl('assignPassengers').value = r.passengers.join(', ');
    getReqEl('assignResourceModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

window.submitAssignment = async () => {
    const vId = getReqEl('assignVehicle').value;
    const dId = getReqEl('assignDriver').value;

    if (!vId || !dId) {
        alert("Both Vehicle and Driver must be selected.");
        return;
    }

    const payload = {
        vehicle_id: parseInt(vId),
        driver_id: parseInt(dId),
        passengers: getReqEl('assignPassengers').value.split(',').map(m => m.trim()).filter(m => m !== "")
    };

    const res = await window.fetchWithAuth(`/requests/${currentRequestId}/assign`, 'PUT', payload);
    if (res) {
        window.closeModal('assignResourceModal');
        await loadRequestsData();
    }
};

/**
 * FIXED: Approval Modal with Context Summary
 */
window.openApprovalModal = (id, stage) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    getReqEl('approvalStageTitle').innerText = `${stage.toUpperCase()} Approval`;
    getReqEl('approvalComments').value = "";

    getReqEl('approvalSummary').innerHTML = `
        <div class="text-left bg-slate-800 p-3 rounded-lg border border-slate-700 mb-4">
            <div class="flex justify-between items-start mb-2">
                <span class="text-white font-bold text-sm">${r.destination}</span>
                <span class="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded text-slate-400">Step: ${r.status}</span>
            </div>
            <div class="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                <span><i data-lucide="clock" class="w-3 h-3 inline"></i> ${new Date(r.departure_time).toLocaleString()}</span>
                <span class="text-right">${r.requester?.full_name}</span>
            </div>
        </div>
    `;

    getReqEl('approvalModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

window.submitDecision = async (decision) => {
    const payload = {
        status: decision,
        comments: getReqEl('approvalComments').value || "Processed via dashboard"
    };

    const res = await window.fetchWithAuth(`/approvals/${currentRequestId}`, 'POST', payload);
    if (res) {
        window.closeModal('approvalModal');
        await loadRequestsData();
    }
};

// =================================================================
// HELPERS
// =================================================================

function getStatusBadge(status) {
    const map = {
        'pending': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        'approved_by_chef': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        'approved_by_charoi': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        'approved_by_logistic': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        'fully_approved': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        'denied': 'bg-red-500/10 text-red-400 border-red-500/20'
    };
    const cls = map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    const label = status.replace(/_/g, ' ');
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls} capitalize">${label}</span>`;
}

window.closeModal = function(id) {
    const modal = getReqEl(id);
    if (modal) modal.classList.add('hidden');
};

// Auto-run init
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRequests);
} else {
    initRequests();
}