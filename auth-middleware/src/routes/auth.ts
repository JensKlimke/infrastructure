import { Router, Request, Response } from 'express';
import { renderTemplate } from '../utils/template';
import { generateToken, setAuthCookie, clearAuthCookie, COOKIE_NAME } from '../utils/cookie';
import { otpStore } from '../utils/otpStore';
import { sendOTPEmail } from '../utils/email';
import { tokenStore } from '../utils/tokenStore';
import { validateSubdomain, logSubdomainValidation } from '../utils/subdomainValidator';

const router = Router();

/**
 * Validate redirect URL to prevent open redirect attacks
 * Allows relative paths or same-domain URLs
 */
function validateRedirectUrl(redirect: string | undefined, baseDomain?: string): string {
  if (!redirect) {
    return '/';
  }

  // Allow relative paths that start with /
  if (redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }

  // Allow full URLs only if they're on the same base domain
  if (baseDomain && (redirect.startsWith('https://') || redirect.startsWith('http://'))) {
    try {
      const url = new URL(redirect);
      // Check if hostname ends with our base domain (e.g., app.localhost ends with localhost)
      if (url.hostname === baseDomain || url.hostname.endsWith(`.${baseDomain}`)) {
        return redirect;
      }
    } catch (e) {
      // Invalid URL, fall through to return '/'
    }
  }

  // Reject anything else (protocol-relative URLs, external domains, etc.)
  return '/';
}

/**
 * Validate email format
 */
function validateEmail(email: string): boolean {
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254; // RFC 5321 max length
}

// Auth validation endpoint (used by Traefik ForwardAuth)
router.get('/verify', (req: Request, res: Response) => {
  console.log('AUTH - Cookie:', req.headers.cookie);

  // Validate subdomain for security monitoring
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
  const validationResult = validateSubdomain(forwardedHost as string);
  logSubdomainValidation(validationResult, 'AUTH');

  // Block request if subdomain validation fails (when allowlist is configured)
  if (!validationResult.isValid && process.env.ALLOWED_SUBDOMAINS) {
    console.error('AUTH - Subdomain validation failed, denying access');
    return res.status(403).send('Access denied: Invalid subdomain');
  }

  const existingToken = req.signedCookies[COOKIE_NAME];

  if (existingToken) {
    // Look up the email associated with this token (must be a session token)
    const email = tokenStore.getEmail(existingToken, 'session');

    if (email) {
      console.log('AUTH - Valid session token exists for user:', email);
      // Set the x-user header for Traefik to forward to the upstream service
      res.setHeader('x-user', email);
      return res.status(200).send();
    }

    // Token exists but no email mapping (expired, invalid, or wrong type)
    console.log('AUTH - Token exists but no valid session mapping found');
  }

  console.log('AUTH - No valid token, redirecting to login');
  const originalPath = req.headers['x-forwarded-uri'] || '/';
  const originalHost = forwardedHost as string;
  // Use the forwarded protocol from the reverse proxy, defaulting to https
  const forwardedProto = (req.headers['x-forwarded-proto'] as string) || 'https';

  // Construct full original URL (e.g., https://app.localhost/resource)
  const originalFullUrl = `${forwardedProto}://${originalHost}${originalPath}`;

  const DOMAIN = process.env.DOMAIN || 'localhost';
  const redirectUrl = `${forwardedProto}://auth.${DOMAIN}/login?redirect=${encodeURIComponent(originalFullUrl)}`;
  console.log('AUTH - Original URL:', originalFullUrl);
  console.log('AUTH - Redirect URL:', redirectUrl);
  res.setHeader('Location', redirectUrl);
  res.status(302).end();
});

