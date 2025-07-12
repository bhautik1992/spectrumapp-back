import axios from 'axios';

async function registerWebhook(shop, accessToken) {
  await axios.post(
    `https://spectrum-one-hair.myshopify.com/admin/api/2023-04/webhooks.json`,
    {
      webhook: {
        topic: 'customers/create',
        address: 'https://spectrum-one-hair.myshopify.com/webhooks/customers-create',
        format: 'json'
      }
    },
    {
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      }
    }
  );
}
 