class WalletService {
    
    /**
     * Creates a new wallet for a user
     */
 async createUserWallet(user_id, initial_balance = 500.00, client) {
    const result = await client.query(
        'INSERT INTO wallets (user_id, balance, pendingbalance) VALUES ($1, $2, $3) RETURNING *', 
        [user_id, initial_balance, 0.00] // Setting pending to 0, balance to 500
    );

    // Optional: Record the welcome bonus in the ledger so the user sees it in their history
    const wallet = result.rows[0];
    await client.query(
        `INSERT INTO ledger (wallet_id, amount, entry_type, status, description)
         VALUES ($1, $2, 'welcomebonus', 'completed', 'Welcome Bonus')`,
        [wallet.wallet_id, initial_balance]
    );

    return wallet; 
}

    /**
     * Credits the wallet (used for Deposits and Refunds)
     */
    async creditWallet(wallet_id, amount, reference, client) {
        // Lock the row to prevent race conditions
        const wallet = await client.query(
            "SELECT balance FROM wallets WHERE wallet_id = $1 FOR UPDATE",
            [wallet_id]
        );

        if (wallet.rows.length === 0) throw new Error("Wallet record not found.");

        const currentBalance = parseFloat(wallet.rows[0].balance);
        const newBalance = currentBalance + parseFloat(amount);

        // Update Wallet
        await client.query(
            "UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE wallet_id = $2",
            [newBalance, wallet_id]
        );

        // Record in Ledger
        await client.query(
            `INSERT INTO ledger (wallet_id, amount, entry_type, status, description)
             VALUES ($1, $2, 'deposit', 'completed', $3)`,
            [wallet_id, amount, reference]
        );

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