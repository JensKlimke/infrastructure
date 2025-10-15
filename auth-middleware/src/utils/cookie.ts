import { Response } from 'express';
import { randomBytes } from 'crypto';
import { tokenStore } from './tokenStore';

const NODE_ENV = process.env.NODE_ENV || 'development';
const DOMAIN = process.env.DOMAIN;
const COOKIE_NAME = process.env.COOKIE_NAME || 'auth';

export { COOKIE_NAME };

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function getCookieOptions() {
  const options: any = {
    httpOnly: true,
    secure: true,
    sameSite: 'strict', // Only send cookie in same-site context (works across subdomains with wildcard domain)
    signed: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  };

  // Set domain to work with all subdomains (e.g., .localhost for *.localhost)
  // The leading dot is required for cookies to be shared across subdomains
  // Required for Traefik ForwardAuth to work across multiple subdomains
  if (DOMAIN) {
    options.domain = `.${DOMAIN}`;
  }

  return options;
}

export function setAuthCookie(res: Response, token: string, email: string): void {
  // Store token-email mapping as session token
  tokenStore.storeToken(token, email, 'session');

  // Set auth token cookie
  res.cookie(COOKIE_NAME, token, getCookieOptions());
}

export function clearAuthCookie(res: Response): void {
  const clearOptions: any = { path: '/' };

  // Must include domain when clearing if it was set when creating the cookie
  if (DOMAIN) {
    clearOptions.domain = `.${DOMAIN}`;
  }

  res.clearCookie(COOKIE_NAME, clearOptions);
}
