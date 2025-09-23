import express from 'express';
import { handleCustomerForSalesforce, handleUpdateCustomerForSalesforce } from './utils/handleCustomerForSalesforce.js';
import { storeLog } from './helpers/Common.js';
// import { salesforceAuth } from './middleware/salesforceAuth.js';

const router = express.Router();

// router.post('/webhooks/customers-create',salesforceAuth,async (req, res) => {
router.post('/webhooks/customers-create',async (req, res) => {
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    // storeLog("Webhook webhooks/customers-create Call")
    await handleCustomerForSalesforce(customer);

    res.status(200).send('Customer Create Webhook Received');
});

// router.post('/webhooks/customers-update',salesforceAuth,async (req, res) => {
router.post('/webhooks/customers-update',async (req, res) => {
    const body = req.body.toString();
    
    const customer = JSON.parse(body);
    // storeLog("Webhook webhooks/customers-update Call")
    await handleUpdateCustomerForSalesforce(customer);

    res.status(200).send('Customer Update Webhook Received');
});

export default router;


