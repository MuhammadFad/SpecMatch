/**
 * =============================================================================
 * GAME SERVICE
 * =============================================================================
 * 
 * PURPOSE:
 * This service handles all database operations for Games and SteamApps.
 * It manages two collections:
 *   1. SteamApps - Light index (200k+ entries): { appid, name }
 *   2. Games - Full details (fetched on-demand): { steam_app_id, name, image, requirements }
 * 
 * FLOW POSITION:
 * Route → Controller → [SERVICE] → Model/Database
 * 
 * THE LOOKUP FLOW:
 * 1. User types "Cyberpunk" in search
 * 2. We search SteamApps for matching names (fast, indexed)
 * 3. User clicks on a result
 * 4. We check if full Game doc exists in Games collection
 * 5. If not, we fetch from Steam API and create it
 * 6. Return full Game doc for compatibility checks
 * 
 * DATA MODEL REFERENCE (Game):
 * {
 *   steam_app_id: Number,
 *   name: String,
 *   image: String,
 *   requirements: {
 *     minimum: { ram_gb, storage_gb, gpu_score, cpu_score, gpu_text, cpu_text },
 *     recommended: { ram_gb, storage_gb, gpu_score, cpu_score, gpu_text, cpu_text }
 *   },
 *   keywords: [String],
 *   embedding: [Number]
 * }
 */

import Game from '../models/Game.js';
import SteamApp from '../models/SteamApp.js';
import axios from 'axios';
import { parseSteamRequirements } from '../utils/steamParser.js';

const STEAM_API_KEY = process.env.STEAM_API_KEY;


// =============================================================================
// SEARCH GAMES (In our Games collection)
// =============================================================================
/**
 * @function findGames
 * @description Search games that already exist in our Games collection
 * These are games we've already fetched and have full requirement data for.
 * 
 * @param {String} queryText - The user's search input
 * @param {Number} [limit=20] - Maximum results to return
 * 
 * @returns {Array} Array of Game documents with full requirement data
 * 
 * @example
 * // Request: GET /api/games/search?q=cyberpunk
 * findGames('cyberpunk')
 */
export const findGames = async (queryText, limit = 20) => {
    console.log(`📡 [GameService.findGames] Searching games: "${queryText}"`);

    const filter = {};
    if (queryText) {
        filter.name = { $regex: queryText, $options: 'i' };
    }

    const games = await Game.find(filter).limit(limit).lean();
    console.log(`📡 [GameService.findGames] Found ${games.length} games in database`);

    return games;
};


// =============================================================================
// SEARCH STEAM APPS (Lightweight lookup)
// =============================================================================
/**
 * @function searchSteamApps
 * @description Search for games - ALWAYS uses Steam API for best results
 * 
 * SEARCH STRATEGY:
 * 1. ALWAYS query Steam API (most comprehensive, returns relevant matches)
 * 2. Then add local DB results to fill any gaps
 * 3. Steam API returns results like "ELDEN RING" for query "elden" - this is good!
 * 
 * @param {String} queryText - The user's search input
 * @param {Number} [limit=10] - Maximum results to return
 * @param {Boolean} [fetchFromSteamIfNeeded=false] - IGNORED - we always fetch from Steam now
 * 
 * @returns {Array} Array of { appid, name } objects
 */
