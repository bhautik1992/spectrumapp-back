import { verifyToken } from '../helpers/JWTToken.js';
import { errorResponse } from '../helpers/ResponseHandler.js';

export const protectRoute = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if(!token){
        return errorResponse(res, 'No token provided', null, 403);
    }

    const decoded = verifyToken(token);
    if(!decoded){
        return errorResponse(res, 'Invalid or expired token', null, 401);
    }

    req.user = decoded;
    next();
};


