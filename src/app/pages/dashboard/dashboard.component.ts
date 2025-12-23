import { Component, OnInit, ViewChild, ElementRef, AfterViewInit, ChangeDetectorRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TransactionService } from '../../services/transaction.service';
import { TransactionSummary } from '../../models/transaction-summary';
import { CommonModule, CurrencyPipe, DatePipe } from '@angular/common';
import { AiInsightsComponent } from '../../components/ai-insights/ai-insights.component';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, CommonModule, CurrencyPipe, DatePipe, AiInsightsComponent],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss']
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('budgetChart', { static: false }) budgetChart!: ElementRef<HTMLCanvasElement>;
  
  summary: TransactionSummary | null = null;
  error: string | null = null;
  loading = false;
  chart: Chart | null = null;

  constructor(
    private transactionService: TransactionService,
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
            color: 'white'
          },
          legend: {
            labels: {
              color: 'white'
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: suggestedMax,
            ticks: {
              color: 'white',
              callback: function(value) {
                return '$' + Number(value).toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          },
          x: {
            ticks: {
              color: 'white'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)'
            }
          }
        }
      }
    };

    this.chart = new Chart(ctx, config);
  }

  refresh() {
    this.loadSummary();
  }

  getSavingsPercent(): number {
    if (!this.summary || !this.summary.income || !this.summary.savings) return 0;
    const percent = this.summary.savings / this.summary.income * 100;
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

  connectBank() {
    alert('Bank integration coming soon! This will allow you to automatically sync your transactions from your bank account.');
  }
}
