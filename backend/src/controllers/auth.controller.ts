import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryOne } from '../config/database';
import { sendPasswordResetEmail } from '../utils/email';

const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'bluetab.net';

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'preventa' | 'comercial';
  password_hash: string;
  active: boolean;
  avatar_initials: string;
  avatar_color: string;
  avatar_bg: string;
}

function signToken(user: UserRow): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_SECRET!,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// POST /api/auth/login
export const login = async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email y contraseña requeridos' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  if (!normalizedEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
    res.status(400).json({ error: `Solo se permiten correos @${ALLOWED_DOMAIN}` });
    return;
  }

  const user = await queryOne<UserRow>(
    'SELECT id, email, name, role, password_hash, active, avatar_initials, avatar_color, avatar_bg FROM users WHERE email = $1',
    [normalizedEmail]
  );

  if (!user) {
    res.status(401).json({ error: 'Credenciales incorrectas' });
    return;
  }

  if (!user.active) {
    res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    res.status(401).json({ error: 'Credenciales incorrectas' });
    return;
  }

  // Update last_login
  await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatarInitials: user.avatar_initials,
      avatarColor: user.avatar_color,
      avatarBg: user.avatar_bg,
    },
  });
};

// POST /api/auth/recovery  — solicitar recuperación
export const requestRecovery = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;
  if (!email) { res.status(400).json({ error: 'Email requerido' }); return; }

  const normalizedEmail = email.toLowerCase().trim();
  if (!normalizedEmail.endsWith(`@${ALLOWED_DOMAIN}`)) {
    res.status(400).json({ error: `Solo correos @${ALLOWED_DOMAIN}` });
    return;
  }

  // Respuesta genérica siempre para no filtrar si el usuario existe
  const user = await queryOne<{ id: string; name: string }>(
    'SELECT id, name FROM users WHERE email = $1 AND active = true',
    [normalizedEmail]
  );

  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

    await query(
      'UPDATE users SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, user.id]
    );

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(normalizedEmail, user.name, resetUrl);
  }

  res.json({ message: 'Si el correo existe, recibirás el enlace de recuperación en breve.' });
};

// POST /api/auth/reset-password  — usar token para cambiar contraseña
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    res.status(400).json({ error: 'Token y nueva contraseña requeridos' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    return;
  }

  const user = await queryOne<{ id: string }>(
    'SELECT id FROM users WHERE reset_token = $1 AND reset_token_expires > NOW() AND active = true',
    [token]
  );

  if (!user) {
    res.status(400).json({ error: 'Token inválido o expirado. Solicita uno nuevo.' });
    return;
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await query(
    'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
    [hash, user.id]
  );

  res.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
};

// GET /api/auth/me
export const getMe = async (req: Request & { user?: { id: string } }, res: Response): Promise<void> => {
  const user = await queryOne<Omit<UserRow, 'password_hash'>>(
    'SELECT id, email, name, role, active, avatar_initials, avatar_color, avatar_bg, last_login FROM users WHERE id = $1',
    [req.user!.id]
  );
  res.json(user);
};
