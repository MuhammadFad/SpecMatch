/**
 * =============================================================================
 * LAPTOP ROUTES
 * =============================================================================
 * 
 * BASE URL: /api/laptops
 * 
 * PURPOSE:
 * Handle all laptop-related HTTP requests. This is the entry point for:
 * - Searching/filtering laptops
 * - Getting laptop details
 * - Getting ranked laptop lists
 * - Getting filter options for UI
 * 
 * AVAILABLE ENDPOINTS:
 * 
 * | Method | Endpoint              | Description                              |
 * |--------|----------------------|------------------------------------------|
 * | GET    | /search              | Search laptops with filters              |
 * | GET    | /rank                | Get top-ranked laptops by criteria       |
 * | GET    | /filters             | Get available filter options for UI      |
 * | GET    | /:id                 | Get single laptop by MongoDB ID          |
 * | GET    | /slug/:slug          | Get single laptop by URL slug            |
 * | GET    | /variants/:groupId   | Get all config variants of a laptop      |
 */

import express from 'express';
import * as laptopController from '../controllers/laptopController.js';

const router = express.Router();

// =============================================================================
// SEARCH LAPTOPS
// =============================================================================
/**
 * @route   GET /api/laptops/search
 * @desc    Search and filter laptops with multiple criteria
 * @access  Public
 * 
 * @query {String} [q] - Text search (name, brand, CPU, GPU)
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
 * @query {String} [sortBy] - Sort by: price, cpuScore, gpuScore, weight, ram
 * @query {String} [sortOrder=asc] - Sort direction: asc, desc
 * 
 * @example
 * // Search for gaming laptops with RTX GPU under $2000
 * GET /api/laptops/search?q=rtx&maxPrice=2000&minRam=16
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     laptops: [...],
 *     total: 150,
 *     page: 1,
 *     totalPages: 8
 *   }
 * }
 */
router.get('/search', laptopController.searchLaptops);


// =============================================================================
// GET RANKED LAPTOPS
// =============================================================================
/**
 * @route   GET /api/laptops/rank
 * @desc    Get top-ranked laptops by various criteria
 * @access  Public
 * 
 * @query {String} [sortBy=performance] - Ranking criteria:
 *   - "gaming" → Best GPU scores
 *   - "performance" → Best combined CPU+GPU
 *   - "value" → Best performance per dollar
 *   - "portable" → Lightest weight
 *   - "budget" → Best under $800
 * @query {Number} [limit=10] - Number of results
 * 
 * @example
 * // Get top 20 gaming laptops
 * GET /api/laptops/rank?sortBy=gaming&limit=20
 * 
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: [...]
 * }
 */
router.get('/rank', laptopController.getRankedLaptops);


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
// GET LAPTOP BY ID
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


export default router;