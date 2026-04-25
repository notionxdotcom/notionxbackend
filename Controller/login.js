import pool from "../configs/db.js";
import bcrypt from "bcrypt";
import Generatetoken from "../utils/generate_token.js";

async function loginuser(req, res) {
  const { phoneNumber, password } = req.body;
  
  try {
    if (!phoneNumber || !password) {
      return res.status(400).json({ message: "Phone number and password are required" });
    }

    const checkuser = await pool.query("SELECT * FROM users WHERE phone_number = $1", [phoneNumber]);

    if (checkuser.rows.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = checkuser.rows[0];

    const comparepsswword = await bcrypt.compare(password, user.password_hash);
    if (!comparepsswword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = Generatetoken(user);
  
    // Cookie settings for local development
    // res.cookie("token", token, {
    //   httpOnly: true,              
    //   secure: true, 
    //   sameSite: "none",          
    //   maxAge: 24 * 60 * 60 * 1000, 
    //   path: "/",
     
    // });

    // CRITICAL: Return the role so the frontend can handle redirection
    return res.status(200).json({
      message: "Login successful",
      token: token, // Also return token in body if your interceptor uses it
      user: {
        user_id: user.user_id,
        
        phone: user.phone_number,
        role: user.role // This allows React to do: if(user.role === 'admin') navigate('/admin')
      }
    });

  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
}

export default loginuser;