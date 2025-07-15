import mongoose from 'mongoose';
import axios from 'axios';
import Settings from '../models/Settings.js';
import dotenv from 'dotenv';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI);
const settings = await Settings.findOne();
const { admin_api_access_token } = settings;

const res = await axios.get(process.env.SHOPIFY_LIST_HOOK, {
    headers: {
        'X-Shopify-Access-Token': admin_api_access_token,
        'Content-Type': 'application/json',
    }
});

console.log('Registered webhooks:', res.data.webhooks);
await mongoose.disconnect();


