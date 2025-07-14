import axios from "axios";
import { storeLog } from '../helpers/Common.js';

export async function handleCustomerForSalesforce(customer) {
    const customerId  = customer.id;
    const shopDomain  = process.env.SHOPIFY_APP_URL;
    const accessToken = process.env.ADMIN_API_ACCESS_TOKEN;

    try{
	    const res = await axios.get(`${shopDomain}/admin/api/2025-07/customers/${customerId}.json`,{
            headers: {
                'X-Shopify-Access-Token': accessToken,
                'Content-Type': 'application/json',
            }
        });
        
        const spcustomer = res.data.customer;
        const tags = spcustomer.tags?.split(',').map(tag => tag.trim()) || [];
        
        // Only process customers with specific tag
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
        		
        const response = await axios.post(`https://orgfarm-fa4a036c76-dev-ed.develop.my.salesforce.com/services/data/v64.0/sobjects/Lead`,leadPayload,{
            headers: {
                Authorization: `Bearer ${process.env.SALESFORCE_ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        storeLog("Salesforce Lead Created:"+response.data.id);
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


