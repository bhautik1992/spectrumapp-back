import mongoose from 'mongoose';

const ShopSchema = new mongoose.Schema({
    shop: { type: String, required: true, unique: true },
    accessToken: String,
    scope: String,
    installedAt: { type: Date, default: Date.now }
});

export default mongoose.model('Shop', ShopSchema);


