import mongoose from 'mongoose';
import schema from '../database/schemas/CustomersSchema.js';

const Customers = mongoose.model('Customers',schema);

export default Customers;


