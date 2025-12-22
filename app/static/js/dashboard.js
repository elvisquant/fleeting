// app/static/js/dashboard.js

// --- GLOBAL STATE ---
let mainChartInstance = null;
let statusChartInstance = null;
let expenseChartInstance = null;
let currentChartType = 'line'; // 'line' or 'bar'
let currentPeriod = 'month'; // week, month, quarter, half_year, year, custom

// =================================================================
// 0. HELPER: DOM ELEMENT GETTER
// =================================================================
function getDashEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

// =================================================================
// 1. INITIALIZATION
// =================================================================

async function initDashboard() {
    console.log("Initializing Dashboard...");
    
    attachDashboardListeners();
    await loadDashboardData();
    setupDateInputs();
}

function attachDashboardListeners() {
    const periodSelect = getDashEl('dashboardPeriod');
    if (periodSelect) {
        periodSelect.addEventListener('change', handlePeriodChange);
    }
    
    const chartToggle = getDashEl('chartTypeToggle');
    if (chartToggle) {
        chartToggle.addEventListener('click', toggleChartType);
    }
    
    window.refreshDashboard = refreshDashboard;
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
        setLoadingStates(true);
        
        const dateRange = getDateRangeForPeriod(currentPeriod);
        
        const fetchPromises = [
            window.fetchWithAuth('/dashboard-data/kpis'),
            window.fetchWithAuth('/dashboard-data/alerts'),
            window.fetchWithAuth('/requests/count/pending'),
            window.fetchWithAuth(`/analytics-data/expense-summary?start_date=${dateRange.start}&end_date=${dateRange.end}`),
            window.fetchWithAuth('/dashboard-data/charts/vehicle-status'),
            window.fetchWithAuth('/dashboard-data/recent-alerts?limit=5')
        ];

        const monthlyDataPromise = window.fetchWithAuth(
            `/analytics-data/expense-summary?start_date=${dateRange.start}&end_date=${dateRange.end}&detailed=true`
        );

        const [
            kpiData, alertsData, pendingData, expenseData, vehicleStatus, recentAlerts
        ] = await Promise.all(fetchPromises);
        
        const monthlyExpenseData = await monthlyDataPromise;

        updateKPIDisplay(kpiData, alertsData, pendingData, expenseData);
        await loadMonthlyChart(monthlyExpenseData);
        await loadVehicleStatusChart(vehicleStatus);
        await loadExpenseChart(expenseData);
        
        // This was missing in the previous version
        updateRecentAlerts(recentAlerts);

    } catch (error) {
        console.error("Dashboard Load Error:", error);
        showErrorState();
    } finally {
        setLoadingStates(false);
    }
}

function getDateRangeForPeriod(period) {
    const today = new Date();
    const start = new Date();
    
    switch (period) {
        case 'week': start.setDate(today.getDate() - 7); break;
        case 'month': start.setMonth(today.getMonth() - 1); break;
        case 'quarter': start.setMonth(today.getMonth() - 3); break;
        case 'half_year': start.setMonth(today.getMonth() - 6); break;
        case 'year': start.setFullYear(today.getFullYear() - 1); break;
        case 'custom':
            const startDateInput = getDashEl('startDate');
            const endDateInput = getDashEl('endDate');
            return {
                start: startDateInput ? startDateInput.value : today.toISOString().split('T')[0],
                end: endDateInput ? endDateInput.value : today.toISOString().split('T')[0]
            };
        default: start.setMonth(today.getMonth() - 1);
    }
    
    return {
        start: start.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0]
    };
}

