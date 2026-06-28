import { Router } from 'express';
import { listUsersHandler, createUserHandler, resetPasswordHandler } from '../controllers/admin.controller.js';

const router = Router();

router.get('/users', listUsersHandler);
router.post('/users', createUserHandler);
router.post('/users/:userId/reset-password', resetPasswordHandler);

export default router;
