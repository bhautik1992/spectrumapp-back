import User from '../models/User.js';
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';

export const getUsers = async (req, res) => {
    try {
        const users = await User.aggregate([
            {
                $lookup: {
                    from: "roles",
                    localField: "role_id",
                    foreignField: "_id",
                    as: "role"
                }
            },
            { $unwind: "$role" },
            {
                $lookup: {
                    from: "designations",
                    localField: "designation_id",
                    foreignField: "_id",
                    as: "designation"
                }
            },
            { $unwind: "$designation" },
            {
                $lookup: {
                    from: "users", // self-reference
                    localField: "reporting_to",
                    foreignField: "_id",
                    as: "reporting_user"
                }
            },
            { $unwind: { path: "$reporting_user", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "designations",
                    localField: "reporting_user.designation_id",
                    foreignField: "_id",
                    as: "reporting_user_designation"
                }
            },
            { $unwind: { path: "$reporting_user_designation", preserveNullAndEmptyArrays: true } },

            // {
            //     $match: { "role.name": { $ne: "Admin" } }
            // },
            {
                $project: {
                    first_name: 1,
                    last_name: 1,
                    middle_name: 1,
                    username: 1,
                    employee_code: 1,
                    company_email: 1,
                    mobile_number: 1,
                    city: 1,
                    is_active: 1,
                    role_id: {
                        _id: "$role._id",
                        name: "$role.name"
                    },
                    designation_id: {
                        _id: "$designation._id",
                        name: "$designation.name"
                    },
                    reporting_to: {
                        _id: "$reporting_user._id",
                        first_name: "$reporting_user.first_name",
                        last_name: "$reporting_user.last_name",
                        designation: {
                            _id: "$reporting_user_designation._id",
                            name: "$reporting_user_designation.name"
                        }
                    }
                }
            },
            { $sort: { _id: -1 } }
        ]);    

        return successResponse(res, users, 200, "Collaborator Fetch Successfully");
    } catch (error) {
        // console.log(error.message)
        return errorResponse(res,process.env.ERROR_MSG,error,500);
    }
};

export const update = async (req, res) => {
    try {
        const input = req.body;
        
        const user = await User.findOneAndUpdate({_id:input.id}, input, { new: true, upsert: true }).select(User.hidden);
        return successResponse(res, user, "Profile Updated Successfully");
    } catch (error) {
        // console.log(error.message)
        return errorResponse(res, process.env.ERROR_MSG, 500);
    }
}


