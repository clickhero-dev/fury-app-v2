import { Router } from 'express';
import { controllers } from '../di.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Public routes
router.post('/register', controllers.auth.register);
router.post('/login', controllers.auth.login);
router.post('/refresh', controllers.auth.refresh);
router.post('/verify-email', controllers.auth.verifyEmail);
router.post('/forgot-password', controllers.auth.forgotPassword);
router.post('/reset-password', controllers.auth.resetPassword);

// Protected routes
router.post('/logout', authMiddleware, controllers.auth.logout);
router.get('/me', authMiddleware, controllers.auth.getMe);
router.patch('/me', authMiddleware, controllers.auth.updateMe);
router.post('/change-password', authMiddleware, controllers.auth.changePassword);

// Google social login
router.get('/google/url', controllers.auth.googleSocialUrl);
router.get('/google/callback', controllers.auth.googleSocialCallback);
router.post('/google/callback', controllers.auth.googleSocialCallback);

export default router;