export const searchSteamApps = async (queryText, limit = 10, fetchFromSteamIfNeeded = false) => {
    console.log(`📡 [GameService.searchSteamApps] Search: "${queryText}" (limit: ${limit})`);

    if (!queryText || queryText.length < 2) {
        return [];
    }

    // Normalize query: trim and lowercase for comparison
    const normalizedQuery = queryText.trim().toLowerCase();

    // Escape special regex characters for safe regex search
    const escapedQuery = normalizedQuery.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');

    console.log(`📡 [GameService.searchSteamApps] Normalized query: "${normalizedQuery}"`);

    let allResults = [];
    const existingAppIds = new Set();

    // STRATEGY 1: ALWAYS Query Steam API - this has all games including new ones
    console.log(`📡 [GameService.searchSteamApps] Querying Steam API...`);
    try {
        const steamResults = await fetchGamesFromSteamAPI(queryText);

        // Add ALL Steam results - Steam API already does relevance matching
        steamResults.forEach(r => {
            if (!existingAppIds.has(r.appid)) {
                allResults.push({ appid: r.appid, name: r.name });
                existingAppIds.add(r.appid);

                // Cache to local DB for future searches
                SteamApp.findOneAndUpdate(
                    { appid: r.appid },
                    { appid: r.appid, name: r.name },
                    { upsert: true, new: true }
                ).catch(err => console.warn(`Failed to cache Steam app ${r.appid}`));
            }
        });
        console.log(`📡 [GameService.searchSteamApps] Steam API results: ${allResults.length}`);
    } catch (error) {
        console.error(`❌ [GameService.searchSteamApps] Steam API query failed: ${error.message}`);
    }

    // STRATEGY 2: Add local DB results (to fill gaps if Steam API failed or returned few results)
    if (allResults.length < limit) {
        try {
            const localResults = await SteamApp.find({
                name: { $regex: `^${escapedQuery}`, $options: 'i' }
            })
                .sort({ name: 1 })
                .limit(Math.max(limit, 100))
                .lean();

            console.log(`📡 [GameService.searchSteamApps] Local DB found ${localResults.length} matches`);

            localResults.forEach(r => {
                if (!existingAppIds.has(r.appid)) {
                    allResults.push({ appid: r.appid, name: r.name });
                    existingAppIds.add(r.appid);
                }
            });
        } catch (error) {
            console.error(`❌ [GameService.searchSteamApps] Local search failed: ${error.message}`);
        }
    }

    console.log(`📡 [GameService.searchSteamApps] Returning ${Math.min(allResults.length, limit)} results`);
    return allResults.slice(0, limit);
};


// =============================================================================
// FETCH GAMES FROM STEAM API DIRECTLY
// =============================================================================
/**
 * @function fetchGamesFromSteamAPI
 * @description Query Steam's search API directly for games
 * Used as a fallback when our local database doesn't have enough results
 * 
 * @param {String} queryText - The search query
 * @returns {Array} Array of { appid, name } objects from Steam
 */
export const fetchGamesFromSteamAPI = async (queryText) => {
    console.log(`📡 [GameService.fetchGamesFromSteamAPI] Fetching from Steam: "${queryText}"`);

    try {
        // Steam Store search API - returns up to 50 results
        const searchUrl = `https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(queryText)}&l=english&cc=US`;
        console.log(`📡 [GameService.fetchGamesFromSteamAPI] URL: ${searchUrl}`);

        const response = await axios.get(searchUrl, {
            timeout: 15000,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'SpecMatch/1.0'
            }
        });

        console.log(`📡 [GameService.fetchGamesFromSteamAPI] Response status: ${response.status}`);
        console.log(`📡 [GameService.fetchGamesFromSteamAPI] Response has items: ${!!(response.data && response.data.items)}`);

        if (response.data && response.data.items) {
            const games = response.data.items
                .filter(item => item.type === 'app') // Only games, not DLC/bundles
                .map(item => ({
                    appid: item.id,
                    name: item.name
                }));

            console.log(`📡 [GameService.fetchGamesFromSteamAPI] Found ${games.length} games from Steam API`);
            if (games.length > 0) {
                console.log(`📡 [GameService.fetchGamesFromSteamAPI] First result: ${games[0].name} (${games[0].appid})`);
            }
            return games;
        }

        console.log(`📡 [GameService.fetchGamesFromSteamAPI] No items in response`);
        return [];
    } catch (error) {
        console.error(`❌ [GameService.fetchGamesFromSteamAPI] Error: ${error.message}`);
        console.error(`❌ [GameService.fetchGamesFromSteamAPI] Stack: ${error.stack}`);
        return [];
    }
};


// =============================================================================
// GET SEARCH RESULTS PAGE (When user presses Enter without selecting)
// =============================================================================
/**
 * @function getGameSearchResults
 * @description Returns search results formatted for display as a grid of game tiles
 * Used when user presses Enter in the search box without selecting an autocomplete result
 * 
 * IMPROVED: Guarantees results by trying multiple search strategies
 * 
 * Returns results with:
 * - Steam image URLs (header images)
 * - Basic info (appid, name)
 * - Indication if we already have full game data
 * 
 * @param {String} queryText - The user's search input
 * @param {Number} [limit=20] - Maximum results to return
 * 
 * @returns {Array} Array of game tiles for display:
 * [
 *   {
 *     appid: 1091500,
 *     name: "Cyberpunk 2077",
 *     image: "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1091500/header.jpg",
 *     hasFullData: true/false
 *   },
 *   ...
 * ]
 * 
 * @example
 * // Request: GET /api/games/search-results?q=cyberpunk
 * getGameSearchResults('cyberpunk', 1, 20)
 */
