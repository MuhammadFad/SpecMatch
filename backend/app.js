import "dotenv/config"
import express from "express"
import cors from 'cors';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import laptopRoutes from './routes/laptopRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import compatibilityRoutes from './routes/compatibilityRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';
import userRoutes from './routes/userRoutes.js';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express()
const port = process.env.PORT || 3000;

// =============================================================================
// MIDDLEWARE
// =============================================================================
// CORS Configuration - Updated for Vercel deployment
const allowedOrigins = [
    'https://specmatch.app',
    'https://www.specmatch.app',
    'https://spec-match-lt45.vercel.app',
    'https://specmatch.vercel.app',
    // Allow localhost for development
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173'
];

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) return callback(null, true);

        // Check if origin is in allowed list or matches vercel preview deployments
        if (allowedOrigins.includes(origin) ||
            origin.endsWith('.vercel.app') ||
            origin.includes('specmatch')) {
            return callback(null, true);
        }

        console.warn(`⚠️ CORS blocked request from: ${origin}`);
        return callback(new Error('Not allowed by CORS'), false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Content-Length', 'X-Request-Id'],
    maxAge: 86400 // Cache preflight for 24 hours
}));


app.use(express.json()); // Parse JSON request bodies

// Serve static files from backend/public
const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));

// =============================================================================
// DATABASE CONNECTION
// =============================================================================
// =============================================================================
// DATABASE CONNECTION (SERVERLESS OPTIMIZED)
// =============================================================================
const MONGO_URI = process.env.MONGODB_URI;
let cachedConnection = null;

// Define the connection function
const connectDB = async () => {
    // If we are already connected (warm start), reuse the connection!
    if (cachedConnection) {
        return cachedConnection;
    }

    console.log('⏳ Connecting to MongoDB...');
    cachedConnection = await mongoose.connect(MONGO_URI, {
        bufferCommands: false, // Fail fast if we aren't connected
        serverSelectionTimeoutMS: 5000,
    });

    console.log('✅ New MongoDB Connection established');
    return cachedConnection;
};

// This forces every single request to wait for the DB before proceeding
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next(); // Proceed to the routes (laptops, games, etc.)
    } catch (error) {
        console.error("❌ DB Connection Failed:", error);
        res.status(500).json({ error: "Database Connection Failed" });
    }
});

// =============================================================================
// API ROUTES
// =============================================================================
/**
 * LAPTOP DOMAIN: /api/laptops
 * ---------------------------
 * Handles all laptop-related operations:
 * - Search laptops with filters
 * - Get laptop details
 * - Get ranked/sorted laptops
 * - Get available filter options
 */
app.use('/api/laptops', laptopRoutes);

/**
 * GAME DOMAIN: /api/games
 * -----------------------
 * Handles all game-related operations:
 * - Search games in our database
 * - Lookup games from Steam (SteamApps → Games)
 * - Get game details
 */
app.use('/api/games', gameRoutes);

/**
 * COMPATIBILITY DOMAIN: /api/compatibility
 * ----------------------------------------
 * The CORE FEATURE - "Can I Run It?"
 * - Check single laptop vs single game
 * - Check multiple laptops vs one game (find winners)
 */
app.use('/api/compatibility', compatibilityRoutes);

/**
 * CHATBOT DOMAIN: /api/chat
 * -------------------------
 * RAG-powered laptop recommendation chatbot
 * - Semantic search + filters
 * - LLM-generated responses
 */
app.use('/api/chat', chatbotRoutes);

/**
 * USER DOMAIN: /api/users
 * -----------------------
 * User authentication sync and laptop management
 * - Save/get user after Firebase auth
 * - CRUD for user's personal laptops
 */
app.use('/api/users', userRoutes);

// =============================================================================
// HEALTH CHECK
// =============================================================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================================================
// SERVE FRONTEND (catch-all for SPA routing)
// =============================================================================
app.get('/', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ success: false, message: 'API endpoint not found' });
    }
    res.sendFile(path.join(publicDir, 'index.html'));
});

// =============================================================================
// START SERVER
// =============================================================================
if (process.env.NODE_ENV !== 'production') {
    app.listen(port, () => {
        console.log(`Server running on port ${port}`);
    });
}

export default app;