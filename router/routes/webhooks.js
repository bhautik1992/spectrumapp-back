import { shopifyApi, shopifyWebhookHandler } from "@shopify/shopify-api";

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

shopifyWebhookHandler(webhookHandlers);


