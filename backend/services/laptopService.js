/**
 * =============================================================================
 * LAPTOP SERVICE
 * =============================================================================
 * 
 * PURPOSE:
 * This service handles all database operations for the Laptop collection.
 * It is called by laptopController and returns raw data from MongoDB.
 * 
 * FLOW POSITION:
 * Route → Controller → [SERVICE] → Model/Database
 * 
 * DATA MODEL REFERENCE (Laptop):
 * {
 *   _id, slug, group_id, is_base_variant,
 *   name, brand, model_family, product_url, images[],
 *   os, architecture,
 *   cpu: { name, manufacturer, cores, threads, base_clock_ghz, boost_clock_ghz, tdp_watts, score },
 *   gpu: { name, manufacturer, vram_gb, tgp_watts, integrated, features[], score },
 *   ram: { size_gb, type, frequency_mhz, score },
 *   storage: { capacity_gb, type, read_speed_mbps, score },
 *   displays: [{ size_inch, resolution_h, resolution_v, refresh_rate_hz, panel_type, touch, surface, srgb_coverage, score }],
 *   chassis: { colors[], materials[], thickness_mm, weight_kg, webcam_mp, ports[], score },
 *   battery: { capacity_wh, score },
 *   networking: { wifi_standards[], score },
 *   pricing: { estimated_price_usd, currency },
 *   keywords[], embedding[]
 * }
 */

import Laptop from '../models/Laptop.js';

// =============================================================================
// FIND LAPTOPS (With Filters)
// =============================================================================
/**
 * @function findLaptops
 * @description Search laptops with multiple filter criteria
 * 
 * @param {Object} filters - Query parameters from URL
 * @param {String} [filters.q] - Text search query (searches name, brand, cpu.name, gpu.name)
 * @param {Number} [filters.minPrice] - Minimum price in USD
 * @param {Number} [filters.maxPrice] - Maximum price in USD
 * @param {String} [filters.brand] - Filter by brand (e.g., "Asus", "Dell")
 * @param {Number} [filters.minRam] - Minimum RAM in GB
 * @param {Number} [filters.minStorage] - Minimum storage in GB
 * @param {Number} [filters.minGpuScore] - Minimum GPU benchmark score
 * @param {Number} [filters.minCpuScore] - Minimum CPU benchmark score
 * @param {Number} [filters.minRefreshRate] - Minimum display refresh rate
 * @param {Number} [filters.maxWeight] - Maximum weight in kg
 * @param {Boolean} [filters.hasTouch] - Filter for touchscreen laptops
 * @param {Number} [filters.page=1] - Page number for pagination
 * @param {Number} [filters.limit=20] - Results per page
 * @param {String} [filters.sortBy] - Sort field (price, cpuScore, gpuScore, weight)
 * @param {String} [filters.sortOrder=asc] - Sort direction (asc/desc)
 * 
 * @returns {Object} { laptops: Laptop[], total: Number, page: Number, totalPages: Number }
 * 
 * @example
 * // Request: GET /api/laptops/search?q=gaming&minRam=16&maxPrice=1500
 * findLaptops({ q: 'gaming', minRam: 16, maxPrice: 1500 })
 */
