/**
 * =============================================================================
 * GAME ROUTES
 * =============================================================================
 * 
 * BASE URL: /api/games
 * 
 * PURPOSE:
 * Handle all game-related HTTP requests. This includes:
 * - Searching games in our database
 * - Looking up games from Steam (autocomplete with Atlas Search)
 * - Getting search results page (when user presses Enter)
 * - Fetching full game details from Steam API
 * - Getting game details by ID
 * 
 * TWO COLLECTION STRATEGY:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │                                                                 │
 * │  SteamApps Collection (200k+ entries)                          │
 * │  ├─ Lightweight: { appid, name }                               │
 * │  ├─ Used for: Fast autocomplete/search with Atlas Search       │
 * │  └─ Endpoints: GET /lookup, GET /search-results                │
 * │                                                                 │
 * │                       ↓ User clicks a result                   │
 * │                                                                 │
 * │  Games Collection (On-demand)                                  │
 * │  ├─ Full data: { steam_app_id, name, image, requirements }     │
 * │  ├─ Fetched from Steam API when needed                         │
 * │  └─ Endpoint: POST /fetch-details                              │
 * │                                                                 │
 * └─────────────────────────────────────────────────────────────────┘
 * 
 * AVAILABLE ENDPOINTS:
 * 
 * | Method | Endpoint          | Description                              |
 * |--------|-------------------|------------------------------------------|
 * | GET    | /search           | Search games in our Games collection     |
 * | GET    | /lookup           | Search SteamApps for autocomplete        |
 * | GET    | /search-results   | Get game tiles when user presses Enter   |
 * | GET    | /:id              | Get game by MongoDB ID                   |
 * | GET    | /steam/:steamId   | Get game by Steam App ID                 |
 * | POST   | /fetch-details    | Fetch game from Steam & save to DB       |
 */

import express from 'express';
import * as gameController from '../controllers/gameController.js';

const router = express.Router();

// =============================================================================
// SEARCH GAMES (In our database)
// =============================================================================
/**
 * @route   GET /api/games/search
 * @desc    Search games that are already in our Games collection
 * @access  Public
 * 
 * @query {String} [q] - Search term (game name)
 * @query {Number} [limit=20] - Maximum results
 * 
 * @note    Only returns games we've previously fetched from Steam
 *          with full requirement data. For broader search, use /lookup
 * 
 * @example
 * GET /api/games/search?q=cyberpunk
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   count: 3,
 *   data: [
 *     {
 *       _id: "...",
 *       steam_app_id: 1091500,
 *       name: "Cyberpunk 2077",
 *       image: "https://...",
 *       requirements: {
 *         minimum: { cpu_score, gpu_score, ram_gb, storage_gb, ... },
 *         recommended: { ... }
 *       }
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/search', gameController.searchGames);


// =============================================================================
// LOOKUP STEAM APPS (Autocomplete with Atlas Search)
// =============================================================================
/**
 * @route   GET /api/games/lookup
 * @desc    Search the SteamApps index for game names (autocomplete)
 *          Uses MongoDB Atlas Search for fuzzy matching
 * @access  Public
 * 
 * @query {String} q - Search term (minimum 2 characters)
 * @query {Number} [limit=10] - Maximum results
 * 
 * @note    This searches the lightweight SteamApps collection (200k entries)
 *          Returns only { appid, name } - no requirement data
 *          Use POST /fetch-details to get full game data
 * 
 * FLOW:
 * 1. User types "counter" → GET /lookup?q=counter
 * 2. Show dropdown: [Counter-Strike 2, Counter-Strike: GO, ...]
 * 3. User clicks "Counter-Strike 2" → POST /fetch-details { steamAppId: 730 }
 * 4. Now you have full game data for compatibility check
 * 
 * @example
 * GET /api/games/lookup?q=half-life
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   count: 10,
 *   data: [
 *     { appid: 70, name: "Half-Life" },
 *     { appid: 220, name: "Half-Life 2" },
 *     { appid: 280, name: "Half-Life 2: Episode One" },
 *     ...
 *   ]
 * }
 */
router.get('/lookup', gameController.lookupSteamApps);


