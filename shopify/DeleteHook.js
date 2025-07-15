import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();  

const res = await axios.get(process.env.SHOPIFY_LIST_HOOK,{
    headers: { 
        'X-Shopify-Access-Token': process.env.ADMIN_API_ACCESS_TOKEN
    } 
});
  
const webhooks = res.data.webhooks;
for (const webhook of webhooks) {
    if (webhook.address.includes('spactrumappback')) {
        await axios.delete(`${process.env.SHOPIFY_DELETE_HOOK}/${webhook.id}.json`,{
            headers: { 
                'X-Shopify-Access-Token': process.env.ADMIN_API_ACCESS_TOKEN 
            } 
        }
    );
      console.log(`Deleted incorrect webhook: ${webhook.address}`);
    }
}


