
import express from "express";
import getMyReferrals from '../Controller/walletcontrollers/getrefferedusers.js';
import getuserbyid from "../Controller/getuserdetails.js";
import getMyActiveProducts from "../Controller/walletcontrollers/getproducts.js";
const router = express.Router();


router.get("/me", getuserbyid);
router.get("/my-products", getMyActiveProducts);
router.get('/my-referrals', getMyReferrals);


export default router;
