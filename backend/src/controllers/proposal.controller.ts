import { Response } from 'express';
import { query, queryOne } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { createNotification } from '../services/notification.service';
import { logActivity } from '../services/activity.service';

// Transiciones de estado permitidas por rol
const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  admin: {
    'pendiente':             ['en-progreso'],
    'en-progreso':           ['entregada-revision'],
    'entregada-revision':    ['revision-1', 'concluida'],
    'revision-1':            ['ajuste-1'],
    'ajuste-1':              ['entregada-revision-2'],
    'entregada-revision-2':  ['revision-2', 'concluida'],
    'revision-2':            ['ajuste-2'],
    'ajuste-2':              ['concluida'],
  },
  preventa: {
    'pendiente':    ['en-progreso'],
    'en-progreso':  ['entregada-revision'],
    'revision-1':   ['ajuste-1'],
    'ajuste-1':     ['entregada-revision-2'],
    'revision-2':   ['ajuste-2'],
    'ajuste-2':     ['concluida'],
  },
  comercial: {
    'entregada-revision':   ['revision-1', 'concluida'],
    'entregada-revision-2': ['revision-2', 'concluida'],
  },
};

// GET /api/proposals
export const getProposals = async (req: AuthRequest, res: Response): Promise<void> => {
  const { role, id: userId } = req.user!;
  const { status, priority, search, page = '1', limit = '20' } = req.query;

  let where = 'WHERE 1=1';
  const params: unknown[] = [];
  let idx = 1;

  // Filtro por rol
  if (role === 'preventa') {
    where += ` AND p.assigned_to = $${idx++}`;
    params.push(userId);
  } else if (role === 'comercial') {
    where += ` AND p.commercial_id = $${idx++}`;
    params.push(userId);
  }

  if (status) { where += ` AND p.status = $${idx++}`; params.push(status); }
  if (priority) { where += ` AND p.priority = $${idx++}`; params.push(priority); }
  if (search) {
    where += ` AND (p.name ILIKE $${idx} OR p.client ILIKE $${idx})`;
    params.push(`%${search}%`); idx++;
  }

  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
  params.push(parseInt(limit as string), offset);

  const rows = await query(
    `SELECT
       p.id, p.code, p.name, p.client, p.status, p.progress_pct, p.priority,
       p.start_date, p.end_date, p.bant_score, p.composite_score,
       p.iterations_count, p.estimated_value, p.proposal_type,
       p.created_at, p.updated_at,
       u1.name AS assigned_name, u1.avatar_initials AS assigned_initials,
       u2.name AS commercial_name
     FROM proposals p
     LEFT JOIN users u1 ON p.assigned_to = u1.id
     LEFT JOIN users u2 ON p.commercial_id = u2.id
     ${where}
     ORDER BY
       CASE p.priority WHEN 'critica' THEN 1 WHEN 'alta' THEN 2 WHEN 'media' THEN 3 ELSE 4 END,
       p.end_date ASC
     LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  const [count] = await query<{ total: string }>(
    `SELECT COUNT(*) as total FROM proposals p ${where}`,
    params.slice(0, -2)
  );

  res.json({
    data: rows,
    pagination: {
      total: parseInt(count.total),
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    },
  });
};

// GET /api/proposals/:id
export const getProposal = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { role, id: userId } = req.user!;

  const proposal = await queryOne(
    `SELECT
       p.*,
       u1.name AS assigned_name, u1.email AS assigned_email, u1.avatar_initials AS assigned_initials,
       u2.name AS commercial_name, u2.email AS commercial_email
     FROM proposals p
     LEFT JOIN users u1 ON p.assigned_to = u1.id
     LEFT JOIN users u2 ON p.commercial_id = u2.id
     WHERE p.id = $1`,
    [id]
  );

  if (!proposal) { res.status(404).json({ error: 'Propuesta no encontrada' }); return; }

  const p = proposal as Record<string, unknown>;
  if (role === 'preventa' && p['assigned_to'] !== userId) {
    res.status(403).json({ error: 'Sin acceso a esta propuesta' }); return;
  }
  if (role === 'comercial' && p['commercial_id'] !== userId) {
    res.status(403).json({ error: 'Sin acceso a esta propuesta' }); return;
  }

  // Documentos
  const documents = await query(
    'SELECT * FROM documents WHERE proposal_id = $1 ORDER BY created_at DESC',
    [id]
  );

  // Revisiones
  const revisions = await query(
    `SELECT r.*, u.name AS requested_by_name
     FROM revisions r
     JOIN users u ON r.requested_by = u.id
     WHERE r.proposal_id = $1 ORDER BY r.iteration_number`,
    [id]
  );

  // Log de actividad
  const activity = await query(
    `SELECT a.*, u.name AS user_name
     FROM activity_log a
     JOIN users u ON a.user_id = u.id
     WHERE a.proposal_id = $1
     ORDER BY a.created_at DESC LIMIT 20`,
    [id]
  );

  res.json({ ...p, documents, revisions, activity });
};

// POST /api/proposals
export const createProposal = async (req: AuthRequest, res: Response): Promise<void> => {
  const { role, id: userId } = req.user!;
  if (role !== 'comercial' && role !== 'admin') {
    res.status(403).json({ error: 'Solo comerciales o admins pueden crear propuestas' }); return;
  }

  const {
    name, client, description, endDate, startDate, priority,
    estimatedValue, proposalType, bantData, meddicData, gpctData,
    bantScore, meddicScore, gpctScore, compositeScore,
  } = req.body;

  if (!name || !client || !endDate) {
    res.status(400).json({ error: 'Nombre, cliente y fecha de cierre son requeridos' }); return;
  }

  const [{ nextval }] = await query<{ nextval: string }>(
    "SELECT nextval('proposal_code_seq') AS nextval"
  );
  const code = `P${String(nextval).padStart(3, '0')}`;

  const [proposal] = await query(
    `INSERT INTO proposals
       (code, name, client, description, commercial_id, status, priority,
        start_date, end_date, estimated_value, proposal_type,
        bant_data, meddic_data, gpct_data, bant_score, meddic_score, gpct_score, composite_score)
     VALUES ($1,$2,$3,$4,$5,'pendiente',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      code, name, client, description || null, userId,
      priority || 'media', startDate || null, endDate,
      estimatedValue || null, proposalType || null,
      JSON.stringify(bantData || {}), JSON.stringify(meddicData || {}), JSON.stringify(gpctData || {}),
      bantScore || 0, meddicScore || 0, gpctScore || 0, compositeScore || 0,
    ]
  );

  await logActivity((proposal as Record<string, unknown>)['id'] as string, userId, 'created', undefined, 'pendiente');

  // Notificar admins
  const admins = await query<{ id: string }>("SELECT id FROM users WHERE role = 'admin' AND active = true");
  await Promise.all(admins.map(a =>
    createNotification(a.id, (proposal as Record<string, unknown>)['id'] as string, `Nueva propuesta: ${name} — ${client}`, 'info')
  ));

  res.status(201).json(proposal);
};

