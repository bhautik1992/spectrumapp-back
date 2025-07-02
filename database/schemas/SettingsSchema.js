import mongoose from 'mongoose';
import mongooseDelete from "mongoose-delete";

const schema = new mongoose.Schema({
    sf_access_token: {type: String,maxlength: 150},
    sf_client_id   : {type: String,maxlength: 15},
    sf_id          : {type: String,maxlength: 25},
    sf_instance_url: {type: String,maxlength: 100},
    deletedAt      : {type: Date}
},{
    timestamps: true
});

schema.plugin(mongooseDelete, { 
    deletedAt: true, // Adds deletedAt field
    overrideMethods: "all",  // Ensures soft-deleted records are hidden from normal queries
    deletedBy: false, // Optionally store the user who deleted the record
});

export default schema;


