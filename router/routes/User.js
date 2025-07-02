import express from 'express';
import { getUsers } from '../../controllers/UserController.js';
import { protectRoute } from '../../middleware/Authenticate.js';

const router = express.Router();

router.route('/').get(protectRoute, getUsers);

export default router;


