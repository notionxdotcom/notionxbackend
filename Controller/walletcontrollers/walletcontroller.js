import pool from "../../configs/db.js";
import WalletService from "../../services/walletservice.js";

const walletService = new WalletService();

/**
 * 1. User requests a deposit (Status: Pending)
 */
const requestDeposit = async (req, res) => {
  const user_id = req.user.user_id;
  const { amount, reference, } = req.body;

  try {
    await pool.query(
      "INSERT INTO deposits (user_id, amount, reference, status) VALUES ($1, $2, $3,  'pending')",
      [user_id, amount, reference]
    );
    res.status(201).json({ status: "success", message: "Deposit submitted for approval." });
  } catch (err) {
    console.error("Deposit Request Error:", err);
    res.status(500).json({ status: "error", message: "Reference already exists or database error." });
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
      "SELECT * FROM deposits WHERE id = $1 AND status = 'pending' FOR UPDATE",
      [depositId]
    );

    if (depositRes.rows.length === 0) throw new Error("Deposit not found or already processed.");

    const { user_id, amount, reference } = depositRes.rows[0];
  const walletRes = await client.query(
      "SELECT * FROM wallets WHERE  user_id = $1",
      [user_id]
    );
    const wallet_id=walletRes.rows[0].wallet_id
    
    await walletService.creditWallet(wallet_id, amount, reference, client);
    
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
const requestWithdrawal = async (req, res) => {
  const user_id = req.user.user_id; 
  const { amount } = req.body;

  try {
    // 1. Check if user has a product (Business Rule)
    const products = await pool.query(
      "SELECT 1 FROM user_products WHERE user_id = $1 LIMIT 1",
      [user_id]
    );
    if (products.rows.length === 0) {
        throw new Error("You must purchase a product before you can withdraw.");
    }

    // 2. Check if they actually have enough balance right now
    const wallet = await pool.query(
      "SELECT wallet_id, balance FROM wallets WHERE user_id = $1",
      [user_id]
    );
    
    if (wallet.rows.length === 0) throw new Error("Wallet not found.");
    
    const wallet_id = wallet.rows[0].wallet_id;
    const currentBalance = parseFloat(wallet.rows[0].balance);

    if (currentBalance < amount) {
        throw new Error("Insufficient funds for this withdrawal.");
    }

    const reference = `WD-${Date.now()}`;

    // 3. Just insert the request as PENDING. (No debiting here as per your request)
    await pool.query(
      "INSERT INTO withdrawals (user_id, wallet_id, status, reference_id, amount) VALUES ($1, $2, $3, $4, $5)",
      [user_id, wallet_id, 'pending', reference, amount]
    );

    res.status(201).json({ status: "success", message: "Withdrawal request submitted for approval." });
  } catch (err) {
    res.status(400).json({ status: "error", message: err.message });
  }
};

/**
 * 2. Admin approves withdrawal
 * LOGIC: This is where the DEBIT actually happens.
 */
const approveWithdrawal = async (req, res) => {
  const { withdrawalId } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Lock the withdrawal record and check if it's still pending
    const wdRes = await client.query(
      "SELECT * FROM withdrawals WHERE id = $1 AND status = 'pending' FOR UPDATE",
      [withdrawalId]
    );

    if (wdRes.rows.length === 0) throw new Error("Withdrawal not found or already processed.");

    const { user_id, amount, reference_id } = wdRes.rows[0];

    // 2. PERFORM THE DEBIT NOW
    // This will throw an error if the user spent the money between the request and now
    await walletService.debitWallet(user_id, amount, "withdrawal", reference_id, client);

    // 3. Mark as completed
    await client.query(
      "UPDATE withdrawals SET status = 'completed', updated_at = NOW() WHERE id = $1",
      [withdrawalId]
    );

    await client.query("COMMIT");
    res.json({ status: "success", message: "Withdrawal approved and funds debited." });
  } catch (err) {
    await client.query("ROLLBACK");
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
  // Get page and limit from query params, set defaults
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    // 1. Get total count for frontend pagination controls
    const countRes = await pool.query(
      "SELECT COUNT(*) FROM deposits WHERE status = 'pending'"
    );
    const totalItems = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    // 2. Fetch paginated data with User details (Join)
    // We join with the users table to show the name/email of the person who deposited
    // Change the JOIN condition
const depositsRes = await pool.query(
  `SELECT 
    d.id, 
    d.amount, 
    d.reference, 
    d.status, 
    d.created_at, 
    u.phone_number 
   FROM deposits d
   JOIN users u ON d.user_id = u.user_id  -- FIXED: Join deposit's user_id to user's id
   WHERE d.status = 'pending'
   ORDER BY d.created_at DESC
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