import mongoose from 'mongoose';
import schema from '../database/schemas/DiarySchema.js';

const Diary = mongoose.model('Diary',schema);

export default Diary;


