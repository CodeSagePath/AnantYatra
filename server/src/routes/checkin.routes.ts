import { Router } from 'express';
import { createCheckin, getAdminCheckins, getSharedCheckin } from '../controllers/checkin.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Public route for shareable check-in links
router.get('/share/:shareToken', getSharedCheckin);

// Protected routes
router.post('/', authMiddleware, createCheckin);
router.get('/admin', authMiddleware, getAdminCheckins);

export default router;
