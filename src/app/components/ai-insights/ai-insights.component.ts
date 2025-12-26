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
  budgetGoalNum?: number;
  progressPercent?: number;
  alertMessage?: string;

  constructor(private aiInsightsService: AiInsightsService) {}

  ngOnInit() {
    // Auto-generate insights on component load
    this.generateInsights();
  }

  generateInsights() {
    this.loading = true;
    const stored = localStorage.getItem('budgetGoal');
    const budgetGoal = stored && !isNaN(Number(stored)) ? Number(stored) : undefined;
    this.budgetGoalNum = budgetGoal;
    // read per-category budgets if present (JSON object in localStorage under 'categoryBudget')
    let categoryGoals: Record<string, number> | undefined;
    const catRaw = localStorage.getItem('categoryBudget');
    if (catRaw) {
      try {
        const parsed = JSON.parse(catRaw);
        if (typeof parsed === 'object' && parsed !== null) {
          categoryGoals = Object.fromEntries(Object.entries(parsed).map(([k,v]) => [k, Number(v)]));
        }
      } catch {}
    }
    this.aiInsightsService.generateInsights(budgetGoal, categoryGoals).subscribe({
      next: (analysis) => {
        this.analysis = analysis;
        this.personalizedTips = this.aiInsightsService.getPersonalizedTips(analysis);
        // Use user budget goal when generating suggested goals (fallback to 500)
        this.budgetGoals = this.aiInsightsService.generateBudgetGoals(analysis.totalSpending, budgetGoal || 500);

        // Compute progress toward budget goal (if available)
        if (this.budgetGoalNum && this.budgetGoalNum > 0) {
          this.progressPercent = Math.round((analysis.totalSpending / this.budgetGoalNum) * 100);
          if (this.progressPercent >= 100) {
            this.alertMessage = `You have exceeded your monthly budget goal by ${this.progressPercent - 100}%`;
          } else if (this.progressPercent >= 90) {
            this.alertMessage = `You're approaching your budget goal (${this.progressPercent}% used). Consider trimming spending.`;
          } else {
            this.alertMessage = undefined;
          }
        } else {
          this.progressPercent = undefined;
          this.alertMessage = undefined;
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('Error generating insights:', error);
        this.loading = false;
      }
    });
  }
}