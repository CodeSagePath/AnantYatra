import { Router } from 'express';
import { search, batchStates, reverseGeocodeController } from '../controllers/search.controller.js';

const router = Router();

// GET /api/search?q=query
router.get('/', search);

// POST /api/search/states
router.post('/states', batchStates);

// GET /api/search/reverse?lat=X&lon=Y
router.get('/reverse', reverseGeocodeController);

export default router;
