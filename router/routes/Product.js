import express from 'express';
import { index } from '../../controllers/ProductController.js';
import { protectRoute } from '../../middleware/Authenticate.js';
// import { salesforceAuth } from '../../middleware/salesforceAuth.js';

const router = express.Router();

router.route('/').get(protectRoute, index);

export default router;