function updateKPIDisplay(kpiData, alertsData, pendingData, expenseData) {
    const vehiclesEl = getDashEl('kpi-vehicles');
    const alertsEl = getDashEl('kpi-alerts');
    const requestsEl = getDashEl('kpi-requests');
    const fuelEl = getDashEl('kpi-fuel');
    
    if (vehiclesEl) vehiclesEl.innerText = kpiData?.total_vehicles || '0';
    if (alertsEl) alertsEl.innerText = alertsData?.total_alerts || '0';
    if (requestsEl) requestsEl.innerText = pendingData?.count || '0';
    
    let fuelCost = 0;
    if (kpiData?.fuel_cost_this_week) fuelCost = kpiData.fuel_cost_this_week;
    else if (expenseData?.total_fuel_cost) fuelCost = expenseData.total_fuel_cost;
    
    if (fuelEl) fuelEl.innerText = formatBIF(fuelCost);
    
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
    
    if (expensePeriodEl) {
        const periodLabels = {
            'week': window.t('lbl_this_week'),
            'month': window.t('lbl_this_month'),
            'quarter': window.t('lbl_last_3_months'),
            'half_year': window.t('lbl_last_6_months'),
            'year': window.t('lbl_last_12_months'),
            'custom': window.t('lbl_custom_range')
        };
        expensePeriodEl.innerText = periodLabels[currentPeriod] || 'Selected period';
    }
}

