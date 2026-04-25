import pool from '../configs/db.js';

class User {
   
    async createuser(phonenumber,password,refferalcode ,refferedbyid ,client) {
        const saveduser = await client.query(
            'INSERT INTO users (phone_number, password_hash,referral_code,referred_by_id) VALUES ($1, $2,$3,$4) RETURNING user_id', 
            [phonenumber, password,refferalcode,refferedbyid]
        );
        return saveduser.rows[0]; 
    }
}

export default User;