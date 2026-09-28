import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, forkJoin, of, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { TransactionService } from './transaction.service';

export interface BudgetInsight {
  category: string;
  insight: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  potentialSavings: number;
  suggestedBudget?: number;
}

export interface SpendingAnalysis {
  totalSpending: number;
  topCategories: Array<{category: string, amount: number, percentage: number}>;
  trends: Array<{month: string, amount: number}>;
  insights: BudgetInsight[];
  overallScore: number; // Out of 100
  summary: string;
  source: 'ollama' | 'rules';
}

@Injectable({
  providedIn: 'root'
})
export class AiInsightsService {
  private readonly analysisUrl = `${environment.apiBaseUrl}/ai-insights`;
  private insightsSubject = new BehaviorSubject<SpendingAnalysis | null>(null);
  public insights$ = this.insightsSubject.asObservable();
  
  constructor(
    private http: HttpClient, 
    private transactionService: TransactionService
  ) {}

  generateInsights(budgetGoal?: number, categoryGoals?: Record<string, number>): Observable<SpendingAnalysis> {
    return new Observable(observer => {
      // Get real transaction data first
      forkJoin({
        summary: this.transactionService.getSummary(),
        recent: this.transactionService.getRecentTransactions(),
        categoryBreakdown: this.transactionService.getCategoryBreakdown(),
        spendingTrend: this.transactionService.getSpendingTrend()
      }).subscribe({
        next: (data) => {
          // Analyze the real data and generate insights using Ollama
          this.analyzeWithOllama(data, budgetGoal, categoryGoals).subscribe({
            next: (analysis) => {
              this.insightsSubject.next(analysis);
              observer.next(analysis);
              observer.complete();
            },
            error: (error) => {
              // Fallback to rule-based analysis if Ollama fails
              const fallbackAnalysis = this.generateRuleBasedAnalysis(data);
              this.insightsSubject.next(fallbackAnalysis);
              observer.next(fallbackAnalysis);
              observer.complete();
            }
          });
        },
        error: (error) => {
          console.error('Failed to fetch transaction data:', error);
          observer.error(error);
        }
      });
    });
  }

