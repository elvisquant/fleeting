// app/static/js/analytics.js

// =================================================================
// MOBILE-COMPATIBLE ELEMENT GETTER
// =================================================================
function getAnalyticsEl(id) {
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
// GLOBAL STATE
// =================================================================
let currentExpenseData = { 
    fuel: { total: 0, trend: [] }, 
    reparation: { total: 0, trend: [] }, 
    maintenance: { total: 0, trend: [] }, 
    purchases: { total: 0, trend: [] } 
};
let monthlyExpenseChartInstance = null;
let expenseDistributionChartInstance = null;

// =================================================================
// 1. INITIALIZATION (Called by router when #analytics is loaded)
// =================================================================

async function initAnalytics() {
    console.log("Analytics Module: Init");
    
    // Wait for DOM to be ready
    setTimeout(() => {
        // Attach event listeners
        attachAnalyticsListeners();
        
        // Initialize statistics page
        initializeStatisticsPage();
        
        // Fetch performance insights and alerts
        fetchPerformanceInsights();
        fetchAlertsAndNotifications();
        
        // Set theme icon
        setInitialThemeIcon();
        
        // Create icons
        if (window.lucide) window.lucide.createIcons();
        
        console.log("Analytics module initialized");
    }, 100);
}

// Attach all event listeners for analytics
function attachAnalyticsListeners() {
    // Theme toggle
    const themeToggleButtonHeader = getAnalyticsEl('theme-toggle-header');
    if (themeToggleButtonHeader) {
        themeToggleButtonHeader.addEventListener('click', () => { 
            document.documentElement.classList.toggle('dark'); 
            setInitialThemeIcon(); 
            const currentLabels = monthlyExpenseChartInstance?.config.data.labels || generateDynamicMonthLabels(12); 
            initializeStatisticsCharts(currentExpenseData, currentLabels); 
        });
    }
    
    // Report period change
    const reportPeriodSelect = getAnalyticsEl('reportPeriod');
    if (reportPeriodSelect) { 
        reportPeriodSelect.addEventListener('change', handleReportPeriodChange); 
        
        // Set default dates
        const today = new Date(); 
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]; 
        
        const customStart = getAnalyticsEl('reportCustomStart');
        const customEnd = getAnalyticsEl('reportCustomEnd');
        
        if (customStart) customStart.value = firstDayOfYear; 
        if (customEnd) customEnd.value = today.toISOString().split('T')[0]; 
    }

    // Custom date apply button
    const applyCustomDateBtn = getAnalyticsEl('applyCustomDateBtn');
    if (applyCustomDateBtn) applyCustomDateBtn.addEventListener('click', () => fetchAndDisplayDataForPeriod('custom'));

    // Generate report button - FIX: Add listener for generate report button
    const generateReportBtn = getAnalyticsEl('generateReportBtn');
    if (generateReportBtn) {
        generateReportBtn.addEventListener('click', window.generateReport);
        console.log("Generate report button listener attached");
    }
}

// =================================================================
// 2. UTILITY FUNCTIONS
// =================================================================

// Toast notification function
function showToast(message, duration = 3000, type = 'info') { 
    const container = getAnalyticsEl('toast-container');
    if (!container) {
        console.log(`${type}: ${message}`);
        return;
    }
    
    const toastElement = document.createElement('div');
    toastElement.textContent = message;
    toastElement.className = `toast-message ${type}`;
    container.appendChild(toastElement);
    setTimeout(() => {
        toastElement.style.opacity = '0';
        setTimeout(() => { toastElement.remove(); }, 300); 
    }, duration);
}

