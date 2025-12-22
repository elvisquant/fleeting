// static/js/users.js
(function() {
    'use strict';
    
    /**
     * ==============================================================================
     * FLEETDASH USERS MODULE (Multi-Language)
     * Handles user management, role assignment, and user CRUD operations.
     * ==============================================================================
     */

    // =================================================================
    // MOBILE-COMPATIBLE ELEMENT GETTER
    // =================================================================
    function getUserEl(id) {
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
    // GLOBAL STATE
    // =================================================================
    let allUsers = [];
    let dropdownsLoaded = false;
    let dropdownOptions = { roles: [], agencies: [], services: [] };
    let deleteTargetId = null;

    // =================================================================
    // 1. INITIALIZATION (Called by router when #users is loaded)
    // =================================================================

    function initUsers() {
        console.log("Users Module: Initializing...");
        
        // Check for required globals
        if (typeof window.fetchWithAuth !== 'function') {
            console.error('fetchWithAuth not available');
            return;
        }
        
        if (typeof window.t !== 'function') {
            console.error('Translation function t() not available');
            return;
        }

        // Inject modals HTML dynamically
        injectUserModals();

        // Attach event listeners
        attachUsersListeners();

        // Load initial data
        loadInitialUsersData();

        // Set theme icon if exists
        setUserThemeIcon();

        // Create icons
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        console.log("Users module initialized");
    }

    // Attach all event listeners for users module
    function attachUsersListeners() {
        // Table filters
        const searchInput = getUserEl('userSearch');
        const roleFilter = getUserEl('userRoleFilter');
        
        if (searchInput) searchInput.addEventListener('input', renderUsersTable);
        if (roleFilter) roleFilter.addEventListener('change', renderUsersTable);

        // Save button
        const saveBtn = getUserEl('btnSaveUser');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveUserChanges);
        }

        // Confirm action button
        const confirmBtn = getUserEl('btnConfirmAction');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', performDelete);
        }

        // Modal close buttons
        const closeButtons = document.querySelectorAll('[data-close-modal]');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', function() {
                const modalId = this.getAttribute('data-close-modal');
                closeUserModal(modalId);
            });
        });

        // Theme toggle (if exists in users module)
        const themeToggle = getUserEl('theme-toggle-header');
        if (themeToggle) {
            themeToggle.addEventListener('click', toggleUserTheme);
        }
    }

    // =================================================================
    // 2. UTILITY FUNCTIONS
    // =================================================================

    function setUserThemeIcon() {
        const themeToggleButtonHeader = getUserEl('theme-toggle-header');
        if (!themeToggleButtonHeader) return;

        if (document.documentElement.classList.contains('dark')) {
            themeToggleButtonHeader.innerHTML = '<i data-lucide="sun" class="w-5 h-5"></i>';
        } else {
            themeToggleButtonHeader.innerHTML = '<i data-lucide="moon" class="w-5 h-5"></i>';
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    function toggleUserTheme() {
        document.documentElement.classList.toggle('dark');
        setUserThemeIcon();
        renderUsersTable(); // Re-render table to update theme colors
    }

    function showUserToast(message, duration = 3000, type = 'info') {
        const container = getUserEl('toast-container') || getUserEl('user-toast-container');
        if (!container) {
            console.log(`${type}: ${message}`);
            return;
        }

        const toastElement = document.createElement('div');
        toastElement.textContent = message;
        toastElement.className = `px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-up ${type === 'error' ? 'bg-red-500' :
                type === 'success' ? 'bg-green-500' : 'bg-blue-500'
            }`;
        container.appendChild(toastElement);
        setTimeout(() => {
            toastElement.style.opacity = '0';
            setTimeout(() => {
                if (toastElement.parentNode) toastElement.parentNode.removeChild(toastElement);
            }, 300);
        }, duration);
    }

    function closeUserModal(modalId) {
        const modal = getUserEl(modalId);
        if (modal) modal.classList.add('hidden');
    }

    function populateSelect(elementId, items, selectedValue, labelKey) {
        const el = getUserEl(elementId);
        if (!el) return;
        if (!items || items.length === 0) { 
            el.innerHTML = '<option disabled>No options</option>'; 
            return; 
        }
        el.innerHTML = items.map(item => {
            const isSelected = item.id === selectedValue ? 'selected' : '';
            const label = item[labelKey] || item.name || item.id; 
            return `<option value="${item.id}" ${isSelected}>${label}</option>`;
        }).join('');
    }

    // =================================================================
    // 3. DATA LOADING
    // =================================================================

    async function loadInitialUsersData() {
        await Promise.all([loadUsersData(), fetchDropdownData()]);
    }

    async function loadUsersData() {
        const tbody = getUserEl('usersBody');
        if (!tbody) return;
        
        tbody.innerHTML = `<tr><td colspan="5" class="p-12 text-center text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-500"></i>${window.t('msg_loading')}</td></tr>`;
        
        if (window.lucide) window.lucide.createIcons();

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
        if (dropdownsLoaded) return;
        try {
            const [roles, agencies, services] = await Promise.all([
                window.fetchWithAuth('/roles/'),
                window.fetchWithAuth('/agencies/'),
                window.fetchWithAuth('/services/')
            ]);

            if (Array.isArray(roles)) dropdownOptions.roles = roles;
            if (Array.isArray(agencies)) dropdownOptions.agencies = agencies;
            if (Array.isArray(services)) dropdownOptions.services = services;
            dropdownsLoaded = true;
        } catch (e) {
            console.warn("Dropdown load error:", e);
        }
    }

    // =================================================================
    // 4. TABLE RENDERING
    // =================================================================

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
                            <button onclick="window.usersModule.openViewUserModal(${u.id})" class="p-1.5 bg-slate-800 text-blue-400 hover:bg-blue-600 hover:text-white rounded-md transition" title="${window.t('view')}">
                                <i data-lucide="eye" class="w-4 h-4"></i>
                            </button>
                            <button onclick="window.usersModule.openEditUserModal(${u.id})" class="p-1.5 bg-slate-800 text-yellow-400 hover:bg-yellow-600 hover:text-white rounded-md transition" title="${window.t('edit')}">
                                <i data-lucide="edit-2" class="w-4 h-4"></i>
                            </button>
                            <button onclick="window.usersModule.confirmDeleteUser(${u.id})" class="p-1.5 bg-slate-800 text-red-400 hover:bg-red-600 hover:text-white rounded-md transition" title="${window.t('delete')}">
                                <i data-lucide="trash-2" class="w-4 h-4"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 5. MODAL OPERATIONS (View/Edit)
    // =================================================================

    function openViewUserModal(id) {
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
        
        if (window.lucide) window.lucide.createIcons();
    }

    function openEditUserModal(id) {
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
        
        if (window.lucide) window.lucide.createIcons();
    }

    async function saveUserChanges() {
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

        // Validation
        if (!roleId) {
            showUserToast(window.t('msg_validation_role'), 3000, 'error');
            return;
        }

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
        
        if (window.lucide) window.lucide.createIcons();

        try {
            const result = await window.fetchWithAuth(`/users/${id}`, 'PUT', payload);
            if (result && !result.detail) {
                closeUserModal('editUserModal');
                await loadUsersData();
                showUserToast(window.t('msg_user_updated'), 3000, 'success');
            } else {
                const msg = result && result.detail ? JSON.stringify(result.detail) : window.t('msg_operation_failed');
                showUserToast(`${window.t('title_error')}: ${msg}`, 5000, 'error');
            }
        } catch (e) {
            showUserToast(`${window.t('title_error')}: ${e.message}`, 5000, 'error');
        }

        btn.innerHTML = originalText;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 6. DELETE OPERATIONS
    // =================================================================

    function confirmDeleteUser(id) {
        deleteTargetId = id;
        
        const titleEl = getUserEl('confirmTitle');
        const messageEl = getUserEl('confirmMessage');
        const btn = getUserEl('btnConfirmAction');
        const modal = getUserEl('confirmModal');
        
        if (!modal) return;
        
        if (titleEl) titleEl.innerText = window.t('delete');
        if (messageEl) messageEl.innerText = window.t('msg_confirm_delete');
        
        if (btn) {
            btn.innerHTML = window.t('btn_confirm');
            btn.className = "btn-danger w-full"; 
        }
        
        modal.classList.remove('hidden');
        
        if (window.lucide) window.lucide.createIcons();
    }

    async function performDelete() {
        if (!deleteTargetId) return;
        
        const btn = getUserEl('btnConfirmAction');
        if (!btn) return;
        
        const originalText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> ${window.t('loading')}`;
        btn.disabled = true;

        try {
            const result = await window.fetchWithAuth(`/users/${deleteTargetId}`, 'DELETE');
            closeUserModal('confirmModal');
            if (result !== null) {
                await loadUsersData();
                showUserToast(window.t('msg_user_deleted'), 3000, 'success');
            } else {
                showUserToast(window.t('title_error'), 5000, 'error');
            }
        } catch(e) {
            closeUserModal('confirmModal');
            showUserToast(`${window.t('title_error')}: ${e.message}`, 5000, 'error');
        }
        
        btn.disabled = false;
        btn.innerHTML = originalText;
        deleteTargetId = null;
        
        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================
    // 7. MODAL INJECTION
    // =================================================================

    function injectUserModals() {
        const existingModal = getUserEl('editUserModal') || document.getElementById('editUserModal');
        if (existingModal) return;

        const modalHTML = `
        <!-- 1. EDIT USER MODAL -->
        <div id="editUserModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div class="bg-slate-900 border border-slate-700 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-up">
                <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                    <h3 class="text-lg font-bold text-white">${window.t ? window.t('edit') : 'Edit'}</h3>
                    <button data-close-modal="editUserModal" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
                <div class="p-6 space-y-5">
                    <input type="hidden" id="editUserId">
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="label-text">${window.t ? window.t('lbl_full_name') : 'Full Name'}</label><input type="text" id="editUserName" disabled class="input-disabled"></div>
                        <div><label class="label-text">${window.t ? window.t('col_matricule') : 'Matricule'}</label><input type="text" id="editUserMatricule" disabled class="input-disabled"></div>
                    </div>
                    <div><label class="label-text text-blue-400">${window.t ? window.t('lbl_system_role') : 'System Role'}</label><select id="editUserRoleSelect" class="input-field"></select></div>
                    <div class="grid grid-cols-2 gap-4">
                        <div><label class="label-text">${window.t ? window.t('col_agency') : 'Agency'}</label><select id="editUserAgencySelect" class="input-field"></select></div>
                        <div><label class="label-text">${window.t ? window.t('col_service') : 'Service'}</label><select id="editUserServiceSelect" class="input-field"></select></div>
                    </div>
                    <div><label class="label-text">${window.t ? window.t('col_phone') : 'Phone'}</label><input type="text" id="editUserPhone" class="input-field"></div>
                    <div class="flex items-center justify-between bg-blue-500/10 p-3 rounded-lg border border-blue-500/20">
                        <label class="text-sm font-medium text-white">${window.t ? window.t('lbl_account_active') : 'Account Active'}</label>
                        <label class="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" id="editUserActive" class="sr-only peer">
                            <div class="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                </div>
                <div class="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end gap-3">
                    <button data-close-modal="editUserModal" class="btn-secondary">${window.t ? window.t('btn_cancel') : 'Cancel'}</button>
                    <button id="btnSaveUser" class="btn-primary"><i data-lucide="save" class="w-4 h-4 mr-2"></i> ${window.t ? window.t('btn_save') : 'Save'}</button>
                </div>
            </div>
        </div>

        <!-- 2. VIEW USER MODAL -->
        <div id="viewUserModal" class="fixed inset-0 z-50 hidden bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div class="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-up">
                <div class="p-5 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
                    <h3 class="text-lg font-bold text-white">${window.t ? window.t('col_user_details') : 'User Details'}</h3>
                    <button data-close-modal="viewUserModal" class="text-slate-400 hover:text-white"><i data-lucide="x" class="w-5 h-5"></i></button>
                </div>
                <div class="p-6" id="viewUserContent"></div>
                <div class="p-4 border-t border-slate-700 bg-slate-800/50 flex justify-end">
                    <button data-close-modal="viewUserModal" class="btn-secondary">${window.t ? window.t('btn_close') : 'Close'}</button>
                </div>
            </div>
        </div>

        <!-- 3. CONFIRM MODAL -->
        <div id="confirmModal" class="fixed inset-0 z-[60] hidden bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-slate-900 border border-slate-700 w-full max-w-sm rounded-xl shadow-2xl p-6 text-center animate-up">
                <div class="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 text-red-500"><i data-lucide="alert-triangle" class="w-6 h-6"></i></div>
                <h3 class="text-lg font-bold text-white mb-2" id="confirmTitle">${window.t ? window.t('btn_confirm') : 'Confirm'}</h3>
                <p class="text-slate-400 text-sm mb-6" id="confirmMessage">${window.t ? window.t('msg_confirm_delete') : 'Are you sure you want to delete this item?'}</p>
                <div class="flex gap-3 justify-center">
                    <button data-close-modal="confirmModal" class="btn-secondary w-full">${window.t ? window.t('btn_cancel') : 'Cancel'}</button>
                    <button id="btnConfirmAction" class="btn-danger w-full">${window.t ? window.t('btn_confirm') : 'Confirm'}</button>
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
        
        // Initialize icons
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // =================================================================
    // 8. MODULE EXPORT
    // =================================================================

    window.usersModule = {
        init: initUsers,
        destroy: function() {
            // Clean up event listeners
            const searchInput = getUserEl('userSearch');
            const roleFilter = getUserEl('userRoleFilter');
            const saveBtn = getUserEl('btnSaveUser');
            const confirmBtn = getUserEl('btnConfirmAction');
            const themeToggle = getUserEl('theme-toggle-header');
            
            if (searchInput) searchInput.removeEventListener('input', renderUsersTable);
            if (roleFilter) roleFilter.removeEventListener('change', renderUsersTable);
            if (saveBtn) saveBtn.removeEventListener('click', saveUserChanges);
            if (confirmBtn) confirmBtn.removeEventListener('click', performDelete);
            if (themeToggle) themeToggle.removeEventListener('click', toggleUserTheme);

            // Remove modal close listeners
            const closeButtons = document.querySelectorAll('[data-close-modal]');
            closeButtons.forEach(btn => {
                const newBtn = btn.cloneNode(true);
                btn.parentNode.replaceChild(newBtn, btn);
            });

            // Remove injected modals
            const modals = ['editUserModal', 'viewUserModal', 'confirmModal'];
            modals.forEach(modalId => {
                const modal = document.getElementById(modalId);
                if (modal && modal.parentNode) {
                    modal.parentNode.removeChild(modal);
                }
            });

            // Clear data
            allUsers = [];
            dropdownsLoaded = false;
            dropdownOptions = { roles: [], agencies: [], services: [] };
            deleteTargetId = null;

            console.log("Users module cleaned up");
        },
        refresh: function() {
            loadInitialUsersData();
        },
        // Public API methods
        openViewUserModal: openViewUserModal,
        openEditUserModal: openEditUserModal,
        confirmDeleteUser: confirmDeleteUser,
        closeModal: closeUserModal,
        saveUserChanges: saveUserChanges,
        performDelete: performDelete
    };

    // Auto-initialize if users is loaded directly
    if (document.readyState === 'complete' && window.location.hash === '#users') {
        setTimeout(() => {
            if (window.usersModule && typeof window.usersModule.init === 'function') {
                window.usersModule.init();
            }
        }, 100);
    }

    console.log('Users module loaded');
})();