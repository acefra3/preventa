const { pool } = require('../config/database');
const notifService  = require('../services/notification.service');
const emailService  = require('../services/email.service');

// ── Helper: log activity ──────────────────────────────────────
async function logActivity(proposalId, userId, action, oldValue, newValue) {
  await pool.query(
    `INSERT INTO proposal_activity (proposal_id, user_id, action, old_value, new_value)
     VALUES ($1, $2, $3, $4, $5)`,
    [proposalId, userId, action, String(oldValue ?? ''), String(newValue ?? '')]
  );
}

// ── Helper: get admin emails ──────────────────────────────────
async function getAdmins() {
  const { rows } = await pool.query(
    `SELECT id, email, full_name FROM users WHERE role = 'admin' AND is_active = true`
  );
  return rows;
}

// GET /api/proposals
async function list(req, res, next) {
  try {
    const { role, id: userId } = req.user;
    const { status, priority, search, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let baseWhere = [];
    let params = [];
    let idx = 1;

    if (role === 'preventa') {
      baseWhere.push(`p.assigned_to = $${idx++}`);
      params.push(userId);
    } else if (role === 'comercial') {
      baseWhere.push(`p.commercial_id = $${idx++}`);
      params.push(userId);
    }

    if (status)  { baseWhere.push(`p.status = $${idx++}`);  params.push(status); }
    if (priority){ baseWhere.push(`p.priority = $${idx++}`); params.push(priority); }
    if (search)  {
      baseWhere.push(`(p.name ILIKE $${idx} OR p.client_name ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const where = baseWhere.length ? 'WHERE ' + baseWhere.join(' AND ') : '';

    const { rows } = await pool.query(
      `SELECT
         p.id, p.code, p.name, p.client_name, p.status, p.priority,
         p.progress_pct, p.iteration_count, p.start_date, p.end_date,
         p.bant_score, p.composite_score, p.delivered_at, p.concluded_at,
         p.estimated_value, p.proposal_type, p.assigned_to,
         u_assigned.full_name  AS assigned_name,
         u_assigned.avatar_initials AS assigned_initials,
         u_commercial.full_name AS commercial_name,
         (SELECT COUNT(*) FROM proposal_documents pd WHERE pd.proposal_id = p.id) AS doc_count,
         (SELECT COUNT(*) FROM proposal_revisions pr WHERE pr.proposal_id = p.id) AS revision_count
       FROM proposals p
       LEFT JOIN users u_assigned   ON u_assigned.id  = p.assigned_to
       LEFT JOIN users u_commercial ON u_commercial.id = p.commercial_id
       ${where}
       ORDER BY
         CASE p.priority WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
         p.end_date ASC
       LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    res.json({ proposals: rows, page: +page, limit: +limit });
  } catch (err) { next(err); }
}

// GET /api/proposals/:id
async function getOne(req, res, next) {
  try {
    const { id } = req.params;
    const { role, id: userId } = req.user;

    const { rows } = await pool.query(
      `SELECT p.*,
         u_assigned.full_name  AS assigned_name,
         u_assigned.email      AS assigned_email,
         u_assigned.avatar_initials AS assigned_initials,
         u_commercial.full_name AS commercial_name,
         u_commercial.email    AS commercial_email
       FROM proposals p
       LEFT JOIN users u_assigned   ON u_assigned.id  = p.assigned_to
       LEFT JOIN users u_commercial ON u_commercial.id = p.commercial_id
       WHERE p.id = $1`,
      [id]
    );

    if (!rows[0]) return res.status(404).json({ error: 'Propuesta no encontrada' });
    const p = rows[0];

    if (role === 'preventa'  && p.assigned_to   !== userId) return res.status(403).json({ error: 'Sin acceso' });
    if (role === 'comercial' && p.commercial_id !== userId) return res.status(403).json({ error: 'Sin acceso' });

    const [revisions, documents, activity] = await Promise.all([
      pool.query(
        `SELECT r.*, u.full_name AS requested_by_name
         FROM proposal_revisions r JOIN users u ON u.id = r.requested_by
         WHERE r.proposal_id = $1 ORDER BY r.iteration`, [id]
      ),
      pool.query(
        `SELECT d.*, u.full_name AS uploaded_by_name
         FROM proposal_documents d JOIN users u ON u.id = d.uploaded_by
         WHERE d.proposal_id = $1 ORDER BY d.created_at DESC`, [id]
      ),
      pool.query(
        `SELECT a.*, u.full_name AS user_name
         FROM proposal_activity a LEFT JOIN users u ON u.id = a.user_id
         WHERE a.proposal_id = $1 ORDER BY a.created_at DESC LIMIT 20`, [id]
      ),
    ]);

    res.json({ ...p, revisions: revisions.rows, documents: documents.rows, activity: activity.rows });
  } catch (err) { next(err); }
}

// POST /api/proposals
async function create(req, res, next) {
  try {
    const {
      name, clientName, description, priority, proposalType, estimatedValue,
      startDate, endDate, bantScore, meddicScore, gpctScore, compositeScore,
      bantData, meddicData, gpctData, country, brand,
    } = req.body;

    if (!name || !clientName || !startDate || !endDate) {
      return res.status(400).json({ error: 'name, clientName, startDate y endDate son requeridos' });
    }

    const year = new Date().getFullYear();
    const { rows: seq } = await pool.query(
      `SELECT COUNT(*)+1 AS n FROM proposals WHERE EXTRACT(YEAR FROM created_at) = $1`, [year]
    );
    const code = `P-${year}-${String(seq[0].n).padStart(3,'0')}`;

    const fullDescription = [
      country ? `País: ${country}` : null,
      brand   ? `Marca: ${brand}`  : null,
      description || null,
    ].filter(Boolean).join(' | ');

    const { rows } = await pool.query(
      `INSERT INTO proposals
         (code, name, client_name, description, commercial_id, priority,
          proposal_type, estimated_value, start_date, end_date,
          bant_score, meddic_score, gpct_score, composite_score,
          bant_data, meddic_data, gpct_data, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'pendiente')
       RETURNING *`,
      [code, name, clientName, fullDescription || null, req.user.id,
       priority || 'media', proposalType || null, estimatedValue || null,
       startDate, endDate,
       bantScore || null, meddicScore || null, gpctScore || null, compositeScore || null,
       bantData  ? JSON.stringify(bantData)  : null,
       meddicData? JSON.stringify(meddicData): null,
       gpctData  ? JSON.stringify(gpctData)  : null]
    );

    const proposal = rows[0];
    await logActivity(proposal.id, req.user.id, 'created', null, 'pendiente');

    // ── EMAIL: notificar a todos los admins ──
    try {
      const admins = await getAdmins();
      const commercial = req.user.full_name || req.user.email;
      for (const admin of admins) {
        // In-app notification
        await notifService.createNotification(
          admin.id, proposal.id, 'new_proposal',
          `Nueva propuesta de ${commercial}: ${name} — ${clientName}`
        );
        // Email
        await emailService.sendNewProposalToAdmin(
          admin.email, admin.full_name, proposal, commercial
        );
      }
    } catch (mailErr) {
      console.error('Email error (new proposal):', mailErr.message);
    }

    res.status(201).json({ id: proposal.id, code: proposal.code, name: proposal.name });
  } catch (err) { next(err); }
}

// PATCH /api/proposals/:id/progress
async function updateProgress(req, res, next) {
  try {
    const { id } = req.params;
    const { progressPct, status } = req.body;
    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });

    const updates = [], params = [];
    let idx = 1;
    if (progressPct !== undefined) { updates.push(`progress_pct = $${idx++}`); params.push(progressPct); }
    if (status)                    { updates.push(`status = $${idx++}`);       params.push(status); }
    if (!updates.length) return res.status(400).json({ error: 'Nada que actualizar' });

    params.push(id);
    await pool.query(`UPDATE proposals SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, params);
    await logActivity(id, req.user.id, 'progress_update', rows[0].progress_pct, progressPct);
    res.json({ message: 'Actualizado' });
  } catch (err) { next(err); }
}

// POST /api/proposals/:id/deliver
async function deliver(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });

    const p = rows[0];
    if (!['en-progreso','ajuste-1','ajuste-2'].includes(p.status)) {
      return res.status(400).json({ error: 'Estado inválido para entregar' });
    }

    const nextStatus = ['ajuste-1','ajuste-2'].includes(p.status)
      ? 'entregada-revision-2' : 'entregada-revision';

    await pool.query(
      `UPDATE proposals SET status=$1, progress_pct=100, delivered_at=NOW(), updated_at=NOW() WHERE id=$2`,
      [nextStatus, id]
    );
    await logActivity(id, req.user.id, 'delivered', p.status, nextStatus);

    // ── EMAIL: notificar al comercial ──
    try {
      const { rows: comercialRows } = await pool.query(
        'SELECT id, email, full_name FROM users WHERE id = $1', [p.commercial_id]
      );
      if (comercialRows[0]) {
        await notifService.createNotification(
          p.commercial_id, id, 'delivered',
          `"${p.name}" está lista para tu revisión`
        );
        await emailService.sendDeliveredToComercial(
          comercialRows[0].email,
          comercialRows[0].full_name,
          p,
          req.user.full_name || req.user.email
        );
      }
    } catch (mailErr) {
      console.error('Email error (deliver):', mailErr.message);
    }

    res.json({ message: 'Entregada', status: nextStatus });
  } catch (err) { next(err); }
}

// POST /api/proposals/:id/request-revision
async function requestRevision(req, res, next) {
  try {
    const { id } = req.params;
    const { note } = req.body;
    if (!note?.trim()) return res.status(400).json({ error: 'El motivo es obligatorio' });

    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    const p = rows[0];

    if (!['entregada-revision','entregada-revision-2'].includes(p.status)) {
      return res.status(400).json({ error: 'Estado inválido para solicitar revisión' });
    }
    if (p.iteration_count >= 2) {
      return res.status(400).json({ error: 'Máximo de 2 revisiones alcanzado' });
    }

    const newIter   = p.iteration_count + 1;
    const nextStatus = newIter === 1 ? 'revision-1' : 'revision-2';

    await pool.query(
      `UPDATE proposals SET status=$1, iteration_count=$2, updated_at=NOW() WHERE id=$3`,
      [nextStatus, newIter, id]
    );
    await pool.query(
      `INSERT INTO proposal_revisions (proposal_id, iteration, requested_by, request_note)
       VALUES ($1,$2,$3,$4)`,
      [id, newIter, req.user.id, note.trim()]
    );
    await logActivity(id, req.user.id, 'revision_requested', p.status, nextStatus);

    // ── EMAIL: notificar al preventa ──
    try {
      if (p.assigned_to) {
        const { rows: pRows } = await pool.query(
          'SELECT id, email, full_name FROM users WHERE id = $1', [p.assigned_to]
        );
        if (pRows[0]) {
          await notifService.createNotification(
            p.assigned_to, id, 'revision_requested',
            `Revisión #${newIter} solicitada para "${p.name}"`
          );
          await emailService.sendRevisionRequested(
            pRows[0].email, pRows[0].full_name,
            p, req.user.full_name || req.user.email,
            newIter, note.trim()
          );
        }
      }
    } catch (mailErr) {
      console.error('Email error (revision):', mailErr.message);
    }

    res.json({ message: `Revisión #${newIter} solicitada`, status: nextStatus });
  } catch (err) { next(err); }
}

