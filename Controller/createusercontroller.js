import bcrypt from "bcrypt";
import pool from "../configs/db.js";
import validation_schema from "../model/validation.js";
import User from "../services/create.user.service.js";
import WalletService from "../services/walletservice.js";
import { customAlphabet } from 'nanoid'; 

// Helper to generate a unique referral code
async function generateUniqueReferralCode(client) {
    
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const nanoid = customAlphabet(alphabet, 8);
    let code;
    let isUnique = false;

    while (!isUnique) {
        code = nanoid();
        const check = await client.query("SELECT referral_code FROM users WHERE referral_code = $1", [code]);
        if (check.rows.length === 0) isUnique = true;
    }
    return code;
}

async function createusercontroller(req, res) {
    const { value, error } = validation_schema.validate(req.body);
    if (error) {
        return res.status(400).json({ message: error.details[0].message });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // 1. Check if user already exists
        const checkUser = await client.query("SELECT * FROM users WHERE phone_number = $1", [value.phoneNumber]);
        if (checkUser.rows.length > 0) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "User with this phone number already exists" });
        }

        // 2. Handle "Referred By" logic (FIXED)
        let referredById = null;
        if (value.referralCode) {
            // Select user_id (or id) to match your schema
            const inviter = await client.query("SELECT user_id FROM users WHERE referral_code = $1", [value.referralCode]);
            
            if (inviter.rows.length > 0) {
                referredById = inviter.rows[0].user_id;
            } else {
                // If the code is invalid, we rollback and stop
                await client.query("ROLLBACK");
                return res.status(400).json({ message: "Invalid Referral Code" });
            }
        }

        // 3. Generate New Unique Referral Code
        const newUserReferralCode = await generateUniqueReferralCode(client);

        // 4. Hash Password
        const passwordsalt = await bcrypt.genSalt(10);
        const hashedpassword = await bcrypt.hash(value.password, passwordsalt);
        
        // 5. Create User
        const userservice = new User();
        const createuser = await userservice.createuser(
            value.phoneNumber, 
            hashedpassword, 
            newUserReferralCode, 
            referredById, 
            client
        );

        // 6. Create Wallet (Set initial bonus here if needed, e.g., 500.00)
        const createwalletservice = new WalletService();
        const user_id = createuser.user_id;
        
        // Use 500.00 instead of 0.00 if you want to give the signup bonus!
        await createwalletservice.createUserWallet(user_id, 500.00, client);
        

        await client.query("COMMIT");
        
        delete createuser.password; 
        
        return res.status(201).json({
            message: "User created successfully",
            user: {
                ...createuser,
                referral_code: newUserReferralCode
            }
        });

    } catch (error) {
        console.error("Signup Error:", error);
        if (client) await client.query("ROLLBACK").catch(err => console.error("Rollback failed:", err));
        return res.status(500).json({ message: "Account Creation failed. Please try again." });
    } finally {
        client.release();
    }
}

export default createusercontroller;