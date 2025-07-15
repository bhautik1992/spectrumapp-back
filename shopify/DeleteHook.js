import mongoose from 'mongoose';
import axios from 'axios';
import Settings from '../models/Settings.js';
import dotenv from 'dotenv';

dotenv.config();  

await mongoose.connect(process.env.MONGODB_URI);
const settings = await Settings.findOne();
const { admin_api_access_token } = settings;

const res = await axios.get(process.env.SHOPIFY_LIST_HOOK,{
    headers: { 
        'X-Shopify-Access-Token': admin_api_access_token
    } 
});
  
const webhooks = res.data.webhooks;
for (const webhook of webhooks) {
    if (webhook.address.includes('spactrumappback')) {
        await axios.delete(`${process.env.SHOPIFY_DELETE_HOOK}/${webhook.id}.json`,{
            headers: { 
                'X-Shopify-Access-Token': admin_api_access_token 
            } 
        }
    );
      console.log(`Deleted incorrect webhook: ${webhook.address}`);
    }
}

await mongoose.disconnect();


