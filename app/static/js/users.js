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

    // Inject Modals HTML dynamically
    injectUserModals();

    await Promise.all([loadUsersData(), fetchDropdownData()]);
}

// 1. Fetch Data
async function loadUsersData() {
    const tbody = getUserEl('usersBody');
    if(!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>${window.t('msg_loading')}</td></tr>`;
    if(window.lucide) window.lucide.createIcons();

    try {
        const data = await window.fetchWithAuth('/users'); 
        
        if (Array.isArray(data)) {
            allUsers = data;
            renderUsersTable();
        } else {
            const msg = data && data.detail ? data.detail : "Failed to load users.";
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">${window.t('title_error')}: ${msg}</td></tr>`;
        }
    } catch(e) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400">${window.t('msg_connection_fail')}</td></tr>`;
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
    if (countEl) countEl.innerText = `${filtered.length} ${window.t('users')}`;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-slate-500">${window.t('msg_no_records')}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const statusClass = u.is_active ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20' : 'text-red-400 bg-red-400/10 border-red-400/20';
        const statusText = u.is_active ? window.t('status_active') : window.t('status_inactive');
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
                        ${statusText}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <div class="flex items-center justify-end gap-2">
                        <button onclick="openViewUserModal(${u.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="${window.t('view')}">
                            <i data-lucide="eye" class="w-4 h-4"></i>
                        </button>
                        <button onclick="openEditUserModal(${u.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="${window.t('edit')}">
                            <i data-lucide="edit-2" class="w-4 h-4"></i>
                        </button>
                        <button onclick="confirmDeleteUser(${u.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="${window.t('delete')}">
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

    const statusClass = user.is_active ? 'text-green-400' : 'text-red-400';
    const statusText = user.is_active ? window.t('status_active') : window.t('status_inactive');

    const content = `
        <div class="grid grid-cols-2 gap-x-4 gap-y-6 text-sm">
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">${window.t('lbl_full_name')}</span><span class="text-white font-medium text-base">${user.full_name}</span></div>
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">${window.t('col_matricule')}</span><span class="text-white font-mono bg-slate-800 px-2 py-0.5 rounded">${user.matricule}</span></div>
            
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">${window.t('col_role')}</span><span class="text-blue-400 font-bold">${user.role ? user.role.name.toUpperCase() : 'N/A'}</span></div>
            <div><span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">${window.t('col_status')}</span><span class="${statusClass} font-medium">${statusText}</span></div>
            
            <div class="col-span-2 border-t border-slate-700/50 pt-3">
                <span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">${window.t('lbl_email')}</span>
                <span class="text-white break-all">${user.email}</span>
            </div>
            
            <div class="col-span-2">
                <span class="text-slate-500 text-xs uppercase tracking-wide block mb-1">${window.t('col_phone')}</span>
                <span class="text-slate-300">${user.telephone || '-'}</span>
            </div>

            <div class="col-span-2 border-t border-slate-700/50 pt-3">
                <span class="text-slate-500 text-[10px] uppercase tracking-wide block mb-1">${window.t('col_agency')} / ${window.t('col_service')}</span>
                <div class="flex items-center gap-2">
                    <span class="text-white font-medium">${user.agency ? user.agency.agency_name : '-'}</span> 
                    <span class="text-slate-600">/</span> 
                    <span class="text-slate-400">${user.service ? user.service.service_name : '-'}</span>
                </div>
            </div>
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

window.closeEditUserModal = function() { 
    const modal = getUserEl('editUserModal');
    if (modal) modal.classList.add('hidden'); 
}

window.closeModal = function(id) { 
    const modal = getUserEl(id) || document.getElementById(id);
    if (modal) modal.classList.add('hidden'); 
}

window.saveUserChanges = async function() {
    const editIdEl = getUserEl('editUserId');
    const roleEl = getUserEl('editUserRoleSelect');
    const agencyEl = getUserEl('editUserAgencySelect');
    const serviceEl = getUserEl('editUserServiceSelect');
    const phoneEl = getUserEl('editUserPhone');
    const activeEl = getUserEl('editUserActive');
    const btn = getUserEl('btnSaveUser');
    
    if (!btn) return;
    
    const id = editIdEl ? editIdEl.value : '';
    const roleId = roleEl ? roleEl.value : '';
    const agencyId = agencyEl ? agencyEl.value : '';
    const serviceId = serviceEl ? serviceEl.value : '';
    const phone = phoneEl ? phoneEl.value : '';
    const isActive = activeEl ? activeEl.checked : false;

    const payload = {
        role_id: parseInt(roleId),
        agency_id: parseInt(agencyId),
        service_id: parseInt(serviceId),
        telephone: phone,
        is_active: isActive
    };

    const originalText = btn.innerHTML;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('loading')}`;
    btn.disabled = true;
    if(window.lucide) window.lucide.createIcons();

    try {
        const result = await window.fetchWithAuth(`/users/${id}`, 'PUT', payload);
        if (result && !result.detail) {
            window.closeModal('editUserModal');
            await loadUsersData();
            alert(window.t('msg_user_updated')); // Or use proper alert if available
        } else {
            const msg = result && result.detail ? JSON.stringify(result.detail) : "Unknown error";
            alert(`${window.t('title_error')}: ${msg}`);
        }
    } catch (e) {
        alert(`${window.t('title_error')}: ${e.message}`);
    }

    btn.innerHTML = originalText;
    btn.disabled = false;
    if(window.lucide) window.lucide.createIcons();
}

