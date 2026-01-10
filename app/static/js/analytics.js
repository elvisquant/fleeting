/** 
 * analytics.js - Professional Fleet Analytics
 * Handles dynamic charts, percentages, and responsive UI.
 */

let monthlyChart = null;
let distributionChart = null;
let currentAnalyticsPeriod = 'last12months';

// Element Selector (SPA & Mobile Compatible)
function getAnEl(id) {
    if (window.innerWidth < 768) {
        const mobileEl = document.querySelector('#app-content-mobile #' + id);
        if (mobileEl) return mobileEl;
    }
    const desktopEl = document.querySelector('#app-content #' + id);
    if (desktopEl) return desktopEl;
    return document.getElementById(id);
}

// 1. Initialization
async function initAnalytics() {
    console.log("Analytics: Initializing Dashboard");
    attachAnalyticsListeners();
    setupDefaultDates();
    await loadAnalyticsData();
}

function attachAnalyticsListeners() {
    const periodSelect = getAnEl('reportPeriod');
    if (periodSelect) {
        periodSelect.addEventListener('change', (e) => {
            currentAnalyticsPeriod = e.target.value;
            const custom = getAnEl('customReportDateContainer');
            if (currentAnalyticsPeriod === 'custom') {
                custom?.classList.remove('hidden');
            } else {
                custom?.classList.add('hidden');
                loadAnalyticsData();
            }
        });
    }

    const applyBtn = getAnEl('applyCustomDateBtn');
    if (applyBtn) applyBtn.addEventListener('click', loadAnalyticsData);

    const genBtn = getAnEl('generateReportBtn');
    if (genBtn) genBtn.addEventListener('click', window.generateReport);
}

function setupDefaultDates() {
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 1);
    const s = getAnEl('reportCustomStart');
    const e = getAnEl('reportCustomEnd');
    if (s) s.value = start.toISOString().split('T')[0];
    if (e) e.value = today.toISOString().split('T')[0];
}

// 2. Data Loading
async function loadAnalyticsData() {
    try {
        setAnLoading(true);
        const range = getAnRange(currentAnalyticsPeriod);
        const data = await window.fetchWithAuth(`/analytics-data/expense-summary?start_date=${range.start}&end_date=${range.end}`);

        if (data) {
            updateAnKPIs(data);
            renderAnCharts(data);
            updateQuickStats(data);
        }
    } catch (err) {
        console.error("Analytics Load Failed:", err);
    } finally {
        setAnLoading(false);
    }
}

function getAnRange(p) {
    const today = new Date();
    const start = new Date();
    if (p === 'last30days') start.setDate(today.getDate() - 30);
    else if (p === 'last90days') start.setDate(today.getDate() - 90);
    else if (p === 'last6months') start.setMonth(today.getMonth() - 6);
    else if (p === 'currentYear') start.setMonth(0, 1);
    else if (p === 'custom') return { start: getAnEl('reportCustomStart')?.value, end: getAnEl('reportCustomEnd')?.value };
    else start.setFullYear(today.getFullYear() - 1);
    
    return { 
        start: start.toISOString().split('T')[0], 
        end: today.toISOString().split('T')[0] 
    };
}

// 3. UI Updaters
function updateAnKPIs(data) {
    const f = data.total_fuel_cost || 0;
    const r = data.total_reparation_cost || 0;
    const m = data.total_maintenance_cost || 0;
    const p = data.total_vehicle_purchase_cost || 0;
    const total = f + r + m + p;

    // Helper to format currency
    const setVal = (id, val) => { const el = getAnEl(id); if (el) el.innerText = formatBIF(val); };
    
    // Helper to set percentage (used in both KPI cards and Doughnut legend)
    const setPerc = (classSuffix, val) => {
        const percentage = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
        // Set in KPI cards
        const kpiEl = getAnEl(classSuffix + '-percent');
        if (kpiEl) kpiEl.innerText = percentage;
        // Set in Doughnut Legend
        const legEl = getAnEl(classSuffix + '-legend-percent');
        if (legEl) legEl.innerText = percentage;
    };

    setVal('kpiFuelTotal', f);
    setVal('kpiReparationTotal', r);
    setVal('kpiMaintenanceTotal', m);
    setVal('kpiVehiclePurchaseTotal', p);

    setPerc('fuel', f);
    setPerc('reparation', r);
    setPerc('maintenance', m);
    setPerc('purchases', p);
}