export const findLaptops = async (filters) => {
    console.log('📡 [LaptopService.findLaptops] Filters received:', filters);

    // Build the MongoDB query object
    const query = {};

    // --- TEXT SEARCH ---
    // Uses MongoDB text index on: name, brand, cpu.name, gpu.name, keywords
    if (filters.q) {
        query.$or = [
            { name: { $regex: filters.q, $options: 'i' } },
            { brand: { $regex: filters.q, $options: 'i' } },
            { 'cpu.name': { $regex: filters.q, $options: 'i' } },
            { 'gpu.name': { $regex: filters.q, $options: 'i' } }
        ];
    }

    // --- PRICE RANGE ---
    if (filters.minPrice || filters.maxPrice) {
        query['pricing.estimated_price_usd'] = {};
        if (filters.minPrice) query['pricing.estimated_price_usd'].$gte = Number(filters.minPrice);
        if (filters.maxPrice) query['pricing.estimated_price_usd'].$lte = Number(filters.maxPrice);
    }

    // --- BRAND FILTER ---
    if (filters.brand) {
        query.brand = { $regex: filters.brand, $options: 'i' };
    }

    // --- RAM FILTER ---
    if (filters.minRam) {
        query['ram.size_gb'] = { $gte: Number(filters.minRam) };
    }

    // --- STORAGE FILTER ---
    if (filters.minStorage) {
        query['storage.capacity_gb'] = { $gte: Number(filters.minStorage) };
    }

    // --- GPU SCORE FILTER ---
    if (filters.minGpuScore) {
        query['gpu.score'] = { $gte: Number(filters.minGpuScore) };
    }

    // --- CPU SCORE FILTER ---
    if (filters.minCpuScore) {
        query['cpu.score'] = { $gte: Number(filters.minCpuScore) };
    }

    // --- DISPLAY REFRESH RATE ---
    if (filters.minRefreshRate) {
        query['displays.refresh_rate_hz'] = { $gte: Number(filters.minRefreshRate) };
    }

    // --- WEIGHT FILTER ---
    if (filters.maxWeight) {
        query['chassis.weight_kg'] = { $lte: Number(filters.maxWeight) };
    }

    // --- TOUCHSCREEN FILTER ---
    if (filters.hasTouch === 'true' || filters.hasTouch === true) {
        query['displays.touch'] = true;
    }

    // --- PAGINATION ---
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 20;
    const skip = (page - 1) * limit;

    // --- SORTING ---
    let sortOption = {};
    const sortOrder = filters.sortOrder === 'desc' ? -1 : 1;

    switch (filters.sortBy) {
        case 'price':
            sortOption = { 'pricing.estimated_price_usd': sortOrder };
            break;
        case 'cpuScore':
            sortOption = { 'cpu.score': sortOrder };
            break;
        case 'gpuScore':
            sortOption = { 'gpu.score': sortOrder };
            break;
        case 'weight':
            sortOption = { 'chassis.weight_kg': sortOrder };
            break;
        case 'ram':
            sortOption = { 'ram.size_gb': sortOrder };
            break;
        default:
            sortOption = { 'pricing.estimated_price_usd': 1 };
    }

    // --- EXECUTE QUERY ---
    const [laptops, total] = await Promise.all([
        Laptop.find(query)
            .sort(sortOption)
            .skip(skip)
            .limit(limit)
            .lean(),
        Laptop.countDocuments(query)
    ]);

    console.log(`📡 [LaptopService.findLaptops] Found ${laptops.length} of ${total} total matches`);

    return {
        laptops,
        total,
        page,
        totalPages: Math.ceil(total / limit)
    };
};


// =============================================================================
// GET LAPTOP BY ID
// =============================================================================
/**
 * @function getLaptopById
 * @description Fetch a single laptop by its MongoDB _id
 * 
 * @param {String} id - MongoDB ObjectId as string
 * 
 * @returns {Object|null} Full Laptop document or null if not found
 * 
 * @example
 * // Request: GET /api/laptops/507f1f77bcf86cd799439011
 * getLaptopById('507f1f77bcf86cd799439011')
 */
export const getLaptopById = async (id) => {
    console.log(`📡 [LaptopService.getLaptopById] Fetching laptop: ${id}`);
    return await Laptop.findById(id).lean();
};


// =============================================================================
// GET LAPTOP BY SLUG
// =============================================================================
/**
 * @function getLaptopBySlug
 * @description Fetch a single laptop by its URL-friendly slug
 * 
 * @param {String} slug - URL-friendly identifier (e.g., "asus-rog-strix-g16-i9-rtx4090-32gb-0")
 * 
 * @returns {Object|null} Full Laptop document or null if not found
 * 
 * @example
 * // Request: GET /api/laptops/slug/asus-rog-strix-g16-i9-rtx4090-32gb-0
 * getLaptopBySlug('asus-rog-strix-g16-i9-rtx4090-32gb-0')
 */
export const getLaptopBySlug = async (slug) => {
    console.log(`📡 [LaptopService.getLaptopBySlug] Fetching laptop by slug: ${slug}`);
    return await Laptop.findOne({ slug }).lean();
};


// =============================================================================
// GET LAPTOP VARIANTS (Same base model, different configs)
// =============================================================================
/**
 * @function getLaptopVariants
 * @description Get all variants of a laptop model (same group_id)
 * Useful for showing "Other configurations" on a product page
 * 
 * @param {String} groupId - The group_id that links all variants
 * 
 * @returns {Array} Array of Laptop documents in the same group
 * 
 * @example
 * // Get all variants of "Dell XPS 15"
 * getLaptopVariants('12345')
 */
export const getLaptopVariants = async (groupId) => {
    console.log(`📡 [LaptopService.getLaptopVariants] Fetching variants for group: ${groupId}`);
    return await Laptop.find({ group_id: groupId })
        .sort({ 'pricing.estimated_price_usd': 1 })
        .lean();
};


