import mongoose from 'mongoose';
import mongooseDelete from "mongoose-delete";

const schema = new mongoose.Schema({
    shopify_cus_id               : {type: String,required: true},
    shopify_request_body         : {type: String,required: true},
    
    salesforce_lead_id           : {type: String,required: true},
    salesforce_lead_response_body: {type: String,required: true},

    salesforce_note_id           : {type: String},
    salesforce_note_response_body: {type: String},
    
    salesforce_contact_id        : {type: String},
    salesforce_account_id        : {type: String},
    // salesforce_opportunity_id    : {type: String},
    is_lead_converted            : {type: Boolean, default: 0, description: '0 = Lead Not Converted, 1 = Lead Converted'},
    
    shopify_company_response        : {type: String},
    shopify_company_id              : {type: String},
    shopify_company_contact_response: {type: String},
    shopify_company_contact_id      : {type: String},

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
        enum: [1, 2, 3, 4, 5, 6, 7],
        default: 1,
        description: '1 = Web, 2 = Phone Inquiry, 3 = Partner - Referral, 4 = Purchased - List, 5 = Other, 6 = Shopify Registration, 7 = Migrate Customer' 
    },
    engagement_type: {
        type: Number,
        enum: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] 
    },
    engagement_note: {type: String},
    deletedAt      : {type: Date}
},{
    timestamps: true
});

schema.plugin(mongooseDelete, { 
    deletedAt: true, // Adds deletedAt field
    overrideMethods: "all",  // Ensures soft-deleted records are hidden from normal queries
    deletedBy: false, // Optionally store the user who deleted the record
});

schema.virtual('diaries', {
    ref: 'Diary',
    localField: '_id',
    foreignField: 'customer_id'
});

schema.virtual('events', {
    ref: 'Events',
    localField: '_id',
    foreignField: 'customer_id',
});

schema.set('toObject', { virtuals: true });
schema.set('toJSON', { virtuals: true });


export default schema;