  private analyzeWithOllama(transactionData: any, budgetGoal?: number, categoryGoals?: Record<string, number>): Observable<SpendingAnalysis> {
    return this.http.post<{ response: string }>(this.analysisUrl, { budgetGoal, categoryGoals }).pipe(
      switchMap(resp => {
        const text = resp?.response || '';
      const refusalPatterns = [/I\'m sorry,? I can\'t help/, /I cannot help with that/, /I can.?t help with that/, /I\'m sorry, but I can.?t help/gi];
      if (refusalPatterns.some(rx => rx.test(text))) {
        return throwError(() => new Error('Model refused the request'));
      }

      try {
        const parsed = this.parseOllamaResponse(text, transactionData);
        // Post-process priorities and suggested budgets using provided categoryGoals
        if (categoryGoals && parsed && Array.isArray(parsed.insights)) {
          parsed.insights = parsed.insights.map((ins: BudgetInsight) => {
            const cat = ins.category || 'Uncategorized';
            // find actual spending for this category
            const catData = (transactionData.categoryBreakdown || []).find((c: any) => c.category?.toLowerCase() === cat.toLowerCase());
            const spent = catData ? Number(catData.amount) : 0;
            const goalForCat = Object.keys(categoryGoals).find(k => k.toLowerCase() === cat.toLowerCase());
            if (goalForCat) {
              const goalVal = Number(categoryGoals[goalForCat]);
              ins.suggestedBudget = goalVal;
              if (goalVal > 0 && spent > goalVal) {
                ins.priority = 'high';
                ins.recommendation = `Priority: Align with category budget. ${ins.recommendation}`;
              }
            }
            return ins;
          });
        }
        if (!this.isValidAnalysis(parsed)) {
          return throwError(() => new Error('Invalid analysis schema from model'));
        }
          return of(parsed);
      } catch (e) {
        return throwError(() => e);
      }
      })
    );
  }

  private parseOllamaResponse(response: string, transactionData: any): SpendingAnalysis {
    const aiAnalysis = JSON.parse(response.trim());

      // If model explicitly returned a refusal object, treat as refusal
      if ((aiAnalysis as any).refused) {
        throw new Error('Model refusal: ' + ((aiAnalysis as any).reason || 'refused'));
      }

      // Map to SpendingAnalysis with basic validation. Accept either:
      // - insights: array of objects matching the schema
      // - insights: array of strings (convert each string into a BudgetInsight)
      const rawInsights = Array.isArray(aiAnalysis.insights) ? aiAnalysis.insights : [];

      const normalizedInsights: BudgetInsight[] = rawInsights.map((it: any) => {
        if (typeof it === 'string') {
          return {
            category: 'Uncategorized',
            insight: it,
            recommendation: '',
            priority: 'low',
            potentialSavings: 0
          };
        }

        return {
          category: it?.category || 'Uncategorized',
          insight: it?.insight || (typeof it === 'string' ? it : ''),
          recommendation: it?.recommendation || '',
          priority: (it?.priority === 'high' || it?.priority === 'medium' || it?.priority === 'low') ? it.priority : 'low',
          potentialSavings: typeof it?.potentialSavings === 'number' ? it.potentialSavings : 0,
          suggestedBudget: typeof it?.suggestedBudget === 'number' ? it.suggestedBudget : undefined
        } as BudgetInsight;
      });

      const result: SpendingAnalysis = {
        totalSpending: transactionData.summary.expenses,
        topCategories: transactionData.categoryBreakdown,
        trends: transactionData.spendingTrend,
        overallScore: typeof aiAnalysis.overallScore === 'number' ? aiAnalysis.overallScore : 70,
        summary: aiAnalysis.summary || 'Analysis completed',
        insights: normalizedInsights,
        source: 'ollama'
      };

      return result;
  }

  private generateRuleBasedAnalysis(data: any): SpendingAnalysis {
    const insights: BudgetInsight[] = [];
    let score = 100;

    // Analyze spending ratio
    const savingsRate = (data.summary.savings / data.summary.income) * 100;
    if (savingsRate < 10) {
      score -= 30;
      insights.push({
        category: 'Savings',
        insight: `Observed savings rate ${savingsRate.toFixed(1)}%, lower than common targets.`,
        recommendation: 'Experiment: set up an automatic small transfer to savings for 4 weeks and observe the change in savings rate.',
        priority: 'high',
        potentialSavings: data.summary.income * 0.1
      });
    }

    // Analyze category spending
    data.categoryBreakdown.forEach((category: any) => {
      if (category.category === 'Food' && category.percentage > 30) {
        score -= 15;
        insights.push({
          category: 'Food',
          insight: `Food expenses are ${category.percentage}% of your budget, relatively high compared to typical ranges.`,
          recommendation: 'Experiment: try 2 weeks of meal-prep and track spending to see potential savings.',
          priority: 'high',
          potentialSavings: category.amount * 0.2
        });
      }
      
      if (category.category === 'Entertainment' && category.percentage > 10) {
        score -= 10;
        insights.push({
          category: 'Entertainment',
          insight: `Entertainment spending is ${category.percentage}% of your budget.`,
          recommendation: 'Experiment: try reducing paid entertainment by one event per month and track savings.',
          priority: 'medium',
          potentialSavings: category.amount * 0.3
        });
      }
    });

    // finalize score & return
    return {
      totalSpending: data.summary.expenses,
      topCategories: data.categoryBreakdown,
      trends: data.spendingTrend,
      overallScore: Math.max(0, Math.min(100, score)),
      summary: score >= 80 ? 'Your budget is healthy with room for optimization.' : 
               score >= 60 ? 'Your budget needs some attention in key areas.' :
               'Your budget requires significant improvement.',
      insights: insights.slice(0, 3),
      source: 'rules'
    };
  }

  // Basic runtime validation for SpendingAnalysis
  private isValidAnalysis(a: SpendingAnalysis | any): boolean {
    try {
      if (!a) return false;
      if (typeof a.overallScore !== 'number') return false;
      if (typeof a.summary !== 'string') return false;
      if (!Array.isArray(a.insights)) return false;
      return true;
    } catch {
      return false;
    }
  }

  getPersonalizedTips(userSpending: any): Array<{icon: string, text: string}> {
    const tips = [
      { icon: 'utensils', text: 'Try meal prepping on Sundays to reduce food costs' },
      { icon: 'bus', text: 'Consider using public transport twice a week' },
      { icon: 'lightbulb', text: 'Switch to LED bulbs to save on electricity' },
      { icon: 'mobile-screen-button', text: 'Review and cancel unused subscriptions' },
      { icon: 'coins', text: 'Use cashback credit cards for regular purchases' },
      { icon: 'piggy-bank', text: 'Set up automatic savings transfers' },
      { icon: 'chart-line', text: 'Track daily expenses to identify spending patterns' },
      { icon: 'coins', text: 'Set up a separate account for emergency funds' }
    ];

    // return 4 random tips
    return tips.sort(() => Math.random() - 0.5).slice(0, 4);
  }

  generateBudgetGoals(
    categories: SpendingAnalysis['topCategories'],
    categoryGoals: Record<string, number> = {}
  ): Array<{goal: string, target: number, timeframe: string}> {
    return [...categories]
      .filter(category => category.amount > 0)
      .sort((first, second) => second.amount - first.amount)
      .slice(0, 3)
      .map(category => {
        const configuredName = Object.keys(categoryGoals)
          .find(name => name.toLowerCase() === category.category.toLowerCase());
        const configuredLimit = configuredName ? Number(categoryGoals[configuredName]) : undefined;
        const target = configuredLimit !== undefined && configuredLimit > 0
          ? configuredLimit
          : Math.round(category.amount * 0.9 * 100) / 100;
        const label = category.category.replace(/[_-]+/g, ' ').toLowerCase();

        return {
          goal: configuredLimit !== undefined
            ? `Stay within ${label} budget`
            : `Try 10% less on ${label}`,
          target,
          timeframe: 'Next month'
        };
      });
  }
}