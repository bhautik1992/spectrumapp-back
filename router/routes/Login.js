import express from 'express';
import { login } from '../../controllers/AuthController.js';

const router = express.Router();

// router.post('/login',login);
router.post('/', (req, res) => {
    login(req, res);
});

export default router;