// POST /api/proposals/:id/accept-revision
async function acceptRevision(req, res, next) {
  try {
    const { id } = req.params;
    const { adjustDeadline, adjustNote } = req.body;
    if (!adjustDeadline) return res.status(400).json({ error: 'Fecha de ajuste requerida' });

    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });

    const nextStatus = rows[0].status === 'revision-1' ? 'ajuste-1' : 'ajuste-2';
    await pool.query(`UPDATE proposals SET status=$1, updated_at=NOW() WHERE id=$2`, [nextStatus, id]);
    await pool.query(
      `UPDATE proposal_revisions SET adjust_deadline=$1, adjust_note=$2
       WHERE proposal_id=$3 AND status='abierta'`,
      [adjustDeadline, adjustNote || null, id]
    );
    await logActivity(id, req.user.id, 'revision_accepted', rows[0].status, nextStatus);
    res.json({ message: 'Fecha comprometida', status: nextStatus });
  } catch (err) { next(err); }
}

// POST /api/proposals/:id/conclude
async function conclude(req, res, next) {
  try {
    const { id } = req.params;
    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'No encontrada' });
    const p = rows[0];

    if (!['entregada-revision','entregada-revision-2'].includes(p.status)) {
      return res.status(400).json({ error: 'Solo se concluye una propuesta entregada' });
    }

    await pool.query(
      `UPDATE proposals SET status='concluida', progress_pct=100, concluded_at=NOW(), updated_at=NOW() WHERE id=$1`,
      [id]
    );
    await pool.query(
      `UPDATE proposal_revisions SET status='cerrada', closed_at=NOW()
       WHERE proposal_id=$1 AND status='abierta'`, [id]
    );
    await logActivity(id, req.user.id, 'concluded', p.status, 'concluida');

    // ── EMAIL: notificar al preventa y comercial ──
    try {
      const recipients = [];
      if (p.assigned_to)   {
        const { rows: pr } = await pool.query('SELECT email, full_name FROM users WHERE id=$1',[p.assigned_to]);
        if (pr[0]) recipients.push(pr[0]);
        await notifService.createNotification(p.assigned_to, id, 'concluded', `"${p.name}" concluida`);
      }
      if (p.commercial_id) {
        const { rows: cr } = await pool.query('SELECT email, full_name FROM users WHERE id=$1',[p.commercial_id]);
        if (cr[0]) recipients.push(cr[0]);
        await notifService.createNotification(p.commercial_id, id, 'concluded', `"${p.name}" concluida exitosamente`);
      }
      for (const r of recipients) {
        await emailService.sendConcluded(r.email, r.full_name, p);
      }
    } catch (mailErr) {
      console.error('Email error (conclude):', mailErr.message);
    }

    res.json({ message: 'Concluida', status: 'concluida' });
  } catch (err) { next(err); }
}

