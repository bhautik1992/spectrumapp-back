import express from 'express';
import { edit, update } from '../../controllers/CustomerController.js';
import { protectRoute } from '../../middleware/Authenticate.js';
import { salesforceAuth } from '../../middleware/salesforceAuth.js';

const router = express.Router();
router.route('/edit/:id').get(protectRoute, edit);
router.route('/update').post(protectRoute, salesforceAuth, update);

export default router;


