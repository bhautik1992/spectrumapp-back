import mongoose from 'mongoose';
import mongooseDelete from "mongoose-delete";

const schema = new mongoose.Schema({
    sf_instance_url  : {type: String,maxlength: 100},
    sf_client_id     : {type: String},
    sf_client_secret : {type: String},
    sf_username      : {type: String},
    sf_security_token: {type: String},
    sf_access_token  : {type: String},
    deletedAt        : {type: Date}
},{
    timestamps: true
});

schema.plugin(mongooseDelete, { 
    deletedAt: true, // Adds deletedAt field
    overrideMethods: "all",  // Ensures soft-deleted records are hidden from normal queries
    deletedBy: false, // Optionally store the user who deleted the record
});

export default schema;


