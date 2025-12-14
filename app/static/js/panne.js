// app/static/js/panne.js

let allPannes = [];
let panneOptions = { vehicles: [], cats: [] };
let panneUserRole = 'user';
let panneActionType = null;
let panneActionId = null;

async function initPanne() {
    console.log("Panne Module: Init");
    panneUserRole = (localStorage.getItem('user_role') || 'user').toLowerCase();
    
    const search = document.getElementById('panneSearch');
    const vFilter = document.getElementById('panneVehicleFilter');
    const sFilter = document.getElementById('panneStatusFilter');
    
    if(search) search.addEventListener('input', renderPanneTable);
    if(vFilter) vFilter.addEventListener('change', renderPanneTable);
    if(sFilter) sFilter.addEventListener('change', renderPanneTable);
    
    const confirmBtn = document.getElementById('btnPanneConfirmAction');
    if(confirmBtn) confirmBtn.addEventListener('click', executePanneConfirmAction);
    
    await Promise.all([loadPanneData(), fetchPanneDropdowns()]);
}

async function loadPanneData() {
    const tbody = document.getElementById('panneLogsBody');
    if(!tbody) return;
    tbody.innerHTML = `<tr><td colspan="6" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading reports...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    const data = await window.fetchWithAuth('/panne'); 
    const items = data.items || data; 
    
    if (Array.isArray(items)) {
        allPannes = items;
        renderPanneTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load data.";
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchPanneDropdowns() {
    try {
        // FIX: Removed '/api/v1' prefix
        const [vehicles, cats] = await Promise.all([
            window.fetchWithAuth('/vehicles?limit=1000'),
            window.fetchWithAuth('/category_panne') 
        ]);
        panneOptions.vehicles = Array.isArray(vehicles) ? vehicles : [];
        panneOptions.cats = Array.isArray(cats) ? cats : [];
        
        populateSelect('panneVehicleFilter', panneOptions.vehicles, '', 'plate_number', 'All Vehicles');
    } catch(e) { console.warn("Panne Dropdown Error:", e); }
}

function renderPanneTable() {
    const tbody = document.getElementById('panneLogsBody');
    if(!tbody) return;

    const search = document.getElementById('panneSearch').value.toLowerCase();
    const vFilter = document.getElementById('panneVehicleFilter').value;
    const sFilter = document.getElementById('panneStatusFilter').value;

    let filtered = allPannes.filter(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const plate = vehicle ? vehicle.plate_number.toLowerCase() : "";
        const desc = log.description ? log.description.toLowerCase() : "";
        const matchesSearch = plate.includes(search) || desc.includes(search);
        const matchesVehicle = vFilter === "" || log.vehicle_id == vFilter;
        let matchesStatus = true;
        if (sFilter === 'verified') matchesStatus = log.is_verified === true;
        if (sFilter === 'pending') matchesStatus = log.is_verified !== true;
        return matchesSearch && matchesVehicle && matchesStatus;
    });

    document.getElementById('panneCount').innerText = `${filtered.length} records found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500">No records found.</td></tr>`;
        return;
    }

    const canManage = ['admin', 'superadmin', 'charoi'].includes(panneUserRole);

    tbody.innerHTML = filtered.map(log => {
        const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
        const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
        const plate = vehicle ? vehicle.plate_number : log.vehicle_id;
        const catName = cat ? cat.panne_name : '-';
        const date = new Date(log.panne_date).toLocaleDateString();
        const statusBadge = log.is_verified 
            ? `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-green-500/10 text-green-400 border border-green-500/20">Verified</span>`
            : `<span class="px-2 py-1 rounded text-[10px] uppercase font-bold bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">Pending</span>`;

        let actions = '';
        const viewBtn = `<button onclick="openViewPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition"><i data-lucide="eye" class="w-4 h-4"></i></button>`;

        if(log.is_verified) {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}<span class="text-slate-600 cursor-not-allowed" title="Locked"><i data-lucide="lock" class="w-4 h-4"></i></span></div>`;
        } else if (canManage) {
             actions = `
                <div class="flex items-center justify-end gap-2">
                    ${viewBtn}
                    <button onclick="reqPanneVerify(${log.id})" class="p-1.5 bg-slate-800 text-green-400 hover:bg-green-600 hover:text-white rounded-md transition"><i data-lucide="check-circle" class="w-4 h-4"></i></button>
                    <button onclick="openEditPanneModal(${log.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition"><i data-lucide="edit-2" class="w-4 h-4"></i></button>
                    <button onclick="reqPanneDelete(${log.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>`;
        } else {
             actions = `<div class="flex items-center justify-end gap-2">${viewBtn}</div>`;
        }

        return `
            <tr class="hover:bg-white/5 border-b border-slate-700/30">
                <td class="p-4 font-mono text-white">${plate}</td>
                <td class="p-4 text-slate-400">${catName}</td>
                <td class="p-4 text-slate-300 text-xs truncate max-w-[200px]">${log.description}</td>
                <td class="p-4">${statusBadge}</td>
                <td class="p-4 text-slate-500 text-xs">${date}</td>
                <td class="p-4 text-right flex justify-end gap-2">${actions}</td>
            </tr>`;
    }).join('');
    if(window.lucide) window.lucide.createIcons();
}

