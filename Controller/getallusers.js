const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search ? req.query.search.trim() : "";
    const offset = (page - 1) * limit;

    let queryParams = [limit, offset];
    let whereClause = "";

    // If search exists, add it as the 3rd parameter ($3)
    if (search) {
      whereClause = `WHERE u.phone_number ILIKE $3`;
      queryParams.push(`%${search}%`);
    }

    const usersQuery = `
      SELECT 
        u.user_id, 
        u.phone_number, 
        u.role, 
        u.created_at, 
        COALESCE(w.balance, 0) as balance 
      FROM users u
      LEFT JOIN wallets w ON u.user_id = w.user_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const countQuery = `SELECT COUNT(*) FROM users u ${whereClause}`;
    const countParams = search ? [`%${search}%`] : [];

    // Execute both queries
    const [usersRes, countRes] = await Promise.all([
      pool.query(usersQuery, queryParams),
      pool.query(countQuery, countParams)
    ]);

    const totalUsers = parseInt(countRes.rows[0].count);

    res.json({
      status: "success",
      data: usersRes.rows,
      pagination: {
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit) || 1,
        currentPage: page,
        limit
      }
    });
  } catch (err) {
    console.error("Pagination Error:", err.message);
    res.status(500).json({ status: "error", message: err.message });
  }
};
export default getAllUsers