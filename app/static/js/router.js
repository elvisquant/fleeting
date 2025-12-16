const contentDiv = document.getElementById('app-content');

// ROUTE MAPPING
const routes = {
    'dashboard': { file: '/static/pages/dashboard.html', init: initDashboard }, 
    'vehicles':  { file: '/static/pages/vehicles.html',  init: initVehicles },
    'requests':  { file: '/static/pages/requests.html',  init: initRequests },
    'users':     { file: '/static/pages/users.html',     init: initUsers }, 
    'fuel':      { file: '/static/pages/fuel.html',      init: initFuel }, 
    'maintenance': { file: '/static/pages/maintenance.html', init: initMaintenance },
    'panne': { file: '/static/pages/panne.html', init: initPanne },
    'reparations': { file: '/static/pages/reparation.html', init: initReparation },
    'requests': { file: '/static/pages/requests.html', init: initRequests },
    
};

// GLOBAL API HELPER (Available to all modules)
window.fetchWithAuth = async function(endpoint, method = 'GET', body = null) {
    const token = localStorage.getItem('access_token');
    
    // Redirect to root if no token found
    if(!token) { 
        window.location.href = '/'; 
        return null; 
    }

    const headers = { 
        'Authorization': `Bearer ${token}`, 
        'Content-Type': 'application/json' 
    };
    
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    try {
        // Construct URL safely: ensures exactly one slash between API_BASE and endpoint
        // Assumes API_BASE (e.g., '/api/v1') is defined in index.html
        const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
        const url = `${API_BASE}${cleanEndpoint}`;

        const response = await fetch(url, config);
        
        // Handle Token Expiry
        if (response.status === 401) { 
            localStorage.clear(); 
            window.location.href = '/'; 
            return null; 
        }
        
        // Handle No Content (Success, but no JSON)
        if (response.status === 204) return true;
        
        // Parse JSON
        const data = await response.json();
        
        // Log warnings for non-200 responses (e.g., 400 Bad Request, 404 Not Found)
        if(!response.ok) {
            console.warn(`API Error [${response.status}]:`, data);
            return null;
        }
        
        return data;

    } catch (error) {
        console.error("Network/API Error:", error);
        return null;
    }
};

// PAGE LOADER
async function loadPage(pageName) {
    // Default to dashboard if route doesn't exist
    const route = routes[pageName] || routes['dashboard'];

    try {
        const response = await fetch(route.file);
        if (!response.ok) throw new Error(`HTML file not found: ${route.file}`);
        const html = await response.text();

        // 1. Inject HTML into Main Content Area
        contentDiv.innerHTML = html;
        
        // 2. Refresh Icons (Lucide)
        if(window.lucide) window.lucide.createIcons();

        // 3. Update Sidebar Active State
        document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active', 'bg-blue-500/10', 'text-blue-400'));
        
        // Match sidebar link ID (e.g., id="nav-users") with hash (e.g., #users)
        const activeLink = document.getElementById(`nav-${pageName}`);
        if(activeLink) activeLink.classList.add('active', 'bg-blue-500/10', 'text-blue-400');

        // 4. Initialize Module Logic (e.g., initUsers(), initVehicles())
        if (route.init) {
            await route.init();
        }

    } catch (error) {
        console.error("Router Error:", error);
        contentDiv.innerHTML = `
            <div class="p-10 text-center text-red-400">
                <h3 class="text-lg font-bold">Error loading module</h3>
                <p class="text-sm text-slate-500">${error.message}</p>
                <p class="text-xs text-slate-600 mt-2">Check console for details.</p>
            </div>`;
    }
}

// LISTENERS
window.addEventListener('hashchange', () => {
    const page = window.location.hash.substring(1) || 'dashboard';
    loadPage(page);
});

window.addEventListener('DOMContentLoaded', () => {
    const page = window.location.hash.substring(1) || 'dashboard';
    loadPage(page);
});