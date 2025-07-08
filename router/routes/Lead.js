import express from 'express';
import { create } from '../../controllers/LeadController.js';
import { protectRoute } from '../../middleware/Authenticate.js';
import { salesforceAuth } from '../../middleware/salesforceAuth.js';

const router = express.Router();
router.route('/').post(salesforceAuth, create);

export default router;


