// activity.service.ts
import { query } from '../config/database';

export const logActivity = async (
  proposalId: string,
  userId: string,
  action: string,
  fromStatus?: string,
  toStatus?: string,
  metadata?: Record<string, unknown>
): Promise<void> => {
  await query(
    `INSERT INTO activity_log (proposal_id, user_id, action, from_status, to_status, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [proposalId, userId, action, fromStatus || null, toStatus || null, JSON.stringify(metadata || {})]
  );
};
