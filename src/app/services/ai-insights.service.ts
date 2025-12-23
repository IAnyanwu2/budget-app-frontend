import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject, forkJoin, map, catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { TransactionService } from './transaction.service';

export interface BudgetInsight {
  category: string;
  insight: string;
  recommendation: string;
  priority: 'high' | 'medium' | 'low';
  potentialSavings: number;
}

export interface SpendingAnalysis {
  totalSpending: number;
  topCategories: Array<{category: string, amount: number, percentage: number}>;
  trends: Array<{month: string, amount: number}>;
  insights: BudgetInsight[];
  overallScore: number; // Out of 100
  summary: string;
}

@Injectable({
  providedIn: 'root'
})
export class AiInsightsService {
  // Use local dev proxy instead of calling Ollama directly
  private readonly ollamaUrl = 'http://localhost:5232/api/ai-insights';
  private readonly apiUrl = `${environment.apiBaseUrl}/ai-insights`;
  private insightsSubject = new BehaviorSubject<SpendingAnalysis | null>(null);
  public insights$ = this.insightsSubject.asObservable();
  
  constructor(
    private http: HttpClient, 
    private transactionService: TransactionService
  ) {}

  generateInsights(): Observable<SpendingAnalysis> {
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
          this.analyzeWithOllama(data).subscribe({
            next: (analysis) => {
              this.insightsSubject.next(analysis);
              observer.next(analysis);
              observer.complete();
            },
            error: (error) => {
              console.error('Ollama analysis failed, using fallback:', error);
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

  private analyzeWithOllama(transactionData: any): Observable<SpendingAnalysis> {
    const prompt = this.buildAnalysisPrompt(transactionData);
    
    const primaryModel = 'gpt-oss:120b-cloud';
    const fallbackModel = 'gpt-oss:120b-cloud';

    const makeRequest = (modelName: string) => ({
      model: modelName,
      prompt: prompt,
      stream: false,
      options: { temperature: 0.7, max_tokens: 1000 }
    });

    // Try primary model first; on network failure, fall back to a known working model
    return this.http.post<{response: string}>(this.ollamaUrl, makeRequest(primaryModel)).pipe(
      map(response => {
        const text = (response as any).response || '';

        // Detect common refusal patterns from models and treat as failure so we can fallback
        const refusalPatterns = [/I\'m sorry,? I can\'t help/, /I cannot help with that/, /I can.?t help with that/, /I\'m sorry, but I can.?t help/gi];
        if (refusalPatterns.some(rx => rx.test(text))) {
          throw new Error('Model refused the request');
        }

        try {
          // Parse the AI response and convert to our SpendingAnalysis format
          const parsed = this.parseOllamaResponse(text, transactionData);
          // Validate the parsed structure
          if (!this.isValidAnalysis(parsed)) {
            throw new Error('Invalid analysis schema from model');
          }
          return parsed;
        } catch (error) {
          console.error('Failed to parse or validate Ollama response:', error);
          // Bubble up error to trigger fallback in generateInsights
          throw error;
        }
      }),
      catchError(err => {
        console.warn('Primary model request failed, attempting fallback model:', err);
        // Try fallback model
        return this.http.post<{response: string}>(this.ollamaUrl, makeRequest(fallbackModel)).pipe(
          map(response => {
            const text2 = (response as any).response || '';
            try {
              const parsed2 = this.parseOllamaResponse(text2, transactionData);
              if (!this.isValidAnalysis(parsed2)) {
                throw new Error('Invalid analysis schema from fallback model');
              }
              return parsed2;
            } catch (error2) {
              console.error('Failed to parse/validate fallback response:', error2);
              return this.generateRuleBasedAnalysis(transactionData);
            }
          }),
          catchError(err2 => {
            console.error('Fallback model request also failed:', err2);
            return throwError(() => err2);
          })
        );
      })
    );
  }

  private buildAnalysisPrompt(data: any): string {
    // Strongly frame as non-prescriptive habit-building analysis and require JSON-only output
    return `You are a neutral data analyst. Do NOT provide personal financial advice or prescriptive instructions.
Only produce a JSON object (no surrounding text) that matches the schema exactly. If you must refuse, return a JSON object with {"refused": true, "reason": "<brief reason>"}.

Context:
- Monthly Income: ${data.summary.income}
- Monthly Expenses: ${data.summary.expenses}
- Monthly Savings: ${data.summary.savings}

Expense categories:
${data.categoryBreakdown.map((cat: any) => `- ${cat.category}: ${cat.amount} (${cat.percentage}%)`).join('\n')}

Historical trends:
${data.spendingTrend.map((trend: any) => `- ${trend.month}: Income ${trend.income}, Expenses ${trend.expenses}`).join('\n')}

Recent activity (top 3):
${data.recent.slice(0, 3).map((tx: any) => `- ${tx.description}: ${tx.amount} (${tx.category})`).join('\n')}

Required Output Schema (JSON only):
{
  "overallScore": number, // 0-100, data-driven health score
  "summary": string, // concise data-focused summary
  "insights": [
    {
      "category": string,
      "insight": string, // observation about habits/patterns (no prescriptive language)
      "recommendation": string, // framed as an optional experiment or habit to try (not advice)
      "priority": "high" | "medium" | "low",
      "potentialSavings": number // estimated monthly savings if experiment succeeds
    }
  ]
}

Tone and constraints:
- Use observational language (e.g., "observed", "suggested experiment", "possible impact") and avoid telling the user what they must do.
- When offering a recommendation, present it as a voluntary experiment (e.g., "Experiment: try reducing X by Y% for Z weeks and observe savings of approximately $N").
- Output JSON only — no explanatory paragraphs, no apologies, no safety policy text.
`;
  }

  private parseOllamaResponse(response: string, transactionData: any): SpendingAnalysis {
    try {
      // Try to extract JSON object from the response (models sometimes add text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in model response');
      }

      const aiAnalysis = JSON.parse(jsonMatch[0]);

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
          potentialSavings: typeof it?.potentialSavings === 'number' ? it.potentialSavings : 0
        } as BudgetInsight;
      });

      const result: SpendingAnalysis = {
        totalSpending: transactionData.summary.expenses,
        topCategories: transactionData.categoryBreakdown,
        trends: transactionData.spendingTrend,
        overallScore: typeof aiAnalysis.overallScore === 'number' ? aiAnalysis.overallScore : 70,
        summary: aiAnalysis.summary || 'Analysis completed',
        insights: normalizedInsights
      };

      return result;
    } catch (error) {
      console.error('JSON parsing failed:', error);
    }
    
    // Fallback if parsing fails
    return this.generateRuleBasedAnalysis(transactionData);
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
      insights: insights.slice(0, 3) // Limit to top 3 insights
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

  generateBudgetGoals(currentSpending: number, targetSavings: number): Array<{goal: string, target: number, timeframe: string}> {
    const savingsGoal = targetSavings || 500;
    const monthlyReduction = savingsGoal / 3; // Spread over 3 months
    
    return [
      {
        goal: 'Reduce food expenses',
        target: monthlyReduction * 0.6,
        timeframe: '30 days'
      },
      {
        goal: 'Optimize transportation',
        target: monthlyReduction * 0.3,
        timeframe: '30 days'
      },
      {
        goal: 'Cut entertainment spending',
        target: monthlyReduction * 0.1,
        timeframe: '30 days'
      }
    ];
  }
}