import express from 'express';
import { index, exportStockReport } from '../../controllers/ProductController.js';
import { protectRoute } from '../../middleware/Authenticate.js';
// import { salesforceAuth } from '../../middleware/salesforceAuth.js';

const router = express.Router();

router.route('/').get(protectRoute, index);
router.route('/export').get(protectRoute, exportStockReport);

export default router;


