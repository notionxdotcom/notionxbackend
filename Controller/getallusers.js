const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || "";
    const offset = (page - 1) * limit;

    // Use ILIKE for case-insensitive searching on phone numbers
    const searchCondition = search ? `WHERE u.phone_number ILIKE $3` : "";
    const queryParams = search ? [limit, offset, `%${search}%`] : [limit, offset];

    const usersQuery = `
      SELECT u.user_id, u.phone_number, u.role, u.created_at, w.balance 
      FROM users u
      LEFT JOIN wallets w ON u.user_id = w.user_id
      ${searchCondition}
      ORDER BY u.created_at DESC
      LIMIT $1 OFFSET $2
    `;
    
    const countQuery = `SELECT COUNT(*) FROM users u ${searchCondition}`;
    const countParams = search ? [`%${search}%`] : [];

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
        totalPages: Math.ceil(totalUsers / limit),
        currentPage: page,
        limit
      }
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};
export default getAllUsers