import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  startFormHandler,
  completeFormHandler,
  errorFormHandler,
  abandonedFormHandler,
} from '../controllers/forms.controller.js';

const router = Router();

// POST /api/forms/start
router.post('/start', startFormHandler);

// POST /api/forms/complete
router.post('/complete', completeFormHandler);

// POST /api/forms/error
router.post('/error', errorFormHandler);

// POST /api/forms/abandoned
router.post('/abandoned', abandonedFormHandler);

export default router;
