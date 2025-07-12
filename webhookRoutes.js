// webhookRoutes.js
import express from 'express';
import crypto from 'crypto';
import { storeLog } from './helpers/Common.js';
import { handleCustomerForSalesforce } from './utils/handleCustomerForSalesforce.js'; // adjust path if needed

const router = express.Router();

storeLog('Inside webhookRoutes.js');

// Setup raw body middleware for webhook HMAC validation
router.use(
  '/webhooks/customers-create',
  express.raw({ type: 'application/json' })
);
router.use(
  '/webhooks/customers-update',
  express.raw({ type: 'application/json' })
);

// HMAC validation middleware
function validateShopifyWebhook(req, res, next) {
    storeLog('validateShopifyWebhook')
    storeLog(process.env.SHOPIFY_API_SECRET)
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

// === Handle Customers Create ===
router.post('/webhooks/customers-create', validateShopifyWebhook, async (req, res) => {
    storeLog('Call → webhooks/customers-create')
  console.log('✅ Call → webhooks/customers-create');
  const body = req.body.toString();
  storeLog('webhooks/customers-create: ' + body);

  const customer = JSON.parse(body);
  await handleCustomerForSalesforce(customer);

  console.log('✅ Webhook processed');
  res.status(200).send('Webhook received');
});

// === Handle Customers Update ===
router.post('/webhooks/customers-update', validateShopifyWebhook, async (req, res) => {
    storeLog('Call → webhooks/customers-update');
  console.log('✅ Call → webhooks/customers-update');
  const body = req.body.toString();
  storeLog('webhooks/customers-update: ' + body);

  const customer = JSON.parse(body);
  await handleCustomerForSalesforce(customer);

  console.log('✅ Webhook processed');
  res.status(200).send('Webhook received');
});

export default router;
 