// =============================================================================
// GET SEARCH RESULTS PAGE (Enter without selecting)
// =============================================================================
/**
 * @route   GET /api/games/search-results
 * @desc    Get game tiles with images when user presses Enter without selecting
 * @access  Public
 * 
 * @query {String} q - Search term (minimum 2 characters)
 * @query {Number} [limit=20] - Maximum results
 * 
 * @note    This endpoint is used when the user presses Enter in the search box
 *          without clicking an autocomplete suggestion. It returns a grid of
 *          game tiles with Steam header images for visual browsing.
 * 
 *          Clicking a tile should trigger the same flow as selecting from
 *          autocomplete (POST /fetch-details with the appid).
 * 
 * FLOW:
 * 1. User types "cyberpunk" → presses Enter (without selecting)
 * 2. GET /search-results?q=cyberpunk
 * 3. Display grid of game tiles with header images
 * 4. User clicks "Cyberpunk 2077" tile → POST /fetch-details { steamAppId: 1091500 }
 * 
 * @example
 * GET /api/games/search-results?q=dark+souls&limit=20
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   count: 15,
 *   data: [
 *     {
 *       appid: 1091500,
 *       name: "Cyberpunk 2077",
 *       image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg",
 *       hasFullData: true  // true if we already have this game in our Games collection
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/search-results', gameController.getSearchResults);


// =============================================================================
// GET GAME BY STEAM APP ID (Auto-fetches from Steam if not in DB)
// =============================================================================
/**
 * @route   GET /api/games/steam/:steamId
 * @desc    Get a game by its Steam App ID. Auto-fetches from Steam if not in database.
 * @access  Public
 * 
 * @param {Number} steamId - Steam's appid (e.g., 730 for CS2)
 * @query {Boolean} [autoFetch=true] - Whether to auto-fetch from Steam if not in DB
 * 
 * @note    NEW BEHAVIOR: This endpoint now automatically fetches from Steam
 *          if the game is not in our database. No need to call /fetch-details separately.
 * 
 * FLOW:
 * 1. Check if game exists in our Games collection
 * 2. If found → return with source: 'database'
 * 3. If not found AND autoFetch=true → fetch from Steam API
 * 4. Save to database and return with source: 'steam'
 * 
 * @example
 * GET /api/games/steam/730
 * GET /api/games/steam/730?autoFetch=false  // Only check DB, don't fetch
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   source: 'database' | 'steam',
 *   isNew: true,  // Only present when fetched from Steam
 *   data: { steam_app_id, name, image, requirements, ... }
 * }
 * @returns {Object} 404 - Game not found (only if autoFetch=false or Steam fetch fails)
 */
router.get('/steam/:steamId', gameController.getGameBySteamId);


// =============================================================================
// GET GAME BY ID (MongoDB ObjectId) - Must come AFTER /steam/:steamId
// =============================================================================
/**
 * @route   GET /api/games/:id
 * @desc    Get a game by its MongoDB ObjectId
 * @access  Public
 * 
 * @param {String} id - MongoDB ObjectId (24 hex characters)
 * 
 * @note    Only works for games already in our Games collection.
 *          This route must be defined AFTER /steam/:steamId to avoid route conflicts.
 * 
 * @example
 * GET /api/games/507f1f77bcf86cd799439011
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     _id: "507f1f77bcf86cd799439011",
 *     steam_app_id: 1091500,
 *     name: "Cyberpunk 2077",
 *     image: "https://cdn.steam...",
 *     requirements: { minimum: {...}, recommended: {...} },
 *     keywords: ["rpg", "action", "open world"]
 *   }
 * }
 * 
 * @returns {Object} 404 - Not Found
 * {
 *   success: false,
 *   message: "Game not found"
 * }
 */
router.get('/:id', gameController.getGameById);


// =============================================================================
// FETCH GAME DETAILS FROM STEAM (Legacy endpoint - use GET /steam/:steamId instead)
// =============================================================================
/**
 * @route   POST /api/games/fetch-details
 * @desc    Fetch full game data from Steam API and save to our database
 * @access  Public
 * 
 * @deprecated Use GET /api/games/steam/:steamId instead - it now auto-fetches.
 * 
 * @body {Number} steamAppId - Steam's appid
 * 
 * @note    This is the KEY endpoint for the game selection flow:
 *          1. If game exists in our DB → return it
 *          2. If not → fetch from Steam API, parse requirements, save, return
 * 
 * WHAT HAPPENS INTERNALLY:
 * 1. Check Games collection for existing document
 * 2. If found, return immediately
 * 3. If not, call Steam Store API: https://store.steampowered.com/api/appdetails
 * 4. Parse the HTML requirements using steamParser.js
 * 5. Look up CPU/GPU scores from our Laptop database
 * 6. Create and save Game document
 * 7. Return full game data
 * 
 * @example
 * POST /api/games/fetch-details
 * Body: { "steamAppId": 1091500 }
 * 
 * @returns {Object} 200 - Success (new or existing game)
 * {
 *   success: true,
 *   isNew: true,  // false if already existed
 *   data: {
 *     _id: "...",
 *     steam_app_id: 1091500,
 *     name: "Cyberpunk 2077",
 *     image: "https://cdn.steam...",
 *     requirements: {
 *       minimum: {
 *         ram_gb: 8,
 *         storage_gb: 70,
 *         cpu_score: 45,
 *         gpu_score: 55,
 *         cpu_text: "Intel Core i5-3570K",
 *         gpu_text: "GTX 780"
 *       },
 *       recommended: { ... }
 *     }
 *   }
 * }
 * 
 * @returns {Object} 400 - Missing steamAppId
 * @returns {Object} 500 - Steam API error
 */
router.post('/fetch-details', gameController.fetchGameDetails);

// Debug endpoint to check collection counts
router.get('/debug/counts', gameController.getCollectionCounts);


export default router;