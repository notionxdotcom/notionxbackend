const getMyActiveProducts = async (req, res) => {
  // 1. Check if user_id exists
  const user_id = req.user?.user_id;
  
  if (!user_id) {
    console.error("ERROR: No user_id found in request. Check your auth middleware.");
    return res.status(401).json({ status: "error", message: "Unauthorized" });
  }

  try {
    const query = `
      SELECT 
        up.id as purchase_id,
        p.name,
        p.price,
        p.daily_income,
        up.created_at,
        p.duration_days,
        up.status,
        -- Safer date subtraction
        (DATE_PART('day', NOW() - up.created_at))::integer as days_passed
      FROM user_products up
      JOIN products p ON up.product_id = p.product_id 
      WHERE up.user_id = $1
      ORDER BY up.created_at DESC
    `;

    const result = await pool.query(query, [user_id]);

    const formattedData = result.rows.map(item => {
      const daysPassed = item.days_passed || 0;
      const duration = item.duration_days || 30;
      
      // Calculate days left and progress percent in JS to avoid SQL errors
      const daysLeft = Math.max(0, duration - daysPassed);
      const progress = Math.min(100, Math.round((daysPassed / duration) * 100));
      
      return { 
        ...item, 
        days_left: daysLeft,
        progress_percent: progress 
      };
    });

    res.status(200).json({ status: "success", data: formattedData });

  } catch (err) {
    // THIS LOG IS CRITICAL: Check your terminal for this output!
    console.error("--- SERVER CRASH ERROR ---");
    console.error(err.message); 
    res.status(500).json({ status: "error", message: err.message });
  }
};

export default getMyActiveProducts;