import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { UserPreferencesService } from '../../services/user-preferences.service';
import { User } from '../../models/auth';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss'
})
export class SettingsComponent implements OnInit {
  settingsForm: FormGroup;
  profileForm: FormGroup;
  saveSuccess = false;
  editingProfile = false;
  profileSaveSuccess = false;
  profileSaveError: string | null = null;
  profileSaving = false;
  currentUser: User | null = null;
  
  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private preferences: UserPreferencesService
  ) {
    this.settingsForm = this.fb.group({
      notifications: [true],
      currency: ['USD'],
      theme: ['dark']
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
    this.settingsForm.patchValue(this.preferences.current);
  }

  saveSettings() {
    this.preferences.save(this.settingsForm.getRawValue());
    
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
    if (!this.profileForm.valid || this.profileSaving) return;

    this.profileSaving = true;
    this.profileSaveError = null;
    this.authService.updateProfile(this.profileForm.getRawValue()).subscribe({
      next: user => {
        this.currentUser = user;
        this.profileSaveSuccess = true;
        this.editingProfile = false;
        this.profileSaving = false;
        setTimeout(() => this.profileSaveSuccess = false, 3000);
      },
      error: error => {
        this.profileSaving = false;
        this.profileSaveError = error?.error?.message || error?.message || 'Could not update your profile.';
      }
    });
  }
}
