import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';

export const create = async (req, res) => {
    try{
        const { token, url } = req.salesforce;
    
        const payload = {
            LastName  : "ABC2",
            Company   : "XYZ2",
            Email     : "abc2.xuz@example.com",
            Phone     : "1232",
            Status    : "Open - Not Contacted",
            LeadSource: "Web"
        };
        
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


