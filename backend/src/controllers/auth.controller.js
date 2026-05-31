const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool } = require('../config/database');
const emailService = require('../services/email.service');

function generateTokens(userId) {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );
  return { accessToken, refreshToken };
}

// POST /api/auth/login
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos' });
    }

    // Validar dominio corporativo
    const domain = process.env.ALLOWED_EMAIL_DOMAIN || 'bluetab.net';
    if (!email.toLowerCase().endsWith(`@${domain}`)) {
      return res.status(403).json({ error: `Solo se permiten correos @${domain}` });
    }

    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, password_hash, is_active,
              avatar_initials, avatar_bg, avatar_color
       FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);

    // Guardar refresh token hasheado
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [user.id, tokenHash]
    );

    // Actualizar last_login
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        avatarInitials: user.avatar_initials,
        avatarBg: user.avatar_bg,
        avatarColor: user.avatar_color,
      },
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/refresh
async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token requerido' });

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const { rows } = await pool.query(
      `SELECT id FROM refresh_tokens
       WHERE token_hash = $1 AND revoked = false AND expires_at > NOW()`,
      [tokenHash]
    );

    if (!rows[0]) return res.status(401).json({ error: 'Refresh token inválido o expirado' });

    // Rotar tokens
    await pool.query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);

    const { accessToken, refreshToken: newRefresh } = generateTokens(payload.userId);
    const newHash = crypto.createHash('sha256').update(newRefresh).digest('hex');
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '7 days')`,
      [payload.userId, newHash]
    );

    res.json({ accessToken, refreshToken: newRefresh });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Refresh token inválido' });
    }
    next(err);
  }
}

// POST /api/auth/logout
async function logout(req, res, next) {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      await pool.query('UPDATE refresh_tokens SET revoked = true WHERE token_hash = $1', [tokenHash]);
    }
    res.json({ message: 'Sesión cerrada' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/recovery  — solicitar reset de contraseña
async function requestRecovery(req, res, next) {
  try {
    const { email } = req.body;
    const domain = process.env.ALLOWED_EMAIL_DOMAIN || 'bluetab.net';

    if (!email || !email.toLowerCase().endsWith(`@${domain}`)) {
      return res.status(400).json({ error: `Solo se permiten correos @${domain}` });
    }

    const { rows } = await pool.query(
      'SELECT id, full_name FROM users WHERE email = $1 AND is_active = true',
      [email.toLowerCase()]
    );

    // Respuesta siempre OK para no revelar si el email existe
    if (rows[0]) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      await pool.query(
        `UPDATE users SET reset_token = $1, reset_token_expires_at = $2 WHERE id = $3`,
        [token, expires, rows[0].id]
      );

      const resetUrl = `${process.env.CORS_ORIGIN}/reset-password?token=${token}`;
      await emailService.sendPasswordReset(email, rows[0].full_name, resetUrl);
    }

    res.json({ message: 'Si el correo existe en el sistema, recibirás un enlace de recuperación.' });
  } catch (err) {
    next(err);
  }
}

// POST /api/auth/reset-password
async function resetPassword(req, res, next) {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Token y contraseña (mín. 8 chars) requeridos' });
    }

    const { rows } = await pool.query(
      `SELECT id FROM users
       WHERE reset_token = $1 AND reset_token_expires_at > NOW() AND is_active = true`,
      [token]
    );

    if (!rows[0]) return res.status(400).json({ error: 'Token inválido o expirado' });

    const hash = await bcrypt.hash(newPassword, parseInt(process.env.BCRYPT_ROUNDS) || 12);
    await pool.query(
      `UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expires_at = NULL
       WHERE id = $2`,
      [hash, rows[0].id]
    );

    // Revocar todos los refresh tokens del usuario
    await pool.query('UPDATE refresh_tokens SET revoked = true WHERE user_id = $1', [rows[0].id]);

    res.json({ message: 'Contraseña actualizada exitosamente' });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, refresh, logout, requestRecovery, resetPassword };
