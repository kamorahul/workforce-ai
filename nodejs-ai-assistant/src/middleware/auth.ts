import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { checkJwt } from '../config/auth0';

/**
 * Auth0 JWT validation middleware
 * Validates the access token and attaches user info to req.auth
 */
export const requireAuth = checkJwt;

/**
 * Optional auth middleware - doesn't fail if no token provided
 * Useful for routes that work differently for authenticated vs anonymous users
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without auth
    return next();
  }

  // Token provided, validate it
  checkJwt(req, res, (err) => {
    if (err) {
      // Token invalid, but we allow the request to continue
      console.warn('Optional auth: Invalid token provided', err.message);
    }
    next();
  });
};

/**
 * Extract user ID from authenticated request
 */
export const getUserId = (req: Request): string | null => {
  const auth = (req as any).auth;
  return auth?.payload?.sub || null;
};

/**
 * Check if user has specific permission (requires RBAC in Auth0)
 */
export const hasPermission = (req: Request, permission: string): boolean => {
  const auth = (req as any).auth;
  const permissions = auth?.payload?.permissions || [];
  return Array.isArray(permissions) && permissions.includes(permission);
};

/**
 * Middleware to require specific permission
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!hasPermission(req, permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Missing required permission: ${permission}`,
      });
    }
    next();
  };
};

/**
 * Error handler for auth errors
 */
export const authErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (err.name === 'UnauthorizedError' || err.name === 'InvalidTokenError') {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired access token',
    });
    return;
  }
  next(err);
};
