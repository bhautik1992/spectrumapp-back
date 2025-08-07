import Customers from "../models/Customers.js";
import Settings from "../models/Settings.js";
import Diary from "../models/Diary.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import { leadStatusLabels } from '../config/constants.js';
import { storeLog } from "../helpers/Common.js";
import axios from 'axios';
import { engagementChecklist } from '../config/constants.js';

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
        });

        return successResponse(res, customer);
    } catch (error) {
        // console.log(error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}

export const update = async (req, res) => {
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

export const segmentRecords = async (req, res) => {
    try {
        const { id, perPage, before, after, isNext } = req.query;
        let cursorClause = `first: ${perPage}`; 
        
        if(isNext !== undefined){
            if(isNext === 'true'){
                cursorClause = ` first: ${perPage}, after: "${after}"`;
            }else{
                cursorClause = ` last: ${perPage}, before: "${before}"`;
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

        return successResponse(res, {members, pageInfo});
    } catch (error) {
        // console.log( error.response?.data || error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
};


