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
    setupDateInputs();
    await loadDashboardData();
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
        
        // Parallel fetching for performance
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
            kpiData, 
            alertsSummary, 
            pendingData, 
            expenseSummary, 
            vehicleStatus, 
            recentAlerts
        ] = await Promise.all(fetchPromises);
        
        const monthlyExpenseData = await monthlyDataPromise;

        // 1. Update Top KPI Row
        updateKPIDisplay(kpiData, alertsSummary, pendingData, expenseSummary);
        
        // 2. Update Charts
        await loadMonthlyChart(monthlyExpenseData);
        await loadVehicleStatusChart(vehicleStatus);
        await loadExpenseChart(expenseSummary);
        
        // 3. Update Recent Alerts List (The UI at the bottom)
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
            const startIn = getDashEl('startDate');
            const endIn = getDashEl('endDate');
            return {
                start: startIn?.value || today.toISOString().split('T')[0],
                end: endIn?.value || today.toISOString().split('T')[0]
            };
        default: start.setMonth(today.getMonth() - 1);
    }
    return {
        start: start.toISOString().split('T')[0],
        end: today.toISOString().split('T')[0]
    };
}

// =================================================================
// 3. UI UPDATERS
// =================================================================

function updateKPIDisplay(kpiData, alertsData, pendingData, expenseData) {
    // Basic KPI Elements
    const vehiclesEl = getDashEl('kpi-vehicles');
    const alertsEl = getDashEl('kpi-alerts');
    const requestsEl = getDashEl('kpi-requests');
    const fuelEl = getDashEl('kpi-fuel');
    const totalExpensesEl = getDashEl('kpi-total-expenses');
    const maintenanceEl = getDashEl('kpi-maintenance');
    const reparationEl = getDashEl('kpi-reparation');
    const purchasesEl = getDashEl('kpi-purchases');
    const expensePeriodEl = getDashEl('expense-period');
    
    // Update Counts
    if (vehiclesEl) vehiclesEl.innerText = kpiData?.total_vehicles || '0';
    if (alertsEl) alertsEl.innerText = alertsData?.total_alerts || '0';
    if (requestsEl) requestsEl.innerText = pendingData?.count || '0';
    
    // Fuel Cost - Priority: KPI data (weekly) then expense summary
    let fuelCost = kpiData?.fuel_cost_this_week || expenseData?.total_fuel_cost || 0;
    if (fuelEl) fuelEl.innerText = formatBIF(fuelCost);
    
    // Total & Category Expenses
    if (expenseData) {
        const total = (expenseData.total_fuel_cost || 0) + 
                      (expenseData.total_reparation_cost || 0) + 
                      (expenseData.total_maintenance_cost || 0) + 
                      (expenseData.total_vehicle_purchase_cost || 0);
        
        if (totalExpensesEl) totalExpensesEl.innerText = formatBIF(total);
        if (maintenanceEl) maintenanceEl.innerText = formatBIF(expenseData.total_maintenance_cost || 0);
        if (reparationEl) reparationEl.innerText = formatBIF(expenseData.total_reparation_cost || 0);
    }

    // NEW: Real Purchase Data from kpiData
    if (purchasesEl) {
        purchasesEl.innerText = formatBIF(kpiData?.total_purchase_cost || 0);
    }
    
    if (expensePeriodEl) {
        const labels = { week: 'This week', month: 'This month', quarter: 'Last 3 months', half_year: 'Last 6 months', year: 'Last 12 months', custom: 'Custom period' };
        expensePeriodEl.innerText = labels[currentPeriod] || 'Selected period';
    }
}