// Format BIF currency - FIX: Add compact formatting for large numbers
function formatBIF(amount) {
    const numAmount = Number(amount) || 0;
    
    // If amount is very large, use compact notation
    if (numAmount >= 1000000000) {
        return `BIF ${(numAmount / 1000000000).toFixed(1)}B`;
    } else if (numAmount >= 1000000) {
        return `BIF ${(numAmount / 1000000).toFixed(1)}M`;
    } else if (numAmount >= 1000) {
        return `BIF ${(numAmount / 1000).toFixed(1)}K`;
    } else {
        return `BIF ${numAmount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }
}

// New function: Format BIF with compact display for KPI boxes
function formatBIFCompact(amount) {
    const numAmount = Number(amount) || 0;
    
    // More aggressive compact formatting for KPI boxes
    if (numAmount >= 1000000000) {
        return `BIF ${(numAmount / 1000000000).toFixed(2)}B`;
    } else if (numAmount >= 1000000) {
        return `BIF ${(numAmount / 1000000).toFixed(2)}M`;
    } else if (numAmount >= 1000) {
        return `BIF ${(numAmount / 1000).toFixed(1)}K`;
    } else {
        return `BIF ${numAmount.toFixed(2)}`;
    }
}

// Theme functions
function setInitialThemeIcon() {
    const themeToggleButtonHeader = getAnalyticsEl('theme-toggle-header');
    if (!themeToggleButtonHeader) return;
    
    if (document.documentElement.classList.contains('dark')) {
        themeToggleButtonHeader.innerHTML = '<i data-lucide="sun" class="w-5 h-5"></i>';
    } else {
        themeToggleButtonHeader.innerHTML = '<i data-lucide="moon" class="w-5 h-5"></i>';
    }
    
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 3. STATISTICS PAGE FUNCTIONS
// =================================================================

// Initialize statistics page
function initializeStatisticsPage() {
    const periodSelect = getAnalyticsEl('reportPeriod');
    const defaultPeriod = periodSelect ? periodSelect.value : 'last12months';
    fetchAndDisplayDataForPeriod(defaultPeriod);
}

// Handle report period change
function handleReportPeriodChange(event) { 
    const period = event.target.value; 
    const customRangeContainer = getAnalyticsEl('customReportDateContainer'); 
    if (period === 'custom') { 
        if (customRangeContainer) {
            customRangeContainer.classList.remove('hidden'); 
            customRangeContainer.classList.add('flex'); 
        }
    } else { 
        if (customRangeContainer) {
            customRangeContainer.classList.add('hidden'); 
            customRangeContainer.classList.remove('flex'); 
        }
        fetchAndDisplayDataForPeriod(period); 
    } 
}

// Get date range for period
function getPeriodDateRange(period) { 
    const today = new Date(); 
    let startDate = new Date(); 
    let endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999); 
    
    switch (period) { 
        case 'last30days': startDate.setDate(today.getDate() - 29); break; 
        case 'last90days': startDate.setDate(today.getDate() - 89); break; 
        case 'last6months': startDate = new Date(today.getFullYear(), today.getMonth() - 5, 1); break; 
        case 'last12months': startDate = new Date(today.getFullYear() -1 , today.getMonth(), today.getDate() - (today.getDate() -1) +1); break; 
        case 'currentYear': startDate = new Date(today.getFullYear(), 0, 1); break; 
        case 'custom': 
            const cS = getAnalyticsEl('reportCustomStart');
            const cE = getAnalyticsEl('reportCustomEnd');
            const customStartValue = cS ? cS.value : '';
            const customEndValue = cE ? cE.value : '';
            
            if (!customStartValue || !customEndValue) { 
                showToast("Please select custom start and end dates.", 3000, "error"); 
                return null; 
            } 
            startDate = new Date(customStartValue); 
            endDate = new Date(customEndValue); 
            endDate.setHours(23,59,59,999); 
            if (startDate > endDate) { 
                showToast("Start date cannot be after end date.", 3000, "error"); 
                return null; 
            } 
            break; 
        default: startDate.setDate(today.getDate() - 29); 
    } 
    startDate.setHours(0,0,0,0); 
    return { startDate, endDate }; 
}

// Generate dynamic month labels
function generateDynamicMonthLabels(count, refEndDate = new Date()) { 
    const labels = []; 
    let currentDate = new Date(refEndDate.getFullYear(), refEndDate.getMonth(), 1); 
    for (let i = 0; i < count; i++) { 
        labels.unshift(currentDate.toLocaleString('default', { month: 'short', year: '2-digit' })); 
        currentDate.setMonth(currentDate.getMonth() - 1); 
    } 
    return labels; 
}

// Fetch and display data for period
async function fetchAndDisplayDataForPeriod(period) { 
    const range = getPeriodDateRange(period); 
    if (!range && period === 'custom') return; 
    
    const authToken = localStorage.getItem('access_token'); 
    if (!authToken) { 
        showToast("Authentication token not found. Please log in.", 5000, "error"); 
        return; 
    } 
    
    const startDateString = range.startDate.toISOString().split('T')[0]; 
    const endDateString = range.endDate.toISOString().split('T')[0]; 
    showToast("Fetching summary data...", 2000, "info"); 
    
    try { 
        const response = await fetch(`${API_BASE}/analytics-data/expense-summary?start_date=${startDateString}&end_date=${endDateString}`, { 
            method: 'GET', 
            headers: { 
                'Content-Type': 'application/json', 
                'Authorization': `Bearer ${authToken}` 
            } 
        }); 
        
        if (!response.ok) { 
            const errorData = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` })); 
            throw new Error(errorData.detail || `HTTP error! Status: ${response.status}`); 
        } 
        
        const apiData = await response.json(); 
        const transformedData = { 
            fuel: { total: apiData.total_fuel_cost || 0, trend: [] }, 
            reparation: { total: apiData.total_reparation_cost || 0, trend: [] }, 
            maintenance: { total: apiData.total_maintenance_cost || 0, trend: [] }, 
            purchases: { total: apiData.total_vehicle_purchase_cost || 0, trend: [] } 
        }; 
        
        const chartLabels = apiData.monthly_breakdown ? apiData.monthly_breakdown.map(item => item.month_year) : []; 
        
        if (apiData.monthly_breakdown) {
            apiData.monthly_breakdown.forEach(item => { 
                transformedData.fuel.trend.push(item.fuel_cost || 0); 
                transformedData.reparation.trend.push(item.reparation_cost || 0); 
                transformedData.maintenance.trend.push(item.maintenance_cost || 0); 
                transformedData.purchases.trend.push(item.purchase_cost || 0); 
            }); 
        }
        
        currentExpenseData = transformedData; 
        updateExpenseKPIs(currentExpenseData); 
        initializeStatisticsCharts(currentExpenseData, chartLabels); 
        updateQuickStats(currentExpenseData); 
        showToast("Data updated successfully.", 2000, "success"); 
    } catch (error) { 
        console.error('Error fetching or processing expense summary data:', error); 
        showToast(`Error: ${error.message}`, 5000, "error"); 
        const emptyData = { 
            fuel: {total:0,trend:[]}, 
            reparation:{total:0,trend:[]}, 
            maintenance:{total:0,trend:[]}, 
            purchases:{total:0,trend:[]} 
        }; 
        const emptyLabels = generateDynamicMonthLabels(1); 
        currentExpenseData = emptyData; 
        updateExpenseKPIs(emptyData); 
        initializeStatisticsCharts(emptyData, emptyLabels); 
        updateQuickStats(emptyData); 
    } 
}

