// static/js/router.js

(function() {
    'use strict';
    
    // GET BOTH CONTENT CONTAINERS
    const desktopContent = document.getElementById('app-content');
    const mobileContent = document.getElementById('app-content-mobile');
    
    // Check if content containers exist
    if (!desktopContent && !mobileContent) {
        console.error('No content containers found!');
        return;
    }

    // ROUTE MAPPING
    const routes = {
        'dashboard': { file: '/static/pages/dashboard.html' },
        'analytics': { file: '/static/pages/analytics.html' },
        'vehicles':  { file: '/static/pages/vehicles.html' },
        'requests':  { file: '/static/pages/requests.html' },
        'users':     { file: '/static/pages/users.html' }, 
        'fuel':      { file: '/static/pages/fuel.html' }, 
        'maintenance': { file: '/static/pages/maintenance.html' },
        'panne': { file: '/static/pages/panne.html' },
        'reparations': { file: '/static/pages/reparation.html' }
    };

    function updateContentContainers(html) {
        // Update desktop container if it exists
        if (desktopContent) {
            desktopContent.innerHTML = html;
        }
        
        // Update mobile container if it exists
        if (mobileContent) {
            mobileContent.innerHTML = html;
        }
    }

    // SAFE MODULE INITIALIZER
    function initializeModule(moduleName) {
        console.log(`Initializing module: ${moduleName}`);
        
        // Map module names to their initialization functions
        const moduleMap = {
            'dashboard': () => {
                if (window.dashboardModule && typeof window.dashboardModule.init === 'function') {
                    return window.dashboardModule.init();
                } else if (typeof window.initDashboard === 'function') {
                    return window.initDashboard();
                }
            },
            'analytics': () => {
                if (window.analyticsModule && typeof window.analyticsModule.init === 'function') {
                    return window.analyticsModule.init();
                } else if (typeof window.initAnalytics === 'function') {
                    return window.initAnalytics();
                }
            },
            'vehicles': () => {
                if (window.vehiclesModule && typeof window.vehiclesModule.init === 'function') {
                    return window.vehiclesModule.init();
                } else if (typeof window.initVehicles === 'function') {
                    return window.initVehicles();
                }
            },
            'requests': () => {
                if (window.requestsModule && typeof window.requestsModule.init === 'function') {
                    return window.requestsModule.init();
                } else if (typeof window.initRequests === 'function') {
                    return window.initRequests();
                }
            },
            'users': () => {
                if (window.usersModule && typeof window.usersModule.init === 'function') {
                    return window.usersModule.init();
                } else if (typeof window.initUsers === 'function') {
                    return window.initUsers();
                }
            },
            'fuel': () => {
                if (window.fuelModule && typeof window.fuelModule.init === 'function') {
                    return window.fuelModule.init();
                } else if (typeof window.initFuel === 'function') {
                    return window.initFuel();
                }
            },
            'maintenance': () => {
                if (window.maintenanceModule && typeof window.maintenanceModule.init === 'function') {
                    return window.maintenanceModule.init();
                } else if (typeof window.initMaintenance === 'function') {
                    return window.initMaintenance();
                }
            },
            'panne': () => {
                if (window.panneModule && typeof window.panneModule.init === 'function') {
                    return window.panneModule.init();
                } else if (typeof window.initPanne === 'function') {
                    return window.initPanne();
                }
            },
            'reparations': () => {
                if (window.reparationModule && typeof window.reparationModule.init === 'function') {
                    return window.reparationModule.init();
                } else if (typeof window.initReparation === 'function') {
                    return window.initReparation();
                }
            }
        };

        const initFunction = moduleMap[moduleName];
        if (initFunction) {
            try {
                // Wait a bit for module to load if not available
                if (!window[`${moduleName}Module`] && typeof window[`init${moduleName.charAt(0).toUpperCase() + moduleName.slice(1)}`] !== 'function') {
                    console.warn(`Module ${moduleName} not loaded yet, waiting...`);
                    setTimeout(() => initFunction(), 300);
                } else {
                    initFunction();
                }
            } catch (error) {
                console.error(`Error initializing ${moduleName}:`, error);
            }
        } else {
            console.warn(`No initialization function found for module: ${moduleName}`);
        }
    }

    // PAGE LOADER
    async function loadPage(pageName) {
        console.log(`Loading page: ${pageName}`);
        
        // Default to dashboard if route doesn't exist
        const route = routes[pageName] || routes['dashboard'];

        try {
            const response = await fetch(route.file);
            if (!response.ok) throw new Error(`HTML file not found: ${route.file}`);
            const html = await response.text();

            // 1. Inject HTML into BOTH Content Areas
            updateContentContainers(html);
            
            // 2. Refresh Icons (Lucide)
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }

            // 3. Update Sidebar Active State (Desktop)
            document.querySelectorAll('.sidebar-link').forEach(el => {
                el.classList.remove('active', 'bg-blue-500/10', 'text-blue-400');
            });
            
            // Match sidebar link ID (e.g., id="nav-users") with hash (e.g., #users)
            const activeLink = document.getElementById(`nav-${pageName}`);
            if (activeLink) {
                activeLink.classList.add('active', 'bg-blue-500/10', 'text-blue-400');
            }

            // 4. Update Mobile Sidebar Active State
            const mobileActiveLink = document.getElementById(`mobile-nav-${pageName}`);
            if (mobileActiveLink) {
                mobileActiveLink.classList.add('active', 'bg-blue-500/10', 'text-blue-400');
            }

            // 5. Initialize Module Logic with delay to ensure DOM is ready
            setTimeout(() => {
                initializeModule(pageName);
            }, 100);

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

    // NAVIGATION HELPERS
    function updateActiveNav(route) {
        // Update mobile bottom nav active state
        if (window.innerWidth < 768) {
            const navItems = document.querySelectorAll('.mobile-nav-item');
            navItems.forEach(item => item.classList.remove('active'));
            
            const activeItem = document.getElementById(`bottom-nav-${route}`);
            if (activeItem) {
                activeItem.classList.add('active');
                
                // Scroll active item into view
                try {
                    activeItem.scrollIntoView({ 
                        behavior: 'smooth', 
                        inline: 'center', 
                        block: 'nearest' 
                    });
                } catch (e) {
                    // Fallback for older browsers
                    activeItem.scrollIntoView();
                }
            }
        }
    }

    // HASH CHANGE LISTENER
    function onHashChange() {
        const page = window.location.hash.substring(1) || 'dashboard';
        console.log(`Hash changed to: ${page}`);
        
        loadPage(page);
        updateActiveNav(page);
    }

    // DOM READY INITIALIZATION
    function onDomReady() {
        const page = window.location.hash.substring(1) || 'dashboard';
        console.log(`DOM ready, loading page: ${page}`);
        
        loadPage(page);
        updateActiveNav(page);
    }

    // EVENT LISTENERS
    window.addEventListener('hashchange', onHashChange);
    
    // Wait for DOM to be fully ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', onDomReady);
    } else {
        // DOM already loaded
        setTimeout(onDomReady, 100);
    }

    // Expose loadPage globally for manual navigation
    window.loadPage = loadPage;
    window.initializeModule = initializeModule;

    console.log('Router initialized successfully');
})();