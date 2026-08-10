import { Router } from 'express';
import { createRoute, getAllRoutes, deleteRoute, calculatePublicRoute, updateRoute, getSharedRoute } from '../controllers/route.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();
// Public routes
router.post('/calculate', calculatePublicRoute);
router.get('/share/:shareToken', getSharedRoute);

// Protected routes
router.post('/', authMiddleware, createRoute);
router.get('/', authMiddleware, getAllRoutes);
router.put('/:id', authMiddleware, updateRoute);
router.delete('/:id', authMiddleware, deleteRoute);

export default router;
