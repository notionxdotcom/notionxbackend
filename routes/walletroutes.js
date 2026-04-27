import express from "express"
import pool from "../configs/db.js";
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
// POST /api/wallet/initialize-deposit
router.post('/initialize-deposit',  async (req, res) => {
  const { amount } = req.body;
  const userId = req.user.id;
  
  // Generate a PERMANENT reference to save in the DB
  const reference = "NX" + Math.random().toString(36).substring(2, 9).toUpperCase();

  try {
    const result = await pool.query(
      `INSERT INTO ledger (wallet_id, amount, entry_type, status, description, reference) 
       VALUES ((SELECT id FROM wallets WHERE user_id = $1), $2, 'deposit', 'pending', $3, $4) 
       RETURNING id, reference`,
      [userId, amount, `Pending recharge of ₦${amount.toLocaleString()}`, reference]
    );

    res.status(201).json({
      transactionId: result.rows[0].id,
      reference: result.rows[0].reference
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to initialize transaction" });
  }
});

// POST /api/wallet/request-approval
router.post('/request-approval',  async (req, res) => {
  const { transactionId } = req.body;

  try {
    // Update the existing record instead of creating a new one
    await pool.query(
      `UPDATE ledger 
       SET status = 'processing', description = 'Awaiting admin verification'
       WHERE id = $1 AND wallet_id = (SELECT id FROM wallets WHERE user_id = $2)`,
      [transactionId, req.user.id]
    );

    res.json({ message: "Verification request submitted" });
  } catch (err) {
    res.status(500).json({ message: "Submission failed" });
  }
});


export default router