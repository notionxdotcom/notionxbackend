
import express from "express";
import getMyReferrals from '../Controller/walletcontrollers/getrefferedusers.js';
import getuserbyid from "../Controller/getuserdetails.js";
import getMyActiveProducts from "../Controller/walletcontrollers/getproducts.js";
import getLedger from "../Controller/walletcontrollers/getledger.js";
import getAllUsers from "../Controller/getallusers.js";
const router = express.Router();


router.get("/me", getuserbyid);
router.get("/my-products", getMyActiveProducts);
router.get('/my-referrals', getMyReferrals);
router.get('/ledger', getLedger);
router.get('/users', getAllUsers);


export default router;
