import jwt from 'jsonwebtoken';

export const authMiddleware = (req, res, next) => {

  const token = req.cookies?.token; 

  // DEBUG LOGS (Temporary)
  console.log("--- Auth Debug ---");
  console.log("All Cookies:", req.cookies);
  console.log("Extracted Token:", token);

  if (!token) {
    return res.status(401).json({ message: 'Not authenticated: No cookie found' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    
    req.user = decoded;
    
    console.log("User Authenticated:", decoded);
    next();
  } catch (err) {
    console.error("JWT Error:", err.message);
    return res.status(401).json({ message: 'Token expired or invalid' });
  }
};

export default authMiddleware;