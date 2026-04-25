import { Pool } from "pg";
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // This is the critical part for Railway
    rejectUnauthorized: false,
  },
  // Adding a timeout helps catch connection hangs
  connectionTimeoutMillis: 5000, 
});

// Explicit error listener
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

async function testConnection() {
  try {
    const client = await pool.connect();
    console.log("🚀 Connected to Railway successfully!");
    const res = await client.query('SELECT NOW()');
    console.log("📊 Database Time:", res.rows[0].now);
    client.release();
  } catch (err) {
    console.error("❌ Connection failed!");
    console.error("Reason:", err.message);
  }
}

testConnection();

export default pool