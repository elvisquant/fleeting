// app/static/js/requests.js

/**
 * ==============================================================================
 * FLEETDASH REQUESTS MODULE
 * Handles fetching, displaying, approving, and assigning resources.
 * Matches the updated requests.html structure.
 * ==============================================================================
 */

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

    // Attach Listeners
    const search = getReqEl('reqSearch');
    const filter = getReqEl('reqStatusFilter');
    const btnExecute = getReqEl('btnExecuteApproval');
    const btnAssign = getReqEl('btnExecuteAssign');

    if (search) search.addEventListener('input', renderReqTable);
    if (filter) filter.addEventListener('change', renderReqTable);
    
    if (btnExecute) btnExecute.addEventListener('click', submitApprovalDecision);
    if (btnAssign) btnAssign.addEventListener('click', submitAssignment);

    // Load Data
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
    
    tbody.innerHTML = `<tr><td colspan="7" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading...</td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/'); 
        const items = data.items || data;
        
        if (Array.isArray(items)) {
            allRequests = items;
            renderReqTable();
        } else {
            const msg = data && data.detail ? data.detail : "Failed to load requests.";
            tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
        }
    } catch (error) {
        console.error("Load Error:", error);
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-red-400">Connection failed.</td></tr>`;
    }
}

async function loadAssignmentResources() {
    if (!['admin', 'superadmin', 'charoi'].includes(reqUserRole)) return;

    try {
        const vData = await window.fetchWithAuth('/vehicles/?limit=1000');
        availableVehicles = Array.isArray(vData) ? vData : (vData.items || []);

        const dData = await window.fetchWithAuth('/requests/drivers'); 
        availableDrivers = Array.isArray(dData) ? dData : [];

        console.log(`Loaded ${availableVehicles.length} vehicles and ${availableDrivers.length} drivers.`);
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
    if (countEl) countEl.innerText = `${filtered.length} requests found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="p-8 text-center text-slate-500">No requests found.</td></tr>`;
        return;
    }

    const now = new Date();

    tbody.innerHTML = filtered.map(r => {
        const requester = r.requester ? r.requester.full_name : "Unknown";
        const service = r.requester && r.requester.service ? r.requester.service.service_name : "-";
        
        // --- FIX: Ensure Date is parsed as UTC if 'Z' is missing ---
        const safeDepString = r.departure_time.endsWith('Z') ? r.departure_time : r.departure_time + 'Z';
        const departureDate = new Date(safeDepString);
        
        const dep = departureDate.toLocaleString();
        const ret = r.return_time ? new Date(r.return_time).toLocaleString() : 'N/A';

        // Lock Logic
        const isLocked = now >= departureDate;
        const rowClass = isLocked 
            ? "hover:bg-white/5 border-b border-slate-700/30 opacity-60 bg-slate-900/30" 
            : "hover:bg-white/5 border-b border-slate-700/30";

        // Progress Bar
        let statusHtml = '';
        if (r.status === 'denied') {
            statusHtml = `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400 border border-red-500/20">Denied</span>`;
        } else {
            let step = 0; 
            let text = "0/3 Pending";
            let width = "5%";
            let color = "bg-slate-600";
            
            if (r.status === 'approved_by_chef') { step = 1; text = "1/3 Chef Approved"; width = "33%"; color = "bg-blue-500"; }
            else if (r.status === 'approved_by_logistic') { step = 2; text = "2/3 Logistic Approved"; width = "66%"; color = "bg-purple-500"; }
            else if (['fully_approved', 'in_progress', 'completed'].includes(r.status)) { step = 3; text = "3/3 Fully Approved"; width = "100%"; color = "bg-emerald-500"; }

            statusHtml = `
                <div class="w-36">
                    <div class="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1"><span>${text}</span></div>
                    <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div class="${color} h-1.5 rounded-full" style="width: ${width}"></div>
                    </div>
                </div>`;
        }

        // Status Badge
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
                        ${r.status.replace(/_/g, ' ')}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="openViewRequestModal(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="${isLocked ? 'View Locked' : 'View / Edit'}">
                        <i data-lucide="eye" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. ADD REQUEST MODAL (Creation)
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
        showReqErrorAlert("Validation", "Please fill required fields (Destination, Dates)."); 
        return; 
    }

    const departureDate = new Date(dep);
    const returnDate = new Date(ret);
    if (returnDate <= departureDate) {
        showReqErrorAlert("Validation", "Return date must be after departure.");
        return;
    }

    const passengers = passStr ? passStr.split(',').map(s => s.trim()).filter(s => s) : [];

    btn.disabled = true; 
    btn.innerText = "Sending...";

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
            showReqSuccessAlert("Success", "Request submitted successfully.");
        } else {
            let errorMsg = "Failed to submit request.";
            if (result.detail) {
                errorMsg = typeof result.detail === 'object' ? JSON.stringify(result.detail) : result.detail;
            }
            showReqErrorAlert("Error", errorMsg);
        }
    } catch(e) { 
        showReqErrorAlert("Error", e.message || "Failed to submit request."); 
    }
    
    btn.disabled = false; 
    btn.innerText = "Submit Request";
}

