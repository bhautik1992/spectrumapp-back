import express from 'express';
import { handleCustomerForSalesforce } from './utils/handleCustomerForSalesforce.js';
import { salesforceAuth } from './middleware/salesforceAuth.js';

const router = express.Router();

router.use('/webhooks/customers-create',express.raw({ type: 'application/json' }));
router.use('/webhooks/customers-update',express.raw({ type: 'application/json' }));

router.post('/webhooks/customers-create',salesforceAuth,async (req, res) => {
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Customer Create Webhook Received');
});

router.post('/webhooks/customers-update',salesforceAuth,async (req, res) => {
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Customer Update Webhook Received');
});

export default router;


