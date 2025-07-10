import express from 'express';
import { index, create, update } from '../../controllers/LeadController.js';
import { protectRoute } from '../../middleware/Authenticate.js';
import { salesforceAuth } from '../../middleware/salesforceAuth.js';

const router = express.Router();
router.route('/').get(protectRoute, index).post(salesforceAuth, create);
router.route('/update').post(salesforceAuth, update);

export default router;