// =================================================================
// 5. VIEW / APPROVE / ASSIGN MODAL LOGIC
// =================================================================

window.openViewRequestModal = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const viewContent = getReqEl('viewRequestContent');
    const footer = getReqEl('approvalActionsFooter');
    const modal = getReqEl('viewRequestModal');
    
    if (!viewContent || !footer || !modal) return;

    // --- FIX: FORCE UTC COMPARISON ---
    const safeDepString = r.departure_time.endsWith('Z') ? r.departure_time : r.departure_time + 'Z';
    const departureDate = new Date(safeDepString);
    const isLocked = new Date() >= departureDate;

    // --- RENDER DETAILS ---
    const requester = r.requester ? r.requester.full_name : "Unknown";
    const service = r.requester && r.requester.service ? r.requester.service.service_name : "-";
    const passengers = r.passengers ? (Array.isArray(r.passengers) ? r.passengers.join(", ") : r.passengers) : "None";
    
    // Robust Driver Name
    let driverName = 'Not assigned';
    if (r.driver) {
        if (r.driver.full_name) {
            driverName = r.driver.full_name;
        } else if (r.driver.first_name) {
            driverName = `${r.driver.first_name} ${r.driver.last_name || ''}`;
        } else {
            driverName = r.driver.username || 'Unknown Driver';
        }
    }

    let assignmentHtml = '';
    if (r.vehicle || r.driver) {
        assignmentHtml = `
        <div class="col-span-2 mt-4 pt-4 border-t border-slate-700">
            <h4 class="text-xs uppercase font-bold text-slate-500 mb-2">Assigned Resources</h4>
            <div class="grid grid-cols-2 gap-4">
                <div class="p-3 bg-slate-800 rounded-lg flex items-center gap-3">
                    <i data-lucide="car" class="w-5 h-5 text-blue-400"></i>
                    <div>
                        <p class="text-xs text-slate-500">Vehicle</p>
                        <p class="text-sm font-medium text-white">${r.vehicle ? r.vehicle.plate_number : 'Not assigned'}</p>
                    </div>
                </div>
                <div class="p-3 bg-slate-800 rounded-lg flex items-center gap-3">
                    <i data-lucide="user" class="w-5 h-5 text-blue-400"></i>
                    <div>
                        <p class="text-xs text-slate-500">Driver</p>
                        <p class="text-sm font-medium text-white">${driverName}</p>
                    </div>
                </div>
            </div>
        </div>`;
    }

    let rejectionHtml = r.status === 'denied' && r.rejection_reason ? `
        <div class="col-span-2 mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <span class="text-red-400 text-xs uppercase font-bold block mb-1">Rejection Reason</span>
            <p class="text-red-200 text-sm">${r.rejection_reason || ''}</p>
        </div>` : '';

    let lockNotice = isLocked ? `
        <div class="col-span-2 mb-2 p-2 bg-slate-800/50 border border-slate-700 rounded text-xs text-slate-400 flex items-center gap-2">
            <i data-lucide="lock" class="w-3 h-3"></i>
            Request Locked: Departure time has passed.
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
            <div><span class="text-slate-500 text-xs uppercase block">Destination</span><span class="text-white">${r.destination || 'N/A'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Passengers</span><span class="text-white">${passengers}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Departure</span><span class="text-white">${r.departure_time ? new Date(r.departure_time).toLocaleString() : 'N/A'}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Return</span><span class="text-white">${r.return_time ? new Date(r.return_time).toLocaleString() : 'N/A'}</span></div>
            <div class="col-span-2">
                <span class="text-slate-500 text-xs uppercase block mb-1">Description</span>
                <p class="text-slate-300 text-sm bg-slate-800 p-3 rounded-lg">${r.description || 'No description provided.'}</p>
            </div>
            ${assignmentHtml}
            ${rejectionHtml}
        </div>`;

    // --- FOOTER BUTTON LOGIC ---
    let buttons = `<button onclick="closeModal('viewRequestModal')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg">Close</button>`;

    // Only allow actions if NOT Locked
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

        // Assign Button Logic
        if (['charoi', 'admin', 'superadmin'].includes(reqUserRole) && 
            ['approved_by_logistic', 'fully_approved', 'in_progress'].includes(r.status)) {
            
            const assignBtn = `
                <button onclick="openAssignmentModal(${r.id})" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg flex items-center gap-2 mr-2">
                    <i data-lucide="steering-wheel" class="w-4 h-4"></i> Assign Resources
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
        <button onclick="closeModal('viewRequestModal')" class="px-3 py-2 text-slate-400 hover:text-white text-sm font-medium">Cancel</button>
        <button onclick="openApprovalModal(${id}, 'reject')" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg flex items-center gap-2"><i data-lucide="x-circle" class="w-4 h-4"></i> Deny</button>
        <button onclick="openApprovalModal(${id}, 'approve')" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4"></i> Approve</button>
    `;
}

