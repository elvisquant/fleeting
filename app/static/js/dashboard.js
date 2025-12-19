// app/static/js/dashboard.js

// --- GLOBAL STATE ---
let mainChartInstance = null;
let statusChartInstance = null;
let expenseChartInstance = null;
let currentChartType = 'line'; // 'line' or 'bar'
let currentPeriod = 'month'; // week, month, quarter, half_year, year, custom

// =================================================================
// MOBILE-COMPATIBLE ELEMENT GETTER
// =================================================================
function getDashEl(id) {
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
// 1. INITIALIZATION
// =================================================================

// This function is called by the router when #dashboard is loaded
async function initDashboard() {
    console.log("Initializing Dashboard...");
    
    // Attach event listeners
    attachDashboardListeners();
    
    // Load dashboard data
    await loadDashboardData();
    
    // Set up initial dates
    setupDateInputs();
}

function attachDashboardListeners() {
    // Period selector
    const periodSelect = getDashEl('dashboardPeriod');
    if (periodSelect) {
        periodSelect.addEventListener('change', handlePeriodChange);
    }
    
    // Chart type toggle
    const chartToggle = getDashEl('chartTypeToggle');
    if (chartToggle) {
        chartToggle.addEventListener('click', toggleChartType);
    }
}

function setupDateInputs() {
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(today.getMonth() - 1);
    
    const startDateInput = getDashEl('startDate');
    const endDateInput = getDashEl('endDate');
    
    if (startDateInput) startDateInput.value = lastMonth.toISOString().split('T')[0];
    if (endDateInput) endDateInput.value = today.toISOString().split('T')[0];
}

// =================================================================
// 2. DATA LOADING
// =================================================================

async function loadDashboardData() {
    try {
        // Show loading states
        setLoadingStates(true);
        
        // Calculate date range based on current period
        const dateRange = getDateRangeForPeriod(currentPeriod);
        
        // Fetch all dashboard data
        const [kpiData, alertsData, pendingData, expenseData, vehicleStatus, recentAlerts] = await Promise.all([
            window.fetchWithAuth('/dashboard-data/kpis'),
            window.fetchWithAuth('/dashboard-data/alerts'),
            window.fetchWithAuth('/requests/count/pending'),
            window.fetchWithAuth(`/analytics-data/expense-summary?start_date=${dateRange.start}&end_date=${dateRange.end}`),
            window.fetchWithAuth('/dashboard-data/charts/vehicle-status'),
            window.fetchWithAuth('/dashboard-data/recent-alerts?limit=5')
        ]);

        // Update KPI Elements
        updateKPIDisplay(kpiData, alertsData, pendingData, expenseData);
        
        // Load charts
        await loadMonthlyChart(dateRange);
        await loadVehicleStatusChart(vehicleStatus);
        await loadExpenseChart(expenseData);
        
        // Load recent alerts
        updateRecentAlerts(recentAlerts);

    } catch (error) {
        console.error("Dashboard Load Error", error);
        showErrorState();
    } finally {
        setLoadingStates(false);
    }
}

function getDateRangeForPeriod(period) {
    const today = new Date();
    const start = new Date();
    
    switch (period) {
        case 'week':
            start.setDate(today.getDate() - 7);
            break;
        case 'month':
            start.setMonth(today.getMonth() - 1);
            break;
        case 'quarter':
            start.setMonth(today.getMonth() - 3);
            break;
        case 'half_year':
            start.setMonth(today.getMonth() - 6);
            break;
        case 'year':
            start.setFullYear(today.getFullYear() - 1);
            break;
        case 'custom':
            const startDateInput = getDashEl('startDate');
            const endDateInput = getDashEl('endDate');
            return {
                start: startDateInput ? startDateInput.value : today.toISOString().split('T')[0],
                end: endDateInput ? endDateInput.value : today.toISOString().split('T')[0]
            };
        default:
            start.setMonth(today.getMonth() - 1);
    }
    
    return {
        start: start.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0]
    };
}

