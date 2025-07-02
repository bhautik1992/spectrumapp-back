import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import moment from "moment";
import Settings from '../models/Settings.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
    },
    logger: false,
    debug: false,
});

export const passwordEmail = async (user,plainPassword) => {
    // try {
    //     const settings = await Settings.findOne().select('-createdAt -updatedAt -deletedAt -__v');

    //     const emailTemplatePath = path.join(__dirname, '../email/password.html');
    //     let emailTemplate = fs.readFileSync(path.join(emailTemplatePath), "utf8");
        
    //     const replacements         = {
    //         "{{company_name}}"     : process.env.APP_NAME,
    //         "{{employee_name}}"    : `${user.first_name} ${user.last_name}`,
    //         "{{employee_email}}"   : user.company_email,
    //         "{{employee_password}}": plainPassword,
    //         "{{current_year}}"     : moment().format("YYYY"),
    //         "{{login_url}}"        : process.env.ALLOWED_ORIGIN,
    //         "{{linkedin_url}}"     : settings.linkedin_url,
    //         "{{twitter_url}}"      : settings.twitter_url,
    //     };

    //     for (const key in replacements) {
    //         emailTemplate = emailTemplate.replace(new RegExp(key, "g"), replacements[key]);
    //     }

    //     const mailOptions = {
    //         from   : `"HR Team" <${process.env.NO_REPLY}>`,
    //         to     : user.company_email,
    //         // to     : 'bhautik.hailysoft@gmail.com',
    //         subject: "Welcome Aboard! Your Account Details Inside 🎉",
    //         html   : emailTemplate,
    //         attachments: [
    //             {
    //                 filename: 'logo_name.png',
    //                 path: path.join(__dirname, '../assets/images/logo/logo_name.png'),
    //                 cid: 'logo_name'
    //             }
    //         ]
    //     };

    //     const info =  await transporter.sendMail(mailOptions);

    //     // console.log("Email sent successfully!");
    //     // console.log("Message ID:", info.messageId);
    //     // console.log("Response:", info.response);

    //     return true;
    // } catch (error) {
    //     // console.log(error.message)
    //     return false;
    // }
};

export const resetLinkEmail = async (user,resetLink) => {
    // try {
    //     const settings = await Settings.findOne().select('-createdAt -updatedAt -deletedAt -__v');

    //     const emailTemplatePath = path.join(__dirname, '../email/forgot_password.html');
    //     let emailTemplate = fs.readFileSync(path.join(emailTemplatePath), "utf8");
        
    //     const replacements         = {
    //         "{{company_name}}"      : process.env.APP_NAME,
    //         "{{employee_name}}"     : `${user.first_name} ${user.last_name}`,
    //         "{{reset_password_url}}": `${resetLink}`,
    //         "{{current_year}}"      : moment().format("YYYY"),
    //         "{{linkedin_url}}"      : settings.linkedin_url,
    //         "{{twitter_url}}"       : settings.twitter_url,
    //     };

    //     for (const key in replacements) {
    //         emailTemplate = emailTemplate.replace(new RegExp(key, "g"), replacements[key]);
    //     }

    //     const mailOptions = {
    //         from   : `"PMS" <${process.env.NO_REPLY}>`,
    //         to     : user.company_email,
    //         // to     : 'bhautik.hailysoft@gmail.com',
    //         subject: "Password Reset Request",
    //         html   : emailTemplate,
    //         attachments: [
    //             {
    //                 filename: 'logo_name.png',
    //                 path: path.join(__dirname, '../assets/images/logo/logo_name.png'),
    //                 cid: 'logo_name'
    //             }
    //         ]
    //     };

    //     const info =  await transporter.sendMail(mailOptions);

    //     // console.log("Email sent successfully!");
    //     // console.log("Message ID:", info.messageId);
    //     // console.log("Response:", info.response);

    //     return true;
    // } catch (error) {
    //     // console.log(error.message)
    //     return false;
    // }
}


