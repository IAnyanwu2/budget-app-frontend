import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterOutlet, RouterLink, NavigationEnd } from '@angular/router';
import { AuthService } from './services/auth.service';
import { filter } from 'rxjs/operators';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  title = 'budget-app-frontend';
  isAuthenticated = false;
  currentRoute = '';
  isDropdownOpen = false;

  constructor(private authService: AuthService, private router: Router) {}

  @HostListener('document:click', ['$event'])
  closeDropdown(event: Event) {
    // Don't close if clicking inside the dropdown
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown')) {
      this.isDropdownOpen = false;
    }
  }

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.isAuthenticated = !!user;
    });

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event: NavigationEnd) => {
      this.currentRoute = event.url;
    });
  }

  toggleDropdown(event: Event) {
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

  logout() {
    const confirmed = confirm('Are you sure you want to logout? This will end your current session.');
    if (confirmed) {
      this.authService.logout();
    }
  }
}
