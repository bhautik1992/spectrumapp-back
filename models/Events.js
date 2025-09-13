import mongoose from 'mongoose';
import schema from '../database/schemas/EventsSchema.js';

const Events = mongoose.model('Events',schema);

export default Events;


