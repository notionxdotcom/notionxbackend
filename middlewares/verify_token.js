import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {
  // 1. Look for token in the Authorization Header
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // 2. If header is missing, check cookies as a backup (optional)
  if (!token) {
    token = req.cookies?.token;
  }

  if (!token) {
    console.error("AUTH FAILED: No token found in headers or cookies");
    return res.status(401).json({ message: 'Not authenticated' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // 3. Attach user to the request
    // IMPORTANT: Make sure the property names match what your queries expect
    req.user = decoded; 
    
    next();
  } catch (err) {
    console.error("JWT Error:", err.message);
    return res.status(401).json({ message: 'Token expired or invalid' });
  }
};
export default authMiddleware