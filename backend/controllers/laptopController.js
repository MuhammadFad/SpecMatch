/**
 * =============================================================================
 * LAPTOP CONTROLLER
 * =============================================================================
 * 
 * PURPOSE:
 * Handle HTTP request/response for laptop endpoints.
 * Controllers are thin - they validate input and call services.
 * 
 * FLOW POSITION:
 * Route → [CONTROLLER] → Service → Model
 * 
 * RESPONSIBILITIES:
 * 1. Extract parameters from req.query, req.params, req.body
 * 2. Basic input validation
 * 3. Call the appropriate service method
 * 4. Format and send the HTTP response
 * 5. Handle errors and send appropriate status codes
 */

import * as laptopService from '../services/laptopService.js';

// =============================================================================
// SEARCH LAPTOPS
// =============================================================================
/**
 * @controller searchLaptops
 * @route GET /api/laptops/search
 * 
 * INPUT (req.query):
 *   - q: String (search text - uses MongoDB Atlas Search with fuzzy matching)
 *   - minPrice, maxPrice: Number
 *   - brand: String
 *   - minRam, minStorage: Number
 *   - minGpuScore, minCpuScore: Number
 *   - minRefreshRate: Number
 *   - maxWeight: Number
 *   - hasTouch: Boolean
 *   - page, limit: Number
 *   - sortBy, sortOrder: String
 *   - rankBy: String ('gaming' | 'performance' | 'value' | 'portable' | 'budget')
 * 
 * OUTPUT:
 *   { success: true, data: { laptops: [], total, page, totalPages, rankBy? } }
 * 
 * NOTE: This endpoint now handles both search AND ranking.
 * The old /rank endpoint has been merged into /search via the rankBy parameter.
 */
export const searchLaptops = async (req, res) => {
    try {
        console.log('🎮 [LaptopController.searchLaptops] Query:', req.query);

        const results = await laptopService.findLaptops(req.query);

        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('❌ [LaptopController.searchLaptops] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// GET FILTER OPTIONS
// =============================================================================
/**
 * @controller getFilterOptions
 * @route GET /api/laptops/filters
 * 
 * INPUT: None
 * 
 * OUTPUT:
 *   { success: true, data: { brands: [], ramSizes: [], ... } }
 */
export const getFilterOptions = async (req, res) => {
    try {
        console.log('🎮 [LaptopController.getFilterOptions] Fetching filter options');

        const options = await laptopService.getFilterOptions();

        res.json({
            success: true,
            data: options
        });
    } catch (error) {
        console.error('❌ [LaptopController.getFilterOptions] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// GET LAPTOP BY ID
// =============================================================================
/**
 * @controller getLaptopById
 * @route GET /api/laptops/:id
 * 
 * INPUT (req.params):
 *   - id: MongoDB ObjectId string
 * 
 * OUTPUT:
 *   { success: true, data: {...laptop} }
 *   OR { success: false, message: "Laptop not found" } with 404 status
 */
export const getLaptopById = async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`🎮 [LaptopController.getLaptopById] ID: ${id}`);

        // Basic validation for MongoDB ObjectId format
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid laptop ID format'
            });
        }

        const laptop = await laptopService.getLaptopById(id);

        if (!laptop) {
            return res.status(404).json({
                success: false,
                message: 'Laptop not found'
            });
        }

        res.json({
            success: true,
            data: laptop
        });
    } catch (error) {
        console.error('❌ [LaptopController.getLaptopById] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// GET LAPTOP BY SLUG
// =============================================================================
/**
 * @controller getLaptopBySlug
 * @route GET /api/laptops/slug/:slug
 * 
 * INPUT (req.params):
 *   - slug: URL-friendly string
 * 
 * OUTPUT:
 *   { success: true, data: {...laptop} }
 */
export const getLaptopBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        console.log(`🎮 [LaptopController.getLaptopBySlug] Slug: ${slug}`);

        const laptop = await laptopService.getLaptopBySlug(slug);

        if (!laptop) {
            return res.status(404).json({
                success: false,
                message: 'Laptop not found'
            });
        }

        res.json({
            success: true,
            data: laptop
        });
    } catch (error) {
        console.error('❌ [LaptopController.getLaptopBySlug] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// GET LAPTOP VARIANTS
// =============================================================================
/**
 * @controller getLaptopVariants
 * @route GET /api/laptops/variants/:groupId
 * 
 * INPUT (req.params):
 *   - groupId: String that links all variants of a laptop model
 * 
 * OUTPUT:
 *   { success: true, count: 8, data: [...variants] }
 */
export const getLaptopVariants = async (req, res) => {
    try {
        const { groupId } = req.params;
        console.log(`🎮 [LaptopController.getLaptopVariants] Group: ${groupId}`);

        const variants = await laptopService.getLaptopVariants(groupId);

        res.json({
            success: true,
            count: variants.length,
            data: variants
        });
    } catch (error) {
        console.error('❌ [LaptopController.getLaptopVariants] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// ONBOARDING DATA ENDPOINTS
// =============================================================================
/**
 * @controller getOnboardingOptions
 * @route GET /api/laptops/onboarding/options
 * 
 * INPUT: None
 * 
 * OUTPUT:
 *   { success: true, data: { cpus: [...], gpus: [...], ramSizes: [...], storageSizes: [...] } }
 * 
 * PURPOSE: Get all component options for user laptop onboarding form
 */
export const getOnboardingOptions = async (req, res) => {
    try {
        console.log('🎮 [LaptopController.getOnboardingOptions] Fetching onboarding data');

        const options = await laptopService.getOnboardingOptions();

        res.json({
            success: true,
            data: options
        });
    } catch (error) {
        console.error('❌ [LaptopController.getOnboardingOptions] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// =============================================================================
// GET TOP LAPTOPS (For Home Page)
// =============================================================================
/**
 * @controller getTopLaptops
 * @route GET /api/laptops/top/:category
 * 
 * INPUT (req.params):
 *   - category: 'overall' | 'gaming' | 'value' | 'portable' | 'performance'
 * 
 * INPUT (req.query):
 *   - limit: Number (default: 6)
 * 
 * OUTPUT:
 *   { success: true, data: [...laptops] }
 */
export const getTopLaptops = async (req, res) => {
    try {
        const { category = 'overall' } = req.params;
        const { limit = 6 } = req.query;

        console.log(`🎮 [LaptopController.getTopLaptops] Category: ${category}, Limit: ${limit}`);

        const validCategories = ['overall', 'gaming', 'value', 'portable', 'performance'];
        if (!validCategories.includes(category)) {
            return res.status(400).json({
                success: false,
                message: `Invalid category. Must be one of: ${validCategories.join(', ')}`
            });
        }

        const laptops = await laptopService.getTopLaptops(category, parseInt(limit));

        res.json({
            success: true,
            category,
            data: laptops
        });
    } catch (error) {
        console.error('❌ [LaptopController.getTopLaptops] Error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};