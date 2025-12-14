let mainChartInstance = null;
let statusChartInstance = null;

// This function is called by the router when #dashboard is loaded
async function initDashboard() {
    console.log("Initializing Dashboard...");
    await loadDashboardData();
}

async function loadDashboardData() {
    try {
        // Use the global fetchWithAuth defined later (or we define it here if needed)
        // For now, assume fetchWithAuth is available globally from router or main script
        
        // Mocking the fetch helper if not yet globally available for this specific file test
        const fetchAPI = window.fetchWithAuth || fetchWithAuth; 

        const [kpiData, alertsData, pendingData] = await Promise.all([
            fetchAPI('/dashboard-data/kpis'),
            fetchAPI('/dashboard-data/alerts'),
            fetchAPI('/requests/count/pending')
        ]);

        if(kpiData) {
            document.getElementById('kpi-vehicles').innerText = kpiData.total_vehicles;
            document.getElementById('kpi-fuel').innerText = `$${kpiData.fuel_cost_this_week}`;
        }
        if(alertsData) document.getElementById('kpi-alerts').innerText = alertsData.total_alerts;
        if(pendingData) document.getElementById('kpi-requests').innerText = pendingData.count;

        await loadMonthlyChart(fetchAPI);
        await loadVehicleStatusChart(fetchAPI);

    } catch (error) {
        console.error("Dashboard Load Error", error);
    }
}

async function loadMonthlyChart(fetchFn) {
    const data = await fetchFn('/dashboard-data/charts/monthly-activity?months_to_display=6');
    if (!data) return;
    const ctx = document.getElementById('mainChart').getContext('2d');
    if (mainChartInstance) mainChartInstance.destroy();

    mainChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                { label: 'Trips', data: data.trips, borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', borderWidth: 2, fill: true },
                { label: 'Maintenance', data: data.maintenances, borderColor: '#ef4444', borderDash: [5, 5], borderWidth: 2, pointRadius: 0 }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#94a3b8' } } }, scales: { y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }, x: { grid: { display: false }, ticks: { color: '#94a3b8' } } } }
    });
}

async function loadVehicleStatusChart(fetchFn) {
    const data = await fetchFn('/dashboard-data/charts/vehicle-status');
    if (!data) return;
    const ctx = document.getElementById('statusChart').getContext('2d');
    if (statusChartInstance) statusChartInstance.destroy();

    const bgColors = data.labels.map(l => (l==='Available'?'#10b981':l==='In Use'?'#3b82f6':'#ef4444'));

    statusChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: data.labels, datasets: [{ data: data.counts, backgroundColor: bgColors, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } }
    });
}