
import express from "express";
import createusercontroller from "../Controller/createusercontroller.js";
import loginuser from "../Controller/login.js";
import getuserbyid from "../Controller/getuserdetails.js";
const router = express.Router();

router.post("/signup", createusercontroller);
router.post("/login", loginuser);
router.get("/me", getuserbyid);



export default router;
