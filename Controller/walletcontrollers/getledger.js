// controllers/userController.js or similar
import pool from "../../configs/db.js";
const getLedger = async (req, res) => {
    try {
        const userId = req.user.id; // From your auth middleware
        const walletQuery = 'SELECT id FROM wallets WHERE user_id = $1';
        const walletResult = await pool.query(walletQuery, [userId]);

        if (walletResult.rows.length === 0) {
            return res.status(404).json({ success: false, message: "Wallet not found" });
        }

        const walletId = walletResult.rows[0].wallet_id;

        // Fetching all entries for the user, newest first
        const query = `
            SELECT 
                ledger_id, 
                amount, 
                entry_type, 
                description, 
                status, 
                created_at 
            FROM ledger 
            WHERE wallet_id = $1 
            ORDER BY created_at DESC
        `;
        
        const result = await pool.query(query, [walletId]);

        return res.status(200).json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error("Ledger Error:", error);
        res.status(500).json({ 
            success: false, 
            message: "Failed to retrieve transaction history" 
        });
    }
};

export default getLedger