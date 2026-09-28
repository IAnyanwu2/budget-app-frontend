import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TransactionService } from '../../services/transaction.service';
import { TransactionSummary } from '../../models/transaction-summary';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { AiInsightsComponent } from '../../components/ai-insights/ai-insights.component';
import { PlaidLinkService } from '../../services/plaid-link.service';
import { UserPreferencesService } from '../../services/user-preferences.service';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CommonModule, CurrencyPipe, AiInsightsComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('budgetChart', { static: false }) budgetChart!: ElementRef<HTMLCanvasElement>;
  @ViewChild(AiInsightsComponent) aiInsights?: AiInsightsComponent;
  
  summary: TransactionSummary | null = null;
  error: string | null = null;
  loading = false;
  refreshing = false;
  connectingBank = false;
  connectionMessage: string | null = null;
  chart: Chart | null = null;
  recentTransactions: any[] = [];

  constructor(
    private transactionService: TransactionService,
    private plaidLinkService: PlaidLinkService,
    public preferences: UserPreferencesService,
    private cdr: ChangeDetectorRef
  ) {}
  
  ngOnInit() {
    this.loadSummary();
  }

  ngAfterViewInit() {
    // If summary is already loaded, create chart
    if (this.summary) {
      setTimeout(() => this.createChart(), 100);
    }
  }

  loadSummary() {
    this.error = null;
    this.summary = null;
    this.transactionService.getSummary().subscribe({
      next: (data) => {
        this.summary = data;
        this.cdr.detectChanges(); // Force change detection
        // Load trend data for chart
        this.loadChartData();
      },
      error: (err) => {
        this.error = err?.message || 'Failed to load summary.';
      }
    });

    this.transactionService.getRecentTransactions().subscribe({
      next: (data) => {
        this.recentTransactions = data || [];
        this.cdr.detectChanges();
      },
      error: (err) => console.error('Failed to load recent transactions:', err)
    });
  }

  private loadChartData() {
    this.transactionService.getSpendingTrend().subscribe({
      next: (trendData) => {
        // Use real API data for chart
        setTimeout(() => {
          if (this.budgetChart?.nativeElement && this.summary) {
            this.createChart(trendData);
          } else {
            setTimeout(() => this.createChart(trendData), 100);
          }
        }, 50);
      },
      error: (err) => {
        // Fallback to mock data if API fails
        console.error('Failed to load trend data:', err);
        this.createChart();
      }
    });
  }

  private createChart(trendData?: any[]) {
    if (!this.budgetChart?.nativeElement || !this.summary) {
      return;
    }

    const ctx = this.budgetChart.nativeElement.getContext('2d');
    if (!ctx) {
      return;
    }

    // Destroy existing chart
    if (this.chart) {
      this.chart.destroy();
    }

    const textColor = this.preferences.current.theme === 'light' ? '#52615f' : '#ffffff';
    const gridColor = this.preferences.current.theme === 'light' ? 'rgba(20, 40, 36, 0.12)' : 'rgba(255, 255, 255, 0.1)';

    let labels: string[];
    let incomeData: number[];
    let expenseData: number[];
    let savingsData: number[];

    if (trendData && trendData.length > 0) {
      // Use real API data
      labels = trendData.map(item => item.month);
      incomeData = trendData.map(item => item.income);
      expenseData = trendData.map(item => item.expenses);
      savingsData = trendData.map(item => item.savings);
    } else {
      // Fallback to current summary data
      labels = ['Previous Month', 'Current Month'];
      incomeData = [this.summary.income * 0.95, this.summary.income];
      expenseData = [this.summary.expenses * 1.1, this.summary.expenses];
      savingsData = [this.summary.savings * 0.8, this.summary.savings];
    }

    // Calculate dynamic scale with some padding
    const allValues = [...incomeData, ...expenseData, ...savingsData];
    const maxValue = Math.max(...allValues);
    const suggestedMax = Math.ceil(maxValue * 1.1 / 1000) * 1000; // Round up to nearest 1000 with 10% padding

    const config: ChartConfiguration = {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Income',
            data: incomeData,
            borderColor: 'rgb(40, 167, 69)',
            backgroundColor: 'rgba(40, 167, 69, 0.1)',
            tension: 0.4
          },
          {
            label: 'Expenses',
            data: expenseData,
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            tension: 0.4
          },
          {
            label: 'Savings',
            data: savingsData,
            borderColor: 'rgb(0, 123, 255)',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: 'Monthly Budget Trend',
            color: textColor
          },
          legend: {
            labels: {
              color: textColor
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: suggestedMax,
            ticks: {
              color: textColor,
              callback: (value) => {
                return new Intl.NumberFormat(undefined, {
                  style: 'currency',
                  currency: this.preferences.current.currency,
                  maximumFractionDigits: 0
                }).format(Number(value));
              }
            },
            grid: {
              color: gridColor
            }
          },
          x: {
            ticks: {
              color: textColor
            },
            grid: {
              color: gridColor
            }
          }
        }
      }
    };

    this.chart = new Chart(ctx, config);
  }

  async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    this.connectionMessage = null;

    try {
      const importedTransactions = await this.plaidLinkService.syncTransactions();
      this.connectionMessage = `Sync complete. ${importedTransactions} new transactions.`;
    } catch (error) {
      this.connectionMessage = error instanceof Error ? error.message : 'Could not sync linked accounts.';
    } finally {
      this.refreshing = false;
      this.loadSummary();
      this.aiInsights?.generateInsights();
    }
  }

  getSavingsPercent(): number {
    const rate = this.getSavingsRate();
    if (rate === null) return 0;
    return Math.max(0, Math.min(rate, 100));
  }

  getSavingsRate(): number | null {
    if (!this.summary || this.summary.income <= 0) return null;
    return this.summary.savings / this.summary.income * 100;
  }

  getExpensesPercent(): number {
    if (!this.summary || this.summary.income <= 0) return 0;
    const percent = this.summary.expenses / this.summary.income * 100;
    return Math.max(0, Math.min(percent, 100));
  }

  exportSummary() {
    if (!this.summary) {
      alert('No data to export. Please wait for the summary to load.');
      return;
    }

    const exportData = {
      exportDate: new Date().toISOString(),
      summary: this.summary,
      savingsRate: this.getSavingsPercent()
    };

    // Create CSV format
    const csvContent = [
      'Metric,Value',
      `Currency,${this.preferences.current.currency}`,
      `Income,${this.summary.income}`,
      `Expenses,${this.summary.expenses}`,
      `Savings,${this.summary.savings}`,
      `Net Income,${this.summary.income - this.summary.expenses}`,
      `Savings Rate,${this.getSavingsPercent().toFixed(2)}%`,
      `Export Date,${new Date().toLocaleDateString()}`
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `budget-summary-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  setBudgetGoal() {
    const goal = prompt('Enter your monthly budget goal (USD):');
    if (goal && !isNaN(Number(goal))) {
      localStorage.setItem('budgetGoal', goal);
      alert(`Budget goal set to $${Number(goal).toLocaleString()}`);
    } else if (goal !== null) {
      alert('Please enter a valid number');
    }
  }

  async connectBank() {
    if (this.connectingBank) return;

    this.connectingBank = true;
    this.connectionMessage = null;
    try {
      const result = await this.plaidLinkService.connectAndSync();
      if (result.cancelled) {
        this.connectionMessage = 'Bank connection cancelled.';
      } else {
        this.connectionMessage = `Account connected. Imported ${result.importedTransactions} new transactions.`;
        this.loadSummary();
        this.aiInsights?.generateInsights();
      }
    } catch (error) {
      this.connectionMessage = error instanceof Error ? error.message : 'Could not connect this account.';
    } finally {
      this.connectingBank = false;
    }
  }
}
