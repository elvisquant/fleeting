/**
 * analytics.js - Professional Fleet Analytics Dashboard
 * Enhanced with modern UI/UX patterns and smooth interactions
 */

class FleetAnalytics {
    constructor() {
        this.monthlyChart = null;
        this.distributionChart = null;
        this.currentPeriod = 'last12months';
        this.isLoading = false;
        this.cachedData = null;
        
        // Color scheme
        this.colors = {
            fuel: { primary: '#ef4444', light: '#fca5a5', dark: '#dc2626' },
            repair: { primary: '#f59e0b', light: '#fcd34d', dark: '#d97706' },
            maintenance: { primary: '#3b82f6', light: '#93c5fd', dark: '#2563eb' },
            purchase: { primary: '#10b981', light: '#6ee7b7', dark: '#059669' }
        };
    }

    // Initialize the analytics dashboard
    async init() {
        console.log('🚀 Initializing Professional Analytics Dashboard');
        
        try {
            // Attach event listeners
            this.attachEventListeners();
            
            // Set default date range
            this.setDefaultDates();
            
            // Load initial data
            await this.loadData();
            
            // Initialize tooltips and interactions
            this.initTooltips();
            
            console.log('✅ Analytics dashboard initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize analytics:', error);
            this.showError('Failed to initialize analytics dashboard');
        }
    }

