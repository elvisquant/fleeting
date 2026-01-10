/** 
 * analytics.js - Professional Fleet Analytics
 * Full Regeneration - No logic skipped.
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
    return { start: start.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
}

// 3. UI Updaters - FIXED PERCENTAGE DUPLICATION
function updateAnKPIs(data) {
    const f = data.total_fuel_cost || 0;
    const r = data.total_reparation_cost || 0;
    const m = data.total_maintenance_cost || 0;
    const p = data.total_vehicle_purchase_cost || 0;
    const total = f + r + m + p;

    // Set Currency Values
    const setVal = (id, val) => { const el = getAnEl(id); if (el) el.innerText = formatBIF(val); };
    setVal('kpiFuelTotal', f);
    setVal('kpiReparationTotal', r);
    setVal('kpiMaintenanceTotal', m);
    setVal('kpiVehiclePurchaseTotal', p);
    
    // Logic to update both KPI cards AND Doughnut legend with same percentages
    const syncPerc = (idPrefix, val) => {
        const perc = total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%';
        const kpiEl = getAnEl(idPrefix + '-percent');
        const legendEl = getAnEl(idPrefix + '-legend-percent');
        if (kpiEl) kpiEl.innerText = perc;
        if (legendEl) legendEl.innerText = perc;
    };

    syncPerc('fuel', f);
    syncPerc('reparation', r);
    syncPerc('maintenance', m);
    syncPerc('purchases', p);
}

function renderAnCharts(data) {
    // Trend Chart - Upgraded to LINE chart for trend visibility
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
                        label: 'Fuel', 
                        data: sorted.map(i => i.fuel_cost), 
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 4
                    },
                    { 
                        label: 'Repairs', 
                        data: sorted.map(i => i.reparation_cost), 
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 4
                    },
                    { 
                        label: 'Maintenance', 
                        data: sorted.map(i => i.maintenance_cost), 
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        fill: true,
                        tension: 0.4,
                        borderWidth: 3,
                        pointRadius: 4
                    }
                ]
            },
            options: {
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { 
                        beginAtZero: true,
                        ticks: { color: '#94a3b8', callback: (v) => v.toLocaleString() }, 
                        grid: { color: 'rgba(255,255,255,0.05)' } 
                    },
                    x: { 
                        ticks: { color: '#94a3b8' }, 
                        grid: { display: false } 
                    }
                }
            }
        });
    }

    // Distribution Chart
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
                    borderWidth: 0,
                    hoverOffset: 15
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
}

function updateQuickStats(data) {
    const total = data.total_fuel_cost + data.total_reparation_cost + data.total_maintenance_cost;
    const avg = getAnEl('avgMonthlyCost');
    if (avg) avg.innerText = formatBIF(total / (data.monthly_breakdown.length || 1));

    const high = getAnEl('highestExpense');
    if (high) {
        const items = [
            { n: 'Fuel', v: data.total_fuel_cost }, 
            { n: 'Repairs', v: data.total_reparation_cost },
            { n: 'Maintenance', v: data.total_maintenance_cost }, 
            { n: 'Purchases', v: data.total_vehicle_purchase_cost }
        ];
        const top = items.reduce((prev, curr) => (prev.v > curr.v) ? prev : curr);
        high.innerText = top.v > 0 ? top.n : 'N/A';
    }
}

window.generateReport = async function () {
    const btn = getAnEl('generateReportBtn');
    const original = btn.innerHTML;
    try {
        btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...';
        btn.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        const range = getAnRange(currentAnalyticsPeriod);
        const format = getAnEl('reportFormat')?.value;

        const cats = [];
        if (getAnEl('reportCatFuel')?.checked) cats.push('fuel');
        if (getAnEl('reportCatReparation')?.checked) cats.push('reparation');
        if (getAnEl('reportCatMaintenance')?.checked) cats.push('maintenance');
        if (getAnEl('reportCatPurchases')?.checked) cats.push('purchases');

        if (cats.length === 0) return alert("Select at least one category");

        const catParams = cats.map(c => `categories=${c}`).join('&');
        const data = await window.fetchWithAuth(`/analytics-data/detailed-expense-records?start_date=${range.start}&end_date=${range.end}&${catParams}`);

        if (format === 'excel') generateExcel(data, cats);
        else generatePDF(data, cats, range);

    } catch (err) { console.error(err); }
    finally {
        btn.innerHTML = original;
        btn.disabled = false;
        if (window.lucide) window.lucide.createIcons();
    }
};

function generateExcel(data, cats) {
    if (!window.XLSX) return alert("Excel library not loaded");
    const wb = XLSX.utils.book_new();
    if (cats.includes('fuel')) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.fuel_records), "Fuel");
    if (cats.includes('reparation')) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.reparation_records), "Reparations");
    if (cats.includes('maintenance')) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.maintenance_records), "Maintenance");
    if (cats.includes('purchases')) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.purchase_records), "Purchases");
    XLSX.writeFile(wb, `Fleet_Report_${new Date().getTime()}.xlsx`);
}

function generatePDF(data, cats, range) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Fleet Expense Report", 14, 20);
    doc.setFontSize(10);
    doc.text(`Period: ${range.start} to ${range.end}`, 14, 28);

    let y = 40;
    const addTable = (title, headers, rows) => {
        if (!rows || rows.length === 0) return;
        doc.setFontSize(12);
        doc.text(title, 14, y);
        doc.autoTable({ startY: y + 5, head: [headers], body: rows, theme: 'grid', headStyles: { fillColor: [30, 41, 59] } });
        y = doc.autoTable.previous.finalY + 15;
    };

    if (cats.includes('fuel')) addTable("Fuel Records", ["Vehicle", "Date", "Qty", "Cost"], data.fuel_records.map(r => [r.vehicle_plate, r.date, r.quantity, r.cost]));
    if (cats.includes('reparation')) addTable("Reparation Records", ["Vehicle", "Date", "Provider", "Cost"], data.reparation_records.map(r => [r.vehicle_plate, r.repair_date, r.provider, r.cost]));
    doc.save(`Fleet_Report_${new Date().getTime()}.pdf`);
}

function formatBIF(amt) {
    return `BIF ${(amt || 0).toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
}

function setAnLoading(isLoading) {
    const ids = ['kpiFuelTotal', 'kpiReparationTotal', 'kpiMaintenanceTotal', 'kpiVehiclePurchaseTotal'];
    ids.forEach(id => {
        const el = getAnEl(id);
        if (el) isLoading ? el.classList.add('animate-pulse', 'opacity-50') : el.classList.remove('animate-pulse', 'opacity-50');
    });
}

window.initAnalytics = initAnalytics;