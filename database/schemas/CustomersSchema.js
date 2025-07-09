import mongoose from 'mongoose';
import mongooseDelete from "mongoose-delete";

const schema = new mongoose.Schema({
    shopify_id                   : {type: String,required: true},
    shopify_request_body         : {type: String,required: true},
    salesforce_lead_id           : {type: String,required: true},
    salesforce_lead_response_body: {type: String,required: true},
    lead_first_name              : {type: String},
    lead_last_name               : {type: String},
    lead_company                 : {type: String},
    lead_email                   : {type: String},
    lead_phone                   : {type: String},
    lead_description             : {type: String},
    lead_status: {
        type: Number,
        required: true,
        enum: [1, 2, 3, 4],
        default: 1,
        description: '1 = Open - Not Contacted, 2 = Working - Contacted, 3 = Closed - Converted, 4 = Closed - Not Converted' 
    },
    lead_source: {
        type: Number,
        required: true,
        enum: [1, 2, 3, 4, 5],
        default: 1,
        description: '1 = Web, 2 = Phone Inquiry, 3 = Partner - Referral, 4 = Purchased - List, 5 = Other' 
    },
    deletedAt                    : {type: Date}
},{
    timestamps: true
});

schema.plugin(mongooseDelete, { 
    deletedAt: true, // Adds deletedAt field
    overrideMethods: "all",  // Ensures soft-deleted records are hidden from normal queries
    deletedBy: false, // Optionally store the user who deleted the record
});

export default schema;


