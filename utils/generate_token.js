import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

function Generatetoken(user) {
  // We add 'role' here so it's embedded in the token
  return jwt.sign(
    { 
      user_id: user.user_id, 
      role: user.role 
    }, 
    process.env.JWT_SECRET, 
    { expiresIn: "1hr" }
  );
}

export default Generatetoken;