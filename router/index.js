import express from "express";
import Login from "./routes/Login.js";
import User from "./routes/User.js";
import Settings from "./routes/Settings.js";

const router = express.Router();
router.use("/login", Login);
router.use("/user", User);
router.use("/settings", Settings);

export default router;


