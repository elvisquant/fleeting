// app/static/js/users.js

let allUsers = [];
let dropdownsLoaded = false;
let dropdownOptions = { roles: [], agencies: [], services: [] };
let deleteTargetId = null;

// =================================================================
// MOBILE-COMPATIBLE ELEMENT GETTER
// =================================================================
function getUserEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

async function initUsers() {
    console.log("Users Module: Init");
    const searchInput = getUserEl('userSearch');
    const roleFilter = getUserEl('userRoleFilter');

    if(searchInput) searchInput.addEventListener('input', renderUsersTable);
    if(roleFilter) roleFilter.addEventListener('change', renderUsersTable);

    injectUserModals();
    await Promise.all([loadUsersData(), fetchDropdownData()]);
}

// 1. Fetch Data
async function loadUsersData() {
    const tbody = getUserEl('usersBody');
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
    const tbody = getUserEl('usersBody');
    if (!tbody) return;

    const search = getUserEl('userSearch');
    const roleFilter = getUserEl('userRoleFilter');
    
    const searchValue = search ? search.value.toLowerCase() : '';
    const roleFilterValue = roleFilter ? roleFilter.value : 'all';

    let filtered = allUsers.filter(u => {
        const matchesSearch = (
            (u.full_name || "").toLowerCase().includes(searchValue) || 
            (u.matricule || "").toLowerCase().includes(searchValue) || 
            (u.email || "").toLowerCase().includes(searchValue)
        );
        const roleName = u.role ? u.role.name.toLowerCase() : "unknown";
        const matchesRole = roleFilterValue === 'all' || roleName === roleFilterValue;
        return matchesSearch && matchesRole;
    });

    const countEl = getUserEl('usersCount');
    if (countEl) countEl.innerText = `${filtered.length} users found`;

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
                        <!-- DELETE DISABLED IN JS: Removed onclick and added disabled class/attribute -->
                        <button disabled class="p-1.5 bg-slate-800/50 text-slate-600 cursor-not-allowed rounded-md border border-slate-700" title="Delete Disabled">
                            <i data-lucide="trash-2" class="w-4 h-4"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    if(window.lucide) window.lucide.createIcons();
}

// === VIEW LOGIC ===
window.openViewUserModal = function(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    const content = `
        <div class="grid grid-cols-2 gap-x-4 gap-y-6 text-sm">
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Full Name</span><span class="text-white font-medium text-base">${user.full_name}</span></div>
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Matricule</span><span class="text-white font-mono bg-slate-800 px-2 py-0.5 rounded">${user.matricule}</span></div>
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Role</span><span class="text-blue-400 font-bold">${user.role ? user.role.name.toUpperCase() : 'N/A'}</span></div>
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Status</span><span class="${user.is_active ? 'text-green-400' : 'text-red-400'} font-medium">${user.is_active ? 'Active' : 'Inactive'}</span></div>
            <div class="col-span-2 border-t border-slate-700/50 pt-3"><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Email Address</span><span class="text-white break-all">${user.email}</span></div>
            <div class="col-span-2"><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Phone Number</span><span class="text-slate-300">${user.telephone || '-'}</span></div>
            <div class="col-span-2 border-t border-slate-700/50 pt-3"><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">Organization</span><div class="flex items-center gap-2"><span class="text-white font-medium">${user.agency ? user.agency.agency_name : '-'}</span> <span class="text-slate-600">/</span> <span class="text-slate-400">${user.service ? user.service.service_name : '-'}</span></div></div>
        </div>
    `;
    
    const viewContent = getUserEl('viewUserContent');
    if (viewContent) viewContent.innerHTML = content;
    const modal = getUserEl('viewUserModal');
    if (modal) modal.classList.remove('hidden');
}

window.openEditUserModal = function(id) {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    const editIdEl = getUserEl('editUserId');
    const nameEl = getUserEl('editUserName');
    const matriculeEl = getUserEl('editUserMatricule');
    const phoneEl = getUserEl('editUserPhone');
    const activeEl = getUserEl('editUserActive');
    
    if (editIdEl) editIdEl.value = user.id;
    if (nameEl) nameEl.value = user.full_name || '';
    if (matriculeEl) matriculeEl.value = user.matricule || '';
    if (phoneEl) phoneEl.value = user.telephone || "";
    if (activeEl) activeEl.checked = user.is_active;

    populateSelect('editUserRoleSelect', dropdownOptions.roles, user.role_id, 'name');
    populateSelect('editUserAgencySelect', dropdownOptions.agencies, user.agency_id, 'agency_name');
    populateSelect('editUserServiceSelect', dropdownOptions.services, user.service_id, 'service_name');

    const modal = getUserEl('editUserModal');
    if (modal) modal.classList.remove('hidden');
    if(window.lucide) window.lucide.createIcons();
}

