import express from 'express';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import { verifyEmailConnection } from './utils/email';

// Validate required environment variables
if (!process.env.COOKIE_SECRET) {
  throw new Error('COOKIE_SECRET environment variable is required');
}

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const COOKIE_SECRET = process.env.COOKIE_SECRET;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(COOKIE_SECRET));

// Routes
app.use('/', authRoutes);

// Start server with email verification
async function startServer() {
  // Start server first
  app.listen(PORT, () => {
    console.log(`Auth middleware listening on port ${PORT}`);
    console.log(`Environment: ${NODE_ENV}`);
    console.log(`Cookie secret: ${COOKIE_SECRET.substring(0, 5)}...`);
  });

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
