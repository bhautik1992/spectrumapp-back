import axios from "axios";
import { storeLog } from '../helpers/Common.js';
import dotenv from 'dotenv';

dotenv.config();

export async function handleCustomerForSalesforce(customer) {
    try{
        const customerId  = customer.id;

	    const shopifyCus = await axios.get(`${process.env.SHOPIFY_APP_URL}/admin/api/2025-07/customers/${customerId}.json`,{
            headers: {
                'X-Shopify-Access-Token': process.env.ADMIN_API_ACCESS_TOKEN,
                'Content-Type': 'application/json',
            }
        });
        
        const cusInfo = shopifyCus.data.customer;
        const tags = cusInfo.tags?.split(',').map(tag => tag.trim()) || [];
        if (!tags.includes("New Trade Account Registration")) {
            return;
        }
        
        const leadPayload = {
            FirstName : customer.first_name || "",
            LastName  : customer.last_name || "Shopify User",
            Email     : customer.email,
            Company   : customer.default_address?.company || "Individual",
            Phone     : customer.phone || "",
            Street    : customer.default_address?.address1 || "",
            City      : customer.default_address?.city || "",
            State     : customer.default_address?.province || "",
            PostalCode: customer.default_address?.zip || "",
            Country   : customer.default_address?.country || "",
            LeadSource: "Shopify Registration"
        };
        
        const response = await axios.post(process.env.SF_LEAD_GENERATE_URL,leadPayload,{
            headers: {
                Authorization: `Bearer ${process.env.SF_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        storeLog("Salesforce Lead Created Successfully:"+response.data.id);
	} catch (error) {
        if (error.response) {
            storeLog("Shopify API Error:");
            storeLog("Status: " + error.response.status);
            storeLog("Headers: " + JSON.stringify(error.response.headers));
            storeLog("Data: " + JSON.stringify(error.response.data));
        } else if (error.request) {
            storeLog("No response received from Shopify");
            storeLog("Request: " + error.request);
        } else {
            storeLog("Unexpected Error: " + error.message);
        }

        storeLog("Full Error: " + JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }
}


