import "dotenv/config"
import express from "express"
import cors from 'cors';
import mongoose from 'mongoose';
import laptopRoutes from './routes/laptopRoutes.js';
import gameRoutes from './routes/gameRoutes.js';
import compatibilityRoutes from './routes/compatibilityRoutes.js';

const app = express()
const port = process.env.PORT || 3000;

// =============================================================================
// MIDDLEWARE
// =============================================================================
app.use(cors());
app.use(express.json()); // Parse JSON request bodies

// =============================================================================
// DATABASE CONNECTION
// =============================================================================
const MONGO_URI = process.env.MONGODB_URI;

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

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

// =============================================================================
// HEALTH CHECK
// =============================================================================
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// =============================================================================
// START SERVER
// =============================================================================
app.listen(port, () => {
    console.log(`🚀 Server is running on port ${port}`)
})