// Token verification endpoint - supports both cookie (session) and Authorization header (access token)
router.get('/user', (req: Request, res: Response) => {
  console.log('AUTH/USER (GET) - Request received');
  console.log('AUTH/USER (GET) - Cookie header:', req.headers.cookie);
  console.log('AUTH/USER (GET) - Signed cookies:', req.signedCookies);

  // First, check for Authorization header with Bearer token (access token)
  const authHeader = req.headers.authorization;

  if (authHeader) {
    // Validate Bearer token format
    const parts = authHeader.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      const accessToken = parts[1];

      // Validate as access token
      const email = tokenStore.getEmail(accessToken, 'access');

      if (email) {
        console.log('AUTH/USER (GET) - Valid access token for user:', email);
        return res.status(200).json({
          valid: true,
          user: {
            email: email
          }
        });
      }

      // Access token was provided but invalid
      console.log('AUTH/USER (GET) - Invalid or expired access token');
      return res.status(401).json({
        valid: false,
        error: 'Invalid or expired access token'
      });
    }
  }

  // Fall back to cookie-based session token
  const sessionToken = req.signedCookies[COOKIE_NAME];

  if (!sessionToken) {
    return res.status(401).json({
      valid: false,
      error: 'Not authenticated'
    });
  }

  // Validate session token from cookie
  const email = tokenStore.getEmail(sessionToken, 'session');

  if (email) {
    console.log('AUTH/USER (GET) - Valid session for user:', email);
    return res.status(200).json({
      valid: true,
      user: {
        email: email
      }
    });
  }

  // Token is invalid, expired, or not a session token
  console.log('AUTH/USER (GET) - Invalid or expired session');
  return res.status(401).json({
    valid: false,
    error: 'Session expired'
  });
});

// Access token generation endpoint - returns an access token for API use
router.get('/access_token', (req: Request, res: Response) => {
  const sessionToken = req.signedCookies[COOKIE_NAME];

  if (!sessionToken) {
    return res.status(401).json({
      error: 'Not authenticated'
    });
  }

  // Validate session token from cookie
  const email = tokenStore.getEmail(sessionToken, 'session');

  if (!email) {
    return res.status(401).json({
      error: 'Invalid or expired session'
    });
  }

  // Generate new access token
  const accessToken = generateToken();
  tokenStore.storeToken(accessToken, email, 'access');

  console.log('ACCESS_TOKEN - Generated access token for user:', email);

  return res.status(200).json({
    access_token: accessToken
  });
});

// Login page
router.get('/login', (req: Request, res: Response) => {
  const DOMAIN = process.env.DOMAIN || 'localhost';
  const redirectUrl = validateRedirectUrl(req.query.redirect as string, DOMAIN);

  // Set cache-control headers to prevent caching of auth pages
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const html = renderTemplate('login', {
    REDIRECT_URL: redirectUrl,
    ERROR_RAW: ''
  });

  res.send(html);
});

