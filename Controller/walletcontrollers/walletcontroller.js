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

    // Lock and get deposit details
    const depositRes = await client.query(
      "SELECT * FROM deposits WHERE id = $1 AND status = 'processing' FOR UPDATE",
      [depositId]
    );

    if (depositRes.rows.length === 0) throw new Error("Deposit not found or already processed.");

    const { user_id, amount, reference } = depositRes.rows[0];
  const walletRes = await client.query(
      "SELECT * FROM wallets WHERE  user_id = $1",
      [user_id]
    );
    const wallet_id=walletRes.rows[0].wallet_id
    
    await walletService.creditWallet(wallet_id, amount,"deposit","completed", reference, client);
    // --- START REFERRAL COMMISSION LOGIC ---
    
    // 3. Check if this user was referred by someone
    const userRefRes = await client.query(
      "SELECT referred_by_id FROM users WHERE user_id = $1",
      [user_id]
    );

    const referrerId = userRefRes.rows[0]?.referred_by_id;

    if (referrerId) {
      // Calculate 10% commission
      const commissionAmount = Number(amount) * 0.10;

      if (commissionAmount > 0) {
        // Find referrer's wallet
        const referrerWalletRes = await client.query(
          "SELECT wallet_id FROM wallets WHERE user_id = $1",
          [referrerId]
        );

        if (referrerWalletRes.rows.length > 0) {
          const referrerWalletId = referrerWalletRes.rows[0].wallet_id;
          const commReference = `COMM-${reference}`; // Link commission to original deposit ref

          // Credit Referrer's wallet
          await walletService.creditWallet(
            referrerWalletId, 
            commissionAmount, 
            "referral_commission",
             "completed",
            commReference, 
           
            client
          );

          // Optional: Add a specific ledger entry if creditWallet doesn't do it clearly
          // await client.query(
          //   "INSERT INTO ledger (user_id, amount, type, description) VALUES ($1, $2, 'credit', $3)",
          //   [referrerId, commissionAmount, `Referral commission from ${user_id}`]
          // );
        }
      }
    }
    // --- END REFERRAL COMMISSION LOGIC ---
    
    // Update deposit status
    await client.query(
      "UPDATE deposits SET status = 'approved', updated_at = NOW() WHERE id = $1", 
      [depositId]
    );

    await client.query("COMMIT");
    res.json({ status: "success", message: "Deposit approved and wallet funded." });
  } catch (err) {
    await client.query("ROLLBACK");
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
      "UPDATE withdrawals SET status = 'completed', updated_at = NOW() WHERE id = $1",
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
    u.phone AS phone_number 
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
export { 
  requestDeposit, 
  approveDeposit, 
  requestWithdrawal, 
  approveWithdrawal, 
  rejectWithdrawal ,
  getPendingDeposits,
  addBankDetails,
  getMyBankDetails,
  getWithdrawals
};