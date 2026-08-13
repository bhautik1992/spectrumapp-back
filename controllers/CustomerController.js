import Customers from "../models/Customers.js";
import Settings from "../models/Settings.js";
import Diary from "../models/Diary.js";
import Events from "../models/Events.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import { leadStatusLabels, BIG_SPENDER_SEGMENT_IDS, ABANDONED_CHECKOUT_SEGMENT_ID, ACTIVE_TRADE_ACCOUNTS_SEGMENT_ID, TRADE_ACCOUNT_NEVER_ORDERED_SEGMENT_ID, TRADE_ACCOUNT_ONCE_ORDERED_SEGMENT_ID } from '../config/constants.js';
import { storeLog } from "../helpers/Common.js";
import axios from 'axios';
import { engagementChecklist } from '../config/constants.js';
import jsforce from 'jsforce';

const BIG_SPENDER_SEGMENT_MONTHS = {
    [BIG_SPENDER_SEGMENT_IDS[0]]: 3,
    [BIG_SPENDER_SEGMENT_IDS[1]]: 6,
    [BIG_SPENDER_SEGMENT_IDS[2]]: 12,
    [BIG_SPENDER_SEGMENT_IDS[3]]: 12,
};

const parseLinkHeaderNextPageInfo = (linkHeader) => {
    if (!linkHeader) return null;
    const nextMatch = linkHeader.match(/<[^>]+[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/i);
    return nextMatch ? nextMatch[1] : null;
};

const parseLinkHeaderNextUrl = (linkHeader) => {
    if (!linkHeader) return null;
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/i);
    return nextMatch ? nextMatch[1] : null;
};

const getWindowStartIso = (months) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setMonth(date.getMonth() - months);
    return date.toISOString();
};

const normalizeCustomerGidFromMember = (memberId) => {
    if (!memberId || typeof memberId !== 'string') return null;
    if (memberId.includes('/Customer/')) return memberId;
    if (memberId.includes('/CustomerSegmentMember/')) {
        return memberId.replace('/CustomerSegmentMember/', '/Customer/');
    }
    return null;
};

const extractNumericCustomerId = (customerGid) => {
    if (!customerGid || typeof customerGid !== 'string') return null;
    const match = customerGid.match(/\/(\d+)$/);
    return match ? match[1] : null;
};

const SEGMENT_WINDOW_CACHE_TTL_MS = 5 * 60 * 1000;
const segmentWindowMembersCache = new Map();

const getDefaultWindowMetrics = () => ({
    amount: 0,
    currencyCode: null,
    orderCount: 0,
});

const getDefaultActiveTradeAccountsDateRange = () => {
    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(today.getMonth() - 1);

    return {
        fromDate: formatDateOnlyString(lastMonth),
        toDate: formatDateOnlyString(today),
    };
};