// =================================================================
// 6. RESOURCE ASSIGNMENT LOGIC (Assignment Modal #4)
// =================================================================

window.openAssignmentModal = function(requestId) {
    window.closeModal('viewRequestModal');
    
    const modal = getReqEl('assignmentModal');
    const vSelect = getReqEl('assignVehicle');
    const dSelect = getReqEl('assignDriver');
    const idInput = getReqEl('assignReqId');
    
    if (!modal) return;

    idInput.value = requestId;

    vSelect.innerHTML = '<option value="">Select Vehicle...</option>';
    availableVehicles.forEach(v => {
        const option = document.createElement('option');
        option.value = v.id;
        option.text = `${v.plate_number} ${v.make_ref ? '('+v.make_ref.make_name+')' : ''}`;
        vSelect.appendChild(option);
    });

    dSelect.innerHTML = '<option value="">Select Driver...</option>';
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
        showReqErrorAlert("Validation", "Please select both a Vehicle and a Driver.");
        return;
    }

    btn.disabled = true;
    btn.innerText = "Assigning...";

    try {
        const payload = { vehicle_id: parseInt(vId), driver_id: parseInt(dId) };
        const result = await window.fetchWithAuth(`/requests/${reqId}/assign`, 'PUT', payload);
        
        if (result && !result.detail) {
            window.closeModal('assignmentModal');
            await loadRequestsData(); 
            showReqSuccessAlert("Success", "Resources assigned successfully.");
        } else {
            const msg = result?.detail ? (typeof result.detail === 'object' ? JSON.stringify(result.detail) : result.detail) : "Assignment failed.";
            showReqErrorAlert("Error", msg);
        }
    } catch (e) {
        showReqErrorAlert("System Error", e.message || "Connection failed.");
    }

    btn.disabled = false;
    btn.innerText = "Save Assignment";
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
        titleEl.innerText = "Confirm Approval";
        btn.innerText = "Approve";
        btn.className = "px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm w-full font-medium shadow-lg";
        if (iconDiv) {
            iconDiv.className = "w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 text-green-500 bg-green-500/10";
            iconDiv.innerHTML = '<i data-lucide="check-circle" class="w-6 h-6"></i>';
        }
    } else {
        titleEl.innerText = "Deny Request";
        btn.innerText = "Reject";
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
        showReqErrorAlert("Validation", "Please provide a rejection reason."); 
        return; 
    }

    btn.disabled = true; 
    btn.innerText = "Processing...";

    const payload = { 
        status: reqActionType === 'approve' ? 'approved' : 'denied',
        comment: comment.trim() || null 
    };

    try {
        const result = await window.fetchWithAuth(`/approvals/${reqActionId}`, 'POST', payload);
        window.closeModal('approvalModal');
        
        if (result && !result.detail) {
            await loadRequestsData();
            showReqSuccessAlert("Success", `Request ${reqActionType === 'approve' ? 'approved' : 'rejected'} successfully.`);
        } else {
            const msg = result?.detail ? (typeof result.detail === 'object' ? JSON.stringify(result.detail) : result.detail) : "Action failed.";
            showReqErrorAlert("Error", msg);
        }
    } catch(e) {
        window.closeModal('approvalModal');
        showReqErrorAlert("System Error", e.message || "Failed to process approval.");
    }
    
    btn.disabled = false;
    btn.innerText = reqActionType === 'approve' ? "Approve" : "Reject";
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