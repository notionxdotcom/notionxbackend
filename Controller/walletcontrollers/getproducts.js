/**
 * GET /api/user/my-products
 * Fetches active products for the logged-in user with time calculations
 */
const getMyActiveProducts = async (req, res) => {
  const user_id = req.user.user_id;

  try {
    const query = `
      SELECT 
        up.id as purchase_id,
        p.name,
        p.price,
        p.daily_earnings,
        up.purchase_date,
        p.duration_days,
        -- Calculate days passed
        (CURRENT_DATE - up.purchase_date::date) as days_passed,
        -- Calculate days left (ensuring it doesn't go below 0)
        GREATEST(0, p.duration_days - (CURRENT_DATE - up.purchase_date::date)) as days_left
      FROM user_products up
      JOIN products p ON up.product_id = p.id
      WHERE up.user_id = $1 AND up.status = 'active'
      ORDER BY up.purchase_date DESC
    `;

    const result = await pool.query(query, [user_id]);

    // Add progress percentage calculation in JS for precision
    const formattedData = result.rows.map(item => {
      const progress = Math.min(100, Math.round((item.days_passed / item.duration_days) * 100));
      return { ...item, progress_percent: progress };
    });

    res.status(200).json({ status: "success", data: formattedData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Failed to fetch active plans." });
  }
};
export default getMyActiveProducts