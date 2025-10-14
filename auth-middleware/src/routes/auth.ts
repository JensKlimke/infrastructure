import { Router, Request, Response } from 'express';
import { renderTemplate } from '../utils/template';
import { generateToken, setAuthCookie, clearAuthCookie } from '../utils/cookie';
import { otpStore } from '../utils/otpStore';
import { sendOTPEmail } from '../utils/email';
import { tokenStore } from '../utils/tokenStore';
import { validateSubdomain, logSubdomainValidation } from '../utils/subdomainValidator';

const router = Router();

/**
 * Validate redirect URL to prevent open redirect attacks
 * Only allow relative paths or same-origin URLs
 */
function validateRedirectUrl(redirect: string | undefined): string {
  if (!redirect) {
    return '/';
  }

  // Only allow relative paths that start with /
  if (redirect.startsWith('/') && !redirect.startsWith('//')) {
    return redirect;
  }

  // Reject anything else (absolute URLs, protocol-relative URLs, etc.)
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
router.get('/auth', (req: Request, res: Response) => {
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

  const existingToken = req.signedCookies['auth_token'];

  if (existingToken) {
    // Look up the email associated with this token
    const email = tokenStore.getEmail(existingToken);

    if (email) {
      console.log('AUTH - Valid token exists for user:', email);
      // Set the x-user header for Traefik to forward to the upstream service
      res.setHeader('x-user', email);
      return res.status(200).send();
    }

    // Token exists but no email mapping (expired or invalid)
    console.log('AUTH - Token exists but no email mapping found');
  }

  console.log('AUTH - No valid token, redirecting to login');
  const originalUrl = req.headers['x-forwarded-uri'] || '/';
  // In development, force http; in production, use the forwarded protocol or default to https
  const NODE_ENV = process.env.NODE_ENV || 'development';
  const forwardedProto = NODE_ENV === 'development' ? 'http' : (req.headers['x-forwarded-proto'] || 'https');
  const redirectUrl = `${forwardedProto}://${forwardedHost}/auth/login?redirect=${encodeURIComponent(originalUrl as string)}`;
  console.log('AUTH - Redirect URL:', redirectUrl);
  res.setHeader('Location', redirectUrl);
  res.status(302).end();
});

// Token verification endpoint - GET version (reads from cookie for frontend use)
router.get('/auth/user', (req: Request, res: Response) => {
  const token = req.signedCookies['auth_token'];

  if (!token) {
    return res.status(401).json({
      valid: false,
      error: 'Not authenticated'
    });
  }

  // Validate token using tokenStore
  const email = tokenStore.getEmail(token);

  if (email) {
    console.log('AUTH/USER (GET) - Valid session for user:', email);
    return res.status(200).json({
      valid: true,
      user: {
        email: email
      }
    });
  }

  // Token is invalid or expired
  console.log('AUTH/USER (GET) - Invalid or expired session');
  return res.status(401).json({
    valid: false,
    error: 'Session expired'
  });
});

// Token verification endpoint - POST version (for backend-to-backend with Bearer token)
router.post('/auth/user', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;

  // Check if Authorization header exists
  if (!authHeader) {
    return res.status(401).json({
      valid: false,
      error: 'No token provided'
    });
  }

  // Validate Bearer token format
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(400).json({
      valid: false,
      error: 'Invalid authorization header format'
    });
  }

  const token = parts[1];

  // Validate token using tokenStore
  const email = tokenStore.getEmail(token);

  if (email) {
    console.log('AUTH/USER (POST) - Valid token for user:', email);
    return res.status(200).json({
      valid: true,
      user: {
        email: email
      }
    });
  }

  // Token is invalid or expired
  console.log('AUTH/USER (POST) - Invalid or expired token');
  return res.status(401).json({
    valid: false,
    error: 'Invalid or expired token'
  });
});

