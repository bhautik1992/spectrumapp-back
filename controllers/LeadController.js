import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';
import Settings from '../models/Settings.js';
import Customers from '../models/Customers.js';
import { storeLog } from '../helpers/Common.js';

export const index = async (req, res) => {
    try {
        const { page = 1, perPage = 10, search = "" } = req.query;
        const pageNumber    = parseInt(page, 10);
        const perPageNumber = parseInt(perPage, 10);
        const regex = new RegExp(search.trim(), "i");

        const leadStatusMap = {
            1: "Open - Not Contacted",
            2: "Working - Contacted",
            3: "Closed - Converted",
            4: "Closed - Not Converted"
        };

        const leadSourceMap = {
            1: "Web",
            2: "Phone Inquiry",
            3: "Partner - Referral",
            4: "Purchased - List",
            5: "Other"
        };

        const matchConditions = [];

        if (search.trim() !== "") {
            const matchingLeadStatus = Object.entries(leadStatusMap)
                .filter(([_, label]) => label.toLowerCase().includes(search.toLowerCase()))
                .map(([value]) => parseInt(value));

            const matchingLeadSource = Object.entries(leadSourceMap)
                .filter(([_, label]) => label.toLowerCase().includes(search.toLowerCase()))
                .map(([value]) => parseInt(value));

            matchConditions.push({
                $or: [
                    { shopify_id: regex },
                    { salesforce_lead_id: regex },
                    { lead_first_name: regex },
                    { lead_last_name: regex },
                    { lead_company: regex },
                    { lead_email: regex },
                    { lead_phone: regex },
                    { full_name: regex },
                    ...(matchingLeadStatus.length > 0 ? [{ lead_status: { $in: matchingLeadStatus } }] : []),
                    ...(matchingLeadSource.length > 0 ? [{ lead_source: { $in: matchingLeadSource } }] : [])
                ]
            });
        }

        const matchStage = matchConditions.length > 0 ? { $match: { $and: matchConditions } } : { $match: {} };

        const result = await Customers.aggregate([
            {
                $addFields: {
                    full_name: {
                        $concat: [
                            { $ifNull: ["$lead_first_name", ""] },
                            " ",
                            { $ifNull: ["$lead_last_name", ""] }
                        ]
                    }
                }
            },
            matchStage,
            {
                $facet: {
                    customers: [
                        { $sort: { _id: -1 } },
                        { $skip: (pageNumber - 1) * perPageNumber },
                        { $limit: perPageNumber }
                    ],
                    totalCount: [
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const customers = result[0].customers;
        const total = result[0].totalCount[0]?.count || 0;

        return successResponse(res, { customers, total });
    } catch (error) {
        console.log(error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
};

export const create = async (req, res) => {
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

export const update = async (req, res) => {
    storeLog(req.body);
}
