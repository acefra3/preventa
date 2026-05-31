// document.routes.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { upload, uploadDocument, addExternalLink, getDownloadUrl, getProposalDocuments } from '../controllers/document.controller';
const docRouter = Router();
docRouter.use(authenticate);
docRouter.get('/proposal/:proposalId', getProposalDocuments);
docRouter.post('/upload/:proposalId', upload.single('file'), uploadDocument);
docRouter.post('/link/:proposalId', addExternalLink);
docRouter.get('/:id/download', getDownloadUrl);
export default docRouter;

// revision.routes.ts
import { Router as RevRouter } from 'express';
import { requestRevision, respondRevision, closeRevision, getRevisions } from '../controllers/revision.controller';
const revRouter = RevRouter();
revRouter.use(authenticate);
revRouter.get('/proposal/:proposalId', getRevisions);
revRouter.post('/:proposalId', requireRole('comercial','admin'), requestRevision);
revRouter.patch('/:revisionId/respond', requireRole('preventa','admin'), respondRevision);
revRouter.patch('/:revisionId/close',   requireRole('preventa','admin'), closeRevision);
export default revRouter;

// user.routes.ts
import { Router as UserRouter } from 'express';
import { requireRole, requireAdmin } from '../middleware/auth.middleware';
const userRouter = UserRouter();
userRouter.use(authenticate);
userRouter.get('/', requireAdmin, async (_req, res) => {
  const { query } = await import('../config/database');
  const users = await query('SELECT id, email, name, role, active, avatar_initials, avatar_color, avatar_bg, last_login, created_at FROM users ORDER BY role, name');
  res.json(users);
});
userRouter.get('/preventa', async (_req, res) => {
  const { query } = await import('../config/database');
  const users = await query("SELECT id, email, name, role, avatar_initials, avatar_color, avatar_bg FROM users WHERE role = 'preventa' AND active = true ORDER BY name");
  res.json(users);
});
userRouter.patch('/:id', requireAdmin, async (req, res) => {
  const { query } = await import('../config/database');
  const { name, role, active } = req.body;
  const sets: string[] = [], params: unknown[] = [];
  let i = 1;
  if (name !== undefined) { sets.push(`name = $${i++}`); params.push(name); }
  if (role !== undefined) { sets.push(`role = $${i++}`); params.push(role); }
  if (active !== undefined) { sets.push(`active = $${i++}`); params.push(active); }
  if (!sets.length) { res.status(400).json({ error: 'Nada que actualizar' }); return; }
  params.push(req.params.id);
  await query(`UPDATE users SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i}`, params);
  res.json({ message: 'Usuario actualizado' });
});
export default userRouter;

// notification.routes.ts
import { Router as NotifRouter } from 'express';
const notifRouter = NotifRouter();
notifRouter.use(authenticate);
notifRouter.get('/', async (req: any, res) => {
  const { query } = await import('../config/database');
  const notifs = await query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json(notifs);
});
notifRouter.patch('/read-all', async (req: any, res) => {
  const { query } = await import('../config/database');
  await query('UPDATE notifications SET read = true WHERE user_id = $1', [req.user.id]);
  res.json({ message: 'Todas leídas' });
});
export default notifRouter;

// dashboard.routes.ts
import { Router as DashRouter } from 'express';
const dashRouter = DashRouter();
dashRouter.use(authenticate);
dashRouter.get('/stats', async (req: any, res) => {
  const { query } = await import('../config/database');
  const role = req.user.role, uid = req.user.id;
  const base = role === 'preventa' ? `AND assigned_to = '${uid}'` : role === 'comercial' ? `AND commercial_id = '${uid}'` : '';
  const [counts] = await query(`
    SELECT
      COUNT(*) FILTER (WHERE status != 'concluida') AS active,
      COUNT(*) FILTER (WHERE status = 'concluida') AS concluded,
      COUNT(*) FILTER (WHERE priority = 'critica' AND status != 'concluida') AS critical,
      COUNT(*) FILTER (WHERE status IN ('revision-1','revision-2')) AS in_revision,
      COUNT(*) FILTER (WHERE assigned_to IS NULL AND status = 'pendiente') AS unassigned,
      ROUND(AVG(progress_pct)) AS avg_progress,
      ROUND(AVG(composite_score)) AS avg_score
    FROM proposals WHERE 1=1 ${base}
  `);
  const timeline = await query(`
    SELECT id, code, name, client, status, progress_pct, priority, start_date, end_date
    FROM proposals WHERE status != 'concluida' ${base}
    ORDER BY end_date ASC LIMIT 10
  `);
  res.json({ stats: counts, timeline });
});
export default dashRouter;
