import express from 'express';
import { shopifyWebhookHandler } from '@shopify/shopify-api';
import { handleCustomerForSalesforce  } from '../../utils/handleCustomerForSalesforce.js'; // update path as needed

const router = express.Router();

const webhookHandlers = {
  CUSTOMERS_CREATE: async (topic, shop, body) => {
    const customer = JSON.parse(body);
    await handleCustomerForSalesforce(customer);
  },
  CUSTOMERS_UPDATE: async (topic, shop, body) => {
    const customer = JSON.parse(body);
    await handleCustomerForSalesforce(customer);
  },
};

const webhookMiddleware = shopifyWebhookHandler({
  secret: process.env.SHOPIFY_API_SECRET,
  handlers: webhookHandlers,
});

router.post('/webhooks/customers-create', webhookMiddleware);
router.post('/webhooks/customers-update', webhookMiddleware);

export default router;
 