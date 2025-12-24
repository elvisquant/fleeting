// app/static/js/dashboard.js

let mainChartInstance = null;
let statusChartInstance = null;
let expenseChartInstance = null;
let currentChartType = 'line'; 
let currentPeriod = 'month';

// Safe DOM element selector
function getDashEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

// Fixed Date Parser to avoid "Invalid Date"
function parseMonthYear(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    const formatted = parts.length === 2 ? `${dateStr}-01` : dateStr;
    const date = new Date(formatted);
    return isNaN(date.getTime()) ? new Date() : date;
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
    if (periodSelect) periodSelect.addEventListener('change', (e) => {
        currentPeriod = e.target.value;
        const custom = getDashEl('customDateRange');
        if (currentPeriod === 'custom') custom?.classList.remove('hidden');
        else { custom?.classList.add('hidden'); loadDashboardData(); }
    });
    
    const chartToggle = getDashEl('chartTypeToggle');
    if (chartToggle) chartToggle.addEventListener('click', toggleChartType);
    
    window.refreshDashboard = loadDashboardData;
}

function setupDateInputs() {
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(today.getMonth() - 1);
    const s = getDashEl('startDate');
    const e = getDashEl('endDate');
    if (s) s.value = lastMonth.toISOString().split('T')[0];
    if (e) e.value = today.toISOString().split('T')[0];
}

// =================================================================
// 2. DATA LOADING
// =================================================================

async function loadDashboardData() {
    try {
        setLoadingStates(true);
        const range = getDateRangeForPeriod(currentPeriod);
        
        const [kpi, alertsSum, pending, expSum, vStatus, recent] = await Promise.all([
            window.fetchWithAuth('/dashboard-data/kpis'),
            window.fetchWithAuth('/dashboard-data/alerts'),
            window.fetchWithAuth('/requests/count/pending'),
            window.fetchWithAuth(`/analytics-data/expense-summary?start_date=${range.start}&end_date=${range.end}`),
            window.fetchWithAuth('/dashboard-data/charts/vehicle-status'),
            window.fetchWithAuth('/dashboard-data/recent-alerts')
        ]);

        const detailedExp = await window.fetchWithAuth(
            `/analytics-data/expense-summary?start_date=${range.start}&end_date=${range.end}&detailed=true`
        );

        updateKPIDisplay(kpi, alertsSum, pending, expSum);
        updateRecentAlerts(recent);
        
        await loadMonthlyChart(detailedExp);
        await loadVehicleStatusChart(vStatus);
        await loadExpenseChart(expSum);

    } catch (err) {
        console.error("Dashboard Load Error:", err);
    } finally {
        setLoadingStates(false);
    }
}

