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
                    gameId: '507f1f77bcf86cd799439022'
                }
            });
        }

        // Validate MongoDB ObjectId format
        const objectIdRegex = /^[0-9a-fA-F]{24}$/;
        if (!objectIdRegex.test(laptopId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid laptopId format. Must be a 24-character hex string.'
            });
        }
        if (!objectIdRegex.test(gameId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid gameId format. Must be a 24-character hex string.'
            });
        }

        const result = await compatibilityService.calculateCompatibility(laptopId, gameId);

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