export const getGameSearchResults = async (queryText, page = 1, limit = 20) => {
    console.log(`📡 [GameService.getGameSearchResults] Getting search results for: "${queryText}" (page ${page}, limit ${limit})`);

    if (!queryText || queryText.length < 2) {
        return { games: [], total: 0, page: 1, totalPages: 0 };
    }

    // Get a larger set for pagination calculation - use enhanced search
    const maxResults = 100;
    let steamApps = await searchSteamApps(queryText, maxResults);

    // If still no results, try searching our Games collection directly
    if (steamApps.length === 0) {
        console.log(`📡 [GameService.getGameSearchResults] SteamApps empty, searching Games collection...`);
        const gamesFromDb = await findGames(queryText, maxResults);
        if (gamesFromDb.length > 0) {
            steamApps = gamesFromDb.map(g => ({
                appid: g.steam_app_id,
                name: g.name
            }));
            console.log(`📡 [GameService.getGameSearchResults] Found ${steamApps.length} games in Games collection`);
        }
    }

    if (steamApps.length === 0) {
        return { games: [], total: 0, page: 1, totalPages: 0 };
    }

    const total = steamApps.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;

    // Get paginated slice
    const paginatedApps = steamApps.slice(skip, skip + limit);

    // Get list of appids
    const appIds = paginatedApps.map(app => app.appid);

    // Check which ones we already have in our Games collection
    const existingGames = await Game.find({
        steam_app_id: { $in: appIds }
    }).select('steam_app_id').lean();

    const existingAppIds = new Set(existingGames.map(g => g.steam_app_id));

    // Build results with Steam image URLs
    const STEAM_IMAGE_BASE = 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps';

    const games = paginatedApps.map(app => ({
        steam_appid: app.appid,  // Frontend expects steam_appid
        appid: app.appid,
        name: app.name,
        image: `${STEAM_IMAGE_BASE}/${app.appid}/header.jpg`,
        hasFullData: existingAppIds.has(app.appid)
    }));

    console.log(`📡 [GameService.getGameSearchResults] Returning ${games.length} results (page ${page}/${totalPages}, total ${total})`);
    return { games, total, page, totalPages };
};


// =============================================================================
// GET GAME BY ID
// =============================================================================
/**
 * @function getGameById
 * @description Fetch a single game by its MongoDB _id
 * 
 * @param {String} id - MongoDB ObjectId as string
 * 
 * @returns {Object|null} Full Game document or null if not found
 * 
 * @example
 * // Request: GET /api/games/507f1f77bcf86cd799439011
 * getGameById('507f1f77bcf86cd799439011')
 */
export const getGameById = async (id) => {
    console.log(`📡 [GameService.getGameById] Fetching game: ${id}`);
    return await Game.findById(id).lean();
};


// =============================================================================
// GET GAME BY STEAM APP ID
// =============================================================================
/**
 * @function getGameBySteamId
 * @description Fetch a game by its Steam App ID (not MongoDB ID)
 * 
 * @param {Number} steamAppId - Steam's appid (e.g., 730 for CS2)
 * 
 * @returns {Object|null} Full Game document or null if not found
 * 
 * @example
 * // Request: GET /api/games/steam/730
 * getGameBySteamId(730)
 */
export const getGameBySteamId = async (steamAppId) => {
    console.log(`📡 [GameService.getGameBySteamId] Fetching game by Steam ID: ${steamAppId}`);
    return await Game.findOne({ steam_app_id: Number(steamAppId) }).lean();
};


// =============================================================================
// FETCH AND CREATE GAME FROM STEAM
// =============================================================================
/**
 * @function fetchAndCreateGame
 * @description The KEY function - fetches full game data from Steam API
 * and creates a Game document in our database.
 * 
 * THIS IS WHERE THE MAGIC HAPPENS:
 * 1. Called when user clicks on a SteamApp search result
 * 2. Checks if we already have this game → return it
 * 3. If not, fetch from Steam Store API
 * 4. Parse the requirements HTML using steamParser
 * 5. Create and save the Game document
 * 6. Return the full game for compatibility checks
 * 
 * @param {Number} steamAppId - Steam's appid
 * 
 * @returns {Object} Full Game document (new or existing)
 * 
 * @throws {Error} If Steam API fails or game doesn't exist
 * 
 * @example
 * // Request: POST /api/games/fetch-details
 * // Body: { steamAppId: 1091500 }
 * // This fetches Cyberpunk 2077 from Steam and creates a Game doc
 * fetchAndCreateGame(1091500)
 */
