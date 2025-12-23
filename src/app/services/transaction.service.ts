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

  getSpendingTrend(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/transactions/spending-trend`);
  }

  getMonthlyBreakdown(month?: string): Observable<any> {
    const url = month ? `${this.apiUrl}/transactions/monthly-breakdown/${month}` : `${this.apiUrl}/transactions/monthly-breakdown`;
    return this.http.get<any>(url);
  }
}