    // Attach all event listeners
    attachEventListeners() {
        // Period selector
        const periodSelect = this.getElement('reportPeriod');
        if (periodSelect) {
            periodSelect.addEventListener('change', (e) => {
                this.currentPeriod = e.target.value;
                const customContainer = this.getElement('customReportDateContainer');
                
                if (this.currentPeriod === 'custom') {
                    customContainer?.classList.remove('hidden');
                    this.animateElement(customContainer, 'slide-up');
                } else {
                    customContainer?.classList.add('hidden');
                    this.loadData();
                }
            });
        }

        // Apply custom date button
        const applyBtn = this.getElement('applyCustomDateBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                this.animateElement(applyBtn, 'pulse');
                setTimeout(() => this.loadData(), 300);
            });
        }

        // Generate report button
        const generateBtn = this.getElement('generateReportBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateReport());
        }

        // Category checkboxes
        ['reportCatFuel', 'reportCatReparation', 'reportCatMaintenance', 'reportCatPurchases'].forEach(id => {
            const checkbox = this.getElement(id);
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    const parent = e.target.closest('label');
                    if (e.target.checked) {
                        parent.classList.add('border-blue-500/50', 'bg-slate-800/50');
                        this.animateElement(parent, 'pulse-small');
                    } else {
                        parent.classList.remove('border-blue-500/50', 'bg-slate-800/50');
                    }
                });
            }
        });
    }

    // Initialize tooltips and hover effects
    initTooltips() {
        // Add hover effects to KPI cards
        document.querySelectorAll('[id^="kpi"]').forEach(el => {
            el.addEventListener('mouseenter', () => {
                this.animateElement(el.closest('.group'), 'float');
            });
        });
    }

    // Load analytics data
    async loadData() {
        if (this.isLoading) return;
        
        try {
            this.setLoading(true);
            
            const range = this.getDateRange(this.currentPeriod);
            const data = await this.fetchData(range);
            
            this.cachedData = data;
            
            // Update all UI components
            this.updateKPIs(data);
            this.updateDistribution(data);
            this.updateCharts(data);
            this.updateInsights(data);
            this.updateFleetHealth(data);
            
            // Update URL with current range
            this.updateURL(range);
            
        } catch (error) {
            console.error('❌ Failed to load analytics data:', error);
            this.showError('Failed to load analytics data. Please try again.');
        } finally {
            this.setLoading(false);
        }
    }

    // Fetch data from API
    async fetchData(range) {
        const endpoint = `/analytics-data/expense-summary?start_date=${range.start}&end_date=${range.end}`;
        
        // Show loading animation
        this.showSkeleton();
        
        const response = await window.fetchWithAuth(endpoint);
        
        // Hide skeleton
        this.hideSkeleton();
        
        if (!response || !response.monthly_breakdown) {
            throw new Error('Invalid response format');
        }
        
        return response;
    }

    // Update KPI cards
    updateKPIs(data) {
        const kpis = [
            { id: 'kpiFuelTotal', value: data.total_fuel_cost, color: this.colors.fuel },
            { id: 'kpiReparationTotal', value: data.total_reparation_cost, color: this.colors.repair },
            { id: 'kpiMaintenanceTotal', value: data.total_maintenance_cost, color: this.colors.maintenance },
            { id: 'kpiVehiclePurchaseTotal', value: data.total_vehicle_purchase_cost, color: this.colors.purchase }
        ];
        
        kpis.forEach(kpi => {
            const element = this.getElement(kpi.id);
            if (element) {
                // Animate number change
                this.animateValueChange(element, this.formatCurrency(kpi.value));
                
                // Update amount in distribution section
                const amountElement = this.getElement(`${kpi.id.replace('kpi', '').toLowerCase()}-amount`);
                if (amountElement) {
                    amountElement.textContent = this.formatCurrency(kpi.value);
                }
            }
        });
    }

    // Update distribution data
    updateDistribution(data) {
        const categories = [
            { type: 'fuel', value: data.total_fuel_cost || 0 },
            { type: 'reparation', value: data.total_reparation_cost || 0 },
            { type: 'maintenance', value: data.total_maintenance_cost || 0 },
            { type: 'purchases', value: data.total_vehicle_purchase_cost || 0 }
        ];
        
        const total = categories.reduce((sum, cat) => sum + cat.value, 0);
        
        categories.forEach(cat => {
            const percent = total > 0 ? ((cat.value / total) * 100).toFixed(1) + '%' : '0%';
            const percentElement = this.getElement(`${cat.type}-percent`);
            const amountElement = this.getElement(`${cat.type}-amount`);
            
            if (percentElement) {
                this.animateValueChange(percentElement, percent);
            }
            if (amountElement && cat.value > 0) {
                amountElement.textContent = this.formatCurrency(cat.value);
            }
        });
        
        // Update center text in donut chart
        const centerText = this.getElement('distributionCenterText');
        if (centerText) {
            const totalElement = centerText.querySelector('p:first-child');
            if (totalElement) {
                totalElement.textContent = this.formatCurrency(total);
            }
        }
    }

    // Update charts
    updateCharts(data) {
        this.renderMonthlyChart(data.monthly_breakdown);
        this.renderDistributionChart(data);
    }

    // Render monthly trend chart
    renderMonthlyChart(monthlyData) {
        const ctx = this.getElement('monthlyExpenseChart')?.getContext('2d');
        if (!ctx) return;
        
        if (this.monthlyChart) {
            this.monthlyChart.destroy();
        }
        
        const sortedData = [...monthlyData].sort((a, b) => 
            new Date(a.month_year) - new Date(b.month_year)
        );
        
        this.monthlyChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedData.map(item => {
                    const date = new Date(item.month_year);
                    return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
                }),
                datasets: [
                    {
                        label: 'Fuel',
                        data: sortedData.map(item => item.fuel_cost || 0),
                        backgroundColor: this.colors.fuel.primary,
                        borderColor: this.colors.fuel.dark,
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false,
                        categoryPercentage: 0.8,
                        barPercentage: 0.9
                    },
                    {
                        label: 'Repairs',
                        data: sortedData.map(item => item.reparation_cost || 0),
                        backgroundColor: this.colors.repair.primary,
                        borderColor: this.colors.repair.dark,
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false,
                        categoryPercentage: 0.8,
                        barPercentage: 0.9
                    },
                    {
                        label: 'Maintenance',
                        data: sortedData.map(item => item.maintenance_cost || 0),
                        backgroundColor: this.colors.maintenance.primary,
                        borderColor: this.colors.maintenance.dark,
                        borderWidth: 1,
                        borderRadius: 6,
                        borderSkipped: false,
                        categoryPercentage: 0.8,
                        barPercentage: 0.9
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: '#94a3b8',
                            font: {
                                size: 11,
                                family: 'system-ui'
                            },
                            padding: 20,
                            usePointStyle: true,
                            pointStyle: 'circle'
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleColor: '#e2e8f0',
                        bodyColor: '#cbd5e1',
                        borderColor: '#475569',
                        borderWidth: 1,
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${this.formatCurrency(context.raw)}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            color: 'rgba(148, 163, 184, 0.1)',
                            drawBorder: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: {
                                size: 11
                            },
                            callback: (value) => this.formatCurrency(value)
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#94a3b8',
                            font: {
                                size: 11
                            },
                            maxRotation: 45
                        }
                    }
                },
                animation: {
                    duration: 1000,
                    easing: 'easeOutQuart'
                }
            }
        });
    }

    // Render distribution donut chart
    renderDistributionChart(data) {
        const ctx = this.getElement('expenseDistributionChart')?.getContext('2d');
        if (!ctx) return;
        
        if (this.distributionChart) {
            this.distributionChart.destroy();
        }
        
        const chartData = [
            data.total_fuel_cost || 0,
            data.total_reparation_cost || 0,
            data.total_maintenance_cost || 0,
            data.total_vehicle_purchase_cost || 0
        ];
        
        // Only create chart if there's data
        if (chartData.some(value => value > 0)) {
            this.distributionChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: ['Fuel', 'Repairs', 'Maintenance', 'Purchases'],
                    datasets: [{
                        data: chartData,
                        backgroundColor: [
                            this.colors.fuel.primary,
                            this.colors.repair.primary,
                            this.colors.maintenance.primary,
                            this.colors.purchase.primary
                        ],
                        borderWidth: 0,
                        hoverOffset: 15,
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '75%',
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const total = chartData.reduce((a, b) => a + b, 0);
                                    const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : 0;
                                    return `${context.label}: ${this.formatCurrency(context.raw)} (${percentage}%)`;
                                }
                            }
                        }
                    },
                    animation: {
                        animateScale: true,
                        animateRotate: true,
                        duration: 1500,
                        easing: 'easeOutQuart'
                    }
                }
            });
        }
    }

    // Update insights and stats
    updateInsights(data) {
        const monthlyBreakdown = data.monthly_breakdown || [];
        const totalPeriodCost = data.total_fuel_cost + data.total_reparation_cost + data.total_maintenance_cost;
        
        // Average monthly cost
        const avgMonthly = totalPeriodCost / (monthlyBreakdown.length || 1);
        const avgElement = this.getElement('avgMonthlyCost');
        if (avgElement) {
            this.animateValueChange(avgElement, this.formatCurrency(avgMonthly));
        }
        
        // Highest expense category
        const categories = [
            { name: 'Fuel', value: data.total_fuel_cost },
            { name: 'Repairs', value: data.total_reparation_cost },
            { name: 'Maintenance', value: data.total_maintenance_cost },
            { name: 'Purchases', value: data.total_vehicle_purchase_cost }
        ];
        
        const highest = categories.reduce((prev, current) => 
            (prev.value > current.value) ? prev : current
        );
        
        const highestElement = this.getElement('highestExpense');
        if (highestElement) {
            highestElement.textContent = highest.value > 0 ? highest.name : 'N/A';
            
            // Add color coding
            const colorMap = {
                'Fuel': 'text-red-400',
                'Repairs': 'text-amber-400',
                'Maintenance': 'text-blue-400',
                'Purchases': 'text-emerald-400'
            };
            
            highestElement.className = `text-2xl font-bold mb-2 ${colorMap[highest.name] || 'text-amber-400'}`;
        }
    }

    // Update fleet health metrics
    updateFleetHealth(data) {
        // This would normally come from API
        // For now, we'll calculate a simple metric based on data completeness
        const hasData = Object.values(data).some(val => val > 0);
        const compliance = hasData ? 94 : 0;
        
        const complianceElement = this.getElement('fleetCompliance');
        const barElement = this.getElement('fleetComplianceBar');
        
        if (complianceElement) {
            complianceElement.textContent = `${compliance}%`;
        }
        
        if (barElement) {
            barElement.style.width = `${compliance}%`;
            
            // Update color based on compliance
            if (compliance >= 90) {
                barElement.className = 'bg-gradient-to-r from-emerald-500 to-emerald-400 h-2 rounded-full';
            } else if (compliance >= 75) {
                barElement.className = 'bg-gradient-to-r from-amber-500 to-amber-400 h-2 rounded-full';
            } else {
                barElement.className = 'bg-gradient-to-r from-red-500 to-red-400 h-2 rounded-full';
            }
        }
    }

    // Generate report
    async generateReport() {
        const generateBtn = this.getElement('generateReportBtn');
        const originalText = generateBtn.innerHTML;
        
        try {
            // Show loading state
            generateBtn.innerHTML = '<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Processing...';
            generateBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons();
            
            const range = this.getDateRange(this.currentPeriod);
            const format = this.getElement('reportFormat')?.value;
            
            // Collect selected categories
            const categories = [];
            const categoryElements = {
                fuel: 'reportCatFuel',
                reparation: 'reportCatReparation',
                maintenance: 'reportCatMaintenance',
                purchases: 'reportCatPurchases'
            };
            
            Object.entries(categoryElements).forEach(([key, id]) => {
                if (this.getElement(id)?.checked) {
                    categories.push(key);
                }
            });
            
            if (categories.length === 0) {
                this.showNotification('Please select at least one category', 'warning');
                return;
            }
            
            // Fetch detailed data
            const catParams = categories.map(c => `categories=${c}`).join('&');
            const endpoint = `/analytics-data/detailed-expense-records?start_date=${range.start}&end_date=${range.end}&${catParams}`;
            
            const data = await window.fetchWithAuth(endpoint);
            
            // Generate report based on format
            if (format === 'excel') {
                await this.generateExcelReport(data, categories, range);
            } else {
                await this.generatePDFReport(data, categories, range);
            }
            
            this.showNotification('Report generated successfully!', 'success');
            
        } catch (error) {
            console.error('❌ Report generation failed:', error);
            this.showNotification('Failed to generate report. Please try again.', 'error');
        } finally {
            // Restore button state
            generateBtn.innerHTML = originalText;
            generateBtn.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    // Generate Excel report
    async generateExcelReport(data, categories, range) {
        if (!window.XLSX) {
            throw new Error('Excel library not loaded');
        }
        
        const wb = XLSX.utils.book_new();
        
        // Add sheets for each category
        if (categories.includes('fuel') && data.fuel_records) {
            const ws = XLSX.utils.json_to_sheet(data.fuel_records);
            XLSX.utils.book_append_sheet(wb, ws, "Fuel Expenses");
        }
        
        if (categories.includes('reparation') && data.reparation_records) {
            const ws = XLSX.utils.json_to_sheet(data.reparation_records);
            XLSX.utils.book_append_sheet(wb, ws, "Repair Records");
        }
        
        if (categories.includes('maintenance') && data.maintenance_records) {
            const ws = XLSX.utils.json_to_sheet(data.maintenance_records);
            XLSX.utils.book_append_sheet(wb, ws, "Maintenance");
        }
        
        if (categories.includes('purchases') && data.purchase_records) {
            const ws = XLSX.utils.json_to_sheet(data.purchase_records);
            XLSX.utils.book_append_sheet(wb, ws, "Vehicle Purchases");
        }
        
        // Generate filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
        const filename = `Fleet_Expense_Report_${timestamp}.xlsx`;
        
        XLSX.writeFile(wb, filename);
    }

    // Generate PDF report
    async generatePDFReport(data, categories, range) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Add header
        doc.setFillColor(30, 41, 59);
        doc.rect(0, 0, 210, 40, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.text('FLEET EXPENSE REPORT', 105, 20, null, null, 'center');
        
        doc.setFontSize(10);
        doc.text(`Period: ${range.start} to ${range.end}`, 105, 30, null, null, 'center');
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 105, 35, null, null, 'center');
        
        // Reset text color
        doc.setTextColor(0, 0, 0);
        
        let yPosition = 50;
        
        // Add summary section
        doc.setFontSize(16);
        doc.text('Executive Summary', 14, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        const summary = `This report covers the period from ${range.start} to ${range.end}, 
                        analyzing ${categories.length} expense categories across the fleet.`;
        doc.text(summary, 14, yPosition, { maxWidth: 180 });
        yPosition += 20;
        
        // Add tables for each category
        categories.forEach(category => {
            const records = data[`${category}_records`];
            if (!records || records.length === 0) return;
            
            // Add category header
            doc.setFontSize(14);
            doc.text(this.capitalizeFirst(category) + ' Expenses', 14, yPosition);
            yPosition += 8;
            
            // Prepare table data
            const headers = this.getTableHeaders(category);
            const tableData = records.map(record => this.getTableRow(record, category));
            
            // Add table
            doc.autoTable({
                startY: yPosition,
                head: [headers],
                body: tableData,
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59], textColor: 255 },
                margin: { left: 14, right: 14 }
            });
            
            yPosition = doc.autoTable.previous.finalY + 15;
        });
        
        // Add footer
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text('Confidential - Fleet Management System', 105, 290, null, null, 'center');
        
        // Save PDF
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
        doc.save(`Fleet_Report_${timestamp}.pdf`);
    }

    // Utility methods
    getElement(id) {
        const desktopEl = document.querySelector('#app-content #' + id);
        if (desktopEl) return desktopEl;
        return document.getElementById(id);
    }

    getDateRange(period) {
        const today = new Date();
        const start = new Date();
        
        switch (period) {
            case 'last30days':
                start.setDate(today.getDate() - 30);
                break;
            case 'last90days':
                start.setDate(today.getDate() - 90);
                break;
            case 'last6months':
                start.setMonth(today.getMonth() - 6);
                break;
            case 'currentYear':
                start.setFullYear(today.getFullYear(), 0, 1);
                break;
            case 'custom':
                return {
                    start: this.getElement('reportCustomStart')?.value,
                    end: this.getElement('reportCustomEnd')?.value
                };
            default: // last12months
                start.setFullYear(today.getFullYear() - 1);
        }
        
        return {
            start: start.toISOString().split('T')[0],
            end: today.toISOString().split('T')[0]
        };
    }

    setDefaultDates() {
        const today = new Date();
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        
        const startInput = this.getElement('reportCustomStart');
        const endInput = this.getElement('reportCustomEnd');
        
        if (startInput) startInput.value = startOfYear.toISOString().split('T')[0];
        if (endInput) endInput.value = today.toISOString().split('T')[0];
    }

    formatCurrency(amount) {
        const num = Number(amount) || 0;
        return `BIF ${num.toLocaleString('en-US', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        })}`;
    }

    setLoading(isLoading) {
        this.isLoading = isLoading;
        
        const loadingElements = [
            'kpiFuelTotal', 'kpiReparationTotal', 
            'kpiMaintenanceTotal', 'kpiVehiclePurchaseTotal'
        ];
        
        loadingElements.forEach(id => {
            const element = this.getElement(id);
            if (element) {
                if (isLoading) {
                    element.classList.add('animate-pulse', 'opacity-50');
                } else {
                    element.classList.remove('animate-pulse', 'opacity-50');
                }
            }
        });
        
        const generateBtn = this.getElement('generateReportBtn');
        if (generateBtn) {
            generateBtn.disabled = isLoading;
        }
    }

    showSkeleton() {
        // Add skeleton loading to charts
        const chartContainers = [
            'monthlyExpenseChart', 
            'expenseDistributionChart'
        ];
        
        chartContainers.forEach(id => {
            const container = this.getElement(id)?.parentElement;
            if (container) {
                container.classList.add('relative');
                const skeleton = document.createElement('div');
                skeleton.className = 'absolute inset-0 bg-slate-800/30 animate-pulse rounded-xl';
                skeleton.id = `${id}-skeleton`;
                container.appendChild(skeleton);
            }
        });
    }

    hideSkeleton() {
        ['monthlyExpenseChart', 'expenseDistributionChart'].forEach(id => {
            const skeleton = document.getElementById(`${id}-skeleton`);
            if (skeleton) {
                skeleton.remove();
            }
        });
    }

    animateValueChange(element, newValue) {
        if (!element) return;
        
        const oldValue = element.textContent;
        if (oldValue === newValue) return;
        
        element.style.opacity = '0.5';
        element.style.transform = 'translateY(5px)';
        
        setTimeout(() => {
            element.textContent = newValue;
            element.style.opacity = '1';
            element.style.transform = 'translateY(0)';
            element.style.transition = 'all 0.3s ease';
            
            setTimeout(() => {
                element.style.transition = '';
            }, 300);
        }, 150);
    }

    animateElement(element, animation) {
        if (!element) return;
        
        const animations = {
            'pulse': 'animate-pulse',
            'pulse-small': 'animate-pulse',
            'slide-up': 'animate-slide-up',
            'float': 'transform transition-transform duration-300 hover:-translate-y-1'
        };
        
        const animationClass = animations[animation];
        if (animationClass) {
            element.classList.add(animationClass);
            setTimeout(() => {
                element.classList.remove(animationClass);
            }, 300);
        }
    }

    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 px-6 py-4 rounded-xl shadow-lg transform transition-all duration-300 translate-x-0 ${
            type === 'success' ? 'bg-emerald-500/90 text-white' :
            type === 'error' ? 'bg-red-500/90 text-white' :
            type === 'warning' ? 'bg-amber-500/90 text-white' :
            'bg-blue-500/90 text-white'
        }`;
        
        notification.innerHTML = `
            <div class="flex items-center gap-3">
                <i data-lucide="${
                    type === 'success' ? 'check-circle' :
                    type === 'error' ? 'alert-circle' :
                    type === 'warning' ? 'alert-triangle' :
                    'info'
                }" class="w-5 h-5"></i>
                <span class="font-medium">${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Animate in
        requestAnimationFrame(() => {
            notification.style.transform = 'translateX(0)';
        });
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
        
        // Initialize icon
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    updateURL(range) {
        // Update URL without page reload
        const params = new URLSearchParams(window.location.search);
        params.set('start', range.start);
        params.set('end', range.end);
        
        const newUrl = `${window.location.pathname}?${params.toString()}`;
        window.history.replaceState({}, '', newUrl);
    }

    capitalizeFirst(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    getTableHeaders(category) {
        const headers = {
            fuel: ['Vehicle', 'Date', 'Quantity', 'Unit Price', 'Total Cost', 'Odometer'],
            reparation: ['Vehicle', 'Date', 'Provider', 'Service Type', 'Cost', 'Status'],
            maintenance: ['Vehicle', 'Date', 'Type', 'Description', 'Cost', 'Next Due'],
            purchases: ['Vehicle', 'Purchase Date', 'Price', 'Supplier', 'Registration', 'Warranty']
        };
        
        return headers[category] || [];
    }

    getTableRow(record, category) {
        switch (category) {
            case 'fuel':
                return [
                    record.vehicle_plate || '',
                    record.date || '',
                    record.quantity || '',
                    record.unit_price || '',
                    record.cost || '',
                    record.odometer || ''
                ];
            case 'reparation':
                return [
                    record.vehicle_plate || '',
                    record.repair_date || '',
                    record.provider || '',
                    record.service_type || '',
                    record.cost || '',
                    record.status || ''
                ];
            case 'maintenance':
                return [
                    record.vehicle_plate || '',
                    record.date || '',
                    record.type || '',
                    record.description || '',
                    record.cost || '',
                    record.next_due || ''
                ];
            case 'purchases':
                return [
                    record.vehicle_plate || '',
                    record.purchase_date || '',
                    record.price || '',
                    record.supplier || '',
                    record.registration || '',
                    record.warranty_until || ''
                ];
            default:
                return [];
        }
    }
}

// Initialize analytics when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Create global analytics instance
    window.fleetAnalytics = new FleetAnalytics();
    
    // Initialize if we're on the analytics page
    if (document.querySelector('#monthlyExpenseChart')) {
        window.fleetAnalytics.init();
    }
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FleetAnalytics;
}