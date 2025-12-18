// GET BOTH CONTENT CONTAINERS
const desktopContent = document.getElementById('app-content');
const mobileContent = document.getElementById('app-content-mobile');

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

// CONTENT UPDATER FUNCTION
function updateContentContainers(html) {
    // Update desktop container if it exists
    if (desktopContent) {
        desktopContent.innerHTML = html;
    }
    
    // Update mobile container if it exists
    if (mobileContent) {
        mobileContent.innerHTML = html;
    }
    
    // Also check if we're on mobile but using the wrong container
    // (fallback for cases where mobileContent might not exist yet)
    if (window.innerWidth < 768 && !mobileContent && desktopContent) {
        // On mobile, ensure content is visible
        document.querySelectorAll('.content-container').forEach(container => {
            container.style.display = 'block';
        });
    }
}

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

        // 1. Inject HTML into BOTH Content Areas
        updateContentContainers(html);
        
        // 2. Refresh Icons (Lucide)
        if(window.lucide) window.lucide.createIcons();

        // 3. Update Sidebar Active State (Desktop)
        document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active', 'bg-blue-500/10', 'text-blue-400'));
        
        // Match sidebar link ID (e.g., id="nav-users") with hash (e.g., #users)
        const activeLink = document.getElementById(`nav-${pageName}`);
        if(activeLink) activeLink.classList.add('active', 'bg-blue-500/10', 'text-blue-400');

        // 4. Update Mobile Sidebar Active State
        const mobileActiveLink = document.getElementById(`mobile-nav-${pageName}`);
        if(mobileActiveLink) mobileActiveLink.classList.add('active', 'bg-blue-500/10', 'text-blue-400');

        // 5. Initialize Module Logic (e.g., initUsers(), initVehicles())
        if (route.init) {
            await route.init();
        }

    } catch (error) {
        console.error("Router Error:", error);
        const errorHtml = `
            <div class="p-10 text-center text-red-400">
                <h3 class="text-lg font-bold">Error loading module</h3>
                <p class="text-sm text-slate-500">${error.message}</p>
                <p class="text-xs text-slate-600 mt-2">Check console for details.</p>
            </div>`;
        
        updateContentContainers(errorHtml);
    }
}

// MODULE INITIALIZATION HANDLER
window.initializeModule = async function(moduleName) {
    const route = routes[moduleName];
    if (route && route.init) {
        try {
            await route.init();
        } catch (error) {
            console.error(`Error initializing ${moduleName}:`, error);
        }
    }
};

// LISTENERS
window.addEventListener('hashchange', () => {
    const page = window.location.hash.substring(1) || 'dashboard';
    loadPage(page);
    
    // Also update mobile bottom nav active state
    setTimeout(() => {
        if (window.innerWidth < 768) {
            const navItems = document.querySelectorAll('.mobile-nav-item');
            navItems.forEach(item => item.classList.remove('active'));
            
            const activeItem = document.getElementById(`bottom-nav-${page}`);
            if (activeItem) {
                activeItem.classList.add('active');
                
                // Scroll active item into view
                activeItem.scrollIntoView({ 
                    behavior: 'smooth', 
                    inline: 'center', 
                    block: 'nearest' 
                });
            }
        }
    }, 100);
});

window.addEventListener('DOMContentLoaded', () => {
    const page = window.location.hash.substring(1) || 'dashboard';
    loadPage(page);
    
    // Initialize module for current page
    setTimeout(() => {
        if (routes[page] && routes[page].init) {
            routes[page].init();
        }
    }, 300);
});

// Handle mobile-specific initialization
window.addEventListener('load', () => {
    // Check if we're on mobile and content needs initialization
    if (window.innerWidth < 768 && mobileContent) {
        // Re-initialize icons for mobile
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }
});

// Expose loadPage globally for manual navigation
window.loadPage = loadPage;