// -----------------------------------------------------------
// RESTORED FUNCTION: Update Recent Alerts List
// -----------------------------------------------------------
function updateRecentAlerts(alerts) {
    const container = getDashEl('recentAlerts');
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="text-center p-6 text-slate-500 text-sm">
                ${window.t('msg_no_records')}
            </div>`;
        return;
    }

    container.innerHTML = alerts.map(alert => {
        let icon = 'alert-circle';
        let colorClass = 'text-blue-400 bg-blue-500/10';
        
        // Customize icon based on type
        if (alert.entity_type === 'panne') {
            icon = 'alert-triangle';
            colorClass = 'text-red-400 bg-red-500/10';
        } else if (alert.entity_type === 'maintenance') {
            icon = 'wrench';
            colorClass = 'text-orange-400 bg-orange-500/10';
        } else if (alert.entity_type === 'trip') {
            icon = 'map-pin';
            colorClass = 'text-green-400 bg-green-500/10';
        }

        return `
        <div class="flex items-start gap-3 p-3 rounded-lg hover:bg-white/5 transition border border-transparent hover:border-slate-700/50">
            <div class="w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center shrink-0">
                <i data-lucide="${icon}" class="w-4 h-4"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <h4 class="text-sm font-medium text-white truncate pr-2">${alert.plate_number}</h4>
                    <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 capitalize">${alert.status}</span>
                </div>
                <p class="text-xs text-slate-400 mt-0.5 truncate">${alert.message}</p>
            </div>
        </div>`;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

function formatBIF(amount) {
    return `BIF ${(amount || 0).toLocaleString(window.APP_LOCALE, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

// =================================================================
// 3. CHARTS (Translated)
// =================================================================

async function loadMonthlyChart(expenseData) {
    const canvas = getDashEl('mainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (mainChartInstance) {
        mainChartInstance.destroy();
        mainChartInstance = null;
    }

    let labels = [];
    let fuelData = [];
    let maintenanceData = [];
    let reparationData = [];
    let purchasesData = [];
    
    if (expenseData && expenseData.monthly_breakdown && expenseData.monthly_breakdown.length > 0) {
        const sortedBreakdown = expenseData.monthly_breakdown.sort((a, b) => {
            return new Date(a.month_year) - new Date(b.month_year);
        });
        
        labels = sortedBreakdown.map(item => {
            if (item.month_year) {
                return new Date(item.month_year).toLocaleDateString(window.APP_LOCALE, { month: 'short', year: '2-digit' });
            }
            return 'Unknown';
        });
        
        fuelData = sortedBreakdown.map(item => item.fuel_cost || 0);
        maintenanceData = sortedBreakdown.map(item => item.maintenance_cost || 0);
        reparationData = sortedBreakdown.map(item => item.reparation_cost || 0);
        purchasesData = sortedBreakdown.map(item => item.purchase_cost || 0);
    } else {
        // Simple Fallback to prevent blank chart
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']; 
        labels = months;
        fuelData = [0,0,0,0,0,0];
        maintenanceData = [0,0,0,0,0,0];
        reparationData = [0,0,0,0,0,0];
        purchasesData = [0,0,0,0,0,0];
    }
    
    const chartConfig = {
        type: currentChartType,
        data: {
            labels: labels,
            datasets: [
                { 
                    label: window.t('fuel'), 
                    data: fuelData, 
                    borderColor: '#f97316', 
                    backgroundColor: currentChartType === 'bar' ? 'rgba(249, 115, 22, 0.7)' : 'rgba(249, 115, 22, 0.1)',
                    borderWidth: 2, 
                    fill: currentChartType === 'line'
                },
                { 
                    label: window.t('maintenance'), 
                    data: maintenanceData, 
                    borderColor: '#3b82f6', 
                    backgroundColor: currentChartType === 'bar' ? 'rgba(59, 130, 246, 0.7)' : 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2, 
                    fill: currentChartType === 'line'
                },
                { 
                    label: window.t('reparations'), 
                    data: reparationData, 
                    borderColor: '#ef4444', 
                    backgroundColor: currentChartType === 'bar' ? 'rgba(239, 68, 68, 0.7)' : 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2, 
                    fill: currentChartType === 'line'
                },
                { 
                    label: window.t('lbl_purchases'), 
                    data: purchasesData, 
                    borderColor: '#10b981', 
                    backgroundColor: currentChartType === 'bar' ? 'rgba(16, 185, 129, 0.7)' : 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2, 
                    fill: currentChartType === 'line',
                    hidden: true 
                }
            ]
        },
        options: { 
            responsive: true, 
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { 
                legend: { labels: { color: '#94a3b8', font: { size: 11 } }, position: 'top' },
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
                    grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false }, 
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
                    grid: { display: false, drawBorder: false }, 
                    ticks: { color: '#94a3b8', maxRotation: 45 } 
                } 
            } 
        }
    };

    mainChartInstance = new Chart(ctx, chartConfig);
}

async function loadVehicleStatusChart(data) {
    const canvas = getDashEl('statusChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (statusChartInstance) {
        statusChartInstance.destroy();
        statusChartInstance = null;
    }

    let labels = [window.t('status_available'), window.t('status_mission'), window.t('status_maintenance')];
    let counts = [0, 0, 0];
    
    if (data && data.vehicle_status) {
        counts = [
            data.vehicle_status.available || 0,
            data.vehicle_status.in_use || 0,
            data.vehicle_status.maintenance || 0
        ];
    }
    
    const bgColors = ['#10b981', '#3b82f6', '#ef4444'];
    const hoverColors = ['#34d399', '#60a5fa', '#f87171'];

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
    const canvas = getDashEl('expenseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (expenseChartInstance) {
        expenseChartInstance.destroy();
        expenseChartInstance = null;
    }

    let fuel = 0;
    let maintenance = 0;
    let reparation = 0;
    let purchases = 0;
    
    if (expenseData) {
        fuel = expenseData.total_fuel_cost || 0;
        maintenance = expenseData.total_maintenance_cost || 0;
        reparation = expenseData.total_reparation_cost || 0;
        purchases = expenseData.total_vehicle_purchase_cost || 0;
    }
    
    const total = fuel + maintenance + reparation + purchases;
    
    const fuelPercent = total > 0 ? ((fuel / total) * 100).toFixed(1) : 0;
    const maintenancePercent = total > 0 ? ((maintenance / total) * 100).toFixed(1) : 0;
    const reparationPercent = total > 0 ? ((reparation / total) * 100).toFixed(1) : 0;
    const purchasesPercent = total > 0 ? ((purchases / total) * 100).toFixed(1) : 0;
    
    const fuelPercentEl = getDashEl('fuel-percent');
    const maintenancePercentEl = getDashEl('maintenance-percent');
    const reparationPercentEl = getDashEl('reparation-percent');
    const purchasesPercentEl = getDashEl('purchases-percent');
    
    if (fuelPercentEl) fuelPercentEl.innerText = `${fuelPercent}%`;
    if (maintenancePercentEl) maintenancePercentEl.innerText = `${maintenancePercent}%`;
    if (reparationPercentEl) reparationPercentEl.innerText = `${reparationPercent}%`;
    if (purchasesPercentEl) purchasesPercentEl.innerText = `${purchasesPercent}%`;

    const labels = [window.t('fuel'), window.t('maintenance'), window.t('reparations'), window.t('lbl_purchases')];

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { 
            labels: labels, 
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
                        label: (context) => {
                            const value = context.raw;
                            const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${formatBIF(value)} (${percent}%)`;
                        }
                    }
                }
            }
        }
    });
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
        showToast(window.t('msg_validation_fail'), 'error');
        return;
    }
    
    const startDate = new Date(startDateInput.value);
    const endDate = new Date(endDateInput.value);
    
    if (startDate > endDate) {
        showToast(window.t('msg_validation_fail'), 'error');
        return;
    }
    
    loadDashboardData();
}

function toggleChartType() {
    currentChartType = currentChartType === 'line' ? 'bar' : 'line';
    
    const toggleButton = getDashEl('chartTypeToggle');
    if (toggleButton) {
        const icon = currentChartType === 'line' ? 'bar-chart-2' : 'trending-up';
        const text = currentChartType === 'line' ? window.t('btn_bar') : window.t('btn_line');
        toggleButton.innerHTML = `<i data-lucide="${icon}" class="w-3 h-3"></i> ${text}`;
        
        if (window.lucide) window.lucide.createIcons();
    }
    
    const dateRange = getDateRangeForPeriod(currentPeriod);
    window.fetchWithAuth(
        `/analytics-data/expense-summary?start_date=${dateRange.start}&end_date=${dateRange.end}&detailed=true`
    ).then(monthlyExpenseData => {
        loadMonthlyChart(monthlyExpenseData);
    }).catch(console.error);
}

function refreshDashboard() {
    const refreshButtons = document.querySelectorAll('button');
    refreshButtons.forEach(btn => {
        if(btn.innerText.includes(window.t('btn_refresh'))) {
            const icon = btn.querySelector('i');
            if (icon) {
                icon.classList.add('animate-spin');
                setTimeout(() => icon.classList.remove('animate-spin'), 1000);
            }
        }
    });
    loadDashboardData();
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
                if (el.textContent === '0' || el.textContent.includes('BIF')) {
                    el.textContent = '...';
                }
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
                    <p class="text-slate-400 text-sm">${window.t('msg_connection_fail')}</p>
                    <button onclick="refreshDashboard()" class="mt-2 text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 mx-auto">
                        <i data-lucide="refresh-cw" class="w-3 h-3"></i> ${window.t('btn_refresh')}
                    </button>
                </div>
            </div>
        `;
    }
}

function showToast(message, type = 'info') {
    const toastContainer = getDashEl('toast-container');
    if (!toastContainer) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
        document.body.appendChild(container);
    }
    
    const finalContainer = getDashEl('toast-container') || document.getElementById('toast-container');
    if (!finalContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-up ${
        type === 'error' ? 'bg-red-500' : 
        type === 'success' ? 'bg-green-500' : 'bg-blue-500'
    }`;
    toast.textContent = message;
    
    finalContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
    }, 3000);
}

// =================================================================
// 7. RESPONSIVE HANDLING
// =================================================================

function handleDashboardResize() {
    if (mainChartInstance) mainChartInstance.resize();
    if (statusChartInstance) statusChartInstance.resize();
    if (expenseChartInstance) expenseChartInstance.resize();
}

if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleDashboardResize);
}

// =================================================================
// 8. CLEANUP FUNCTION
// =================================================================

window.cleanupDashboard = function() {
    if (mainChartInstance) { mainChartInstance.destroy(); mainChartInstance = null; }
    if (statusChartInstance) { statusChartInstance.destroy(); statusChartInstance = null; }
    if (expenseChartInstance) { expenseChartInstance.destroy(); expenseChartInstance = null; }
    
    const periodSelect = getDashEl('dashboardPeriod');
    if (periodSelect) periodSelect.removeEventListener('change', handlePeriodChange);
    
    const chartToggle = getDashEl('chartTypeToggle');
    if (chartToggle) chartToggle.removeEventListener('click', toggleChartType);
    
    window.removeEventListener('resize', handleDashboardResize);
};

// Initialize if loaded directly
if (document.readyState === 'complete' && window.location.hash === '#dashboard') {
    setTimeout(initDashboard, 100);
}