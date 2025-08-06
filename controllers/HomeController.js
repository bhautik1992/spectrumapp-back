import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import Customers from "../models/Customers.js";

export const index = async (req, res) => {
    try {
        const result = await Customers.aggregate([
            {
                $group: {
                    _id: "$lead_status",
                    count: { $sum: 1 }
                }
            }
        ]);

        return successResponse(res, result);
    } catch (error) {
        // console.log( error.response?.data || error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}


