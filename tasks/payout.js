import cron from 'node-cron';
import pool from '../configs/db.js';

/**
 * PRODUCTION PAYOUT ENGINE
 * Handles automated daily yields for NOTIONX users.
 * Fixed: Handles users with multiple products by aggregating wallet updates
 * while maintaining separate ledger entries.
 */
const startPayoutEngine = () => {

  const runPayoutProcess = async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      console.log(`[${new Date().toISOString()}] 🚀 Payout Engine: Checking for due yields...`);

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
        -- Step 1: Sum yields per user so the wallet update hits each row only once (SQL requirement)
        summed_yields AS (
          SELECT user_id, SUM(daily_yield) as total_yield
          FROM eligible_payouts
          GROUP BY user_id
        ),
        -- Step 2: Update the actual wallet balance with the total sum
        wallet_updates AS (
          UPDATE wallets w
          SET 
            balance = w.balance + s.total_yield,
            updated_at = NOW()
          FROM summed_yields s
          WHERE w.user_id = s.user_id
          RETURNING w.user_id, w.wallet_id
        )
        -- Step 3: Insert SEPARATE ledger entries for every individual product paid
        INSERT INTO ledger (wallet_id, amount, entry_type, status, description, created_at)
        SELECT 
          wu.wallet_id, 
          ep.daily_yield, 
          'investment_return', 
          'completed', 
          'Daily yield for product #' || ep.product_id || (CASE WHEN ep.status = 'EXPIRED' THEN ' (Final Payout)' ELSE '' END),
          NOW()
        FROM eligible_payouts ep
        JOIN wallet_updates wu ON ep.user_id = wu.user_id;
      `;

      const result = await client.query(payoutQuery);
      await client.query('COMMIT');

      if (result.rowCount > 0) {
        console.log(`✅ Success: Processed ${result.rowCount} individual yields.`);
      } else {
        console.log(`ℹ️ No payouts were due during this cycle.`);
      }
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('❌ CRITICAL: Payout Engine Failed:', err);
    } finally {
      client.release();
    }
  };

  // 1. Trigger immediately upon server startup
  runPayoutProcess();

  // 2. Schedule to run every hour at minute 0
  cron.schedule('0 * * * *', runPayoutProcess);

  console.log("🟢 Payout Engine Mounted: (Immediate Run + Hourly Polling)");
};

export default startPayoutEngine;
