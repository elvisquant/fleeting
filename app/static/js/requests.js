/**
 * ==============================================================================
 * FLEETDASH REQUESTS MODULE (FULL REGENERATION)
 * Now with Role-Based Filter Pruning
 * ==============================================================================
 */

// --- GLOBAL STATE ---
let allRequests = [];
let filteredRequests = [];
let availableVehicles = [];
let availableDrivers = [];
let reqUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
let reqActionId = null;
let reqActionType = null;
let reqCurrentPage = 1;
const reqPageLimit = 10;

// =================================================================
// 0. HELPER: DOM ELEMENT GETTER
// =================================================================
function getReqEl(id) {
    return document.getElementById(id);
}

// =================================================================
// 1. INITIALIZATION
// =================================================================
async function initRequests() {
    console.log("Requests Module: Initializing Full Feature Set with Role Filtering...");
    
    // Prune the filter dropdown options based on role
    setupRoleBasedFilters();

    // Attach Event Listeners
    const search = getReqEl('reqSearch');
    const filter = getReqEl('reqStatusFilter');
    const btnExecute = getReqEl('btnExecuteApproval');
    const btnAssign = getReqEl('btnExecuteAssign');

    if (search) search.addEventListener('input', () => { reqCurrentPage = 1; renderReqTable(); });
    if (filter) filter.addEventListener('change', () => { reqCurrentPage = 1; renderReqTable(); });
    
    if (btnExecute) btnExecute.onclick = submitApprovalDecision;
    if (btnAssign) btnAssign.onclick = submitAssignment;

    // Load Data
    await loadRequestsData();
    await loadAssignmentResources();
}

/**
 * NEW: Prunes the #reqStatusFilter combobox based on user role.
 */
