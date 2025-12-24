let allRequests = [];
let availableVehicles = [];
let availableDrivers = [];
let reqUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();

async function initRequests() {
    await loadRequestsData();
    await loadResources();
}

async function loadRequestsData() {
    const data = await window.fetchWithAuth('/requests/?limit=1000');
    allRequests = Array.isArray(data) ? data : (data.items || []);
    renderReqTable();
}

async function loadResources() {
    if (!['admin', 'superadmin', 'charoi'].includes(reqUserRole)) return;
    const [vData, dData] = await Promise.all([
        window.fetchWithAuth('/vehicles/?limit=1000'),
        window.fetchWithAuth('/requests/drivers')
    ]);
    const vehicles = Array.isArray(vData) ? vData : (vData.items || []);
    // FIX: Only show Active vehicles and strip model if empty
    availableVehicles = vehicles.filter(v => v.status === 'active' || v.status === 'available');
    availableDrivers = dData;
}

function renderReqTable() {
    const tbody = document.getElementById('reqLogsBody');
    if (!tbody) return;

    tbody.innerHTML = allRequests.map(r => {
        // Real-time Status Mapping for Requester
        const statusConfig = {
            'pending': { label: 'Waiting: Chef', color: 'bg-amber-500/10 text-amber-500', bar: '25%' },
            'approved_by_chef': { label: 'Waiting: Logistics', color: 'bg-blue-500/10 text-blue-500', bar: '50%' },
            'approved_by_logistic': { label: 'Waiting: Assignment', color: 'bg-indigo-500/10 text-indigo-500', bar: '75%' },
            'fully_approved': { label: 'Mission Approved', color: 'bg-emerald-500/10 text-emerald-500', bar: '100%' },
            'denied': { label: 'Rejected', color: 'bg-red-500/10 text-red-500', bar: '100%' }
        };
        const st = statusConfig[r.status] || { label: r.status, color: 'text-slate-400', bar: '0%' };

        return `
            <tr class="hover:bg-white/[0.02] border-b border-slate-700/50 transition">
                <td class="p-4 font-medium text-white">${r.requester?.full_name || 'User'}</td>
                <td class="p-4 text-slate-300 font-mono text-xs">${r.destination}</td>
                <td class="p-4 text-slate-400 text-xs">${new Date(r.departure_time).toLocaleString()}</td>
                <td class="p-4">
                    <div class="w-16 bg-slate-800 h-1 rounded-full mb-1"><div class="${st.color.split(' ')[1].replace('text', 'bg')} h-full" style="width: ${st.bar}"></div></div>
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${st.color}">${st.label}</span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="openViewModal(${r.id})" class="p-2 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg transition"><i data-lucide="eye" class="w-4 h-4"></i></button>
                </td>
            </tr>`;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

window.openViewModal = function(id) {
    const r = allRequests.find(req => req.id === id);
    const isAssigned = r.vehicle_id && r.driver_id;
    const isFinalStep = (['admin', 'charoi', 'superadmin'].includes(reqUserRole) && r.status === 'approved_by_logistic');

    let footer = `<button onclick="closeModal('viewModal')" class="px-4 py-2 text-slate-400 text-sm">Close</button>`;

    if (isFinalStep) {
        if (!isAssigned) {
            footer = `<span class="text-[10px] text-red-400 font-bold italic mr-4">Assignment Required for Approval</span>` + footer;
            footer = `<button onclick="openAssignModal(${r.id})" class="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold mr-auto">Assign Resources</button>` + footer;
        } else {
            footer = `<button onclick="openDecisionModal(${r.id}, 'approve')" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold ml-2">Approve</button>` + footer;
        }
    } else if ((reqUserRole === 'chef' && r.status === 'pending') || (reqUserRole === 'logistic' && r.status === 'approved_by_chef')) {
        footer = `<button onclick="openDecisionModal(${r.id}, 'approve')" class="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold ml-2">Approve</button>` + footer;
    }

    document.getElementById('viewContent').innerHTML = `
        <div class="space-y-4">
            <div class="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                <p class="text-[10px] text-slate-500 uppercase font-bold">Vehicle / Driver</p>
                <p class="text-sm ${isAssigned ? 'text-emerald-400' : 'text-red-400/50'} font-mono mt-1">${r.vehicle ? r.vehicle.plate_number : 'None Assigned'} / ${r.driver ? r.driver.full_name : 'None Assigned'}</p>
            </div>
            <p class="text-slate-300 text-sm leading-relaxed italic">"${r.description || 'No description provided.'}"</p>
        </div>`;
    
    document.getElementById('viewFooter').innerHTML = footer;
    document.getElementById('viewModal').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
}

window.openAssignModal = function(id) {
    document.getElementById('assignId').value = id;
    const vSel = document.getElementById('assignVehicle');
    // CLEANED: Only Plate and Model (if exists)
    vSel.innerHTML = availableVehicles.map(v => `<option value="${v.id}">${v.plate_number} ${v.vehicle_model?.model_name || ''}</option>`).join('');
    const dSel = document.getElementById('assignDriver');
    dSel.innerHTML = availableDrivers.map(d => `<option value="${d.id}">${d.full_name}</option>`).join('');
    document.getElementById('assignModal').classList.remove('hidden');
}

async function submitAssign() {
    const id = document.getElementById('assignId').value;
    const payload = { vehicle_id: parseInt(document.getElementById('assignVehicle').value), driver_id: parseInt(document.getElementById('assignDriver').value) };
    await window.fetchWithAuth(`/requests/${id}/assign`, 'PUT', payload);
    document.getElementById('assignModal').classList.add('hidden');
    await loadRequestsData();
    openViewModal(parseInt(id)); // Return to view
}

function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.addEventListener('DOMContentLoaded', initRequests);