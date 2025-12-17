/**
 * =============================================================================
 * COMPATIBILITY CONTROLLER
 * =============================================================================
 * 
 * PURPOSE:
 * Handle HTTP request/response for the core "Can I Run It?" feature.
 * This is the main value proposition of SpecMatch.
 * 
 * FLOW POSITION:
 * Route → [CONTROLLER] → CompatibilityService → LaptopService + GameService
 * 
 * USER JOURNEYS:
 * 
 * 1. SINGLE CHECK:
 *    "Can the ASUS ROG Strix run Cyberpunk?"
 *    → POST /check { laptopId, gameId }
 *    → Returns detailed compatibility report
 * 
 * 2. BATCH COMPARISON:
 *    "Which of these 5 laptops runs Elden Ring best?"
 *    → POST /batch { laptopIds: [...], gameId, sortBy }
 *    → Returns ranked list with winner and best value
 */

import * as compatibilityService from '../services/compatibilityService.js';

// =============================================================================
// SINGLE COMPATIBILITY CHECK
// =============================================================================
/**
 * @controller checkCompatibility
 * @route POST /api/compatibility/check
 * 
 * INPUT (req.body):
 *   - laptopId: String (MongoDB ObjectId)
 *   - gameId: String (MongoDB ObjectId)
 * 
 * OUTPUT:
 *   {
 *     success: true,
 *     data: {
 *       laptop: { id, name, brand, image, specs },
 *       game: { id, name, image, requirements },
 *       compatibility: {
 *         canRun: Boolean,
 *         verdict: String,
 *         score: Number (0-100),
 *         bottleneck: String,
 *         details: { cpu, gpu, ram, storage },
 *         estimatedPerformance: String
 *       }
 *     }
 *   }
 * 
 * ERRORS:
 *   - 400: Missing laptopId or gameId
 *   - 404: Laptop or Game not found
 *   - 500: Calculation error
 */