function updateKPIDisplay(kpiData, alertsData, pendingData, expenseData) {
    // Basic KPIs
    const vehiclesEl = getDashEl('kpi-vehicles');
    const alertsEl = getDashEl('kpi-alerts');
    const requestsEl = getDashEl('kpi-requests');
    const fuelEl = getDashEl('kpi-fuel');
    
    if (vehiclesEl) vehiclesEl.innerText = kpiData?.total_vehicles || '0';
    if (alertsEl) alertsEl.innerText = alertsData?.total_alerts || '0';
    if (requestsEl) requestsEl.innerText = pendingData?.count || '0';
    if (fuelEl) fuelEl.innerText = formatBIF(kpiData?.fuel_cost_this_week || 0);
    
    // Expense KPIs
    const totalExpensesEl = getDashEl('kpi-total-expenses');
    const maintenanceEl = getDashEl('kpi-maintenance');
    const reparationEl = getDashEl('kpi-reparation');
    const purchasesEl = getDashEl('kpi-purchases');
    const expensePeriodEl = getDashEl('expense-period');
    
    if (expenseData) {
        const totalExpenses = (expenseData.total_fuel_cost || 0) + 
                             (expenseData.total_reparation_cost || 0) + 
                             (expenseData.total_maintenance_cost || 0) + 
                             (expenseData.total_vehicle_purchase_cost || 0);
        
        if (totalExpensesEl) totalExpensesEl.innerText = formatBIF(totalExpenses);
        if (maintenanceEl) maintenanceEl.innerText = formatBIF(expenseData.total_maintenance_cost || 0);
        if (reparationEl) reparationEl.innerText = formatBIF(expenseData.total_reparation_cost || 0);
        if (purchasesEl) purchasesEl.innerText = formatBIF(expenseData.total_vehicle_purchase_cost || 0);
    }
    
    // Update period label
    if (expensePeriodEl) {
        const periodLabels = {
            'week': 'This week',
            'month': 'This month',
            'quarter': 'Last 3 months',
            'half_year': 'Last 6 months',
            'year': 'Last 12 months',
            'custom': 'Custom period'
        };
        expensePeriodEl.innerText = periodLabels[currentPeriod] || 'Selected period';
    }
}

