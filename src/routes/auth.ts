import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';

const router = Router();

// Configure Google OAuth Strategy
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || `${BASE_URL}/api/auth/google/callback`;

if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.warn('⚠️  Google OAuth credentials not configured. Authentication will not work.');
  console.warn('   Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
  console.warn('   Using placeholder strategy to prevent errors.');
  
  // Register a placeholder strategy to prevent "Unknown strategy" errors
  passport.use('google', new GoogleStrategy(
    {
      clientID: 'placeholder',
      clientSecret: 'placeholder',
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      return done(new Error('Google OAuth not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'));
    }
  ));
} else {
  console.log('✓ Google OAuth configured');
  console.log(`  Callback URL: ${GOOGLE_CALLBACK_URL}`);
  
  passport.use('google', new GoogleStrategy(
    {
      clientID: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      callbackURL: GOOGLE_CALLBACK_URL,
    },
    (accessToken, refreshToken, profile, done) => {
      // Profile contains: id, displayName, emails, photos
      const user = {
        id: profile.id,
        email: profile.emails?.[0]?.value || '',
        name: profile.displayName || '',
        picture: profile.photos?.[0]?.value,
      };
      return done(null, user);
    }
  ));
}

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user);
});

// Deserialize user from session
passport.deserializeUser((user: any, done) => {
  done(null, user);
});

// Google OAuth login
router.get(
  '/google',
  (req: Request, res: Response, next: NextFunction) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ 
        error: 'Google OAuth not configured',
        message: 'Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables'
      });
    }
    passport.authenticate('google', {
      scope: ['profile', 'email'],
    })(req, res, next);
  }
);

// Google OAuth callback
router.get(
  '/google/callback',
  (req: Request, res: Response, next: NextFunction) => {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.redirect(`${FRONTEND_URL}/login?error=not_configured`);
    }
    passport.authenticate('google', {
      failureRedirect: `${FRONTEND_URL}/login?error=auth_failed`,
    })(req, res, next);
  },
  (req: Request, res: Response) => {
    // Successful authentication - redirect to frontend
    res.redirect(FRONTEND_URL);
  }
);

// Logout
router.post('/logout', (req: Request, res: Response) => {
  (req as any).logout((err: any) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ success: true });
  });
});

// Get current user
router.get('/me', (req: Request, res: Response) => {
  if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
    res.json({
      authenticated: true,
      user: (req as any).user,
    });
  } else {
    res.json({
      authenticated: false,
      user: null,
    });
  }
});

export default router;
export { passport };
