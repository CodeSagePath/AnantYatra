import { Router } from 'express';
import { createRoute, getAllRoutes, deleteRoute, calculatePublicRoute } from '../controllers/route.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';

const router = Router();
// Public route
router.post('/calculate', calculatePublicRoute);

// Protected routes
router.post('/', authMiddleware, createRoute);
router.get('/', authMiddleware, getAllRoutes);
router.delete('/:id', authMiddleware, deleteRoute);

export default router;
