import axios from "axios";
import { storeLog } from '../helpers/Common.js';

export async function handleCustomerForSalesforce(customer) {
    const customerId = customer.id;

    // Get shop domain (from webhook or config)
    const shopDomain = process.env.SHOPIFY_APP_URL;
    const accessToken = process.env.ADMIN_API_ACCESS_TOKEN;

    // Fetch full customer object
    const res = await axios.get(
      `https://${shopDomain}/admin/api/2025-07/customers/${customerId}.json`,
      {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        }
      }
    );

    const customer = res.data.customer;
    const tags = customer.tags?.split(',').map(tag => tag.trim()) || [];

    storeLog(`✅ Fetched customer ${customer.id} tags: ${tags.join(', ')}`);


    // Only process customers with specific tag
    if (!tags.includes("New Trade Account Registration")) {
        return;
    }

  const leadPayload = {
    FirstName: customer.first_name || "",
    LastName: customer.last_name || "Shopify User",
    Email: customer.email,
    Company: customer.default_address?.company || "Individual",
    Phone: customer.phone || "",
    Street: customer.default_address?.address1 || "",
    City: customer.default_address?.city || "",
    State: customer.default_address?.province || "",
    PostalCode: customer.default_address?.zip || "",
    Country: customer.default_address?.country || "",
    LeadSource: "Shopify Registration"
  };

  try {
    const response = await axios.post(
      `https://orgfarm-fa4a036c76-dev-ed.develop.my.salesforce.com/services/data/v64.0/sobjects/Lead`,
      leadPayload,
      {
        headers: {
          Authorization: `Bearer ${process.env.SALESFORCE_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    storeLog("Salesforce Lead Created:"+response.data.id);
} catch (error) {
    storeLog("Error creating Salesforce lead:"+error.response?.data || error.message);
  }
}
 