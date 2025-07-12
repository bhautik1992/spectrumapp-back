// webhookRoutes.js
import express from 'express';
const router = express.Router();
import { storeLog } from './helpers/Common.js';


router.post('/webhooks/customers-create', async (req, res) => {
    console.log('Call -> webhooks/customers-create')
    storeLog('webhooks/customers-create'+req.body)
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  const topic = req.get('X-Shopify-Topic');
  const domain = req.get('X-Shopify-Shop-Domain');
  const body = req.rawBody || JSON.stringify(req.body); // raw body required for HMAC validation

  // Step 1: Verify HMAC (optional but recommended)
  const crypto = await import('crypto');
  const generatedHmac = crypto.createHmac('sha256', process.env.SHOPIFY_API_SECRET)
    .update(body, 'utf8')
    .digest('base64');

  if (generatedHmac !== hmacHeader) {
    return res.status(401).send('Invalid HMAC');
  }

  // Step 2: Process customer
  const customer = JSON.parse(body);
  await handleCustomerForSalesforce(customer);

  console.log('Webhook received')
  res.status(200).send('Webhook received');
});

export default router;
 