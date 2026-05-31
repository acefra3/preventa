// error.middleware.ts
import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error & { status?: number; code?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[Error]', err.message);
  if (err.message?.includes('no permitido')) {
    res.status(400).json({ error: err.message }); return;
  }
  if (err.code === '23505') {
    res.status(409).json({ error: 'Ya existe un registro con esos datos' }); return;
  }
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Error interno del servidor' : err.message,
  });
};
