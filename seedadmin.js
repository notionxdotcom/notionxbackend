// seedAdmin.js
import pool from './configs/db.js';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const seedAdmin = async () => {
  const phone = "09065319674"; 
  const rawPassword = "NOTIONX@2026";
  const adminReferralCode = `ADM-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  
  try {
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    
    // Note: I changed the placeholders to $1, $2, $3 to match the array order
    const query = `
      INSERT INTO users (phone_number, password_hash, role, referral_code)
      VALUES ($1, $2, 'admin', $3)
      ON CONFLICT (phone_number) 
      DO UPDATE SET role = 'admin'
      RETURNING phone_number, role, referral_code;
    `;

    // Only 3 variables needed now: phone, hashedPassword, and referralCode
    const result = await pool.query(query, [phone, hashedPassword, adminReferralCode]);
    
    console.log("------------------------------------------");
    console.log("🚀 UPNepa Admin Seeded!");
    console.log(`Phone: ${result.rows[0].phone_number}`);
    console.log(`Role: ${result.rows[0].role}`);
    console.log(`Referral Code: ${result.rows[0].referral_code}`);
    console.log("------------------------------------------");
    
    process.exit();
  } catch (err) {
    // If you get "null value in column 'full_name'", 
    // simply add 'full_name' to the INSERT and ['Admin', phone, hash, code] to the array.
    console.error("❌ Seeding failed:", err.message);
    process.exit(1);
  }
};

seedAdmin();