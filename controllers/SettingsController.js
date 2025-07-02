import Settings from '../models/Settings.js';
import User from '../models/User.js';

import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';

export const index = async (req, res) => {
    try {
        const settings = await Settings.findOne();
        return successResponse(res, settings);
    } catch (error) {
        // console.log(error.message);
        return errorResponse(res,process.env.ERROR_MSG,error,500);
    }
}

export const store = async (req, res) => {
    try {
        const input = req.body;
        let settings = await Settings.findOne();

        if(!settings) {
            return errorResponse(res,'No Record Found', 404);
        }

        settings = await Settings.findOneAndUpdate({}, input, { new: true, upsert: true });
        return successResponse(res, settings, "Saved Successfully");
    } catch (error) {
        // console.log(error.message)
        return errorResponse(res, process.env.ERROR_MSG, error, 500);
    }
}


