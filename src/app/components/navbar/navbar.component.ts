import { Component, HostListener, ElementRef } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TransactionService } from '../../services/transaction.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  isDropdownOpen = false;
  categoryBudgets: Array<{category: string, amount: number}> = [];
  readonly CATEGORY_BUDGET_KEY = 'categoryBudget';
  showBudgetModal = false;
  showCategoryEditor = false; // show submenu in dropdown

  constructor(private router: Router, private transactionService: TransactionService, private elRef: ElementRef) {}

  @HostListener('document:click', ['$event'])
  closeDropdown(event: Event) {
    // Only close when clicking outside this component
    const target = event.target as Node | null;
    if (!this.elRef.nativeElement.contains(target)) {
      this.isDropdownOpen = false;
      this.showCategoryEditor = false;
    }
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
  }
  setBudgetGoal(event: Event) {
    event.stopPropagation();
    // Toggle category editor submenu inside the dropdown
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
    if (!raw) {
      this.categoryBudgets = [];
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.categoryBudgets = Object.entries(parsed).map(([k, v]) => ({ category: k, amount: Number(v) }));
      }
    } catch (e) {
      console.warn('Failed to parse category budgets:', e);
      this.categoryBudgets = [];
    }
  }

  private loadCategoriesAndBudgets() {
    // Load live categories from TransactionService if available, then merge stored budgets
    this.transactionService.getCategoryBreakdown().subscribe({
      next: (cats) => {
        const names = Array.isArray(cats) ? cats.map((c: any) => c.category) : [];
        this.mergeCategoriesWithStored(names);
      },
      error: () => {
        // fallback to stored or default categories
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
    // include any stored categories not in names
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
        alert(`Invalid budget for category "${name}". Please enter a non-negative number.`);
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
    this.isDropdownOpen = false;
    
    // Get data from localStorage if available (basic implementation)
    const budgetGoal = localStorage.getItem('budgetGoal');
    const exportData = {
      exportDate: new Date().toISOString(),
      budgetGoal: budgetGoal ? `$${Number(budgetGoal).toLocaleString()}` : 'Not set',
      exportedFrom: 'Navbar Tools'
    };

    // Create CSV format
    const csvContent = [
      'Metric,Value',
      `Budget Goal,${exportData.budgetGoal}`,
      `Export Date,${new Date().toLocaleDateString()}`,
      `Exported From,${exportData.exportedFrom}`
    ].join('\\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `budget-export-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert('Basic budget data exported! For full summary data, use the export button on the Dashboard.');
  }

  connectBank(event: Event) {
    event.stopPropagation();
    this.isDropdownOpen = false;
    alert('Bank integration coming soon! This will allow you to automatically sync your transactions from your bank account.');
  }
}
