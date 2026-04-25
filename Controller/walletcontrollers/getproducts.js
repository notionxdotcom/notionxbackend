import pool from "../../configs/db.js";
const getMyActiveProducts = async (req, res) => {
  // 1. FIX THE UUID CRASH: Handle both 'id' and 'user_id' depending on your auth setup
  const user_id = req.user?.id || req.user?.user_id;

  if (!user_id) {
    console.error("Auth Error: user_id is missing from token.");
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  try {
    // 2. USE YOUR EXACT COLUMNS: We use expires_at, purchase_price, and daily_yield
    const query = `
      SELECT 
        up.id as purchase_id,
        p.name,
        up.purchase_price as price,
        up.daily_yield as daily_income,
        up.created_at,
        p.duration_days,
        -- The safest math possible: Subtracting dates directly returns an integer
        (up.expires_at::date - CURRENT_DATE) as days_left
      FROM user_products up
      JOIN products p ON up.product_id = p.product_id 
      WHERE up.user_id = $1 AND up.status = 'ACTIVE'
      ORDER BY up.created_at DESC
    `;

    const result = await pool.query(query, [user_id]);

    const formattedData = result.rows.map(item => {
      // Ensure days left doesn't go below 0 if a plan just expired
      const daysLeft = Math.max(0, parseInt(item.days_left) || 0);
      const duration = parseInt(item.duration_days) || 30;
      
      // Calculate progress percentage safely
      const daysPassed = duration - daysLeft;
      const progress = Math.min(100, Math.round((daysPassed / duration) * 100));
      
      return { 
        ...item, 
        days_left: daysLeft,
        progress_percent: progress 
      };
    });

    res.status(200).json({ status: "success", data: formattedData });
  } catch (err) {
    // 3. LOG THE EXACT ERROR: If it fails again, this tells us exactly why
    console.error("--- DB CRASH ---", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
};



export default getMyActiveProducts;