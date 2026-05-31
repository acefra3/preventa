import { Response } from 'express';
import { query, queryOne } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { createNotification } from '../services/notification.service';
import { logActivity } from '../services/activity.service';

// POST /api/revisions/:proposalId  — Comercial solicita revisión
export const requestRevision = async (req: AuthRequest, res: Response): Promise<void> => {
  const { proposalId } = req.params;
  const { notes } = req.body;
  const { role, id: userId } = req.user!;

  if (!notes?.trim()) {
    res.status(400).json({ error: 'El motivo de la revisión es obligatorio' }); return;
  }

  const proposal = await queryOne<Record<string, unknown>>(
    'SELECT id, status, iterations_count, name, assigned_to, commercial_id FROM proposals WHERE id = $1',
    [proposalId]
  );
  if (!proposal) { res.status(404).json({ error: 'Propuesta no encontrada' }); return; }

  // Solo comercial dueño o admin
  if (role === 'comercial' && proposal['commercial_id'] !== userId) {
    res.status(403).json({ error: 'Sin acceso' }); return;
  }

  // Validar estado: solo se puede revisar en estados entregada
  if (!['entregada-revision', 'entregada-revision-2'].includes(proposal['status'] as string)) {
    res.status(400).json({ error: 'Solo puedes solicitar revisión cuando la propuesta está entregada' }); return;
  }

  const currentIter = proposal['iterations_count'] as number;
  if (currentIter >= 2) {
    res.status(400).json({ error: 'Se alcanzó el límite de 2 revisiones. Debes concluir la propuesta.' }); return;
  }

  const newIter = currentIter + 1;
  const newStatus = newIter === 1 ? 'revision-1' : 'revision-2';

  // Crear revisión
  const [revision] = await query(
    `INSERT INTO revisions (proposal_id, iteration_number, requested_by, notes, status)
     VALUES ($1, $2, $3, $4, 'abierta')
     RETURNING *`,
    [proposalId, newIter, userId, notes.trim()]
  );

  // Actualizar propuesta
  await query(
    `UPDATE proposals SET status = $1, iterations_count = $2, updated_at = NOW() WHERE id = $3`,
    [newStatus, newIter, proposalId]
  );

  await logActivity(proposalId, userId, 'revision_requested', proposal['status'] as string, newStatus, { iteration: newIter });

  // Notificar al preventa asignado
  if (proposal['assigned_to']) {
    await createNotification(
      proposal['assigned_to'] as string,
      proposalId,
      `${proposal['name']} — revisión #${newIter} solicitada`,
      'warning'
    );
  }

  res.status(201).json(revision);
};

// PATCH /api/revisions/:revisionId/respond  — Preventa acepta y compromete fecha
export const respondRevision = async (req: AuthRequest, res: Response): Promise<void> => {
  const { revisionId } = req.params;
  const { adjustDeadline, preventaNote } = req.body;
  const { role, id: userId } = req.user!;

  if (!adjustDeadline) {
    res.status(400).json({ error: 'La fecha de ajuste es obligatoria' }); return;
  }

  const revision = await queryOne<Record<string, unknown>>(
    `SELECT r.*, p.assigned_to, p.commercial_id, p.name AS proposal_name, p.iterations_count
     FROM revisions r JOIN proposals p ON r.proposal_id = p.id
     WHERE r.id = $1`,
    [revisionId]
  );
  if (!revision) { res.status(404).json({ error: 'Revisión no encontrada' }); return; }

  if (role === 'preventa' && revision['assigned_to'] !== userId) {
    res.status(403).json({ error: 'Solo el preventa asignado puede responder' }); return;
  }
  if (revision['status'] !== 'abierta') {
    res.status(400).json({ error: 'Esta revisión ya fue respondida' }); return;
  }

  const iter = revision['iteration_number'] as number;
  const ajusteStatus = iter === 1 ? 'ajuste-1' : 'ajuste-2';

  await query(
    `UPDATE revisions
     SET adjust_deadline = $1, preventa_note = $2, responded_at = NOW(), updated_at = NOW()
     WHERE id = $3`,
    [adjustDeadline, preventaNote || null, revisionId]
  );

  await query(
    `UPDATE proposals SET status = $1, updated_at = NOW() WHERE id = $2`,
    [ajusteStatus, revision['proposal_id']]
  );

  await logActivity(revision['proposal_id'] as string, userId, 'revision_accepted', undefined, ajusteStatus);

  // Notificar al comercial
  if (revision['commercial_id']) {
    await createNotification(
      revision['commercial_id'] as string,
      revision['proposal_id'] as string,
      `${revision['proposal_name']} — preventa comprometió ajuste para ${adjustDeadline}`,
      'info'
    );
  }

  res.json({ message: 'Fecha de ajuste comprometida', ajusteStatus });
};

// PATCH /api/revisions/:revisionId/close  — Preventa entrega el ajuste
export const closeRevision = async (req: AuthRequest, res: Response): Promise<void> => {
  const { revisionId } = req.params;
  const { id: userId } = req.user!;

  const revision = await queryOne<Record<string, unknown>>(
    `SELECT r.*, p.assigned_to, p.commercial_id, p.name AS proposal_name, p.iterations_count
     FROM revisions r JOIN proposals p ON r.proposal_id = p.id
     WHERE r.id = $1`,
    [revisionId]
  );
  if (!revision) { res.status(404).json({ error: 'Revisión no encontrada' }); return; }
  if (revision['status'] !== 'abierta') {
    res.status(400).json({ error: 'La revisión ya está cerrada' }); return;
  }

  const iter = revision['iteration_number'] as number;
  const nextStatus = iter === 1 ? 'entregada-revision-2' : 'entregada-revision-2';

  await query(
    `UPDATE revisions SET status = 'cerrada', closed_at = NOW(), closed_by = $1, updated_at = NOW() WHERE id = $2`,
    [userId, revisionId]
  );

  await query(
    `UPDATE proposals SET status = $1, progress_pct = 100, updated_at = NOW() WHERE id = $2`,
    [nextStatus, revision['proposal_id']]
  );

  await logActivity(revision['proposal_id'] as string, userId, 'adjustment_delivered', undefined, nextStatus);

  // Notificar al comercial
  if (revision['commercial_id']) {
    await createNotification(
      revision['commercial_id'] as string,
      revision['proposal_id'] as string,
      `${revision['proposal_name']} — ajuste entregado, pendiente revisión`,
      'success'
    );
  }

  res.json({ message: 'Ajuste entregado', status: nextStatus });
};

// GET /api/revisions/proposal/:proposalId
export const getRevisions = async (req: AuthRequest, res: Response): Promise<void> => {
  const { proposalId } = req.params;
  const revisions = await query(
    `SELECT r.*, u.name AS requested_by_name, u2.name AS closed_by_name,
            d.name AS adjustment_doc_name, d.blob_url AS adjustment_doc_url
     FROM revisions r
     JOIN users u ON r.requested_by = u.id
     LEFT JOIN users u2 ON r.closed_by = u2.id
     LEFT JOIN documents d ON r.adjustment_doc_id = d.id
     WHERE r.proposal_id = $1
     ORDER BY r.iteration_number`,
    [proposalId]
  );
  res.json(revisions);
};
