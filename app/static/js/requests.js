/**
 * app/static/js/requests.js
 * 
 * Professional Fleet Management Request Module
 * Handles 4-step workflow, resource allocation, and mission order printing.
 */

// Global Module State
let allRequests = [];
let availableVehicles = [];
let activeDrivers = [];
let requestUserRole = 'user';
let requestUserMatricule = '';
let currentRequestId = null;

/**
 * Professional Element Getter
 * Ensures the SPA functions correctly on both Desktop and Mobile layout containers.
 */
function getReqEl(id) {
    // Priority 1: Mobile Container
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    // Priority 2: Desktop Container
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    
    // Fallback: Global Document
    return document.getElementById(id);
}

/**
 * Module Entry Point
 */
async function initRequests() {
    console.log("Fleet Requests: Initializing Professional System...");
    
    // Load Identity
    requestUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    requestUserMatricule = localStorage.getItem('user_matricule') || '';

    // UI Interactive Listeners
    const searchInput = getReqEl('requestSearch');
    const statusFilter = getReqEl('requestStatusFilter');
    
    if (searchInput) {
        searchInput.addEventListener('input', renderRequestsTable);
    }
    if (statusFilter) {
        statusFilter.addEventListener('change', renderRequestsTable);
    }

    // Synchronize initial dataset
    await loadRequestsData();
    
    // Authorization check for resource pre-loading
    const elevatedRoles = ['admin', 'superadmin', 'charoi', 'logistic', 'darh', 'chef'];
    if (elevatedRoles.includes(requestUserRole)) {
        await Promise.all([
            fetchAvailableVehicles(),
            fetchActiveDrivers()
        ]);
    }
}

// =================================================================
// 1. DATA SYNCHRONIZATION ENGINE
// =================================================================

async function loadRequestsData() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    // Loading State
    tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center">
        <div class="flex flex-col items-center justify-center gap-3">
            <i data-lucide="loader-2" class="w-8 h-8 animate-spin text-blue-500"></i>
            <span class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">${window.t('loading')}</span>
        </div>
    </td></tr>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/requests/?limit=1000');
        allRequests = Array.isArray(data) ? data : (data.items || []);
        renderRequestsTable();
    } catch (e) {
        console.error("Critical Sync Failure:", e);
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-500 font-black uppercase">Server Connection Error</td></tr>`;
    }
}

async function fetchAvailableVehicles() {
    try {
        const data = await window.fetchWithAuth('/vehicles/?limit=500');
        if (Array.isArray(data)) {
            availableVehicles = data.filter(v => v.status.toLowerCase() === 'available' || v.status.toLowerCase() === 'active');
        }
    } catch (err) { console.error("Vehicle pool error", err); }
}

async function fetchActiveDrivers() {
    try {
        const data = await window.fetchWithAuth('/requests/drivers');
        activeDrivers = Array.isArray(data) ? data : [];
    } catch (err) { console.error("Driver pool error", err); }
}

/**
 * Metric Helper: Calculate Trip Duration
 */
function calculateDuration(start, end) {
    const s = new Date(start);
    const e = new Date(end);
    const diffMs = e - s;
    if (isNaN(diffMs) || diffMs < 0) return "0d 0h";
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return `${days}j ${hrs}h`;
}

// =================================================================
// 2. UI RENDERING & WORKFLOW LOGIC
// =================================================================

