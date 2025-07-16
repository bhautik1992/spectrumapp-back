import express from 'express';
import { handleCustomerForSalesforce } from './utils/handleCustomerForSalesforce.js';
import { storeLog } from './helpers/Common.js';

const router = express.Router();

storeLog("Inside webhookRoutes");

router.post('/webhooks/customers-create',async (req, res) => {
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    storeLog("Webhook webhooks/customers-create Call")
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Customer Create Webhook Received');
});

router.post('/webhooks/customers-update',async (req, res) => {
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    storeLog("Webhook webhooks/customers-update Call")
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Customer Update Webhook Received');
});

export default router;


