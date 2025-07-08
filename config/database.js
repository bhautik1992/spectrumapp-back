import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        mongoose.set('debug', false);
    } catch (error) {
        console.error('Error while connecting with MongoDB:', error);
        process.exit(1);
    }
};

export default connectDB;


