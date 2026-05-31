const router = require('express').Router();
const { authenticate } = require('../middleware/auth.middleware');
const { pool } = require('../config/database');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT n.*, p.name AS proposal_name FROM notifications n
       LEFT JOIN proposals p ON p.id = n.proposal_id
       WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 30`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    await pool.query('UPDATE notifications SET is_read = true WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Notificaciones marcadas como leídas' });
  } catch (err) { next(err); }
});

module.exports = router;
