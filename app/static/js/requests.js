// app/static/js/requests.js

// Global State Management
let allRequests = [];
let availableVehicles = [];
let activeDrivers = [];
let requestUserRole = 'user';
let requestUserMatricule = '';
let currentRequestId = null;

/**
 * Professional Element Getter
 * Ensures compatibility between Desktop and Mobile SPA containers
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
    console.log("Requests Module: Professional Init");
    requestUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    requestUserMatricule = localStorage.getItem('user_matricule') || '';

    // Event Listeners for search and filtering
    const searchInput = getReqEl('requestSearch');
    const statusFilter = getReqEl('requestStatusFilter');
    if (searchInput) searchInput.addEventListener('input', renderRequestsTable);
    if (statusFilter) statusFilter.addEventListener('change', renderRequestsTable);

    // Initial Data Load
    await loadRequestsData();
    
    // Fetch resource pools for assignment/editing roles
    const elevatedRoles = ['admin', 'superadmin', 'charoi', 'logistic', 'darh'];
    if (elevatedRoles.includes(requestUserRole)) {
        await Promise.all([
            fetchAvailableVehicles(),
            fetchActiveDrivers()
        ]);
    }
}

// =================================================================
// 1. DATA OPERATIONS
// =================================================================

async function loadRequestsData() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500">
        <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>
        <div class="text-xs uppercase tracking-widest">${window.t('loading')}</div>
    </td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000');
        allRequests = Array.isArray(data) ? data : (data.items || []);
        renderRequestsTable();
    } catch (e) {
        console.error("Critical Load Error:", e);
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500 italic">Failed to synchronize with server.</td></tr>`;
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
// 2. TABLE RENDERING & UI GENERATION
// =================================================================

function renderRequestsTable() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    const searchValue = (getReqEl('requestSearch')?.value || '').toLowerCase();
    const filterValue = getReqEl('requestStatusFilter')?.value || 'all';

    let filtered = allRequests.filter(r => {
        const searchPool = `${r.destination} ${r.requester?.full_name} ${r.requester?.matricule}`.toLowerCase();
        const matchesSearch = searchPool.includes(searchValue);
        const matchesStatus = filterValue === 'all' || r.status === filterValue;
        return matchesSearch && matchesStatus;
    });

    const countEl = getReqEl('requestsCount');
    if (countEl) countEl.innerText = `${filtered.length} missions found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-600 italic">${window.t('no_records')}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const depTime = new Date(r.departure_time).toLocaleString(window.APP_LOCALE, {month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'});
        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-all duration-200">
                <td class="p-4">
                    <div class="font-bold text-white text-sm">${r.requester?.full_name || 'System'}</div>
                    <div class="text-[10px] text-slate-500 font-mono tracking-tighter">${r.requester?.matricule || 'N/A'}</div>
                </td>
                <td class="p-4">
                    <div class="flex items-center gap-2 text-sm text-slate-300 font-semibold">
                        <i data-lucide="map-pin" class="w-3.5 h-3.5 text-blue-500"></i> ${r.destination}
                    </div>
                </td>
                <td class="p-4 text-[11px] text-slate-400 font-medium">${depTime}</td>
                <td class="p-4">${getStatusBadge(r.status)}</td>
                <td class="p-4">
                    ${r.vehicle ? `
                        <div class="text-blue-400 font-extrabold text-[11px] tracking-wide uppercase">${r.vehicle.plate_number}</div>
                        <div class="text-[10px] text-slate-500 truncate max-w-[100px]">${r.driver?.full_name || ''}</div>
                    ` : '<span class="text-slate-800 text-[10px] uppercase font-black italic">Awaiting Fleet</span>'}
                </td>
                <td class="p-4 text-right">
                    <div class="flex justify-end gap-2">
                        <button onclick="viewRequestDetails(${r.id})" class="p-1.5 bg-slate-800 text-blue-400 rounded-lg border border-slate-700 hover:bg-blue-600 hover:text-white transition shadow-sm" title="View Dossier">
                            <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                        ${renderWorkflowActions(r)}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Handles professional logic for Edit, Assign, and Approval buttons
 */
