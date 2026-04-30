const getAllUsers = async (req, res) => {
  try {
    // Get page and limit from query string, default to page 1, 10 users per page
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // 1. Get the users with their wallet balances
    const usersQuery = `
      SELECT 
        u.user_id, 
        u.phone_number, 
        u.role, 
        u.created_at, 
        w.balance 
      FROM users u
      LEFT JOIN wallets w ON u.user_id = w.user_id
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    // 2. Get total count for pagination math
    const countQuery = "SELECT COUNT(*) FROM users";

    const [usersRes, countRes] = await Promise.all([
      pool.query(usersQuery, [limit, offset]),
      pool.query(countQuery)
    ]);

    const totalUsers = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(totalUsers / limit);

    res.json({
      status: "success",
      data: usersRes.rows,
      pagination: {
        totalUsers,
        totalPages,
        currentPage: page,
        limit
      }
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
export default getAllUsers