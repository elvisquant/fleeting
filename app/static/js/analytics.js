// static/js/analytics.js
(function() {
    'use strict';
    
    /**
     * ==============================================================================
     * FLEETDASH ANALYTICS MODULE (Multi-Language)
     * Handles dashboard data, charts, and detailed report generation.
     * ==============================================================================
     */

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

    function initAnalytics() {
        console.log("Analytics Module: Initializing...");
        
        // Check for required globals
        if (typeof window.fetchWithAuth !== 'function') {
            console.error('fetchWithAuth not available');
            return;
        }
        
        if (typeof window.t !== 'function') {
            console.error('Translation function t() not available');
            return;
        }

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
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }

        console.log("Analytics module initialized");
    }

    // Attach all event listeners for analytics
    function attachAnalyticsListeners() {
        // Theme toggle
        const themeToggleButtonHeader = getAnalyticsEl('theme-toggle-header');
        if (themeToggleButtonHeader) {
            themeToggleButtonHeader.addEventListener('click', () => {
                document.documentElement.classList.toggle('dark');
                setInitialThemeIcon();
                // Refresh chart themes
                const currentLabels = monthlyExpenseChartInstance?.config?.data?.labels || generateDynamicMonthLabels(12);
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
        if (applyCustomDateBtn) {
            applyCustomDateBtn.addEventListener('click', () => fetchAndDisplayDataForPeriod('custom'));
        }

        // Generate report button
        const generateReportBtn = getAnalyticsEl('generateReportBtn');
        if (generateReportBtn) {
            generateReportBtn.addEventListener('click', generateReport);
        }
    }

    // =================================================================
    // 2. UTILITY FUNCTIONS
    // =================================================================

    function showToast(message, duration = 3000, type = 'info') {
        const container = getAnalyticsEl('toast-container');
        if (!container) {
            console.log(`${type}: ${message}`);
            return;
        }

        const toastElement = document.createElement('div');
        toastElement.textContent = message;
        toastElement.className = `px-4 py-3 rounded-lg shadow-lg text-white text-sm font-medium animate-up ${type === 'error' ? 'bg-red-500' :
                type === 'success' ? 'bg-green-500' : 'bg-blue-500'
            }`;
        container.appendChild(toastElement);
        setTimeout(() => {
            toastElement.style.opacity = '0';
            setTimeout(() => {
                if (toastElement.parentNode) toastElement.parentNode.removeChild(toastElement);
            }, 300);
        }, duration);
    }

    function formatBIF(amount) {
        const numAmount = Number(amount) || 0;
        // Use window.APP_LOCALE for correct number formatting (e.g. 1 000,00 vs 1,000.00)
        const locale = window.APP_LOCALE || 'en-US';
        return `BIF ${numAmount.toLocaleString(locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    function formatBIFCompact(amount) {
        const numAmount = Number(amount) || 0;
        if (numAmount >= 1000000000) return `BIF ${(numAmount / 1000000000).toFixed(2)}B`;
        if (numAmount >= 1000000) return `BIF ${(numAmount / 1000000).toFixed(2)}M`;
        if (numAmount >= 1000) return `BIF ${(numAmount / 1000).toFixed(1)}K`;
        return `BIF ${numAmount.toFixed(2)}`;
    }

    function setInitialThemeIcon() {
        const themeToggleButtonHeader = getAnalyticsEl('theme-toggle-header');
        if (!themeToggleButtonHeader) return;

        if (document.documentElement.classList.contains('dark')) {
            themeToggleButtonHeader.innerHTML = '<i data-lucide="sun" class="w-5 h-5"></i>';
        } else {
            themeToggleButtonHeader.innerHTML = '<i data-lucide="moon" class="w-5 h-5"></i>';
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // =================================================================
    // 3. STATISTICS PAGE FUNCTIONS
    // =================================================================

    function initializeStatisticsPage() {
        const periodSelect = getAnalyticsEl('reportPeriod');
        const defaultPeriod = periodSelect ? periodSelect.value : 'last12months';
        fetchAndDisplayDataForPeriod(defaultPeriod);
    }

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

    function getPeriodDateRange(period) {
        const today = new Date();
        let startDate = new Date();
        let endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59, 999);

        switch (period) {
            case 'last30days': startDate.setDate(today.getDate() - 29); break;
            case 'last90days': startDate.setDate(today.getDate() - 89); break;
            case 'last6months': startDate = new Date(today.getFullYear(), today.getMonth() - 5, 1); break;
            case 'last12months': startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() - (today.getDate() - 1) + 1); break;
            case 'currentYear': startDate = new Date(today.getFullYear(), 0, 1); break;
            case 'custom':
                const cS = getAnalyticsEl('reportCustomStart');
                const cE = getAnalyticsEl('reportCustomEnd');
                const customStartValue = cS ? cS.value : '';
                const customEndValue = cE ? cE.value : '';

                if (!customStartValue || !customEndValue) {
                    showToast(window.t('msg_validation_fail'), 3000, "error");
                    return null;
                }
                startDate = new Date(customStartValue);
                endDate = new Date(customEndValue);
                endDate.setHours(23, 59, 59, 999);
                if (startDate > endDate) {
                    showToast(window.t('msg_validation_fail'), 3000, "error");
                    return null;
                }
                break;
            default: startDate.setDate(today.getDate() - 29);
        }
        startDate.setHours(0, 0, 0, 0);
        return { startDate, endDate };
    }

    function generateDynamicMonthLabels(count, refEndDate = new Date()) {
        const labels = [];
        let currentDate = new Date(refEndDate.getFullYear(), refEndDate.getMonth(), 1);
        const locale = window.APP_LOCALE || 'en-US';
        for (let i = 0; i < count; i++) {
            // Use Locale for Month Name (Jan vs Janv)
            labels.unshift(currentDate.toLocaleString(locale, { month: 'short', year: '2-digit' }));
            currentDate.setMonth(currentDate.getMonth() - 1);
        }
        return labels;
    }

    async function fetchAndDisplayDataForPeriod(period) {
        const range = getPeriodDateRange(period);
        if (!range && period === 'custom') return;

        // Use the global fetchWithAuth function
        if (typeof window.fetchWithAuth !== 'function') {
            showToast(window.t('msg_connection_fail'), 5000, "error");
            return;
        }

        const startDateString = range.startDate.toISOString().split('T')[0];
        const endDateString = range.endDate.toISOString().split('T')[0];

        showToast(window.t('msg_loading'), 2000, "info");

        try {
            const response = await window.fetchWithAuth(
                `/analytics-data/expense-summary?start_date=${startDateString}&end_date=${endDateString}`
            );

            if (!response) {
                throw new Error('No response from server');
            }

            const apiData = await response.json();

            const transformedData = {
                fuel: { total: apiData.total_fuel_cost || 0, trend: [] },
                reparation: { total: apiData.total_reparation_cost || 0, trend: [] },
                maintenance: { total: apiData.total_maintenance_cost || 0, trend: [] },
                purchases: { total: apiData.total_vehicle_purchase_cost || 0, trend: [] }
            };

            const locale = window.APP_LOCALE || 'en-US';
            const chartLabels = apiData.monthly_breakdown ? apiData.monthly_breakdown.map(item => {
                return new Date(item.month_year).toLocaleDateString(locale, { month: 'short', year: '2-digit' });
            }) : [];

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

            showToast(window.t('title_success'), 2000, "success");
        } catch (error) {
            console.error('Error fetching data:', error);
            showToast(window.t('msg_connection_fail'), 5000, "error");

            // Handle Empty State
            const emptyData = {
                fuel: { total: 0, trend: [] },
                reparation: { total: 0, trend: [] },
                maintenance: { total: 0, trend: [] },
                purchases: { total: 0, trend: [] }
            };
            const emptyLabels = generateDynamicMonthLabels(1);
            currentExpenseData = emptyData;
            updateExpenseKPIs(emptyData);
            initializeStatisticsCharts(emptyData, emptyLabels);
            updateQuickStats(emptyData);
        }
    }

    function updateExpenseKPIs(data) {
        const fuelTotalEl = getAnalyticsEl('kpiFuelTotal');
        const reparationTotalEl = getAnalyticsEl('kpiReparationTotal');
        const maintenanceTotalEl = getAnalyticsEl('kpiMaintenanceTotal');
        const purchaseTotalEl = getAnalyticsEl('kpiVehiclePurchaseTotal');

        if (fuelTotalEl) {
            fuelTotalEl.textContent = formatBIFCompact(data.fuel.total || 0);
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

    function initializeStatisticsCharts(data = currentExpenseData, labels = generateDynamicMonthLabels(12)) {
        const isDarkMode = document.documentElement.classList.contains('dark');
        const gridColor = isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
        const labelColor = isDarkMode ? 'rgba(209,213,219,0.8)' : 'rgba(55,65,81,0.8)';

        // Colors
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

                const trendLabels = labels.length > 0 ? labels : [window.t('msg_no_records')];
                const fuelTrend = data.fuel.trend.length === trendLabels.length ? data.fuel.trend : Array(trendLabels.length).fill(0);
                const reparationTrend = data.reparation.trend.length === trendLabels.length ? data.reparation.trend : Array(trendLabels.length).fill(0);
                const maintenanceTrend = data.maintenance.trend.length === trendLabels.length ? data.maintenance.trend : Array(trendLabels.length).fill(0);
                const purchasesTrend = data.purchases.trend.length === trendLabels.length ? data.purchases.trend : Array(trendLabels.length).fill(0);

                monthlyExpenseChartInstance = new Chart(monthlyCtx, {
                    type: 'bar',
                    data: {
                        labels: trendLabels,
                        datasets: [
                            { label: window.t('fuel'), data: fuelTrend, backgroundColor: fuelColor, stack: 'Stack 0', borderRadius: 4 },
                            { label: window.t('reparations'), data: reparationTrend, backgroundColor: reparationColor, stack: 'Stack 0', borderRadius: 4 },
                            { label: window.t('maintenance'), data: maintenanceTrend, backgroundColor: maintenanceColor, stack: 'Stack 0', borderRadius: 4 },
                            { label: window.t('lbl_purchases'), data: purchasesTrend, backgroundColor: purchaseColor, stack: 'Stack 1', borderRadius: 4 }
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
                                        if (value >= 1000000) return `BIF ${(value / 1000000).toFixed(1)}M`;
                                        if (value >= 1000) return `BIF ${(value / 1000).toFixed(1)}k`;
                                        return `BIF ${value}`;
                                    },
                                    maxTicksLimit: 8
                                }
                            },
                            x: {
                                stacked: true,
                                grid: { display: false },
                                ticks: {
                                    color: labelColor,
                                    maxRotation: 45,
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
                                    font: { size: 11 }
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

                // Update percentage labels
                const fuelPercentEl = getAnalyticsEl('fuel-percent');
                const reparationPercentEl = getAnalyticsEl('reparation-percent');
                const maintenancePercentEl = getAnalyticsEl('maintenance-percent');
                const purchasesPercentEl = getAnalyticsEl('purchases-percent');

                if (fuelPercentEl) fuelPercentEl.innerText = hasData ? ((data.fuel.total / totalExpenses) * 100).toFixed(1) + '%' : '0%';
                if (reparationPercentEl) reparationPercentEl.innerText = hasData ? ((data.reparation.total / totalExpenses) * 100).toFixed(1) + '%' : '0%';
                if (maintenancePercentEl) maintenancePercentEl.innerText = hasData ? ((data.maintenance.total / totalExpenses) * 100).toFixed(1) + '%' : '0%';
                if (purchasesPercentEl) purchasesPercentEl.innerText = hasData ? ((data.purchases.total / totalExpenses) * 100).toFixed(1) + '%' : '0%';

                expenseDistributionChartInstance = new Chart(distributionCtx, {
                    type: 'doughnut',
                    data: {
                        labels: hasData ? [window.t('fuel'), window.t('reparations'), window.t('maintenance'), window.t('lbl_purchases')] : [window.t('msg_no_records')],
                        datasets: [{
                            label: 'Expense Distribution',
                            data: hasData ? [data.fuel.total, data.reparation.total, data.maintenance.total, data.purchases.total] : [1],
                            backgroundColor: hasData ? [fuelColor, reparationColor, maintenanceColor, purchaseColor] : [isDarkMode ? '#4b5563' : '#e5e7eb'],
                            borderColor: isDarkMode ? '#1f2937' : '#fff',
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
                                    label: ctx => `${ctx.label}: ${formatBIF(ctx.raw)} (${totalExpenses > 0 ? ((ctx.raw / totalExpenses) * 100).toFixed(1) : 0}%)`
                                }
                            }
                        }
                    }
                });
            }
        }

        if (window.lucide && typeof window.lucide.createIcons === 'function') {
            window.lucide.createIcons();
        }
    }

    // =================================================================
    // 5. PERFORMANCE INSIGHTS & ALERTS
    // =================================================================

    async function fetchPerformanceInsights() {
        // Left empty based on provided code, but hook is here
    }

    async function fetchAlertsAndNotifications() {
        // Left empty based on provided code, but hook is here
    }

    // =================================================================
    // 6. REPORT GENERATION
    // =================================================================

    // Helper to load libraries
    async function ensureReportLibraries() {
        return new Promise((resolve, reject) => {
            if (window.XLSX && window.jspdf) { resolve(); return; }

            let attempts = 0;
            const checkLibraries = () => {
                attempts++;
                if (window.XLSX && window.jspdf) {
                    resolve();
                } else if (attempts >= 50) {
                    reject(new Error(window.t('msg_library_load_fail')));
                } else {
                    setTimeout(checkLibraries, 100);
                }
            };
            checkLibraries();
        });
    }

    // MAIN GENERATE REPORT FUNCTION
    async function generateReport() {
        console.log("Generate report function called");

        try {
            const formatSelect = getAnalyticsEl('reportFormat');
            const format = formatSelect ? formatSelect.value : 'pdf';
            const generateBtn = getAnalyticsEl('generateReportBtn');
            const originalText = generateBtn ? generateBtn.innerHTML : '';

            if (generateBtn) {
                generateBtn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> ${window.t('msg_generating_report')}`;
                generateBtn.disabled = true;
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            }

            // Wait for libs
            await ensureReportLibraries();

            // Get Filters
            const period = getAnalyticsEl('reportPeriod');
            const periodValue = period ? period.value : 'last12months';
            const range = getPeriodDateRange(periodValue);

            if (!range) {
                showToast(window.t('msg_validation_fail'), 3000, "error");
                if (generateBtn) { generateBtn.innerHTML = originalText; generateBtn.disabled = false; }
                return;
            }

            // Get Categories
            const fuelCheck = getAnalyticsEl('reportCatFuel');
            const reparationCheck = getAnalyticsEl('reportCatReparation');
            const maintenanceCheck = getAnalyticsEl('reportCatMaintenance');
            const purchasesCheck = getAnalyticsEl('reportCatPurchases');

            const categoryMap = {
                fuel: { name: window.t('fuel'), checked: fuelCheck ? fuelCheck.checked : false },
                reparation: { name: window.t('reparations'), checked: reparationCheck ? reparationCheck.checked : false },
                maintenance: { name: window.t('maintenance'), checked: maintenanceCheck ? maintenanceCheck.checked : false },
                purchases: { name: window.t('lbl_purchases'), checked: purchasesCheck ? purchasesCheck.checked : false }
            };

            const selectedCategoriesInput = Object.keys(categoryMap).filter(key => categoryMap[key].checked);

            if (selectedCategoriesInput.length === 0) {
                showToast(window.t('msg_validation_fail'), 3000, "error");
                if (generateBtn) { generateBtn.innerHTML = originalText; generateBtn.disabled = false; }
                return;
            }

            const periodString = periodValue === 'custom' ?
                `${range.startDate.toLocaleDateString().replace(/\//g, '-')}_to_${range.endDate.toLocaleDateString().replace(/\//g, '-')}` : periodValue;
            const fileNameBase = `Detailed_Expense_Report_${periodString}`;

            // Check for auth token
            const token = localStorage.getItem('access_token');
            if (!token) {
                showToast(window.t('msg_connection_fail'), 5000, "error");
                if (generateBtn) { generateBtn.innerHTML = originalText; generateBtn.disabled = false; }
                return;
            }

            // API Call
            const startDateString = range.startDate.toISOString().split('T')[0];
            const endDateString = range.endDate.toISOString().split('T')[0];
            const categoryParams = selectedCategoriesInput.map(cat => `categories=${encodeURIComponent(cat)}`).join('&');

            const response = await window.fetchWithAuth(
                `/analytics-data/detailed-expense-records?start_date=${startDateString}&end_date=${endDateString}&${categoryParams}`
            );

            if (!response) {
                throw new Error('No response from server');
            }

            const detailedData = await response.json();

            // Check if data is empty
            let hasData = false;
            if (categoryMap.fuel.checked && detailedData.fuel_records && detailedData.fuel_records.length > 0) hasData = true;
            if (categoryMap.reparation.checked && detailedData.reparation_records && detailedData.reparation_records.length > 0) hasData = true;
            if (categoryMap.maintenance.checked && detailedData.maintenance_records && detailedData.maintenance_records.length > 0) hasData = true;
            if (categoryMap.purchases.checked && detailedData.purchase_records && detailedData.purchase_records.length > 0) hasData = true;

            if (!hasData) {
                showToast(window.t('msg_no_data_for_report'), 3000, "info");
                if (generateBtn) { generateBtn.innerHTML = originalText; generateBtn.disabled = false; }
                return;
            }

            // --- EXCEL GENERATION ---
            if (format === 'excel') {
                if (!window.XLSX) {
                    showToast(window.t('msg_library_load_fail'), 5000, "error");
                    return;
                }

                const wb = XLSX.utils.book_new();
                let sheetsAdded = 0;

                // Fuel Sheet
                if (categoryMap.fuel.checked && detailedData.fuel_records && detailedData.fuel_records.length > 0) {
                    const fuelSheetData = detailedData.fuel_records.map(r => ({
                        [window.t('col_id')]: r.id,
                        [window.t('col_plate')]: r.vehicle_plate,
                        [window.t('col_date')]: new Date(r.date).toLocaleDateString(window.APP_LOCALE || 'en-US'),
                        [window.t('col_mileage')]: r.quantity, // Using quantity as mileage header placeholder
                        [window.t('col_cost')]: r.cost,
                        [window.t('col_description')]: r.notes
                    }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fuelSheetData), window.t('fuel'));
                    sheetsAdded++;
                }

                // Reparation Sheet
                if (categoryMap.reparation.checked && detailedData.reparation_records && detailedData.reparation_records.length > 0) {
                    const reparationSheetData = detailedData.reparation_records.map(r => ({
                        [window.t('col_id')]: r.id,
                        [window.t('col_plate')]: r.vehicle_plate,
                        [window.t('col_date')]: r.repair_date ? new Date(r.repair_date).toLocaleDateString(window.APP_LOCALE || 'en-US') : "N/A",
                        [window.t('col_description')]: r.description,
                        'Provider': r.provider,
                        [window.t('col_cost')]: r.cost
                    }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(reparationSheetData), window.t('reparations'));
                    sheetsAdded++;
                }

                // Maintenance Sheet
                if (categoryMap.maintenance.checked && detailedData.maintenance_records && detailedData.maintenance_records.length > 0) {
                    const maintenanceSheetData = detailedData.maintenance_records.map(r => ({
                        [window.t('col_id')]: r.id,
                        [window.t('col_plate')]: r.vehicle_plate,
                        [window.t('col_date')]: r.maintenance_date ? new Date(r.maintenance_date).toLocaleDateString(window.APP_LOCALE || 'en-US') : "N/A",
                        [window.t('col_description')]: r.description,
                        'Provider': r.provider,
                        [window.t('col_cost')]: r.maintenance_cost
                    }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(maintenanceSheetData), window.t('maintenance'));
                    sheetsAdded++;
                }

                // Purchase Sheet
                if (categoryMap.purchases.checked && detailedData.purchase_records && detailedData.purchase_records.length > 0) {
                    const purchaseSheetData = detailedData.purchase_records.map(r => ({
                        [window.t('col_id')]: r.id,
                        [window.t('col_plate')]: r.plate_number,
                        [window.t('col_make')]: r.make,
                        'Model': r.model,
                        [window.t('col_date')]: r.purchase_date ? new Date(r.purchase_date).toLocaleDateString(window.APP_LOCALE || 'en-US') : "N/A",
                        [window.t('col_cost')]: r.purchase_price
                    }));
                    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseSheetData), window.t('lbl_purchases'));
                    sheetsAdded++;
                }

                XLSX.writeFile(wb, `${fileNameBase}.xlsx`);
                showToast(window.t('title_success'), 3000, "success");

            // --- PDF GENERATION ---
            } else {
                if (!window.jspdf || !window.jspdf.jsPDF) {
                    showToast(window.t('msg_library_load_fail'), 5000, "error");
                    return;
                }

                const { jsPDF } = window.jspdf;
                const doc = new jsPDF();
                let yPos = 20;
                const pageHeight = doc.internal.pageSize.height;
                const bottomMargin = 20;

                // Header
                doc.setFontSize(16);
                doc.text(window.t('lbl_analytics_reports'), 14, yPos);
                yPos += 8;

                doc.setFontSize(10);
                doc.text(`${window.t('lbl_period')}: ${periodValue === 'custom' ? `${range.startDate.toLocaleDateString()} - ${range.endDate.toLocaleDateString()}` : periodValue}`, 14, yPos);
                yPos += 12;

                // Helper function to add category tables
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
                        // Put total in the last column
                        emptyCells[emptyCells.length - 2] = 'Total:';
                        emptyCells[emptyCells.length - 1] = formattedTotal;
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

                // Fuel Table
                if (categoryMap.fuel.checked && detailedData.fuel_records && detailedData.fuel_records.length > 0) {
                    const headers = [
                        { label: window.t('col_plate'), key: 'vehicle_plate' },
                        { label: window.t('col_date'), key: 'date', format: (d) => d ? new Date(d).toLocaleString(window.APP_LOCALE || 'en-US') : "N/A" },
                        { label: 'Qty', key: 'quantity', format: (q) => (q || 0).toFixed(2) },
                        { label: window.t('col_cost'), key: 'cost', format: (c) => formatBIF(c) },
                        { label: window.t('col_description'), key: 'notes' }
                    ];
                    if (addCategoryToPdf(window.t('fuel'), headers, detailedData.fuel_records, 'cost')) reportHasData = true;
                }

                // Reparation Table
                if (categoryMap.reparation.checked && detailedData.reparation_records && detailedData.reparation_records.length > 0) {
                    const headers = [
                        { label: window.t('col_plate'), key: 'vehicle_plate' },
                        { label: window.t('col_date'), key: 'repair_date', format: (d) => d ? new Date(d).toLocaleDateString(window.APP_LOCALE || 'en-US') : "N/A" },
                        { label: window.t('col_description'), key: 'description' },
                        { label: 'Provider', key: 'provider' },
                        { label: window.t('col_cost'), key: 'cost', format: (c) => formatBIF(c) }
                    ];
                    if (addCategoryToPdf(window.t('reparations'), headers, detailedData.reparation_records, 'cost')) reportHasData = true;
                }

                // Maintenance Table
                if (categoryMap.maintenance.checked && detailedData.maintenance_records && detailedData.maintenance_records.length > 0) {
                    const headers = [
                        { label: window.t('col_plate'), key: 'vehicle_plate' },
                        { label: window.t('col_date'), key: 'maintenance_date', format: (d) => d ? new Date(d).toLocaleDateString(window.APP_LOCALE || 'en-US') : "N/A" },
                        { label: window.t('col_description'), key: 'description' },
                        { label: 'Provider', key: 'provider' },
                        { label: window.t('col_cost'), key: 'maintenance_cost', format: (c) => formatBIF(c) }
                    ];
                    if (addCategoryToPdf(window.t('maintenance'), headers, detailedData.maintenance_records, 'maintenance_cost')) reportHasData = true;
                }

                // Purchase Table
                if (categoryMap.purchases.checked && detailedData.purchase_records && detailedData.purchase_records.length > 0) {
                    const headers = [
                        { label: window.t('col_plate'), key: 'plate_number' },
                        { label: window.t('col_make'), key: 'make' },
                        { label: 'Model', key: 'model' },
                        { label: window.t('col_date'), key: 'purchase_date', format: (d) => d ? new Date(d).toLocaleDateString(window.APP_LOCALE || 'en-US') : "N/A" },
                        { label: window.t('col_cost'), key: 'purchase_price', format: (p) => formatBIF(p) }
                    ];
                    if (addCategoryToPdf(window.t('lbl_purchases'), headers, detailedData.purchase_records, 'purchase_price')) reportHasData = true;
                }

                if (!reportHasData) {
                    showToast(window.t('msg_no_data_for_report'), 3000, "info");
                    return;
                }

                doc.save(`${fileNameBase}.pdf`);
                showToast(window.t('title_success'), 3000, "success");
            }

        } catch (error) {
            console.error('Failed to generate detailed report:', error);
            showToast(`Report Error: ${error.message}`, 5000, "error");
        } finally {
            // Restore button state
            const generateBtn = getAnalyticsEl('generateReportBtn');
            if (generateBtn) {
                generateBtn.innerHTML = `<i data-lucide="download" class="w-5 h-5"></i> ${window.t('btn_generate_report')}`;
                generateBtn.disabled = false;
                if (window.lucide && typeof window.lucide.createIcons === 'function') {
                    window.lucide.createIcons();
                }
            }
        }
    }

    // =================================================================
    // 7. MODULE EXPORT
    // =================================================================

    window.analyticsModule = {
        init: initAnalytics,
        destroy: function() {
            if (monthlyExpenseChartInstance) {
                monthlyExpenseChartInstance.destroy();
                monthlyExpenseChartInstance = null;
            }
            if (expenseDistributionChartInstance) {
                expenseDistributionChartInstance.destroy();
                expenseDistributionChartInstance = null;
            }

            // Remove event listeners
            const themeToggleButtonHeader = getAnalyticsEl('theme-toggle-header');
            if (themeToggleButtonHeader) {
                const newElement = themeToggleButtonHeader.cloneNode(true);
                themeToggleButtonHeader.parentNode.replaceChild(newElement, themeToggleButtonHeader);
            }

            const reportPeriodSelect = getAnalyticsEl('reportPeriod');
            if (reportPeriodSelect) {
                reportPeriodSelect.removeEventListener('change', handleReportPeriodChange);
            }

            const applyCustomDateBtn = getAnalyticsEl('applyCustomDateBtn');
            if (applyCustomDateBtn) {
                applyCustomDateBtn.removeEventListener('click', () => fetchAndDisplayDataForPeriod('custom'));
            }

            const generateReportBtn = getAnalyticsEl('generateReportBtn');
            if (generateReportBtn) {
                generateReportBtn.removeEventListener('click', generateReport);
            }

            console.log("Analytics module cleaned up");
        },
        generateReport: generateReport,
        refreshData: function(period) {
            fetchAndDisplayDataForPeriod(period || 'last12months');
        }
    };

    // Auto-initialize if analytics is loaded directly
    if (document.readyState === 'complete' && window.location.hash === '#analytics') {
        setTimeout(() => {
            if (window.analyticsModule && typeof window.analyticsModule.init === 'function') {
                window.analyticsModule.init();
            }
        }, 100);
    }

    console.log('Analytics module loaded');
})();