function updateRecentAlerts(alerts) {
    const container = getDashEl('recentAlerts');
    if (!container) return;

    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center p-8 text-slate-500">
                <i data-lucide="bell-off" class="w-8 h-8 mb-2 opacity-20"></i>
                <p class="text-sm">No recent alerts found</p>
            </div>`;
        if(window.lucide) window.lucide.createIcons();
        return;
    }

    container.innerHTML = alerts.map(alert => {
        const isPanne = alert.entity_type === 'panne';
        const icon = isPanne ? 'alert-circle' : 'map-pin';
        const iconColor = isPanne ? 'text-red-400' : 'text-blue-400';
        
        // Status color logic
        let statusClass = "bg-slate-700 text-slate-300";
        const status = alert.status?.toLowerCase() || "";
        if (["active", "in_progress", "pending"].includes(status)) statusClass = "bg-orange-500/10 text-orange-400";
        if (["resolved", "completed", "fully_approved"].includes(status)) statusClass = "bg-green-500/10 text-green-400";

        return `
            <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800/50 transition-colors">
                <div class="flex items-center gap-3">
                    <div class="p-2 rounded-lg bg-slate-800">
                        <i data-lucide="${icon}" class="w-4 h-4 ${iconColor}"></i>
                    </div>
                    <div>
                        <p class="text-sm font-medium text-white">${alert.plate_number}</p>
                        <p class="text-xs text-slate-400">${alert.message}</p>
                    </div>
                </div>
                <span class="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md ${statusClass}">
                    ${alert.status.replace('_', ' ')}
                </span>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. CHARTS
// =================================================================

async function loadMonthlyChart(expenseData) {
    const canvas = getDashEl('mainChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (mainChartInstance) mainChartInstance.destroy();

    let labels = [], fuelData = [], maintenanceData = [], reparationData = [], purchasesData = [];
    
    if (expenseData?.monthly_breakdown?.length > 0) {
        const sorted = expenseData.monthly_breakdown.sort((a, b) => new Date(a.month_year) - new Date(b.month_year));
        labels = sorted.map(item => new Date(item.month_year).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
        fuelData = sorted.map(item => item.fuel_cost || 0);
        maintenanceData = sorted.map(item => item.maintenance_cost || 0);
        reparationData = sorted.map(item => item.reparation_cost || 0);
        purchasesData = sorted.map(item => item.purchase_cost || 0);
    }

    mainChartInstance = new Chart(ctx, {
        type: currentChartType,
        data: {
            labels: labels,
            datasets: [
                { label: 'Fuel', data: fuelData, borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', borderWidth: 2, fill: true },
                { label: 'Maintenance', data: maintenanceData, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, fill: true },
                { label: 'Reparations', data: reparationData, borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', borderWidth: 2, fill: true }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: {
                y: { ticks: { color: '#94a3b8', callback: v => 'BIF ' + v.toLocaleString() }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
            }
        }
    });
}

async function loadVehicleStatusChart(data) {
    const canvas = getDashEl('statusChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (statusChartInstance) statusChartInstance.destroy();

    const labels = data?.labels || ['Available', 'In Use', 'Maintenance'];
    const counts = data?.counts || [0, 0, 0];

    // Update the small counters below the chart
    const availableEl = getDashEl('available-count');
    const inUseEl = getDashEl('inuse-count');
    const maintenanceEl = getDashEl('maintenance-count');
    if (availableEl) availableEl.innerText = counts[0];
    if (inUseEl) inUseEl.innerText = counts[1];
    if (maintenanceEl) maintenanceEl.innerText = counts[2];

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: counts,
                backgroundColor: ['#10b981', '#3b82f6', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { display: false } }
        }
    });
}

async function loadExpenseChart(expenseData) {
    const canvas = getDashEl('expenseChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (expenseChartInstance) expenseChartInstance.destroy();

    const fuel = expenseData?.total_fuel_cost || 0;
    const maint = expenseData?.total_maintenance_cost || 0;
    const rep = expenseData?.total_reparation_cost || 0;
    const pur = expenseData?.total_vehicle_purchase_cost || 0;
    const total = fuel + maint + rep + pur;

    const updatePct = (id, val) => {
        const el = getDashEl(id);
        if (el) el.innerText = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
    };

    updatePct('fuel-percent', fuel);
    updatePct('maintenance-percent', maint);
    updatePct('reparation-percent', rep);
    updatePct('purchases-percent', pur);

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Fuel', 'Maintenance', 'Reparations', 'Purchases'],
            datasets: [{
                data: [fuel, maint, rep, pur],
                backgroundColor: ['#f97316', '#3b82f6', '#ef4444', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { legend: { display: false } }
        }
    });
}

// =================================================================
// 5. HANDLERS & UTILS
// =================================================================

function handlePeriodChange(e) {
    currentPeriod = e.target.value;
    const customRange = getDashEl('customDateRange');
    if (currentPeriod === 'custom') {
        customRange?.classList.remove('hidden');
    } else {
        customRange?.classList.add('hidden');
        loadDashboardData();
    }
}

function applyCustomDateRange() {
    loadDashboardData();
}

function toggleChartType() {
    currentChartType = currentChartType === 'line' ? 'bar' : 'line';
    const btn = getDashEl('chartTypeToggle');
    if (btn) btn.innerHTML = `<i data-lucide="${currentChartType === 'line' ? 'bar-chart-2' : 'trending-up'}" class="w-3 h-3"></i> ${currentChartType === 'line' ? 'Bar' : 'Line'}`;
    if (window.lucide) window.lucide.createIcons();
    loadDashboardData();
}

function refreshDashboard() {
    loadDashboardData();
}

function formatBIF(amount) {
    return `BIF ${(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function setLoadingStates(isLoading) {
    const els = ['kpi-vehicles', 'kpi-alerts', 'kpi-fuel', 'kpi-requests', 'kpi-total-expenses', 'kpi-purchases'];
    els.forEach(id => {
        const el = getDashEl(id);
        if (el) isLoading ? el.classList.add('animate-pulse', 'opacity-50') : el.classList.remove('animate-pulse', 'opacity-50');
    });
}

function showErrorState() {
    const container = getDashEl('recentAlerts');
    if (container) container.innerHTML = `<p class="text-red-400 text-center py-4 text-sm">Error loading data. Please refresh.</p>`;
}

// =================================================================
// 6. CLEANUP
// =================================================================

window.cleanupDashboard = function() {
    if (mainChartInstance) mainChartInstance.destroy();
    if (statusChartInstance) statusChartInstance.destroy();
    if (expenseChartInstance) expenseChartInstance.destroy();
};

window.applyCustomDateRange = applyCustomDateRange;

// Self-init if hash is present
if (window.location.hash === '#dashboard') {
    setTimeout(initDashboard, 100);
}