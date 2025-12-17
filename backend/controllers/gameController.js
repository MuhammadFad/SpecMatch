/**
 * =============================================================================
 * GAME CONTROLLER
 * =============================================================================
 * 
 * PURPOSE:
 * Handle HTTP request/response for game endpoints.
 * Manages both our Games collection and Steam API interactions.
 * 
 * FLOW POSITION:
 * Route → [CONTROLLER] → Service → Model / Steam API
 * 
 * KEY FLOWS:
 * 
 * 1. AUTOCOMPLETE FLOW (User searching for a game):
 *    User types → lookupSteamApps → Returns { appid, name } list
 * 
 * 2. GAME SELECTION FLOW (User picks a game):
 *    User clicks → fetchGameDetails → Check DB or Fetch from Steam → Return full game
 * 
 * 3. COMPATIBILITY FLOW (After game is loaded):
 *    getGameById → Returns full Game document for compatibility check
 */

import * as gameService from '../services/gameService.js';

// =============================================================================
// SEARCH GAMES (In our database)
// =============================================================================
/**
 * @controller searchGames
 * @route GET /api/games/search
 * 
 * INPUT (req.query):
 *   - q: String (search text)
 *   - limit: Number (default 20)
 * 
 * OUTPUT:
 *   { success: true, count: N, data: [...games with full requirements] }
 * 
 * NOTE: Only returns games we've previously fetched from Steam
 */
