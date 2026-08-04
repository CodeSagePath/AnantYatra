import { Router } from 'express';
import { createRoute, getAllRoutes, deleteRoute } from '../controllers/route.controller.js';

const router = Router();
router.post('/', createRoute);
router.get('/', getAllRoutes);
router.delete('/:id', deleteRoute);

export default router;