export const fetchAndCreateGame = async (steamAppId) => {
    console.log(`📡 [GameService.fetchAndCreateGame] Processing Steam ID: ${steamAppId}`);

    // Step 1: Check if we already have this game
    const existingGame = await Game.findOne({ steam_app_id: steamAppId });
    if (existingGame) {
        console.log(`📡 [GameService.fetchAndCreateGame] Game already exists: ${existingGame.name}`);
        return existingGame.toObject();
    }

    // Step 2: Fetch from Steam Store API
    console.log(`📡 [GameService.fetchAndCreateGame] Fetching from Steam API...`);
    const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${steamAppId}`;

    try {
        const response = await axios.get(steamUrl);
        const steamData = response.data[steamAppId];

        if (!steamData?.success) {
            throw new Error(`Steam API returned no data for appid ${steamAppId}`);
        }

        const gameData = steamData.data;

        // Step 3: Parse requirements using our parser (for compatibility scores)
        const requirements = await parseSteamRequirements(gameData);

        // Step 4: Create the Game document with ALL Steam data
        const newGame = new Game({
            steam_app_id: gameData.steam_appid,
            name: gameData.name,
            short_description: gameData.short_description || '',
            image: gameData.header_image || '',

            // Store raw HTML requirements for display
            pc_requirements: {
                minimum: gameData.pc_requirements?.minimum || '',
                recommended: gameData.pc_requirements?.recommended || ''
            },

            // Store parsed requirements for compatibility calculations
            requirements: requirements,

            // Store additional metadata for display
            genres: gameData.genres || [],
            categories: gameData.categories || [],
            developers: gameData.developers || [],
            publishers: gameData.publishers || [],
            release_date: gameData.release_date || {},

            keywords: gameData.genres?.map(g => g.description.toLowerCase()) || []
        });

        await newGame.save();
        console.log(`📡 [GameService.fetchAndCreateGame] Created new game: ${newGame.name}`);

        return newGame.toObject();

    } catch (error) {
        console.error(`❌ [GameService.fetchAndCreateGame] Steam API error:`, error.message);
        throw new Error(`Failed to fetch game from Steam: ${error.message}`);
    }
};


// =============================================================================
// GET OR FETCH GAME (Smart resolver)
// =============================================================================
/**
 * @function getOrFetchGame
 * @description Smart resolver that returns a Game document, fetching from Steam if needed
 * This is the main entry point for the compatibility flow
 * 
 * @param {String} identifier - Either MongoDB _id or Steam appid
 * @param {String} [type='id'] - 'id' for MongoDB ID, 'steam' for Steam appid
 * 
 * @returns {Object} Full Game document
 * 
 * @example
 * // By MongoDB ID
 * getOrFetchGame('507f1f77bcf86cd799439011', 'id')
 * 
 * // By Steam App ID (will fetch from Steam if not in DB)
 * getOrFetchGame('1091500', 'steam')
 */
export const getOrFetchGame = async (identifier, type = 'id') => {
    console.log(`📡 [GameService.getOrFetchGame] Resolving game: ${identifier} (type: ${type})`);

    if (type === 'id') {
        const game = await getGameById(identifier);
        if (!game) throw new Error(`Game not found with ID: ${identifier}`);
        return game;
    }

    if (type === 'steam') {
        // First check if we have it
        let game = await getGameBySteamId(identifier);
        if (game) return game;

        // If not, fetch it
        return await fetchAndCreateGame(Number(identifier));
    }

    throw new Error(`Invalid identifier type: ${type}`);
};


// =============================================================================
// DEBUG: GET COLLECTION COUNTS
// =============================================================================
export const getCollectionCounts = async () => {
    const steamAppsCount = await SteamApp.countDocuments();
    const gamesCount = await Game.countDocuments();

    // Get a sample from SteamApps if any exist
    const sampleSteamApps = await SteamApp.find().limit(3).lean();

    return {
        steamAppsCount,
        gamesCount,
        sampleSteamApps
    };
};