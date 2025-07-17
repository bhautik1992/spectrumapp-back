import Customers from "../models/Customers.js";
import Settings from "../models/Settings.js";
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import { leadStatusLabels } from '../config/constants.js';
import { storeLog } from "../helpers/Common.js";
import axios from 'axios';

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
