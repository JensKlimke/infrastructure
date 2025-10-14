/**
 * Subdomain Validator
 *
 * Validates that requests are coming from expected subdomains to prevent
 * cookie theft attacks from compromised or malicious subdomains.
 *
 * Configuration:
 * - DOMAIN: The base domain (e.g., example.com)
 * - ALLOWED_SUBDOMAINS: Comma-separated list of allowed subdomains (optional)
 *   If not set, all subdomains are allowed (with warnings logged)
 *
 * Examples:
 * - ALLOWED_SUBDOMAINS=api,app,admin
 * - ALLOWED_SUBDOMAINS=* (explicitly allow all)
 */

const DOMAIN = process.env.DOMAIN;
const ALLOWED_SUBDOMAINS = process.env.ALLOWED_SUBDOMAINS;

export interface SubdomainValidationResult {
  isValid: boolean;
  subdomain: string | null;
  hostname: string;
  reason?: string;
}

/**
 * Validates that a hostname is an allowed subdomain of the configured domain
 */
export function validateSubdomain(hostname: string | undefined): SubdomainValidationResult {
  if (!hostname) {
    return {
      isValid: false,
      subdomain: null,
      hostname: '',
      reason: 'No hostname provided'
    };
  }

  // If no domain is configured, allow all (development mode)
  if (!DOMAIN) {
    return {
      isValid: true,
      subdomain: null,
      hostname,
      reason: 'No domain configured (development mode)'
    };
  }

  // Check if hostname matches domain pattern
  const domainRegex = new RegExp(`^([a-z0-9-]+\\.)*${DOMAIN.replace('.', '\\.')}$`, 'i');

  if (!domainRegex.test(hostname)) {
    return {
      isValid: false,
      subdomain: null,
      hostname,
      reason: `Hostname does not match domain pattern: ${DOMAIN}`
    };
  }

  // Extract subdomain
  const subdomain = hostname.replace(new RegExp(`\\.?${DOMAIN.replace('.', '\\.')}$`, 'i'), '');

  // If no allowed subdomains list is configured, allow all but log a warning
  if (!ALLOWED_SUBDOMAINS) {
    return {
      isValid: true,
      subdomain: subdomain || null,
      hostname,
      reason: 'No subdomain allowlist configured - all subdomains allowed'
    };
  }

  // If explicitly set to wildcard, allow all
  if (ALLOWED_SUBDOMAINS === '*') {
    return {
      isValid: true,
      subdomain: subdomain || null,
      hostname
    };
  }

  // Check against allowlist
  const allowedList = ALLOWED_SUBDOMAINS.split(',').map(s => s.trim());

  // Empty subdomain means main domain
  if (!subdomain || subdomain === '') {
    if (allowedList.includes('') || allowedList.includes('@')) {
      return {
        isValid: true,
        subdomain: null,
        hostname
      };
    }
    return {
      isValid: false,
      subdomain: null,
      hostname,
      reason: 'Main domain not in allowlist'
    };
  }

  // Check if subdomain is in allowlist
  if (allowedList.includes(subdomain)) {
    return {
      isValid: true,
      subdomain,
      hostname
    };
  }

  return {
    isValid: false,
    subdomain,
    hostname,
    reason: `Subdomain '${subdomain}' not in allowlist: ${ALLOWED_SUBDOMAINS}`
  };
}

/**
 * Logs subdomain validation results for security monitoring
 */
export function logSubdomainValidation(result: SubdomainValidationResult, context: string): void {
  if (!result.isValid) {
    console.warn(`[SECURITY] ${context} - Invalid subdomain access:`, {
      hostname: result.hostname,
      subdomain: result.subdomain,
      reason: result.reason,
      timestamp: new Date().toISOString()
    });
  } else if (result.reason) {
    // Log warning for valid but unconfigured access
    console.warn(`[SECURITY] ${context} - Subdomain access (no allowlist):`, {
      hostname: result.hostname,
      subdomain: result.subdomain,
      reason: result.reason,
      timestamp: new Date().toISOString()
    });
  }
}
