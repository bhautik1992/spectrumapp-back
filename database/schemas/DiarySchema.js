import mongoose from 'mongoose';
import mongooseDelete from "mongoose-delete";

const schema = new mongoose.Schema({
    sender_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: "User", 
        required: true 
    },
    customer_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customers",
        required: true
    },
    message: {
        type: String, 
        trim: true
    },
    // response_body: {
    //     type: String,
    //     required: true
    // },
    deletedAt: {type: Date}
},{
    timestamps: true
});

schema.plugin(mongooseDelete, { 
    deletedAt: true, // Adds deletedAt field
    overrideMethods: "all",  // Ensures soft-deleted records are hidden from normal queries
    deletedBy: false, // Optionally store the user who deleted the record
});

export default schema;


