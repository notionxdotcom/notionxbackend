import pool from "../configs/db.js";

const getuserbyid = async (req, res) => {
  try {
    // 1. Get ID from the middleware, NOT params
    // This assumes your auth middleware does: req.user = decodedToken
    const userId = req.user?.user_id; 

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized: No user ID found in session" });
    }

    
    const userQuery = "SELECT user_id, phone_number, created_at,referral_code FROM users WHERE user_id = $1";
    const userResult = await pool.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // 3. Send back the user details
    res.json(userResult.rows[0]);

  } catch (err) {
    console.error("Database Error:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

export default getuserbyid;