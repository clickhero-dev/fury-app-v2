import { Router } from 'express';
import { listUsersHandler, createUserHandler, resetPasswordHandler, updatePasswordHandler } from '../controllers/admin.controller.js';

const router = Router();

router.get('/users', listUsersHandler);
router.post('/users', createUserHandler);
router.post('/users/:userId/reset-password', resetPasswordHandler);
router.put('/users/:userId/password', updatePasswordHandler);

export default router;
