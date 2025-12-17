/**
 * =============================================================================
 * COMPATIBILITY ROUTES
 * =============================================================================
 * 
 * BASE URL: /api/compatibility
 * 
 * PURPOSE:
 * This is the CORE FEATURE of SpecMatch - "Can I Run It?"
 * These endpoints compare laptop specs against game requirements.
 * 
 * HOW IT WORKS:
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │                                                                         │
 * │  LAPTOP                              GAME                              │
 * │  ├─ cpu.score: 75          vs       requirements.minimum.cpu_score: 45 │
 * │  ├─ gpu.score: 82          vs       requirements.minimum.gpu_score: 55 │
 * │  ├─ ram.size_gb: 32        vs       requirements.minimum.ram_gb: 8     │
 * │  └─ storage.capacity_gb: 1000  vs   requirements.minimum.storage_gb: 70│
 * │                                                                         │
 * │                          ↓ COMPARISON                                  │
 * │                                                                         │
 * │  RESULT: {                                                             │
 * │    canRun: true,                                                       │
 * │    verdict: "Excellent",                                               │
 * │    score: 92,                                                          │
 * │    bottleneck: "None",                                                 │
 * │    estimatedPerformance: "Ultra"                                       │
 * │  }                                                                     │
 * │                                                                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 * 
 * VERDICTS EXPLAINED:
 * - "Excellent" (90-100) → Exceeds recommended specs, can play on Ultra
 * - "Good" (75-89) → Between min and rec, High settings expected
 * - "Playable" (50-74) → Meets minimum, Medium settings
 * - "Struggle" (30-49) → Slightly below min, Low settings, may lag
 * - "Unplayable" (0-29) → Significantly below requirements
 * 
 * AVAILABLE ENDPOINTS:
 * 
 * | Method | Endpoint              | Description                                    |
 * |--------|-----------------------|------------------------------------------------|
 * | POST   | /check                | Check ONE catalog laptop vs ONE game           |
 * | POST   | /batch                | Check MULTIPLE catalog laptops vs ONE game     |
 * | GET    | /laptops-for-game/:id | Find all catalog laptops that can run a game   |
 * | POST   | /check-my-laptop      | Check USER'S laptop vs ONE game                |
 * | GET    | /my-laptops/:gameId   | Check ALL user's laptops vs ONE game           |
 */

import express from 'express';
import * as compatibilityController from '../controllers/compatibilityController.js';

const router = express.Router();

// =============================================================================
// SINGLE COMPATIBILITY CHECK
// =============================================================================
/**
 * @route   POST /api/compatibility/check
 * @desc    Check if a single laptop can run a single game
 * @access  Public
 * 
 * @body {String} laptopId - MongoDB ObjectId of the laptop
 * @body {String} gameId - MongoDB ObjectId of the game
 * 
 * USE CASE:
 * User is viewing a laptop product page and wants to know:
 * "Can this laptop run Cyberpunk 2077?"
 * 
 * @example
 * POST /api/compatibility/check
 * Body: {
 *   "laptopId": "507f1f77bcf86cd799439011",
 *   "gameId": "507f1f77bcf86cd799439022"
 * }
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     laptop: {
 *       id: "507f1f77bcf86cd799439011",
 *       name: "ASUS ROG Strix G16",
 *       brand: "Asus",
 *       image: "https://...",
 *       specs: {
 *         cpu: { name: "Intel Core i9-13980HX", score: 89 },
 *         gpu: { name: "RTX 4090", score: 95, vram: 16 },
 *         ram: { size_gb: 32, type: "DDR5" },
 *         storage: { capacity_gb: 1000, type: "SSD" }
 *       }
 *     },
 *     game: {
 *       id: "507f1f77bcf86cd799439022",
 *       name: "Cyberpunk 2077",
 *       image: "https://cdn.steam...",
 *       requirements: {
 *         minimum: { cpu: "i5-3570K", gpu: "GTX 780", ram_gb: 8, storage_gb: 70 },
 *         recommended: { cpu: "i7-6700", gpu: "GTX 1060", ram_gb: 16, storage_gb: 70 }
 *       }
 *     },
 *     compatibility: {
 *       canRun: true,
 *       verdict: "Excellent",
 *       score: 94,
 *       bottleneck: "None",
 *       details: {
 *         cpu: { laptopValue: 89, requiredMin: 45, requiredRec: 60, meets: "recommended", percentage: 148 },
 *         gpu: { laptopValue: 95, requiredMin: 55, requiredRec: 70, meets: "recommended", percentage: 135 },
 *         ram: { laptopValue: 32, requiredMin: 8, requiredRec: 16, meets: "recommended", percentage: 200 },
 *         storage: { laptopValue: 1000, requiredMin: 70, requiredRec: 70, meets: "recommended", percentage: 1428 }
 *       },
 *       estimatedPerformance: "Ultra"
 *     }
 *   }
 * }
 * 
 * @returns {Object} 400 - Missing parameters
 * {
 *   success: false,
 *   message: "Please provide both laptopId and gameId"
 * }
 * 
 * @returns {Object} 404 - Laptop or Game not found
 */
