/**
 * ==============================================================================
 * FLEETDASH REQUESTS MODULE (FULL REGENERATION)
 * Optimized for Mobile + Desktop + Role-Based Logic
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
// 0. MOBILE-COMPATIBLE ELEMENT GETTER (FIXES DISPLAY ON PHONES)
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
    console.log("Requests Module: Initializing Responsive Workflows...");
    
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
    await Promise.all([loadRequestsData(), loadAssignmentResources()]);
}

/**
 * Prunes the #reqStatusFilter combobox based on user role.
 */
function setupRoleBasedFilters() {
    const filterSelect = getReqEl('reqStatusFilter');
    if (!filterSelect) return;

    let optionsHtml = `<option value="all">All Mission Statuses</option>`;

    if (['admin', 'superadmin'].includes(reqUserRole)) {
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
    
    tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500"></i>Syncing mission data...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000'); 
        allRequests = Array.isArray(data) ? data : (data.items || []);
        renderReqTable();
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-400 font-medium">Server communication failed.</td></tr>`;
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
        // Only show available vehicles for assignment
        availableVehicles = rawVehicles.filter(v => v.status === 'available');
        availableDrivers = Array.isArray(dData) ? dData : [];
    } catch (e) {
        console.warn("Resource loading failed", e);
    }
}