// =============================================================================
// GET TOP RANKED LAPTOPS
// =============================================================================
/**
 * @function getTopRanked
 * @description Get top laptops sorted by various criteria
 * Used for "Best Gaming Laptops", "Best Value", etc.
 * 
 * @param {String} criteria - Ranking type:
 *   - 'gaming' → Sort by GPU score (highest first)
 *   - 'performance' → Sort by CPU + GPU combined score
 *   - 'value' → Sort by (CPU score + GPU score) / price ratio
 *   - 'portable' → Sort by weight (lowest first)
 *   - 'budget' → Filter price < $800, sort by performance
 * @param {Number} [limit=10] - Number of results to return
 * 
 * @returns {Array} Array of top Laptop documents
 * 
 * @example
 * // Request: GET /api/laptops/rank?sortBy=gaming&limit=20
 * getTopRanked('gaming', 20)
 */
export const getTopRanked = async (criteria, limit = 10) => {
    console.log(`📡 [LaptopService.getTopRanked] Ranking by: ${criteria}`);

    let pipeline = [];

    switch (criteria) {
        case 'gaming':
            // Improved gaming score:
            // - GPU weighted most (60%)
            // - CPU matters for CPU-bound titles (25%)
            // - RAM & display refresh provide small boosts (10% + 5%)
            // - Small VRAM bonus for larger VRAM
            pipeline = [
                { $match: { 'gpu.score': { $exists: true, $gt: 0 } } },
                {
                    $addFields: {
                        _gpu: { $ifNull: ['$gpu.score', 0] },
                        _cpu: { $ifNull: ['$cpu.score', 0] },
                        _ram: { $ifNull: ['$ram.score', 0] },
                        _display_refresh: { $ifNull: [{ $arrayElemAt: ['$displays.refresh_rate_hz', 0] }, 60] },
                        _vram_gb: { $ifNull: ['$gpu.vram_gb', 0] }
                    }
                },
                {
                    $addFields: {
                        gamingScore: {
                            $round: [{
                                $add: [
                                    { $multiply: ['$_gpu', 0.60] },
                                    { $multiply: ['$_cpu', 0.25] },
                                    { $multiply: ['$_ram', 0.10] },
                                    { $multiply: [{ $min: [120, '$_display_refresh'] }, 0.05] },
                                    // vram bonus: +2 points per doubling above 4GB
                                    { $multiply: [{ $log10: { $add: ['$_vram_gb', 1] } }, 4] }
                                ]
                            }, 2]
                        }
                    }
                },
                { $sort: { gamingScore: -1 } },
                { $limit: limit }
            ];
            break;

        case 'performance':
            // Improved performance score:
            // - CPU dominates (multi-core + single-core approximated via score)
            // - GPU contributes (20%) for mixed workloads
            // - RAM matters marginally
            pipeline = [
                {
                    $addFields: {
                        _cpu: { $ifNull: ['$cpu.score', 0] },
                        _gpu: { $ifNull: ['$gpu.score', 0] },
                        _ram: { $ifNull: ['$ram.score', 0] },
                        _cores: { $ifNull: ['$cpu.cores', 4] }
                    }
                },
                {
                    $addFields: {
                        performanceScore: {
                            $round: [{
                                $add: [
                                    { $multiply: ['$_cpu', 0.65] },
                                    { $multiply: ['$_gpu', 0.20] },
                                    { $multiply: ['$_ram', 0.10] },
                                    // small cores bonus
                                    { $multiply: [{ $max: [0, { $subtract: ['$_cores', 4] }] }, 0.5] }
                                ]
                            }, 2]
                        }
                    }
                },
                { $sort: { performanceScore: -1 } },
                { $limit: limit }
            ];
            break;

        case 'value':
            // Improved value formula:
            // - Use performance per dollar but smooth price impact with log to avoid tiny prices dominating
            pipeline = [
                { $match: { 'pricing.estimated_price_usd': { $gt: 0 } } },
                {
                    $addFields: {
                        perf: { $add: [{ $ifNull: ['$cpu.score', 0] }, { $ifNull: ['$gpu.score', 0] }] },
                        price: '$pricing.estimated_price_usd'
                    }
                },
                {
                    $addFields: {
                        valueScore: {
                            $round: [{
                                $multiply: [
                                    { $divide: ['$perf', { $add: [{ $ln: { $add: ['$price', 10] } }, 1] }] },
                                    10
                                ]
                            }, 4]
                        }
                    }
                },
                { $sort: { valueScore: -1 } },
                { $limit: limit }
            ];
            break;

        case 'portable':
            // Improved portability score:
            // - Combine light weight, good battery, and decent CPU efficiency
            pipeline = [
                { $match: { 'chassis.weight_kg': { $gt: 0 } } },
                {
                    $addFields: {
                        _weight: { $ifNull: ['$chassis.weight_kg', 3] },
                        _battery: { $ifNull: ['$battery.score', 50] },
                        _cpu: { $ifNull: ['$cpu.score', 50] }
                    }
                },
                {
                    $addFields: {
                        portableScore: {
                            $round: [{
                                $add: [
                                    { $multiply: [{ $subtract: [100, { $multiply: ['$_weight', 10] }] }, 0.45] },
                                    { $multiply: ['$_battery', 0.35] },
                                    { $multiply: ['$_cpu', 0.20] }
                                ]
                            }, 2]
                        }
                    }
                },
                { $sort: { portableScore: -1 } },
                { $limit: limit }
            ];
            break;

        case 'budget':
            // Budget: prefer balanced performance, RAM, and SSD presence under price cap
            pipeline = [
                { $match: { 'pricing.estimated_price_usd': { $lte: 800 } } },
                {
                    $addFields: {
                        _cpu: { $ifNull: ['$cpu.score', 0] },
                        _gpu: { $ifNull: ['$gpu.score', 0] },
                        _ram: { $ifNull: ['$ram.score', 0] },
                        _has_ssd: { $cond: [{ $regexMatch: { input: { $ifNull: ['$storage.type', 'ssd'] }, regex: /ssd/i } }, 1, 0] }
                    }
                },
                {
                    $addFields: {
                        budgetScore: {
                            $round: [{
                                $add: [
                                    { $multiply: [{ $add: ['$_cpu', '$_gpu'] }, 0.5] },
                                    { $multiply: ['$_ram', 0.3] },
                                    { $multiply: ['$_has_ssd', 10] }
                                ]
                            }, 2]
                        }
                    }
                },
                { $sort: { budgetScore: -1 } },
                { $limit: limit }
            ];
            break;

        default:
            // Default: random sample
            pipeline = [{ $sample: { size: limit } }];
    }

    return await Laptop.aggregate(pipeline);
};


