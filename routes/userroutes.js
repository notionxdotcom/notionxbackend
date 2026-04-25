
import express from "express";

import getuserbyid from "../Controller/getuserdetails.js";
import getMyActiveProducts from "../Controller/walletcontrollers/getproducts.js";
const router = express.Router();


router.get("/me", getuserbyid);
router.get("/my-products", getuserbyid);



export default router;
