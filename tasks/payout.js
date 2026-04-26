import cron from 'node-cron';
import pool from '../configs/db.js';

/**
 * PRODUCTION PAYOUT ENGINE
 * Handles automated daily yields for NOTIONX users.
 * Fixed to include first-time payouts (NULL check) and immediate startup execution.
 */
const startPayoutEngine = () => {

  const runPayoutProcess = async () => {
    const client = await pool.connect();
    try {
      // 1. Start Database Transaction
      await client.query('BEGIN');
      console.log(`[${new Date().toISOString()}] 🚀 Payout Engine: Checking for due yields...`);

      /**
       * THE ENGINE LOGIC:
       * - (last_payout_at <= NOW() - INTERVAL '23 hours' OR last_payout_at IS NULL) 
       * Ensures users who just joined (NULL) or are overdue get picked up.
       * - Using 23 hours provides a small buffer for server restarts/lag.
       */
      const payoutQuery = `
        WITH eligible_payouts AS (
          UPDATE user_products
          SET 
            last_payout_at = NOW(),
            status = CASE WHEN NOW() >= expires_at THEN 'EXPIRED' ELSE 'ACTIVE' END
          WHERE status = 'ACTIVE'
          AND (last_payout_at <= NOW() - INTERVAL '23 hours' OR last_payout_at IS NULL)
          AND expires_at > NOW()
          RETURNING id, user_id, daily_yield, product_id, status
        ),
        wallet_updates AS (
          UPDATE wallets w
          SET 
            balance = w.balance + e.daily_yield,
            updated_at = NOW()
          FROM eligible_payouts e
          WHERE w.user_id = e.user_id
          RETURNING e.user_id, e.daily_yield, e.product_id, w.id as wallet_id, e.status
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
        console.log(`✅ Success: Processed ${result.rowCount} yields.`);
      } else {
        console.log(`ℹ️ No payouts were due during this cycle.`);
      }
    } catch (err) {
      // 3. Rollback on Failure
      await client.query('ROLLBACK');
      console.error('❌ CRITICAL: Payout Engine Failed:', err);
    } finally {
      // 4. Release client back to pool
      client.release();
    }
  };

  // --- EXECUTION STRATEGY ---

  // 1. Trigger immediately upon server startup/redeploy
  // This catches the users who have been waiting since 11 AM yesterday
  runPayoutProcess();

  // 2. Schedule to run every hour at minute 0
  // (e.g., 4:00 PM, 5:00 PM, etc.)
  cron.schedule('0 * * * *', runPayoutProcess);

  console.log("🟢 Payout Engine Mounted: (Immediate Run + Hourly Polling)");
};

export default startPayoutEngine;