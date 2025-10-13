interface TokenEntry {
  email: string;
  expiresAt: number;
  createdAt: number;
}

const TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Cleanup every hour

class TokenStore {
  private store: Map<string, TokenEntry> = new Map();

  constructor() {
    // Start automatic cleanup of expired tokens
    this.startCleanup();
  }

  /**
   * Store a token with its associated email address
   */
  storeToken(token: string, email: string): void {
    const normalizedEmail = email.toLowerCase().trim();
    const now = Date.now();

    this.store.set(token, {
      email: normalizedEmail,
      expiresAt: now + TOKEN_EXPIRATION_MS,
      createdAt: now
    });
  }

  /**
   * Get the email associated with a token
   * Returns null if token is invalid or expired
   */
  getEmail(token: string): string | null {
    const entry = this.store.get(token);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.store.delete(token);
      return null;
    }

    return entry.email;
  }

  /**
   * Remove a token from the store
   */
  removeToken(token: string): void {
    this.store.delete(token);
  }

  /**
   * Remove expired token entries
   */
  private cleanup(): void {
    const now = Date.now();
    const expiredTokens: string[] = [];

    this.store.forEach((entry, token) => {
      if (now > entry.expiresAt) {
        expiredTokens.push(token);
      }
    });

    expiredTokens.forEach(token => {
      this.store.delete(token);
    });

    if (expiredTokens.length > 0) {
      console.log(`Token cleanup: Removed ${expiredTokens.length} expired entries`);
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
export const tokenStore = new TokenStore();
