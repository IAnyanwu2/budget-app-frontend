import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { User } from '../../models/auth';

interface UserSettings {
  notifications: boolean;
  monthlyBudgetLimit: number | null;
  currency: string;
  theme: string;
}

@Component({
  selector: 'app-settings',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  settingsForm: FormGroup;
  profileForm: FormGroup;
  saveSuccess = false;
  editingProfile = false;
  profileSaveSuccess = false;
  currentUser: User | null = null;
  
  private readonly SETTINGS_KEY = 'user_settings';

  constructor(private fb: FormBuilder, private authService: AuthService) {
    this.settingsForm = this.fb.group({
      notifications: [true],
      monthlyBudgetLimit: [null],
      currency: ['USD'],
      theme: ['light']
    });

    this.profileForm = this.fb.group({
      firstName: ['', [Validators.required, Validators.minLength(2)]],
      lastName: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]]
    });
  }

  ngOnInit() {
    this.loadSettings();
    this.loadCurrentUser();
  }

  private loadCurrentUser() {
    this.currentUser = this.authService.getCurrentUser();
    if (this.currentUser) {
      this.profileForm.patchValue({
        firstName: this.currentUser.firstName,
        lastName: this.currentUser.lastName,
        email: this.currentUser.email
      });
    }
  }

  private loadSettings() {
    const saved = localStorage.getItem(this.SETTINGS_KEY);
    if (saved) {
      try {
        const settings: UserSettings = JSON.parse(saved);
        this.settingsForm.patchValue(settings);
      } catch (error) {
        console.warn('Failed to load settings:', error);
      }
    }
  }

  saveSettings() {
    const settings: UserSettings = this.settingsForm.value;
    localStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    
    this.saveSuccess = true;
    setTimeout(() => this.saveSuccess = false, 3000);
  }

  editProfile() {
    this.editingProfile = true;
  }

  cancelProfileEdit() {
    this.editingProfile = false;
    this.loadCurrentUser(); // Reset form to original values
    this.profileSaveSuccess = false;
  }

  saveProfile() {
    if (this.profileForm.valid) {
      const updatedProfile = this.profileForm.value;
      
      // For now, save to localStorage (TODO: implement backend API)
      if (this.currentUser) {
        const updatedUser = {
          ...this.currentUser,
          firstName: updatedProfile.firstName,
          lastName: updatedProfile.lastName,
          email: updatedProfile.email
        };
        
        // Update localStorage
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        this.currentUser = updatedUser;
        
        this.profileSaveSuccess = true;
        this.editingProfile = false;
        
        setTimeout(() => {
          this.profileSaveSuccess = false;
        }, 3000);
      }
    }
  }
}
