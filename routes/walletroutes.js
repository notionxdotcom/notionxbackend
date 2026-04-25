import express from "express"
import {   
   requestDeposit, 
  approveDeposit, 
  requestWithdrawal, 
  approveWithdrawal, 
  rejectWithdrawal ,
getPendingDeposits,addBankDetails,
getMyBankDetails, getWithdrawals} from "../Controller/walletcontrollers/walletcontroller.js";
 ;
import getwalletbyid from "../Controller/walletcontrollers/getwalletdetails.js";
const router=express.Router()
router.get("/my-balance", getwalletbyid);
router.post("/requestdeposit", requestDeposit);
router.post("/requestwithdrawal", requestWithdrawal);
router.get("/pending-deposits", getPendingDeposits);
router.post("/approve-deposit/:depositId", approveDeposit);
router.post("/approve-deposit/:depositId", approveDeposit);
router.post("/approve-withdrawal/:withdrawalId", approveWithdrawal);
router.post("/reject-withdrawal/:withdrawalId", rejectWithdrawal);
router.post("/addbankdetails", addBankDetails);
router.get("/my-bank-details", getMyBankDetails);
router.get("/withdrawals", getWithdrawals);



export default router