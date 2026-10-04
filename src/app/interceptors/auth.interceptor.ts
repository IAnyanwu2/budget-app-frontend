import { HttpInterceptorFn } from '@angular/common/http';
import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const platformId = inject(PLATFORM_ID);
  
  if (isPlatformBrowser(platformId)) {
    const token = authService.getToken();

    if (token) {
      const authReq = req.clone({
        setHeaders: {
          Authorization: `Bearer ${token}`
        }
      });
      return next(authReq).pipe(
        catchError((error: any) => {
          if (error.status === 401) {
            authService.logout();
          }
          return throwError(() => error);
        })
      );
    }
  }

  return next(req).pipe(
    catchError((error: any) => {
      if (error.status === 401 && isPlatformBrowser(platformId)) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};