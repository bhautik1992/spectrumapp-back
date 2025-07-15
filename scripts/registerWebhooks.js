import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import Settings from '../models/Settings.js';

dotenv.config();

async function registerWebhooks() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        const settings = await Settings.findOne();
        const { sp_app_name, admin_api_access_token } = settings;        
        
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
                'X-Shopify-Access-Token': admin_api_access_token,
                'Content-Type': 'application/json'
            }});

            console.log(`✅ Registered webhook: ${topic} → ${address}`);
        }

        await mongoose.disconnect();
    } catch (err) {
        console.error('❌ Error:', err.response?.data || err.message);
    }
}

registerWebhooks();