// PATCH /api/proposals/:id/status
export const updateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { status: newStatus } = req.body;
  const { role, id: userId } = req.user!;

  const proposal = await queryOne<Record<string, unknown>>(
    'SELECT id, status, iterations_count, name, assigned_to, commercial_id FROM proposals WHERE id = $1',
    [id]
  );
  if (!proposal) { res.status(404).json({ error: 'Propuesta no encontrada' }); return; }

  const allowed = ALLOWED_TRANSITIONS[role]?.[proposal['status'] as string] || [];
  if (!allowed.includes(newStatus)) {
    res.status(400).json({
      error: `Transición no permitida: ${proposal['status']} → ${newStatus} para rol ${role}`,
    });
    return;
  }

  // Validar límite de revisiones
  if ((newStatus === 'revision-2') && (proposal['iterations_count'] as number) >= 2) {
    res.status(400).json({ error: 'Se alcanzó el máximo de 2 revisiones' }); return;
  }

  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'concluida') updates['progress_pct'] = 100;

  await query(
    `UPDATE proposals SET status = $1, progress_pct = COALESCE($2, progress_pct), updated_at = NOW() WHERE id = $3`,
    [newStatus, updates['progress_pct'] || null, id]
  );

  await logActivity(id, userId, 'status_changed', proposal['status'] as string, newStatus);

  // Notificaciones según transición
  const notifTargets: string[] = [];
  const msg = `${proposal['name']} — estado actualizado: ${newStatus}`;

  if (newStatus === 'entregada-revision' || newStatus === 'entregada-revision-2') {
    if (proposal['commercial_id']) notifTargets.push(proposal['commercial_id'] as string);
  }
  if (newStatus.startsWith('revision')) {
    if (proposal['assigned_to']) notifTargets.push(proposal['assigned_to'] as string);
  }
  if (newStatus === 'concluida') {
    if (proposal['commercial_id']) notifTargets.push(proposal['commercial_id'] as string);
    if (proposal['assigned_to']) notifTargets.push(proposal['assigned_to'] as string);
  }

  await Promise.all([...new Set(notifTargets)].map(uid => createNotification(uid, id, msg, 'success')));

  res.json({ message: 'Estado actualizado', status: newStatus });
};

// PATCH /api/proposals/:id
export const updateProposal = async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const { role, id: userId } = req.user!;
  const { progressPct, assignedTo, priority } = req.body;

  const proposal = await queryOne<Record<string, unknown>>(
    'SELECT id, assigned_to, commercial_id FROM proposals WHERE id = $1',
    [id]
  );
  if (!proposal) { res.status(404).json({ error: 'Propuesta no encontrada' }); return; }

  // Solo preventa asignado o admin pueden actualizar progreso
  if (role === 'preventa' && proposal['assigned_to'] !== userId) {
    res.status(403).json({ error: 'Solo puedes actualizar propuestas asignadas a ti' }); return;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (progressPct !== undefined) { sets.push(`progress_pct = $${idx++}`); params.push(progressPct); }
  if (assignedTo !== undefined && role === 'admin') { sets.push(`assigned_to = $${idx++}`); params.push(assignedTo || null); }
  if (priority !== undefined && role === 'admin') { sets.push(`priority = $${idx++}`); params.push(priority); }

  if (sets.length === 0) { res.status(400).json({ error: 'Nada que actualizar' }); return; }

  sets.push('updated_at = NOW()');
  params.push(id);

  await query(`UPDATE proposals SET ${sets.join(', ')} WHERE id = $${idx}`, params);
  await logActivity(id, userId, 'updated');

  res.json({ message: 'Propuesta actualizada' });
};
