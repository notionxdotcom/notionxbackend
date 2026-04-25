const getMyActiveProducts = async (req, res) => {
  const user_id = req.user.user_id;

  try {
    const query = `
      SELECT 
        up.id as purchase_id,
        p.name,
        p.price,
        p.daily_income,
        up.created_at,
        p.duration_days,
        -- Using created_at based on your screenshot
        (CURRENT_DATE - up.created_at::date) as days_passed,
        -- Calculating days left
        GREATEST(0, p.duration_days - (CURRENT_DATE - up.created_at::date)) as days_left
      FROM user_products up
      JOIN products p ON up.product_id = p.product_id 
      -- FIX: Changed to UPPER 'ACTIVE' and used created_at
      WHERE up.user_id = $1 AND up.status = 'ACTIVE' 
      ORDER BY up.created_at DESC
    `;

    const result = await pool.query(query, [user_id]);

    const formattedData = result.rows.map(item => {
      const daysPassed = parseInt(item.days_passed) || 0;
      const duration = parseInt(item.duration_days) || 30; // Defaulting to 30 based on your image
      const progress = Math.min(100, Math.round((daysPassed / duration) * 100));
      
      return { 
        ...item, 
        progress_percent: progress < 0 ? 0 : progress 
      };
    });

    res.status(200).json({ status: "success", data: formattedData });
  } catch (err) {
    console.error("Fetch Active Products Error:", err);
    res.status(500).json({ status: "error", message: "Failed to fetch active plans." });
  }
};

export default getMyActiveProducts;