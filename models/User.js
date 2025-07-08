import mongoose from 'mongoose';
import schema from '../database/schemas/UsersSchema.js';

const User = mongoose.model('User',schema);

export default User;


