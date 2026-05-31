const router = require('express').Router();
const bcrypt = require('bcryptjs');
const emailService = require('../services/email.service');
const { authenticate, isAdmin } = require('../middleware/auth.middleware');
const { pool } = require('../config/database');

router.use(authenticate);

// GET /api/users/me
router.get('/me', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, avatar_initials, avatar_bg,
              avatar_color, last_login_at FROM users WHERE id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/users/preventa/workload  — admin: lista preventa con carga
router.get('/preventa/workload', isAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.full_name, u.avatar_initials, u.avatar_bg, u.avatar_color,
              COUNT(p.id) FILTER (WHERE p.status != 'concluida') AS active_count
       FROM users u
       LEFT JOIN proposals p ON p.assigned_to = u.id
       WHERE u.role = 'preventa' AND u.is_active = true
       GROUP BY u.id ORDER BY active_count ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/users  — admin: todos los usuarios
router.get('/', isAdmin, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, role, is_active,
              avatar_initials, avatar_bg, avatar_color,
              created_at, last_login_at
       FROM users ORDER BY role, full_name`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/users/admin/create  — admin crea nuevo usuario
router.post('/admin/create', isAdmin, async (req, res, next) => {
  try {
    const { fullName, email, role, password } = req.body;

    if (!fullName || !email || !role || !password) {
      return res.status(400).json({ error: 'fullName, email, role y password son requeridos' });
    }
    const domain = process.env.ALLOWED_EMAIL_DOMAIN || 'bluetab.net';
    if (!email.toLowerCase().endsWith(`@${domain}`)) {
      return res.status(400).json({ error: `Solo se permiten correos @${domain}` });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener mínimo 8 caracteres' });
    }

    const form_password = password;
    const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);

    // Calcular iniciales automáticamente
    const parts = fullName.trim().split(' ');
    const initials = (parts[0]?.[0] || '') + (parts[1]?.[0] || '');

    // Color de avatar según rol
    const avatarColors = {
      admin:     { bg:'#EEEDFE', color:'#26215C' },
      preventa:  { bg:'#E6F1FB', color:'#0C447C' },
      comercial: { bg:'#EAF3DE', color:'#27500A' },
    };
    const av = avatarColors[role] || avatarColors.comercial;

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, avatar_initials, avatar_bg, avatar_color)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, full_name, role, avatar_initials, avatar_bg, avatar_color, is_active`,
      [email.toLowerCase(), hash, fullName.trim(), role,
       initials.toUpperCase(), av.bg, av.color]
    );
    // Welcome email
    try {
      await emailService.sendWelcome(
        email.toLowerCase(),
        fullName.trim(),
        role,
        form_password  // raw password before hashing
      );
    } catch (mailErr) {
      console.error('Email error (welcome):', mailErr.message);
    }
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un usuario con ese correo' });
    }
    next(err);
  }
});

// PATCH /api/users/:id  — admin edita usuario
router.patch('/:id', isAdmin, async (req, res, next) => {
  try {
    const { fullName, role, isActive, password } = req.body;
    const updates = [];
    const params  = [];
    let idx = 1;

    if (fullName !== undefined) {
      updates.push(`full_name = $${idx++}`);
      params.push(fullName);
      // Recalcular iniciales
      const parts = fullName.trim().split(' ');
      const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
      updates.push(`avatar_initials = $${idx++}`);
      params.push(initials);
    }
    if (role !== undefined) {
      updates.push(`role = $${idx++}`);
      params.push(role);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      params.push(isActive);
    }
    if (password) {
      if (password.length < 8) return res.status(400).json({ error: 'Mínimo 8 caracteres' });
      const form_password = password;
    const hash = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
      updates.push(`password_hash = $${idx++}`);
      params.push(hash);
    }

    if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(req.params.id);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`,
      params
    );
    res.json({ message: 'Usuario actualizado' });
  } catch (err) { next(err); }
});

// DELETE /api/users/:id  — admin elimina usuario
router.delete('/:id', isAdmin, async (req, res, next) => {
  try {
    // No permitir auto-eliminación
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario' });
    }
    // Verificar que no tenga propuestas asignadas activas
    const { rows: active } = await pool.query(
      `SELECT COUNT(*) FROM proposals
       WHERE (assigned_to = $1 OR commercial_id = $1)
         AND status != 'concluida'`,
      [req.params.id]
    );
    if (parseInt(active[0].count) > 0) {
      return res.status(400).json({
        error: `No se puede eliminar: el usuario tiene ${active[0].count} propuesta(s) activa(s). Reasígnalas primero.`
      });
    }
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'Usuario eliminado' });
  } catch (err) { next(err); }
});

module.exports = router;
