import express from "express";
import Login from "./routes/Login.js";
import User from "./routes/User.js";
import Settings from "./routes/Settings.js";
import Lead from "./routes/Lead.js";
import Customer from "./routes/Customer.js";

const router = express.Router();
router.use("/login", Login);
router.use("/user", User);
router.use("/settings", Settings);
router.use("/lead", Lead);
router.use("/customer", Customer);

export default router;


