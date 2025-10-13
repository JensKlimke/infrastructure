import { Router, Request, Response } from 'express';
import { renderTemplate } from '../utils/template';
import { generateToken, setAuthCookie } from '../utils/cookie';
import { otpStore } from '../utils/otpStore';
import { sendOTPEmail } from '../utils/email';

const router = Router();

// Auth validation endpoint (used by Traefik ForwardAuth)
router.get('/auth', (req: Request, res: Response) => {
  console.log('AUTH - Cookie:', req.headers.cookie);

  const existingToken = req.signedCookies['auth_token'];

  if (existingToken) {
    console.log('AUTH - Valid token exists');
    return res.status(200).send();
  }

  console.log('AUTH - No valid token, redirecting to login');
  const originalUrl = req.headers['x-forwarded-uri'] || '/';
  const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host;
  const forwardedProto = req.headers['x-forwarded-proto'] || 'http';
  const redirectUrl = `${forwardedProto}://${forwardedHost}/login?redirect=${encodeURIComponent(originalUrl as string)}`;
  console.log('AUTH - Redirect URL:', redirectUrl);
  res.setHeader('Location', redirectUrl);
  res.status(302).end();
});

// Login page
router.get('/login', (req: Request, res: Response) => {
  const redirectUrl = (req.query.redirect as string) || '/';

  const html = renderTemplate('login', {
    REDIRECT_URL: redirectUrl,
    ERROR: ''
  });

  res.send(html);
});

// Login form submission - Generate and send OTP
router.post('/login', async (req: Request, res: Response) => {
  const { email, redirect } = req.body;

  if (!email) {
    return res.status(400).send('Email is required');
  }

  console.log('LOGIN - Email:', email);

  try {
    // Generate OTP code
    const code = otpStore.generateCode();

    // Store OTP
    otpStore.storeOTP(email, code);

    // Send email
    await sendOTPEmail(email, code);

    console.log('LOGIN - OTP sent to:', email);

    // Redirect to code verification page
    const redirectUrl = `/code?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirect || '/')}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('LOGIN - Error:', error);
    const html = renderTemplate('login', {
      REDIRECT_URL: redirect || '/',
      ERROR: '<div class="error">Failed to send verification email. Please try again.</div>'
    });
    res.status(500).send(html);
  }
});

// Code verification page
router.get('/code', (req: Request, res: Response) => {
  const email = req.query.email as string;
  const redirectUrl = (req.query.redirect as string) || '/';

  if (!email) {
    return res.redirect('/login');
  }

  const html = renderTemplate('code', {
    EMAIL: email,
    REDIRECT_URL: redirectUrl,
    ERROR: ''
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

  // Verify OTP
  const isValid = otpStore.verifyOTP(email, code);

  if (isValid) {
    console.log('CODE - Valid code, setting auth cookie');

    // Generate auth token and set cookie
    const token = generateToken();
    setAuthCookie(res, token, email);

    console.log('CODE - Cookie set, redirecting to:', redirect || '/');
    res.redirect(redirect || '/');
  } else {
    console.log('CODE - Invalid code');

    // Show error message
    const html = renderTemplate('code', {
      EMAIL: email,
      REDIRECT_URL: redirect || '/',
      ERROR: '<div class="error">Invalid or expired code. Please try again.</div>'
    });

    res.status(400).send(html);
  }
});

// Health check endpoint
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

export default router;
