import express from 'express';
import { edit, update, segmentList, segmentRecords } from '../../controllers/CustomerController.js';
import { protectRoute } from '../../middleware/Authenticate.js';
import { salesforceAuth } from '../../middleware/salesforceAuth.js';

const router = express.Router();
router.route('/edit/:id').get(protectRoute, edit);
router.route('/update').post(protectRoute, salesforceAuth, update);
router.route('/segment/list').get(protectRoute, segmentList);
router.route('/segment/records').get(protectRoute, segmentRecords);

export default router;


