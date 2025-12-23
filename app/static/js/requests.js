// app/static/js/requests.js

/**
 * ==============================================================================
 * FLEETDASH REQUESTS MODULE
 * Handles fetching, displaying, LIFO sorting, pagination, and assignment.
 * ==============================================================================
 */

// --- GLOBAL STATE ---
let allRequests = [];
let filteredRequests = [];
let availableVehicles = [];
let availableDrivers = [];
let reqUserRole = 'user';
let reqActionId = null;
let reqActionType = null;

// --- PAGINATION STATE ---
let reqCurrentPage = 1;
const reqPageLimit = 10;

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
    console.log("Requests Module: Full Feature Initialization...");
    
    reqUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // Attach Listeners
    const search = getReqEl('reqSearch');
    const filter = getReqEl('reqStatusFilter');
    const btnExecute = getReqEl('btnExecuteApproval');
    const btnAssign = getReqEl('btnExecuteAssign');

    if (search) search.addEventListener('input', () => { reqCurrentPage = 1; renderReqTable(); });
    if (filter) filter.addEventListener('change', () => { reqCurrentPage = 1; renderReqTable(); });
    
    if (btnExecute) btnExecute.onclick = submitApprovalDecision;
    if (btnAssign) btnAssign.onclick = submitAssignment;

    // Load Data
    await Promise.all([
        loadRequestsData(),
        loadAssignmentResources()
    ]);
}

// =================================================================
// 2. DATA LOADING (LIFO SORTING)
// =================================================================
async function loadRequestsData() {
    const tbody = getReqEl('reqLogsBody');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Refreshing requests...</td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000'); 
        
        // Handle variations in API response (items wrapper or raw array)
        const items = data && data.items ? data.items : (Array.isArray(data) ? data : []);
        
        // LIFO SORTING: Highest ID first
        allRequests = items.sort((a, b) => b.id - a.id);
        
        renderReqTable();
    } catch (error) {
        console.error("Load Error:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Connection failed. Ensure backend router is correct.</td></tr>`;
    }
}

async function loadAssignmentResources() {
    if (!['admin', 'superadmin', 'charoi'].includes(reqUserRole)) return;

    try {
        const [vData, dData] = await Promise.all([
            window.fetchWithAuth('/vehicles/?limit=1000'),
            window.fetchWithAuth('/requests/drivers') 
        ]);
        availableVehicles = vData && vData.items ? vData.items : (Array.isArray(vData) ? vData : []);
        availableDrivers = Array.isArray(dData) ? dData : [];
    } catch (e) {
        console.warn("Failed to load assignment resources", e);
    }
}