// =================================================================
// 3. TABLE RENDERING (LIFO + REALISTIC PAGINATION)
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

    // LIFO Sorting
    filteredRequests.sort((a, b) => b.id - a.id);

    updatePaginationUI();
    const startIdx = (reqCurrentPage - 1) * reqPageLimit;
    const paginatedItems = filteredRequests.slice(startIdx, startIdx + reqPageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500 font-medium italic">No missions found matching your criteria.</td></tr>`;
        return;
    }

    tbody.innerHTML = paginatedItems.map(r => {
        const statusMap = {
            'pending': { text: "Waiting: Chef", color: "bg-amber-500/10 text-amber-500", bar: "w-1/4 bg-amber-500" },
            'approved_by_chef': { text: "Waiting: Logistics", color: "bg-blue-500/10 text-blue-500", bar: "w-1/2 bg-blue-500" },
            'approved_by_logistic': { text: "Waiting: Asset", color: "bg-purple-500/10 text-purple-500", bar: "w-3/4 bg-purple-500" },
            'fully_approved': { text: "Mission Ready", color: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20", bar: "w-full bg-emerald-500" },
            'denied': { text: "Mission Denied", color: "bg-red-500/10 text-red-500", bar: "w-full bg-red-500" },
            'in_progress': { text: "In Progress", color: "bg-indigo-500/10 text-indigo-400", bar: "w-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" },
            'completed': { text: "Completed", color: "bg-slate-500/10 text-slate-400", bar: "w-full bg-slate-500" }
        };

        const st = statusMap[r.status] || { text: r.status, color: "bg-slate-800 text-slate-400", bar: "w-0" };

        return `
            <tr class="hover:bg-white/[0.03] border-b border-slate-700/30 transition-all duration-300">
                <td class="p-4">
                    <div class="text-white font-bold text-sm tracking-tight">${r.requester?.full_name || 'System'}</div>
                    <div class="text-[10px] text-slate-500 uppercase font-black tracking-widest">${r.requester?.service?.service_name || '-'}</div>
                </td>
                <td class="p-4 text-slate-300 font-mono text-xs italic">${r.destination}</td>
                <td class="p-4 text-slate-400 text-xs">${new Date(r.departure_time).toLocaleDateString()}</td>
                <td class="p-4 text-slate-400 text-xs">${new Date(r.return_time).toLocaleDateString()}</td>
                <td class="p-4">
                    <div class="w-24 bg-slate-900/80 h-1 rounded-full overflow-hidden mb-2 border border-white/5">
                        <div class="h-full ${st.bar} transition-all duration-1000"></div>
                    </div>
                    <span class="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tighter ${st.color}">
                        ${st.text}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="openViewRequestModal(${r.id})" class="p-2.5 bg-slate-800 text-indigo-400 hover:bg-indigo-600 hover:text-white rounded-xl transition-all border border-slate-700 shadow-lg">
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
    
    if (indicator) indicator.innerText = `PAGE ${reqCurrentPage} OF ${totalPages}`;
    if (getReqEl('prevReqPage')) getReqEl('prevReqPage').disabled = (reqCurrentPage === 1);
    if (getReqEl('nextReqPage')) getReqEl('nextReqPage').disabled = (reqCurrentPage >= totalPages || total === 0);
    if (countEl) countEl.innerText = `${total} missions registered`;
}

window.changeReqPage = (dir) => { reqCurrentPage += dir; renderReqTable(); };

// =================================================================
// 4. MODAL LOGIC (VIEW / APPROVAL / ASSIGN)
// =================================================================
window.openViewRequestModal = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const isAssigned = r.vehicle_id && r.driver_id;
    const canApprove = (reqUserRole === 'chef' && r.status === 'pending') ||
                       (reqUserRole === 'logistic' && r.status === 'approved_by_chef') ||
                       (['charoi', 'admin', 'superadmin'].includes(reqUserRole) && r.status === 'approved_by_logistic');

    const assignmentHtml = `
        <div class="bg-slate-950/40 p-5 rounded-2xl border border-white/5 space-y-4">
            <div class="flex items-center gap-2 mb-1">
                <i data-lucide="shield-check" class="w-3 h-3 text-indigo-400"></i>
                <h4 class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Allocated Fleet Resources</h4>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-slate-900/50 p-3 rounded-xl border border-white/5">
                    <span class="text-[9px] text-slate-500 uppercase block mb-1">Vehicle</span>
                    <span class="${r.vehicle ? 'text-indigo-400' : 'text-slate-600'} font-mono text-sm font-bold">
                        ${r.vehicle ? r.vehicle.plate_number : 'PENDING'}
                    </span>
                </div>
                <div class="bg-slate-900/50 p-3 rounded-xl border border-white/5">
                    <span class="text-[9px] text-slate-500 uppercase block mb-1">Driver</span>
                    <span class="${r.driver ? 'text-indigo-400' : 'text-slate-600'} text-sm font-bold">
                        ${r.driver ? r.driver.full_name : 'PENDING'}
                    </span>
                </div>
            </div>
        </div>`;

    getReqEl('viewRequestContent').innerHTML = `
        <div class="space-y-6">
            <div class="flex justify-between items-start">
                <div>
                    <h3 class="text-white font-black text-2xl tracking-tighter">${r.requester.full_name}</h3>
                    <p class="text-indigo-400 text-xs font-bold uppercase tracking-widest mt-1">${r.requester.service.service_name}</p>
                </div>
                <span class="text-[10px] bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-full border border-indigo-500/20 font-black">REF #${r.id}</span>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div class="p-4 bg-slate-800/40 rounded-2xl border border-white/5">
                    <span class="text-slate-500 text-[9px] font-black uppercase tracking-widest block mb-1">Target Destination</span>
                    <span class="text-white text-sm font-bold tracking-tight">${r.destination}</span>
                </div>
                <div class="p-4 bg-slate-800/40 rounded-2xl border border-white/5">
                    <span class="text-slate-500 text-[9px] font-black uppercase tracking-widest block mb-1">Passenger Manifest</span>
                    <span class="text-slate-300 text-xs font-medium">${r.passengers?.length ? r.passengers.join(', ') : 'No passengers listed'}</span>
                </div>
            </div>
            <div class="p-5 bg-slate-950/30 rounded-2xl border border-slate-800 border-dashed text-slate-400 text-sm leading-relaxed italic">
                "${r.description || 'No specific mission context provided.'}"
            </div>
            ${assignmentHtml}
        </div>`;

    let footerButtons = `<button onclick="closeModal('viewRequestModal')" class="px-6 py-2.5 text-slate-400 text-xs font-black uppercase tracking-widest hover:text-white transition">Close Dossier</button>`;
    
    if (['admin', 'charoi', 'superadmin'].includes(reqUserRole) && ['approved_by_logistic', 'fully_approved'].includes(r.status)) {
        footerButtons = `<button onclick="openAssignmentModal(${r.id})" class="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg transition transform hover:scale-105 mr-auto">
            <i data-lucide="key" class="w-4 h-4 inline mr-1"></i> Assign Resources</button>` + footerButtons;
    }

    if (canApprove) {
        const isStep3 = ['charoi', 'admin', 'superadmin'].includes(reqUserRole) && r.status === 'approved_by_logistic';
        if (isStep3 && !isAssigned) {
            footerButtons += `
                <button onclick="openApprovalModal(${r.id}, 'reject')" class="px-6 py-2.5 bg-red-600/10 text-red-500 border border-red-500/20 rounded-xl text-xs font-black uppercase tracking-widest ml-2">Deny</button>
                <div class="group relative inline-block ml-2">
                    <button class="px-6 py-2.5 bg-slate-800 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest cursor-not-allowed border border-white/5">Approve</button>
                    <div class="absolute bottom-full mb-2 hidden group-hover:block bg-red-600 text-white text-[9px] px-2 py-1 rounded whitespace-nowrap z-50">Link Vehicle/Driver First!</div>
                </div>`;
        } else {
            footerButtons += `
                <button onclick="openApprovalModal(${r.id}, 'reject')" class="px-6 py-2.5 bg-red-600/20 text-red-500 border border-red-500/30 rounded-xl text-xs font-black uppercase tracking-widest ml-2 hover:bg-red-600 hover:text-white transition">Deny</button>
                <button onclick="openApprovalModal(${r.id}, 'approve')" class="px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest ml-2 hover:bg-emerald-500 transition shadow-xl shadow-emerald-900/20">Approve</button>`;
        }
    }

    getReqEl('approvalActionsFooter').innerHTML = footerButtons;
    getReqEl('viewRequestModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 5. RESOURCE ASSIGNMENT
// =================================================================
window.openAssignmentModal = function(id) {
    window.closeModal('viewRequestModal');
    getReqEl('assignReqId').value = id;
    
    const vSel = getReqEl('assignVehicle');
    vSel.innerHTML = '<option value="">-- SELECT FLEET VEHICLE --</option>' + 
        availableVehicles.map(v => `<option value="${v.id}">${v.plate_number} (${v.vehicle_model?.model_name || 'Generic'})</option>`).join('');
    
    const dSel = getReqEl('assignDriver');
    dSel.innerHTML = '<option value="">-- SELECT ASSIGNED DRIVER --</option>' + 
        availableDrivers.map(d => `<option value="${d.id}">${d.full_name}</option>`).join('');
    
    getReqEl('assignmentModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

async function submitAssignment() {
    const id = getReqEl('assignReqId').value;
    const vId = getReqEl('assignVehicle').value;
    const dId = getReqEl('assignDriver').value;

    if (!vId || !dId) return showReqAlert("Incomplete", "Vehicle and Driver selection is required.", true);

    const res = await window.fetchWithAuth(`/requests/${id}/assign`, 'PUT', { vehicle_id: parseInt(vId), driver_id: parseInt(dId) });

    if (res && !res.detail) {
        window.closeModal('assignmentModal');
        showReqAlert("Success", "Fleet assets allocated to mission.", false);
        await loadRequestsData();
        openViewRequestModal(parseInt(id));
    } else {
        showReqAlert("Failed", res.detail || "Database error.", true);
    }
}

// =================================================================
// 6. APPROVAL ENGINE
// =================================================================
window.openApprovalModal = function(id, type) {
    window.closeModal('viewRequestModal');
    reqActionId = id; reqActionType = type;
    getReqEl('approvalTitle').innerText = type === 'approve' ? "Authorize Mission" : "Deny Request";
    const btn = getReqEl('btnExecuteApproval');
    btn.innerText = type === 'approve' ? "Confirm Approval" : "Confirm Rejection";
    btn.className = type === 'approve' ? "flex-1 py-3.5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl" : "flex-1 py-3.5 bg-red-600 text-white rounded-2xl font-black uppercase text-xs tracking-widest shadow-xl";
    
    getReqEl('approvalComment').value = "";
    getReqEl('approvalModal').classList.remove('hidden');
}

async function submitApprovalDecision() {
    const btn = getReqEl('btnExecuteApproval');
    btn.disabled = true; btn.innerText = "UPDATING...";

    const payload = { status: reqActionType === 'approve' ? 'approved' : 'denied', comments: getReqEl('approvalComment').value };

    try {
        const res = await window.fetchWithAuth(`/approvals/${reqActionId}`, 'POST', payload);
        if (res && !res.detail) {
            window.closeModal('approvalModal');
            showReqAlert("Success", `Mission status updated to ${reqActionType === 'approve' ? 'Approved' : 'Denied'}.`, false);
            await loadRequestsData();
        } else { showReqAlert("Workflow Error", res.detail || "Step out of sequence.", true); }
    } catch (e) { showReqAlert("Error", "Server sync failed.", true); }
    finally { btn.disabled = false; btn.innerText = "Confirm Action"; }
}

// =================================================================
// 7. SYSTEM HELPERS
// =================================================================
window.closeModal = (id) => getReqEl(id).classList.add('hidden');

function showReqAlert(title, message, isError) {
    const modal = getReqEl('reqAlertModal');
    getReqEl('reqAlertTitle').innerText = title;
    getReqEl('reqAlertMessage').innerText = message;
    const icon = getReqEl('reqAlertIcon');
    icon.innerHTML = isError ? 
        `<div class="w-20 h-20 bg-red-500/10 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-red-500/20 animate-pulse"><i data-lucide="alert-circle" class="w-10 h-10"></i></div>` :
        `<div class="w-20 h-20 bg-emerald-500/10 text-emerald-500 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-emerald-500/20"><i data-lucide="check-circle" class="w-10 h-10"></i></div>`;
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
    if (!isError) setTimeout(() => modal.classList.add('hidden'), 3000);
}

window.openAddRequestModal = () => getReqEl('addRequestModal').classList.remove('hidden');

window.saveRequest = async function() {
    const payload = {
        destination: getReqEl('reqDestination').value.trim(),
        departure_time: new Date(getReqEl('reqDeparture').value).toISOString(),
        return_time: new Date(getReqEl('reqReturn').value).toISOString(),
        description: getReqEl('reqDesc').value.trim()
    };
    if(!payload.destination) return showReqAlert("Missing Info", "Destination is required.", true);

    const res = await window.fetchWithAuth('/requests/', 'POST', payload);
    if(res && !res.detail) {
        window.closeModal('addRequestModal');
        showReqAlert("Success", "Request submitted for approval.", false);
        await loadRequestsData();
    } else { showReqAlert("Error", res.detail || "Submission failed", true); }
}

document.addEventListener('DOMContentLoaded', initRequests);