// Update KPI elements - FIX: Use compact formatting to prevent overflow
function updateExpenseKPIs(data) { 
    const fuelTotalEl = getAnalyticsEl('kpiFuelTotal');
    const reparationTotalEl = getAnalyticsEl('kpiReparationTotal');
    const maintenanceTotalEl = getAnalyticsEl('kpiMaintenanceTotal');
    const purchaseTotalEl = getAnalyticsEl('kpiVehiclePurchaseTotal');
    
    if (fuelTotalEl) {
        fuelTotalEl.textContent = formatBIFCompact(data.fuel.total || 0); 
        // Add title with full amount for hover
        fuelTotalEl.setAttribute('title', formatBIF(data.fuel.total || 0));
    }
    
    if (reparationTotalEl) {
        reparationTotalEl.textContent = formatBIFCompact(data.reparation.total || 0); 
        reparationTotalEl.setAttribute('title', formatBIF(data.reparation.total || 0));
    }
    
    if (maintenanceTotalEl) {
        maintenanceTotalEl.textContent = formatBIFCompact(data.maintenance.total || 0); 
        maintenanceTotalEl.setAttribute('title', formatBIF(data.maintenance.total || 0));
    }
    
    if (purchaseTotalEl) {
        purchaseTotalEl.textContent = formatBIFCompact(data.purchases.total || 0); 
        purchaseTotalEl.setAttribute('title', formatBIF(data.purchases.total || 0));
    }
}

// Update quick stats
function updateQuickStats(data = currentExpenseData) { 
    const quickStatCostPerMileEl = getAnalyticsEl('quickStatCostPerMile');
    if (!quickStatCostPerMileEl) return;

    const totalFuelCostsForPeriod = data.fuel.total || 0; 
    const numberOfMonths = data.fuel.trend.length || 1; 
    const estimatedMilesPerMonthAverage = 1500; 
    const estimatedTotalMiles = numberOfMonths * estimatedMilesPerMonthAverage; 
    const costPerMileValue = `BIF ${(estimatedTotalMiles > 0 ? (totalFuelCostsForPeriod / estimatedTotalMiles) : 0).toFixed(2)}`;
    
    quickStatCostPerMileEl.textContent = costPerMileValue;
    
    const insightCostEl = getAnalyticsEl('insightCostPerMile'); 
    if (insightCostEl) {
        insightCostEl.textContent = costPerMileValue;
    }
}

// =================================================================
// 4. CHARTS
// =================================================================

