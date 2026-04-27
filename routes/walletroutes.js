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
 import pool from "../configs/db.js";
import getwalletbyid from "../Controller/walletcontrollers/getwalletdetails.js";
import { rejectDeposit } from "../Controller/walletcontrollers/walletcontroller.js";
import { getActiveDeposit } from "../Controller/walletcontrollers/walletcontroller.js";
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
router.post("/reject-deposit/:depositId", rejectDeposit);
router.post("/cancel-deposit/:depositId", rejectDeposit);
router.get("/active-deposit", getActiveDeposit);
// This creates the record BEFORE the user sees the account details
router.post('/initiate-deposit', async (req, res) => {
  const { amount } = req.body;
 const reference = "NX" + Math.random().toString(36).substring(2, 9).toUpperCase();
  
  try {
    const result = await pool.query(
      `INSERT INTO ledger (wallet_id, amount, entry_type, status, description) 
       VALUES ((SELECT wallet_id FROM wallets WHERE user_id = $1), $2, 'deposit', 'pending', $3) 
       RETURNING ledger_id`,
      [req.user.user_id, amount, reference]
    );
    
    // 2. Send both the ID and the Reference back to the frontend
    res.json({ 
      transactionId: result.rows[0].ledger_id,
      reference: reference 
    });
  } catch (err) {
    console.log(err);
    
    res.status(500).send("Server Error");
    
  }
});


export default router