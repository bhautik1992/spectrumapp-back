import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import Settings from '../models/Settings.js';

export const create = async (req, res) => {
    const logPath = path.join(process.cwd(), 'storage', 'backend.log');
    const logData = `[${new Date().toISOString()}] ${JSON.stringify(req.body)}\n`;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, logData);
    
    try{
        const settings = await Settings.findOne();
        const { sf_access_token:token, sf_instance_url:url } = settings;
        // const { token, url } = req.salesforce;
    
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
        //     // Name      : 'A',
        //     FirstName : 'B1', 
        //     LastName  : 'C1',
        //     Company   : 'D1',
        //     Email     : 'abc1@gmail.com',
        //     Phone     : '1238531',
        //     Description: 'DE@##313423',
        //     Status    : "Open - Not Contacted",
        //     LeadSource: "Web"
        // };
        
        const response = await axios.post(`${url+process.env.SF_LEAD_GENERATE}`,payload,{
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        return successResponse(res, response.data.id, "Lead Created Successfully");
    }catch(error){
        const errorMessage = (error?.response?.data[0]?.errorCode == 'DUPLICATES_DETECTED')?'Failes to create lead, errorCode: DUPLICATES_DETECTED':'Failed to create lead'

        return res.status(500).json({
            success: false,
            message: errorMessage,
            error: error?.response?.data || error.message
        });
    }
}


