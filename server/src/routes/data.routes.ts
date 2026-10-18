import { Router } from 'express';
import { downloadOsmDataOffer, getOsmDataOffer } from '../controllers/data.controller.js';

const router = Router();

router.get('/osm', getOsmDataOffer);
router.get('/osm/karnataka/download', downloadOsmDataOffer);

export default router;
