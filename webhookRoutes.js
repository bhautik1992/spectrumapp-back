import express from 'express';
import crypto from 'crypto';
import { storeLog } from './helpers/Common.js';
import { handleCustomerForSalesforce } from './utils/handleCustomerForSalesforce.js';

const router = express.Router();

router.use('/webhooks/customers-create',express.raw({ type: 'application/json' }));
router.use('/webhooks/customers-update',express.raw({ type: 'application/json' }));

function validateShopifyWebhook(req, res, next) {
    const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
    const rawBody = req.body;

    const generatedHmac = crypto
    .createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');

    if (hmacHeader !== generatedHmac) {
        return res.status(401).send('Invalid HMAC');
    }

    next();
}

router.post('/webhooks/customers-create',  async (req, res) => {
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Webhook received');
});

router.post('/webhooks/customers-update', async (req, res) => {
    const body = req.body.toString();
    storeLog('webhooks/customers-update: ' + body);

    const customer = JSON.parse(body);
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Webhook received');
});

export default router;


