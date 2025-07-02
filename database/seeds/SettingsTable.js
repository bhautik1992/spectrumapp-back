import mongoose from 'mongoose';
import Settings from '../../models/Settings.js';
import connectDB from '../../config/database.js';

export const settingTable = async () => {
    try {
        await connectDB();

        const object = [{
            sf_access_token: '00DgK000005kkY2!AQEAQGLiEKMOmILVStDRv3DSTnBNzsU6Mknn9AXH8ERt7zJ8t.L2MnDaYAU3TZRipbUkNUI4tY7.U1vHLzpfxjiv6WDXF8zR',
            sf_client_id   : 'PlatformCLI',
            sf_id          : '00DgK000005kkY2UAI',
            sf_instance_url: 'https://orgfarm-fa4a036c76-dev-ed.develop.my.salesforce.com',
        }];

        await Settings.create(object);
        mongoose.connection.close();
    } catch (error) {
        // console.error('Error during seeding:', error);
        mongoose.connection.close();
    }
};


