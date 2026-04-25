import cron from 'node-cron';
import pool from '../configs/db.js';

/**
 * PRODUCTION PAYOUT ENGINE
 * Runs every hour at minute 0.
 * Ensures users are paid every 24 hours until their product expires.
 */
const startPayoutEngine = () => {
  cron.schedule('0 * * * *', async () => {
    const client = await pool.connect();

    try {
      // 1. Start Database Transaction
      await client.query('BEGIN');

      console.log(`[${new Date().toISOString()}] 🚀 Payout Engine: Checking for due yields...`);

      /**
       * THE ENGINE LOGIC:
       * - Find active products where the last payout was 24+ hours ago.
       * - Update their status to 'EXPIRED' if they have reached the end of their duration.
       * - Credit the user's wallet.
       * - Create a record in the ledger for transparency/auditing.
       */
      const payoutQuery = `
        WITH eligible_payouts AS (
          UPDATE user_products 
          SET 
            last_payout_at = NOW(),
            status = CASE 
                       WHEN NOW() >= expires_at THEN 'EXPIRED' 
                       ELSE 'ACTIVE' 
                     END
          WHERE status = 'ACTIVE' 
          AND last_payout_at <= NOW() - INTERVAL '24 hours'
          AND expires_at > last_payout_at -- Safety check
          RETURNING id, user_id, daily_yield, product_id, status
        ),
        wallet_updates AS (
          UPDATE wallets w
          SET 
            balance = w.balance + e.daily_yield,
            updated_at = NOW()
          FROM eligible_payouts e
          WHERE w.user_id = e.user_id
          RETURNING e.user_id, e.daily_yield, e.product_id, w.wallet_id, e.status
        )
        INSERT INTO ledger (wallet_id, amount, entry_type, status, description, created_at)
        SELECT 
          wallet_id, 
          daily_yield, 
          'investment_return', 
          'completed', 
          'Daily yield for product #' || product_id || (CASE WHEN status = 'EXPIRED' THEN ' (Final Payout)' ELSE '' END),
          NOW()
        FROM wallet_updates;
      `;

      const result = await client.query(payoutQuery);
      
      // 2. Commit Transaction
      await client.query('COMMIT');

      if (result.rowCount > 0) {
        console.log(`✅ Success: Processed ${result.rowCount} payouts for NOTIONX users.`);
      } else {
        console.log(`ℹ️ No payouts were due during this cycle.`);
      }

    } catch (err) {
      // 3. Rollback on Failure (Ensures no money is moved if the ledger fails)
      await client.query('ROLLBACK');
      console.error('❌ CRITICAL: Payout Engine Failed:', err);
    } finally {
      // 4. Release client back to pool
      client.release();
    }
  });

  console.log("🟢 Payout Engine Mounted and Active (Hourly Polling)");
};

export default startPayoutEngine;