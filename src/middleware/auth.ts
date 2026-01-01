import { Request, Response, NextFunction } from 'express';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      name: string;
      picture?: string;
    }
  }
}

/**
 * Middleware to check if user is authenticated
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  // Check if user is authenticated (passport adds isAuthenticated method)
  if ((req as any).isAuthenticated && (req as any).isAuthenticated()) {
    return next();
  }
  
  // If it's an API request, return JSON error
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Otherwise redirect to login
  res.redirect('/login');
}

/**
 * Middleware to check if user is authenticated (returns 401 for API, allows for frontend)
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  // Always allow, but req.user will be undefined if not authenticated
  next();
}
