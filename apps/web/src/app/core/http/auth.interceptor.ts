import {
  HttpContextToken,
  HttpErrorResponse,
  type HttpInterceptorFn,
  type HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { API_BASE } from '../api/api.config';
import { AuthService } from '../auth/auth.service';

/** Marks a request that was already retried after a refresh (never loop). */
const RETRIED_AFTER_REFRESH = new HttpContextToken<boolean>(() => false);

const SESSION_ENDPOINTS = /\/auth\/(login|register|refresh|logout)$/;

const withBearer = (req: HttpRequest<unknown>, token: string) =>
  req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

/**
 * Adds the in-memory access token to API calls. On a 401 it refreshes once
 * (single-flight, using the HttpOnly cookie) and replays the original request
 * unchanged, including its Idempotency-Key, so a retried operation can never
 * run twice. If the refresh fails, the session is expired.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // Requests that carry their own credentials (the checkout sends the merchant's
  // publishable key) never get the dashboard token nor a refresh on 401.
  if (
    !req.url.startsWith(API_BASE) ||
    SESSION_ENDPOINTS.test(req.url) ||
    req.headers.has('Authorization')
  ) {
    return next(req);
  }

  const auth = inject(AuthService);
  const token = auth.accessToken();

  return next(token ? withBearer(req, token) : req).pipe(
    catchError((error: unknown) => {
      if (
        !(error instanceof HttpErrorResponse) ||
        error.status !== 401 ||
        req.context.get(RETRIED_AFTER_REFRESH)
      ) {
        return throwError(() => error);
      }
      return auth.refresh().pipe(
        catchError(() => {
          auth.expireSession();
          return throwError(() => error);
        }),
        switchMap((fresh) =>
          next(
            withBearer(req.clone({ context: req.context.set(RETRIED_AFTER_REFRESH, true) }), fresh),
          ),
        ),
      );
    }),
  );
};
