import { Router } from 'express';
import { createCheckin, getAdminCheckins, getSharedCheckin, getMyCheckins } from '../controllers/checkin.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();

// Public route for shareable check-in links
router.get('/share/:shareToken', getSharedCheckin);

// Protected routes
router.post('/', authMiddleware, createCheckin);
router.get('/my', authMiddleware, getMyCheckins);
router.get(
  '/admin', 
  authMiddleware, 
  (req, res, next) => {
    // @ts-ignore - req.user is populated by authMiddleware
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden: Admin access required' });
    }
    next();
  },
  getAdminCheckins
);

export default router;