window.confirmDeleteUser = function(id) {
    deleteTargetId = id;
    
    const titleEl = getUserEl('confirmTitle');
    const messageEl = getUserEl('confirmMessage');
    const btn = getUserEl('btnConfirmAction');
    const modal = getUserEl('confirmModal');
    
    if (!modal) return;
    
    if (titleEl) titleEl.innerText = window.t('delete');
    if (messageEl) messageEl.innerText = window.t('msg_confirm_delete');
    
    if (btn) {
        btn.onclick = performDelete;
        btn.innerHTML = window.t('btn_confirm');
        btn.className = "btn-danger w-full"; 
    }
    
    modal.classList.remove('hidden');
}

async function performDelete() {
    if(!deleteTargetId) return;
    
    const btn = getUserEl('btnConfirmAction');
    if (!btn) return;
    
    btn.innerHTML = window.t('loading');
    btn.disabled = true;

    try {
        const result = await window.fetchWithAuth(`/users/${deleteTargetId}`, 'DELETE');
        window.closeModal('confirmModal');
        if (result !== null) {
            await loadUsersData();
            alert(window.t('msg_user_deleted'));
        } else {
            alert(window.t('title_error'));
        }
    } catch(e) {
        window.closeModal('confirmModal');
        alert(`${window.t('title_error')}: ${e.message}`);
    }
    
    btn.disabled = false;
    deleteTargetId = null;
}

function populateSelect(elementId, items, selectedValue, labelKey) {
    const el = getUserEl(elementId);
    if (!el) return;
    if(!items || items.length === 0) { 
        el.innerHTML = '<option disabled>No options</option>'; 
        return; 
    }
    el.innerHTML = items.map(item => {
        const isSelected = item.id === selectedValue ? 'selected' : '';
        const label = item[labelKey] || item.name || item.id; 
        return `<option value="${item.id}" ${isSelected}>${label}</option>`;
    }).join('');
}

// Helper to inject modals dynamically
function injectUserModals() {
    const existingModal = getUserEl('editUserModal') || document.getElementById('editUserModal');
    if(existingModal) return; 

    // USING window.t() HERE FOR DYNAMIC LABELS
    const modalHTML = `
    <!-- 1. EDIT USER MODAL -->
    <div id="editUserModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-up">
            <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <h3 class="text-lg font-bold text-white">${window.t('edit')}</h3>
                <button onclick="closeModal('editUserModal')" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="p-6 space-y-5">
                <input type="hidden" id="editUserId">
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="label-text">${window.t('lbl_full_name')}</label><input type="text" id="editUserName" disabled class="input-disabled"></div>
                    <div><label class="label-text">${window.t('col_matricule')}</label><input type="text" id="editUserMatricule" disabled class="input-disabled"></div>
                </div>
                <div><label class="label-text text-blue-400">${window.t('lbl_system_role')}</label><select id="editUserRoleSelect" class="input-field"></select></div>
                <div class="grid grid-cols-2 gap-4">
                    <div><label class="label-text">${window.t('col_agency')}</label><select id="editUserAgencySelect" class="input-field"></select></div>
                    <div><label class="label-text">${window.t('col_service')}</label><select id="editUserServiceSelect" class="input-field"></select></div>
                </div>
                <div><label class="label-text">${window.t('col_phone')}</label><input type="text" id="editUserPhone" class="input-field"></div>
                <div class="flex items-center justify-between bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                    <label class="text-sm font-medium text-white">${window.t('lbl_account_active')}</label>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="editUserActive" class="sr-only peer">
                        <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                </div>
            </div>
            <div class="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end gap-3">
                <button onclick="closeModal('editUserModal')" class="btn-secondary">${window.t('btn_cancel')}</button>
                <button id="btnSaveUser" onclick="saveUserChanges()" class="btn-primary"><i data-lucide="save" class="w-4 h-4 mr-2"></i> ${window.t('btn_save')}</button>
            </div>
        </div>
    </div>

    <!-- 2. VIEW USER MODAL -->
    <div id="viewUserModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-up">
            <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                <h3 class="text-lg font-bold text-white">${window.t('col_user_details')}</h3>
                <button onclick="closeModal('viewUserModal')" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
            </div>
            <div class="p-6" id="viewUserContent"></div>
            <div class="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end">
                <button onclick="closeModal('viewUserModal')" class="btn-secondary">${window.t('btn_close')}</button>
            </div>
        </div>
    </div>

    <!-- 3. CONFIRM MODAL -->
    <div id="confirmModal" class="fixed inset-0 z-[60] hidden bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
        <div class="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl shadow-2xl p-6 text-center animate-up">
            <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 text-red-500"><i data-lucide="alert-triangle" class="w-6 h-6"></i></div>
            <h3 class="text-lg font-bold text-white mb-2" id="confirmTitle">${window.t('btn_confirm')}</h3>
            <p class="text-slate-400 text-sm mb-6" id="confirmMessage">${window.t('msg_confirm_delete')}</p>
            <div class="flex gap-3 justify-center">
                <button onclick="closeModal('confirmModal')" class="btn-secondary w-full">${window.t('btn_cancel')}</button>
                <button id="btnConfirmAction" class="btn-danger w-full">${window.t('btn_confirm')}</button>
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

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUsers);
} else {
    initUsers();
}