function renderRequestsTable() {
    const tbody = getReqEl('requestsBody');
    if (!tbody) return;

    const searchValue = (getReqEl('requestSearch')?.value || '').toLowerCase();
    const filterValue = getReqEl('requestStatusFilter')?.value || 'all';

    let filtered = allRequests.filter(r => {
        const match = `${r.destination} ${r.requester?.full_name} ${r.requester?.matricule}`.toLowerCase();
        const matchesSearch = match.includes(searchValue);
        const matchesStatus = filterValue === 'all' || r.status === filterValue;
        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-600 font-bold uppercase tracking-widest">${window.t('no_records')}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(r => {
        const depDate = new Date(r.departure_time).toLocaleString(window.APP_LOCALE, {month:'short', day:'2-digit', hour:'2-digit', minute:'2-digit'});
        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/30 transition-all duration-300">
                <td class="p-5">
                    <div class="font-black text-white text-xs md:text-sm uppercase tracking-tight">${r.requester?.full_name || 'System User'}</div>
                    <div class="text-[9px] text-slate-500 font-mono tracking-tighter">${r.requester?.matricule || 'N/A'}</div>
                </td>
                <td class="p-5 text-xs md:text-sm text-slate-300 font-black">${r.destination}</td>
                <td class="p-5 text-[10px] md:text-xs text-slate-500 font-mono italic">${depDate}</td>
                <td class="p-5">${getStatusBadge(r.status)}</td>
                <td class="p-5">
                    ${r.vehicle ? `
                        <div class="text-blue-400 font-black text-[10px] uppercase tracking-widest">${r.vehicle.plate_number}</div>
                        <div class="text-[9px] text-slate-600 font-bold uppercase">${r.driver?.full_name || ''}</div>
                    ` : '<span class="text-slate-800 text-[9px] font-black uppercase italic tracking-widest">Unassigned</span>'}
                </td>
                <td class="p-5 text-right">
                    <div class="flex justify-end gap-1 md:gap-2">
                        <button onclick="viewRequestDetails(${r.id})" class="p-2 bg-slate-800 text-blue-400 rounded-xl border border-slate-700 hover:bg-blue-600 hover:text-white transition shadow-lg" title="View Dossier"><i data-lucide="eye" class="w-4 h-4"></i></button>
                        ${renderWorkflowActions(r)}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Handles professional logic for Workflow Buttons (Logic/DARH Edit Access)
 */
function renderWorkflowActions(r) {
    const role = requestUserRole;
    let html = '';
    const managementRoles = ['admin', 'superadmin', 'logistic', 'darh', 'charoi'];
    
    // Asset Override Button
    if (managementRoles.includes(role) && r.status !== 'fully_approved' && r.status !== 'denied') {
        html += `<button onclick="openAssignModal(${r.id})" class="p-2 bg-amber-600/20 text-amber-500 rounded-xl border border-amber-500/20 hover:bg-amber-600 hover:text-white transition shadow-sm" title="Edit Assets"><i data-lucide="edit-3" class="w-4 h-4"></i></button>`;
    }

    // Workflow Gatekeeper Steps
    if (role === 'chef' && r.status === 'pending') {
        html += `<button onclick="openApprovalModal(${r.id}, 'chef')" class="p-2 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="check-circle" class="w-4 h-4"></i></button>`;
    }
    if (role === 'charoi' && r.status === 'approved_by_chef' && r.vehicle_id) {
        html += `<button onclick="openApprovalModal(${r.id}, 'charoi')" class="p-2 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="user-check" class="w-4 h-4"></i></button>`;
    }
    if (role === 'logistic' && r.status === 'approved_by_charoi') {
        html += `<button onclick="openApprovalModal(${r.id}, 'logistic')" class="p-2 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/20 hover:bg-emerald-600 hover:text-white transition shadow-sm"><i data-lucide="clipboard-check" class="w-4 h-4"></i></button>`;
    }
    if (['darh', 'admin', 'superadmin'].includes(role) && r.status === 'approved_by_logistic') {
        html += `<button onclick="openApprovalModal(${r.id}, 'darh')" class="p-2 bg-purple-600 text-white rounded-xl hover:bg-purple-500 transition shadow-lg shadow-purple-900/20"><i data-lucide="shield-check" class="w-4 h-4"></i></button>`;
    }

    return html;
}

// =================================================================
// 3. PRINTING & DOCUMENT GENERATION
// =================================================================

window.printMissionOrder = async (id) => {
    const btn = event.currentTarget;
    const original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> GENERATING...`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const response = await fetch(`${API_BASE}/approvals/${id}/pdf`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        });
        
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.detail || "Document not ready.");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        
        // Use an anchor approach to bypass some popup blockers
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
        alert("Mission Order restricted: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = original;
        if(window.lucide) window.lucide.createIcons();
    }
};

// =================================================================
// 4. MODALS & FORMS
// =================================================================

/**
 * VIEW DOSSIER MODAL
 */
window.viewRequestDetails = function(id) {
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const duration = calculateDuration(r.departure_time, r.return_time);
    const canPrintRoles = ['admin', 'superadmin', 'darh', 'charoi', 'account', 'comptabilite'];
    const canPrint = canPrintRoles.includes(requestUserRole) && r.status === 'fully_approved';

    const content = `
        <div class="space-y-8 text-left">
            <div class="flex justify-between items-start border-b border-slate-800 pb-6">
                <div>
                    <h4 class="text-3xl font-black text-white uppercase tracking-tighter">${r.destination}</h4>
                    <p class="text-[9px] text-slate-500 uppercase font-black tracking-[0.2em] mt-2 italic">${r.description || 'Routine Fleet Mission'}</p>
                </div>
                ${getStatusBadge(r.status)}
            </div>

            <div class="grid grid-cols-2 gap-6">
                <div class="bg-slate-800/40 p-4 rounded-3xl border border-slate-700/50 text-center">
                    <span class="label-text">Departure Schedule</span>
                    <p class="text-white text-xs font-black tracking-tighter">${new Date(r.departure_time).toLocaleString()}</p>
                </div>
                <div class="bg-slate-800/40 p-4 rounded-3xl border border-slate-700/50 text-center">
                    <span class="label-text">Return Schedule</span>
                    <p class="text-white text-xs font-black tracking-tighter">${new Date(r.return_time).toLocaleString()}</p>
                </div>
            </div>

            <div class="bg-blue-600/10 border border-blue-500/20 p-4 rounded-[2rem] flex justify-between items-center px-8 shadow-inner">
                <span class="label-text">Calculated Span</span>
                <span class="text-blue-400 font-black text-sm uppercase tracking-widest underline decoration-2">${duration}</span>
            </div>

            <div class="bg-slate-950 p-6 rounded-[2.5rem] border border-slate-800 shadow-2xl">
                <span class="label-text mb-4 block text-center opacity-40">Officer Manifest</span>
                <div class="flex flex-wrap justify-center gap-2">
                    ${r.passengers.map(m => `<span class="bg-slate-800 px-4 py-2 rounded-xl text-xs text-slate-300 border border-slate-700 font-mono font-black shadow-sm tracking-tighter">${m}</span>`).join('')}
                </div>
            </div>

            ${r.vehicle ? `
            <div class="grid grid-cols-2 gap-4 p-5 bg-blue-500/5 border border-blue-500/10 rounded-[2.5rem]">
                <div class="text-center border-r border-white/5"><span class="label-text block mb-2">Fleet Unit</span><p class="text-blue-400 font-black text-xl uppercase tracking-widest">${r.vehicle.plate_number}</p></div>
                <div class="text-center"><span class="label-text block mb-2">Designated Operator</span><p class="text-white font-black text-sm uppercase">${r.driver?.full_name || 'N/A'}</p></div>
            </div>` : ''}

            <div class="flex flex-col md:flex-row justify-between items-center gap-6 pt-8 border-t border-slate-800">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-black text-blue-500">${r.requester?.full_name.charAt(0)}</div>
                    <div><span class="label-text block">Originator</span><p class="text-[10px] text-slate-300 font-bold uppercase">${r.requester?.full_name}</p></div>
                </div>
                ${canPrint ? `
                    <button onclick="printMissionOrder(${r.id})" class="flex items-center gap-3 bg-emerald-700 hover:bg-emerald-600 text-white px-8 py-4 rounded-[2rem] text-[10px] font-black tracking-[0.2em] transition-all shadow-xl active:scale-95 uppercase">
                        <i data-lucide="printer" class="w-5 h-5"></i> Print Document
                    </button>
                ` : ''}
            </div>
        </div>
    `;
    
    getReqEl('viewRequestContent').innerHTML = content;
    getReqEl('viewRequestModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

/**
 * MODAL: CREATE
 */
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
    if (res && !res.detail) {
        window.closeModal('addRequestModal');
        await loadRequestsData();
    } else {
        alert("System error: " + (res.detail || "Validation failure."));
    }
};

/**
 * MODAL: ALLOCATION / EDIT
 */
window.openAssignModal = (id) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;
    
    getReqEl('assignSummary').innerHTML = `
        <div class="bg-blue-600/10 border border-blue-500/20 p-4 rounded-3xl mb-8 text-center">
            <p class="text-blue-400 font-black uppercase text-sm tracking-[0.1em]">${r.destination}</p>
            <p class="text-slate-500 font-mono text-[9px] mt-2 uppercase">Scheduled: ${new Date(r.departure_time).toLocaleString()}</p>
        </div>
    `;

    // Dropdown population with auto-selection
    getReqEl('assignVehicle').innerHTML = `<option value="">-- UNASSIGNED --</option>` + availableVehicles.map(v => `<option value="${v.id}" ${r.vehicle_id == v.id ? 'selected':''}>${v.plate_number} [${v.make} ${v.model}]</option>`).join('');
    getReqEl('assignDriver').innerHTML = `<option value="">-- UNASSIGNED --</option>` + activeDrivers.map(d => `<option value="${d.id}" ${r.driver_id == d.id ? 'selected':''}>${d.full_name} (${d.matricule})</option>`).join('');
    
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
    if (res && !res.detail) { 
        window.closeModal('assignResourceModal'); 
        await loadRequestsData(); 
    }
};

/**
 * MODAL: DECISION (Professional Large Interface)
 */
window.openApprovalModal = (id, stage) => {
    currentRequestId = id;
    const r = allRequests.find(req => req.id === id);
    if (!r) return;

    const duration = calculateDuration(r.departure_time, r.return_time);
    getReqEl('approvalStageTitle').innerText = `${stage.toUpperCase()} Decision Protocol`;
    getReqEl('approvalComments').value = "";

    // 1. Fully Detailed Mission Summary
    getReqEl('approvalSummary').innerHTML = `
        <div class="text-left bg-slate-900/50 p-6 rounded-[2.5rem] border border-slate-800 mb-8 shadow-2xl space-y-6">
            <div class="flex justify-between items-start">
                <div>
                    <p class="text-white font-black text-lg tracking-tighter uppercase">${r.destination}</p>
                    <p class="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">${r.description || 'Tactical Mission'}</p>
                </div>
                <span class="text-[9px] bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-full font-black border border-blue-500/20 uppercase tracking-widest">${duration}</span>
            </div>
            
            <div class="grid grid-cols-2 gap-6 pt-4 border-t border-slate-800/50">
                <div><span class="label-text block mb-1">Departure</span><p class="text-slate-300 text-[10px] font-black">${new Date(r.departure_time).toLocaleString()}</p></div>
                <div><span class="label-text block mb-1">Return</span><p class="text-slate-300 text-[10px] font-black">${new Date(r.return_time).toLocaleString()}</p></div>
            </div>

            <div class="pt-4 border-t border-slate-800/50">
                <span class="label-text block mb-2 opacity-50">Staff Manifest</span>
                <p class="text-[11px] text-white font-mono leading-relaxed">${r.passengers.join(', ')}</p>
            </div>
        </div>
    `;

    // 2. Optional Resource Editing for Management
    const editRoles = ['admin', 'superadmin', 'logistic', 'darh'];
    const editBlock = getReqEl('approvalEditSection');

    if (editRoles.includes(requestUserRole)) {
        editBlock.classList.remove('hidden');
        getReqEl('approveVehicle').innerHTML = `<option value="">-- NO CHANGES --</option>` + availableVehicles.map(v => `<option value="${v.id}" ${r.vehicle_id == v.id ? 'selected':''}>${v.plate_number}</option>`).join('');
        getReqEl('approveDriver').innerHTML = `<option value="">-- NO CHANGES --</option>` + activeDrivers.map(d => `<option value="${d.id}" ${r.driver_id == d.id ? 'selected':''}>${d.full_name}</option>`).join('');
        getReqEl('approvePassengers').value = r.passengers.join(', ');
    } else {
        editBlock.classList.add('hidden');
    }

    getReqEl('approvalModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
};

window.submitDecision = async (decision) => {
    const elevated = ['admin', 'superadmin', 'logistic', 'darh'];
    
    // Process optional modifications before final approval
    if (elevated.includes(requestUserRole) && decision === 'approved') {
        const vInput = getReqEl('approveVehicle').value;
        const dInput = getReqEl('approveDriver').value;
        const pInput = getReqEl('approvePassengers').value;

        if (vInput || dInput || pInput) {
            const r = allRequests.find(req => req.id === currentRequestId);
            const updatePayload = {
                vehicle_id: vInput ? parseInt(vInput) : r.vehicle_id,
                driver_id: dInput ? parseInt(dInput) : r.driver_id,
                passengers: pInput ? pInput.split(',').map(m => m.trim()) : r.passengers
            };
            await window.fetchWithAuth(`/requests/${currentRequestId}/assign`, 'PUT', updatePayload);
        }
    }

    const payload = { status: decision, comments: getReqEl('approvalComments').value || "Processed via Management Console." };
    const res = await window.fetchWithAuth(`/approvals/${currentRequestId}`, 'POST', payload);
    
    if (res && !res.detail) { 
        window.closeModal('approvalModal'); 
        await loadRequestsData(); 
    }
};

function getStatusBadge(status) {
    const map = { 'pending': 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20', 'approved_by_chef': 'bg-blue-500/10 text-blue-400 border-blue-500/20', 'approved_by_charoi': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', 'approved_by_logistic': 'bg-purple-500/10 text-purple-400 border-purple-500/20', 'fully_approved': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', 'denied': 'bg-red-500/10 text-red-400 border-red-500/20' };
    const cls = map[status] || 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    return `<span class="px-3 py-1 rounded-full text-[9px] font-black border ${cls} uppercase tracking-tighter shadow-sm">${status.replace(/_/g, ' ')}</span>`;
}

window.closeModal = (id) => getReqEl(id).classList.add('hidden');
initRequests();