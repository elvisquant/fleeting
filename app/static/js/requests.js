// app/static/js/requests.js

// --- GLOBAL STATE ---
let allRequests = [];
let reqUserRole = 'user';
let reqActionId = null;
let reqActionType = null; // 'approve' or 'reject'

// =================================================================
// MOBILE-COMPATIBLE ELEMENT GETTER
// =================================================================
function getReqEl(id) {
    // First try mobile container (if we're on mobile)
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    // Then try desktop container
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    // Fallback to global search
    return document.getElementById(id);
}

// =================================================================
// 1. INITIALIZATION
// =================================================================
async function initRequests() {
    console.log("Requests Module: Init");
    reqUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // DOM Elements using mobile-compatible getter
    const search = getReqEl('reqSearch');
    const filter = getReqEl('reqStatusFilter');
    const btnExecute = getReqEl('btnExecuteApproval');

    // Attach Listeners
    if (search) search.addEventListener('input', renderReqTable);
    if (filter) filter.addEventListener('change', renderReqTable);
    if (btnExecute) btnExecute.addEventListener('click', submitApprovalDecision);

    await loadRequestsData();
}

// =================================================================
// 2. DATA LOADING
// =================================================================
async function loadRequestsData() {
    const tbody = getReqEl('reqLogsBody');
    if (!tbody) return;
    
    // Loading State
    tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading...</td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    // FIX: Added trailing slash to prevent 307 Redirect
    const data = await window.fetchWithAuth('/requests/'); 

    // Handle pagination or list response
    const items = data.items || data;
    
    if (Array.isArray(items)) {
        allRequests = items;
        renderReqTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load requests.";
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

// =================================================================
// 3. TABLE RENDERING
// =================================================================
function renderReqTable() {
    const tbody = getReqEl('reqLogsBody');
    if (!tbody) return;

    // Get Filter Values
    const search = getReqEl('reqSearch');
    const filter = getReqEl('reqStatusFilter');
    
    const searchValue = search ? search.value.toLowerCase() : '';
    const filterValue = filter ? filter.value : '';

    // Filter Data
    let filtered = allRequests.filter(r => {
        const requesterName = r.requester ? r.requester.full_name.toLowerCase() : "";
        const dest = r.destination ? r.destination.toLowerCase() : "";
        const matchSearch = requesterName.includes(searchValue) || dest.includes(searchValue);
        
        let matchFilter = true;
        if (filterValue === 'pending') matchFilter = r.status === 'pending';
        if (filterValue === 'step1') matchFilter = r.status === 'approved_by_chef';
        if (filterValue === 'step2') matchFilter = r.status === 'approved_by_logistic';
        if (filterValue === 'completed') matchFilter = r.status === 'fully_approved' || r.status === 'in_progress' || r.status === 'completed';
        if (filterValue === 'denied') matchFilter = r.status === 'denied';

        return matchSearch && matchFilter;
    });

    // Update Count
    const countEl = getReqEl('reqCount');
    if (countEl) countEl.innerText = `${filtered.length} requests found`;

    // Empty State
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500">No requests found.</td></tr>`;
        return;
    }

    // Generate Rows
    tbody.innerHTML = filtered.map(r => {
        const requester = r.requester ? r.requester.full_name : "Unknown";
        const service = r.requester && r.requester.service ? r.requester.service.service_name : "-";
        
        // Handle Date Display safely
        const dep = r.departure_time ? new Date(r.departure_time).toLocaleString() : 'N/A';
        const ret = r.return_time ? new Date(r.return_time).toLocaleString() : 'N/A';

        // --- NUMERICAL APPROVAL STATUS ---
        let statusHtml = '';
        if (r.status === 'denied') {
            statusHtml = `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400 border border-red-500/20">Denied</span>`;
        } else {
            let step = 0; 
            let text = "0/3 Pending";
            let width = "5%";
            let color = "bg-slate-600";
            
            if (r.status === 'approved_by_chef') { 
                step = 1; 
                text = "1/3 Chef Approved"; 
                width = "33%"; 
                color = "bg-blue-500"; 
            }
            else if (r.status === 'approved_by_logistic') { 
                step = 2; 
                text = "2/3 Logistic Approved"; 
                width = "66%"; 
                color = "bg-purple-500"; 
            }
            else if (['fully_approved', 'in_progress', 'completed'].includes(r.status)) { 
                step = 3; 
                text = "3/3 Fully Approved"; 
                width = "100%"; 
                color = "bg-emerald-500"; 
            }

            statusHtml = `
                <div class="w-36">
                    <div class="flex justify-between text-[10px] uppercase font-bold text-slate-400 mb-1"><span>${text}</span></div>
                    <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div class="${color} h-1.5 rounded-full" style="width: ${width}"></div>
                    </div>
                </div>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30">
                <td class="p-4">
                    <div class="text-white font-medium">${requester}</div>
                    <div class="text-xs text-slate-500">${service || '-'}</div>
                </td>
                <td class="p-4 text-slate-300 font-mono text-xs">${r.destination || 'N/A'}</td>
                <td class="p-4 text-slate-400 text-xs">${dep}</td>
                <td class="p-4 text-slate-400 text-xs">${ret}</td>
                <td class="p-4">${statusHtml}</td>
                <td class="p-4 text-right">
                    <button onclick="openViewRequestModal(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View"><i data-lucide="eye" class="w-4 h-4"></i></button>
                </td>
            </tr>`;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. ADD REQUEST MODAL
// =================================================================

window.openAddRequestModal = function() {
    const destEl = getReqEl('reqDestination');
    const depEl = getReqEl('reqDeparture');
    const retEl = getReqEl('reqReturn');
    const descEl = getReqEl('reqDesc');
    const passEl = getReqEl('reqPassengers');
    const modal = getReqEl('addRequestModal');
    
    if (!modal) return;
    
    // Reset form values
    if (destEl) destEl.value = "";
    
    // Set default dates (now for departure, +3 hours for return)
    const now = new Date();
    const later = new Date(now.getTime() + 3 * 60 * 60 * 1000); // 3 hours later
    
    if (depEl) depEl.value = now.toISOString().slice(0, 16);
    if (retEl) retEl.value = later.toISOString().slice(0, 16);
    
    if (descEl) descEl.value = "";
    if (passEl) passEl.value = "";
    
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

window.saveRequest = async function() {
    // Get form elements
    const destEl = getReqEl('reqDestination');
    const depEl = getReqEl('reqDeparture');
    const retEl = getReqEl('reqReturn');
    const descEl = getReqEl('reqDesc');
    const passEl = getReqEl('reqPassengers');
    const btn = getReqEl('btnSaveReq');
    
    // Get form values
    const dest = destEl ? destEl.value.trim() : '';
    const dep = depEl ? depEl.value : '';
    const ret = retEl ? retEl.value : '';
    const desc = descEl ? descEl.value.trim() : '';
    const passStr = passEl ? passEl.value : '';
    
    if (!btn) return;

    // VALIDATION
    if (!dest) { 
        showReqErrorAlert("Validation", "Please enter destination."); 
        return; 
    }
    
    if (!dep || !ret) { 
        showReqErrorAlert("Validation", "Please fill both departure and return dates."); 
        return; 
    }

    const departureDate = new Date(dep);
    const returnDate = new Date(ret);
    
    if (returnDate <= departureDate) {
        showReqErrorAlert("Validation", "Return date must be after departure date.");
        return;
    }

    // Convert comma string to array
    const passengers = passStr ? passStr.split(',').map(s => s.trim()).filter(s => s) : [];

    const payload = {
        destination: dest,
        departure_time: departureDate.toISOString(),
        return_time: returnDate.toISOString(),
        description: desc,
        passengers: passengers
    };

    btn.disabled = true; 
    btn.innerText = "Sending...";

    try {
        // FIX: Added trailing slash
        const result = await window.fetchWithAuth('/requests/', 'POST', payload);
        if (result && !result.detail) {
            window.closeModal('addRequestModal');
            await loadRequestsData();
            showReqSuccessAlert("Success", "Request submitted successfully.");
        } else {
            const err = result?.detail ? JSON.stringify(result.detail) : "Failed to submit request.";
            showReqErrorAlert("Error", err);
        }
    } catch(e) { 
        showReqErrorAlert("Error", e.message || "Failed to submit request."); 
    }
    
    btn.disabled = false; 
    btn.innerText = "Submit Request";
}

// =================================================================
// 5. VIEW / APPROVE MODAL
// =================================================================

window.openViewRequestModal = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const viewContent = getReqEl('viewRequestContent');
    const footer = getReqEl('approvalActionsFooter');
    const modal = getReqEl('viewRequestModal');
    
    if (!viewContent || !footer || !modal) return;

    // Populate Details
    const requester = r.requester ? r.requester.full_name : "Unknown";
    const service = r.requester && r.requester.service ? r.requester.service.service_name : "-";
    const passengers = r.passengers ? (Array.isArray(r.passengers) ? r.passengers.join(", ") : r.passengers) : "None";
    
    let rejectionHtml = '';
    if (r.status === 'denied' && r.rejection_reason) {
        rejectionHtml = `
            <div class="col-span-2 mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <span class="text-red-400 text-xs uppercase font-bold block mb-1">Rejection Reason</span>
                <p class="text-red-200 text-sm">${r.rejection_reason || ''}</p>
            </div>`;
    }

    const content = `
        <div class="grid grid-cols-2 gap-y-4 gap-x-6">
            <div class="col-span-2 border-b border-slate-700 pb-3 mb-2 flex justify-between items-center">
                <div>
                    <div class="text-white font-bold text-lg">${requester}</div>
                    <div class="text-slate-500 text-xs">${service || '-'}</div>
                </div>
                <div class="text-right">
                    <div class="text-blue-400 font-mono text-sm">ID #${r.id}</div>
                    <div class="text-slate-500 text-xs uppercase">${r.status ? r.status.replace(/_/g, ' ') : 'Unknown'}</div>
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
            ${rejectionHtml}
        </div>`;
    
    viewContent.innerHTML = content;

    // Actions Footer Logic
    let buttons = `<button onclick="closeModal('viewRequestModal')" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium rounded-lg">Close</button>`;

    // --- APPROVAL WORKFLOW LOGIC ---
    if (reqUserRole === 'chef' && r.status === 'pending') {
        buttons = getApproveRejectButtons(r.id, "Chef Approval");
    }
    else if (reqUserRole === 'logistic' && r.status === 'approved_by_chef') {
        buttons = getApproveRejectButtons(r.id, "Logistic Approval");
    }
    else if (['charoi', 'admin', 'superadmin'].includes(reqUserRole) && r.status === 'approved_by_logistic') {
        buttons = getApproveRejectButtons(r.id, "Final Approval");
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
// 6. CONFIRM APPROVE/REJECT
// =================================================================

window.openApprovalModal = function(id, type) {
    window.closeModal('viewRequestModal'); // Close view
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

    // FIX: Changed payload structure to match backend expectations
    const payload = { 
        status: reqActionType === 'approve' ? 'approved' : 'denied',
        comment: comment.trim() || null 
    };

    try {
        // FIX: Added trailing slash
        const result = await window.fetchWithAuth(`/approvals/${reqActionId}/`, 'POST', payload);
        window.closeModal('approvalModal');
        
        if (result && !result.detail) {
            await loadRequestsData();
            showReqSuccessAlert("Success", `Request ${reqActionType === 'approve' ? 'approved' : 'rejected'} successfully.`);
        } else {
            const msg = result?.detail ? JSON.stringify(result.detail) : "Action failed.";
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
// 7. HELPER FUNCTIONS
// =================================================================

window.closeModal = function(id) { 
    const modal = getReqEl(id) || document.getElementById(id);
    if (modal) modal.classList.add('hidden'); 
}

// Custom success alert modal
function showReqSuccessAlert(title, message) {
    const modal = getReqEl('reqSuccessAlertModal');
    if (!modal) {
        // Fallback to browser alert if modal doesn't exist
        alert(`${title}: ${message}`);
        return;
    }
    
    const titleEl = getReqEl('reqSuccessAlertTitle');
    const messageEl = getReqEl('reqSuccessAlertMessage');
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerText = message;
    
    modal.classList.remove('hidden');
    
    // Auto close after 3 seconds
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 3000);
    
    if (window.lucide) window.lucide.createIcons();
}

// Custom error alert modal
function showReqErrorAlert(title, message) {
    const modal = getReqEl('reqErrorAlertModal');
    if (!modal) {
        // Fallback to browser alert if modal doesn't exist
        alert(`${title}: ${message}`);
        return;
    }
    
    const titleEl = getReqEl('reqErrorAlertTitle');
    const messageEl = getReqEl('reqErrorAlertMessage');
    
    if (titleEl) titleEl.innerText = title;
    if (messageEl) messageEl.innerText = message;
    
    modal.classList.remove('hidden');
    
    // Auto close after 5 seconds for errors
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 5000);
    
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 8. INITIALIZATION
// =================================================================

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRequests);
} else {
    initRequests();
}