// =================================================================
// 3. TABLE RENDERING (7 COLUMNS + PAGINATION)
// =================================================================
function renderReqTable() {
    const tbody = getReqEl('reqLogsBody');
    if (!tbody) return;

    const searchVal = getReqEl('reqSearch')?.value.toLowerCase() || '';
    const filterVal = getReqEl('reqStatusFilter')?.value || 'all';

    // A. Apply Filtering
    filteredRequests = allRequests.filter(r => {
        const requesterName = r.requester ? r.requester.full_name.toLowerCase() : "";
        const dest = r.destination ? r.destination.toLowerCase() : "";
        const matchSearch = requesterName.includes(searchVal) || dest.includes(searchVal);
        
        let matchFilter = true;
        if (filterVal === 'pending') matchFilter = r.status === 'pending';
        else if (filterVal === 'step1') matchFilter = r.status === 'approved_by_chef';
        else if (filterVal === 'step2') matchFilter = r.status === 'approved_by_logistic';
        else if (filterVal === 'completed') matchFilter = ['fully_approved', 'completed'].includes(r.status);
        else if (filterVal === 'denied') matchFilter = r.status === 'denied';

        return matchSearch && matchFilter;
    });

    // B. Handle Pagination Logic
    updatePaginationUI();
    const startIdx = (reqCurrentPage - 1) * reqPageLimit;
    const paginatedItems = filteredRequests.slice(startIdx, startIdx + reqPageLimit);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No requests found.</td></tr>`;
        return;
    }

    const now = new Date();

    // C. Map Rows
    tbody.innerHTML = paginatedItems.map(r => {
        const requester = r.requester ? r.requester.full_name : "Unknown";
        const service = r.requester?.service?.service_name || "-";
        
        const safeDepString = r.departure_time.endsWith('Z') ? r.departure_time : r.departure_time + 'Z';
        const departureDate = new Date(safeDepString);
        const isLocked = now >= departureDate;

        // Progress Bar
        let stepText = "0/3 Pending";
        let width = "10%";
        let color = "bg-slate-600";
        if (r.status === 'approved_by_chef') { stepText = "1/3 Chef"; width = "33%"; color = "bg-blue-500"; }
        else if (r.status === 'approved_by_logistic') { stepText = "2/3 Logistic"; width = "66%"; color = "bg-purple-500"; }
        else if (['fully_approved', 'completed', 'in_progress'].includes(r.status)) { stepText = "3/3 Approved"; width = "100%"; color = "bg-emerald-500"; }
        else if (r.status === 'denied') { stepText = "Denied"; width = "100%"; color = "bg-red-500"; }

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30">
                <td class="p-4">
                    <div class="text-white font-medium text-sm flex items-center gap-2">
                        ${isLocked ? '<i data-lucide="lock" class="w-3 h-3 text-slate-500"></i>' : ''}
                        ${requester}
                    </div>
                    <div class="text-[10px] text-slate-500 uppercase">${service}</div>
                </td>
                <td class="p-4 text-slate-300 font-mono text-xs">${r.destination || 'N/A'}</td>
                <td class="p-4 text-slate-400 text-xs">${departureDate.toLocaleString()}</td>
                <td class="p-4 text-slate-400 text-xs">${r.return_time ? new Date(r.return_time).toLocaleString() : 'N/A'}</td>
                <td class="p-4">
                    <div class="text-[9px] uppercase font-bold text-slate-500 mb-1">${stepText}</div>
                    <div class="w-24 bg-slate-800 h-1 rounded-full overflow-hidden">
                        <div class="${color} h-full transition-all duration-500" style="width: ${width}"></div>
                    </div>
                </td>
                <td class="p-4">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20 whitespace-nowrap">
                        ${r.status.replace(/_/g, ' ')}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="openViewRequestModal(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition border border-slate-700">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

function updatePaginationUI() {
    const totalLogs = filteredRequests.length;
    const totalPages = Math.ceil(totalLogs / reqPageLimit) || 1;
    const indicator = getReqEl('reqPageIndicator');
    const countEl = getReqEl('reqCount');

    if (indicator) indicator.innerText = `Page ${reqCurrentPage} / ${totalPages}`;
    if (getReqEl('prevReqPage')) getReqEl('prevReqPage').disabled = (reqCurrentPage === 1);
    if (getReqEl('nextReqPage')) getReqEl('nextReqPage').disabled = (reqCurrentPage >= totalPages || totalLogs === 0);

    if (countEl) {
        const start = (reqCurrentPage - 1) * reqPageLimit + 1;
        const end = Math.min(start + reqPageLimit - 1, totalLogs);
        countEl.innerText = totalLogs > 0 ? `Showing ${start}-${end} of ${totalLogs} requests` : "0 requests found";
    }
}

window.changeReqPage = function(dir) {
    const totalPages = Math.ceil(filteredRequests.length / reqPageLimit);
    const newPage = reqCurrentPage + dir;
    if (newPage >= 1 && newPage <= totalPages) {
        reqCurrentPage = newPage;
        renderReqTable();
        getReqEl('reqLogsBody').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// =================================================================
// 4. ADD REQUEST
// =================================================================
window.openAddRequestModal = function() {
    const modal = getReqEl('addRequestModal');
    ['reqDestination', 'reqDesc', 'reqPassengers'].forEach(id => {
        const el = getReqEl(id); if (el) el.value = "";
    });
    
    const now = new Date();
    const toLocalISO = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    
    if (getReqEl('reqDeparture')) getReqEl('reqDeparture').value = toLocalISO(now);
    if (getReqEl('reqReturn')) getReqEl('reqReturn').value = toLocalISO(new Date(now.getTime() + 4*3600000));
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

window.saveRequest = async function() {
    const btn = getReqEl('btnSaveReq');
    const payload = {
        destination: getReqEl('reqDestination').value.trim(),
        departure_time: new Date(getReqEl('reqDeparture').value).toISOString(),
        return_time: new Date(getReqEl('reqReturn').value).toISOString(),
        description: getReqEl('reqDesc').value.trim(),
        passengers: getReqEl('reqPassengers').value ? getReqEl('reqPassengers').value.split(',').map(s => s.trim()) : []
    };

    if (!payload.destination) { showReqAlert("Error", "Destination is required", true); return; }

    btn.disabled = true; btn.innerText = "Sending...";
    try {
        const res = await window.fetchWithAuth('/requests/', 'POST', payload);
        if (res && !res.detail) {
            window.closeModal('addRequestModal');
            await loadRequestsData();
            showReqAlert("Success", "Request submitted.", false);
        } else { showReqAlert("Error", res.detail || "Failed", true); }
    } catch (e) { showReqAlert("Error", "Server Error", true); }
    btn.disabled = false; btn.innerText = "Submit Request";
}

// =================================================================
// 5. VIEW / APPROVE / ASSIGN MODAL
// =================================================================
window.openViewRequestModal = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const safeDepString = r.departure_time.endsWith('Z') ? r.departure_time : r.departure_time + 'Z';
    const departureDate = new Date(safeDepString);
    const isLocked = new Date() >= departureDate;

    let assignmentHtml = r.vehicle ? `
        <div class="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700">
            <div class="bg-slate-800 p-3 rounded">
                <span class="text-[10px] text-slate-500 uppercase block">Assigned Vehicle</span>
                <span class="text-white text-sm font-bold">${r.vehicle.plate_number}</span>
            </div>
            <div class="bg-slate-800 p-3 rounded">
                <span class="text-[10px] text-slate-500 uppercase block">Assigned Driver</span>
                <span class="text-white text-sm font-bold">${r.driver ? r.driver.full_name : 'No driver assigned'}</span>
            </div>
        </div>` : '';

    getReqEl('viewRequestContent').innerHTML = `
        <div class="space-y-4 text-sm">
            <div class="flex justify-between border-b border-slate-700 pb-3">
                <div><h3 class="text-white font-bold text-lg">${r.requester.full_name}</h3><p class="text-slate-500 text-xs">${r.requester.service.service_name}</p></div>
                <div class="text-right text-blue-400 font-mono">ID #${r.id}</div>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <div><span class="text-slate-500 text-[10px] uppercase block">Destination</span><span class="text-white">${r.destination}</span></div>
                <div><span class="text-slate-500 text-[10px] uppercase block">Passengers</span><span class="text-white text-xs">${r.passengers ? r.passengers.join(', ') : 'None'}</span></div>
            </div>
            <div class="bg-slate-800/50 p-3 rounded border border-slate-700 text-slate-300 italic">"${r.description || 'No reason provided.'}"</div>
            ${assignmentHtml}
            ${isLocked ? '<div class="p-2 bg-red-500/10 text-red-400 text-[10px] rounded border border-red-500/20 text-center">Past departure time: Edit locked.</div>' : ''}
        </div>`;

    let btns = `<button onclick="closeModal('viewRequestModal')" class="px-4 py-2 bg-slate-700 text-white text-sm rounded-lg">Close</button>`;
    
    if (!isLocked) {
        if (reqUserRole === 'chef' && r.status === 'pending') btns = getDecisionButtons(r.id);
        else if (reqUserRole === 'logistic' && r.status === 'approved_by_chef') btns = getDecisionButtons(r.id);
        else if (['charoi', 'admin'].includes(reqUserRole) && r.status === 'approved_by_logistic') btns = getDecisionButtons(r.id);
        
        if (['admin', 'charoi'].includes(reqUserRole) && ['approved_by_logistic', 'fully_approved'].includes(r.status)) {
            btns = `<button onclick="openAssignmentModal(${r.id})" class="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg mr-2 flex items-center gap-2"><i data-lucide="steering-wheel" class="w-4 h-4"></i> Assign</button>` + btns;
        }
    }

    getReqEl('approvalActionsFooter').innerHTML = btns;
    getReqEl('viewRequestModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

function getDecisionButtons(id) {
    return `
        <button onclick="openApprovalModal(${id}, 'reject')" class="px-4 py-2 bg-red-600 text-white text-sm rounded-lg mr-2">Deny</button>
        <button onclick="openApprovalModal(${id}, 'approve')" class="px-4 py-2 bg-green-600 text-white text-sm rounded-lg">Approve</button>
    `;
}

// =================================================================
// 6. APPROVALS & ASSIGNMENTS
// =================================================================
window.openApprovalModal = function(id, type) {
    window.closeModal('viewRequestModal');
    reqActionId = id; reqActionType = type;
    getReqEl('approvalTitle').innerText = type === 'approve' ? "Confirm Approval" : "Deny Request";
    getReqEl('btnExecuteApproval').className = type === 'approve' ? "px-4 py-2 bg-green-600 text-white rounded-lg w-full" : "px-4 py-2 bg-red-600 text-white rounded-lg w-full";
    getReqEl('approvalModal').classList.remove('hidden');
}

async function submitApprovalDecision() {
    const payload = { status: reqActionType === 'approve' ? 'approved' : 'denied', comments: getReqEl('approvalComment').value };
    const res = await window.fetchWithAuth(`/approvals/${reqActionId}`, 'POST', payload);
    if(res && !res.detail) {
        window.closeModal('approvalModal');
        await loadRequestsData();
        showReqAlert("Success", "Status updated.", false);
    }
}

window.openAssignmentModal = function(id) {
    window.closeModal('viewRequestModal');
    getReqEl('assignReqId').value = id;
    const vSel = getReqEl('assignVehicle');
    const dSel = getReqEl('assignDriver');
    
    vSel.innerHTML = '<option value="">Select Vehicle</option>' + availableVehicles.map(v => `<option value="${v.id}">${v.plate_number} (${v.vehicle_model?.model_name || 'N/A'})</option>`).join('');
    dSel.innerHTML = '<option value="">Select Driver</option>' + availableDrivers.map(d => `<option value="${d.id}">${d.full_name}</option>`).join('');
    
    getReqEl('assignmentModal').classList.remove('hidden');
}

async function submitAssignment() {
    const id = getReqEl('assignReqId').value;
    const payload = { vehicle_id: parseInt(getReqEl('assignVehicle').value), driver_id: parseInt(getReqEl('assignDriver').value) };
    const res = await window.fetchWithAuth(`/requests/${id}/assign`, 'PUT', payload);
    if(res && !res.detail) {
        window.closeModal('assignmentModal');
        await loadRequestsData();
        showReqAlert("Success", "Resources assigned.", false);
    }
}

// =================================================================
// 7. HELPERS
// =================================================================
window.closeModal = (id) => getReqEl(id)?.classList.add('hidden');

function showReqAlert(title, message, isError) {
    const modal = getReqEl('reqAlertModal');
    if(!modal) return;
    getReqEl('reqAlertTitle').innerText = title;
    getReqEl('reqAlertMessage').innerText = message;
    const icon = getReqEl('reqAlertIcon');
    icon.innerHTML = `<i data-lucide="${isError ? 'x-circle' : 'check-circle'}" class="w-8 h-8 ${isError ? 'text-red-500' : 'text-green-500'}"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
    if(!isError) setTimeout(() => modal.classList.add('hidden'), 3000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initRequests);
else initRequests();