import express from 'express';
import dotenv from 'dotenv';
import startPayoutEngine from './tasks/payout.js';
dotenv.config();
import cors from 'cors';
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from 'cookie-parser';
import userroutes from "./routes/userroutes.js"
// Routes
import auth from './routes/auth.js';
import walletroutes from './routes/walletroutes.js';
import authMiddleware from './middlewares/verify_token.js';
import productroutes from './routes/products.js';

const app = express();

// 1. Precise CORS Configuration
const corsOptions = {
  origin: 'https://notionx-x.vercel.app', 
  credentials: true, // Required for cookies
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
};

app.use(cors(corsOptions));

// 2. Cookie Parser MUST be before routes
app.use(cookieParser()); 

app.use(express.json());
app.use(helmet());
app.use(morgan("dev"));
startPayoutEngine();

// 3. DEBUG MIDDLEWARE: Put this exactly here to see what's happening
app.use((req, res, next) => {
  console.log(`--- [${new Date().toISOString()}] Incoming Request ---`);
  console.log(`Method: ${req.method} | Path: ${req.url}`);
  console.log(`Cookies found:`, req.cookies); 
  next();
});

// 4. Routes
app.use("/api/auth", auth);
app.use("/api/wallet", authMiddleware, walletroutes);
app.use("/api/user", authMiddleware, userroutes);
app.use("/api/products", authMiddleware, productroutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});