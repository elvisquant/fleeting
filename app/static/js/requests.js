// app/static/js/requests.js

let allRequests = [];
let availableVehicles = [];
let activeDrivers = [];
let requestUserRole = 'user';
let requestUserMatricule = '';
let currentRequestId = null;

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
    
    const managementRoles = ['admin', 'superadmin', 'charoi', 'logistic', 'darh', 'chef'];
    if (managementRoles.includes(requestUserRole)) {
        await Promise.all([fetchAvailableVehicles(), fetchActiveDrivers()]);
    }
}

async function loadRequestsData() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;
    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000');
        allRequests = Array.isArray(data) ? data : (data.items || []);
        renderRequestsTable();
    } catch (e) { console.error("Sync Error", e); }
}

async function fetchAvailableVehicles() {
    const data = await window.fetchWithAuth('/vehicles/?limit=500');
    if (Array.isArray(data)) availableVehicles = data.filter(v => v.status === 'available' || v.status === 'active');
}

async function fetchActiveDrivers() {
    const data = await window.fetchWithAuth('/requests/drivers');
    activeDrivers = Array.isArray(data) ? data : [];
}

function renderRequestsTable() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    const searchValue = (getReqEl('requestSearch')?.value || '').toLowerCase();
    const filterValue = getReqEl('requestStatusFilter')?.value || 'all';

    let filtered = allRequests.filter(r => {
        const match = `${r.destination} ${r.requester?.full_name}`.toLowerCase();
        return match.includes(searchValue) && (filterValue === 'all' || r.status === filterValue);
    });

    tbody.innerHTML = filtered.map(r => {
        const depDate = new Date(r.departure_time).toLocaleString(window.APP_LOCALE, {month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'});
        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-colors">
                <td class="p-4">
                    <div class="font-bold text-white text-xs md:text-sm">${r.requester?.full_name || 'N/A'}</div>
                    <div class="text-[9px] text-slate-500">${r.requester?.matricule || ''}</div>
                </td>
                <td class="p-4 text-xs md:text-sm text-slate-300 font-medium">${r.destination}</td>
                <td class="p-4 text-[10px] md:text-xs text-slate-400 font-mono">${depDate}</td>
                <td class="p-4">${getStatusBadge(r.status)}</td>
                <td class="p-4">
                    ${r.vehicle ? `<div class="text-blue-400 font-bold text-[10px] uppercase">${r.vehicle.plate_number}</div>` : '<span class="text-slate-700 text-[9px] font-bold italic uppercase">Pending</span>'}
                </td>
                <td class="p-4 text-right">
                    <div class="flex justify-end gap-1 md:gap-2">
                        <button onclick="viewRequestDetails(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 rounded-lg border border-slate-700 hover:bg-blue-600 transition shadow-sm"><i data-lucide="eye" class="w-4 h-4"></i></button>
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
    const elevatedRoles = ['admin', 'superadmin', 'logistic', 'darh', 'charoi'];
    
    if (elevatedRoles.includes(role) && r.status !== 'fully_approved' && r.status !== 'denied') {
        html += `<button onclick="openAssignModal(${r.id})" class="p-1.5 bg-amber-600/20 text-amber-500 rounded-lg border border-amber-500/20 hover:bg-amber-600 hover:text-white transition shadow-sm" title="Edit"><i data-lucide="edit-3" class="w-4 h-4"></i></button>`;
    }
    if (role === 'chef' && r.status === 'pending') html += `<button onclick="openApprovalModal(${r.id}, 'chef')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="check-circle" class="w-4 h-4"></i></button>`;
    if (role === 'charoi' && r.status === 'approved_by_chef' && r.vehicle_id) html += `<button onclick="openApprovalModal(${r.id}, 'charoi')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="user-check" class="w-4 h-4"></i></button>`;
    if (role === 'logistic' && r.status === 'approved_by_charoi') html += `<button onclick="openApprovalModal(${r.id}, 'logistic')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="clipboard-check" class="w-4 h-4"></i></button>`;
    if (['darh', 'admin', 'superadmin'].includes(role) && r.status === 'approved_by_logistic') html += `<button onclick="openApprovalModal(${r.id}, 'darh')" class="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition shadow-lg"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
    return html;
}

// ================= PRINT LOGIC =================
window.printMissionOrder = async (id) => {
    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-3 h-3 animate-spin"></i>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const response = await fetch(`${API_BASE}/approvals/${id}/pdf`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        });
        if (!response.ok) throw new Error("PDF Failed");
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    } catch (e) {
        alert("Mission Order not ready for printing.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        if(window.lucide) window.lucide.createIcons();
    }
};

// ================= VIEW DETAILS =================
window.viewRequestDetails = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    // Calculate Duration
    const start = new Date(r.departure_time);
    const end = new Date(r.return_time);
    const diffMs = end - start;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const durationText = `${diffDays}d ${diffHrs}h`;

    const canPrint = ['admin', 'superadmin', 'darh', 'charoi', 'account', 'comptabilite'].includes(requestUserRole) && r.status === 'fully_approved';

    const content = `
        <div class="space-y-4 text-left">
            <div class="flex justify-between items-start border-b border-slate-800 pb-3">
                <div>
                    <h4 class="text-lg md:text-xl font-black text-white uppercase">${r.destination}</h4>
                    <p class="text-[10px] text-slate-500 font-bold uppercase tracking-widest">${r.description || 'Mission'}</p>
                </div>
                ${getStatusBadge(r.status)}
            </div>

            <div class="grid grid-cols-2 gap-3">
                <div class="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50">
                    <span class="label-text">Start</span>
                    <p class="text-white text-[11px] font-black">${start.toLocaleString()}</p>
                </div>
                <div class="bg-slate-800/40 p-2 rounded-xl border border-slate-700/50">
                    <span class="label-text">Return</span>
                    <p class="text-white text-[11px] font-black">${end.toLocaleString()}</p>
                </div>
            </div>

            <div class="bg-blue-500/5 border border-blue-500/10 p-2 rounded-xl flex justify-between items-center">
                <span class="label-text">Trip Duration</span>
                <span class="text-blue-400 font-black text-xs uppercase">${durationText}</span>
            </div>

            <div class="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                <span class="label-text mb-2 block">Passengers</span>
                <div class="flex flex-wrap gap-1.5">
                    ${r.passengers.map(m => `<span class="bg-slate-800 px-2 py-0.5 rounded text-[9px] text-slate-300 border border-slate-700 font-mono font-bold">${m}</span>`).join('')}
                </div>
            </div>

            <div class="flex justify-between items-center pt-3 border-t border-slate-800">
                <span class="text-[9px] text-slate-600 font-bold uppercase">Staff: ${r.requester?.full_name}</span>
                ${canPrint ? `<button onclick="printMissionOrder(${r.id})" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-[9px] font-black transition-all shadow-lg active:scale-95"><i data-lucide="printer" class="w-3 h-3"></i> PRINT ORDER</button>` : ''}
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
    getReqEl('assignSummary').innerHTML = `<div class="bg-blue-600/10 border border-blue-500/20 p-3 rounded-lg mb-4 text-[10px] font-bold uppercase"><p class="text-blue-400">${r.destination}</p><p class="text-slate-500 font-mono mt-1">${new Date(r.departure_time).toLocaleString()}</p></div>`;
    getReqEl('assignVehicle').innerHTML = `<option value="">-- UNIT --</option>` + availableVehicles.map(v => `<option value="${v.id}" ${r.vehicle_id === v.id ? 'selected':''}>${v.plate_number} [${v.model}]</option>`).join('');
    getReqEl('assignDriver').innerHTML = `<option value="">-- DRIVER --</option>` + activeDrivers.map(d => `<option value="${d.id}" ${r.driver_id === d.id ? 'selected':''}>${d.full_name}</option>`).join('');
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
    getReqEl('approvalSummary').innerHTML = `<div class="bg-slate-900 p-3 rounded-lg border border-slate-800 mb-4 text-[10px] font-bold uppercase text-white">${r.destination}</div>`;
    getReqEl('approvalModal').classList.remove('hidden');
};

window.submitDecision = async (decision) => {
    const payload = { status: decision, comments: getReqEl('approvalComments').value || "Manual Action" };
    const res = await window.fetchWithAuth(`/approvals/${currentRequestId}`, 'POST', payload);
    if (res && !res.detail) { window.closeModal('approvalModal'); await loadRequestsData(); }
};

function getStatusBadge(status) {
    const map = { 'pending': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', 'approved_by_chef': 'bg-blue-500/10 text-blue-400 border-blue-500/20', 'approved_by_charoi': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', 'approved_by_logistic': 'bg-purple-500/10 text-purple-400 border-purple-500/20', 'fully_approved': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', 'denied': 'bg-red-500/10 text-red-400 border-red-500/20' };
    const cls = map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    return `<span class="px-2 py-0.5 rounded-full text-[8px] md:text-[9px] font-black border ${cls} uppercase tracking-tighter">${status.replace(/_/g, ' ')}</span>`;
}

window.closeModal = (id) => getReqEl(id).classList.add('hidden');
initRequests();