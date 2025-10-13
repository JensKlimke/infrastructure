import { randomBytes, createHash, timingSafeEqual } from 'crypto';

interface OTPEntry {
  codeHash: string;
  attempts: number;
  expiresAt: number;
  createdAt: number;
}

const OTP_EXPIRATION_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ATTEMPTS = 3;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Cleanup every 5 minutes

class OTPStore {
  private store: Map<string, OTPEntry> = new Map();

  constructor() {
    // Start automatic cleanup of expired OTPs
    this.startCleanup();
  }

  /**
   * Generate a 6-character OTP code using [A-Z0-9]
   */
  generateCode(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const bytes = randomBytes(6);
    let code = '';

    for (let i = 0; i < 6; i++) {
      code += chars[bytes[i] % chars.length];
    }

    return code;
  }

  /**
   * Hash an OTP code using SHA-256
   */
  private hashCode(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  /**
   * Store an OTP for an email address
   */
  storeOTP(email: string, code: string): void {
    const normalizedEmail = email.toLowerCase().trim();
    const codeHash = this.hashCode(code);
    const now = Date.now();

    this.store.set(normalizedEmail, {
      codeHash,
      attempts: 0,
      expiresAt: now + OTP_EXPIRATION_MS,
      createdAt: now
    });
  }

  /**
   * Verify an OTP code for an email address
   * Returns true if valid, false otherwise
   * Uses constant-time comparison to prevent timing attacks
   */
  verifyOTP(email: string, code: string): boolean {
    const normalizedEmail = email.toLowerCase().trim();
    const entry = this.store.get(normalizedEmail);

    if (!entry) {
      return false;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.store.delete(normalizedEmail);
      return false;
    }

    // Check max attempts
    if (entry.attempts >= MAX_ATTEMPTS) {
      return false;
    }

    // Increment attempts
    entry.attempts++;

    // Verify code using constant-time comparison
    const codeHash = this.hashCode(code);
    const expectedHash = Buffer.from(entry.codeHash, 'hex');
    const actualHash = Buffer.from(codeHash, 'hex');

    // Both buffers must be same length for timingSafeEqual
    if (expectedHash.length !== actualHash.length) {
      return false;
    }

    const isValid = timingSafeEqual(expectedHash, actualHash);

    // If valid, remove from store (one-time use)
    if (isValid) {
      this.store.delete(normalizedEmail);
    }

    return isValid;
  }

  /**
   * Check if an email has a pending OTP that hasn't expired
   */
  hasPendingOTP(email: string): boolean {
    const normalizedEmail = email.toLowerCase().trim();
    const entry = this.store.get(normalizedEmail);

    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(normalizedEmail);
      return false;
    }

    return true;
  }

  /**
   * Remove expired OTP entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredEmails: string[] = [];

    this.store.forEach((entry, email) => {
      if (now > entry.expiresAt) {
        expiredEmails.push(email);
      }
    });

    expiredEmails.forEach(email => {
      this.store.delete(email);
    });

    if (expiredEmails.length > 0) {
      console.log(`OTP cleanup: Removed ${expiredEmails.length} expired entries`);
    }
  }

  /**
   * Start automatic cleanup interval
   */
  private startCleanup(): void {
    setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Get store size (for monitoring)
   */
  getSize(): number {
    return this.store.size;
  }
}

// Export singleton instance
export const otpStore = new OTPStore();
