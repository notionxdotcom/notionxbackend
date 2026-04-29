import pool from "../../configs/db.js";
import WalletService from "../../services/walletservice.js";

const walletService = new WalletService();

/**
 * 1. User requests a deposit (Status: Pending)
 */
const requestDeposit = async (req, res) => {
  
const { transactionId } = req.body; 

  try {
    const result = await pool.query(
      `UPDATE ledger 
       SET status = 'processing'
       WHERE ledger_id = $1 AND status = 'pending'
       RETURNING *`,
      [transactionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Transaction not found." });
    }

    res.status(200).json({ status: "success", message: "Deposit submitted for approval." });
  } catch (err) {
    console.error("Update Error:", err);
    res.status(500).json({ status: "error", message: "Database error." });
  }
};

/**
 * 2. Admin approves deposit (Credits Wallet)
 */
const approveDeposit = async (req, res) => {
  const { depositId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock the deposit record to prevent "Double-Click" exploits
    const depositRes = await client.query(
      `SELECT l.*, w.user_id 
       FROM ledger l 
       JOIN wallets w ON l.wallet_id = w.wallet_id 
       WHERE l.ledger_id = $1 
       AND l.status IN ('pending', 'processing') 
       AND l.entry_type = 'deposit' 
       FOR UPDATE`, // FOR UPDATE ensures no other server instance can process this row simultaneously
      [depositId]
    );

    if (depositRes.rows.length === 0) {
      throw new Error("Deposit not found, already processed, or invalid status.");
    }

    const { user_id, amount, description, wallet_id } = depositRes.rows[0];

    // SECURITY CHECK: Ensure deposit amount is valid and positive
    const depositAmount = Number(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      throw new Error("Invalid deposit amount detected.");
    }

    // 2. Credit the User's wallet via walletService
    await walletService.creditWallet(wallet_id, depositAmount, "deposit", "completed", description, client);

    // 3. Update the specific ledger record to 'completed'
    await client.query(
      "UPDATE ledger SET status = 'completed', updated_at = NOW() WHERE ledger_id = $1",
      [depositId]
    );

    // --- START BULLETPROOF TIERED REFERRAL LOGIC ---
    const tiers = [
      { level: 1, percent: 0.10, label: "Direct Referral" },
      { level: 2, percent: 0.02, label: "Level 2 Indirect" },
      { level: 3, percent: 0.01, label: "Level 3 Indirect" }
    ];

    let currentUserId = user_id;
    
    // ANTI-FRAUD: Track who has been paid to prevent Circular Loops (e.g., A -> B -> A)
    // We start by adding the original depositor so they can NEVER earn a commission on their own money.
    const paidUsers = new Set([user_id]); 

    for (const tier of tiers) {
      // Find the referrer using your exact column name
      const userRefRes = await client.query(
        "SELECT referred_by_id FROM users WHERE user_id = $1",
        [currentUserId]
      );

      const referrerId = userRefRes.rows[0]?.referred_by_id;

      // If no referrer exists, break the loop and stop climbing the tree
      if (!referrerId) break;

      // ANTI-FRAUD: Check for infinite loops or self-referrals
      if (paidUsers.has(referrerId)) {
        console.warn(` Circular referral loop detected stopping at user: ${referrerId}`);
        break; // Stop paying immediately
      }
      
      paidUsers.add(referrerId); // Mark this user as processed

      // ANTI-FRAUD: Strict Math to prevent floating point bugs (e.g. paying 10.000000001)
      // Math.floor ensures we round down to the nearest kobo/cent. The house keeps the fraction.
      const rawCommission = depositAmount * tier.percent;
      const commissionAmount = Math.floor(rawCommission * 100) / 100;

      if (commissionAmount > 0) {
        const referrerWalletRes = await client.query(
          "SELECT wallet_id FROM wallets WHERE user_id = $1",
          [referrerId]
        );

        if (referrerWalletRes.rows.length > 0) {
          const referrerWalletId = referrerWalletRes.rows[0].wallet_id;
          const commReference = `TIER${tier.level}-${description.substring(0, 15)}`; 

          await walletService.creditWallet(
            referrerWalletId,
            commissionAmount,
            "referral_commission", 
            "completed",
            commReference,
            client
          );
        }
      }

      // Move up the tree for the next loop iteration
      currentUserId = referrerId;
    }
    // --- END TIERED REFERRAL LOGIC ---

    await client.query("COMMIT");
    res.json({ status: "success", message: "Deposit approved and tiered commissions paid." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Approve Error:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
};
/**
 * 3. User requests withdrawal (Debits Wallet immediately to Pending)
 */
/**
 * 2. Admin approves deposit (Credits Wallet)
 */

/**
 * 3. User requests withdrawal
 */

/**
 * 2. Admin approves withdrawal
 * LOGIC: This is where the DEBIT actually happens.
 */
const requestWithdrawal = async (req, res) => {
  const user_id = req.user.user_id; 
  const { amount, net_amount, fee } = req.body; 

  try {
    // 1. Business Rule: Check if user has a product
    const products = await pool.query("SELECT 1 FROM user_products WHERE user_id = $1 LIMIT 1", [user_id]);
    if (products.rows.length === 0) {
        throw new Error("You must purchase a product before you can withdraw.");
    }

    // 2. MATH VALIDATION (Security)
    // We round to 2 decimal places to prevent floating point errors (e.g., 0.000000001)
    const expectedFee = Math.round((amount * 0.20) * 100) / 100;
    const expectedNet = Math.round((amount - expectedFee) * 100) / 100;

    // Check if the frontend math matches the backend math
    if (Math.abs(net_amount - expectedNet) > 0.1) {
        throw new Error("Calculation mismatch. Please refresh and try again.");
    }

    // 3. Pre-check Balance
    const wallet = await pool.query("SELECT balance FROM wallets WHERE user_id = $1", [user_id]);
    if (wallet.rows.length === 0) throw new Error("Wallet not found.");
    
    if (parseFloat(wallet.rows[0].balance) < amount) {
        throw new Error("Insufficient funds in wallet.");
    }

    const reference = `WD-${Date.now()}`;

    // 4. INSERT RECORD AS PENDING
    await pool.query(
      `INSERT INTO withdrawals (user_id, amount, net_amount, fee, status, reference_id) 
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [user_id, amount, net_amount, fee, reference]
    );

    res.status(201).json({ status: "success", message: "Withdrawal request submitted for approval." });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
};

/**
 * 2. Admin approves withdrawal
 * Math Fix: Debits the FULL 'amount' (Total Deduction)
 */
const approveWithdrawal = async (req, res) => {
  const { withdrawalId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Get the withdrawal record and LOCK it
    const wdRes = await client.query(
      "SELECT * FROM withdrawals WHERE id = $1 AND status = 'pending' FOR UPDATE",
      [withdrawalId]
    );

    if (wdRes.rows.length === 0) {
      throw new Error("Withdrawal not found or already processed.");
    }

    // amount = The total deduction (e.g., 1000)
    // net_amount = What the user gets (e.g., 800)
    const { user_id, amount, reference_id } = wdRes.rows[0];

    // 2. FORCE DEBIT
    // Ensure amount is a number. This MUST deduct the FULL 'amount' (100%)
const deductionAmount = Number(amount);
    
    if (isNaN(deductionAmount) || deductionAmount <= 0) {
      throw new Error("Invalid withdrawal amount in database.");
    }

    // Call your wallet service to perform the subtraction in the DB
    await walletService.debitWallet(user_id, deductionAmount, "withdrawal", reference_id, client);

    // 3. Update the withdrawal status to completed
    await client.query(
      "UPDATE withdrawals SET status = 'completed' WHERE id = $1",
      [withdrawalId]
    );

    await client.query("COMMIT");
    res.json({ 
      status: "success", 
      message: `Approved. ₦${deductionAmount} debited from wallet.` 
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Approval Error:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  } finally {
    client.release();
  }
};
/**
 * 3. Admin rejects withdrawal
 * LOGIC: Since no money was taken during the request, we just flip the status.
 */
const rejectWithdrawal = async (req, res) => {
  const { withdrawalId } = req.params;

  try {
    const result = await pool.query(
      "UPDATE withdrawals SET status = 'rejected', updated_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING *",
      [withdrawalId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ message: "Request not found or already processed." });
    }

    res.json({ status: "success", message: "Withdrawal request rejected." });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
/**
 * GET /api/admin/pending-deposits
 * Retrieves all pending deposits with pagination
 */
const getPendingDeposits = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    // 1. Count total pending/processing items in the ledger
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM ledger WHERE status IN ('pending', 'processing') AND entry_type = 'deposit'"
    );
    const totalItems = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    // 2. Fetch data: mapping 'description' to 'reference' for the frontend
    const depositsRes = await pool.query(
   `SELECT 
    l.ledger_id, 
    l.amount, 
    l.description AS reference, 
    l.status, 
    l.created_at, 
    u.phone_number AS phone_number 
   FROM ledger l
   JOIN wallets w ON l.wallet_id = w.wallet_id  -- l.wallet_id links the transaction to the wallet
   JOIN users u ON w.user_id = u.user_id
   WHERE l.status IN ('pending', 'processing') 
   AND l.entry_type = 'deposit'
   ORDER BY l.created_at DESC
   LIMIT $1 OFFSET $2`,
  
      [limit, offset]
    );

    res.status(200).json({
      status: "success",
      data: depositsRes.rows,
      pagination: {
        totalItems,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (err) {
    console.error("Admin Fetch Error:", err);
    res.status(500).json({ status: "error", message: "Failed to fetch deposits." });
  }
};
const addBankDetails = async (req, res) => {
  const { bank_name, account_number, account_name } = req.body;
  const user_id = req.user.user_id;

  try {
    const result = await pool.query(
      `INSERT INTO user_bank_details (user_id, bank_name, account_number, account_name) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         bank_name = EXCLUDED.bank_name,
         account_number = EXCLUDED.account_number,
         account_name = EXCLUDED.account_name,
         updated_at = NOW()
       RETURNING *`, 
      [user_id, bank_name, account_number, account_name]
    );
    if (result.rows.length === 0) {
        return res.status(400).json({ status: "error", message: "Account already exists." });
    }

    res.status(201).json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.log(err);
    
    res.status(500).json({ status: "error", message: "Database error." });
  }
};
const getMyBankDetails = async (req, res) => {
  const user_id = req.user.user_id; // Derived from your authMiddleware

  try {
    const result = await pool.query(
      "SELECT bank_name, account_number, account_name FROM user_bank_details WHERE user_id = $1",
      [user_id]
    );

    // If no account is found, we return null or an empty object so the 
    // React frontend knows to show the "Add Account" form.
    if (result.rows.length === 0) {
      return res.status(200).json({ 
        status: "success", 
        data: null, 
        message: "No bank account linked yet." 
      });
    }

    res.status(200).json({ 
      status: "success", 
      data: result.rows[0] 
    });
  } catch (err) {
    console.error("Fetch Bank Details Error:", err);
    res.status(500).json({ 
      status: "error", 
      message: "Internal server error while fetching bank details." 
    });
  }
};
const getWithdrawals = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status || 'pending';
  const offset = (page - 1) * limit;

  try {
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM withdrawals WHERE status = $1",
      [status]
    );
    const totalItems = parseInt(countRes.rows[0].count);

    const withdrawalsRes = await pool.query(
      `SELECT 
        w.*, 
        u.phone_number,
      
        b.bank_name,
        b.account_number,
        b.account_name
       FROM withdrawals w
       JOIN users u ON w.user_id = u.user_id
       LEFT JOIN user_bank_details b ON w.user_id = b.user_id
       WHERE w.status = $1
       ORDER BY w.created_at DESC
       LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );

    res.status(200).json({
      status: "success",
      data: withdrawalsRes.rows,
      pagination: {
        totalItems,
        totalPages: Math.ceil(totalItems / limit),
        currentPage: page,
        limit
      }
    });
  } catch (err) {
    console.error("Fetch Error:", err);
    res.status(500).json({ status: "error", message: "Database error." });
  }
};
 const rejectDeposit = async (req, res) => {
  const { depositId } = req.params;

  try {
    // 1. Check if the transaction exists and is in a state that can be rejected
    const txnCheck = await pool.query(
      "SELECT status FROM ledger WHERE ledger_id = $1 AND entry_type = 'deposit'",
      [depositId]
    );

    if (txnCheck.rows.length === 0) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    const currentStatus = txnCheck.rows[0].status;
    if (currentStatus === 'completed' || currentStatus === 'rejected') {
      return res.status(400).json({ 
        message: `Cannot reject a transaction that is already ${currentStatus}` 
      });
    }

    // 2. Update the status to 'rejected'
    await pool.query(
      "UPDATE ledger SET status = 'rejected' WHERE ledger_id = $1",
      [depositId]
    );

    res.status(200).json({
      status: "success",
      message: "Transaction rejected successfully"
    });

  } catch (err) {
    console.error("Reject Error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
 const getActiveDeposit = async (req, res) => {
  try {
    const userId = req.user.user_id;

    const result = await pool.query(
      `SELECT l.ledger_id, l.amount, l.description, l.status
       FROM ledger l
       JOIN wallets w ON l.wallet_id = w.wallet_id
       WHERE w.user_id = $1 
AND l.status = 'pending'
AND l.entry_type = 'deposit'
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length > 0) {
      return res.json({ active: true, deposit: result.rows[0] });
    }
    
    res.json({ active: false });
  } catch (err) {
    res.status(500).json({ message: "Error fetching active deposit" });
  }
};
const cancelDeposit = async (req, res) => {
  const { depositId } = req.params;
  const userId = req.user.user_id;

  // 1. Basic validation to prevent UUID syntax crashes
  if (!depositId || depositId === 'undefined') {
    return res.status(400).json({ message: "Invalid Transaction ID." });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 2. Fetch the transaction and lock the row
    // We JOIN with wallets to ensure the transaction actually belongs to the user
    const txnRes = await client.query(
      `SELECT l.status, l.ledger_id 
       FROM ledger l
       JOIN wallets w ON l.wallet_id = w.wallet_id
       WHERE l.ledger_id = $1 AND w.user_id = $2
       FOR UPDATE`,
      [depositId, userId]
    );

    if (txnRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Transaction not found." });
    }

    const { status } = txnRes.rows[0];

    // 3. THE COMMITMENT WALL: Business Logic Checks
    if (status === 'completed') {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "Cannot cancel a completed transaction." });
    }

    if (status === 'rejected') {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "This transaction is already cancelled or rejected." });
    }

    if (status === 'processing') {
      await client.query("ROLLBACK");
      return res.status(400).json({ 
        message: "Confirmation in progress. You cannot cancel once you have clicked 'I Have Paid'." 
      });
    }

    // 4. If all checks pass (Status is 'pending'), update to rejected
    await client.query(
      `UPDATE ledger 
       SET status = 'rejected', 
           description = description || ' (Cancelled by User)', 
           updated_at = NOW() 
       WHERE ledger_id = $1`,
      [depositId]
    );

    await client.query("COMMIT");

    res.status(200).json({
      status: "success",
      message: "Transaction cancelled successfully."
    });

  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Cancel Deposit Error:", err);
    res.status(500).json({ message: "Internal server error. Please try again." });
  } finally {
    client.release();
  }
};
const getReferralChain = async (req, res) => {
  const userId = req.user.user_id; // The logged-in user asking for their network

  try {
    // 1. Fetch LEVEL 1 (Direct Referrals)
    const level1Res = await pool.query(
      `SELECT user_id, phone_number, created_at 
       FROM users 
       WHERE referred_by_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );
    const level1Users = level1Res.rows;

    // If they haven't referred anyone directly, their whole chain is empty.
    if (level1Users.length === 0) {
      return res.status(200).json({
        status: "success",
        data: {
          totalNetworkSize: 0,
          level1: [],
          level2: [],
          level3: []
        }
      });
    }

    // Extract all the Level 1 user IDs so we can find who THEY referred
    const level1Ids = level1Users.map(user => user.user_id);

    // 2. Fetch LEVEL 2 (Users referred by Level 1)
    // We use ANY($1::uuid[]) which is much faster and safer than a loop or dynamic IN clause
    const level2Res = await pool.query(
      `SELECT user_id, phone_number, referred_by_id, created_at 
       FROM users 
       WHERE referred_by_id = ANY($1::uuid[]) 
       ORDER BY created_at DESC`,
      [level1Ids]
    );
    const level2Users = level2Res.rows;

    // Extract Level 2 IDs to find Level 3
    const level2Ids = level2Users.map(user => user.user_id);

    // 3. Fetch LEVEL 3 (Users referred by Level 2)
    let level3Users = [];
    if (level2Ids.length > 0) {
      const level3Res = await pool.query(
        `SELECT user_id, phone_number, referred_by_id, created_at 
         FROM users 
         WHERE referred_by_id = ANY($1::uuid[]) 
         ORDER BY created_at DESC`,
        [level2Ids]
      );
      level3Users = level3Res.rows;
    }

    // 4. Return the formatted data tree to the frontend
    res.status(200).json({
      status: "success",
      data: {
        totalNetworkSize: level1Users.length + level2Users.length + level3Users.length,
        level1: level1Users,
        level2: level2Users,
        level3: level3Users
      }
    });

  } catch (err) {
    console.error("Referral Chain Error:", err);
    res.status(500).json({ status: "error", message: "Failed to load referral network." });
  }
};
export { 
  requestDeposit, 
  approveDeposit, 
  requestWithdrawal, 
  approveWithdrawal, 
  rejectWithdrawal ,
  getPendingDeposits,
  addBankDetails,
  getMyBankDetails,
  getWithdrawals,
  rejectDeposit,
  getActiveDeposit,
  cancelDeposit,
  getReferralChain
};