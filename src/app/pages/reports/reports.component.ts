import { Component, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TransactionService } from '../../services/transaction.service';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './reports.component.html',
  styleUrls: ['./reports.component.scss']
})
export class ReportsComponent implements AfterViewInit {
  @ViewChild('annualTrendChart') annualTrendRef!: ElementRef;
  @ViewChild('categoryChart') categoryRef!: ElementRef;
  @ViewChild('comparisonChart') comparisonRef!: ElementRef;
  @ViewChild('savingsChart') savingsRef!: ElementRef;
  @ViewChild('categoryTrendChart') categoryTrendRef!: ElementRef;

  charts: { [key: string]: Chart } = {};
  selectedMonth = 'Dec';
  selectedYear = '2025';
  
  months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  constructor(private transactionService: TransactionService) {}

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.loadAllCharts();
    }, 100);
  }

  loadAllCharts(): void {
    this.loadAnnualTrend();
    this.loadMonthlyBreakdown();
    this.loadComparisonChart();
    this.loadSavingsChart();
    this.loadCategoryTrendChart();
  }

  loadAnnualTrend(): void {
    this.transactionService.getSpendingTrend().subscribe(data => {
      this.createAnnualTrendChart(data);
    });
  }

  loadMonthlyBreakdown(): void {
    this.transactionService.getMonthlyBreakdown(this.selectedMonth).subscribe(data => {
      this.createCategoryChart(data);
    });
  }

  loadComparisonChart(): void {
    this.transactionService.getSpendingTrend().subscribe(data => {
      this.createComparisonChart(data);
    });
  }

  loadSavingsChart(): void {
    this.transactionService.getSpendingTrend().subscribe(data => {
      this.createSavingsChart(data);
    });
  }

  loadCategoryTrendChart(): void {
    // Load multiple months for trend analysis
    const monthPromises = ['Jan', 'Jun', 'Dec'].map(month => 
      this.transactionService.getMonthlyBreakdown(month).toPromise()
    );
    
    Promise.all(monthPromises).then(results => {
      this.createCategoryTrendChart(results);
    });
  }

  createAnnualTrendChart(data: any[]): void {
    if (this.charts['annual']) this.charts['annual'].destroy();
    
    const ctx = this.annualTrendRef.nativeElement.getContext('2d');
    this.charts['annual'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.month),
        datasets: [
          {
            label: 'Income',
            data: data.map(d => d.income),
            borderColor: 'rgb(40, 167, 69)',
            backgroundColor: 'rgba(40, 167, 69, 0.1)',
            tension: 0.4,
            fill: false
          },
          {
            label: 'Expenses',
            data: data.map(d => d.expenses),
            borderColor: 'rgb(220, 53, 69)',
            backgroundColor: 'rgba(220, 53, 69, 0.1)',
            tension: 0.4,
            fill: false
          },
          {
            label: 'Savings',
            data: data.map(d => d.savings),
            borderColor: 'rgb(0, 123, 255)',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            tension: 0.4,
            fill: false
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: `Financial Trend - ${this.selectedYear}` },
          legend: { position: 'top' }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + Number(value).toLocaleString();
              }
            }
          }
        }
      }
    });
  }

  createCategoryChart(data: any): void {
    if (this.charts['category']) this.charts['category'].destroy();
    
    const ctx = this.categoryRef.nativeElement.getContext('2d');
    const categories = Object.keys(data);
    const values = Object.values(data) as number[];
    
    this.charts['category'] = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: categories.map(c => c.charAt(0).toUpperCase() + c.slice(1)),
        datasets: [{
          data: values,
          backgroundColor: [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0',
            '#9966FF', '#FF9F40', '#FF6384', '#C9CBCF'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: `${this.selectedMonth} Expense Breakdown` },
          legend: { position: 'right' }
        }
      }
    });
  }

  createComparisonChart(data: any[]): void {
    if (this.charts['comparison']) this.charts['comparison'].destroy();
    
    const ctx = this.comparisonRef.nativeElement.getContext('2d');
    const last6Months = data.slice(-6);
    
    this.charts['comparison'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: last6Months.map(d => d.month),
        datasets: [
          {
            label: 'Income',
            data: last6Months.map(d => d.income),
            backgroundColor: 'rgba(40, 167, 69, 0.7)'
          },
          {
            label: 'Expenses',
            data: last6Months.map(d => d.expenses),
            backgroundColor: 'rgba(220, 53, 69, 0.7)'
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Income vs Expenses (Last 6 Months)' }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + Number(value).toLocaleString();
              }
            }
          }
        }
      }
    });
  }

  createSavingsChart(data: any[]): void {
    if (this.charts['savings']) this.charts['savings'].destroy();
    
    const ctx = this.savingsRef.nativeElement.getContext('2d');
    const savingsRates = data.map(d => Number(((d.savings / d.income) * 100).toFixed(1)));
    
    this.charts['savings'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(d => d.month),
        datasets: [{
          label: 'Savings Rate (%)',
          data: savingsRates,
          borderColor: 'rgb(0, 123, 255)',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Savings Rate Trend' }
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 50,
            ticks: {
              callback: function(value) {
                return value + '%';
              }
            }
          }
        }
      }
    });
  }

  createCategoryTrendChart(data: any[]): void {
    if (this.charts['categoryTrend']) this.charts['categoryTrend'].destroy();
    
    const ctx = this.categoryTrendRef.nativeElement.getContext('2d');
    const months = ['Jan', 'Jun', 'Dec'];
    const categories = ['housing', 'food', 'transport', 'entertainment'];
    
    this.charts['categoryTrend'] = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months,
        datasets: categories.map((category, index) => ({
          label: category.charAt(0).toUpperCase() + category.slice(1),
          data: data.map(monthData => monthData[category] || 0),
          backgroundColor: [
            'rgba(255, 99, 132, 0.7)',
            'rgba(54, 162, 235, 0.7)', 
            'rgba(255, 205, 86, 0.7)',
            'rgba(75, 192, 192, 0.7)'
          ][index]
        }))
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: 'Category Spending Comparison' }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value) {
                return '$' + Number(value).toLocaleString();
              }
            }
          }
        }
      }
    });
  }
}
