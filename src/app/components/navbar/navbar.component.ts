import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.scss']
})
export class NavbarComponent {
  isDropdownOpen = false;

  constructor(private router: Router) {}

  @HostListener('document:click', ['$event'])
  closeDropdown(event: Event) {
    this.isDropdownOpen = false;
  }

  toggleDropdown() {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  setBudgetGoal(event: Event) {
    event.stopPropagation();
    this.isDropdownOpen = false;
    const goal = prompt('Enter your monthly budget goal (USD):');
    if (goal && !isNaN(Number(goal))) {
      localStorage.setItem('budgetGoal', goal);
      alert(`Budget goal set to $${Number(goal).toLocaleString()}`);
    } else if (goal !== null) {
      alert('Please enter a valid number');
    }
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
