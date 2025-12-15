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
 * | Method | Endpoint | Description                                    |
 * |--------|----------|------------------------------------------------|
 * | POST   | /check   | Check ONE laptop vs ONE game                   |
 * | POST   | /batch   | Check MULTIPLE laptops vs ONE game (rankings)  |
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


export default router;