import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import Customers from "../models/Customers.js";
import Events from "../models/Events.js";

export const index = async (req, res) => {
    try {
        const now = new Date();
        const startOfTodayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const { uid } = req.params;

        const result = await Customers.aggregate([
            {
                $group: {
                    _id: "$lead_status",
                    count: { $sum: 1 }
                }
            }
        ]);

        const events = await Events.find({ user_id: uid, date: { $gte: startOfTodayUTC }, deletedAt: null })
            .populate({
                path: 'customer_id',
                select: 'lead_first_name lead_last_name lead_email lead_phone lead_status'
            })
            .sort({ date: 1 });

        return successResponse(res, {result,events});
    } catch (error) {
        // console.log( error.response?.data || error.message);
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}