// Initialize statistics charts
function initializeStatisticsCharts(data = currentExpenseData, labels = generateDynamicMonthLabels(12)) { 
    const isDarkMode = document.documentElement.classList.contains('dark'); 
    const gridColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'; 
    const labelColor = isDarkMode ? 'rgba(209,213,219,0.8)' : 'rgba(55,65,81,0.8)'; 
    const fuelColor = '#ef4444';
    const reparationColor = '#f59e0b';
    const maintenanceColor = '#6366f1';
    const purchaseColor = '#10b981';
    
    // Monthly Expense Chart
    const monthlyCanvas = getAnalyticsEl('monthlyExpenseChart');
    if (monthlyCanvas) { 
        const monthlyCtx = monthlyCanvas.getContext('2d'); 
        if (monthlyCtx) { 
            if (monthlyExpenseChartInstance) monthlyExpenseChartInstance.destroy(); 
            const trendLabels = labels.length > 0 ? labels : ['No Data']; 
            const fuelTrend = data.fuel.trend.length === trendLabels.length ? data.fuel.trend : Array(trendLabels.length).fill(0); 
            const reparationTrend = data.reparation.trend.length === trendLabels.length ? data.reparation.trend : Array(trendLabels.length).fill(0); 
            const maintenanceTrend = data.maintenance.trend.length === trendLabels.length ? data.maintenance.trend : Array(trendLabels.length).fill(0); 
            const purchasesTrend = data.purchases.trend.length === trendLabels.length ? data.purchases.trend : Array(trendLabels.length).fill(0); 
            
            monthlyExpenseChartInstance = new Chart(monthlyCtx, { 
                type: 'bar', 
                data: { 
                    labels: trendLabels, 
                    datasets: [ 
                        { label: 'Fuel', data: fuelTrend, backgroundColor: fuelColor, stack: 'Stack 0', borderRadius: 4 }, 
                        { label: 'Reparations', data: reparationTrend, backgroundColor: reparationColor, stack: 'Stack 0', borderRadius: 4 },  
                        { label: 'Maintenance', data: maintenanceTrend, backgroundColor: maintenanceColor, stack: 'Stack 0', borderRadius: 4 }, 
                        { label: 'Purchases', data: purchasesTrend, backgroundColor: purchaseColor, stack: 'Stack 1', borderRadius: 4 } 
                    ] 
                }, 
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    scales: { 
                        y: { 
                            beginAtZero: true, 
                            stacked: true, 
                            grid: { color: gridColor }, 
                            ticks: { 
                                color: labelColor, 
                                callback: value => {
                                    if (value >= 1000000) return `BIF ${(value/1000000).toFixed(1)}M`;
                                    if (value >= 1000) return `BIF ${(value/1000).toFixed(1)}k`;
                                    return `BIF ${value}`;
                                },
                                maxTicksLimit: 8 // Limit number of ticks
                            } 
                        }, 
                        x: { 
                            stacked: true, 
                            grid: { display: false }, 
                            ticks: { 
                                color: labelColor,
                                maxRotation: 45, // Rotate labels if needed
                                minRotation: 45
                            } 
                        } 
                    }, 
                    plugins: { 
                        legend: { 
                            position: 'top', 
                            labels: { 
                                color: labelColor, 
                                boxWidth: 12, 
                                padding: 15,
                                font: { size: 11 } // Smaller font for legend
                            } 
                        }, 
                        tooltip: { 
                            mode: 'index', 
                            intersect: false, 
                            backgroundColor: isDarkMode ? '#374151' : '#fff', 
                            titleColor: isDarkMode ? '#f3f4f6' : '#1f2937', 
                            bodyColor: isDarkMode ? '#d1d5db' : '#4b5563', 
                            callbacks: { 
                                label: ctx => `${ctx.dataset.label}: ${formatBIF(ctx.raw)}` 
                            }
                        } 
                    } 
                } 
            }); 
        } 
    } 
    
    // Expense Distribution Chart
    const distributionCanvas = getAnalyticsEl('expenseDistributionChart');
    if (distributionCanvas) { 
        const distributionCtx = distributionCanvas.getContext('2d'); 
        if (distributionCtx) { 
            if (expenseDistributionChartInstance) expenseDistributionChartInstance.destroy(); 
            const totalExpenses = (data.fuel.total || 0) + (data.reparation.total || 0) + (data.maintenance.total || 0) + (data.purchases.total || 0); 
            const hasData = totalExpenses > 0; 
            
            expenseDistributionChartInstance = new Chart(distributionCtx, { 
                type: 'doughnut', 
                data: { 
                    labels: hasData ? ['Fuel','Reparations','Maintenance','Purchases'] : ['No Data'], 
                    datasets: [{ 
                        label: 'Expense Distribution', 
                        data: hasData ? [data.fuel.total, data.reparation.total, data.maintenance.total, data.purchases.total] : [1], 
                        backgroundColor: hasData ? [fuelColor, reparationColor, maintenanceColor, purchaseColor] : [isDarkMode?'#4b5563':'#e5e7eb'], 
                        borderColor: isDarkMode?'#1f2937':'#fff', 
                        borderWidth: 3, 
                        hoverOffset: 8 
                    }] 
                }, 
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false, 
                    cutout: '60%', 
                    plugins: { 
                        legend: { 
                            display: hasData, 
                            position: 'bottom', 
                            labels: { 
                                color: labelColor, 
                                boxWidth: 12, 
                                padding: 15,
                                font: { size: 11 }
                            } 
                        }, 
                        tooltip: { 
                            enabled: hasData, 
                            backgroundColor: isDarkMode ? '#374151' : '#fff', 
                            titleColor: isDarkMode ? '#f3f4f6' : '#1f2937', 
                            bodyColor: isDarkMode ? '#d1d5db' : '#4b5563', 
                            callbacks: { 
                                label: ctx => `${ctx.label}: ${formatBIF(ctx.raw)} (${totalExpenses > 0 ? ((ctx.raw/totalExpenses)*100).toFixed(1) : 0}%)` 
                            }
                        } 
                    } 
                } 
            }); 
        } 
    } 
    
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 5. PERFORMANCE INSIGHTS & ALERTS
// =================================================================

