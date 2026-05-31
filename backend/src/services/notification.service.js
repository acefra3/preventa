const { pool } = require('../config/database');

async function createNotification(userId, proposalId, type, message) {
  if (!userId) return;
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, proposal_id, type, message)
       VALUES ($1, $2, $3, $4)`,
      [userId, proposalId, type, message]
    );
  } catch (err) {
    console.error('Error creando notificación:', err.message);
  }
}

module.exports = { createNotification };
