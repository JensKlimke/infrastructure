import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3001;
const DOMAIN = process.env.DOMAIN || 'localhost';

// Trust proxy - required when behind Traefik
app.set('trust proxy', 1);

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
      // e.g., example.test, www.example.test, auth.example.test when DOMAIN=example.test
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

// Parse JSON bodies
app.use(express.json());

/**
 * User endpoint - returns the x-user header set by auth middleware
 */
app.get('/user', (req: Request, res: Response) => {
  const user = req.headers['x-user'] as string;

  if (!user) {
    return res.status(401).json({
      error: 'No user information available'
    });
  }

  console.log(`API /user - User: ${user}`);

  res.json({
    user: user
  });
});

/**
 * Health check endpoint
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'healthy' });
});

/**
 * Root endpoint
 */
app.get('/', (_req: Request, res: Response) => {
  res.json({
    message: 'API Service',
    endpoints: {
      user: '/user',
      health: '/health'
    }
  });
});

app.listen(PORT, () => {
  console.log(`API service listening on port ${PORT}`);
});