// Fetch performance insights
async function fetchPerformanceInsights() {
    const authToken = localStorage.getItem('access_token');
    if (!authToken) { 
        console.error("Auth token not found for insights"); 
        const insightsList = getAnalyticsEl('keyPerformanceInsightsList');
        if (insightsList) insightsList.innerHTML = '<li class="text-xs text-danger-dark dark:text-danger-light p-2">Please log in to see insights.</li>';
        return; 
    }

    try {
        const response = await fetch(`${API_BASE}/dashboard-data/performance-insights`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Insights HTTP error! Status: ${response.status}` }));
            throw new Error(errorData.detail || `Insights HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        updatePerformanceInsightsUI(data);
    } catch (error) {
        console.error("Error fetching performance insights:", error);
        const insightsList = getAnalyticsEl('keyPerformanceInsightsList');
        if (insightsList) insightsList.innerHTML = `<li class="text-xs text-danger-dark dark:text-danger-light p-2">Could not load insights: ${error.message}</li>`;
    }
}

// Update performance insights UI
function updatePerformanceInsightsUI(data) {
    const insightsList = getAnalyticsEl('keyPerformanceInsightsList');
    if (!insightsList) return;
    
    insightsList.innerHTML = ''; 

    let fuelEffHtml = `<li class="flex items-start space-x-2">`;
    if (data.fuel_efficiency?.trend === "up") {
        fuelEffHtml += `<i data-lucide="trending-up" class="w-4 h-4 text-green-500 mt-0.5 shrink-0"></i>`;
    } else if (data.fuel_efficiency?.trend === "down") {
        fuelEffHtml += `<i data-lucide="trending-down" class="w-4 h-4 text-red-500 mt-0.5 shrink-0"></i>`;
    } else {
        fuelEffHtml += `<i data-lucide="minus" class="w-4 h-4 text-gray-500 mt-0.5 shrink-0"></i>`;
    }
    
    fuelEffHtml += `<span>Fuel Efficiency: <span class="font-medium">`;
    if (data.fuel_efficiency?.percentage_change !== null && data.fuel_efficiency?.percentage_change !== undefined) {
        fuelEffHtml += `${data.fuel_efficiency.percentage_change > 0 ? '+' : ''}${data.fuel_efficiency.percentage_change}%`;
    } else {
        fuelEffHtml += `N/A`;
    }
    fuelEffHtml += `</span> vs. last period.</span></li>`;
    
    insightsList.innerHTML += fuelEffHtml;

    insightsList.innerHTML += `
        <li class="flex items-start space-x-2">
            <i data-lucide="shield-check" class="w-4 h-4 text-blue-500 mt-0.5 shrink-0"></i>
            <span>Maintenance Compliance: <span class="font-medium">${data.maintenance_compliance?.total_maintenance_records || 0}</span> logged.</span>
        </li>`;
    
    insightsList.innerHTML += `
        <li class="flex items-start space-x-2">
            <i data-lucide="activity" class="w-4 h-4 text-yellow-500 mt-0.5 shrink-0"></i>
            <span>Idle Time: <span class="font-medium">Data N/A</span> (feature pending)</span>
        </li>`;

    insightsList.innerHTML += `
        <li class="flex items-start space-x-2">
            <i data-lucide="dollar-sign" class="w-4 h-4 text-gray-500 mt-0.5 shrink-0"></i>
            <span>Cost per Mile (Est.): <span class="font-medium" id="insightCostPerMile">BIF 0.00</span></span>
        </li>`;
    
    if (window.lucide) window.lucide.createIcons();
}

// Fetch alerts and notifications
async function fetchAlertsAndNotifications() {
    const authToken = localStorage.getItem('access_token');
    if (!authToken) { 
        console.error("Auth token not found for alerts"); 
        const alertsList = getAnalyticsEl('notificationsList');
        if (alertsList) alertsList.innerHTML = '<div class="text-xs text-danger-dark dark:text-danger-light p-2.5">Please log in to see alerts.</div>';
        const notificationCountSpan = getAnalyticsEl('notificationCount');
        if (notificationCountSpan) notificationCountSpan.textContent = '0';
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/dashboard-data/alerts`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `Alerts HTTP error! Status: ${response.status}` }));
            throw new Error(errorData.detail || `Alerts HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        updateAlertsUI(data);
    } catch (error) {
        console.error("Error fetching alerts:", error);
        const alertsList = getAnalyticsEl('notificationsList');
        if (alertsList) alertsList.innerHTML = `<div class="text-xs text-danger-dark dark:text-danger-light p-2.5">Could not load alerts: ${error.message}</div>`;
    }
}

// Update alerts UI
function updateAlertsUI(data) {
    const notificationsList = getAnalyticsEl('notificationsList');
    const notificationCountSpan = getAnalyticsEl('notificationCount');
    if (!notificationsList || !notificationCountSpan) return;

    notificationsList.innerHTML = ''; 
    let displayedAlertCount = 0;

    const createAlertItemHtml = (alert, icon, colorClass, defaultMessagePrefix = "Alert") => {
        if (!alert) return '';
        displayedAlertCount++;
        let entityTypeDisplay = alert.entity_type ? alert.entity_type.charAt(0).toUpperCase() + alert.entity_type.slice(1) : defaultMessagePrefix;
        
        return `
            <div class="flex items-start space-x-2 p-2.5 bg-${colorClass}-light dark:bg-${colorClass}/20 rounded-lg">
                <i data-lucide="${icon}" class="w-5 h-5 text-${colorClass} dark:text-${colorClass}-light mt-0.5 flex-shrink-0"></i>
                <p class="text-xs text-gray-700 dark:text-gray-300">
                    <span class="font-semibold">${entityTypeDisplay}:</span>
                    Vehicle <span class="font-medium">${alert.plate_number || 'N/A'}</span> - 
                    ${alert.message || 'No specific message.'} 
                    ${alert.status ? `<span class="text-xs text-${colorClass}/80 dark:text-${colorClass}-light/70">(${alert.status})</span>` : ''}
                </p>
            </div>`;
    };

    let alertItemsHtml = '';
    alertItemsHtml += createAlertItemHtml(data.critical_panne, 'alert-octagon', 'danger', 'Critical Panne');
    alertItemsHtml += createAlertItemHtml(data.maintenance_alert, 'tool', 'warning', 'Maintenance');
    alertItemsHtml += createAlertItemHtml(data.trip_alert, 'route', 'info', 'Trip');

    if (displayedAlertCount === 0) {
        alertItemsHtml = '<p class="text-xs text-gray-500 dark:text-gray-400 p-2.5">No new alerts or notifications.</p>';
    }
    
    notificationsList.innerHTML = alertItemsHtml;
    notificationCountSpan.textContent = data.total_alerts || 0; 
    if (window.lucide) window.lucide.createIcons();
}

// =================================================================
// 6. REPORT GENERATION (Global function)
// =================================================================

// FIX: Improved generateReport function with better error handling
window.generateReport = async function() { 
    console.log("Generate report function called");
    
    // Check for required libraries
    if (!window.XLSX && !window.jspdf) {
        showToast("Report generation requires libraries to be loaded. Please wait and try again.", 5000, "error");
        console.error("Required libraries not loaded");
        return;
    }
    
    const period = getAnalyticsEl('reportPeriod');
    const periodValue = period ? period.value : 'last12months';
    
    const range = getPeriodDateRange(periodValue); 
    if (!range) {
        showToast("Invalid date range selected", 3000, "error");
        return;
    } 
    
    // Get selected categories
    const fuelCheck = getAnalyticsEl('reportCatFuel');
    const reparationCheck = getAnalyticsEl('reportCatReparation');
    const maintenanceCheck = getAnalyticsEl('reportCatMaintenance');
    const purchasesCheck = getAnalyticsEl('reportCatPurchases');
    
    const categoryMap = { 
        fuel: { name: 'Fuel', checked: fuelCheck ? fuelCheck.checked : false }, 
        reparation: { name: 'Reparations', checked: reparationCheck ? reparationCheck.checked : false }, 
        maintenance: { name: 'Maintenance', checked: maintenanceCheck ? maintenanceCheck.checked : false }, 
        purchases: { name: 'Vehicle Purchases', checked: purchasesCheck ? purchasesCheck.checked : false } 
    }; 
    
    const selectedCategoriesInput = []; 
    for (const key in categoryMap) { 
        if (categoryMap[key].checked) { selectedCategoriesInput.push(key); } 
    } 
    
    if (selectedCategoriesInput.length === 0) { 
        showToast("Please select at least one expense category.", 3000, "error"); 
        return; 
    } 
    
    const formatSelect = getAnalyticsEl('reportFormat');
    const format = formatSelect ? formatSelect.value : 'pdf';
    
    const periodString = periodValue === 'custom' ? 
        `${range.startDate.toLocaleDateString().replace(/\//g, '-')}_to_${range.endDate.toLocaleDateString().replace(/\//g, '-')}` : periodValue; 
    const fileNameBase = `Detailed_Expense_Report_${periodString}`; 
    
    const authToken = localStorage.getItem('access_token'); 
    if (!authToken) { 
        showToast("Authentication token not found. Please log in.", 5000, "error"); 
        return; 
    } 
    
    showToast("Generating detailed report... This may take a moment.", 5000, "info"); 
    
    try { 
        const startDateString = range.startDate.toISOString().split('T')[0]; 
        const endDateString = range.endDate.toISOString().split('T')[0]; 
        const categoryParams = selectedCategoriesInput.map(cat => `categories=${encodeURIComponent(cat)}`).join('&'); 
        
        const response = await fetch( 
            `${API_BASE}/analytics-data/detailed-expense-records?start_date=${startDateString}&end_date=${endDateString}&${categoryParams}`, 
            { 
                method: 'GET', 
                headers: { 
                    'Content-Type': 'application/json', 
                    'Authorization': `Bearer ${authToken}` 
                } 
            } 
        ); 
        
        if (!response.ok) { 
            const errorData = await response.json().catch(() => ({ detail: `HTTP error! Status: ${response.status}` })); 
            throw new Error(`Error fetching detailed report: ${errorData.detail || response.statusText}`); 
        } 
        
        const detailedData = await response.json(); 
        
        // Check if we have any data
        let hasData = false;
        if (categoryMap.fuel.checked && detailedData.fuel_records && detailedData.fuel_records.length > 0) hasData = true;
        if (categoryMap.reparation.checked && detailedData.reparation_records && detailedData.reparation_records.length > 0) hasData = true;
        if (categoryMap.maintenance.checked && detailedData.maintenance_records && detailedData.maintenance_records.length > 0) hasData = true;
        if (categoryMap.purchases.checked && detailedData.purchase_records && detailedData.purchase_records.length > 0) hasData = true;
        
        if (!hasData) {
            showToast("No detailed records found for the selected categories and period.", 3000, "info"); 
            return;
        }
        
        if (format === 'excel') { 
            if (!window.XLSX) {
                showToast("Excel library not loaded. Please refresh the page.", 5000, "error");
                return;
            }
            
            const wb = XLSX.utils.book_new(); 
            let sheetsAdded = 0; 
            
            if (categoryMap.fuel.checked && detailedData.fuel_records && detailedData.fuel_records.length > 0) { 
                const fuelSheetData = detailedData.fuel_records.map(r => ({ 
                    ID: r.id, 
                    Vehicle: r.vehicle_plate, 
                    Date: new Date(r.date).toLocaleDateString(), 
                    Time: new Date(r.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), 
                    Quantity: r.quantity, 
                    Cost: r.cost, 
                    Notes: r.notes 
                })); 
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelSheetData), "Fuel Details"); 
                sheetsAdded++; 
            } 
            
            if (categoryMap.reparation.checked && detailedData.reparation_records && detailedData.reparation_records.length > 0) { 
                const reparationSheetData = detailedData.reparation_records.map(r => ({ 
                    ID: r.id, 
                    Vehicle: r.vehicle_plate, 
                    Date: r.repair_date ? new Date(r.repair_date).toLocaleDateString() : "N/A", 
                    Description: r.description, 
                    Provider: r.provider, 
                    Cost: r.cost 
                })); 
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reparationSheetData), "Reparation Details"); 
                sheetsAdded++; 
            } 
            
            if (categoryMap.maintenance.checked && detailedData.maintenance_records && detailedData.maintenance_records.length > 0) { 
                const maintenanceSheetData = detailedData.maintenance_records.map(r => ({ 
                    ID: r.id, 
                    Vehicle: r.vehicle_plate, 
                    Date: r.maintenance_date ? new Date(r.maintenance_date).toLocaleDateString() : "N/A", 
                    Description: r.description, 
                    Provider: r.provider, 
                    Cost: r.maintenance_cost 
                })); 
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(maintenanceSheetData), "Maintenance Details"); 
                sheetsAdded++; 
            } 
            
            if (categoryMap.purchases.checked && detailedData.purchase_records && detailedData.purchase_records.length > 0) { 
                const purchaseSheetData = detailedData.purchase_records.map(r => ({ 
                    ID: r.id, 
                    'Plate Number': r.plate_number, 
                    Make: r.make, 
                    Model: r.model, 
                    'Purchase Date': r.purchase_date ? new Date(r.purchase_date).toLocaleDateString() : "N/A", 
                    'Purchase Price': r.purchase_price 
                })); 
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseSheetData), "Vehicle Purchases"); 
                sheetsAdded++; 
            } 
            
            if (sheetsAdded === 0) { 
                showToast("No detailed records found for the selected categories and period.", 3000, "info"); 
                return; 
            } 
            
            XLSX.writeFile(wb, `${fileNameBase}.xlsx`); 
            showToast("Excel report generated and download started.", 3000, "success"); 
        } else { 
            if (!window.jspdf) {
                showToast("PDF library not loaded. Please refresh the page.", 5000, "error");
                return;
            }
            
            const { jsPDF } = window.jspdf; 
            const doc = new jsPDF(); 
            let yPos = 20; 
            const pageHeight = doc.internal.pageSize.height; 
            const bottomMargin = 20; 
            
            doc.setFontSize(16); 
            doc.text(`Detailed Expense Report`, 14, yPos); 
            yPos += 8; 
            
            doc.setFontSize(10); 
            doc.text(`Period: ${periodValue === 'custom' ? `${range.startDate.toLocaleDateString()} to ${range.endDate.toLocaleDateString()}` : periodValue}`, 14, yPos); 
            yPos += 12; 
            
            const addCategoryToPdf = (title, headers, dataRows, grandTotalKey) => { 
                if (!dataRows || dataRows.length === 0) return false; 
                if (yPos > pageHeight - bottomMargin - 30) { doc.addPage(); yPos = 20; } 
                
                doc.setFontSize(12); 
                doc.setFont(undefined, 'bold'); 
                doc.text(title, 14, yPos); 
                yPos += 6; 
                doc.setFont(undefined, 'normal'); 
                
                const tableBody = dataRows.map(row => headers.map(header => { 
                    const value = row[header.key]; 
                    return header.format ? header.format(value) : (value !== undefined && value !== null ? value : ''); 
                })); 
                
                let footData; 
                if (grandTotalKey !== undefined) { 
                    const totalAmount = dataRows.reduce((sum, row) => sum + (parseFloat(row[grandTotalKey]) || 0), 0); 
                    const formattedTotal = formatBIF(totalAmount); 
                    let emptyCells = headers.map(() => ''); 
                    const totalLabelIndex = Math.max(0, headers.findIndex(h => h.key === grandTotalKey) -1); 
                    emptyCells[totalLabelIndex] = 'Total:'; 
                    emptyCells[headers.findIndex(h => h.key === grandTotalKey)] = formattedTotal; 
                    footData = [emptyCells]; 
                } 
                
                doc.autoTable({ 
                    head: [headers.map(h => h.label)], 
                    body: tableBody, 
                    startY: yPos, 
                    theme: 'grid', 
                    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontSize: 8 }, 
                    bodyStyles: { fontSize: 7 }, 
                    foot: footData, 
                    footStyles: { fontStyle: 'bold', fillColor: [230, 230, 230], textColor: 20, fontSize: 8 }, 
                    didDrawPage: function (data) { yPos = data.cursor.y + 10; }, 
                }); 
                
                yPos = doc.autoTable.previous.finalY + 10; 
                return true; 
            }; 
            
            let reportHasData = false; 
            
            if (categoryMap.fuel.checked && detailedData.fuel_records && detailedData.fuel_records.length > 0) { 
                const headers = [ 
                    {label: 'Vehicle', key: 'vehicle_plate'}, 
                    {label: 'Date/Time', key: 'date', format: (d) => d ? new Date(d).toLocaleString() : "N/A"},  
                    {label: 'Qty', key: 'quantity', format: (q) => (q || 0).toFixed(2)}, 
                    {label: 'Cost (BIF)', key: 'cost', format: (c) => formatBIF(c)}, 
                    {label: 'Notes', key: 'notes'} 
                ]; 
                if (addCategoryToPdf('Fuel Records', headers, detailedData.fuel_records, 'cost')) reportHasData = true; 
            } 
            
            if (categoryMap.reparation.checked && detailedData.reparation_records && detailedData.reparation_records.length > 0) { 
                const headers = [ 
                    {label:'Vehicle', key:'vehicle_plate'}, 
                    {label:'Date', key:'repair_date', format: (d) => d ? new Date(d).toLocaleDateString() : "N/A"}, 
                    {label:'Description', key:'description'}, 
                    {label:'Provider', key:'provider'}, 
                    {label:'Cost (BIF)', key:'cost', format: (c) => formatBIF(c)} 
                ]; 
                if (addCategoryToPdf('Reparation Records', headers, detailedData.reparation_records, 'cost')) reportHasData = true; 
            } 
            
            if (categoryMap.maintenance.checked && detailedData.maintenance_records && detailedData.maintenance_records.length > 0) { 
                const headers = [ 
                    {label:'Vehicle', key:'vehicle_plate'}, 
                    {label:'Date', key:'maintenance_date', format: (d) => d ? new Date(d).toLocaleDateString() : "N/A"}, 
                    {label:'Description', key:'description'}, 
                    {label:'Provider', key:'provider'}, 
                    {label:'Cost (BIF)', key:'maintenance_cost', format: (c) => formatBIF(c)} 
                ]; 
                if (addCategoryToPdf('Maintenance Records', headers, detailedData.maintenance_records, 'maintenance_cost')) reportHasData = true; 
            } 
            
            if (categoryMap.purchases.checked && detailedData.purchase_records && detailedData.purchase_records.length > 0) { 
                const headers = [ 
                    {label:'Plate #', key:'plate_number'}, 
                    {label:'Make', key:'make'}, 
                    {label:'Model', key:'model'}, 
                    {label:'Purchase Date', key:'purchase_date', format: (d) => d ? new Date(d).toLocaleDateString() : "N/A"}, 
                    {label:'Price (BIF)', key:'purchase_price', format: (p) => formatBIF(p)} 
                ]; 
                if (addCategoryToPdf('Vehicle Purchases', headers, detailedData.purchase_records, 'purchase_price')) reportHasData = true; 
            } 
            
            if (!reportHasData) { 
                showToast("No detailed records found for PDF.", 3000, "info"); 
                return; 
            } 
            
            doc.save(`${fileNameBase}.pdf`); 
            showToast("PDF report generated and download started.", 3000, "success"); 
        } 
    } catch (error) { 
        console.error('Failed to generate detailed report:', error); 
        showToast(`Report Generation Error: ${error.message}`, 5000, "error"); 
    } 
}

// =================================================================
// 7. CLEANUP FUNCTION (for router)
// =================================================================

window.cleanupAnalytics = function() {
    // Destroy charts to prevent memory leaks
    if (monthlyExpenseChartInstance) {
        monthlyExpenseChartInstance.destroy();
        monthlyExpenseChartInstance = null;
    }
    if (expenseDistributionChartInstance) {
        expenseDistributionChartInstance.destroy();
        expenseDistributionChartInstance = null;
    }
    
    // Remove event listeners
    const generateReportBtn = getAnalyticsEl('generateReportBtn');
    if (generateReportBtn) {
        generateReportBtn.removeEventListener('click', window.generateReport);
    }
    
    console.log("Analytics cleanup complete");
};