function renderWorkflowActions(r) {
    const role = requestUserRole;
    let html = '';

    // Logic: Admin, DARH, Logistic, and Charoi can EDIT/ASSIGN at any non-final stage
    const editingRoles = ['admin', 'superadmin', 'logistic', 'darh', 'charoi'];
    if (editingRoles.includes(role) && r.status !== 'fully_approved' && r.status !== 'denied') {
        html += `<button onclick="openAssignModal(${r.id})" class="p-1.5 bg-amber-600/20 text-amber-500 rounded-lg border border-amber-500/20 hover:bg-amber-600 hover:text-white transition shadow-sm" title="Modify Resources">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
        </button>`;
    }

    // Step 1: Chef Service Approval
    if (role === 'chef' && r.status === 'pending') {
        html += `<button onclick="openApprovalModal(${r.id}, 'chef')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm" title="Chef Approval">
            <i data-lucide="check-circle" class="w-4 h-4"></i>
        </button>`;
    }

    // Step 2: Charoi Confirmation (Only if vehicle is set)
    if (role === 'charoi' && r.status === 'approved_by_chef' && r.vehicle_id) {
        html += `<button onclick="openApprovalModal(${r.id}, 'charoi')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm" title="Charoi Validation">
            <i data-lucide="user-check" class="w-4 h-4"></i>
        </button>`;
    }

    // Step 3: Logistic Approval
    if (role === 'logistic' && r.status === 'approved_by_charoi') {
        html += `<button onclick="openApprovalModal(${r.id}, 'logistic')" class="p-1.5 bg-emerald-600/20 text-emerald-400 rounded-lg border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm" title="Logistic Approval">
            <i data-lucide="clipboard-check" class="w-4 h-4"></i>
        </button>`;
    }

    // Step 4: DARH Final Validation
    if (['darh', 'admin', 'superadmin'].includes(role) && r.status === 'approved_by_logistic') {
        html += `<button onclick="openApprovalModal(${r.id}, 'darh')" class="p-1.5 bg-purple-600 text-white rounded-lg hover:bg-purple-500 transition shadow-lg shadow-purple-900/20" title="Final Validation">
            <i data-lucide="shield-check" class="w-4 h-4"></i>
        </button>`;
    }

    return html;
}

// =================================================================
// 3. PRINTING & PDF LOGIC
// =================================================================

