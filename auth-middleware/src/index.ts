import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import authRoutes from './routes/auth';
import { verifyEmailConnection } from './utils/email';
import { otpStore } from './utils/otpStore';
import { tokenStore } from './utils/tokenStore';

// Validate required environment variables
if (!process.env.COOKIE_SECRET) {
  throw new Error('COOKIE_SECRET environment variable is required');
}

if (process.env.COOKIE_SECRET.length < 32) {
  throw new Error('COOKIE_SECRET must be at least 32 characters long for security');
}

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const COOKIE_SECRET = process.env.COOKIE_SECRET;
const DOMAIN = process.env.DOMAIN || 'localhost';

// Trust proxy - required when behind Traefik/nginx
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for templates
      scriptSrc: ["'self'", "'unsafe-inline'"], // Allow inline scripts for templates
      imgSrc: ["'self'", "data:"],
      formAction: ["'self'", `https://*.${DOMAIN}`, `https://${DOMAIN}`], // Allow form submissions to any subdomain
    },
  },
  // Disable HSTS in development to allow HTTP
  hsts: NODE_ENV === 'production',
}));

// CORS middleware - allow cross-origin requests from same base domain
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl)
    // Also allow "null" origin (browser sends this for some same-origin form submissions)
    if (!origin || origin === 'null') {
      return callback(null, true);
    }

    try {
      const originUrl = new URL(origin);
      const originHostname = originUrl.hostname;

      // Allow if origin is the base domain or any subdomain of it
      // e.g., localhost, app.localhost, auth.localhost when DOMAIN=localhost
      if (originHostname === DOMAIN || originHostname.endsWith(`.${DOMAIN}`)) {
        return callback(null, true);
      }

      // Reject other origins
      console.log('CORS - Rejected origin:', origin);
      callback(new Error('Not allowed by CORS'));
    } catch (e) {
      console.error('CORS - Invalid origin URL:', origin);
      callback(new Error('Invalid origin'));
    }
  },
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting middleware - more lenient in development for testing
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: NODE_ENV === 'development' ? 200 : 50, // More lenient in development
  message: 'Too many login attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const codeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: NODE_ENV === 'development' ? 100 : 10, // More lenient in development for testing
  message: 'Too many verification attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const userLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: NODE_ENV === 'development' ? 500 : 100, // More lenient in development
  message: 'Too many token verification requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));

// Routes with rate limiting
app.use('/login', loginLimiter);
app.use('/code', codeLimiter);
app.use('/user', userLimiter);
app.use('/', authRoutes);

// Start server with email verification
async function startServer() {
  // Verify persistence directory is writable
  const isWritable = await tokenStore.verifyPersistenceDirectory();
  if (!isWritable) {
    console.error('CRITICAL: Token persistence directory is not writable!');
    console.error('Tokens will NOT persist across restarts.');
    if (NODE_ENV === 'production') {
      console.error('Refusing to start in production without working persistence.');
      process.exit(1);
    }
  }

  // Load persisted tokens before starting server
  try {
    await tokenStore.loadFromFile();
    console.log(`Token persistence: Loaded ${tokenStore.getSize()} tokens from disk`);
  } catch (error) {
    console.error('Token persistence: Failed to load tokens on startup:', error);
    // Continue with startup even if load fails
  }

  // Start server
  const server = app.listen(PORT, () => {
    console.log(`Auth middleware listening on port ${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Token persistence: Auto-save enabled`);
  });

  // Graceful shutdown handler
  const shutdown = async (signal: string) => {
    console.log(`${signal} received, starting graceful shutdown...`);

    // Stop automatic intervals
    otpStore.stopCleanup();
    tokenStore.stopCleanup();
    tokenStore.stopAutoSave();

    // Save tokens to file before shutting down
    try {
      console.log(`Token persistence: Saving ${tokenStore.getSize()} tokens before shutdown...`);
      await tokenStore.saveToFile();
      console.log('Token persistence: Successfully saved tokens before shutdown');
    } catch (error) {
      console.error('Token persistence: Failed to save tokens during shutdown:', error);
      // Continue with shutdown even if save fails
    }

    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });

    // Force shutdown after 25 seconds (increased for save time)
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 25000);
  };

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Verify Resend email service (non-blocking in development)
  try {
    await verifyEmailConnection();
  } catch (error) {
    console.error('Resend connection warning:', error);
    if (NODE_ENV === 'production') {
      console.error('Resend connection failed in production mode. Exiting...');
      process.exit(1);
    } else {
      console.log('Continuing in development mode. Email sending will fail until Resend is configured.');
    }
  }
}

startServer();
