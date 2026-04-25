
import express from "express";

import getuserbyid from "../Controller/getuserdetails.js";
const router = express.Router();


router.get("/me", getuserbyid);



export default router;
