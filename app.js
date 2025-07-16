import express from 'express';
import dotenv from 'dotenv';
import router from './router/index.js';
import webhooks from './webhookRoutes.js';
import connectDB from './config/database.js';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
connectDB();
const app = express();

app.use(cors({
    // origin: '*',
    origin: process.env.ALLOWED_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/webhooks/customers-create', express.raw({ type: 'application/json' }));
app.use('/webhooks/customers-update', express.raw({ type: 'application/json' }));

app.use('/',webhooks); 
app.use(process.env.API_PREFIX, router); 
app.use(express.json());

// Error handling middleware (optional)
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ message: 'An error occurred', error: err.message });
});

export default app;


