import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';
import Settings from '../models/Settings.js';
import Customers from '../models/Customers.js';
import { storeLog } from '../helpers/Common.js';

export const create = async (req, res) => {
    // await Customers.create([{
    //     shopify_id                   : '123',
    //     shopify_request_body         : 'ABC',
    //     salesforce_lead_id           : 'ABC',
    //     salesforce_lead_response_body: 'ABC',
    //     lead_first_name              : 'ABC', 
    //     lead_last_name               : 'ABC',
    //     lead_company                 : 'ABC',
    //     lead_email                   : 'ABC',
    //     lead_phone                   : 'ABC',
    //     lead_description             : 'ABC',
    // }]);
    // process.exit(0);

    try{
        storeLog(req.body);
        const settings = await Settings.findOne();
        const { sf_access_token:token, sf_instance_url:url } = settings;
    
        const payload = {
            // Name      : req.body.addresses.name,
            FirstName : req.body.first_name, 
            LastName  : req.body.last_name,
            Company   : req.body.addresses?.[0]?.company,
            Email     : req.body.email,
            Phone     : req.body.phone || req.body.addresses?.[0]?.phone || '',
            Description: `Shopify ID: ${req.body.id}`,
            Status    : "Open - Not Contacted",
            LeadSource: "Web"
        };

        // const payload = {
        //     FirstName : 'B111', 
        //     LastName  : 'C111',
        //     Company   : 'D111',
        //     Email     : 'abc111@gmail.com',
        //     Phone     : '123853111',
        //     Description:'DE@##31342311',
        //     Status    : "Open - Not Contacted",
        //     LeadSource: "Web"
        // };
        
        const response = await axios.post(`${url+process.env.SF_LEAD_GENERATE}`,payload,{
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        await Customers.create([{
            shopify_id                   : req.body.id,
            shopify_request_body         : JSON.stringify(req.body),
            salesforce_lead_id           : response.data.id,
            salesforce_lead_response_body: JSON.stringify(response.data),
            lead_first_name              : req.body.first_name, 
            lead_last_name               : req.body.last_name,
            lead_company                 : req.body.addresses?.[0]?.company,
            lead_email                   : req.body.email,
            lead_phone                   : req.body.phone || req.body.addresses?.[0]?.phone || '',
            lead_description             : `Shopify ID: ${req.body.id}`,
        }]);

        storeLog(response.data);
        return successResponse(res, response.data.id, "Lead Created Successfully");
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


