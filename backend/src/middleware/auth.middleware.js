const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Verificar que el usuario sigue activo en BD
    const { rows } = await pool.query(
      'SELECT id, email, full_name, role, is_active, avatar_initials FROM users WHERE id = $1',
      [payload.userId]
    );

    if (!rows[0] || !rows[0].is_active) {
      return res.status(401).json({ error: 'Usuario inactivo o no encontrado' });
    }

    req.user = rows[0];  // includes id, email, full_name, role, is_active
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'No autenticado' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acceso restringido. Roles permitidos: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

const isAdmin    = requireRole('admin');
const isPreventa = requireRole('admin', 'preventa');
const isComercial = requireRole('admin', 'comercial');

module.exports = { authenticate, requireRole, isAdmin, isPreventa, isComercial };
