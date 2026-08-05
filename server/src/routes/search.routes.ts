import { Router } from 'express';
import { search } from '../controllers/search.controller.js';

const router = Router();

// GET /api/search?q=query
router.get('/', search);

export default router;
