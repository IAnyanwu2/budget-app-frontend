import { Component, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe } from '@angular/common';
import { AiInsightsService, SpendingAnalysis, BudgetInsight } from '../../services/ai-insights.service';

@Component({
  selector: 'app-ai-insights',
  standalone: true,
  imports: [CommonModule, CurrencyPipe],
  templateUrl: './ai-insights.component.html',
  styleUrls: ['./ai-insights.component.scss']
})
export class AiInsightsComponent implements OnInit {
  loading = false;
  analysis: SpendingAnalysis | null = null;
  personalizedTips: Array<{icon: string, text: string}> = [];
  budgetGoals: Array<{goal: string, target: number, timeframe: string}> = [];

  constructor(private aiInsightsService: AiInsightsService) {}

  ngOnInit() {
    // Auto-generate insights on component load
    this.generateInsights();
  }

  generateInsights() {
    this.loading = true;
    this.aiInsightsService.generateInsights().subscribe({
      next: (analysis) => {
        this.analysis = analysis;
        this.personalizedTips = this.aiInsightsService.getPersonalizedTips(analysis);
        this.budgetGoals = this.aiInsightsService.generateBudgetGoals(analysis.totalSpending, 500);
        this.loading = false;
      },
      error: (error) => {
        console.error('Error generating insights:', error);
        this.loading = false;
      }
    });
  }
}