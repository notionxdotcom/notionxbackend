import pool from "../../configs/db.js";

const getwalletbyid = async (req, res) => {
  try {
    const userId = req.user.user_id; 
 console.log(userId);
 
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    // Fetch the wallet by ID
    const walletQuery = "SELECT * FROM wallets WHERE user_id = $1";
    const walletResult = await pool.query(walletQuery, [userId]);

    if (walletResult.rows.length === 0) {
      return res.status(404).json({ error: "Wallet not found" });
    }

    // Send back the wallet details
    res.json(walletResult.rows[0]);

  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export default getwalletbyid;