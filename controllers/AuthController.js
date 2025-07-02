import User from '../models/User.js';
import { successResponse, errorResponse } from '../helpers/ResponseHandler.js';
import { generateToken } from '../helpers/JWTToken.js';

export const login = async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = await User.findOne({ email,'status':true }).select('-createdAt -updatedAt -deleted -__v');        
        if(!user) {
            return errorResponse(res,'Invalid credentials,Please try again...', 401);
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return errorResponse(res,'Invalid credentials,Please try again...', 401);
        }

        const object  = user.toObject();
        object._token = generateToken(user._id);
        delete object.password;
                
        return successResponse(res, object, 'Loggedin Successfully');
    } catch (error) {
        // console.log(error.message);
        return errorResponse(res,'Error during login', 500);
    }
};