// Login page
router.get('/auth/login', (req: Request, res: Response) => {
  const redirectUrl = validateRedirectUrl(req.query.redirect as string);

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
router.post('/auth/login', async (req: Request, res: Response) => {
  const { email, redirect } = req.body;

  if (!email) {
    return res.status(400).send('Email is required');
  }

  // Validate email format
  if (!validateEmail(email)) {
    const validatedRedirect = validateRedirectUrl(redirect);
    const html = renderTemplate('login', {
      REDIRECT_URL: validatedRedirect,
      ERROR_RAW: '<div class="error">Please enter a valid email address.</div>'
    });
    return res.status(400).send(html);
  }

  console.log('LOGIN - Email:', email);

  // Check cooldown period
  if (!otpStore.canRequestOTP(email)) {
    const validatedRedirect = validateRedirectUrl(redirect);
    const html = renderTemplate('login', {
      REDIRECT_URL: validatedRedirect,
      ERROR_RAW: '<div class="error">Please wait before requesting another code.</div>'
    });
    return res.status(429).send(html);
  }

  try {
    // Generate OTP code
    const code = otpStore.generateCode();

    // Store OTP
    otpStore.storeOTP(email, code);

    // Send email
    await sendOTPEmail(email, code);

    console.log('LOGIN - OTP sent to:', email);

    // Redirect to code verification page
    const validatedRedirect = validateRedirectUrl(redirect);
    const redirectUrl = `/auth/code?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(validatedRedirect)}`;
    console.log('LOGIN - Redirect URL:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('LOGIN - Error:', error);
    const validatedRedirect = validateRedirectUrl(redirect);
    const html = renderTemplate('login', {
      REDIRECT_URL: validatedRedirect,
      ERROR_RAW: '<div class="error">Failed to send verification email. Please try again.</div>'
    });
    res.status(500).send(html);
  }
});

// Code verification page
router.get('/auth/code', (req: Request, res: Response) => {
  const email = req.query.email as string;
  const redirectUrl = validateRedirectUrl(req.query.redirect as string);

  if (!email) {
    return res.redirect('/auth/login');
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
router.post('/auth/code', (req: Request, res: Response) => {
  const { email, code, redirect } = req.body;

  if (!email || !code) {
    return res.status(400).send('Email and code are required');
  }

  console.log('CODE - Verifying code for:', email);

  // Validate subdomain for security monitoring
  const hostname = req.headers.host;
  const validationResult = validateSubdomain(hostname);
  logSubdomainValidation(validationResult, 'CODE_VERIFICATION');

  // Verify OTP
  const isValid = otpStore.verifyOTP(email, code);

  if (isValid) {
    console.log('CODE - Valid code, setting auth cookie');

    // Generate auth token and set cookie
    const token = generateToken();
    setAuthCookie(res, token, email);

    const validatedRedirect = validateRedirectUrl(redirect);
    console.log('CODE - Cookie set, redirecting to:', validatedRedirect);
    res.redirect(validatedRedirect);
  } else {
    console.log('CODE - Invalid code');

    // Show error message
    const validatedRedirect = validateRedirectUrl(redirect);
    const html = renderTemplate('code', {
      EMAIL: email,
      REDIRECT_URL: validatedRedirect,
      ERROR_RAW: '<div class="error">Invalid or expired code. Please try again.</div>'
    });

    res.status(400).send(html);
  }
});

// Logout endpoint
router.post('/auth/logout', (req: Request, res: Response) => {
  const token = req.signedCookies['auth_token'];

  if (token) {
    // Remove token from store
    tokenStore.removeToken(token);
    console.log('LOGOUT - Token invalidated');
  }

  // Clear auth cookie
  clearAuthCookie(res);

  // Redirect to login
  res.redirect('/auth/login');
});

router.get('/auth/logout', (req: Request, res: Response) => {
  // Redirect GET requests to POST
  const token = req.signedCookies['auth_token'];

  if (token) {
    // Remove token from store
    tokenStore.removeToken(token);
    console.log('LOGOUT - Token invalidated');
  }

  // Clear auth cookie
  clearAuthCookie(res);

  // Redirect to login
  res.redirect('/auth/login');
});

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

export default router;
