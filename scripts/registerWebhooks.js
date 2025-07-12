import axios from 'axios';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Shop from '../models/Shop.js'; // Adjust path as needed

dotenv.config();

async function registerWebhooks() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const shopData = await Shop.findOne({ shop: 'spectrum-one-hair.myshopify.com' }); // replace with your actual domain
    if (!shopData) throw new Error('Shop not found in DB');

    const { shop, accessToken } = shopData;

    console.log(shopData);
    
    const topics = ['customers/create', 'customers/update'];

    for (const topic of topics) {
      const address = `https://spactrumappback.hailysoft.com/webhooks/${topic.replace('/', '-')}`;

      const res = await axios.post(
        `https://${shop}/admin/api/2025-07/webhooks.json`,
        {
          webhook: {
            topic,
            address,
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

      console.log(`✅ Registered webhook: ${topic} → ${address}`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Error:', err.response?.data || err.message);
  }
}

registerWebhooks();
 