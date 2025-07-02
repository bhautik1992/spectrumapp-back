import express from 'express';
import { index, store } from '../../controllers/SettingsController.js';
import { protectRoute } from '../../middleware/Authenticate.js';

const router = express.Router();
router.route('/').get(protectRoute, index).post(protectRoute, store);

export default router;


