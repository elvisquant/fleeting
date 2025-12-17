// app/static/js/users.js

let allUsers = [];
let dropdownsLoaded = false;
let dropdownOptions = { roles: [], agencies: [], services: [] };
let deleteTargetId = null;

async function initUsers() {
    console.log("Users Module: Init");
    const searchInput = document.getElementById('userSearch');
    const roleFilter = document.getElementById('userRoleFilter');

    if(searchInput) searchInput.addEventListener('input', renderUsersTable);
    if(roleFilter) roleFilter.addEventListener('change', renderUsersTable);

    // Inject Modals HTML dynamically if not present
    injectUserModals();

    await Promise.all([loadUsersData(), fetchDropdownData()]);
}

// 1. Fetch Data
async function loadUsersData() {
    const tbody = document.getElementById('usersBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>Loading users...</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    const data = await window.fetchWithAuth('/users'); 
    
    if (Array.isArray(data)) {
        allUsers = data;
        renderUsersTable();
    } else {
        const msg = data && data.detail ? data.detail : "Failed to load users.";
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">Error: ${msg}</td></tr>`;
    }
}

async function fetchDropdownData() {
    if(dropdownsLoaded) return;
    try {
        const [roles, agencies, services] = await Promise.all([
            window.fetchWithAuth('/roles/'),
            window.fetchWithAuth('/agencies/'),
            window.fetchWithAuth('/services/')
        ]);

        if(Array.isArray(roles)) dropdownOptions.roles = roles;
        if(Array.isArray(agencies)) dropdownOptions.agencies = agencies;
        if(Array.isArray(services)) dropdownOptions.services = services;
        dropdownsLoaded = true;
    } catch (e) {
        console.warn("Dropdown load error:", e);
    }
}

// 2. Render Table
function renderUsersTable() {
    const tbody = document.getElementById('usersBody');
    if (!tbody) return;

    const search = document.getElementById('userSearch').value.toLowerCase();
    const roleFilter = document.getElementById('userRoleFilter').value;

    let filtered = allUsers.filter(u => {
        const matchesSearch = (
            (u.full_name || "").toLowerCase().includes(search) || 
            (u.matricule || "").toLowerCase().includes(search) || 
            (u.email || "").toLowerCase().includes(search)
        );
        const roleName = u.role ? u.role.name.toLowerCase() : "unknown";
        const matchesRole = roleFilter === 'all' || roleName === roleFilter;
        return matchesSearch && matchesRole;
    });

    document.getElementById('usersCount').innerText = `${filtered.length} users found`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500">No users found.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const statusClass = u.is_active ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20';
        const roleName = u.role ? u.role.name.toUpperCase() : 'N/A';
        const agencyName = u.agency ? u.agency.agency_name : '-';
        const serviceName = u.service ? u.service.service_name : '-';
        const initial = u.full_name ? u.full_name.charAt(0).toUpperCase() : '?';

        return `
            <tr class="hover:bg-white/5 transition border-b border-slate-700/30 group">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-bold text-white shadow-inner border border-slate-600">
                            ${initial}
                        </div>
                        <div>
                            <div class="font-medium text-white">${u.full_name || "Unknown"}</div>
                            <div class="text-xs text-slate-500">${u.matricule || "No ID"}</div>
                        </div>
                    </div>
                </td>
                <td class="p-4"><span class="text-[10px] font-bold tracking-wider bg-slate-800 text-slate-300 px-2 py-1 rounded border border-slate-600">${roleName}</span></td>
                <td class="p-4 text-xs text-slate-400">
                    <div class="text-slate-300 font-medium">${agencyName}</div>
                    <div class="text-slate-500">${serviceName}</div>
                </td>
                <td class="p-4">
                    <span class="px-2 py-1 rounded-full text-xs font-medium border ${statusClass}">
                        ${u.is_active ? 'Active' : 'Inactive'}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="openViewUserModal(${u.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="View Details">
                            <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                        <button onclick="openEditUserModal(${u.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="Edit User">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                        <button onclick="confirmDeleteUser(${u.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="Delete User">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// === VIEW LOGIC (Fixed Layout) ===
window.openViewUserModal = function(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    const content = `
        <div class="grid grid-cols-2 gap-x-4 gap-y-6 text-sm">
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Full Name</span><span class="text-white font-medium text-base">${user.full_name}</span></div>
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Matricule</span><span class="text-white font-mono bg-slate-800 px-2 py-0.5 rounded">${user.matricule}</span></div>
            
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Role</span><span class="text-blue-400 font-bold">${user.role ? user.role.name.toUpperCase() : 'N/A'}</span></div>
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Status</span><span class="${user.is_active ? 'text-green-400' : 'text-red-400'} font-medium">${user.is_active ? 'Active' : 'Inactive'}</span></div>
            
            <!-- FIXED: Email spans full width to prevent overlap -->
            <div class="col-span-2 border-t border-slate-700/50 pt-3">
                <span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Email Address</span>
                <span class="text-white break-all">${user.email}</span>
            </div>
            
            <div class="col-span-2">
                <span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Phone Number</span>
                <span class="text-slate-300">${user.telephone || '-'}</span>
            </div>

            <div class="col-span-2 border-t border-slate-700/50 pt-3">
                <span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Organization</span>
                <div class="flex items-center gap-2">
                    <span class="text-white font-medium">${user.agency ? user.agency.agency_name : '-'}</span> 
                    <span class="text-slate-600">/</span> 
                    <span class="text-slate-400">${user.service ? user.service.service_name : '-'}</span>
                </div>
            </div>
        </div>
    `;
    
    document.getElementById('viewUserContent').innerHTML = content;
    document.getElementById('viewUserModal').classList.remove('hidden');
}

// ... (Rest of logic: Edit, Save, Delete remains the same as previous) ...
// === COPY THE REST OF THE PREVIOUS users.js FILE HERE ===
// (openEditUserModal, saveUserChanges, deleteUser, populateSelect, injectUserModals)

window.openEditUserModal = function(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUserName').value = user.full_name;
    document.getElementById('editUserMatricule').value = user.matricule;
    document.getElementById('editUserPhone').value = user.telephone || "";

    populateSelect('editUserRoleSelect', dropdownOptions.roles, user.role_id, 'name');
    populateSelect('editUserAgencySelect', dropdownOptions.agencies, user.agency_id, 'agency_name');
    populateSelect('editUserServiceSelect', dropdownOptions.services, user.service_id, 'service_name');

    document.getElementById('editUserActive').checked = user.is_active;
    document.getElementById('editUserModal').classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.closeEditUserModal = function() { document.getElementById('editUserModal').classList.add('hidden'); }
window.closeModal = function(id) { document.getElementById(id).classList.add('hidden'); }

window.saveUserChanges = async function() {
    const id = document.getElementById('editUserId').value;
    const roleId = document.getElementById('editUserRoleSelect').value;
    const agencyId = document.getElementById('editUserAgencySelect').value;
    const serviceId = document.getElementById('editUserServiceSelect').value;
    const phone = document.getElementById('editUserPhone').value;
    const isActive = document.getElementById('editUserActive').checked;

    const payload = {
        role_id: parseInt(roleId),
        agency_id: parseInt(agencyId),
        service_id: parseInt(serviceId),
        telephone: phone,
        is_active: isActive
    };

    const btn = document.getElementById('btnSaveUser');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
    btn.disabled = true;
    if(window.lucide) window.lucide.createIcons();

    try {
        const result = await window.fetchWithAuth(`/users/${id}`, 'PUT', payload);
        if (result && !result.detail) {
            window.closeModal('editUserModal');
            await loadUsersData();
            // Optional success feedback
        } else {
            const msg = result && result.detail ? JSON.stringify(result.detail) : "Unknown error";
            alert("Update Failed:\n" + msg);
        }
    } catch (e) {
        alert("System Error: " + e.message);
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
    if(window.lucide) window.lucide.createIcons();
}

window.confirmDeleteUser = function(id) {
    deleteTargetId = id;
    document.getElementById('confirmTitle').innerText = "Delete User?";
    document.getElementById('confirmMessage').innerText = "This action cannot be undone. Are you sure?";
    
    const btn = document.getElementById('btnConfirmAction');
    btn.onclick = performDelete;
    btn.innerHTML = "Delete";
    btn.className = "btn-danger w-full"; 
    
    document.getElementById('confirmModal').classList.remove('hidden');
}

async function performDelete() {
    if(!deleteTargetId) return;
    const btn = document.getElementById('btnConfirmAction');
    btn.innerHTML = "Deleting...";
    btn.disabled = true;

    try {
        const result = await window.fetchWithAuth(`/users/${deleteTargetId}`, 'DELETE');
        window.closeModal('confirmModal');
        if (result !== null) await loadUsersData();
        else alert("Failed to delete user.");
    } catch(e) {
        window.closeModal('confirmModal');
        alert("Error: " + e.message);
    }
    
    btn.disabled = false;
    deleteTargetId = null;
}

function populateSelect(elementId, items, selectedValue, labelKey) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if(!items || items.length === 0) { el.innerHTML = '<option disabled>No options</option>'; return; }
    el.innerHTML = items.map(item => {
        const isSelected = item.id === selectedValue ? 'selected' : '';
        const label = item[labelKey] || item.name || item.id; 
        return `<option value="${item.id}" ${isSelected}>${label}</option>`;
    }).join('');
}

// Helper to inject modals dynamically so users.html stays clean
function injectUserModals() {
    if(document.getElementById('editUserModal')) return; // Already injected

    const modalHTML = `
    <!-- 1. EDIT USER MODAL -->
    <div id="editUserModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-up">
            <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <h3 class="text-lg font-bold text-white">Edit User Profile</h3>
                <button onclick="closeModal('editUserModal')" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="p-6 space-y-5">
                <input type="hidden" id="editUserId">
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="label-text">Full Name</label><input type="text" id="editUserName" disabled class="input-disabled"></div>
                    <div><label class="label-text">Matricule</label><input type="text" id="editUserMatricule" disabled class="input-disabled"></div>
                </div>
                <div><label class="label-text text-blue-400">System Role</label><select id="editUserRoleSelect" class="input-field"></select></div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="label-text">Agency</label><select id="editUserAgencySelect" class="input-field"></select></div>
                    <div><label class="label-text">Service</label><select id="editUserServiceSelect" class="input-field"></select></div>
                </div>
                <div><label class="label-text">Phone</label><input type="text" id="editUserPhone" class="input-field"></div>
                <div class="flex items-center justify-between bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                    <label class="text-sm font-medium text-white">Account Active</label>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="editUserActive" class="sr-only peer">
                        <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
            </div>
            <div class="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end gap-3">
                <button onclick="closeModal('editUserModal')" class="btn-secondary">Cancel</button>
                <button id="btnSaveUser" onclick="saveUserChanges()" class="btn-primary"><i data-lucide="save" class="w-4 h-4 mr-2"></i> Save Changes</button>
            </div>
        </div>
    </div>

    <!-- 2. VIEW USER MODAL -->
    <div id="viewUserModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-up">
            <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <h3 class="text-lg font-bold text-white">User Details</h3>
                <button onclick="closeModal('viewUserModal')" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="p-6" id="viewUserContent"></div>
            <div class="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end">
                <button onclick="closeModal('viewUserModal')" class="btn-secondary">Close</button>
            </div>
        </div>
    </div>

    <!-- 3. CONFIRM MODAL -->
    <div id="confirmModal" class="fixed inset-0 z-[60] hidden bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl shadow-2xl p-6 text-center animate-up">
            <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 text-red-500"><i data-lucide="alert-triangle" class="w-6 h-6"></i></div>
            <h3 class="text-lg font-bold text-white mb-2" id="confirmTitle">Confirm</h3>
            <p class="text-slate-400 text-sm mb-6" id="confirmMessage">Are you sure?</p>
            <div class="flex gap-3 justify-center">
                <button onclick="closeModal('confirmModal')" class="btn-secondary w-full">Cancel</button>
                <button id="btnConfirmAction" class="btn-danger w-full">Confirm</button>
            </div>
        </div>
    </div>
    
    <style>
        .label-text { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 0.25rem; }
        .input-field { width: 100%; background: #1e293b; border: 1px solid #334155; color: white; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input-field:focus { border-color: #3b82f6; }
        .input-disabled { width: 100%; background: #0f172a; border: 1px solid #1e293b; color: #94a3b8; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; cursor: not-allowed; }
        .btn-primary { background: #2563eb; color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.875rem; transition: background 0.2s; display: flex; align-items: center; justify-content: center; }
        .btn-primary:hover { background: #1d4ed8; }
        .btn-secondary { background: transparent; border: 1px solid #334155; color: #94a3b8; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.875rem; transition: all 0.2s; }
        .btn-secondary:hover { border-color: #94a3b8; color: white; }
        .btn-danger { background: #ef4444; color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; font-size: 0.875rem; transition: background 0.2s; }
        .btn-danger:hover { background: #dc2626; }
    </style>
    `;
    
    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container);
}