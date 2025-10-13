import { Response } from 'express';
import { randomBytes } from 'crypto';
import { tokenStore } from './tokenStore';

const NODE_ENV = process.env.NODE_ENV || 'development';

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function setAuthCookie(res: Response, token: string, email: string): void {
  // Store token-email mapping
  tokenStore.storeToken(token, email);

  // Set auth token cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    signed: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  });
}
