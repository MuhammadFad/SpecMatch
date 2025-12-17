/**
 * =============================================================================
 * LAPTOP ROUTES
 * =============================================================================
 * 
 * BASE URL: /api/laptops
 * 
 * PURPOSE:
 * Handle all laptop-related HTTP requests. This is the entry point for:
 * - Searching/filtering laptops (with MongoDB Atlas Search)
 * - Ranking laptops by various criteria (gaming, value, portable, etc.)
 * - Getting laptop details
 * - Getting filter options for UI
 * 
 * AVAILABLE ENDPOINTS:
 * 
 * | Method | Endpoint             | Description                              |
 * |--------|----------------------|------------------------------------------|
 * | GET    | /search              | Search/rank laptops with filters         |
 * | GET    | /filters             | Get available filter options for UI      |
 * | GET    | /onboarding/options  | Get CPU/GPU/RAM lists for onboarding     |
 * | GET    | /top/:category       | Get top laptops by category for homepage |
 * | GET    | /slug/:slug          | Get single laptop by URL slug            |
 * | GET    | /variants/:groupId   | Get all config variants of a laptop      |
 * | GET    | /:id                 | Get single laptop by MongoDB ID          |
 * 
 * NOTE: The /rank endpoint has been merged into /search via the rankBy parameter.
 */

import express from 'express';
import * as laptopController from '../controllers/laptopController.js';

const router = express.Router();

// =============================================================================
// SEARCH LAPTOPS (With Filters + Rankings)
// =============================================================================
/**
 * @route   GET /api/laptops/search
 * @desc    Search and filter laptops with MongoDB Atlas Search (fuzzy matching)
 *          Also supports ranking by criteria (gaming, performance, value, etc.)
 * @access  Public
 * 
 * @query {String} [q] - Text search (uses Atlas Search fuzzy matching on name, brand, CPU, GPU, keywords)
 * @query {Number} [minPrice] - Minimum price in USD
 * @query {Number} [maxPrice] - Maximum price in USD
 * @query {String} [brand] - Filter by brand (e.g., "Dell", "Asus")
 * @query {Number} [minRam] - Minimum RAM in GB
 * @query {Number} [minStorage] - Minimum storage in GB
 * @query {Number} [minGpuScore] - Minimum GPU benchmark score
 * @query {Number} [minCpuScore] - Minimum CPU benchmark score
 * @query {Number} [minRefreshRate] - Minimum display refresh rate (Hz)
 * @query {Number} [maxWeight] - Maximum weight in kg
 * @query {Boolean} [hasTouch] - Filter for touchscreen (true/false)
 * @query {Number} [page=1] - Page number
 * @query {Number} [limit=20] - Results per page
 * @query {String} [sortBy] - Sort by: price, cpuScore, gpuScore, weight, ram, relevance
 * @query {String} [sortOrder=asc] - Sort direction: asc, desc
 * @query {String} [rankBy] - Rank by: gaming, performance, value, portable, budget
 * 
 * RANKING CRITERIA:
 * - gaming: Best GPU scores (GPU 60%, CPU 25%, RAM 10%, refresh 5%)
 * - performance: Best combined CPU+GPU (CPU 65%, GPU 20%, RAM 10%)
 * - value: Best performance per dollar (log-smoothed price)
 * - portable: Lightest weight + battery (weight 45%, battery 35%, CPU 20%)
 * - budget: Best under $800 (balanced CPU+GPU, RAM, SSD bonus)
 * 
 * @example
 * // Search for gaming laptops with RTX GPU under $2000
 * GET /api/laptops/search?q=rtx&maxPrice=2000&minRam=16
 * 
 * // Get top gaming laptops (ranked by gaming score)
 * GET /api/laptops/search?rankBy=gaming&limit=20
 * 
 * // Search for "dell" and rank by value
 * GET /api/laptops/search?q=dell&rankBy=value
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     laptops: [...],
 *     total: 150,
 *     page: 1,
 *     totalPages: 8,
 *     rankBy: "gaming" // if ranking was applied
 *   }
 * }
 */
router.get('/search', laptopController.searchLaptops);


// =============================================================================
// GET FILTER OPTIONS
// =============================================================================
/**
 * @route   GET /api/laptops/filters
 * @desc    Get available filter options for building search UI
 * @access  Public
 * 
 * @note    Call this once when user loads the search page
 *          to populate dropdown menus and range sliders
 * 
 * @example
 * GET /api/laptops/filters
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     brands: ["Acer", "Apple", "Asus", "Dell", ...],
 *     ramSizes: [8, 16, 32, 64],
 *     storageSizes: [256, 512, 1024, 2048],
 *     gpuManufacturers: ["AMD", "Intel", "NVIDIA"],
 *     refreshRates: [60, 90, 120, 144, 165, 240],
 *     priceRange: { minPrice: 299, maxPrice: 5999 }
 *   }
 * }
 */
