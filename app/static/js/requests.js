// app/static/js/requests.js

let allRequests = [];
let availableVehicles = [];
let activeDrivers = [];
let requestUserRole = 'user';
let requestUserMatricule = '';
let currentRequestId = null;

// Helper to get elements across desktop/mobile containers
function getReqEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

async function initRequests() {
    requestUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    requestUserMatricule = localStorage.getItem('user_matricule') || '';

    const searchInput = getReqEl('requestSearch');
    const statusFilter = getReqEl('requestStatusFilter');
    if (searchInput) searchInput.addEventListener('input', renderRequestsTable);
    if (statusFilter) statusFilter.addEventListener('change', renderRequestsTable);

    await loadRequestsData();
    
    // Only fetch assignment resources if the user has permission
    if (['admin', 'superadmin', 'charoi', 'logistic', 'darh'].includes(requestUserRole)) {
        await Promise.all([fetchAvailableVehicles(), fetchActiveDrivers()]);
    }
}

async function loadRequestsData() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    try {
        // limit=1000 is used here as requested for the list, 
        // but backend skip/limit is supported.
        const data = await window.fetchWithAuth('/requests/?limit=1000');
        allRequests = Array.isArray(data) ? data : (data.items || []);
        renderRequestsTable();
    } catch (e) {
        console.error("Load requests error", e);
    }
}

async function fetchAvailableVehicles() {
    // Note: Assuming endpoint /vehicles/available exists based on your description
    const data = await window.fetchWithAuth('/vehicles/?limit=500'); 
    availableVehicles = Array.isArray(data) ? data.filter(v => v.status === 'available') : [];
}

async function fetchActiveDrivers() {
    const data = await window.fetchWithAuth('/requests/drivers');
    activeDrivers = data || [];
}

