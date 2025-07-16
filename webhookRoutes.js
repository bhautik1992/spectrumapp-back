import express from 'express';
import crypto from 'crypto';
import { storeLog } from './helpers/Common.js';
import { handleCustomerForSalesforce } from './utils/handleCustomerForSalesforce.js';

const router = express.Router();

router.use('/webhooks/customers-create',express.raw({ type: 'application/json' }));
router.use('/webhooks/customers-update',express.raw({ type: 'application/json' }));

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