window.reqPanneVerify = function(id) {
    panneActionType = 'verify'; panneActionId = id;
    showPanneConfirmModal("Verify?", "Lock this report?", "check-circle", "bg-green-600");
}
window.reqPanneDelete = function(id) {
    panneActionType = 'delete'; panneActionId = id;
    showPanneConfirmModal("Delete?", "Permanently remove?", "trash-2", "bg-red-600");
}

async function executePanneConfirmAction() {
    if(!panneActionId) return;
    const btn = document.getElementById('btnPanneConfirmAction');
    btn.disabled = true; btn.innerText = "Processing...";

    try {
        let result;
        if (panneActionType === 'delete') result = await window.fetchWithAuth(`/panne/${panneActionId}`, 'DELETE');
        if (panneActionType === 'verify') result = await window.fetchWithAuth(`/panne/${panneActionId}`, 'PUT', { is_verified: true });

        window.closeModal('panneConfirmModal');
        if (result !== null) await loadPanneData();
        else alert("Action failed.");
    } catch(e) {
        window.closeModal('panneConfirmModal');
        alert("Error: " + e.message);
    }
    btn.disabled = false; btn.innerText = "Confirm"; panneActionId = null;
}

window.openAddPanneModal = function() {
    document.getElementById('panneEditId').value = "";
    document.getElementById('panneModalTitle').innerText = "Report Breakdown";
    document.getElementById('btnSavePanne').innerHTML = `<i data-lucide="plus" class="w-4 h-4"></i> Save`;
    populateSelect('panneVehicleSelect', panneOptions.vehicles, '', 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, '', 'panne_name', 'Select Category');
    document.getElementById('panneDesc').value = "";
    document.getElementById('panneDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.openEditPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if(!log) return;
    document.getElementById('panneEditId').value = log.id;
    document.getElementById('panneModalTitle').innerText = "Edit Report";
    document.getElementById('btnSavePanne').innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Update`;
    populateSelect('panneVehicleSelect', panneOptions.vehicles, log.vehicle_id, 'plate_number', 'Select Vehicle');
    populateSelect('panneCatSelect', panneOptions.cats, log.category_panne_id, 'panne_name', 'Category');
    document.getElementById('panneDesc').value = log.description;
    document.getElementById('panneDate').value = log.panne_date.split('T')[0];
    document.getElementById('addPanneModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.savePanne = async function() {
    const id = document.getElementById('panneEditId').value;
    const vId = document.getElementById('panneVehicleSelect').value;
    const catId = document.getElementById('panneCatSelect').value;
    const desc = document.getElementById('panneDesc').value;
    const date = document.getElementById('panneDate').value;
    if(!vId || !catId || !date) { alert("Please fill required fields."); return; }
    const payload = {
        vehicle_id: parseInt(vId),
        category_panne_id: parseInt(catId),
        description: desc,
        panne_date: new Date(date).toISOString()
    };
    const btn = document.getElementById('btnSavePanne');
    btn.disabled = true; btn.innerHTML = "Saving...";
    try {
        let result;
        if(id) result = await window.fetchWithAuth(`/panne/${id}`, 'PUT', payload);
        else result = await window.fetchWithAuth('/panne', 'POST', payload);
        if(result && !result.detail) {
            window.closeModal('addPanneModal');
            await loadPanneData();
        } else { alert("Error: " + (result?.detail || "Failed")); }
    } catch(e) { alert("System Error: " + e.message); }
    btn.disabled = false;
}

window.openViewPanneModal = function(id) {
    const log = allPannes.find(l => l.id === id);
    if (!log) return;
    const vehicle = panneOptions.vehicles.find(v => v.id === log.vehicle_id);
    const cat = panneOptions.cats.find(c => c.id === log.category_panne_id);
    const content = `
        <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
                <div><span class="text-slate-500 text-xs uppercase block">Vehicle</span><span class="text-white font-mono">${vehicle ? vehicle.plate_number : log.vehicle_id}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">Category</span><span class="text-white">${cat ? cat.panne_name : '-'}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">Date</span><span class="text-white">${new Date(log.panne_date).toLocaleDateString()}</span></div>
                <div><span class="text-slate-500 text-xs uppercase block">Status</span><span class="text-blue-400 uppercase font-bold text-xs">${log.status}</span></div>
            </div>
            <div class="border-t border-slate-700 pt-3">
                <span class="text-slate-500 text-xs uppercase block mb-1">Description</span>
                <p class="text-slate-300 text-sm bg-slate-800 p-3 rounded-lg">${log.description || 'No description provided.'}</p>
            </div>
        </div>`;
    document.getElementById('viewPanneContent').innerHTML = content;
    document.getElementById('viewPanneModal').classList.remove('hidden');
}

window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }
function showPanneConfirmModal(t, m, i, c) {
    const modal = document.getElementById('panneConfirmModal');
    if(!modal) return;
    document.getElementById('panneConfirmTitle').innerText = t;
    document.getElementById('panneConfirmMessage').innerText = m;
    const btn = document.getElementById('btnPanneConfirmAction');
    btn.className = `px-4 py-2 text-white rounded-lg text-sm w-full font-medium ${c}`;
    modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}
function populateSelect(id, list, sel, label, def) {
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = `<option value="">${def}</option>` + list.map(i => `<option value="${i.id}" ${i.id==sel?'selected':''}>${i[label]||i.name}</option>`).join('');
}