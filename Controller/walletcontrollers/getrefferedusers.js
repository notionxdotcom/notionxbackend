/**
 * GET /api/user/referrals
 * Returns a list of all users referred by the logged-in user
 */
const getMyReferrals = async (req, res) => {
  const { user_id } = req.user; // Extract from your auth middleware

  try {
    const result = await pool.query(
      `SELECT 
        u.user_id, 
        u.phone_number, 
        u.created_at,
        w.balance as current_balance
       FROM users u
       LEFT JOIN wallets w ON u.user_id = w.user_id
       WHERE u.referred_by_id = $1
       ORDER BY u.created_at DESC`,
      [user_id]
    );

    // Privacy Masking: Mask phone numbers so referrers can't see the full number
    const maskedData = result.rows.map(row => ({
      ...row,
      phone_number: row.phone_number.replace(/(\d{3})\d{4}(\d{4})/, "$1****$2")
    }));

    res.status(200).json({
      status: "success",
      count: result.rows.length,
      data: maskedData
    });
  } catch (err) {
    console.error("Fetch Referrals Error:", err);
    res.status(500).json({ status: "error", message: "Failed to retrieve your team." });
  }
};
export default getMyReferrals