const formatDateOnlyString = (value) => {
    if (!value) return null;

    if (typeof value === 'string') {
        const trimmed = String(value).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

        const date = new Date(trimmed);
        if (Number.isNaN(date.getTime())) return null;

        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    if (value instanceof Date) {
        const year = value.getUTCFullYear();
        const month = String(value.getUTCMonth() + 1).padStart(2, '0');
        const day = String(value.getUTCDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    return null;
};

const toDateOnlyString = (value) => formatDateOnlyString(value);

const isWithinInclusiveDateRange = (value, fromDate, toDate) => {
    const dateValue = toDateOnlyString(value);
    if (!dateValue) return false;

    return dateValue >= fromDate && dateValue <= toDate;
};

const calculateWindowMetricsForCustomers = async ({ customerIds, months, shopUrl, token }) => {
    const targetCustomerIds = new Set((customerIds || []).map((id) => String(id)).filter(Boolean));
    const metricsByCustomerId = new Map();
    if (!targetCustomerIds.size) return metricsByCustomerId;

    const createdAtMin = encodeURIComponent(getWindowStartIso(months));
    let nextUrl = `${shopUrl}/admin/api/2025-07/orders.json?status=any&limit=250&fields=id,total_price,currency,customer&created_at_min=${createdAtMin}`;

    while (nextUrl) {

        const response = await axios.get(nextUrl, {
            headers: {
                'X-Shopify-Access-Token': token,
                'Content-Type': 'application/json',
            }
        });

        const orders = response.data?.orders || [];
        orders.forEach((order) => {
            const customerId = order?.customer?.id ? String(order.customer.id) : null;
            if (!customerId || !targetCustomerIds.has(customerId)) return;

            const current = metricsByCustomerId.get(customerId) || getDefaultWindowMetrics();
            const orderAmount = parseFloat(order?.total_price || 0);
            if (!Number.isNaN(orderAmount)) {
                current.amount += orderAmount;
            }
            current.orderCount += 1;
            if (!current.currencyCode && order?.currency) {
                current.currencyCode = order.currency;
            }

            metricsByCustomerId.set(customerId, current);
        });

        nextUrl = parseLinkHeaderNextUrl(response.headers?.link);
    }

    return metricsByCustomerId;
};

const fetchAbandonedCheckoutDetailsForEmails = async ({ emails, shopUrl, token }) => {
    const targetEmails = [...new Set((emails || []).map((email) => String(email || '').trim().toLowerCase()).filter(Boolean))];
    const abandonedCheckoutDetailsByEmail = new Map();

    if (!targetEmails.length) {
        return abandonedCheckoutDetailsByEmail;
    }

    const chunkSize = 20;

    for (let i = 0; i < targetEmails.length; i += chunkSize) {
        const chunk = targetEmails.slice(i, i + chunkSize);
        const searchQuery = chunk.map((email) => `"${email.replace(/"/g, '\\"')}"`).join(' OR ');
        const graphqlQuery = `query {
            abandonedCheckouts(first: 250, query: "${searchQuery.replace(/"/g, '\\"')}", sortKey: CREATED_AT, reverse: true) {
                nodes {
                    createdAt
                    lineItems(first: 50) {
                        edges {
                            node {
                                title
                                variantTitle
                            }
                        }
                    }
                    customer {
                        email
                    }
                }
            }
        }`;

        const response = await axios.post(
            `${shopUrl}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,
            { query: graphqlQuery },
            {
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json',
                }
            }
        );

        const abandonedCheckouts = response.data?.data?.abandonedCheckouts?.nodes || [];
        abandonedCheckouts.forEach((checkout) => {
            const email = String(checkout?.customer?.email || '').trim().toLowerCase();
            if (!email || abandonedCheckoutDetailsByEmail.has(email)) return;

            const lineItemNames = (checkout?.lineItems?.edges || [])
                .map((lineEdge) => {
                    const item = lineEdge?.node;
                    if (!item?.title) return null;
                    return item?.variantTitle ? `${item.title} / ${item.variantTitle}` : item.title;
                })
                .filter(Boolean);

            abandonedCheckoutDetailsByEmail.set(email, {
                abandoned_checkout_date: checkout?.createdAt || null,
                abandoned_checkout_products: lineItemNames.length ? [...new Set(lineItemNames)].join(', ') : null,
            });
        });
    }

    return abandonedCheckoutDetailsByEmail;
};

export const edit = async (req, res) => {
    try{
        const { id } = req.params;
        
        const customer = await Customers.findById(id)
        .populate({
            path: 'diaries',
            select: 'message sender_id createdAt',
            options: { sort: { createdAt: -1 } },
            populate: {
                path: 'sender_id',
                select: 'full_name color_code'
            }
        })
        .populate({
            path: 'events',
            select: 'title date url location description',
            options: { sort: { date: 1 } },
            populate: {
                path: 'user_id',
                select: 'full_name color_code'
            }
        });

        // Fetch real-time Shopify data
        const settings = await Settings.findOne();
        const { sp_app_url, admin_api_access_token } = settings;

        try {
            const shopifyResponse = await axios.get(
                `${sp_app_url}/admin/api/2025-07/customers/${customer.shopify_cus_id}.json`,
                {
                    headers: {
                        'X-Shopify-Access-Token': admin_api_access_token,
                        'Content-Type': 'application/json',
                    }
                }
            );

            const shopifyData = shopifyResponse.data.customer;

            // Fetch last order date if last_order_id exists
            let lastOrderDate = null;
            if (shopifyData.last_order_id) {
                try {
                    const orderResponse = await axios.get(
                        `${sp_app_url}/admin/api/2025-07/orders/${shopifyData.last_order_id}.json`,
                        {
                            headers: {
                                'X-Shopify-Access-Token': admin_api_access_token,
                                'Content-Type': 'application/json',
                            }
                        }
                    );
                    lastOrderDate = orderResponse.data.order.created_at;
                } catch (orderError) {
                    storeLog(`Error fetching order ${shopifyData.last_order_id}: ${orderError.message}`);
                }
            }

            // Enrich customer data with Shopify info
            const enrichedCustomer = {
                ...customer.toObject(),
                customer_added_date: shopifyData.created_at,
                amount_spent: shopifyData.total_spent,
                orders_count: shopifyData.orders_count,
                last_order_date: lastOrderDate
            };

            return successResponse(res, enrichedCustomer);
        } catch (shopifyError) {
            storeLog(`Error fetching Shopify data for customer ${customer.shopify_cus_id}: ${shopifyError.message}`);
            // Return customer without real-time data if API call fails
            return successResponse(res, customer);
        }
    } catch (error) {
        // console.log(error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}

export const update = async (req, res) => {
    try{
        const { shopify_cus_id, lead_status } = req.body;
        
        const customer = await Customers.findOne({'shopify_cus_id':shopify_cus_id});
        if(!customer) {
            return errorResponse(res, process.env.NO_RECORD, 404);
        }
        
        await Customers.updateOne(
            { shopify_cus_id: shopify_cus_id },
            {
                $set: {
                    lead_status: lead_status
                },
            }
        );

        // Engagement Checklist Step
        if(req.body?.engagement_type || req.body?.engagement_note){  
            let setData = {};          
            if(req.body.engagement_type){
                setData.engagement_type = req.body.engagement_type;
            }
            
            if(req.body.engagement_note){
                setData.engagement_note = req.body.engagement_note;
            }

            await Customers.updateOne(
                { shopify_cus_id },
                { $set: setData },
                { upsert: true }
            );
        }
        
        // Sales & Admin Diary Step
        if(req.body?.diary){
            await Diary.create({
                sender_id: req.body.loggedin_user_id,
                customer_id: customer._id,
                message: req.body.diary,
            });
        }

        // Event Planning Step 
        if(req.body?.title){
            await Events.create({
                user_id    : req.body.loggedin_user_id,
                customer_id: customer._id,
                title      : req.body.title,
                date       : req.body.date,
                url        : req.body.url || undefined,
                location   : req.body.location || undefined,
                description: req.body.description || undefined,
            });
        }

        return successResponse(res, {}, "Lead Status Updated Successfully");
    }catch(error){
        // console.log(error?.response?.data || error.message);
        const errorMessage = (error?.response?.data[0]?.errorCode == 'DUPLICATES_DETECTED')?'Failes to create lead, errorCode: DUPLICATES_DETECTED':'Failed to create lead'

        return res.status(500).json({
            success: false,
            message: errorMessage,
            error: error?.response?.data || error.message
        });
    }
}

export const _update = async (req, res) => {
    try{
        const { shopify_cus_id, lead_status } = req.body;
        
        const settings = await Settings.findOne();
        const { sf_access_token:token, sf_instance_url:url } = settings;

        const customer = await Customers.findOne({'shopify_cus_id':shopify_cus_id});
        if(!customer) {
            return errorResponse(res, process.env.NO_RECORD, 404);
        }
        
        const sfLeadId = customer.salesforce_lead_id;
        const sfNoteId = customer.salesforce_note_id;

        // Customer Details Step
        const payload  = {
            Status : leadStatusLabels[lead_status],
        };
    
        const response = await axios.patch(`${url}${process.env.SF_LEAD_GENERATE}/${sfLeadId}`,payload,{
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        await Customers.updateOne(
            { shopify_cus_id: shopify_cus_id },
            {
                $set: {
                    lead_status: lead_status
                },
            }
        );

        // Engagement Checklist Step
        if(req.body?.engagement_type || req.body?.engagement_note){
            const engagementText = req.body.engagement_type && engagementChecklist[req.body.engagement_type]
            ? engagementChecklist[req.body.engagement_type]
            : '';

            const checklistNotes = ' | '+req.body.engagement_note || '';

            const notesPayload = {
                Title: "Engagement Checklist",
                Body: `${engagementText || ''}${checklistNotes || ''}`,
                ...(sfNoteId ? {} : { ParentId: sfLeadId }) // Only include ParentId if creating a new note
            };

            const endpoint = sfNoteId ? `${url}${process.env.SF_LEAD_NOTE}/${sfNoteId}` : `${url}${process.env.SF_LEAD_NOTE}`;
            const method = sfNoteId ? 'patch' : 'post';

            const noteResponse = await axios({
                method,
                url: endpoint,
                data: notesPayload,
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            // Update Record in database
            const setData = {
                salesforce_note_id: noteResponse.data.id,
            };

            if (!sfNoteId) {
                setData.salesforce_note_response_body = JSON.stringify(noteResponse.data);
            }
            
            if(req.body.engagement_type){
                setData.engagement_type = req.body.engagement_type;
            }
            
            if(req.body.engagement_note){
                setData.engagement_note = req.body.engagement_note;
            }

            await Customers.updateOne(
                { shopify_cus_id },
                { $set: setData },
                { upsert: true }
            );

            // storeLog('Note Reponse');
            // storeLog(noteResponse.data);
        }
        
        // Sales & Admin Diary Step
        if(req.body?.diary){
            const chatterPayload = {
                feedElementType: 'FeedItem',
                subjectId: sfLeadId,
                body: {
                    messageSegments: [{ 
                        type: 'Text', 
                        text: req.body.diary
                    }]
                }
            }

            const chatterResponse = await axios.post(`${url}${process.env.SF_LEAD_CHATTER}`, chatterPayload, {
                headers: { 
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json' 
                }
            });
            
            await Diary.create({
                sender_id: req.body.loggedin_user_id,
                customer_id: customer._id,
                message: req.body.diary,
                response_body: JSON.stringify(chatterResponse.data)
            });

            // storeLog('Chatter Reponse');
            // storeLog(chatterResponse.data);
        }

        // Event Planning Step 
        if(req.body?.title){
            await Events.create({
                user_id    : req.body.loggedin_user_id,
                customer_id: customer._id,
                title      : req.body.title,
                date       : req.body.date,
                url        : req.body.url || undefined,
                location   : req.body.location || undefined,
                description: req.body.description || undefined,
            });
        }

        if(lead_status === 3){
            await convertLeadToContact(settings,shopify_cus_id,sfLeadId);
            await convertCustomerToCompany(settings,customer);
        }

        // storeLog('Lead Response');
        // storeLog(response.data);
        return successResponse(res, response.data.id, "Lead Status Updated Successfully");
    }catch(error){
        storeLog(error?.response?.data || error.message);
        const errorMessage = (error?.response?.data[0]?.errorCode == 'DUPLICATES_DETECTED')?'Failes to create lead, errorCode: DUPLICATES_DETECTED':'Failed to create lead'

        return res.status(500).json({
            success: false,
            message: errorMessage,
            error: error?.response?.data || error.message
        });
    }
}

export const convertLeadToContact = async (settings,shopify_cus_id,sfLeadId) => {
    const { sf_username:username, sf_security_token:sstoken }  = settings ;

    const conn = new jsforce.Connection({loginUrl: process.env.SF_LOGIN_URL});
    await conn.login(username,process.env.SF_PSW + sstoken);
    
    const payload = {
        leadId: sfLeadId,
        convertedStatus: leadStatusLabels[3],
        doNotCreateOpportunity: true
    };

    const result = await conn.soap.convertLead(payload);
    
    if(result.success){
        await Customers.updateOne(
            { shopify_cus_id: shopify_cus_id },
            {
                $set: {
                    salesforce_contact_id: result.contactId,
                    salesforce_account_id: result.accountId,
                    // salesforce_opportunity_id: result.opportunityId,
                    is_lead_converted: 1,
                },
            }
        );
    }
    
    return result;
}

export const convertCustomerToCompany = async (settings, customer) => {
    const { sp_app_url: url, admin_api_access_token: token } = settings;
    const companyName   = `${customer.lead_first_name || ''} ${customer.lead_last_name || ''}`.trim() || customer.lead_email;
    const customerId    = `gid://shopify/Customer/${customer.shopify_cus_id}`;

    const headers = {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
    };

    // STEP 1: Create the company
    const mutationCreate = `mutation CreateCompany($input: CompanyCreateInput!) {
        companyCreate(input: $input) {
            company {
                id
                name
            }
            userErrors {
                field
                message
            }
        }
    }`;

    const createRes = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,
        {
            query: mutationCreate,
            variables: {
                input: {
                    company: {
                        name: companyName,
                    },
                },
            },
        },
        { headers }
    );

    const company = createRes.data?.data?.companyCreate?.company;
    if(!company?.id){
        throw new Error(`Failed to create company: ${JSON.stringify(
            createRes.data?.data?.companyCreate?.userErrors || createRes.data?.errors
        )}`);
    }

    await Customers.updateOne(
        { shopify_cus_id: customer.shopify_cus_id },
        {
            $set: {
                shopify_company_response:JSON.stringify(createRes.data),
                shopify_company_id:company.id,
            },
        }
    );

    // STEP 2: Assign the customer as a company contact
    const mutationAssign = `mutation AssignCustomer($companyId: ID!, $customerId: ID!) {
        companyAssignCustomerAsContact(companyId: $companyId, customerId: $customerId) {
            companyContact {
                id
                customer { id email }
            }
            userErrors {
                field
                message
            }
        }
    }`;

    const assignRes = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,{
            query: mutationAssign,
            variables: { companyId: company.id, customerId },
        },
        { headers }
    );

    const assignResult = assignRes.data?.data?.companyAssignCustomerAsContact;
    if (!assignResult?.companyContact?.id) {
        throw new Error(
            `Failed to assign customer as company contact: ${JSON.stringify(
                assignResult?.userErrors || assignRes.data?.errors
            )}`
        );
    }
    
    const companyContactId = assignResult.companyContact.id;
    await Customers.updateOne(
        { shopify_cus_id: customer.shopify_cus_id },
        {
            $set: {
                shopify_company_contact_response:JSON.stringify(assignRes.data),
                shopify_company_contact_id:companyContactId,
            },
        }
    );

    // // STEP 3: Approve ordering for the assigned contact
    // const queryLocations = `{locations(first: 10) {
    //     edges {
    //         node {
    //             id
    //             name
    //         }
    //     }
    // }}`;

    // const locRes = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,
    //     { 
    //         query: queryLocations 
    //     },
    //     { headers }
    // );

    // console.log("Locations Response:", JSON.stringify(locRes.data, null, 2));

    // const locations = locRes.data?.data?.locations?.edges || [];
    // if (!locations.length) {
    //     throw new Error("No locations found in your shop.");
    // }

    // const locationId = locations[0].node.id;
    // console.log("Using locationId:", locationId);

    // const mutationApproveOrdering = `mutation AssignOrderingPermission($companyContactId: ID!, $locationId: ID!) {
    //     companyContactAssignRole(
    //         companyContactId: $companyContactId
    //         companyContactRole: {
    //             ordering: { locationId: $locationId, permitted: true }
    //         }
    //     ) {
    //         companyContact {
    //             id
    //             customer {
    //                 id
    //                 email
    //             }
    //             roles {
    //                 ordering {
    //                     location {
    //                         id
    //                         name
    //                     }
    //                     permitted
    //                 }
    //             }
    //         }
    //         userErrors {
    //             field
    //             message
    //         }
    //     }
    // }`;
    
    // const approveRes = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,
    //     {
    //         query: mutationApproveOrdering,
    //         variables: { companyContactId, locationId },
    //     },
    //     { headers }
    // );

    // console.log("Approve Ordering Response:",JSON.stringify(approveRes.data, null, 2));

    // const approveResult = approveRes.data?.data?.companyContactAssignRole?.companyContact;
    // if (!approveResult?.roles?.ordering?.length) {
    //     throw new Error(
    //         `Failed to approve ordering: ${JSON.stringify(
    //             approveRes.data?.data?.companyContactAssignRole?.userErrors ||
    //                 approveRes.data?.errors
    //         )}`
    //     );
    // }

    // console.log("Ordering Approved ✅ for contact:", approveResult.customer.email);

    return true;
}

export const segmentList = async (req, res) => {
    try{
        const settings = await Settings.findOne();
        const { sp_app_url:url, admin_api_access_token:token } = settings;
        
        const query = `
            query {
                segments(first: 250) {
                    edges {
                        cursor
                        node {
                            id
                            name
                            query
                        }
                    }
                    pageInfo {
                        hasNextPage
                        hasPreviousPage
                    }
                }
            }
        `;

        const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,JSON.stringify({query}),{
            headers: {
                'X-Shopify-Access-Token': token,
                'Content-Type': 'application/json'
            }
        });

        const edges    = response.data?.data?.segments?.edges || [];
        const segments = edges.map(edge => edge.node);
        const pageInfo = response.data.data?.segments?.pageInfo || '';

        return successResponse(res, {segments, pageInfo});
    } catch (error) {
        // console.log(error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}

// const getSegmentQuery = async ({ id, url, token }) => {
//     const query = {
//         query: `query {
//             segment(id: "${id}") {
//                 id
//                 name
//                 query
//             }
//         }`
//     };

//     const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,query,
//         {
//             headers: {
//                 'X-Shopify-Access-Token': token,
//                 'Content-Type': 'application/json'
//             }
//         }
//     );

//     const segment = response.data?.data?.segment;
//     if (!segment) {
//         return errorResponse(res, 'Segment not found', 404);
//     }

//     return segment.query;
// }

// export const segmentRecords = async (req, res) => {
//     try {
//         const { id, perPage, before, after, isNext, fromDate, toDate } = req.query;
//         let cursorClause = `first: ${perPage}`; 
        
//         if(isNext !== undefined){
//             if(isNext === 'true'){
//                 cursorClause = ` first: ${perPage}, after: "${after}"`;
//             }else{
//                 cursorClause = ` last: ${perPage}, before: "${before}"`;
//             }
//         }

//         const settings = await Settings.findOne();
//         const { sp_app_url: url, admin_api_access_token: token } = settings;
  
//         const segmentQuery = await getSegmentQuery({id, url, token});
//         console.log(segmentQuery);
        
//         let customerQuery = '';
//         const match = segmentQuery.match(
//             /customer_tags\s+CONTAINS\s+'([^']+)'/i
//         );

//         if (match) {
//             customerQuery = `tag:'${match[1]}'`;
//         } else {
//             return errorResponse(res, 'Segment is not tag based', 400);
//         }
        
//         if(fromDate != '' && toDate != ''){
//             customerQuery = `${customerQuery} AND customer_date:>='${fromDate}' AND customer_date:<='${toDate}'`;
//         }

//         const query = {
//             query: `
//                 query {
//                     customers(
//                         ${cursorClause},
//                         query: "${customerQuery.replace(/"/g, '\\"')}",
//                         sortKey: UPDATED_AT,
//                         reverse: true
//                     ) {
//                         edges {
//                             cursor
//                             node {
//                                 id
//                                 displayName
//                                 defaultEmailAddress{
//                                     emailAddress
//                                     marketingState
//                                 }
//                                 defaultAddress {
//                                     address1
//                                     city
//                                     province
//                                     country
//                                     zip
//                                 }
//                                 amountSpent{
//                                     amount
//                                     currencyCode
//                                 }
//                                 defaultPhoneNumber{
//                                     phoneNumber
//                                 }
//                                 numberOfOrders
//                                 createdAt
//                                 updatedAt
//                             }
//                         }
//                         pageInfo {
//                             hasNextPage
//                             startCursor
//                             endCursor
//                             hasPreviousPage
//                         }
//                     }
//                 }
//             `
//         };
          
//         const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,query,{
//             headers: {
//                 'X-Shopify-Access-Token': token,
//                 'Content-Type': 'application/json'
//             }
//         });

//         const members = response.data?.data?.customers?.edges || [];
//         const pageInfo = response.data?.data?.customers?.pageInfo || {};

//         return successResponse(res, { members, pageInfo, totalCount:500 });
//     } catch (error) {
//         // console.log( error.response?.data || error.message);
//         return errorResponse(res, process.env.ERROR_MSG, 500);
//     }
// };

export const segmentRecords = async (req, res) => {
    try {
        const { id, perPage, before, after, isNext, search = '', fromDate = '', toDate = '' } = req.query;
        const spenderWindowMonths = BIG_SPENDER_SEGMENT_MONTHS[id] || null;
        const sortClause = spenderWindowMonths
            ? `sortKey: "amount_spent", reverse: true`
            : `sortKey: "updated_at", reverse: true`;
        const normalizedSearch = String(search || '').trim().toLowerCase();


        const resolveCursorClause = ({ pageSize, direction, afterCursor, beforeCursor }) => {
            if (direction === 'next') {
                return ` first: ${pageSize}, after: "${afterCursor}"`;
            }

            if (direction === 'prev') {
                return ` last: ${pageSize}, before: "${beforeCursor}"`;
            }

            return `first: ${pageSize}`;
        };

        const pageSize = parseInt(perPage, 10) || 10;
        const requestedDirection = isNext === undefined ? 'first' : (isNext === 'true' ? 'next' : 'prev');
        const cursorClause = resolveCursorClause({
            pageSize,
            direction: requestedDirection,
            afterCursor: after,
            beforeCursor: before,
        });

        const settings = await Settings.findOne();
        const { sp_app_url: url, admin_api_access_token: token } = settings;
  
        const baseQuery = (cursor) => ({
            query: `query {
                customerSegmentMembers(segmentId: "${id}", ${sortClause}, ${cursor}) {
                    edges {
                        cursor
                        node {
                            id
                            displayName
                            defaultEmailAddress{
                                emailAddress
                                marketingState
                            }
                            defaultAddress {
                                address1
                                city
                                province
                                country
                                zip
                            }
                            amountSpent{
                                amount
                                currencyCode
                            }
                            defaultPhoneNumber{
                                phoneNumber
                            }
                            numberOfOrders
                            lastOrderId
                        }
                    }
                    pageInfo {
                        hasNextPage
                        startCursor
                        endCursor
                        hasPreviousPage
                    }
                    totalCount
                }
            }`
        });

        const fetchSegmentPage = async (cursor) => {
            const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, baseQuery(cursor), {
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json'
                }
            });

            return {
                members: response.data?.data?.customerSegmentMembers?.edges || [],
                pageInfo: response.data?.data?.customerSegmentMembers?.pageInfo || {},
                totalCount: response.data?.data?.customerSegmentMembers?.totalCount || 0,
            };
        };

        const getNormalizedCustomerIdentity = (edge) => {
            const displayName = String(edge?.node?.displayName || '').toLowerCase();
            const emailAddress = String(edge?.node?.defaultEmailAddress?.emailAddress || '').toLowerCase();
            return { displayName, emailAddress };
        };

        const matchesSearch = (edge) => {
            if (!normalizedSearch) return true;

            const { displayName, emailAddress } = getNormalizedCustomerIdentity(edge);
            return displayName.includes(normalizedSearch) || emailAddress.includes(normalizedSearch);
        };

        const fetchAllMembers = async () => {
            const allMembers = [];
            let hasNextPage = true;
            let nextCursor = null;

            while (hasNextPage) {
                const cursor = nextCursor
                    ? resolveCursorClause({ pageSize: 250, direction: 'next', afterCursor: nextCursor })
                    : resolveCursorClause({ pageSize: 250, direction: 'first' });

                const page = await fetchSegmentPage(cursor);
                allMembers.push(...page.members);
                hasNextPage = !!page.pageInfo?.hasNextPage;
                nextCursor = page.pageInfo?.endCursor || null;
            }

            return allMembers;
        };

        const TRADE_ACCOUNT_SEGMENTS = new Set([
            ACTIVE_TRADE_ACCOUNTS_SEGMENT_ID,
            TRADE_ACCOUNT_NEVER_ORDERED_SEGMENT_ID,
            TRADE_ACCOUNT_ONCE_ORDERED_SEGMENT_ID,
        ]);

        if (TRADE_ACCOUNT_SEGMENTS.has(id)) {
            const resolvedDateRange = {
                ...(fromDate && toDate ? { fromDate, toDate } : getDefaultActiveTradeAccountsDateRange()),
            };

            const rawMembers = await fetchAllMembers();
            const members = normalizedSearch
                ? rawMembers.filter(matchesSearch)
                : rawMembers;

            const customerIds = [...new Set(
                members
                    .map((edge) => normalizeCustomerGidFromMember(edge?.node?.id))
                    .filter(Boolean)
            )];

            const createdAtByCustomerId = new Map();

            for (let i = 0; i < customerIds.length; i += 250) {
                const chunk = customerIds.slice(i, i + 250);

                const customerNodesQuery = {
                    query: `query {
                        nodes(ids: ${JSON.stringify(chunk)}) {
                            ... on Customer {
                                id
                                createdAt
                            }
                        }
                    }`
                };

                const customerNodesResponse = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, customerNodesQuery, {
                    headers: {
                        'X-Shopify-Access-Token': token,
                        'Content-Type': 'application/json'
                    }
                });

                const nodes = customerNodesResponse.data?.data?.nodes || [];
                nodes.forEach((node) => {
                    if (node?.id && node?.createdAt) {
                        createdAtByCustomerId.set(node.id, node.createdAt);
                    }
                });
            }

            const membersWithCreatedAt = members.map((edge) => {
                const customerId = normalizeCustomerGidFromMember(edge?.node?.id);
                return {
                    ...edge,
                    node: {
                        ...edge.node,
                        createdAt: customerId ? (createdAtByCustomerId.get(customerId) || null) : null,
                    }
                };
            });

            const orderIds = [...new Set(
                membersWithCreatedAt
                    .map((edge) => edge?.node?.lastOrderId)
                    .filter(Boolean)
            )];

            const orderDetailsById = new Map();

            for (let i = 0; i < orderIds.length; i += 250) {
                const chunk = orderIds.slice(i, i + 250);

                const orderNodesQuery = {
                    query: `query {
                        nodes(ids: ${JSON.stringify(chunk)}) {
                            ... on Order {
                                id
                                createdAt
                                lineItems(first: 50) {
                                    edges {
                                        node {
                                            name
                                            title
                                            variantTitle
                                        }
                                    }
                                }
                            }
                        }
                    }`
                };

                const orderNodesResponse = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, orderNodesQuery, {
                    headers: {
                        'X-Shopify-Access-Token': token,
                        'Content-Type': 'application/json'
                    }
                });

                const orderNodes = orderNodesResponse.data?.data?.nodes || [];
                orderNodes.forEach((orderNode) => {
                    if (!orderNode?.id) return;

                    const lineItemNames = (orderNode?.lineItems?.edges || [])
                        .map((lineEdge) => {
                            const item = lineEdge?.node;
                            if (!item) return null;
                            if (item?.name) return item.name;
                            if (item?.title) {
                                return `${item.title}${item?.variantTitle ? ` / ${item.variantTitle}` : ''}`;
                            }
                            return null;
                        })
                        .filter(Boolean);

                    const uniqueLineItemNames = [...new Set(lineItemNames)];
                    const purchasedWhat = uniqueLineItemNames.length ? uniqueLineItemNames.join(', ') : null;

                    orderDetailsById.set(orderNode.id, {
                        createdAt: orderNode?.createdAt || null,
                        purchasedWhat: purchasedWhat || null,
                    });
                });
            }

            const membersEnriched = membersWithCreatedAt.map((edge) => {
                const orderId = edge?.node?.lastOrderId;
                const orderDetails = orderId ? orderDetailsById.get(orderId) : null;

                return {
                    ...edge,
                    node: {
                        ...edge.node,
                        lastPurchasedAt: orderDetails?.createdAt || null,
                        purchasedWhat: orderDetails?.purchasedWhat || null,
                    }
                };
            });

            const dateFilteredMembers = membersEnriched.filter((edge) =>
                isWithinInclusiveDateRange(edge?.node?.createdAt, resolvedDateRange.fromDate, resolvedDateRange.toDate)
            );

            const filteredEdgeCount = dateFilteredMembers.length;
            let startIndex = 0;
            let endIndex = Math.min(pageSize, filteredEdgeCount);

            if (requestedDirection === 'next' && after) {
                const afterIndex = dateFilteredMembers.findIndex((edge) => edge?.cursor === after);
                if (afterIndex >= 0) {
                    startIndex = afterIndex + 1;
                    endIndex = Math.min(startIndex + pageSize, filteredEdgeCount);
                }
            } else if (requestedDirection === 'prev' && before) {
                const beforeIndex = dateFilteredMembers.findIndex((edge) => edge?.cursor === before);
                if (beforeIndex >= 0) {
                    endIndex = beforeIndex;
                    startIndex = Math.max(0, endIndex - pageSize);
                }
            }

            const pageSlice = dateFilteredMembers.slice(startIndex, endIndex);

            const pageInfo = {
                hasPreviousPage: startIndex > 0,
                hasNextPage: endIndex < filteredEdgeCount,
                startCursor: pageSlice[0]?.cursor || null,
                endCursor: pageSlice[pageSlice.length - 1]?.cursor || null,
            };

            return successResponse(res, { members: pageSlice, pageInfo, totalCount: filteredEdgeCount });
        }

        if (spenderWindowMonths) {
            const cacheKey = `${id}|${spenderWindowMonths}`;
            const cached = segmentWindowMembersCache.get(cacheKey);

            let membersWithWindowSpend = null;
            if (cached && cached.expiresAt > Date.now()) {
                membersWithWindowSpend = cached.members;
            } else {
                const rawMembers = await fetchAllMembers();
                const customerIds = [...new Set(
                    rawMembers
                        .map((edge) => extractNumericCustomerId(normalizeCustomerGidFromMember(edge?.node?.id)))
                        .filter(Boolean)
                )];

                const metricsByCustomerId = await calculateWindowMetricsForCustomers({
                    customerIds,
                    months: spenderWindowMonths,
                    shopUrl: url,
                    token,
                });

                membersWithWindowSpend = rawMembers.map((edge) => {
                    const customerId = extractNumericCustomerId(normalizeCustomerGidFromMember(edge?.node?.id));
                    const windowMetrics = (customerId && metricsByCustomerId.get(customerId)) || getDefaultWindowMetrics();
                    const fallbackCurrency =
                        edge?.node?.amountSpent?.currencyCode ||
                        windowMetrics.currencyCode ||
                        'GBP';

                    return {
                        ...edge,
                        node: {
                            ...edge.node,
                            numberOfOrders: windowMetrics.orderCount,
                            amountSpent: {
                                amount: windowMetrics.amount.toFixed(2),
                                currencyCode: fallbackCurrency,
                            },
                        }
                    };
                });

                membersWithWindowSpend.sort((a, b) => {
                    const amountA = parseFloat(a?.node?.amountSpent?.amount || 0);
                    const amountB = parseFloat(b?.node?.amountSpent?.amount || 0);
                    return amountB - amountA;
                });

                segmentWindowMembersCache.set(cacheKey, {
                    members: membersWithWindowSpend,
                    expiresAt: Date.now() + SEGMENT_WINDOW_CACHE_TTL_MS,
                });
            }

            const filteredMembers = normalizedSearch
                ? membersWithWindowSpend.filter(matchesSearch)
                : membersWithWindowSpend;

            filteredMembers.sort((a, b) => {
                const amountA = parseFloat(a?.node?.amountSpent?.amount || 0);
                const amountB = parseFloat(b?.node?.amountSpent?.amount || 0);
                return amountB - amountA;
            });

            const filteredEdgeCount = filteredMembers.length;
            let startIndex = 0;
            let endIndex = Math.min(pageSize, filteredEdgeCount);

            if (requestedDirection === 'next' && after) {
                const afterIndex = filteredMembers.findIndex((edge) => edge?.cursor === after);
                if (afterIndex >= 0) {
                    startIndex = afterIndex + 1;
                    endIndex = Math.min(startIndex + pageSize, filteredEdgeCount);
                }
            } else if (requestedDirection === 'prev' && before) {
                const beforeIndex = filteredMembers.findIndex((edge) => edge?.cursor === before);
                if (beforeIndex >= 0) {
                    endIndex = beforeIndex;
                    startIndex = Math.max(0, endIndex - pageSize);
                }
            }

            const pageSlice = filteredMembers.slice(startIndex, endIndex);

            const customerIds = [...new Set(
                pageSlice
                    .map((edge) => normalizeCustomerGidFromMember(edge?.node?.id))
                    .filter(Boolean)
            )];

            const createdAtByCustomerId = new Map();

            for (let i = 0; i < customerIds.length; i += 250) {
                const chunk = customerIds.slice(i, i + 250);

                const customerNodesQuery = {
                    query: `query {
                        nodes(ids: ${JSON.stringify(chunk)}) {
                            ... on Customer {
                                id
                                createdAt
                            }
                        }
                    }`
                };

                const customerNodesResponse = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, customerNodesQuery, {
                    headers: {
                        'X-Shopify-Access-Token': token,
                        'Content-Type': 'application/json'
                    }
                });

                const nodes = customerNodesResponse.data?.data?.nodes || [];
                nodes.forEach((node) => {
                    if (node?.id && node?.createdAt) {
                        createdAtByCustomerId.set(node.id, node.createdAt);
                    }
                });
            }

            const membersWithCreatedAt = pageSlice.map((edge) => {
                const customerId = normalizeCustomerGidFromMember(edge?.node?.id);
                return {
                    ...edge,
                    node: {
                        ...edge.node,
                        createdAt: customerId ? (createdAtByCustomerId.get(customerId) || null) : null,
                    }
                };
            });

            const orderIds = [...new Set(
                membersWithCreatedAt
                    .map((edge) => edge?.node?.lastOrderId)
                    .filter(Boolean)
            )];

            const orderDetailsById = new Map();

            for (let i = 0; i < orderIds.length; i += 250) {
                const chunk = orderIds.slice(i, i + 250);

                const orderNodesQuery = {
                    query: `query {
                        nodes(ids: ${JSON.stringify(chunk)}) {
                            ... on Order {
                                id
                                createdAt
                                lineItems(first: 50) {
                                    edges {
                                        node {
                                            name
                                            title
                                            variantTitle
                                        }
                                    }
                                }
                            }
                        }
                    }`
                };

                const orderNodesResponse = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, orderNodesQuery, {
                    headers: {
                        'X-Shopify-Access-Token': token,
                        'Content-Type': 'application/json'
                    }
                });

                const orderNodes = orderNodesResponse.data?.data?.nodes || [];
                orderNodes.forEach((orderNode) => {
                    if (!orderNode?.id) return;

                    const lineItemNames = (orderNode?.lineItems?.edges || [])
                        .map((lineEdge) => {
                            const item = lineEdge?.node;
                            if (!item) return null;
                            if (item?.name) return item.name;
                            if (item?.title) {
                                return `${item.title}${item?.variantTitle ? ` / ${item.variantTitle}` : ''}`;
                            }
                            return null;
                        })
                        .filter(Boolean);

                    const uniqueLineItemNames = [...new Set(lineItemNames)];
                    const purchasedWhat = uniqueLineItemNames.length ? uniqueLineItemNames.join(', ') : null;

                    orderDetailsById.set(orderNode.id, {
                        createdAt: orderNode?.createdAt || null,
                        purchasedWhat: purchasedWhat || null,
                    });
                });
            }

            const membersEnriched = membersWithCreatedAt.map((edge) => {
                const orderId = edge?.node?.lastOrderId;
                const orderDetails = orderId ? orderDetailsById.get(orderId) : null;

                return {
                    ...edge,
                    node: {
                        ...edge.node,
                        lastPurchasedAt: orderDetails?.createdAt || null,
                        purchasedWhat: orderDetails?.purchasedWhat || null,
                    }
                };
            });

            const pageInfo = {
                hasPreviousPage: startIndex > 0,
                hasNextPage: endIndex < filteredEdgeCount,
                startCursor: pageSlice[0]?.cursor || null,
                endCursor: pageSlice[pageSlice.length - 1]?.cursor || null,
            };

            return successResponse(res, { members: membersEnriched, pageInfo, totalCount: filteredEdgeCount });
        }

        const response = normalizedSearch
            ? { data: { data: { customerSegmentMembers: { edges: await fetchAllMembers() } } } }
            : await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, baseQuery(cursorClause), {
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json'
                }
            });

        const rawMembers = normalizedSearch
            ? response.data?.data?.customerSegmentMembers?.edges || []
            : response.data?.data?.customerSegmentMembers?.edges || [];

        const filteredMembers = normalizedSearch
            ? rawMembers.filter(matchesSearch)
            : rawMembers;

        const members = filteredMembers;

        // Enrich Added Date by resolving member/customer ids via Customer nodes query.
        const normalizeCustomerGid = (memberId) => {
            if (!memberId || typeof memberId !== 'string') return null;
            if (memberId.includes('/Customer/')) return memberId;
            if (memberId.includes('/CustomerSegmentMember/')) {
                return memberId.replace('/CustomerSegmentMember/', '/Customer/');
            }
            return null;
        };

        const customerIds = [...new Set(
            members
                .map((edge) => normalizeCustomerGid(edge?.node?.id))
                .filter(Boolean)
        )];

        const createdAtByCustomerId = new Map();

        for (let i = 0; i < customerIds.length; i += 250) {
            const chunk = customerIds.slice(i, i + 250);

            const customerNodesQuery = {
                query: `query {
                    nodes(ids: ${JSON.stringify(chunk)}) {
                        ... on Customer {
                            id
                            createdAt
                        }
                    }
                }`
            };

            const customerNodesResponse = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, customerNodesQuery, {
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json'
                }
            });

            const nodes = customerNodesResponse.data?.data?.nodes || [];
            nodes.forEach((node) => {
                if (node?.id && node?.createdAt) {
                    createdAtByCustomerId.set(node.id, node.createdAt);
                }
            });
        }

        const membersWithCreatedAt = members.map((edge) => {
            const customerId = normalizeCustomerGid(edge?.node?.id);
            return {
                ...edge,
                node: {
                    ...edge.node,
                    createdAt: customerId ? (createdAtByCustomerId.get(customerId) || null) : null,
                }
            };
        });

        // Enrich last purchase details from lastOrderId.
        const orderIds = [...new Set(
            membersWithCreatedAt
                .map((edge) => edge?.node?.lastOrderId)
                .filter(Boolean)
        )];

        const orderDetailsById = new Map();

        for (let i = 0; i < orderIds.length; i += 250) {
            const chunk = orderIds.slice(i, i + 250);

            const orderNodesQuery = {
                query: `query {
                    nodes(ids: ${JSON.stringify(chunk)}) {
                        ... on Order {
                            id
                            createdAt
                            lineItems(first: 50) {
                                edges {
                                    node {
                                        name
                                        title
                                        variantTitle
                                    }
                                }
                            }
                        }
                    }
                }`
            };

            const orderNodesResponse = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`, orderNodesQuery, {
                headers: {
                    'X-Shopify-Access-Token': token,
                    'Content-Type': 'application/json'
                }
            });

            const orderNodes = orderNodesResponse.data?.data?.nodes || [];
            orderNodes.forEach((orderNode) => {
                if (!orderNode?.id) return;

                const lineItemNames = (orderNode?.lineItems?.edges || [])
                    .map((edge) => {
                        const item = edge?.node;
                        if (!item) return null;

                        if (item?.name) return item.name;
                        if (item?.title) {
                            return `${item.title}${item?.variantTitle ? ` / ${item.variantTitle}` : ''}`;
                        }

                        return null;
                    })
                    .filter(Boolean);

                const uniqueLineItemNames = [...new Set(lineItemNames)];
                const purchasedWhat = uniqueLineItemNames.length ? uniqueLineItemNames.join(', ') : null;

                orderDetailsById.set(orderNode.id, {
                    createdAt: orderNode?.createdAt || null,
                    purchasedWhat: purchasedWhat || null,
                });
            });
        }

        const membersEnriched = membersWithCreatedAt.map((edge) => {
            const orderId = edge?.node?.lastOrderId;
            const orderDetails = orderId ? orderDetailsById.get(orderId) : null;

            return {
                ...edge,
                node: {
                    ...edge.node,
                    lastPurchasedAt: orderDetails?.createdAt || null,
                    purchasedWhat: orderDetails?.purchasedWhat || null,
                }
            };
        });

        let membersWithAbandonedCheckoutDate = membersEnriched;
        if (id === ABANDONED_CHECKOUT_SEGMENT_ID) {
            const emails = membersEnriched
                .map((edge) => edge?.node?.defaultEmailAddress?.emailAddress)
                .filter(Boolean);

            const abandonedCheckoutDetailsByEmail = await fetchAbandonedCheckoutDetailsForEmails({
                emails,
                shopUrl: url,
                token,
            });

            membersWithAbandonedCheckoutDate = membersEnriched.map((edge) => {
                const email = String(edge?.node?.defaultEmailAddress?.emailAddress || '').trim().toLowerCase();
                const abandonedCheckoutDetails = abandonedCheckoutDetailsByEmail.get(email) || {};

                return {
                    ...edge,
                    node: {
                        ...edge.node,
                        abandoned_checkout_date: abandonedCheckoutDetails.abandoned_checkout_date || null,
                        abandoned_checkout_products: abandonedCheckoutDetails.abandoned_checkout_products || null,
                    }
                };
            });
        }

        let pageInfo = response.data?.data?.customerSegmentMembers?.pageInfo || {};
        let totalCount = response.data?.data?.customerSegmentMembers?.totalCount || 0;

        if (normalizedSearch) {
            // Use the abandoned-checkout-enriched array when available so
            // search results include `abandoned_checkout_date` for that segment.
            const sourceArray = (id === ABANDONED_CHECKOUT_SEGMENT_ID) ? membersWithAbandonedCheckoutDate : membersEnriched;
            const filteredEdgeCount = sourceArray.length;
            totalCount = filteredEdgeCount;

            let startIndex = 0;
            let endIndex = Math.min(pageSize, filteredEdgeCount);

            if (requestedDirection === 'next' && after) {
                const afterIndex = sourceArray.findIndex((edge) => edge?.cursor === after);
                if (afterIndex >= 0) {
                    startIndex = afterIndex + 1;
                    endIndex = Math.min(startIndex + pageSize, filteredEdgeCount);
                }
            } else if (requestedDirection === 'prev' && before) {
                const beforeIndex = sourceArray.findIndex((edge) => edge?.cursor === before);
                if (beforeIndex >= 0) {
                    endIndex = beforeIndex;
                    startIndex = Math.max(0, endIndex - pageSize);
                }
            }

            const pageSlice = sourceArray.slice(startIndex, endIndex);
            pageInfo = {
                hasPreviousPage: startIndex > 0,
                hasNextPage: endIndex < filteredEdgeCount,
                startCursor: pageSlice[0]?.cursor || null,
                endCursor: pageSlice[pageSlice.length - 1]?.cursor || null,
            };

            return successResponse(res, {members: pageSlice, pageInfo, totalCount});
        }

        return successResponse(res, {members: membersWithAbandonedCheckoutDate, pageInfo, totalCount});
    } catch (error) {
        // console.log( error.response?.data || error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
};
// First Call: GET /api/customer/list?batchSize=250
// Second Call: GET /api/customer/list?batchSize=250&pageInfo=<value from previous response>
// Repeat until response returns "nextPageInfo": null.
// Manage "New Trade Account Registration" tag customers when they are created or updated in Shopify
export const listCustomers1 = async (req, res) => {
    try {
        const batchSize = parseInt(req.query.batchSize) || 250;
        const pageInfo = req.query.pageInfo || null;
        if (batchSize < 1 || batchSize > 250) {
            return errorResponse(res, "Batch size must be between 1 and 250", 400);
        }

        const settings = await Settings.findOne();
        if (!settings) {
            return errorResponse(res, "Settings not found", 500);
        }

        const { sp_app_url, admin_api_access_token } = settings;

        // Build Shopify API URL
        let url = `${sp_app_url}/admin/api/2025-07/customers.json?limit=${batchSize}`;
        if (pageInfo) url += `&page_info=${pageInfo}`;

        const response = await axios.get(url, {
            headers: {
                "X-Shopify-Access-Token": admin_api_access_token,
                "Content-Type": "application/json",
            },
        });

        const customers = response.data?.customers || [];
        let migratedCustomers = [];

        let totalMigrated = 0, totalInserted = 0, totalUpdated = 0;

        for (const cus of customers) {
            if (cus.tags?.split(",").map(t => t.trim()).includes("New Trade Account Registration")) {
                const result = await Customers.findOneAndUpdate(
                    { shopify_cus_id: cus.id },
                    {
                        $set: {
                            shopify_request_body: JSON.stringify(cus),
                            lead_first_name: cus.first_name,
                            lead_last_name: cus.last_name,
                            lead_email: cus.email,
                            lead_company: cus.default_address?.company || "Individual",
                            lead_phone: cus.phone || "",
                            lead_description: `Shopify ID: ${cus.id}`,
                            lead_source: 7,
                        },
                    },
                    { upsert: true, new: true, setDefaultsOnInsert: true }
                );

                if (result.wasNew) {
                    totalInserted++;
                } else {
                    totalUpdated++;
                }

                migratedCustomers.push(cus);
                totalMigrated++;
            }
        }

        // Parse Shopify link header for next page
        let nextPageInfo = null;
        const linkHeader = response.headers["link"];
        if (linkHeader) {
            const nextMatch = linkHeader.match(/<[^>]+page_info=([^&>]+)[^>]*>; rel="next"/);
            if (nextMatch) {
                nextPageInfo = nextMatch[1];
            }
        }

        return successResponse(
            res,
            {
                totalMigrated,
                totalInserted,
                totalUpdated,
                nextPageInfo, // 👈 frontend should pass this in next API call
                customers: migratedCustomers,
            },
            "Customers batch processed successfully"
        );
    } catch (error) {
        console.error("Error in listCustomers:", error.response?.data || error.message);
        return errorResponse(res, error.response?.data || error.message, 500);
    }
};

// Manage "Trade Account" tag customers when they are created or updated in Shopify
// export function listCustomers is in this file
export const listCustomers = async (req, res) => {

    try {
        const batchSize = 250; // Shopify max
        let pageInfo = req.query.pageInfo || null;

        const settings = await Settings.findOne();

        if (!settings) {
            return errorResponse(res, "Settings not found", 500);
        }

        const { sp_app_url, admin_api_access_token } = settings;

        const headers = {
            "X-Shopify-Access-Token": admin_api_access_token,
            "Content-Type": "application/json",
        };

        let allMatchedCustomers = [];
        let nextPageInfo = pageInfo || null;
        let hasNextPage = true;

        let totalInserted = 0;
        let totalUpdated  = 0;

        while (hasNextPage) {
            let url = `${sp_app_url}/admin/api/2025-07/customers.json?limit=${batchSize}`;
            if (nextPageInfo) {
                url += `&page_info=${nextPageInfo}`;
            }

            const response  = await axios.get(url, { headers });
            const customers = response.data?.customers || [];

            const filtered = customers.filter(cus => {
                const tagsArray = (cus.tags || "")
                    .split(",")
                    .map(tag => tag.trim().toLowerCase());

                return tagsArray.includes("trade account");
            });

            for (const cus of filtered) {
                const result = await Customers.findOneAndUpdate(
                    { shopify_cus_id: cus.id },
                    {
                        $set: {
                            shopify_request_body: JSON.stringify(cus),
                            lead_first_name: cus.first_name,
                            lead_last_name: cus.last_name,
                            lead_email: cus.email,
                            lead_company: cus.default_address?.company || "Individual",
                            lead_phone: cus.phone || "",
                            lead_description: `Shopify ID: ${cus.id}`,
                            lead_source: 7,
                        },
                    },
                    { upsert: true, new: true, rawResult: true }
                );

                if (result.lastErrorObject?.upserted) {
                    totalInserted++;
                } else {
                    totalUpdated++;
                }
            }

            allMatchedCustomers.push(...filtered);
            const linkHeader = response.headers["link"];

            if (linkHeader) {
                const nextMatch = linkHeader.match(/<[^>]+page_info=([^&>]+)[^>]*>; rel="next"/);
                nextPageInfo = nextMatch ? nextMatch[1] : null;
                hasNextPage = !!nextPageInfo;
            } else {
                hasNextPage = false;
            }
        }

        return successResponse(res,
            {
                totalMigrated: allMatchedCustomers.length,
                totalInserted,
                totalUpdated,
                customers: allMatchedCustomers,
            },
            "All Trade Account customers fetched successfully"
        );
    } catch (error) {
        console.error("Error in listCustomers:", error.response?.data || error.message);
        return errorResponse(res, error.response?.data || error.message, 500);
    }
};


