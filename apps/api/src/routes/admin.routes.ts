import { Router } from 'express';
import { listUsersHandler, createUserHandler, resetPasswordHandler, updatePasswordHandler, getTenantHandler, updateTenantHandler, listTenantCampaignsHandler, updateTenantCampaignHandler } from '../controllers/admin.controller.js';

const router = Router();

router.get('/users', listUsersHandler);
router.post('/users', createUserHandler);
router.post('/users/:userId/reset-password', resetPasswordHandler);
router.put('/users/:userId/password', updatePasswordHandler);

router.get('/tenants/:id', getTenantHandler);
router.put('/tenants/:id', updateTenantHandler);

router.get('/tenants/:id/campaigns', listTenantCampaignsHandler);
router.patch('/tenants/:id/campaigns/:campaignId', updateTenantCampaignHandler);

export default router;
