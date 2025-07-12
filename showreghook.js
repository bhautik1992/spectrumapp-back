import axios from 'axios';

const res = await axios.get(`https://spectrum-one-hair.myshopify.com/admin/api/2025-07/webhooks.json`, {
    headers: {
      'X-Shopify-Access-Token': process.env.ADMIN_API_ACCESS_TOKEN,
      'Content-Type': 'application/json',
    }
  });
  console.log('��� Registered webhooks:', res.data.webhooks);
  
   
