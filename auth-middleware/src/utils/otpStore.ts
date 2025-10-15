import { randomBytes, createHash, timingSafeEqual } from 'crypto';

interface OTPEntry {
  codeHash: string;
  attempts: number;
  expiresAt: number;
  createdAt: number;
  lastRequestAt: number;
}

// OTP configuration - configurable via environment variables
const OTP_EXPIRATION_MS = parseInt(process.env.OTP_EXPIRATION_MS || '') || 10 * 60 * 1000; // Default: 10 minutes
const MAX_ATTEMPTS = parseInt(process.env.MAX_OTP_ATTEMPTS || '') || 3; // Default: 3 attempts
const OTP_REQUEST_COOLDOWN_MS = parseInt(process.env.OTP_REQUEST_COOLDOWN_MS || '') || 60 * 1000; // Default: 1 minute
const CLEANUP_INTERVAL_MS = parseInt(process.env.OTP_CLEANUP_INTERVAL_MS || '') || 5 * 60 * 1000; // Default: 5 minutes

class OTPStore {
  private store: Map<string, OTPEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    // Start automatic cleanup of expired OTPs
    this.startCleanup();
  }

  /**
   * Generate a 6-character OTP code using easily distinguishable characters
   * Excludes: 0 (zero), O, 1 (one), I, L (easily confused)
   */
  generateCode(): string {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
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
   * Check if an email can request a new OTP (cooldown check)
   * Returns true if allowed, false if still in cooldown
   */
  canRequestOTP(email: string): boolean {
    const normalizedEmail = email.toLowerCase().trim();
    const entry = this.store.get(normalizedEmail);

    if (!entry) {
      return true; // No previous OTP, can request
    }

    const now = Date.now();

    // If expired, can request new one
    if (now > entry.expiresAt) {
      this.store.delete(normalizedEmail);
      return true;
    }

    // Check cooldown period
    const timeSinceLastRequest = now - entry.lastRequestAt;
    return timeSinceLastRequest >= OTP_REQUEST_COOLDOWN_MS;
  }

  /**
   * Store an OTP for an email address
   */
  storeOTP(email: string, code: string): void {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = code.toUpperCase().trim();
    const codeHash = this.hashCode(normalizedCode);
    const now = Date.now();

    this.store.set(normalizedEmail, {
      codeHash,
      attempts: 0,
      expiresAt: now + OTP_EXPIRATION_MS,
      createdAt: now,
      lastRequestAt: now
    });
  }

  /**
   * Verify an OTP code for an email address
   * Returns true if valid, false otherwise
   * Uses constant-time comparison to prevent timing attacks
   */
  verifyOTP(email: string, code: string): boolean {
    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = code.toUpperCase().trim();
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

    // Verify code using constant-time comparison (case-insensitive)
    const codeHash = this.hashCode(normalizedCode);
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
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CLEANUP_INTERVAL_MS);

    // Unref to not prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Stop automatic cleanup (for graceful shutdown)
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Get store size (for monitoring)
   */
  getSize(): number {
    return this.store.size;
  }

  /**
   * Clear all OTP entries (for testing only)
   * Returns the number of entries that were cleared
   */
  clear(): number {
    const size = this.store.size;
    this.store.clear();
    return size;
  }
}

// Export singleton instance
export const otpStore = new OTPStore();