export const searchGames = async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 20;

        console.log(`🎮 [GameController.searchGames] Query: "${query}", Limit: ${limit}`);

        const results = await gameService.findGames(query, limit);

        res.json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (error) {
        console.error('❌ [GameController.searchGames] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// LOOKUP STEAM APPS (Autocomplete)
// =============================================================================
/**
 * @controller lookupSteamApps
 * @route GET /api/games/lookup
 * 
 * INPUT (req.query):
 *   - q: String (minimum 2 characters)
 *   - limit: Number (default 10)
 * 
 * OUTPUT:
 *   { success: true, count: N, data: [{ appid, name }, ...] }
 * 
 * USE CASE:
 *   Autocomplete dropdown as user types game name.
 *   Returns lightweight results from 200k+ SteamApps index.
 *   Uses MongoDB Atlas Search for fuzzy matching.
 */
export const lookupSteamApps = async (req, res) => {
    try {
        const query = req.query.q || '';
        const limit = parseInt(req.query.limit) || 10;

        console.log(`🎮 [GameController.lookupSteamApps] Query: "${query}", Limit: ${limit}`);

        // Require minimum 2 characters
        if (query.length < 2) {
            return res.json({
                success: true,
                count: 0,
                data: [],
                message: 'Please enter at least 2 characters'
            });
        }

        const results = await gameService.searchSteamApps(query, limit);

        res.json({
            success: true,
            count: results.length,
            data: results
        });
    } catch (error) {
        console.error('❌ [GameController.lookupSteamApps] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// GET SEARCH RESULTS PAGE (Enter without selecting)
// =============================================================================
/**
 * @controller getSearchResults
 * @route GET /api/games/search-results
 * 
 * INPUT (req.query):
 *   - q: String (minimum 2 characters)
 *   - limit: Number (default 20)
 * 
 * OUTPUT:
 *   {
 *     success: true,
 *     count: N,
 *     data: [
 *       { appid, name, image, hasFullData },
 *       ...
 *     ]
 *   }
 * 
 * USE CASE:
 *   When user presses Enter in the search box without selecting an autocomplete result.
 *   Displays a grid of game tiles with Steam header images.
 *   Clicking a tile triggers the same flow as selecting from autocomplete.
 */
export const getSearchResults = async (req, res) => {
    try {
        const query = req.query.q || '';
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;

        console.log(`🎮 [GameController.getSearchResults] Query: "${query}", Page: ${page}, Limit: ${limit}`);

        // Require minimum 2 characters
        if (query.length < 2) {
            return res.json({
                success: true,
                data: {
                    games: [],
                    total: 0,
                    page: 1,
                    totalPages: 0
                },
                message: 'Please enter at least 2 characters'
            });
        }

        const results = await gameService.getGameSearchResults(query, page, limit);

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('❌ [GameController.getSearchResults] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// GET GAME BY ID
// =============================================================================
/**
 * @controller getGameById
 * @route GET /api/games/:id
 * 
 * INPUT (req.params):
 *   - id: MongoDB ObjectId string
 * 
 * OUTPUT:
 *   { success: true, data: {...game with requirements} }
 *   OR { success: false, message: "Game not found" } with 404
 */
export const getGameById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🎮 [GameController.getGameById] ID: ${id}`);

        // Basic validation for MongoDB ObjectId format
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid game ID format'
            });
        }

        const game = await gameService.getGameById(id);

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        res.json({
            success: true,
            data: game
        });
    } catch (error) {
        console.error('❌ [GameController.getGameById] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// GET GAME BY STEAM APP ID (Auto-fetch from Steam if not in DB)
// =============================================================================
/**
 * @controller getGameBySteamId
 * @route GET /api/games/steam/:steamId
 * 
 * INPUT (req.params):
 *   - steamId: Steam's appid (number)
 * 
 * INPUT (req.query):
 *   - autoFetch: Boolean (default: true) - Whether to auto-fetch from Steam if not in DB
 * 
 * OUTPUT:
 *   { success: true, source: 'database'|'steam', data: {...game} }
 *   OR { success: false, message: "..." } with appropriate error code
 * 
 * BEHAVIOR:
 *   1. First checks if game exists in our database
 *   2. If not found AND autoFetch is enabled, fetches from Steam API
 *   3. Saves the fetched game to database for future requests
 *   4. Returns the game with source indicator
 */
export const getGameBySteamId = async (req, res) => {
    try {
        const { steamId } = req.params;
        const autoFetch = req.query.autoFetch !== 'false'; // Default to true

        console.log(`🎮 [GameController.getGameBySteamId] Steam ID: ${steamId}, AutoFetch: ${autoFetch}`);

        const steamAppId = parseInt(steamId);
        if (isNaN(steamAppId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid Steam App ID format'
            });
        }

        // Step 1: Check if game exists in our database
        let game = await gameService.getGameBySteamId(steamAppId);

        if (game) {
            console.log(`🎮 [GameController.getGameBySteamId] Found in database: ${game.name}`);
            return res.json({
                success: true,
                source: 'database',
                data: game
            });
        }

        // Step 2: Game not in database
        if (!autoFetch) {
            return res.status(404).json({
                success: false,
                message: 'Game not in database',
                steamAppId: steamAppId
            });
        }

        // Step 3: Auto-fetch from Steam
        console.log(`🎮 [GameController.getGameBySteamId] Not in DB, fetching from Steam...`);

        try {
            game = await gameService.fetchAndCreateGame(steamAppId);

            console.log(`🎮 [GameController.getGameBySteamId] Successfully fetched from Steam: ${game.name}`);
            return res.json({
                success: true,
                source: 'steam',
                isNew: true,
                data: game
            });
        } catch (steamError) {
            console.error(`❌ [GameController.getGameBySteamId] Steam fetch failed:`, steamError.message);
            return res.status(404).json({
                success: false,
                message: `Game not found on Steam: ${steamError.message}`,
                steamAppId: steamAppId
            });
        }
    } catch (error) {
        console.error('❌ [GameController.getGameBySteamId] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// FETCH GAME DETAILS FROM STEAM
// =============================================================================
/**
 * @controller fetchGameDetails
 * @route POST /api/games/fetch-details
 * 
 * INPUT (req.body):
 *   - steamAppId: Number (Steam's appid)
 * 
 * OUTPUT:
 *   { success: true, isNew: Boolean, data: {...full game} }
 * 
 * BEHAVIOR:
 *   1. If game exists in DB → return existing (isNew: false)
 *   2. If not → fetch from Steam API, parse, save, return (isNew: true)
 * 
 * ERRORS:
 *   - 400: Missing steamAppId
 *   - 500: Steam API failure
 */
export const fetchGameDetails = async (req, res) => {
    try {
        const { steamAppId } = req.body;

        console.log(`🎮 [GameController.fetchGameDetails] Steam App ID: ${steamAppId}`);

        // Validate input
        if (!steamAppId) {
            return res.status(400).json({
                success: false,
                message: 'steamAppId is required in request body'
            });
        }

        const numericId = parseInt(steamAppId);
        if (isNaN(numericId)) {
            return res.status(400).json({
                success: false,
                message: 'steamAppId must be a valid number'
            });
        }

        // Check if already exists (for isNew flag)
        const existing = await gameService.getGameBySteamId(numericId);

        // Fetch or get existing
        const game = await gameService.fetchAndCreateGame(numericId);

        res.json({
            success: true,
            isNew: !existing,
            data: game
        });
    } catch (error) {
        console.error('❌ [GameController.fetchGameDetails] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// DEBUG: GET COLLECTION COUNTS
// =============================================================================
export const getCollectionCounts = async (req, res) => {
    try {
        const counts = await gameService.getCollectionCounts();
        res.json({
            success: true,
            data: counts
        });
    } catch (error) {
        console.error('❌ [GameController.getCollectionCounts] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};