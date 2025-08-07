import express from 'express';
import { getUsers, update } from '../../controllers/UserController.js';
import { protectRoute } from '../../middleware/Authenticate.js';

const router = express.Router();

router.route('/').get(protectRoute, getUsers);
router.route('/profile/update').post(protectRoute, update);

export default router;