router.post('/check', compatibilityController.checkCompatibility);


// =============================================================================
// BATCH COMPATIBILITY CHECK
// =============================================================================
/**
 * @route   POST /api/compatibility/batch
 * @desc    Check multiple laptops against one game and rank them
 * @access  Public
 * 
 * @body {Array<String>} laptopIds - Array of MongoDB ObjectIds
 * @body {String} gameId - MongoDB ObjectId of the game
 * @body {String} [sortBy='score'] - How to sort: 'score', 'price', 'value'
 * 
 * USE CASES:
 * 1. "Compare" feature: User selected 5 laptops, wants to see which runs Elden Ring best
 * 2. "Find Best Laptop" feature: Given a game, show top laptops that can run it
 * 3. Shopping helper: "These 3 laptops are in my budget - which one for this game?"
 * 
 * @example
 * POST /api/compatibility/batch
 * Body: {
 *   "laptopIds": [
 *     "507f1f77bcf86cd799439011",
 *     "507f1f77bcf86cd799439012",
 *     "507f1f77bcf86cd799439013"
 *   ],
 *   "gameId": "507f1f77bcf86cd799439022",
 *   "sortBy": "score"
 * }
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     game: {
 *       id: "...",
 *       name: "Cyberpunk 2077",
 *       image: "https://..."
 *     },
 *     results: [
 *       {
 *         rank: 1,
 *         laptop: { id, name, brand, image, specs },
 *         compatibility: { canRun: true, verdict: "Excellent", score: 94, ... },
 *         price: 2499
 *       },
 *       {
 *         rank: 2,
 *         laptop: { id, name, brand, image, specs },
 *         compatibility: { canRun: true, verdict: "Good", score: 78, ... },
 *         price: 1299
 *       },
 *       {
 *         rank: 3,
 *         laptop: { id, name, brand, image, specs },
 *         compatibility: { canRun: false, verdict: "Unplayable", score: 22, ... },
 *         price: 599
 *       }
 *     ],
 *     summary: {
 *       total: 3,
 *       canRun: 2,
 *       cannotRun: 1,
 *       bestMatch: {
 *         laptopId: "507f1f77bcf86cd799439011",
 *         laptopName: "ASUS ROG Strix G16",
 *         score: 94
 *       },
 *       bestValue: {
 *         laptopId: "507f1f77bcf86cd799439012",
 *         laptopName: "Lenovo Legion 5",
 *         price: 1299,
 *         scorePerDollar: "0.0601"
 *       }
 *     }
 *   }
 * }
 * 
 * @returns {Object} 400 - Missing or invalid parameters
 */
router.post('/batch', compatibilityController.checkBatchCompatibility);


// =============================================================================
// FIND LAPTOPS THAT CAN RUN A GAME
// =============================================================================
/**
 * @route   GET /api/compatibility/laptops-for-game/:gameId
 * @desc    Find all laptops that can run a specific game, with tier classification
 * @access  Public
 * 
 * @param {String} gameId - MongoDB ObjectId of the game
 * 
 * @query {String} [rankBy='gaming'] - How to rank: 'gaming', 'performance', 'value', 'portable', 'budget'
 * @query {Number} [page=1] - Page number
 * @query {Number} [limit=20] - Results per page
 * @query {Number} [minPrice] - Additional filter: minimum price
 * @query {Number} [maxPrice] - Additional filter: maximum price
 * @query {String} [brand] - Additional filter: brand name
 * @query {Number} [maxWeight] - Additional filter: maximum weight
 * 
 * USE CASES:
 * 1. "What laptops can run Cyberpunk 2077?" → Shows all compatible laptops
 * 2. "Gaming laptops under $2000 that can run Elden Ring" → Filtered results
 * 3. Catalog page for a game showing compatible hardware
 * 
 * TIERS:
 * - exceeds_recommended: Laptop exceeds all recommended specs (can play on High/Ultra)
 * - meets_minimum: Laptop meets minimum specs but not all recommended (can play on Low/Medium)
 * 
 * NOTE: Laptops that don't meet minimum requirements are NOT included in results
 * 
 * @example
 * // Get all laptops that can run a game, ranked by gaming performance
 * GET /api/compatibility/laptops-for-game/507f1f77bcf86cd799439022
 * 
 * // Get laptops under $1500 that can run the game, ranked by value
 * GET /api/compatibility/laptops-for-game/507f1f77bcf86cd799439022?rankBy=value&maxPrice=1500
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     game: {
 *       id: "507f1f77bcf86cd799439022",
 *       name: "Cyberpunk 2077",
 *       image: "https://...",
 *       requirements: {
 *         minimum: { cpu: "i5-3570K", cpu_score: 45, gpu: "GTX 780", gpu_score: 55, ram_gb: 8, storage_gb: 70 },
 *         recommended: { cpu: "i7-6700", cpu_score: 60, gpu: "GTX 1060", gpu_score: 70, ram_gb: 16, storage_gb: 70 }
 *       }
 *     },
 *     appliedFilters: {
 *       gameRequirements: { minCpuScore: 45, minGpuScore: 55, minRam: 8, minStorage: 70 },
 *       userFilters: { maxPrice: 1500 },
 *       rankBy: "value"
 *     },
 *     results: [
 *       {
 *         laptop: {
 *           _id: "...",
 *           slug: "lenovo-legion-5-...",
 *           name: "Lenovo Legion 5 Pro",
 *           brand: "Lenovo",
 *           image: "https://...",
 *           price: 1299,
 *           specs: { cpu, gpu, ram, storage },
 *           rankingScore: 82.5
 *         },
 *         tier: "exceeds_recommended",
 *         compatibilityScore: 92,
 *         estimatedPerformance: "Ultra"
 *       },
 *       {
 *         laptop: { ... },
 *         tier: "meets_minimum",
 *         compatibilityScore: 65,
 *         estimatedPerformance: "Medium"
 *       },
 *       ...
 *     ],
 *     summary: {
 *       total: 150,
 *       exceedsRecommended: 45,
 *       meetsMinimum: 105,
 *       page: 1,
 *       totalPages: 8
 *     }
 *   }
 * }
 * 
 * @returns {Object} 400 - Invalid gameId format
 * @returns {Object} 404 - Game not found
 */
