import express from "express";
import Login from "./routes/Login.js";
import User from "./routes/User.js";
import Settings from "./routes/Settings.js";
import Lead from "./routes/Lead.js";
import Customer from "./routes/Customer.js";
import Product from "./routes/Product.js";
import Home from "./routes/Home.js";

const router = express.Router();
router.use("/login", Login);
router.use("/user", User);
router.use("/settings", Settings);
router.use("/lead", Lead);
router.use("/customer", Customer);
router.use("/product", Product);
router.use("/home", Home);

export default router;


