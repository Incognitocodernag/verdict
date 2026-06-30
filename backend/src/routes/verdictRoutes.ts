import { Router } from 'express';
import { getVerdict, analyzeAndCalculateVerdict } from '../controllers/verdictController';
import { rateLimiter } from '../middlewares/rateLimiter';

const router = Router();

// GET /api/v1/verdict?asin={asin} - Check Cache
router.get('/verdict', getVerdict);

// POST /api/v1/verdict - Perform review analysis (protected by Upstash Redis rate limiter)
router.post('/verdict', rateLimiter, analyzeAndCalculateVerdict);

export default router;
