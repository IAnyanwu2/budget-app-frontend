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

  getSummary(): Observable<TransactionSummary> {
    return this.http.get<TransactionSummary>(`${this.apiUrl}/transactions/summary`);
  }

  getRecentTransactions(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/transactions/recent`);
  }

  getCategoryBreakdown(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/transactions/category-breakdown`);
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