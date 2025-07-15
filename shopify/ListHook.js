import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const res = await axios.get(process.env.SHOPIFY_LIST_HOOK, {
    headers: {
        'X-Shopify-Access-Token': process.env.ADMIN_API_ACCESS_TOKEN,
        'Content-Type': 'application/json',
    }
});

console.log('Registered webhooks:', res.data.webhooks);


