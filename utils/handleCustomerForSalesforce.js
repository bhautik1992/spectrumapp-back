import mongoose from 'mongoose';
import axios from "axios";
import dotenv from 'dotenv';
import Settings from '../models/Settings.js';
import { storeLog } from '../helpers/Common.js';
import Customers from '../models/Customers.js';

dotenv.config();

export async function handleCustomerForSalesforce(customer) {
    try{
        await mongoose.connect(process.env.MONGODB_URI);

        const settings = await Settings.findOne();
        const { sp_app_url, admin_api_access_token, sf_access_token } = settings;        
        
        const customerId  = customer.id;

	    const shopifyCus = await axios.get(`${sp_app_url}/admin/api/2025-07/customers/${customerId}.json`,{
            headers: {
                'X-Shopify-Access-Token': admin_api_access_token,
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
                Authorization: `Bearer ${sf_access_token}`,
                "Content-Type": "application/json"
            }
        });

        await Customers.create([{
            shopify_cus_id               : customer.id,
            shopify_request_body         : JSON.stringify(customer),
            salesforce_lead_id           : response.data.id,
            salesforce_lead_response_body: JSON.stringify(response.data),
            lead_first_name              : customer.first_name || "",
            lead_last_name               : customer.last_name || "Shopify User",
            lead_email                   : customer.email,
            lead_company                 : customer.default_address?.company || "Individual",
            lead_phone                   : customer.phone || "",
            lead_description             : `Shopify ID: ${customer.id}`,
        }]);

        storeLog("Salesforce Lead Created Successfully:"+response.data.id);
        await mongoose.disconnect();
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

export async function handleUpdateCustomerForSalesforce(customer) {
    storeLog(customer);

    try{
        await mongoose.connect(process.env.MONGODB_URI);

        const settings = await Settings.findOne();
        const { sp_app_url, admin_api_access_token, sf_access_token } = settings;        
        
        const customerId  = customer.id;

	    const shopifyCus = await axios.get(`${sp_app_url}/admin/api/2025-07/customers/${customerId}.json`,{
            headers: {
                'X-Shopify-Access-Token': admin_api_access_token,
                'Content-Type': 'application/json',
            }
        });
        
        const cusInfo = shopifyCus.data.customer;
        const tags = cusInfo.tags?.split(',').map(tag => tag.trim()) || [];
        if (!tags.includes("New Trade Account Registration")) {
            return;
        }
        
        // 
        const dbCustomer = await Customers.findOne({'shopify_cus_id':customer.id});
        // if(!dbCustomer) {
        //     return errorResponse(res, process.env.NO_RECORD, 404);
        // }
        const sfLeadId = dbCustomer.salesforce_lead_id;
        // 

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

        const response = await axios.post(`${process.env.SF_LEAD_GENERATE_URL}/${sfLeadId}`,leadPayload,{
            headers: {
                Authorization: `Bearer ${sf_access_token}`,
                "Content-Type": "application/json"
            }
        });

        await Customers.updateOne(
            { shopify_cus_id: customer.id },
            {
                $set: {
                    shopify_request_body: JSON.stringify(customer),
                    salesforce_lead_response_body: JSON.stringify(response.data),
                    lead_first_name: customer.first_name || "",
                    lead_last_name: customer.last_name || "Shopify User",
                    lead_email: customer.email,
                    lead_company: customer.default_address?.company || "Individual",
                    lead_phone: customer.phone || "",
                    lead_description: `Shopify ID: ${customer.id}`,
                },
            }
        );

        storeLog("Salesforce Lead Updated Successfully:"+response.data.id);
        await mongoose.disconnect();
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


