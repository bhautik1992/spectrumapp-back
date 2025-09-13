import mongoose from 'mongoose';
import mongooseDelete from "mongoose-delete";

const schema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    customer_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customers",
        required: true
    },
    title      : {type: String,maxlength: 50,required: true},
    date       : {type: Date,required: true},
    url        : {type: String,maxlength: 100},
    location   : {type: String,maxlength: 50},
    description: {type: String},
    deletedAt  : {type: Date}
},{
    timestamps: true
});

schema.plugin(mongooseDelete, { 
    deletedAt: true, // Adds deletedAt field
    overrideMethods: "all",  // Ensures soft-deleted records are hidden from normal queries
    deletedBy: false, // Optionally store the user who deleted the record
});

export default schema;