// =============================================================================
// GET FILTER OPTIONS (For UI Dropdowns)
// =============================================================================
/**
 * @function getFilterOptions
 * @description Get all unique values for filter dropdowns
 * Called once when user loads the search page
 * 
 * @returns {Object} Object containing arrays of unique filter values
 * {
 *   brands: ['Asus', 'Dell', 'HP', ...],
 *   ramSizes: [8, 16, 32, 64],
 *   storageSizes: [256, 512, 1024, 2048],
 *   gpuBrands: ['NVIDIA', 'AMD', 'Intel'],
 *   refreshRates: [60, 120, 144, 165, 240],
 *   priceRange: { min: 299, max: 5999 }
 * }
 * 
 * @example
 * // Request: GET /api/laptops/filters
 * getFilterOptions()
 */
export const getFilterOptions = async () => {
    console.log('📡 [LaptopService.getFilterOptions] Fetching unique filter values');

    const [brands, ramSizes, storageSizes, gpuManufacturers, refreshRates, priceRange] = await Promise.all([
        Laptop.distinct('brand'),
        Laptop.distinct('ram.size_gb'),
        Laptop.distinct('storage.capacity_gb'),
        Laptop.distinct('gpu.manufacturer'),
        Laptop.distinct('displays.refresh_rate_hz'),
        Laptop.aggregate([
            {
                $group: {
                    _id: null,
                    minPrice: { $min: '$pricing.estimated_price_usd' },
                    maxPrice: { $max: '$pricing.estimated_price_usd' }
                }
            }
        ])
    ]);

    return {
        brands: brands.filter(Boolean).sort(),
        ramSizes: ramSizes.filter(Boolean).sort((a, b) => a - b),
        storageSizes: storageSizes.filter(Boolean).sort((a, b) => a - b),
        gpuManufacturers: gpuManufacturers.filter(Boolean).sort(),
        refreshRates: refreshRates.filter(Boolean).sort((a, b) => a - b),
        priceRange: priceRange[0] || { minPrice: 0, maxPrice: 10000 }
    };
};


// =============================================================================
// GET LAPTOPS BY IDS (Batch fetch for compatibility)
// =============================================================================
/**
 * @function getLaptopsByIds
 * @description Fetch multiple laptops by their IDs
 * Used by compatibility service for batch checks
 * 
 * @param {Array<String>} ids - Array of MongoDB ObjectIds
 * 
 * @returns {Array} Array of Laptop documents
 * 
 * @example
 * getLaptopsByIds(['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'])
 */
export const getLaptopsByIds = async (ids) => {
    console.log(`📡 [LaptopService.getLaptopsByIds] Fetching ${ids.length} laptops`);
    return await Laptop.find({ _id: { $in: ids } }).lean();
};