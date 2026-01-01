// Load environment variables from .env file
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import session from 'express-session';
import { passport } from './routes/auth';
import accountsRouter from './routes/accounts';
import holdingsRouter from './routes/holdings';
import statementsRouter from './routes/statements';
import targetsRouter from './routes/targets';
import rebalancingRouter from './routes/rebalancing';
import historyRouter from './routes/history';
import debugRouter from './routes/debug';
import symbolMappingsRouter from './routes/symbolMappings';
import authRouter from './routes/auth';
import { requireAuth } from './middleware/auth';

const app = express();
const PORT = process.env.PORT || 3001;

// Session configuration
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-secret-in-production';
const isProduction = process.env.NODE_ENV === 'production';

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction, // Only send over HTTPS in production
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: isProduction ? 'none' : 'lax', // For cross-origin in production
    },
  })
);

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// CORS configuration - allow credentials for authentication
const allowedOrigins = isProduction
  ? (process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : true)
  : ['http://localhost:5173', 'http://localhost:3001'];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // Required for cookies/sessions
  })
);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public routes (no authentication required)
app.use('/api/auth', authRouter);
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Protected API Routes (require authentication)
app.use('/api/accounts', requireAuth, accountsRouter);
app.use('/api/holdings', requireAuth, holdingsRouter);
app.use('/api/statements', requireAuth, statementsRouter);
app.use('/api/targets', requireAuth, targetsRouter);
app.use('/api/rebalancing', requireAuth, rebalancingRouter);
app.use('/api/history', requireAuth, historyRouter);
app.use('/api/debug', requireAuth, debugRouter);
app.use('/api/symbol-mappings', requireAuth, symbolMappingsRouter);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, '../client/dist');
  app.use(express.static(staticPath));
  
  // Serve index.html for all non-API routes (SPA routing)
  app.get('*', (req, res, next) => {
    // Skip API routes and auth routes
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

