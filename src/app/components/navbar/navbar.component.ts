import { Component, HostListener, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../services/transaction.service';
import { AuthService } from '../../services/auth.service';
import { PlaidLinkService } from '../../services/plaid-link.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  isCollapsed = false;
  categoryBudgets: Array<{category: string, amount: number}> = [];
  readonly CATEGORY_BUDGET_KEY = 'categoryBudget';
  showBudgetModal = false;
  showCategoryEditor = false;
  connectingBank = false;

  constructor(
    private router: Router,
    private transactionService: TransactionService,
    private authService: AuthService,
    private plaidLinkService: PlaidLinkService,
    private elRef: ElementRef
  ) {}

  // ── Computed getters ──
  get greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }

  get userName(): string {
    const user = (this.authService as any).currentUser ?? null;
    if (user?.firstName && user?.lastName) return `${user.firstName} ${user.lastName}`;
    if (user?.email) return user.email.split('@')[0];
    return 'Saavy User';
  }

  get firstName(): string {
    return this.userName.split(' ')[0];
  }

  get userInitials(): string {
    const parts = this.userName.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (this.userName[0] ?? 'S').toUpperCase();
  }

  // ── Collapse ──
  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;
  }

  @HostListener('document:click', ['$event'])
  closeDropdown(event: Event) {
    const target = event.target as Node | null;
    if (!this.elRef.nativeElement.contains(target)) {
      this.showCategoryEditor = false;
    }
  }

  setBudgetGoal(event: Event) {
    event.stopPropagation();
    this.showCategoryEditor = !this.showCategoryEditor;
    if (this.showCategoryEditor) {
      this.loadCategoriesAndBudgets();
    }
  }

  closeBudgetModal() {
    this.showBudgetModal = false;
  }

  loadCategoryBudgets() {
    const raw = localStorage.getItem(this.CATEGORY_BUDGET_KEY);
    if (!raw) { this.categoryBudgets = []; return; }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.categoryBudgets = Object.entries(parsed).map(([k, v]) => ({ category: k, amount: Number(v) }));
      }
    } catch (e) {
      this.categoryBudgets = [];
    }
  }

  private loadCategoriesAndBudgets() {
    this.transactionService.getCategoryBreakdown().subscribe({
      next: (cats) => {
        const names = Array.isArray(cats) ? cats.map((c: any) => c.category) : [];
        this.mergeCategoriesWithStored(names);
      },
      error: () => {
        const raw = localStorage.getItem(this.CATEGORY_BUDGET_KEY);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            this.categoryBudgets = Object.entries(parsed).map(([k, v]) => ({ category: k, amount: Number(v) }));
            return;
          } catch {}
        }
        this.categoryBudgets = [
          { category: 'Food', amount: 0 },
          { category: 'Transport', amount: 0 },
          { category: 'Entertainment', amount: 0 }
        ];
      }
    });
  }

  private mergeCategoriesWithStored(names: string[]) {
    const storedRaw = localStorage.getItem(this.CATEGORY_BUDGET_KEY);
    const stored: Record<string, number> = storedRaw ? JSON.parse(storedRaw) : {};
    this.categoryBudgets = names.map(n => ({ category: n, amount: Number(stored[n] || 0) }));
    for (const k of Object.keys(stored)) {
      if (!this.categoryBudgets.find(c => c.category === k)) {
        this.categoryBudgets.push({ category: k, amount: Number(stored[k]) });
      }
    }
  }

  addCategoryBudget() {
    this.categoryBudgets.push({ category: '', amount: 0 });
  }

  removeCategoryBudget(index: number) {
    this.categoryBudgets.splice(index, 1);
  }

  saveCategoryBudgets(event: Event) {
    event.stopPropagation();
    const out: Record<string, number> = {};
    for (const item of this.categoryBudgets) {
      const name = (item.category || '').trim();
      const amt = Number(item.amount);
      if (!name) continue;
      if (!isFinite(amt) || amt < 0) {
        alert(`Invalid budget for "${name}". Please enter a non-negative number.`);
        return;
      }
      out[name] = Math.round(amt * 100) / 100;
    }
    localStorage.setItem(this.CATEGORY_BUDGET_KEY, JSON.stringify(out));
    this.showCategoryEditor = false;
    alert('Category budgets saved. AI insights will use these values.');
  }

  exportSummary(event: Event) {
    event.stopPropagation();
    const budgetGoal = localStorage.getItem('budgetGoal');
    const csvContent = [
      'Metric,Value',
      `Budget Goal,${budgetGoal ? `$${Number(budgetGoal).toLocaleString()}` : 'Not set'}`,
      `Export Date,${new Date().toLocaleDateString()}`,
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.setAttribute('href', URL.createObjectURL(blob));
    link.setAttribute('download', `budget-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    alert('Budget data exported!');
  }

  async connectBank(event: Event) {
    event.stopPropagation();
    if (this.connectingBank) return;

    this.connectingBank = true;
    try {
      const result = await this.plaidLinkService.connectAndSync();
      if (!result.cancelled) {
        alert(`Account connected. Imported ${result.importedTransactions} new transactions.`);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Could not connect this account.');
    } finally {
      this.connectingBank = false;
    }
  }

  logout() {
    const confirmed = confirm('Are you sure you want to logout?');
    if (confirmed) this.authService.logout();
  }
}
