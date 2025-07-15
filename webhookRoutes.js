import express from 'express';
import { handleCustomerForSalesforce } from './utils/handleCustomerForSalesforce.js';
import { salesforceAuth } from './middleware/salesforceAuth.js';
import { storeLog } from './helpers/Common.js';

const router = express.Router();

router.use('/webhooks/customers-create',express.raw({ type: 'application/json' }));
router.use('/webhooks/customers-update',express.raw({ type: 'application/json' }));

router.post('/webhooks/customers-create',async (req, res) => {
    storeLog("Webhook webhooks/customers-create Call")
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Customer Create Webhook Received');
});

router.post('/webhooks/customers-update',async (req, res) => {
    storeLog("Webhook webhooks/customers-update Call")
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Customer Update Webhook Received');
});

export default router;


