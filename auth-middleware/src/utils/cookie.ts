import { Response } from 'express';
import { randomBytes } from 'crypto';
import { tokenStore } from './tokenStore';

const NODE_ENV = process.env.NODE_ENV || 'development';
const DOMAIN = process.env.DOMAIN;

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function getCookieOptions() {
  const options: any = {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'strict', // Enhanced CSRF protection - cookie only sent to same-site requests
    signed: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  };

  // Set domain to work with all subdomains (e.g., .example.com)
  // The leading dot allows the cookie to be shared across all subdomains
  // Required for Traefik ForwardAuth to work across multiple subdomains
  if (DOMAIN) {
    options.domain = `.${DOMAIN}`;
  }

  return options;
}

export function setAuthCookie(res: Response, token: string, email: string): void {
  // Store token-email mapping
  tokenStore.storeToken(token, email);

  // Set auth token cookie
  res.cookie('auth_token', token, getCookieOptions());
}

export function clearAuthCookie(res: Response): void {
  const clearOptions: any = { path: '/' };

  // Must include domain when clearing if it was set when creating the cookie
  if (DOMAIN) {
    clearOptions.domain = `.${DOMAIN}`;
  }

  res.clearCookie('auth_token', clearOptions);
}
