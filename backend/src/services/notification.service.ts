// notification.service.ts
import { query as dbQuery } from '../config/database';

export const createNotification = async (
  userId: string,
  proposalId: string | null,
  message: string,
  type: 'info' | 'warning' | 'success' | 'danger' = 'info'
): Promise<void> => {
  await dbQuery(
    'INSERT INTO notifications (user_id, proposal_id, message, type) VALUES ($1, $2, $3, $4)',
    [userId, proposalId, message, type]
  );
};
