import axios from 'axios';
import dotenv from 'dotenv';
import Settings from '../models/Settings.js';
import { storeLog } from '../helpers/Common.js';
import Customers from '../models/Customers.js';
import connectDB from '../config/database.js';

dotenv.config();

export async function handleCustomerForSalesforce(customer) {
    await syncCustomerToSalesforce(customer, 'create');
}

export async function handleUpdateCustomerForSalesforce(customer) {
    await syncCustomerToSalesforce(customer, 'update');
}

async function syncCustomerToSalesforce(customer, action) {
    try {
        await connectDB();

        const settings = await Settings.findOne();
        const { sp_app_url, admin_api_access_token, sf_access_token } = settings;

        const shopifyCus = await axios.get(`${sp_app_url}/admin/api/2025-07/customers/${customer.id}.json`, {
            headers: {
                'X-Shopify-Access-Token': admin_api_access_token,
                'Content-Type': 'application/json',
            }
        });

        const cusInfo = shopifyCus.data.customer;
        const tags = cusInfo.tags?.split(',').map(tag => tag.trim()) || [];

        if (!tags.includes("New Trade Account Registration")) {
            storeLog("Tag mismatch: Skipping Salesforce sync.");
            return;
        }

        const leadPayload = {
            FirstName: cusInfo.first_name || "",
            LastName: cusInfo.last_name || "Shopify User",
            Email: cusInfo.email,
            Company: cusInfo.default_address?.company || "Individual",
            Phone: cusInfo.phone || "",
            Street: cusInfo.default_address?.address1 || "",
            City: cusInfo.default_address?.city || "",
            State: cusInfo.default_address?.province || "",
            PostalCode: cusInfo.default_address?.zip || "",
            Country: cusInfo.default_address?.country || "",
            LeadSource: "Shopify Registration"
        };

        let response;
        if (action === 'create') {
            response = await axios.post(process.env.SF_LEAD_GENERATE_URL, leadPayload, {
                headers: {
                    Authorization: `Bearer ${sf_access_token}`,
                    "Content-Type": "application/json"
                }
            });

            await Customers.create({
                shopify_cus_id: customer.id,
                shopify_request_body: JSON.stringify(customer),
                salesforce_lead_id: response.data.id,
                salesforce_lead_response_body: JSON.stringify(response.data),
                lead_first_name: leadPayload.FirstName,
                lead_last_name: leadPayload.LastName,
                lead_email: leadPayload.Email,
                lead_company: leadPayload.Company,
                lead_phone: leadPayload.Phone,
                lead_description: `Shopify ID: ${customer.id}`,
            });

            storeLog("✅ Salesforce Lead Created: " + response.data.id);
        } else if (action === 'update') {
            const dbCustomer = await Customers.findOne({ shopify_cus_id: customer.id });
            if (!dbCustomer) {
                storeLog("❌ Salesforce lead not found for update");
                return;
            }

            response = await axios.patch(`${process.env.SF_LEAD_GENERATE_URL}/${dbCustomer.salesforce_lead_id}`, leadPayload, {
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
                        lead_first_name: leadPayload.FirstName,
                        lead_last_name: leadPayload.LastName,
                        lead_email: leadPayload.Email,
                        lead_company: leadPayload.Company,
                        lead_phone: leadPayload.Phone,
                        lead_description: `Shopify ID: ${customer.id}`,
                    }
                }
            );

            storeLog("✅ Salesforce Lead Updated: " + dbCustomer.salesforce_lead_id);
        }
    } catch (error) {
        const { response, request, message } = error;

        if (response) {
            storeLog("❌ Salesforce API Error:");
            storeLog("Status: " + response.status);
            storeLog("Headers: " + JSON.stringify(response.headers));
            storeLog("Data: " + JSON.stringify(response.data));
        } else if (request) {
            storeLog("❌ No response received from Salesforce");
        } else {
            storeLog("❌ Unexpected Error: " + message);
        }

        storeLog("Full Error: " + JSON.stringify(error, Object.getOwnPropertyNames(error)));
    }
}


