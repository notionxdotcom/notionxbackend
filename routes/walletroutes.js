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
// This creates the record BEFORE the user sees the account details
router.post('/initiate-deposit', async (req, res) => {
  const { amount } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO ledger (wallet_id, amount, entry_type, status, description) 
       VALUES ((SELECT id FROM wallets WHERE user_id = $1), $2, 'deposit', 'pending', 'Awaiting bank transfer confirmation') 
       RETURNING id`,
      [req.user.user_id, amount]
    );
    res.json({ transactionId: result.rows[0].id });
  } catch (err) {
    res.status(500).send("Server Error");
  }
});


export default router