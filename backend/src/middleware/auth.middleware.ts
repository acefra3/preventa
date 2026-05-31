import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../config/database';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'preventa' | 'comercial';
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

// ─── Verify JWT ───────────────────────────────────────────
export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token requerido' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser & { iat: number; exp: number };

    // Verificar que el usuario sigue activo en DB
    const user = await queryOne<{ id: string; active: boolean }>(
      'SELECT id, active FROM users WHERE id = $1',
      [payload.id]
    );

    if (!user || !user.active) {
      res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
      return;
    }

    req.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    } else {
      res.status(401).json({ error: 'Token inválido' });
    }
  }
};

// ─── Role guards ──────────────────────────────────────────
export const requireRole = (...roles: Array<'admin' | 'preventa' | 'comercial'>) =>
  (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) { res.status(401).json({ error: 'No autenticado' }); return; }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: `Acceso denegado. Roles permitidos: ${roles.join(', ')}` });
      return;
    }
    next();
  };

export const requireAdmin    = requireRole('admin');
export const requirePreventa = requireRole('admin', 'preventa');
export const requireComercial = requireRole('admin', 'comercial');