router.get('/filters', laptopController.getFilterOptions);


// =============================================================================
// ONBOARDING OPTIONS (For User Laptop Registration)
// =============================================================================
/**
 * @route   GET /api/laptops/onboarding/options
 * @desc    Get CPU, GPU, RAM, and storage options for user laptop onboarding
 * @access  Public
 * 
 * @note    Used during signup when user registers their first laptop.
 *          Returns unique CPUs and GPUs with scores for type-ahead search.
 * 
 * @example
 * GET /api/laptops/onboarding/options
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     cpus: [{ name: "Intel Core i7-12700H", manufacturer: "Intel", score: 28500 }, ...],
 *     gpus: [{ name: "NVIDIA RTX 4090", manufacturer: "NVIDIA", score: 24500, vram_gb: 16 }, ...],
 *     ramSizes: [4, 8, 12, 16, 24, 32, 48, 64, 128],
 *     storageSizes: [128, 256, 512, 1024, 2048, 4096]
 *   }
 * }
 */
router.get('/onboarding/options', laptopController.getOnboardingOptions);


// =============================================================================
// TOP LAPTOPS BY CATEGORY (For Home Page)
// =============================================================================
/**
 * @route   GET /api/laptops/top/:category
 * @desc    Get top-ranked laptops by category for homepage display
 * @access  Public
 * 
 * @param {String} category - Ranking category: overall, gaming, value, portable, performance
 * @query {Number} [limit=6] - Number of laptops to return
 * 
 * @example
 * GET /api/laptops/top/gaming?limit=6
 * GET /api/laptops/top/value?limit=8
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   category: "gaming",
 *   data: [{ slug, name, brand, images, pricing, cpu, gpu, ram, storage, chassis }, ...]
 * }
 */
router.get('/top/:category', laptopController.getTopLaptops);


// =============================================================================
// GET LAPTOP BY SLUG
// =============================================================================
/**
 * @route   GET /api/laptops/slug/:slug
 * @desc    Get a single laptop by its URL-friendly slug
 * @access  Public
 * 
 * @param {String} slug - URL-friendly identifier
 * 
 * @note    Slugs are more SEO-friendly than IDs for product pages
 *          Format: "brand-model-cpu-gpu-ram-index"
 * 
 * @example
 * GET /api/laptops/slug/asus-rog-strix-g16-intel-core-i9-rtx4090-32gb-0
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: { _id, slug, name, brand, cpu, gpu, ram, ... }
 * }
 */
router.get('/slug/:slug', laptopController.getLaptopBySlug);


// =============================================================================
// GET LAPTOP VARIANTS
// =============================================================================
/**
 * @route   GET /api/laptops/variants/:groupId
 * @desc    Get all configuration variants of a laptop model
 * @access  Public
 * 
 * @param {String} groupId - The group_id that links variants
 * 
 * @note    A single laptop model (e.g., "Dell XPS 15") can have many
 *          variants with different CPU/GPU/RAM configurations.
 *          They all share the same group_id.
 * 
 * @example
 * // On a product page, show "Other configurations available"
 * GET /api/laptops/variants/12345
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   count: 8,
 *   data: [
 *     { _id, name, cpu, gpu, ram, pricing, is_base_variant: true },
 *     { _id, name, cpu, gpu, ram, pricing, is_base_variant: false },
 *     ...
 *   ]
 * }
 */
router.get('/variants/:groupId', laptopController.getLaptopVariants);


// =============================================================================
// GET LAPTOP BY ID (Must be LAST - catches all remaining /:param routes)
// =============================================================================
/**
 * @route   GET /api/laptops/:id
 * @desc    Get a single laptop by its MongoDB ObjectId
 * @access  Public
 * 
 * @param {String} id - MongoDB ObjectId (24 hex characters)
 * 
 * @example
 * GET /api/laptops/507f1f77bcf86cd799439011
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: { _id, name, brand, cpu, gpu, ram, ... }
 * }
 * 
 * @returns {Object} 404 - Not Found
 * {
 *   success: false,
 *   message: "Laptop not found"
 * }
 */
router.get('/:id', laptopController.getLaptopById);


export default router;