export const checkCompatibility = async (req, res) => {
    try {
        const { laptopId, gameId } = req.body;

        console.log(`🎮 [CompatibilityController.check] Laptop: ${laptopId}, Game: ${gameId}`);

        // Validate required fields
        if (!laptopId || !gameId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both laptopId and gameId in the request body',
                example: {
                    laptopId: '507f1f77bcf86cd799439011',
                    gameId: '507f1f77bcf86cd799439022 (MongoDB ID) or 1091500 (Steam App ID)'
                }
            });
        }

        // Validate MongoDB ObjectId format for laptopId
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        if (!objectIdRegex.test(laptopId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid laptopId format. Must be a 24-character hex string.'
            });
        }

        // Resolve gameId - can be MongoDB ObjectId OR Steam App ID
        let resolvedGameId = gameId;

        if (!objectIdRegex.test(gameId)) {
            // Not a MongoDB ObjectId - treat as Steam App ID
            const steamAppId = parseInt(gameId);
            if (isNaN(steamAppId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid gameId format. Must be a 24-character MongoDB ID or a numeric Steam App ID.'
                });
            }

            console.log(`🎮 [CompatibilityController.check] Steam App ID detected: ${steamAppId}, resolving game...`);

            // Get or fetch the game using compatibilityService helper
            try {
                const game = await compatibilityService.getOrFetchGameBySteamId(steamAppId);
                if (!game) {
                    return res.status(404).json({
                        success: false,
                        message: `Game not found for Steam App ID: ${steamAppId}`
                    });
                }
                resolvedGameId = game._id.toString();
                console.log(`🎮 [CompatibilityController.check] Resolved to MongoDB ID: ${resolvedGameId}`);
            } catch (fetchError) {
                console.error(`❌ [CompatibilityController.check] Failed to fetch game:`, fetchError.message);
                return res.status(404).json({
                    success: false,
                    message: `Failed to fetch game from Steam: ${fetchError.message}`
                });
            }
        }

        const result = await compatibilityService.calculateCompatibility(laptopId, resolvedGameId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ [CompatibilityController.check] Error:', error.message);

        // Handle specific errors
        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// BATCH COMPATIBILITY CHECK
// =============================================================================
/**
 * @controller checkBatchCompatibility
 * @route POST /api/compatibility/batch
 * 
 * INPUT (req.body):
 *   - laptopIds: Array of Strings (MongoDB ObjectIds)
 *   - gameId: String (MongoDB ObjectId)
 *   - sortBy: String ('score' | 'price' | 'value') - default 'score'
 * 
 * OUTPUT:
 *   {
 *     success: true,
 *     data: {
 *       game: { id, name, image },
 *       results: [
 *         { rank: 1, laptop, compatibility, price },
 *         { rank: 2, laptop, compatibility, price },
 *         ...
 *       ],
 *       summary: {
 *         total: Number,
 *         canRun: Number,
 *         cannotRun: Number,
 *         bestMatch: { laptopId, laptopName, score },
 *         bestValue: { laptopId, laptopName, price, scorePerDollar }
 *       }
 *     }
 *   }
 * 
 * ERRORS:
 *   - 400: Missing or invalid parameters
 *   - 404: Game not found
 *   - 500: Calculation error
 */
export const checkBatchCompatibility = async (req, res) => {
    try {
        const { laptopIds, gameId, sortBy = 'score' } = req.body;

        console.log(`🎮 [CompatibilityController.batch] ${laptopIds?.length || 0} laptops vs Game: ${gameId}`);

        // Validate required fields
        if (!laptopIds || !Array.isArray(laptopIds) || laptopIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide laptopIds as a non-empty array',
                example: {
                    laptopIds: ['id1', 'id2', 'id3'],
                    gameId: '507f1f77bcf86cd799439022',
                    sortBy: 'score'
                }
            });
        }

        if (!gameId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide gameId'
            });
        }

        // Validate sortBy parameter
        const validSortOptions = ['score', 'price', 'value'];
        if (!validSortOptions.includes(sortBy)) {
            return res.status(400).json({
                success: false,
                message: `Invalid sortBy value. Must be one of: ${validSortOptions.join(', ')}`
            });
        }

        // Validate MongoDB ObjectId formats
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        const invalidIds = laptopIds.filter(id => !objectIdRegex.test(id));
        if (invalidIds.length > 0) {
            return res.status(400).json({
                success: false,
                message: `Invalid laptop ID format: ${invalidIds.join(', ')}`
            });
        }

        if (!objectIdRegex.test(gameId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid gameId format'
            });
        }

        // Limit batch size to prevent abuse
        if (laptopIds.length > 50) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 50 laptops per batch request'
            });
        }

        const result = await compatibilityService.calculateBatchCompatibility(
            laptopIds,
            gameId,
            sortBy
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ [CompatibilityController.batch] Error:', error.message);

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// FIND LAPTOPS THAT CAN RUN A GAME
// =============================================================================
/**
 * @controller getLaptopsForGame
 * @route GET /api/compatibility/laptops-for-game/:gameId
 * 
 * INPUT (req.params):
 *   - gameId: String (MongoDB ObjectId of the game)
 * 
 * INPUT (req.query):
 *   - rankBy: String ('gaming' | 'performance' | 'value') - default 'gaming'
 *   - page: Number (default 1)
 *   - limit: Number (default 20)
 *   - Plus all laptop filters: minPrice, maxPrice, brand, maxWeight, etc.
 * 
 * OUTPUT:
 *   {
 *     success: true,
 *     data: {
 *       game: { id, name, image, requirements },
 *       appliedFilters: { gameRequirements, userFilters, rankBy },
 *       results: [
 *         { laptop, tier, compatibilityScore, estimatedPerformance },
 *         ...
 *       ],
 *       summary: { total, exceedsRecommended, meetsMinimum, page, totalPages }
 *     }
 *   }
 * 
 * USE CASE:
 *   "Show me all laptops that can run Cyberpunk 2077, ranked by gaming performance"
 *   Can further filter by price, brand, weight, etc.
 * 
 * TIERS:
 *   - exceeds_recommended: Exceeds the game's recommended specs
 *   - meets_minimum: Meets minimum requirements but not recommended
 *   
 *   Note: Laptops below minimum requirements are NOT returned (trimmed out)
 * 
 * NOTE: This endpoint now accepts BOTH MongoDB ObjectId and Steam App ID.
 *       If Steam App ID is provided and game is not in DB, it will be auto-fetched from Steam.
 */
export const getLaptopsForGame = async (req, res) => {
    try {
        const { gameId } = req.params;
        const {
            rankBy = 'gaming',
            page = 1,
            limit = 20,
            // Pass through any additional filters
            ...additionalFilters
        } = req.query;

        console.log(`🎮 [CompatibilityController.laptopsForGame] Game ID: ${gameId}, RankBy: ${rankBy}`);

        // Determine if gameId is MongoDB ObjectId or Steam App ID
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        let resolvedGameId = gameId;

        if (!objectIdRegex.test(gameId)) {
            // Not a MongoDB ObjectId - treat as Steam App ID
            const steamAppId = parseInt(gameId);
            if (isNaN(steamAppId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid gameId format. Must be a 24-character MongoDB ID or a numeric Steam App ID.'
                });
            }

            console.log(`🎮 [CompatibilityController.laptopsForGame] Steam App ID detected: ${steamAppId}, resolving game...`);

            // Get or fetch the game using gameService
            const game = await compatibilityService.getOrFetchGameBySteamId(steamAppId);
            if (!game) {
                return res.status(404).json({
                    success: false,
                    message: `Game not found for Steam App ID: ${steamAppId}`
                });
            }

            resolvedGameId = game._id.toString();
            console.log(`🎮 [CompatibilityController.laptopsForGame] Resolved to MongoDB ID: ${resolvedGameId}`);
        }

        // Validate rankBy
        const validRankOptions = ['gaming', 'performance', 'value', 'portable', 'budget'];
        if (!validRankOptions.includes(rankBy)) {
            return res.status(400).json({
                success: false,
                message: `Invalid rankBy value. Must be one of: ${validRankOptions.join(', ')}`
            });
        }

        const result = await compatibilityService.findLaptopsForGame(
            resolvedGameId,
            additionalFilters,
            rankBy,
            parseInt(page),
            parseInt(limit)
        );

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ [CompatibilityController.laptopsForGame] Error:', error.message);

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// CHECK USER'S LAPTOP COMPATIBILITY
// =============================================================================
/**
 * @controller checkUserLaptopCompatibility
 * @route POST /api/compatibility/check-my-laptop
 * 
 * INPUT (req.body):
 *   - userLaptopId: String (MongoDB ObjectId of the user's laptop)
 *   - gameId: String (MongoDB ObjectId of the game)
 * 
 * OUTPUT:
 *   {
 *     success: true,
 *     data: {
 *       userLaptop: { id, name, specs },
 *       game: { id, name, image, requirements },
 *       compatibility: { canRun, verdict, score, bottleneck, details, estimatedPerformance }
 *     }
 *   }
 * 
 * USE CASE:
 *   User has registered their laptop specs and wants to check:
 *   "Can MY laptop run Cyberpunk 2077?"
 */
export const checkUserLaptopCompatibility = async (req, res) => {
    try {
        const { userLaptopId, gameId } = req.body;

        console.log(`🎮 [CompatibilityController.checkUserLaptop] UserLaptop: ${userLaptopId}, Game: ${gameId}`);

        // Validate required fields
        if (!userLaptopId || !gameId) {
            return res.status(400).json({
                success: false,
                message: 'Please provide both userLaptopId and gameId in the request body',
                example: {
                    userLaptopId: '507f1f77bcf86cd799439011',
                    gameId: '507f1f77bcf86cd799439022'
                }
            });
        }

        // Validate MongoDB ObjectId format
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        if (!objectIdRegex.test(userLaptopId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid userLaptopId format. Must be a 24-character hex string.'
            });
        }
        if (!objectIdRegex.test(gameId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid gameId format. Must be a 24-character hex string.'
            });
        }

        const result = await compatibilityService.checkUserLaptopCompatibility(userLaptopId, gameId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ [CompatibilityController.checkUserLaptop] Error:', error.message);

        if (error.message.includes('not found')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// CHECK ALL USER'S LAPTOPS AGAINST A GAME
// =============================================================================
/**
 * @controller checkAllUserLaptopsForGame
 * @route GET /api/compatibility/my-laptops/:gameId
 * 
 * INPUT (req.params):
 *   - gameId: String (MongoDB ObjectId OR Steam App ID)
 * 
 * INPUT (req.query):
 *   - uid: String (Firebase UID of the user)
 * 
 * OUTPUT:
 *   {
 *     success: true,
 *     data: {
 *       game: { id, name, image },
 *       results: [{ userLaptop, compatibility, rank }, ...],
 *       summary: { total, canRun, cannotRun, bestMatch }
 *     }
 *   }
 * 
 * NOTE: This endpoint now accepts BOTH MongoDB ObjectId and Steam App ID.
 *       If Steam App ID is provided and game is not in DB, it will be auto-fetched from Steam.
 * 
 * USE CASE:
 *   User has multiple laptops registered and wants to see:
 *   "Which of my laptops can run Elden Ring?"
 */
export const checkAllUserLaptopsForGame = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { uid } = req.query;

        console.log(`🎮 [CompatibilityController.checkAllUserLaptops] User: ${uid}, Game ID: ${gameId}`);

        // Validate required fields
        if (!uid) {
            return res.status(400).json({
                success: false,
                message: 'Please provide uid (Firebase UID) as a query parameter',
                example: '/api/compatibility/my-laptops/507f1f77bcf86cd799439022?uid=firebaseUID123'
            });
        }

        // Determine if gameId is MongoDB ObjectId or Steam App ID
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        let resolvedGameId = gameId;

        if (!objectIdRegex.test(gameId)) {
            // Not a MongoDB ObjectId - treat as Steam App ID
            const steamAppId = parseInt(gameId);
            if (isNaN(steamAppId)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid gameId format. Must be a 24-character MongoDB ID or a numeric Steam App ID.'
                });
            }

            console.log(`🎮 [CompatibilityController.checkAllUserLaptops] Steam App ID detected: ${steamAppId}, resolving game...`);

            // Get or fetch the game using gameService
            const game = await compatibilityService.getOrFetchGameBySteamId(steamAppId);
            if (!game) {
                return res.status(404).json({
                    success: false,
                    message: `Game not found for Steam App ID: ${steamAppId}`
                });
            }

            resolvedGameId = game._id.toString();
            console.log(`🎮 [CompatibilityController.checkAllUserLaptops] Resolved to MongoDB ID: ${resolvedGameId}`);
        }

        const result = await compatibilityService.checkAllUserLaptopsForGame(uid, resolvedGameId);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('❌ [CompatibilityController.checkAllUserLaptops] Error:', error.message);

        if (error.message.includes('not found') || error.message.includes('no laptops')) {
            return res.status(404).json({
                success: false,
                message: error.message
            });
        }

        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};