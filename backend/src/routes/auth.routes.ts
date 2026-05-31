// auth.routes.ts
import { Router } from 'express';
import { login, requestRecovery, resetPassword, getMe } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
const authRouter = Router();
authRouter.post('/login', login);
authRouter.post('/recovery', requestRecovery);
authRouter.post('/reset-password', resetPassword);
authRouter.get('/me', authenticate, getMe);
export default authRouter;