function setupRoleBasedFilters() {
    const filterSelect = getReqEl('reqStatusFilter');
    if (!filterSelect) return;

    let optionsHtml = `<option value="all">All Mission Statuses</option>`;

    if (['admin', 'superadmin'].includes(reqUserRole)) {
        // Admins see everything
        optionsHtml += `
            <option value="pending">Waiting: Chef Approval</option>
            <option value="step1">Waiting: Logistics Approval</option>
            <option value="step2">Waiting: Resource Assignment</option>
            <option value="completed">Finalized & Approved</option>
            <option value="denied">Rejected Missions</option>`;
    } else if (reqUserRole === 'chef') {
        optionsHtml += `
            <option value="pending">To Approve (Pending)</option>
            <option value="completed">Finalized</option>
            <option value="denied">Rejected</option>`;
    } else if (reqUserRole === 'logistic') {
        optionsHtml += `
            <option value="step1">To Approve (Logistics)</option>
            <option value="completed">Finalized</option>
            <option value="denied">Rejected</option>`;
    } else if (reqUserRole === 'charoi') {
        optionsHtml += `
            <option value="step2">To Assign (Charoi)</option>
            <option value="completed">Finalized</option>
            <option value="denied">Rejected</option>`;
    } else {
        // Standard User or Driver
        optionsHtml += `
            <option value="pending">Waiting Approval</option>
            <option value="completed">Approved/Finished</option>
            <option value="denied">Denied</option>`;
    }

    filterSelect.innerHTML = optionsHtml;
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadRequestsData() {
    const tbody = getReqEl('reqLogsBody');
    if (!tbody) return;
    
    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000'); 
        
        if (!data) {
            console.error("No data received from /requests/");
            allRequests = [];
        } else {
            allRequests = Array.isArray(data) ? data : (data.items || []);
        }
        
        renderReqTable();
    } catch (error) {
        console.error("Load Error:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400 font-medium">Failed to communicate with server. Please try refreshing.</td></tr>`;
    }
}

async function loadAssignmentResources() {
    if (!['admin', 'superadmin', 'charoi'].includes(reqUserRole)) return;

    try {
        const [vData, dData] = await Promise.all([
            window.fetchWithAuth('/vehicles/?limit=1000'),
            window.fetchWithAuth('/requests/drivers') 
        ]);

        const rawVehicles = vData && vData.items ? vData.items : (Array.isArray(vData) ? vData : []);
        
        availableVehicles = rawVehicles.filter(v => 
            v.status && (v.status.toLowerCase() === 'active' || v.status.toLowerCase() === 'available')
        );

        availableDrivers = Array.isArray(dData) ? dData : [];
    } catch (e) {
        console.warn("Failed to load assignment resources", e);
    }
}

// =================================================================
// 3. TABLE RENDERING (DYNAMIC STATUS & LIFO)
// =================================================================
function renderReqTable() {
    const tbody = getReqEl('reqLogsBody');
    if (!tbody) return;

    const searchVal = getReqEl('reqSearch')?.value.toLowerCase() || '';
    const filterVal = getReqEl('reqStatusFilter')?.value || 'all';

    filteredRequests = allRequests.filter(r => {
        const reqName = r.requester ? r.requester.full_name.toLowerCase() : "";
        const dest = r.destination ? r.destination.toLowerCase() : "";
        const matchSearch = reqName.includes(searchVal) || dest.includes(searchVal);
        
        let matchFilter = true;
        if (filterVal === 'pending') matchFilter = r.status === 'pending';
        else if (filterVal === 'step1') matchFilter = r.status === 'approved_by_chef';
        else if (filterVal === 'step2') matchFilter = r.status === 'approved_by_logistic';
        else if (filterVal === 'completed') matchFilter = ['fully_approved', 'completed', 'in_progress'].includes(r.status);
        else if (filterVal === 'denied') matchFilter = r.status === 'denied';

        return matchSearch && matchFilter;
    });

    filteredRequests.sort((a, b) => b.id - a.id);

    updatePaginationUI();
    const startIdx = (reqCurrentPage - 1) * reqPageLimit;
    const paginatedItems = filteredRequests.slice(startIdx, startIdx + reqPageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No requests found.</td></tr>`;
        return;
    }

    tbody.innerHTML = paginatedItems.map(r => {
        const statusMap = {
            'pending': { text: "Waiting: Chef Approval", color: "bg-amber-500/10 text-amber-500", bar: "w-1/4 bg-amber-500" },
            'approved_by_chef': { text: "Waiting: Logistics", color: "bg-blue-500/10 text-blue-500", bar: "w-1/2 bg-blue-500" },
            'approved_by_logistic': { text: "Waiting: Asset Assignment", color: "bg-purple-500/10 text-purple-500", bar: "w-3/4 bg-purple-500" },
            'fully_approved': { text: "Mission Approved", color: "bg-emerald-500/10 text-emerald-500", bar: "w-full bg-emerald-500" },
            'denied': { text: "Mission Denied", color: "bg-red-500/10 text-red-500", bar: "w-full bg-red-500" },
            'in_progress': { text: "Mission In Progress", color: "bg-indigo-500/10 text-indigo-400", bar: "w-full bg-indigo-500" },
            'completed': { text: "Mission Completed", color: "bg-slate-500/10 text-slate-400", bar: "w-full bg-slate-500" }
        };

        const currentStatus = statusMap[r.status] || { text: r.status, color: "bg-slate-800 text-slate-400", bar: "w-0" };

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition">
                <td class="p-4">
                    <div class="text-white font-bold text-sm">${r.requester?.full_name || 'System'}</div>
                    <div class="text-[10px] text-slate-500 uppercase">${r.requester?.service?.service_name || '-'}</div>
                </td>
                <td class="p-4 text-slate-300 font-mono text-xs">${r.destination}</td>
                <td class="p-4 text-slate-400 text-xs">${new Date(r.departure_time).toLocaleString()}</td>
                <td class="p-4 text-slate-400 text-xs">${new Date(r.return_time).toLocaleString()}</td>
                <td class="p-4">
                    <div class="w-20 bg-slate-800 h-1 rounded-full overflow-hidden mb-1.5">
                        <div class="h-full ${currentStatus.bar} transition-all duration-700"></div>
                    </div>
                    <span class="px-2 py-0.5 rounded-md text-[9px] font-black uppercase ${currentStatus.color} border border-current/10">
                        ${currentStatus.text}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="openViewRequestModal(${r.id})" class="p-2 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl transition border border-slate-700">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

function updatePaginationUI() {
    const total = filteredRequests.length;
    const totalPages = Math.ceil(total / reqPageLimit) || 1;
    const indicator = getReqEl('reqPageIndicator');
    const countEl = getReqEl('reqCount');

    if (indicator) indicator.innerText = `Page ${reqCurrentPage} / ${totalPages}`;
    if (getReqEl('prevReqPage')) getReqEl('prevReqPage').disabled = (reqCurrentPage === 1);
    if (getReqEl('nextReqPage')) getReqEl('nextReqPage').disabled = (reqCurrentPage >= totalPages || total === 0);
    if (countEl) countEl.innerText = `${total} requests found`;
}

window.changeReqPage = function(dir) {
    reqCurrentPage += dir;
    renderReqTable();
}

// =================================================================
// 4. VIEW / APPROVE / ASSIGN LOGIC
// =================================================================
window.openViewRequestModal = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const isAssigned = r.vehicle_id && r.driver_id;
    
    const canApprove = (reqUserRole === 'chef' && r.status === 'pending') ||
                       (reqUserRole === 'logistic' && r.status === 'approved_by_chef') ||
                       (['charoi', 'admin', 'superadmin'].includes(reqUserRole) && r.status === 'approved_by_logistic');

    const assignmentHtml = `
        <div class="bg-slate-950/50 p-4 rounded-2xl border border-white/5 space-y-3">
            <h4 class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Resources Assigned</h4>
            <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">Vehicle:</span>
                <span class="${r.vehicle ? 'text-blue-400' : 'text-red-500'} font-mono text-sm font-bold">
                    ${r.vehicle ? r.vehicle.plate_number : 'NOT ASSIGNED'}
                </span>
            </div>
            <div class="flex items-center justify-between">
                <span class="text-xs text-slate-400">Driver:</span>
                <span class="${r.driver ? 'text-blue-400' : 'text-red-500'} text-sm font-bold">
                    ${r.driver ? r.driver.full_name : 'NOT ASSIGNED'}
                </span>
            </div>
        </div>`;

    getReqEl('viewRequestContent').innerHTML = `
        <div class="space-y-6">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-white font-bold text-xl">${r.requester.full_name}</h3>
                    <p class="text-slate-500 text-xs">${r.requester.service.service_name}</p>
                </div>
                <div class="text-right">
                    <span class="text-[10px] bg-slate-800 text-slate-400 px-2 py-1 rounded-lg border border-slate-700 font-mono">ID #${r.id}</span>
                </div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="p-3 bg-slate-800/50 rounded-xl">
                    <span class="text-slate-500 text-[9px] uppercase font-bold block mb-1">Destination</span>
                    <span class="text-white text-sm font-medium">${r.destination}</span>
                </div>
                <div class="p-3 bg-slate-800/50 rounded-xl">
                    <span class="text-slate-500 text-[9px] uppercase font-bold block mb-1">Passengers</span>
                    <span class="text-white text-xs">${r.passengers?.length ? r.passengers.join(', ') : 'None'}</span>
                </div>
            </div>
            <div class="p-4 bg-slate-800/30 rounded-xl border border-slate-700/50 italic text-slate-400 text-sm">
                "${r.description || 'No additional mission details provided.'}"
            </div>
            ${assignmentHtml}
        </div>`;

    let footerButtons = `<button onclick="closeModal('viewRequestModal')" class="px-6 py-2.5 text-slate-400 text-sm font-bold hover:text-white transition">Close</button>`;
    
    if (['admin', 'charoi', 'superadmin'].includes(reqUserRole) && ['approved_by_logistic', 'fully_approved'].includes(r.status)) {
        footerButtons = `<button onclick="openAssignmentModal(${r.id})" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-xl font-bold flex items-center gap-2 transition mr-auto">
            <i data-lucide="key" class="w-4 h-4"></i> Assign Resource</button>` + footerButtons;
    }

    if (canApprove) {
        const isStep3 = ['charoi', 'admin', 'superadmin'].includes(reqUserRole) && r.status === 'approved_by_logistic';
        
        if (isStep3 && !isAssigned) {
            footerButtons += `
                <button onclick="openApprovalModal(${r.id}, 'reject')" class="px-6 py-2.5 bg-red-600/20 text-red-500 border border-red-500/30 rounded-xl text-sm font-bold ml-2">Deny</button>
                <div class="group relative inline-block ml-2">
                    <button class="px-6 py-2.5 bg-slate-700 text-slate-500 rounded-xl text-sm font-bold cursor-not-allowed opacity-50">Approve</button>
                    <div class="absolute bottom-full mb-2 hidden group-hover:block bg-red-600 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap">Assign Resources First!</div>
                </div>`;
        } else {
            footerButtons += `
                <button onclick="openApprovalModal(${r.id}, 'reject')" class="px-6 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold ml-2 transition hover:bg-red-500">Deny</button>
                <button onclick="openApprovalModal(${r.id}, 'approve')" class="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold ml-2 transition hover:bg-emerald-500 shadow-lg shadow-emerald-900/20">Approve</button>`;
        }
    }

    getReqEl('approvalActionsFooter').innerHTML = footerButtons;
    getReqEl('viewRequestModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 5. ASSIGNMENT EXECUTION
// =================================================================
window.openAssignmentModal = function(id) {
    window.closeModal('viewRequestModal');
    getReqEl('assignReqId').value = id;
    
    const vSel = getReqEl('assignVehicle');
    vSel.innerHTML = '<option value="">-- Select Active Vehicle --</option>' + 
        availableVehicles.map(v => {
            const modelName = v.vehicle_model?.model_name || '';
            return `<option value="${v.id}">${v.plate_number} ${modelName ? '| ' + modelName : ''}</option>`;
        }).join('');
    
    const dSel = getReqEl('assignDriver');
    dSel.innerHTML = '<option value="">-- Select Driver --</option>' + 
        availableDrivers.map(d => `<option value="${d.id}">${d.full_name}</option>`).join('');
    
    getReqEl('assignmentModal').classList.remove('hidden');
}

async function submitAssignment() {
    const id = getReqEl('assignReqId').value;
    const vId = getReqEl('assignVehicle').value;
    const dId = getReqEl('assignDriver').value;

    if (!vId || !dId) {
        showReqAlert("Missing Data", "Please select both a vehicle and a driver.", true);
        return;
    }

    const res = await window.fetchWithAuth(`/requests/${id}/assign`, 'PUT', { 
        vehicle_id: parseInt(vId), 
        driver_id: parseInt(dId) 
    });

    if (res && !res.detail) {
        window.closeModal('assignmentModal');
        showReqAlert("Assigned", "Vehicle and Driver successfully linked to mission.", false);
        await loadRequestsData();
        openViewRequestModal(parseInt(id));
    } else {
        showReqAlert("Error", res.detail || "Assignment failed", true);
    }
}

// =================================================================
// 6. APPROVAL EXECUTION
// =================================================================
window.openApprovalModal = function(id, type) {
    window.closeModal('viewRequestModal');
    reqActionId = id; 
    reqActionType = type;
    getReqEl('approvalTitle').innerText = type === 'approve' ? "Authorize Mission" : "Reject Mission";
    getReqEl('btnExecuteApproval').innerText = type === 'approve' ? "Confirm Approval" : "Confirm Rejection";
    getReqEl('btnExecuteApproval').className = type === 'approve' ? 
        "flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg" : 
        "flex-1 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg";
    
    getReqEl('approvalComment').value = "";
    getReqEl('approvalModal').classList.remove('hidden');
}

async function submitApprovalDecision() {
    const btn = getReqEl('btnExecuteApproval');
    btn.disabled = true;
    btn.innerText = "Processing...";

    const payload = { 
        status: reqActionType === 'approve' ? 'approved' : 'denied', 
        comments: getReqEl('approvalComment').value 
    };

    try {
        const res = await window.fetchWithAuth(`/approvals/${reqActionId}`, 'POST', payload);
        if (res && !res.detail) {
            window.closeModal('approvalModal');
            showReqAlert("Mission Updated", `The mission has been ${reqActionType === 'approve' ? 'approved' : 'rejected'}.`, false);
            await loadRequestsData();
        } else {
            showReqAlert("Workflow Error", res.detail || "Action not allowed.", true);
        }
    } catch (e) {
        showReqAlert("Server Error", "Could not connect to approval system.", true);
    } finally {
        btn.disabled = false;
        btn.innerText = "Confirm Action";
    }
}

// =================================================================
// 7. HELPERS
// =================================================================
window.closeModal = (id) => getReqEl(id).classList.add('hidden');

function showReqAlert(title, message, isError) {
    const modal = getReqEl('reqAlertModal');
    if (!modal) return;

    getReqEl('reqAlertTitle').innerText = title;
    getReqEl('reqAlertMessage').innerText = message;
    
    const iconContainer = getReqEl('reqAlertIcon');
    iconContainer.innerHTML = isError ? 
        `<div class="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse"><i data-lucide="alert-circle" class="w-8 h-8"></i></div>` :
        `<div class="w-16 h-16 bg-emerald-500/20 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4"><i data-lucide="check-circle" class="w-8 h-8"></i></div>`;
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
    
    if (!isError) {
        setTimeout(() => modal.classList.add('hidden'), 3000);
    }
}

window.openAddRequestModal = function() {
    getReqEl('addRequestModal').classList.remove('hidden');
};

document.addEventListener('DOMContentLoaded', initRequests);