window.closeModal = function(id) { 
    const modal = getUserEl(id) || document.getElementById(id);
    if (modal) modal.classList.add('hidden'); 
}

// FIX: Improved update logic to ensure service_id and agency_id work
window.saveUserChanges = async function() {
    const editIdEl = getUserEl('editUserId');
    const roleEl = getUserEl('editUserRoleSelect');
    const agencyEl = getUserEl('editUserAgencySelect');
    const serviceEl = getUserEl('editUserServiceSelect');
    const phoneEl = getUserEl('editUserPhone');
    const activeEl = getUserEl('editUserActive');
    const btn = getUserEl('btnSaveUser');
    
    if (!btn || !editIdEl.value) return;
    
    const id = editIdEl.value;

    // Helper to safely parse numbers (avoids NaN which breaks Pydantic)
    const safeParse = (val) => {
        const p = parseInt(val);
        return isNaN(p) ? null : p;
    };

    const payload = {
        role_id: safeParse(roleEl.value),
        agency_id: safeParse(agencyEl.value),
        service_id: safeParse(serviceEl.value),
        telephone: phoneEl ? phoneEl.value.trim() : '',
        is_active: activeEl ? activeEl.checked : false
    };

    // Clean payload: Remove nulls so we don't try to send null to required DB fields
    Object.keys(payload).forEach(key => payload[key] === null && delete payload[key]);

    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Saving...`;
    btn.disabled = true;

    try {
        const result = await window.fetchWithAuth(`/users/${id}`, 'PUT', payload);
        
        if (result && !result.detail) {
            // Update local state immediately so UI refreshes
            const idx = allUsers.findIndex(u => u.id == id);
            if (idx !== -1) allUsers[idx] = result;
            
            window.closeModal('editUserModal');
            renderUsersTable();
        } else {
            const msg = result && result.detail ? JSON.stringify(result.detail) : "Unknown error";
            alert("Update Failed:\n" + msg);
        }
    } catch (e) {
        alert("System Error: " + e.message);
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
        if(window.lucide) window.lucide.createIcons();
    }
}

// DELETE DISABLED: Logic commented out to prevent execution
window.confirmDeleteUser = function(id) {
    console.warn("Delete functionality is currently disabled.");
    alert("User deletion is disabled for security reasons.");
    return false;
}

async function performDelete() {
    return false; // Action disabled
}

function populateSelect(elementId, items, selectedValue, labelKey) {
    const el = getUserEl(elementId);
    if (!el) return;
    if(!items || items.length === 0) { 
        el.innerHTML = '<option value="">No options</option>'; 
        return; 
    }
    el.innerHTML = items.map(item => {
        const isSelected = item.id == selectedValue ? 'selected' : '';
        const label = item[labelKey] || item.name || item.id; 
        return `<option value="${item.id}" ${isSelected}>${label}</option>`;
    }).join('');
}

function injectUserModals() {
    const existingModal = getUserEl('editUserModal') || document.getElementById('editUserModal');
    if(existingModal) return;

    const modalHTML = `
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
    <div id="viewUserModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-up">
            <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <h3 class="text-lg font-bold text-white">User Details</h3>
                <button onclick="closeModal('viewUserModal')" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="p-6" id="viewUserContent"></div>
            <div class="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end"><button onclick="closeModal('viewUserModal')" class="btn-secondary">Close</button></div>
        </div>
    </div>
    <style>
        .label-text { display: block; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 0.25rem; }
        .input-field { width: 100%; background: #1e293b; border: 1px solid #334155; color: white; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; }
        .input-disabled { width: 100%; background: #0f172a; border: 1px solid #1e293b; color: #94a3b8; border-radius: 0.5rem; padding: 0.5rem 0.75rem; font-size: 0.875rem; cursor: not-allowed; }
        .btn-primary { background: #2563eb; color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; display: flex; align-items: center; }
        .btn-secondary { background: transparent; border: 1px solid #334155; color: #94a3b8; padding: 0.5rem 1rem; border-radius: 0.5rem; }
    </style>
    `;
    
    const container = document.createElement('div');
    container.innerHTML = modalHTML;
    document.body.appendChild(container);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUsers);
} else {
    initUsers();
}