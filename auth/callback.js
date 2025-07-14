import express from 'express';
import axios from 'axios';
import crypto from 'crypto';
import qs from 'querystring';
import Shop from '../models/Shop.js';

const router = express.Router();

router.get('/auth/callback', async (req, res) => {
    const { shop, code, hmac } = req.query;

    if (!shop || !code || !hmac) {
        return res.status(400).send('Missing required parameters');
    }
    
    const map = { ...req.query };
    delete map['signature'];
    delete map['hmac'];
    
    const message = qs.stringify(map);
    const generatedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(message)
    .digest('hex');

    if (generatedHmac !== hmac) {
        return res.status(400).send('HMAC validation failed');
    }

    try {
        const tokenRes = await axios.post(`https://${shop}/admin/oauth/access_token`, {
            client_id: process.env.SHOPIFY_API_KEY,
            client_secret: process.env.SHOPIFY_API_SECRET,
            code
        });

        const { access_token, scope } = tokenRes.data;

        await Shop.findOneAndUpdate(
            { shop },
            { shop, accessToken: access_token, scope },
            { upsert: true }
        );

        const registerWebhook = async (topic, address) => {
            return axios.post(`https://${shop}/admin/api/2023-04/webhooks.json`,{
                webhook: {
                    topic,
                    address,
                    format: 'json'
                }
            },{
                headers: {
                    'X-Shopify-Access-Token': access_token,
                    'Content-Type': 'application/json'
            }}
        );
        };

        await registerWebhook('customers/create', `https://spectrumappback.hailysoft.com//webhooks/customers-create`);
        await registerWebhook('customers/update', `https://spectrumappback.hailysoft.com//webhooks/customers-update`);

        res.redirect(`https://${shop}/admin/apps`);
    } catch (error) {
        console.error('❌ Auth Callback Error:', error.response?.data || error.message);
        res.status(500).send('Internal server error');
    }
});

export default router;


