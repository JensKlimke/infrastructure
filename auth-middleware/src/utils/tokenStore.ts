import { promises as fs } from 'fs';
import { join } from 'path';

interface TokenEntry {
  email: string;
  type: 'session' | 'access';
  expiresAt: number;
  createdAt: number;
}

interface PersistedData {
  version: number;
  tokens: Array<[string, TokenEntry]>;
}

const TOKEN_EXPIRATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // Cleanup every hour
const AUTO_SAVE_INTERVAL_MS = 60 * 1000; // Auto-save every 1 minutes
const PERSISTENCE_DIR = process.env.TOKEN_STORAGE_PATH || '/data';
const PERSISTENCE_FILE = join(PERSISTENCE_DIR, 'tokens.json');

class TokenStore {
  private store: Map<string, TokenEntry> = new Map();
  private cleanupInterval?: NodeJS.Timeout;
  private autoSaveInterval?: NodeJS.Timeout;
  private lastSaveTime: number = 0;
  private isSaving: boolean = false;

  constructor() {
    // Start automatic cleanup of expired tokens
    this.startCleanup();
    // Start automatic periodic saving
    this.startAutoSave();
  }

  /**
   * Store a token with its associated email address
   */
  storeToken(token: string, email: string, type: 'session' | 'access' = 'session'): void {
    const normalizedEmail = email.toLowerCase().trim();
    const now = Date.now();

    this.store.set(token, {
      email: normalizedEmail,
      type: type,
      expiresAt: now + TOKEN_EXPIRATION_MS,
      createdAt: now
    });
  }

  /**
   * Get the email associated with a token
   * Returns null if token is invalid, expired, or doesn't match the required type
   */
  getEmail(token: string, requiredType?: 'session' | 'access'): string | null {
    const entry = this.store.get(token);

    if (!entry) {
      return null;
    }

    // Check expiration
    if (Date.now() > entry.expiresAt) {
      this.store.delete(token);
      return null;
    }

    // Check type if specified
    if (requiredType && entry.type !== requiredType) {
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
   * Start automatic periodic saving
   */
  private startAutoSave(): void {
    this.autoSaveInterval = setInterval(async () => {
      // Skip if currently saving
      if (this.isSaving) {
        console.log('Token auto-save: Skipping - save already in progress');
        return;
      }

      // Only save if there are tokens
      if (this.store.size === 0) {
        return;
      }

      try {
        await this.saveToFile();
        console.log(`Token auto-save: Successfully saved ${this.store.size} tokens`);
      } catch (error) {
        console.error('Token auto-save: Failed to save tokens:', error);
      }
    }, AUTO_SAVE_INTERVAL_MS);

    // Unref to not prevent process exit
    if (this.autoSaveInterval.unref) {
      this.autoSaveInterval.unref();
    }
  }

  /**
   * Stop automatic saving (for graceful shutdown)
   */
  stopAutoSave(): void {
    if (this.autoSaveInterval) {
      clearInterval(this.autoSaveInterval);
      this.autoSaveInterval = undefined;
    }
  }

  /**
   * Get store size (for monitoring)
   */
  getSize(): number {
    return this.store.size;
  }

  /**
   * Get last save timestamp (for monitoring)
   */
  getLastSaveTime(): number {
    return this.lastSaveTime;
  }

  /**
   * Verify persistence directory is writable
   */
  async verifyPersistenceDirectory(): Promise<boolean> {
    try {
      // Ensure directory exists
      await fs.mkdir(PERSISTENCE_DIR, { recursive: true });

      // Try to write a test file
      const testFile = join(PERSISTENCE_DIR, '.write-test');
      await fs.writeFile(testFile, 'test', 'utf8');
      await fs.unlink(testFile);

      console.log(`Token persistence: Directory ${PERSISTENCE_DIR} is writable`);
      return true;
    } catch (error) {
      console.error(`Token persistence: Directory ${PERSISTENCE_DIR} is NOT writable:`, error);
      return false;
    }
  }

  /**
   * Save tokens to file for persistence across restarts
   */
  async saveToFile(): Promise<void> {
    // Prevent concurrent saves
    if (this.isSaving) {
      console.log('Token persistence: Save already in progress, skipping');
      return;
    }

    this.isSaving = true;
    const startTime = Date.now();

    try {
      // Ensure directory exists
      await fs.mkdir(PERSISTENCE_DIR, { recursive: true });

      // Remove expired tokens before saving
      this.cleanup();

      // Convert Map to array for JSON serialization
      const data: PersistedData = {
        version: 1,
        tokens: Array.from(this.store.entries())
      };

      const jsonData = JSON.stringify(data, null, 2);

      // Write to temporary file first, then rename (atomic operation)
      const tempFile = `${PERSISTENCE_FILE}.tmp`;
      await fs.writeFile(tempFile, jsonData, 'utf8');
      await fs.rename(tempFile, PERSISTENCE_FILE);

      this.lastSaveTime = Date.now();
      const duration = this.lastSaveTime - startTime;

      console.log(`Token persistence: Saved ${this.store.size} tokens to ${PERSISTENCE_FILE} (took ${duration}ms)`);
    } catch (error) {
      console.error('Token persistence: Failed to save tokens:', error);
      throw error;
    } finally {
      this.isSaving = false;
    }
  }

  /**
   * Load tokens from file on startup
   */
  async loadFromFile(): Promise<void> {
    try {
      // Check if file exists
      try {
        await fs.access(PERSISTENCE_FILE);
      } catch {
        console.log('Token persistence: No existing token file found, starting with empty store');
        return;
      }

      // Read and parse file
      const fileContent = await fs.readFile(PERSISTENCE_FILE, 'utf8');
      const data: PersistedData = JSON.parse(fileContent);

      // Validate data structure
      if (!data.version || !Array.isArray(data.tokens)) {
        console.warn('Token persistence: Invalid data format, starting with empty store');
        return;
      }

      // Load tokens into store
      const now = Date.now();
      let loadedCount = 0;
      let expiredCount = 0;

      for (const [token, entry] of data.tokens) {
        // Only load non-expired tokens
        if (entry.expiresAt > now) {
          this.store.set(token, entry);
          loadedCount++;
        } else {
          expiredCount++;
        }
      }

      console.log(`Token persistence: Loaded ${loadedCount} valid tokens, skipped ${expiredCount} expired tokens`);
    } catch (error) {
      console.error('Token persistence: Failed to load tokens:', error);
      // Don't throw - continue with empty store
    }
  }

  /**
   * Clear all tokens (for testing only)
   * Returns the number of entries that were cleared
   */
  clear(): number {
    const size = this.store.size;
    this.store.clear();
    return size;
  }
}

// Export singleton instance
export const tokenStore = new TokenStore();