router.get('/laptops-for-game/:gameId', compatibilityController.getLaptopsForGame);


// =============================================================================
// CHECK USER'S LAPTOP COMPATIBILITY
// =============================================================================
/**
 * @route   POST /api/compatibility/check-my-laptop
 * @desc    Check if a user's registered laptop can run a specific game
 * @access  Public (requires userLaptopId from user's collection)
 * 
 * @body {String} userLaptopId - MongoDB ObjectId of the user's laptop (from User_laptops)
 * @body {String} gameId - MongoDB ObjectId of the game
 * 
 * USE CASE:
 * Logged-in user has registered their laptop specs and wants to check:
 * "Can MY laptop run Cyberpunk 2077?"
 * 
 * NOTE: This is different from /check which uses catalog laptops.
 * This endpoint uses the UserLaptop collection (user-entered specs).
 * 
 * @example
 * POST /api/compatibility/check-my-laptop
 * Body: {
 *   "userLaptopId": "507f1f77bcf86cd799439011",
 *   "gameId": "507f1f77bcf86cd799439022"
 * }
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     userLaptop: {
 *       id: "507f1f77bcf86cd799439011",
 *       name: "My Gaming Laptop",
 *       specs: {
 *         cpu: { text: "Intel Core i7-12700H", score: 75 },
 *         gpu: { text: "RTX 3060", score: 80 },
 *         ram_gb: 16,
 *         storage_gb: 512
 *       }
 *     },
 *     game: {
 *       id: "507f1f77bcf86cd799439022",
 *       name: "Cyberpunk 2077",
 *       image: "https://...",
 *       requirements: { minimum: {...}, recommended: {...} }
 *     },
 *     compatibility: {
 *       canRun: true,
 *       verdict: "Good",
 *       score: 78,
 *       bottleneck: "Storage",
 *       details: { cpu, gpu, ram, storage },
 *       estimatedPerformance: "High"
 *     }
 *   }
 * }
 */
router.post('/check-my-laptop', compatibilityController.checkUserLaptopCompatibility);


// =============================================================================
// CHECK ALL USER'S LAPTOPS AGAINST A GAME
// =============================================================================
/**
 * @route   GET /api/compatibility/my-laptops/:gameId
 * @desc    Check all of a user's registered laptops against a single game
 * @access  Public (requires Firebase UID)
 * 
 * @param {String} gameId - MongoDB ObjectId of the game
 * @query {String} uid - Firebase UID of the user
 * 
 * USE CASE:
 * User has multiple laptops registered and wants to see:
 * "Which of my laptops can run Elden Ring?"
 * 
 * @example
 * GET /api/compatibility/my-laptops/507f1f77bcf86cd799439022?uid=firebaseUID123
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     game: { id, name, image },
 *     results: [
 *       {
 *         rank: 1,
 *         userLaptop: { id, name, specs },
 *         compatibility: { canRun: true, verdict: "Good", score: 78, ... }
 *       },
 *       {
 *         rank: 2,
 *         userLaptop: { id, name, specs },
 *         compatibility: { canRun: true, verdict: "Playable", score: 55, ... }
 *       }
 *     ],
 *     summary: {
 *       total: 2,
 *       canRun: 2,
 *       cannotRun: 0,
 *       bestMatch: { laptopId: "...", laptopName: "My Gaming Laptop", score: 78 }
 *     }
 *   }
 * }
 */
router.get('/my-laptops/:gameId', compatibilityController.checkAllUserLaptopsForGame);


export default router;