import Customers from "../models/Customers.js";
import Settings from "../models/Settings.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import { leadStatusLabels } from '../config/constants.js';
import { storeLog } from "../helpers/Common.js";
import axios from 'axios';
import { engagementChecklist } from '../config/constants.js';

export const edit = async (req, res) => {
    try{
        const { id } = req.params;
        
        const role = await Customers.findById(id);
        return successResponse(res, role);
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

        if(req.body?.engagement_type || req.body?.checklist_notes){
            const engagementText = req.body.engagement_type && engagementChecklist[req.body.engagement_type]
            ? engagementChecklist[req.body.engagement_type]
            : '';

            const checklistNotes = ' | '+req.body.checklist_notes || '';

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
                setData.engagement_option = req.body.engagement_type;
            }
            
            if(req.body.checklist_notes){
                setData.engagement_note = req.body.checklist_notes;
            }

            await Customers.updateOne(
                { shopify_cus_id },
                { $set: setData },
                { upsert: true }
            );

            storeLog('Note Reponse');
            storeLog(noteResponse.data);
        }
        
        storeLog('Lead Response');
        storeLog(response.data);
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