function formatBIF(amount) {
    return `BIF ${(amount || 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// =================================================================
// 3. CHARTS
// =================================================================

async function loadMonthlyChart(dateRange) {
    const data = await window.fetchWithAuth(
        `/dashboard-data/charts/monthly-activity?start_date=${dateRange.start}&end_date=${dateRange.end}`
    );
    
    if (!data) return;
    
    const canvas = getDashEl('mainChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (mainChartInstance) mainChartInstance.destroy();

    const chartConfig = {
        type: currentChartType,
        data: {
            labels: data.labels || [],
            datasets: [
                { 
                    label: 'Fuel', 
                    data: data.fuel || [], 
                    borderColor: '#f97316', 
                    backgroundColor: currentChartType === 'bar' ? 'rgba(249, 115, 22, 0.7)' : 'rgba(249, 115, 22, 0.1)',
                    borderWidth: 2, 
                    fill: currentChartType === 'line'
                },
                { 
                    label: 'Maintenance', 
                    data: data.maintenance || [], 
                    borderColor: '#3b82f6', 
                    backgroundColor: currentChartType === 'bar' ? 'rgba(59, 130, 246, 0.7)' : 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2, 
                    fill: currentChartType === 'line'
                },
                { 
                    label: 'Reparations', 
                    data: data.reparations || [], 
                    borderColor: '#ef4444', 
                    backgroundColor: currentChartType === 'bar' ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2, 
                    fill: currentChartType === 'line'
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: { 
                legend: { 
                    labels: { 
                        color: '#94a3b8',
                        font: { size: 11 }
                    },
                    position: 'top'
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#e2e8f0',
                    bodyColor: '#cbd5e1',
                    callbacks: {
                        label: (context) => `${context.dataset.label}: ${formatBIF(context.raw)}`
                    }
                }
            }, 
            scales: { 
                y: { 
                    beginAtZero: true,
                    grid: { 
                        color: 'rgba(255,255,255,0.05)',
                        drawBorder: false
                    }, 
                    ticks: { 
                        color: '#94a3b8',
                        callback: (value) => {
                            if (value >= 1000000) return `BIF ${(value/1000000).toFixed(1)}M`;
                            if (value >= 1000) return `BIF ${(value/1000).toFixed(1)}k`;
                            return `BIF ${value}`;
                        }
                    } 
                }, 
                x: { 
                    grid: { 
                        display: false,
                        drawBorder: false
                    }, 
                    ticks: { 
                        color: '#94a3b8',
                        maxRotation: 45
                    } 
                } 
            } 
        }
    };

    mainChartInstance = new Chart(ctx, chartConfig);
}

async function loadVehicleStatusChart(data) {
    if (!data) return;
    
    const canvas = getDashEl('statusChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (statusChartInstance) statusChartInstance.destroy();

    // Safety checks for data
    const labels = data.labels || ['Available', 'In Use', 'Maintenance'];
    const counts = data.counts || [0, 0, 0];
    
    const bgColors = ['#10b981', '#3b82f6', '#ef4444'];
    const hoverColors = ['#34d399', '#60a5fa', '#f87171'];

    // Update count displays
    const availableEl = getDashEl('available-count');
    const inUseEl = getDashEl('inuse-count');
    const maintenanceEl = getDashEl('maintenance-count');
    
    if (availableEl) availableEl.innerText = counts[0] || '0';
    if (inUseEl) inUseEl.innerText = counts[1] || '0';
    if (maintenanceEl) maintenanceEl.innerText = counts[2] || '0';

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels: labels, 
            datasets: [{ 
                data: counts, 
                backgroundColor: bgColors,
                hoverBackgroundColor: hoverColors,
                borderWidth: 2,
                borderColor: '#1e293b'
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '70%',
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#e2e8f0',
                    bodyColor: '#cbd5e1',
                    callbacks: {
                        label: (context) => `${context.label}: ${context.raw} vehicles`
                    }
                }
            }
        }
    });
}

async function loadExpenseChart(expenseData) {
    if (!expenseData) return;
    
    const canvas = getDashEl('expenseChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    if (expenseChartInstance) expenseChartInstance.destroy();

    const fuel = expenseData.total_fuel_cost || 0;
    const maintenance = expenseData.total_maintenance_cost || 0;
    const reparation = expenseData.total_reparation_cost || 0;
    const purchases = expenseData.total_vehicle_purchase_cost || 0;
    
    const total = fuel + maintenance + reparation + purchases;
    
    // Calculate percentages
    const fuelPercent = total > 0 ? ((fuel / total) * 100).toFixed(1) : 0;
    const maintenancePercent = total > 0 ? ((maintenance / total) * 100).toFixed(1) : 0;
    const reparationPercent = total > 0 ? ((reparation / total) * 100).toFixed(1) : 0;
    const purchasesPercent = total > 0 ? ((purchases / total) * 100).toFixed(1) : 0;
    
    // Update percentage displays
    const fuelPercentEl = getDashEl('fuel-percent');
    const maintenancePercentEl = getDashEl('maintenance-percent');
    const reparationPercentEl = getDashEl('reparation-percent');
    const purchasesPercentEl = getDashEl('purchases-percent');
    
    if (fuelPercentEl) fuelPercentEl.innerText = `${fuelPercent}%`;
    if (maintenancePercentEl) maintenancePercentEl.innerText = `${maintenancePercent}%`;
    if (reparationPercentEl) reparationPercentEl.innerText = `${reparationPercent}%`;
    if (purchasesPercentEl) purchasesPercentEl.innerText = `${purchasesPercent}%`;

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels: ['Fuel', 'Maintenance', 'Reparations', 'Purchases'], 
            datasets: [{ 
                data: [fuel, maintenance, reparation, purchases], 
                backgroundColor: ['#f97316', '#3b82f6', '#ef4444', '#10b981'],
                hoverBackgroundColor: ['#fb923c', '#60a5fa', '#f87171', '#34d399'],
                borderWidth: 2,
                borderColor: '#1e293b'
            }] 
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false, 
            cutout: '65%',
            plugins: { 
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1e293b',
                    titleColor: '#e2e8f0',
                    bodyColor: '#cbd5e1',
                    callbacks: {
                        label: (context) => `${context.label}: ${formatBIF(context.raw)} (${context.parsed}%)`
                    }
                }
            }
        }
    });
}

// =================================================================
// 4. RECENT ALERTS
// =================================================================

function updateRecentAlerts(alertsData) {
    const alertsContainer = getDashEl('recentAlerts');
    if (!alertsContainer) return;
    
    if (!alertsData || !alertsData.alerts || alertsData.alerts.length === 0) {
        alertsContainer.innerHTML = `
            <div class="flex items-center justify-center p-8">
                <div class="text-center">
                    <i data-lucide="check-circle" class="w-8 h-8 text-green-500 mx-auto mb-2"></i>
                    <p class="text-slate-400 text-sm">No recent alerts</p>
                </div>
            </div>
        `;
        return;
    }
    
    let alertsHTML = '';
    
    alertsData.alerts.forEach(alert => {
        const alertType = alert.type || 'info';
        const alertIcon = getAlertIcon(alertType);
        const alertColor = getAlertColor(alertType);
        
        alertsHTML += `
            <div class="flex items-start gap-3 p-3 bg-slate-800/30 rounded-lg hover:bg-slate-800/50 transition">
                <div class="p-2 rounded-lg ${alertColor.bg}">
                    <i data-lucide="${alertIcon}" class="w-4 h-4 ${alertColor.text}"></i>
                </div>
                <div class="flex-1">
                    <p class="text-sm font-medium text-white">${alert.title || 'Alert'}</p>
                    <p class="text-xs text-slate-400 mt-1">${alert.message || 'No details available'}</p>
                    <div class="flex items-center gap-2 mt-2">
                        <span class="text-xs text-slate-500">${formatTimeAgo(alert.timestamp)}</span>
                        ${alert.vehicle ? `<span class="text-xs text-blue-400">${alert.vehicle}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    });
    
    alertsContainer.innerHTML = alertsHTML;
    
    if (window.lucide) window.lucide.createIcons();
}

function getAlertIcon(type) {
    const icons = {
        'critical': 'alert-octagon',
        'warning': 'alert-triangle',
        'info': 'info',
        'success': 'check-circle',
        'maintenance': 'wrench',
        'fuel': 'fuel',
        'trip': 'route'
    };
    return icons[type] || 'alert-circle';
}

function getAlertColor(type) {
    const colors = {
        'critical': { bg: 'bg-red-500/10', text: 'text-red-400' },
        'warning': { bg: 'bg-orange-500/10', text: 'text-orange-400' },
        'info': { bg: 'bg-blue-500/10', text: 'text-blue-400' },
        'success': { bg: 'bg-green-500/10', text: 'text-green-400' },
        'maintenance': { bg: 'bg-purple-500/10', text: 'text-purple-400' },
        'fuel': { bg: 'bg-yellow-500/10', text: 'text-yellow-400' },
        'trip': { bg: 'bg-cyan-500/10', text: 'text-cyan-400' }
    };
    return colors[type] || { bg: 'bg-slate-500/10', text: 'text-slate-400' };
}

function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Just now';
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

// =================================================================
// 5. EVENT HANDLERS
// =================================================================

function handlePeriodChange(event) {
    currentPeriod = event.target.value;
    const customDateRange = getDashEl('customDateRange');
    
    if (currentPeriod === 'custom') {
        if (customDateRange) customDateRange.classList.remove('hidden');
    } else {
        if (customDateRange) customDateRange.classList.add('hidden');
        loadDashboardData();
    }
}

function applyCustomDateRange() {
    const startDateInput = getDashEl('startDate');
    const endDateInput = getDashEl('endDate');
    
    if (!startDateInput || !endDateInput || !startDateInput.value || !endDateInput.value) {
        // Show error toast
        const toastContainer = getDashEl('toast-container');
        if (toastContainer) {
            const toast = document.createElement('div');
            toast.className = 'toast-message error';
            toast.textContent = 'Please select both start and end dates';
            toastContainer.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }
        return;
    }
    
    loadDashboardData();
}

window.toggleChartType = function() {
    currentChartType = currentChartType === 'line' ? 'bar' : 'line';
    
    const toggleButton = getDashEl('chartTypeToggle');
    if (toggleButton) {
        const icon = currentChartType === 'line' ? 'bar-chart-2' : 'trending-up';
        const text = currentChartType === 'line' ? 'Bar' : 'Line';
        toggleButton.innerHTML = `<i data-lucide="${icon}" class="w-3 h-3"></i> ${text}`;
        
        if (window.lucide) window.lucide.createIcons();
    }
    
    // Reload chart with new type
    const dateRange = getDateRangeForPeriod(currentPeriod);
    loadMonthlyChart(dateRange);
}

window.refreshDashboard = function() {
    loadDashboardData();
    
    // Show refresh animation
    const refreshBtn = getDashEl('refreshBtn');
    if (refreshBtn) {
        const icon = refreshBtn.querySelector('i');
        if (icon) {
            icon.classList.add('animate-spin');
            setTimeout(() => icon.classList.remove('animate-spin'), 1000);
        }
    }
}

// =================================================================
// 6. UTILITY FUNCTIONS
// =================================================================

function setLoadingStates(isLoading) {
    const loadingElements = [
        'kpi-vehicles', 'kpi-alerts', 'kpi-fuel', 'kpi-requests',
        'kpi-total-expenses', 'kpi-maintenance', 'kpi-reparation', 'kpi-purchases'
    ];
    
    loadingElements.forEach(id => {
        const el = getDashEl(id);
        if (el) {
            if (isLoading) {
                el.classList.add('opacity-50');
            } else {
                el.classList.remove('opacity-50');
            }
        }
    });
}

function showErrorState() {
    const alertsContainer = getDashEl('recentAlerts');
    if (alertsContainer) {
        alertsContainer.innerHTML = `
            <div class="flex items-center justify-center p-8">
                <div class="text-center">
                    <i data-lucide="alert-circle" class="w-8 h-8 text-red-500 mx-auto mb-2"></i>
                    <p class="text-slate-400 text-sm">Failed to load dashboard data</p>
                    <button onclick="loadDashboardData()" class="mt-2 text-blue-400 hover:text-blue-300 text-xs">
                        Try Again
                    </button>
                </div>
            </div>
        `;
    }
}

// =================================================================
// 7. RESPONSIVE HANDLING
// =================================================================

function handleDashboardResize() {
    if (mainChartInstance) mainChartInstance.resize();
    if (statusChartInstance) statusChartInstance.resize();
    if (expenseChartInstance) expenseChartInstance.resize();
}

// Add resize listener
if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleDashboardResize);
}

// =================================================================
// 8. CLEANUP FUNCTION
// =================================================================

window.cleanupDashboard = function() {
    // Destroy charts
    if (mainChartInstance) {
        mainChartInstance.destroy();
        mainChartInstance = null;
    }
    if (statusChartInstance) {
        statusChartInstance.destroy();
        statusChartInstance = null;
    }
    if (expenseChartInstance) {
        expenseChartInstance.destroy();
        expenseChartInstance = null;
    }
    
    // Remove event listeners
    const periodSelect = getDashEl('dashboardPeriod');
    if (periodSelect) {
        periodSelect.removeEventListener('change', handlePeriodChange);
    }
    
    // Remove resize listener
    window.removeEventListener('resize', handleDashboardResize);
    
    console.log("Dashboard cleanup complete");
};

// Initialize if this module is loaded directly (for testing)
if (document.readyState === 'complete' && window.location.hash === '#dashboard') {
    setTimeout(initDashboard, 100);
}