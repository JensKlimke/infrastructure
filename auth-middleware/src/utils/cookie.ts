import { Response } from 'express';
import { randomBytes } from 'crypto';

const NODE_ENV = process.env.NODE_ENV || 'development';

export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

export function setAuthCookie(res: Response, token: string, email?: string): void {
  // Set auth token cookie
  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: NODE_ENV === 'production',
    sameSite: 'lax',
    signed: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/'
  });

  // Optionally set email cookie
  if (email) {
    res.cookie('user_email', email, {
      httpOnly: false,
      secure: NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });
  }
}
