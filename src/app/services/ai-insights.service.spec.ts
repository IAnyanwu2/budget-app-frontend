import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AiInsightsService } from './ai-insights.service';

describe('AiInsightsService', () => {
  let service: AiInsightsService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()]
    });
    service = TestBed.inject(AiInsightsService);
  });

  it('builds suggested goals from actual categories and configured limits', () => {
    const goals = service.generateBudgetGoals([
      { category: 'FOOD_AND_DRINK_RESTAURANTS', amount: 200, percentage: 50 },
      { category: 'TRANSPORTATION_GAS', amount: 100, percentage: 25 },
      { category: 'ENTERTAINMENT', amount: 50, percentage: 12.5 }
    ], {
      FOOD_AND_DRINK_RESTAURANTS: 150
    });

    expect(goals).toEqual([
      { goal: 'Stay within food and drink restaurants budget', target: 150, timeframe: 'Next month' },
      { goal: 'Try 10% less on transportation gas', target: 90, timeframe: 'Next month' },
      { goal: 'Try 10% less on entertainment', target: 45, timeframe: 'Next month' }
    ]);
  });
});