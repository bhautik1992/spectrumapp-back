import Customers from "../models/Customers.js";
import Settings from "../models/Settings.js";
import Diary from "../models/Diary.js";
import Events from "../models/Events.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import { leadStatusLabels } from '../config/constants.js';
import { storeLog } from "../helpers/Common.js";
import axios from 'axios';
import { engagementChecklist } from '../config/constants.js';
import jsforce from 'jsforce';

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
            options: { sort: { date: 1 } }
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
        const { id, perPage, before, after, isNext } = req.query;

        let cursorClause = `first: ${perPage}, reverse: true`;
        if(isNext !== undefined){
            if(isNext === 'true'){
                cursorClause = ` first: ${perPage}, after: "${after}", reverse: true`;
            }else{
                cursorClause = ` last: ${perPage}, before: "${before}", reverse: true`;
            }
        }

        const settings = await Settings.findOne();
        const { sp_app_url: url, admin_api_access_token: token } = settings;
  
        const query = {
            query: `query {
                customerSegmentMembers(segmentId: "${id}", ${cursorClause}) {
                    edges {
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
        };
        
        const response = await axios.post(`${url}${process.env.SHOPIFY_CUS_SEGMENTS_LIST}`,query,{
            headers: {
                'X-Shopify-Access-Token': token,
                'Content-Type': 'application/json'
            }
        });
  
        const members = response.data?.data?.customerSegmentMembers?.edges || [];
        const pageInfo = response.data?.data?.customerSegmentMembers?.pageInfo || {};
        const totalCount = response.data?.data?.customerSegmentMembers?.totalCount || 0;

        return successResponse(res, {members, pageInfo, totalCount});
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


