// proposal.routes.ts
import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.middleware';
import { getProposals, getProposal, createProposal, updateStatus, updateProposal } from '../controllers/proposal.controller';
const router = Router();
router.use(authenticate);
router.get('/',      getProposals);
router.get('/:id',   getProposal);
router.post('/',     requireRole('comercial','admin'), createProposal);
router.patch('/:id', updateProposal);
router.patch('/:id/status', updateStatus);
export default router;