window.printMissionOrder = async (id) => {
    const btn = event.currentTarget;
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> PREPARING...`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const response = await fetch(`${API_BASE}/approvals/${id}/pdf`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        });
        
        if (!response.ok) throw new Error("Document unavailable.");
        
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const printWindow = window.open(url, '_blank');
        
        if (!printWindow) alert("Pop-up blocked! Please allow pop-ups for this site.");
        else printWindow.focus();
    } catch (e) {
        console.error(e);
        alert("Mission Order document could not be generated at this time.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalContent;
        if(window.lucide) window.lucide.createIcons();
    }
};

// =================================================================
// 4. MODAL VIEW / ACTIONS
// =================================================================

window.viewRequestDetails = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    // Permissions logic for Printing
    const printingRoles = ['admin', 'superadmin', 'darh', 'charoi', 'account', 'comptabilite', 'accountant'];
    const canPrint = printingRoles.includes(requestUserRole);
    const isReady = r.status === 'fully_approved';

    let printAction = '';
    if (canPrint && isReady) {
        printAction = `
            <button onclick="printMissionOrder(${r.id})" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-black transition-all shadow-lg shadow-emerald-900/20 active:scale-95">
                <i data-lucide="printer" class="w-4 h-4"></i> PRINT MISSION ORDER
            </button>
        `;
    }

    const content = `
        <div class="space-y-8">
            <div class="flex justify-between items-start border-b border-slate-800 pb-6">
                <div>
                    <h4 class="text-3xl font-black text-white tracking-tight">${r.destination}</h4>
                    <p class="text-slate-400 text-sm mt-1 font-medium">${r.description || 'Routine mission request.'}</p>
                </div>
                ${getStatusBadge(r.status)}
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div class="space-y-6">
                    <div><span class="label-text">DEPARTURE SCHEDULE</span><p class="text-white text-lg font-bold">${new Date(r.departure_time).toLocaleString()}</p></div>
                    <div><span class="label-text">ESTIMATED RETURN</span><p class="text-white text-lg font-bold">${new Date(r.return_time).toLocaleString()}</p></div>
                </div>
                <div class="space-y-6">
                    <div><span class="label-text">MISSION ORIGINATOR</span><p class="text-white font-semibold">${r.requester?.full_name} <span class="text-slate-500 font-mono text-xs ml-2">[${r.requester?.matricule}]</span></p></div>
                    <div><span class="label-text">SYSTEM LOG</span><p class="text-slate-500 text-xs">Request ID: #${r.id} • Created: ${new Date(r.created_at).toLocaleString()}</p></div>
                </div>
            </div>

            <div class="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 shadow-inner">
                <span class="label-text mb-3 block">PASSENGER MANIFEST (${r.passengers.length})</span>
                <div class="flex flex-wrap gap-2">
                    ${r.passengers.map(m => `<span class="bg-slate-800 px-3 py-1.5 rounded-lg text-xs text-slate-300 border border-slate-700 font-mono font-bold tracking-tight">${m}</span>`).join('')}
                </div>
            </div>

            ${r.vehicle ? `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-5 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center gap-4">
                    <div class="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-400"><i data-lucide="car" class="w-6 h-6"></i></div>
                    <div><span class="label-text block">VEHICLE UNIT</span><p class="text-white font-black text-lg">${r.vehicle.plate_number}</p></div>
                </div>
                <div class="p-5 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl flex items-center gap-4">
                    <div class="w-12 h-12 bg-emerald-600/20 rounded-xl flex items-center justify-center text-emerald-400"><i data-lucide="user" class="w-6 h-6"></i></div>
                    <div><span class="label-text block">ASSIGNED DRIVER</span><p class="text-white font-black text-lg">${r.driver?.full_name || 'N/A'}</p></div>
                </div>
            </div>
            ` : ''}

            <div class="flex flex-col md:flex-row justify-between items-center gap-4 pt-6 border-t border-slate-800">
                <div class="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Security clearance level: ${requestUserRole}</div>
                ${printAction}
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
        alert("Action Required: Mandatory fields (Destination/Time) cannot be empty.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin mr-2"></i> PROCESSING...`;

    try {
        const res = await window.fetchWithAuth('/requests/', 'POST', payload);
        if (res && !res.detail) {
            window.closeModal('addRequestModal');
            await loadRequestsData();
        } else {
            alert("Error: " + (res.detail || "Submission failed."));
        }
    } catch (e) { console.error(e); }
    
    btn.disabled = false;
    btn.innerHTML = originalText;
    if (window.lucide) window.lucide.createIcons();
};

/**
 * Professional Resource Assignment / Editing
 */
window.openAssignModal = (id) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    getReqEl('assignSummary').innerHTML = `
        <div class="bg-blue-600/10 border border-blue-500/20 p-4 rounded-xl mb-6 flex justify-between items-center">
            <div>
                <p class="text-blue-400 font-black text-sm uppercase tracking-wide">${r.destination}</p>
                <p class="text-slate-400 text-[10px] mt-1 font-mono tracking-tighter"><i data-lucide="calendar" class="w-3 h-3 inline mr-1"></i> ${new Date(r.departure_time).toLocaleString()} — ${new Date(r.return_time).toLocaleString()}</p>
            </div>
            <div class="text-[9px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-bold">REQ #${r.id}</div>
        </div>
    `;

    const vSelect = getReqEl('assignVehicle');
    const dSelect = getReqEl('assignDriver');

    vSelect.innerHTML = `<option value="">-- UNASSIGNED --</option>` + 
        availableVehicles.map(v => `<option value="${v.id}" ${r.vehicle_id === v.id ? 'selected':''}>${v.plate_number} [${v.make} ${v.model}]</option>`).join('');
    
    dSelect.innerHTML = `<option value="">-- UNASSIGNED --</option>` + 
        activeDrivers.map(d => `<option value="${d.id}" ${r.driver_id === d.id ? 'selected':''}>${d.full_name} (${d.matricule})</option>`).join('');

    getReqEl('assignPassengers').value = r.passengers.join(', ');
    getReqEl('assignResourceModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

window.submitAssignment = async () => {
    const vId = getReqEl('assignVehicle').value;
    const dId = getReqEl('assignDriver').value;

    if (!vId || !dId) {
        alert("Fleet Protocol: Both a Vehicle and a Driver must be allocated.");
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
 * 4-Step Approval logic with context
 */
window.openApprovalModal = (id, stage) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    getReqEl('approvalStageTitle').innerText = `${stage.toUpperCase()} DECISION`;
    getReqEl('approvalComments').value = "";

    getReqEl('approvalSummary').innerHTML = `
        <div class="text-left bg-slate-800/80 p-4 rounded-xl border border-slate-700 mb-6 shadow-inner">
            <div class="flex justify-between items-start mb-3">
                <span class="text-white font-black text-sm uppercase tracking-wider">${r.destination}</span>
                <span class="text-[9px] bg-slate-700 px-2 py-1 rounded-lg text-slate-400 font-bold uppercase">${r.status.replace(/_/g, ' ')}</span>
            </div>
            <div class="grid grid-cols-1 gap-1 text-[10px] font-medium text-slate-500">
                <p><i data-lucide="clock" class="w-3 h-3 inline mr-1"></i> Scheduled: ${new Date(r.departure_time).toLocaleString()}</p>
                <p><i data-lucide="user-plus" class="w-3 h-3 inline mr-1"></i> Requested by: ${r.requester?.full_name}</p>
            </div>
        </div>
    `;

    getReqEl('approvalModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

window.submitDecision = async (decision) => {
    const comments = getReqEl('approvalComments').value || "Processed via fleet dashboard.";
    const payload = { status: decision, comments: comments };

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
    return `<span class="px-2.5 py-1 rounded-full text-[10px] font-black border ${cls} uppercase tracking-tighter">${status.replace(/_/g, ' ')}</span>`;
}

window.closeModal = function(id) {
    const modal = getReqEl(id);
    if (modal) modal.classList.add('hidden');
};

// Auto-bootstrap
initRequests();