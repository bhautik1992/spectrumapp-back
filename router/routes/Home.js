import express from 'express';
import { index } from '../../controllers/HomeController.js';
import { protectRoute } from '../../middleware/Authenticate.js';

const router = express.Router();
router.route('/').get(protectRoute, index);

export default router;


