import express from 'express';
import pool from '../configs/db.js';
import WalletService from '../services/walletservice.js';

const router = express.Router();
const walletService = new WalletService();
// Create a new VIP Plan
router.post('/create', async (req, res) => {
  const { name, price, daily_income, duration, total_return } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO products (name, price, daily_income, duration_days, total_return) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, price, daily_income, duration, total_return]
    );

    res.status(201).json({ status: "success", data: result.rows[0] });
  } catch (err) {
    console.error("Product Creation Error:", err);
    res.status(500).json({ status: "error", message: "Failed to create product plan." });
  }
});

// Get all VIP Plans
router.get('/all', async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM products ORDER BY price ASC");
    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: "Database error." });
  }
});
// Adjust path to your service


/**
 * BUY PRODUCT ROUTE
 * Handles balance deduction and investment initialization
 */


router.post('/buy-product', async (req, res) => {
  const userId = req.user.user_id; 
  const { productId } = req.body;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Fetch Product
    const productRes = await client.query('SELECT * FROM products WHERE product_id = $1', [productId]);
    if (productRes.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Product not found" });
    }
    const product = productRes.rows[0];

    // 2. Debit Wallet via your Service
    try {
      await walletService.debitWallet(
        userId, 
        product.price, 
        "investment",
        `Investment: ${product.name}`, 
        client
      );
    } catch (debitError) {
      await client.query('ROLLBACK');
      return res.status(400).json({ status: "error", message: debitError.message });
    }

    // 3. Insert into user_products using your columns
    // Sets last_payout_at to NOW() so they are eligible for their first yield in 24hrs
    const insertQuery = `
      INSERT INTO user_products 
      (user_id, product_id, purchase_price, daily_yield, expires_at, last_payout_at, status) 
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 day' * $5, NOW(), 'ACTIVE')
    `;
    
    await client.query(insertQuery, [
      userId, 
      productId, 
      product.price, 
      product.daily_income, // This comes from your products table
      product.duration_days
    ]);

    await client.query('COMMIT');
    res.json({ status: "success", message: "Investment successful! Your first yield arrives in 24 hours." });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error("Purchase Error:", err);
    res.status(500).json({ status: "error", message: "Internal server error" });
  } finally {
    client.release();
  }
});


export default router;