import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TransactionSummary } from '../models/transaction-summary';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TransactionService {
  private apiUrl = environment.apiBaseUrl;

  constructor(private http: HttpClient) {}

  getSummary(dateRange?: string): Observable<TransactionSummary> {
    const url = dateRange ? `${this.apiUrl}/transactions/summary?dateRange=${dateRange}` : `${this.apiUrl}/transactions/summary`;
    return this.http.get<TransactionSummary>(url);
  }

  getRecentTransactions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/transactions/recent`);
  }

  getCategoryBreakdown(dateRange?: string): Observable<any[]> {
    const url = dateRange ? `${this.apiUrl}/transactions/category-breakdown?dateRange=${dateRange}` : `${this.apiUrl}/transactions/category-breakdown`;
    return this.http.get<any[]>(url);
  }

  getSpendingTrend(year?: number): Observable<any[]> {
    const url = year
      ? `${this.apiUrl}/transactions/spending-trend?year=${year}`
      : `${this.apiUrl}/transactions/spending-trend`;
    return this.http.get<any[]>(url);
  }

  getMonthlyBreakdown(month?: string, year?: number): Observable<any> {
    const baseUrl = month
      ? `${this.apiUrl}/transactions/monthly-breakdown/${encodeURIComponent(month)}`
      : `${this.apiUrl}/transactions/monthly-breakdown`;
    const url = year ? `${baseUrl}?year=${year}` : baseUrl;
    return this.http.get<any>(url);
  }
}