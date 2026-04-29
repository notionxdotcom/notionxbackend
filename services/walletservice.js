class WalletService {
    
    /**
     * Creates a new wallet for a user
     */
 /**
 * Credits the wallet and handles ledger logging intelligently.
 * @param 
 * @param {number} amount - The amount to add.
 * @param {string} entry_type - 'deposit', 'referral_commission', etc.
 * @param {string} status - 'completed', 'pending', etc.
 * @param {string} reference - The description/transaction reference.
 * @param {object} client - The DB client for transaction consistency.
 * @param {string|null} existingLedgerId - If provided, updates this row instead of inserting.
 */
async creditWallet(wallet_id, amount, entry_type, status, reference, client, existingLedgerId = null) {
    // 1. Lock the wallet row to prevent balance race conditions
    const wallet = await client.query(
        "SELECT balance FROM wallets WHERE wallet_id = $1 FOR UPDATE",
        [wallet_id]
    );

    if (wallet.rows.length === 0) throw new Error("Wallet record not found.");

    // 2. Calculate and Update Balance
    const currentBalance = parseFloat(wallet.rows[0].balance);
    const newBalance = currentBalance + parseFloat(amount);

    await client.query(
        "UPDATE wallets SET balance = $1, updated_at = NOW() WHERE wallet_id = $2",
        [newBalance, wallet_id]
    );

    // 3. SMART LOGGING: Decide between UPDATE or INSERT
    if (existingLedgerId) {
        // If we already have a record (like a pending deposit), just mark it completed
        await client.query(
            `UPDATE ledger 
             SET status = $1, 
                 updated_at = NOW() 
             WHERE ledger_id = $2`,
            [status, existingLedgerId]
        );
    } else {
        // If it's a new event (like a referral bonus), create a fresh record
        await client.query(
            `INSERT INTO ledger (wallet_id, amount, entry_type, status, description)
             VALUES ($1, $2, $3, $4, $5)`,
            [wallet_id, amount, entry_type, status, reference]
        );
    }

    return newBalance;
}
    /**
     * Debits the wallet (used for Withdrawals and Purchases)
     */
    async debitWallet(user_id, amount,type, reference, client) {
        // Lock the row
        const wallet = await client.query(
            "SELECT wallet_id, balance FROM wallets WHERE user_id = $1 FOR UPDATE",
            [user_id]
        );
        if (wallet.rows.length === 0) {
            throw new Error(`Wallet not found for user ${user_id}. Manual admin users need a wallet created in the wallets table.`);
        }
        const wallet_id = wallet.rows[0].wallet_id;
        
        const currentBalance = parseFloat(wallet.rows[0].balance);
        const debitAmount = parseFloat(amount);

        if (currentBalance < debitAmount) {
            throw new Error("Insufficient funds in wallet.");
        }

        const newBalance = currentBalance - debitAmount;

        // Update Wallet
        await client.query(
            "UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2",
            [newBalance, user_id]
        );
    

       
        
        await client.query(
            `INSERT INTO ledger (wallet_id, amount, entry_type, status, description)
             VALUES ($1, $2, $3, 'completed', $4)`,
            [wallet_id, amount, type, reference]
        );

        return newBalance;
    }

    /**
     * Fetches the latest balance
     */
    async getBalance(user_id, client) {
        const result = await client.query(
            "SELECT balance, pendingbalance FROM wallets WHERE user_id = $1", 
            [user_id]
        );
        if (result.rows.length === 0) throw new Error("Wallet not found.");
        return result.rows[0];
    }
}

export default WalletService;