function renderAnCharts(data) {
    // 1. Trend Chart (Line Chart for "Trends")
    const trendCtx = getAnEl('monthlyExpenseChart')?.getContext('2d');
    if (trendCtx) {
        if (monthlyChart) monthlyChart.destroy();
        const sorted = data.monthly_breakdown;
        
        monthlyChart = new Chart(trendCtx, {
            type: 'line',
            data: {
                labels: sorted.map(i => i.month_year),
                datasets: [
                    { 
                        label: 'Fuel', data: sorted.map(i => i.fuel_cost), 
                        borderColor: '#ef4444', backgroundColor: '#ef444422',
                        fill: true, tension: 0.4, borderWeight: 3
                    },
                    { 
                        label: 'Repairs', data: sorted.map(i => i.reparation_cost), 
                        borderColor: '#f59e0b', backgroundColor: '#f59e0b22',
                        fill: true, tension: 0.4, borderWeight: 3
                    },
                    { 
                        label: 'Maintenance', data: sorted.map(i => i.maintenance_cost), 
                        borderColor: '#3b82f6', backgroundColor: '#3b82f622',
                        fill: true, tension: 0.4, borderWeight: 3
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { ticks: { color: '#94a3b8', callback: (v) => v >= 1000 ? v/1000 + 'k' : v }, grid: { color: '#33415544' } },
                    x: { ticks: { color: '#94a3b8' }, grid: { display: false } }
                }
            }
        });
    }

    // 2. Distribution Chart
    const distCtx = getAnEl('expenseDistributionChart')?.getContext('2d');
    if (distCtx) {
        if (distributionChart) distributionChart.destroy();
        distributionChart = new Chart(distCtx, {
            type: 'doughnut',
            data: {
                labels: ['Fuel', 'Repair', 'Maintenance', 'Purchases'],
                datasets: [{
                    data: [data.total_fuel_cost, data.total_reparation_cost, data.total_maintenance_cost, data.total_vehicle_purchase_cost],
                    backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#10b981'],
                    borderWidth: 0, hoverOffset: 10
                }]
            },
            options: { 
                responsive: true, maintainAspectRatio: false, cutout: '75%', 
                plugins: { legend: { display: false } }
            }
        });
    }
}

function updateQuickStats(data) {
    const total = data.total_fuel_cost + data.total_reparation_cost + data.total_maintenance_cost;
    const avg = getAnEl('avgMonthlyCost');
    if (avg) avg.innerText = formatBIF(total / (data.monthly_breakdown.length || 1));

    const high = getAnEl('highestExpense');
    if (high) {
        const items = [
            { n: 'Fuel', v: data.total_fuel_cost }, { n: 'Repairs', v: data.total_reparation_cost },
            { n: 'Maintenance', v: data.total_maintenance_cost }, { n: 'Purchases', v: data.total_vehicle_purchase_cost }
        ];
        const top = items.reduce((prev, curr) => (prev.v > curr.v) ? prev : curr);
        high.innerText = top.v > 0 ? top.n : 'N/A';
    }
}

function formatBIF(amt) {
    return `BIF ${(amt || 0).toLocaleString()}`;
}

function setAnLoading(isLoading) {
    const el = getAnEl('analytics-container');
    if (el) isLoading ? el.classList.add('opacity-50', 'pointer-events-none') : el.classList.remove('opacity-50', 'pointer-events-none');
}

window.initAnalytics = initAnalytics;