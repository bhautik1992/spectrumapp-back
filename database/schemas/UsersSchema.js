import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import mongooseDelete from "mongoose-delete";

const schema = new mongoose.Schema({
    full_name          : {type: String, required: true, maxlength: 50},
    email              : {type: String, required: true, maxlength: 50, unique: true},
    profile_photo      : {type: String},
    password           : {type: String, required: true, minlength: 8, maxlength: 10},
    color_code         : {type: String, default: '#ffffff'},
    status             : {type: Boolean, default: 1, description: '0 = In-Active, 1 = Active'},
    reset_token        : {type: String, maxlength: 200},
    reset_token_expires: {type: Date},
    deletedAt          : {type: Date},
},{
    timestamps: true
});

schema.statics.hidden = '-password -createdAt -updatedAt -deleted -__v';

schema.plugin(mongooseDelete, { 
    deletedAt: true, // Adds deletedAt field
    overrideMethods: "all",  // Ensures soft-deleted records are hidden from normal queries
    deletedBy: false, // Optionally store the user who deleted the record
});

schema.pre('save', async function(next) {
    // Only hash the password if it's being modified or created
    if (!this.isModified('password')) return next();  

    try {
        const salt    = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

schema.methods.comparePassword = async function(password) {
    return bcrypt.compare(password, this.password);
};

export default schema;