function renderRequestsTable() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    const searchValue = (getReqEl('requestSearch')?.value || '').toLowerCase();
    const filterValue = getReqEl('requestStatusFilter')?.value || 'all';

    let filtered = allRequests.filter(r => {
        const matchesSearch = r.destination.toLowerCase().includes(searchValue) || 
                             (r.requester?.full_name || '').toLowerCase().includes(searchValue);
        const matchesStatus = filterValue === 'all' || r.status === filterValue;
        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500">${window.t('no_records')}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const statusBadge = getStatusBadge(r.status);
        const dateStr = new Date(r.departure_time).toLocaleDateString(window.APP_LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
        
        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-colors">
                <td class="p-4">
                    <div class="font-medium text-white text-sm">${r.requester?.full_name || 'N/A'}</div>
                    <div class="text-[10px] text-slate-500">${r.requester?.matricule || ''}</div>
                </td>
                <td class="p-4 text-sm text-slate-300">
                    <div class="flex items-center gap-2"><i data-lucide="map-pin" class="w-3 h-3 text-blue-400"></i> ${r.destination}</div>
                </td>
                <td class="p-4 text-xs text-slate-400">${dateStr}</td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4">
                    <div class="text-xs text-white">${r.vehicle ? r.vehicle.plate_number : '<span class="text-slate-600">---</span>'}</div>
                    <div class="text-[10px] text-slate-500">${r.driver ? r.driver.full_name : ''}</div>
                </td>
                <td class="p-4 text-right">
                    <div class="flex justify-end gap-2">
                        <button onclick="viewRequestDetails(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 rounded hover:bg-slate-700" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>
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
        btns += `<button onclick="openApprovalModal(${r.id}, 'chef')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600 hover:text-white" title="Approve"><i data-lucide="check-square" class="w-4 h-4"></i></button>`;
    }
    // Step 2: Charoi Assignment
    if (['charoi', 'admin', 'superadmin', 'logistic'].includes(role) && r.status === 'approved_by_chef') {
        btns += `<button onclick="openAssignModal(${r.id})" class="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-500" title="Assign Resources"><i data-lucide="truck" class="w-4 h-4"></i></button>`;
    }
    // Step 2.5: Charoi Formal Approval (after assignment)
    if (role === 'charoi' && r.status === 'approved_by_chef' && r.vehicle_id) {
         btns += `<button onclick="openApprovalModal(${r.id}, 'charoi')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600 hover:text-white" title="Confirm Assignment"><i data-lucide="user-check" class="w-4 h-4"></i></button>`;
    }
    // Step 3: Logistic Approval
    if (role === 'logistic' && r.status === 'approved_by_charoi') {
        btns += `<button onclick="openApprovalModal(${r.id}, 'logistic')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded hover:bg-emerald-600 hover:text-white" title="Logistic Approval"><i data-lucide="clipboard-check" class="w-4 h-4"></i></button>`;
    }
    // Step 4: DARH Final Approval
    if (['darh', 'admin', 'superadmin'].includes(role) && r.status === 'approved_by_logistic') {
        btns += `<button onclick="openApprovalModal(${r.id}, 'darh')" class="p-1.5 bg-purple-600 text-white rounded hover:bg-purple-500" title="Final Validate"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
    }

    return btns;
}

// ================= CREATE REQUEST =================
window.openAddRequestModal = () => {
    const modal = getReqEl('addRequestModal');
    if (modal) {
        modal.classList.remove('hidden');
        // Pre-fill requester matricule in the list as default
        const list = getReqEl('reqPassengersList');
        if (list) list.value = requestUserMatricule;
    }
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
    if (res) {
        window.closeModal('addRequestModal');
        await loadRequestsData();
    }
};

// ================= ASSIGNMENT =================
window.openAssignModal = (id) => {
    currentRequestId = id;
    const req = allRequests.find(r => r.id === id);
    const modal = getReqEl('assignResourceModal');
    
    // Populate dropdowns
    const vSelect = getReqEl('assignVehicle');
    const dSelect = getReqEl('assignDriver');
    const pList = getReqEl('assignPassengers');

    vSelect.innerHTML = availableVehicles.map(v => `<option value="${v.id}">${v.plate_number} (${v.model})</option>`).join('');
    dSelect.innerHTML = activeDrivers.map(d => `<option value="${d.id}">${d.full_name} [${d.matricule}]</option>`).join('');
    pList.value = req.passengers.join(', ');

    modal.classList.remove('hidden');
};

window.submitAssignment = async () => {
    const payload = {
        vehicle_id: parseInt(getReqEl('assignVehicle').value),
        driver_id: parseInt(getReqEl('assignDriver').value),
        passengers: getReqEl('assignPassengers').value.split(',').map(m => m.trim())
    };

    const res = await window.fetchWithAuth(`/requests/${currentRequestId}/assign`, 'PUT', payload);
    if (res) {
        window.closeModal('assignResourceModal');
        await loadRequestsData();
    }
};

// ================= APPROVALS =================
window.openApprovalModal = (id, stage) => {
    currentRequestId = id;
    getReqEl('approvalStageTitle').innerText = `Stage: ${stage.toUpperCase()}`;
    getReqEl('approvalModal').classList.remove('hidden');
};

window.submitDecision = async (status) => {
    const payload = {
        status: status,
        comments: getReqEl('approvalComments').value,
        passengers: getReqEl('approvalPassUpdate')?.value.split(',').map(m => m.trim()) || null
    };

    const res = await window.fetchWithAuth(`/approvals/${currentRequestId}`, 'POST', payload);
    if (res) {
        window.closeModal('approvalModal');
        await loadRequestsData();
    }
};

function getStatusBadge(status) {
    const colors = {
        'pending': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        'approved_by_chef': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        'approved_by_charoi': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        'approved_by_logistic': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        'fully_approved': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        'denied': 'bg-red-500/10 text-red-400 border-red-500/20'
    };
    const cls = colors[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls} capitalize">${status.replace(/_/g, ' ')}</span>`;
}

window.initRequests = initRequests;