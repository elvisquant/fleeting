// app/static/js/requests.js

let allRequests = [];
let reqUserRole = 'user';
let reqActionId = null;
let reqActionType = null; // 'approve' or 'reject'

async function initRequests() {
    console.log("Requests Module: Init");
    reqUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

    // Listeners
    const search = document.getElementById('reqSearch');
    const filter = document.getElementById('reqStatusFilter');
    const btnExecute = document.getElementById('btnExecuteApproval');

    if(search) search.addEventListener('input', renderReqTable);
    if(filter) filter.addEventListener('change', renderReqTable);
    if(btnExecute) btnExecute.addEventListener('click', submitApprovalDecision);

    await loadRequestsData();
}

async function loadRequestsData() {
    const tbody = document.getElementById('reqLogsBody');
    if(!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    // Fetch /requests
    const data = await window.fetchWithAuth('/requests'); 

    if (Array.isArray(data)) {
        allRequests = data;
        renderReqTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load requests.";
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

function renderReqTable() {
    const tbody = document.getElementById('reqLogsBody');
    if(!tbody) return;

    const search = document.getElementById('reqSearch').value.toLowerCase();
    const filter = document.getElementById('reqStatusFilter').value;

    let filtered = allRequests.filter(r => {
        const requesterName = r.requester ? r.requester.full_name.toLowerCase() : "";
        const dest = r.destination.toLowerCase();
        const matchSearch = requesterName.includes(search) || dest.includes(search);
        
        let matchFilter = true;
        if (filter === 'pending') matchFilter = r.status === 'pending';
        if (filter === 'step1') matchFilter = r.status === 'approved_by_chef';
        if (filter === 'step2') matchFilter = r.status === 'approved_by_logistic';
        if (filter === 'completed') matchFilter = r.status === 'fully_approved';
        if (filter === 'denied') matchFilter = r.status === 'denied';

        return matchSearch && matchFilter;
    });

    document.getElementById('reqCount').innerText = `${filtered.length} requests found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500">No requests found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const requester = r.requester ? r.requester.full_name : "Unknown";
        const service = r.requester && r.requester.service ? r.requester.service.service_name : "-";
        
        // Handle Date Display safely
        const dep = r.departure_time ? new Date(r.departure_time).toLocaleString() : 'N/A';
        const ret = r.return_time ? new Date(r.return_time).toLocaleString() : 'N/A';

        // --- NUMERICAL APPROVAL STATUS ---
        let statusHtml = '';
        if (r.status === 'denied') {
            statusHtml = `<span class="px-2 py-1 rounded bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold uppercase">Denied</span>`;
        } else {
            let step = 0; 
            let text = "0/3 Pending";
            let width = "5%";
            let color = "bg-slate-600";
            
            if (r.status === 'approved_by_chef') { step = 1; text = "1/3 Chef Appr."; width = "33%"; color = "bg-blue-500"; }
            else if (r.status === 'approved_by_logistic') { step = 2; text = "2/3 Logistic Appr."; width = "66%"; color = "bg-purple-500"; }
            else if (['fully_approved', 'in_progress', 'completed'].includes(r.status)) { step = 3; text = "3/3 Fully Approved"; width = "100%"; color = "bg-emerald-500"; }

            statusHtml = `
                <div class="w-32">
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
                    <div class="text-xs text-slate-500">${service}</div>
                </td>
                <td class="p-4 text-slate-300 font-mono text-xs">${r.destination}</td>
                <td class="p-4 text-slate-400 text-xs">${dep}</td>
                <td class="p-4 text-slate-400 text-xs">${ret}</td>
                <td class="p-4">${statusHtml}</td>
                <td class="p-4 text-right">
                    <button onclick="openViewRequestModal(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition"><i data-lucide="eye" class="w-4 h-4"></i></button>
                </td>
            </tr>`;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// === ADD REQUEST MODAL ===

window.openAddRequestModal = function() {
    document.getElementById('reqDestination').value = "";
    document.getElementById('reqDeparture').value = "";
    document.getElementById('reqReturn').value = "";
    document.getElementById('reqDesc').value = "";
    document.getElementById('reqPassengers').value = "";
    
    document.getElementById('addRequestModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.saveRequest = async function() {
    const dest = document.getElementById('reqDestination').value;
    const dep = document.getElementById('reqDeparture').value;
    const ret = document.getElementById('reqReturn').value;
    const desc = document.getElementById('reqDesc').value;
    const passStr = document.getElementById('reqPassengers').value;

    if(!dest || !dep || !ret) { 
        showReqAlert("Validation", "Please fill destination and dates.", false); 
        return; 
    }

    // Convert comma string to array
    const passengers = passStr.split(',').map(s => s.trim()).filter(s => s);

    const payload = {
        destination: dest,
        departure_time: new Date(dep).toISOString(),
        return_time: new Date(ret).toISOString(),
        description: desc,
        passengers: passengers
    };

    const btn = document.getElementById('btnSaveReq');
    btn.disabled = true; btn.innerText = "Sending...";

    try {
        const result = await window.fetchWithAuth('/requests', 'POST', payload);
        if (result && !result.detail) {
            window.closeModal('addRequestModal');
            await loadRequestsData();
            showReqAlert("Success", "Request submitted successfully.", true);
        } else {
            const err = result.detail ? JSON.stringify(result.detail) : "Failed";
            showReqAlert("Error", err, false);
        }
    } catch(e) { showReqAlert("Error", e.message, false); }
    btn.disabled = false; btn.innerText = "Submit Request";
}

// === VIEW / APPROVE MODAL ===

window.openViewRequestModal = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    // Populate Details
    const requester = r.requester ? r.requester.full_name : "Unknown";
    const service = r.requester && r.requester.service ? r.requester.service.service_name : "-";
    const passengers = r.passengers ? (Array.isArray(r.passengers) ? r.passengers.join(", ") : r.passengers) : "None";
    
    let rejectionHtml = '';
    if(r.status === 'denied' && r.rejection_reason) {
        rejectionHtml = `
            <div class="col-span-2 mt-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <span class="text-red-400 text-xs uppercase font-bold block mb-1">Rejection Reason</span>
                <p class="text-red-200 text-sm">${r.rejection_reason}</p>
            </div>`;
    }

    const content = `
        <div class="grid grid-cols-2 gap-y-4 gap-x-6">
            <div class="col-span-2 border-b border-slate-700 pb-3 mb-2 flex justify-between items-center">
                <div><div class="text-white font-bold text-lg">${requester}</div><div class="text-slate-500 text-xs">${service}</div></div>
                <div class="text-right"><div class="text-blue-400 font-mono text-sm">ID #${r.id}</div><div class="text-slate-500 text-xs uppercase">${r.status.replace(/_/g, ' ')}</div></div>
            </div>
            <div><span class="text-slate-500 text-xs uppercase block">Destination</span><span class="text-white">${r.destination}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Passengers</span><span class="text-white">${passengers}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Departure</span><span class="text-white">${new Date(r.departure_time).toLocaleString()}</span></div>
            <div><span class="text-slate-500 text-xs uppercase block">Return</span><span class="text-white">${new Date(r.return_time).toLocaleString()}</span></div>
            <div class="col-span-2"><span class="text-slate-500 text-xs uppercase block mb-1">Description</span><p class="text-slate-300 text-sm bg-slate-800 p-3 rounded-lg">${r.description || 'No description provided.'}</p></div>
            ${rejectionHtml}
        </div>`;
    
    document.getElementById('viewRequestContent').innerHTML = content;

    // Actions Footer Logic
    const footer = document.getElementById('approvalActionsFooter');
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
    // Allow Admin override at any stage (optional, removed to enforce flow)

    footer.innerHTML = buttons;
    document.getElementById('viewRequestModal').classList.remove('hidden');
}

function getApproveRejectButtons(id, label) {
    return `
        <button onclick="closeModal('viewRequestModal')" class="px-3 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
        <button onclick="openApprovalModal(${id}, 'reject')" class="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-medium rounded-lg flex items-center gap-2"><i data-lucide="x-circle" class="w-4 h-4"></i> Deny</button>
        <button onclick="openApprovalModal(${id}, 'approve')" class="px-4 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg flex items-center gap-2"><i data-lucide="check-circle" class="w-4 h-4"></i> Approve</button>
    `;
}

// === CONFIRM APPROVE/REJECT ===

window.openApprovalModal = function(id, type) {
    window.closeModal('viewRequestModal'); // Close view
    reqActionId = id;
    reqActionType = type;
    document.getElementById('approvalComment').value = "";
    
    const title = document.getElementById('approvalTitle');
    const btn = document.getElementById('btnExecuteApproval');
    
    if (type === 'approve') {
        title.innerText = "Confirm Approval";
        btn.innerText = "Approve";
        btn.className = "px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm w-full font-medium shadow-lg";
    } else {
        title.innerText = "Deny Request";
        btn.innerText = "Reject";
        btn.className = "px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm w-full font-medium shadow-lg";
    }
    document.getElementById('approvalModal').classList.remove('hidden');
}

async function submitApprovalDecision() {
    const comment = document.getElementById('approvalComment').value;
    const btn = document.getElementById('btnExecuteApproval');

    if (reqActionType === 'reject' && !comment.trim()) { alert("Please provide a reason."); return; }

    btn.disabled = true; btn.innerText = "Processing...";

    const statusMap = { 'approve': 'approved', 'reject': 'denied' };
    const payload = { status: statusMap[reqActionType], comments: comment };

    try {
        const result = await window.fetchWithAuth(`/approvals/${reqActionId}`, 'POST', payload);
        window.closeModal('approvalModal');
        if (result && !result.detail) {
            await loadRequestsData();
            showReqAlert("Success", `Request ${reqActionType}ed successfully.`, true);
        } else {
            showReqAlert("Error", result?.detail || "Action failed.", false);
        }
    } catch(e) {
        window.closeModal('approvalModal');
        showReqAlert("System Error", e.message, false);
    }
    btn.disabled = false;
}

// Helpers
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }
function showReqAlert(t, m, i) {
    const modal = document.getElementById('reqAlertModal');
    if(!modal) { alert(m); return; }
    document.getElementById('reqAlertTitle').innerText = t;
    document.getElementById('reqAlertMessage').innerText = m;
    const icon = document.getElementById('reqAlertIcon');
    icon.className = `w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${i?'bg-green-500/10 text-green-500':'bg-red-500/10 text-red-500'}`;
    icon.innerHTML = `<i data-lucide="${i?'check':'x'}" class="w-6 h-6"></i>`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}