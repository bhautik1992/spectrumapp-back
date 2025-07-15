import axios from 'axios';
import dotenv from 'dotenv';
import Settings from '../models/Settings.js';

dotenv.config();

async function registerWebhooks() {
    try {

        const settings = await Settings.findOne();
        const { sp_app_name } = settings;

        console.log(sp_app_name);
        process.exit(0);
        
        
        const topics = ['customers/create', 'customers/update'];

        for(const topic of topics){
            const address = `${process.env.APP_URL}/webhooks/${topic.replace('/', '-')}`;

            await axios.post(`https://${sp_app_name}/admin/api/2025-07/webhooks.json`,{
                webhook: {
                    topic,
                    address,
                    format: 'json'
                }
            },{headers: {
                'X-Shopify-Access-Token': process.env.ADMIN_API_ACCESS_TOKEN,
                'Content-Type': 'application/json'
            }});

            console.log(`✅ Registered webhook: ${topic} → ${address}`);
        }
    } catch (err) {
        console.error('❌ Error:', err.response?.data || err.message);
    }
}

registerWebhooks();