// Login form submission - Generate and send OTP
router.post('/login', async (req: Request, res: Response) => {
  const { email, redirect } = req.body;

  if (!email) {
    return res.status(400).send('Email is required');
  }

  const DOMAIN = process.env.DOMAIN || 'localhost';

  // Validate email format
  if (!validateEmail(email)) {
    const validatedRedirect = validateRedirectUrl(redirect, DOMAIN);
    const html = renderTemplate('login', {
      REDIRECT_URL: validatedRedirect,
      ERROR_RAW: '<div class="error">Please enter a valid email address.</div>'
    });
    return res.status(400).send(html);
  }

  console.log('LOGIN - Email:', email);

  // Check cooldown period
  if (!otpStore.canRequestOTP(email)) {
    const validatedRedirect = validateRedirectUrl(redirect, DOMAIN);
    const html = renderTemplate('login', {
      REDIRECT_URL: validatedRedirect,
      ERROR_RAW: '<div class="error">Please wait before requesting another code.</div>'
    });
    return res.status(429).send(html);
  }

  try {
    // Generate OTP code
    const NODE_ENV = process.env.NODE_ENV || 'development';
    const code = NODE_ENV === 'development' ? 'AAAAAA' : otpStore.generateCode();

    // Store OTP
    otpStore.storeOTP(email, code);

    // Send email (skip in development)
    if (NODE_ENV !== 'development') {
      await sendOTPEmail(email, code);
    } else {
      console.log('DEV MODE - Skipping email, OTP code:', code);
    }

    console.log('LOGIN - OTP sent to:', email);

    // Redirect to code verification page
    const validatedRedirect = validateRedirectUrl(redirect, DOMAIN);
    const redirectUrl = `/code?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(validatedRedirect)}`;
    console.log('LOGIN - Redirect URL:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('LOGIN - Error:', error);
    const validatedRedirect = validateRedirectUrl(redirect, DOMAIN);
    const html = renderTemplate('login', {
      REDIRECT_URL: validatedRedirect,
      ERROR_RAW: '<div class="error">Failed to send verification email. Please try again.</div>'
    });
    res.status(500).send(html);
  }
});

// Code verification page
router.get('/code', (req: Request, res: Response) => {
  const email = req.query.email as string;
  const DOMAIN = process.env.DOMAIN || 'localhost';
  const redirectUrl = validateRedirectUrl(req.query.redirect as string, DOMAIN);

  if (!email) {
    return res.redirect('/login');
  }

  // Set cache-control headers to prevent caching of auth pages
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const html = renderTemplate('code', {
    EMAIL: email,
    REDIRECT_URL: redirectUrl,
    ERROR_RAW: ''
  });

  res.send(html);
});

// Code verification submission
router.post('/code', (req: Request, res: Response) => {
  const { email, code, redirect } = req.body;

  if (!email || !code) {
    return res.status(400).send('Email and code are required');
  }

  console.log('CODE - Verifying code for:', email);

  // Validate subdomain for security monitoring
  const hostname = req.headers.host;
  const validationResult = validateSubdomain(hostname);
  logSubdomainValidation(validationResult, 'CODE_VERIFICATION');

  const DOMAIN = process.env.DOMAIN || 'localhost';

  // Verify OTP
  const isValid = otpStore.verifyOTP(email, code);

  if (isValid) {
    console.log('CODE - Valid code, setting auth cookie');

    // Generate auth token and set cookie
    const token = generateToken();
    setAuthCookie(res, token, email);

    const validatedRedirect = validateRedirectUrl(redirect, DOMAIN);

    // If redirect is a relative path, make it absolute
    let absoluteRedirect = validatedRedirect;
    if (validatedRedirect.startsWith('/')) {
      const NODE_ENV = process.env.NODE_ENV || 'development';
      const protocol = NODE_ENV === 'development' ? 'https' : (req.headers['x-forwarded-proto'] || 'https');
      absoluteRedirect = `${protocol}://${DOMAIN}${validatedRedirect}`;
    }

    console.log('CODE - Cookie set, redirecting to:', absoluteRedirect);
    console.log('CODE - Set-Cookie headers:', res.getHeaders()['set-cookie']);
    res.redirect(absoluteRedirect);
  } else {
    console.log('CODE - Invalid code');

    // Show error message
    const validatedRedirect = validateRedirectUrl(redirect, DOMAIN);
    const html = renderTemplate('code', {
      EMAIL: email,
      REDIRECT_URL: validatedRedirect,
      ERROR_RAW: '<div class="error">Invalid or expired code. Please try again.</div>'
    });

    res.status(400).send(html);
  }
});

// Logout endpoint
router.post('/logout', (req: Request, res: Response) => {
  const token = req.signedCookies[COOKIE_NAME];

  if (token) {
    // Remove token from store
    tokenStore.removeToken(token);
    console.log('LOGOUT - Token invalidated');
  }

  // Clear auth cookie
  clearAuthCookie(res);

  // Redirect to login
  res.redirect('/login');
});

router.get('/logout', (req: Request, res: Response) => {
  // Redirect GET requests to POST
  const token = req.signedCookies[COOKIE_NAME];

  if (token) {
    // Remove token from store
    tokenStore.removeToken(token);
    console.log('LOGOUT - Token invalidated');
  }

  // Clear auth cookie
  clearAuthCookie(res);

  // Redirect to login
  res.redirect('/login');
});

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

export default router;