function getDateRangeForPeriod(p) {
    const today = new Date();
    const start = new Date();
    if (p === 'week') start.setDate(today.getDate() - 7);
    else if (p === 'quarter') start.setMonth(today.getMonth() - 3);
    else if (p === 'year') start.setFullYear(today.getFullYear() - 1);
    else if (p === 'custom') return { start: getDashEl('startDate')?.value, end: getDashEl('endDate')?.value };
    else start.setMonth(today.getMonth() - 1); // default month
    return { start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
}

// =================================================================
// 3. UI UPDATERS
// =================================================================

function updateKPIDisplay(kpi, alerts, pending, expense) {
    const getSet = (id, val) => { const el = getDashEl(id); if(el) el.innerText = val; };
    
    getSet('kpi-vehicles', kpi?.total_vehicles || '0');
    getSet('kpi-alerts', alerts?.total_alerts || '0'); // Active Pannes Count
    getSet('kpi-requests', pending?.count || '0');
    getSet('kpi-purchases', formatBIF(kpi?.total_purchase_cost || 0));
    getSet('kpi-fuel', formatBIF(kpi?.fuel_cost_this_week || expense?.total_fuel_cost || 0));

    if (expense) {
        const total = (expense.total_fuel_cost || 0) + (expense.total_reparation_cost || 0) + 
                      (expense.total_maintenance_cost || 0) + (expense.total_vehicle_purchase_cost || 0);
        getSet('kpi-total-expenses', formatBIF(total));
        getSet('kpi-maintenance', formatBIF(expense.total_maintenance_cost || 0));
        getSet('kpi-reparation', formatBIF(expense.total_reparation_cost || 0));
    }
}

function updateRecentAlerts(alerts) {
    const container = getDashEl('recentAlerts');
    if (!container) return;
    if (!alerts || alerts.length === 0) {
        container.innerHTML = `<p class="text-slate-500 text-center py-8">No recent pannes</p>`;
        return;
    }
    container.innerHTML = alerts.map(a => `
        <div class="flex items-center justify-between p-3 rounded-xl bg-slate-800/30 border border-slate-700/50">
            <div class="flex items-center gap-3">
                <div class="p-2 rounded-lg bg-slate-800"><i data-lucide="alert-circle" class="w-4 h-4 text-red-400"></i></div>
                <div>
                    <p class="text-sm font-medium text-white">${a.plate_number}</p>
                    <p class="text-xs text-slate-400">${a.message}</p>
                </div>
            </div>
            <span class="text-[10px] uppercase font-bold px-2 py-1 rounded ${a.status === 'active' ? 'bg-orange-500/10 text-orange-400' : 'bg-green-500/10 text-green-400'}">
                ${a.status}
            </span>
        </div>`).join('');
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 4. CHARTS
// =================================================================

async function loadMonthlyChart(data) {
    const ctx = getDashEl('mainChart')?.getContext('2d');
    if (!ctx) return;
    if (mainChartInstance) mainChartInstance.destroy();

    let labels = [], fuel = [], maint = [], rep = [];
    if (data?.monthly_breakdown) {
        const sorted = data.monthly_breakdown.sort((a, b) => parseMonthYear(a.month_year) - parseMonthYear(b.month_year));
        labels = sorted.map(i => parseMonthYear(i.month_year).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
        fuel = sorted.map(i => i.fuel_cost || 0);
        maint = sorted.map(i => i.maintenance_cost || 0);
        rep = sorted.map(i => i.reparation_cost || 0);
    }

    mainChartInstance = new Chart(ctx, {
        type: currentChartType,
        data: {
            labels: labels,
            datasets: [
                { label: 'Fuel', data: fuel, borderColor: '#f97316', backgroundColor: 'rgba(249, 115, 22, 0.1)', fill: true },
                { label: 'Maintenance', data: maint, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', fill: true },
                { label: 'Reparation', data: rep, borderColor: '#f59e0b', backgroundColor: 'rgba(245, 158, 11, 0.1)', fill: true }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8' } } },
            scales: {
                y: { ticks: { color: '#94a3b8', callback: v => v.toLocaleString() }, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
            }
        }
    });
}

async function loadVehicleStatusChart(data) {
    const ctx = getDashEl('statusChart')?.getContext('2d');
    if (!ctx) return;
    if (statusChartInstance) statusChartInstance.destroy();

    const labels = data?.labels || ['Available', 'Maintenance', 'Panne', 'Reparation'];
    const counts = data?.counts || [0, 0, 0, 0];

    // Update status UI numbers
    const setNum = (id, idx) => { const el = getDashEl(id); if(el) el.innerText = counts[idx] || 0; };
    setNum('available-count', 0); 
    // Note: We'll map the UI IDs to our data array
    const maintEl = getDashEl('maintenance-count'); if(maintEl) maintEl.innerText = counts[1];
    const panneEl = getDashEl('panne-count'); if(panneEl) panneEl.innerText = counts[2];
    const repEl = getDashEl('reparation-count'); if(repEl) repEl.innerText = counts[3];

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{ 
                data: counts, 
                backgroundColor: ['#10b981', '#3b82f6', '#ef4444', '#f59e0b'], 
                borderWidth: 0 
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });
}

async function loadExpenseChart(data) {
    const ctx = getDashEl('expenseChart')?.getContext('2d');
    if (!ctx) return;
    if (expenseChartInstance) expenseChartInstance.destroy();

    const f = data?.total_fuel_cost || 0, m = data?.total_maintenance_cost || 0, 
          r = data?.total_reparation_cost || 0, p = data?.total_vehicle_purchase_cost || 0;
    const total = f + m + r + p;

    const setPct = (id, val) => { const el = getDashEl(id); if(el) el.innerText = total > 0 ? ((val/total)*100).toFixed(1)+'%' : '0%'; };
    setPct('fuel-percent', f); setPct('maintenance-percent', m); setPct('reparation-percent', r); setPct('purchases-percent', p);

    expenseChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Fuel', 'Maint', 'Repair', 'Purchases'],
            datasets: [{ data: [f, m, r, p], backgroundColor: ['#f97316', '#3b82f6', '#ef4444', '#10b981'], borderWidth: 0 }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false } } }
    });
}

// =================================================================
// 5. UTILS
// =================================================================

function toggleChartType() {
    currentChartType = currentChartType === 'line' ? 'bar' : 'line';
    loadDashboardData();
}

function formatBIF(amt) {
    return `BIF ${(amt || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

function setLoadingStates(loading) {
    ['kpi-vehicles', 'kpi-alerts', 'kpi-fuel', 'kpi-total-expenses', 'kpi-purchases'].forEach(id => {
        const el = getDashEl(id); if(el) loading ? el.classList.add('animate-pulse', 'opacity-50') : el.classList.remove('animate-pulse', 'opacity-50');
    });
}

window.applyCustomDateRange = loadDashboardData;

if (window.location.hash === '#dashboard') {
    setTimeout(initDashboard, 100);
}