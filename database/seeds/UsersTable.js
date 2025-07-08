import mongoose from 'mongoose';
import User from '../../models/User.js';
import connectDB from '../../config/database.js';

export const usersTable = async () => {
    try {
        await connectDB();
        
        const object = [{
            full_name: 'Thomas',
            email    : 'thomas@yopmail.com',
            password : 'th^3Dfik2L',
        }];

        await User.create(object);
    } catch (error) {
        console.error('Error during seeding:', error);
        mongoose.connection.close();
    }
};