// PATCH /api/proposals/:id/assign
async function assign(req, res, next) {
  try {
    const { id } = req.params;
    const { assignedTo } = req.body;

    if (assignedTo) {
      const { rows: uRows } = await pool.query(
        `SELECT id FROM users WHERE id=$1 AND role='preventa' AND is_active=true`, [assignedTo]
      );
      if (!uRows[0]) return res.status(400).json({ error: 'Usuario preventa no válido' });
    }

    const { rows: prev } = await pool.query('SELECT * FROM proposals WHERE id=$1', [id]);
    if (!prev[0]) return res.status(404).json({ error: 'No encontrada' });

    // Split into two queries to avoid parameter type ambiguity
    await pool.query(
      `UPDATE proposals SET assigned_to = $1::uuid, updated_at = NOW() WHERE id = $2`,
      [assignedTo || null, id]
    );
    // Auto-advance from pendiente to en-progreso when assigned
    if (assignedTo) {
      await pool.query(
        `UPDATE proposals SET status = 'en-progreso'::proposal_status, updated_at = NOW()
         WHERE id = $1 AND status = 'pendiente'`,
        [id]
      );
    }
    await logActivity(id, req.user.id, 'assigned', prev[0].assigned_to, assignedTo);

    // ── EMAIL: notificar al preventa asignado ──
    if (assignedTo) {
      try {
        const { rows: pRows } = await pool.query(
          'SELECT email, full_name FROM users WHERE id=$1', [assignedTo]
        );
        const { rows: propRows } = await pool.query('SELECT * FROM proposals WHERE id=$1', [id]);
        if (pRows[0] && propRows[0]) {
          await notifService.createNotification(
            assignedTo, id, 'assigned',
            `Se te asignó la propuesta "${propRows[0].name}"`
          );
          await emailService.sendAssignedToPreventa(
            pRows[0].email, pRows[0].full_name,
            propRows[0], req.user.full_name || req.user.email
          );
        }
      } catch (mailErr) {
        console.error('Email error (assign):', mailErr.message);
      }
    }

    res.json({ message: 'Asignada' });
  } catch (err) { next(err); }
}


// PATCH /api/proposals/:id/end-date  — admin o comercial cambian fecha de cierre
async function updateEndDate(req, res, next) {
  try {
    const { id } = req.params;
    const { endDate } = req.body;

    if (!endDate) return res.status(400).json({ error: 'endDate es requerido' });

    const { rows } = await pool.query('SELECT * FROM proposals WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'Propuesta no encontrada' });
    if (rows[0].status === 'concluida') {
      return res.status(400).json({ error: 'No se puede modificar una propuesta concluida' });
    }

    await pool.query(
      'UPDATE proposals SET end_date = $1, updated_at = NOW() WHERE id = $2',
      [endDate, id]
    );
    await logActivity(id, req.user.id, 'end_date_updated', rows[0].end_date, endDate);
    res.json({ message: 'Fecha de cierre actualizada', endDate });
  } catch (err) { next(err); }
}

module.exports = { list, getOne, create, updateProgress, deliver, updateEndDate, requestRevision, acceptRevision, conclude, assign };
