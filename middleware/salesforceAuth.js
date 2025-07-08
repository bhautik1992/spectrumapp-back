import Settings from '../models/Settings.js';
import { errorResponse } from '../helpers/ResponseHandler.js';
import axios from 'axios';

export const salesforceAuth = async (req, res, next) => {
    try {
        const settings = await Settings.findOne();
        if (!settings || !settings.sf_instance_url || !settings.sf_client_id || !settings.sf_client_secret) {
            return errorResponse(res,'Salesforce settings not configured', 500);
        }

        let { sf_instance_url, sf_client_id, sf_client_secret, sf_access_token  } = settings;
        
        const isValid = await validateToken(sf_instance_url, sf_access_token);
        if (!isValid) {
            const newToken = await generateToken(sf_instance_url,sf_client_id,sf_client_secret);
            if (!newToken || !newToken.access_token) {
                return errorResponse(res,'Salesforce token refresh failed', 401);
            }

            sf_access_token = newToken.access_token;
            sf_instance_url = newToken.instance_url;

            settings.sf_access_token = sf_access_token;
            settings.sf_instance_url = sf_instance_url;
            await settings.save();
        }

        req.salesforce = {
            token: sf_access_token,
            url  : sf_instance_url
        };

        next();
    } catch (err) {
        // console.error('Salesforce middleware error:', err.message);        
        return errorResponse(res,'Salesforce authentication error', 500);
    }
};

const validateToken = async (instance_url, token) => {
    if (!token) return false;

    try {
        await axios.get(`${instance_url+process.env.SF_VALIDATE_TOKEN}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        return true;
    } catch (error) {
        // console.log(error.message);
        
        // if (error.response?.status === 401) {
        //     return errorResponse(res,'Salesforce token invalid/expired.', 401);
        // }

        return false;
    }
}

const generateToken = async (sf_instance_url,sf_client_id,sf_client_secret) => {
    try {
        const params = new URLSearchParams();
        
        params.append('grant_type', process.env.SF_GRANT_TYPE);
        params.append('client_id', sf_client_id);
        params.append('client_secret', sf_client_secret);

        const response = await axios.post(`${sf_instance_url+process.env.SF_GENERATE_TOKEN}`, params);
        
        // console.log("Generate Token")
        // console.log(response.data.access_token)

        return {
            access_token: response.data.access_token,
            instance_url: response.data.instance_url
        }
    } catch (error) {
        // console.error('Token Generation Error:', error?.response?.data || error.message);
        return null;
    }
};
