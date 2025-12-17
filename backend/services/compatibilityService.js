/**
 * =============================================================================
 * COMPATIBILITY SERVICE
 * =============================================================================
 * 
 * PURPOSE:
 * This is the CORE FEATURE of SpecMatch - "Can I Run It?"
 * It compares laptop specs against game requirements and returns a verdict.
 * 
 * FLOW POSITION:
 * Route → Controller → [SERVICE] → Laptop Model + Game Model
 * 
 * HOW COMPATIBILITY IS CALCULATED:
 * 1. Fetch Laptop document (has cpu.score, gpu.score, ram.size_gb, storage.capacity_gb)
 * 2. Fetch Game document (has requirements.minimum/recommended scores)
 * 3. Compare each component:
 *    - CPU: laptop.cpu.score vs game.requirements.minimum.cpu_score
 *    - GPU: laptop.gpu.score vs game.requirements.minimum.gpu_score
 *    - RAM: laptop.ram.size_gb vs game.requirements.minimum.ram_gb
 *    - Storage: laptop.storage.capacity_gb vs game.requirements.minimum.storage_gb
 * 4. Generate verdict based on how many requirements are met
 * 
 * VERDICTS:
 * - "Excellent" → Meets/exceeds RECOMMENDED specs
 * - "Good" → Between minimum and recommended
 * - "Playable" → Meets MINIMUM specs exactly
 * - "Struggle" → Slightly below minimum (within 20%)
 * - "Unplayable" → Significantly below minimum
 * 
 * BOTTLENECK DETECTION:
 * Identifies which component is the weakest link (GPU usually)
 */

import Laptop from '../models/Laptop.js';
import Game from '../models/Game.js';
import UserLaptop from '../models/UserLaptop.js';
import User from '../models/User.js';
import * as laptopService from './laptopService.js';
import * as gameService from './gameService.js';


// =============================================================================
// HELPER: GET OR FETCH GAME BY STEAM APP ID
// =============================================================================
/**
 * @function getOrFetchGameBySteamId
 * @description Helper function to get a game by Steam App ID, auto-fetching from Steam if needed.
 * This allows compatibility endpoints to accept Steam App IDs directly.
 * 
 * @param {Number} steamAppId - Steam App ID
 * @returns {Object} Game document (from DB or freshly fetched from Steam)
 */
export const getOrFetchGameBySteamId = async (steamAppId) => {
    console.log(`📡 [CompatibilityService.getOrFetchGameBySteamId] Looking up Steam App ID: ${steamAppId}`);

    // Use the gameService's getOrFetchGame function with type 'steam'
    return await gameService.getOrFetchGame(steamAppId.toString(), 'steam');
};


// =============================================================================
// CHECK USER LAPTOP COMPATIBILITY
// =============================================================================
/**
 * @function checkUserLaptopCompatibility
 * @description Check if a USER'S LAPTOP can run a specific game
 * This is for logged-in users who have registered their own laptop specs.
 * 
 * @param {String} userLaptopId - MongoDB ObjectId of the UserLaptop document
 * @param {String} gameId - MongoDB ObjectId of the game
 * 
 * @returns {Object} Detailed compatibility report for user's laptop:
 * {
 *   userLaptop: { id, name, cpu, gpu, ram, storage },
 *   game: { id, name, requirements, image },
 *   compatibility: {
 *     canRun: Boolean,
 *     verdict: "Excellent" | "Good" | "Playable" | "Struggle" | "Unplayable",
 *     score: Number (0-100),
 *     bottleneck: "CPU" | "GPU" | "RAM" | "Storage" | "None",
 *     details: { cpu, gpu, ram, storage },
 *     estimatedPerformance: "Low" | "Medium" | "High" | "Ultra"
 *   }
 * }
 * 
 * @throws {Error} If user laptop or game not found
 * 
 * @example
 * // Request: POST /api/compatibility/check-my-laptop
 * // Body: { userLaptopId: "...", gameId: "..." }
 * checkUserLaptopCompatibility('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022')
 */
export const checkUserLaptopCompatibility = async (userLaptopId, gameId) => {
    console.log(`📡 [CompatibilityService.checkUserLaptop] Checking: UserLaptop ${userLaptopId} vs Game ${gameId}`);

    // 1. Fetch user laptop and game
    const userLaptop = await UserLaptop.findById(userLaptopId).lean();
    const game = await Game.findById(gameId).lean();

    if (!userLaptop) throw new Error(`User laptop not found: ${userLaptopId}`);
    if (!game) throw new Error(`Game not found: ${gameId}`);

    console.log(`📡 [CompatibilityService.checkUserLaptop] Comparing: ${userLaptop.name} vs ${game.name}`);

    // 2. Extract values from user laptop (different schema than catalog laptops)
    const laptopSpecs = {
        cpuScore: userLaptop.cpu_score || 0,
        gpuScore: userLaptop.gpu_score || 0,
        ramGb: userLaptop.ram_gb || 0,
        storageGb: userLaptop.storage_gb || 0
    };

    const minReqs = game.requirements?.minimum || {};
    const recReqs = game.requirements?.recommended || {};

    // 3. Compare each component (reusing existing helper functions)
    const details = {
        cpu: compareComponent(laptopSpecs.cpuScore, minReqs.cpu_score || 0, recReqs.cpu_score || 0),
        gpu: compareComponent(laptopSpecs.gpuScore, minReqs.gpu_score || 0, recReqs.gpu_score || 0),
        ram: compareComponent(laptopSpecs.ramGb, minReqs.ram_gb || 0, recReqs.ram_gb || 0),
        storage: compareComponent(laptopSpecs.storageGb, minReqs.storage_gb || 0, recReqs.storage_gb || 0)
    };

    // 4. Calculate overall score and verdict
    const { score, verdict, canRun } = calculateVerdict(details);

    // 5. Identify bottleneck
    const bottleneck = identifyBottleneck(details);

    // 6. Estimate performance tier
    const estimatedPerformance = getPerformanceTier(score);

    // 7. Return comprehensive report
    return {
        userLaptop: {
            id: userLaptop._id,
            name: userLaptop.name,
            specs: {
                cpu: { text: userLaptop.cpu_text, score: laptopSpecs.cpuScore },
                gpu: { text: userLaptop.gpu_text, score: laptopSpecs.gpuScore },
                ram_gb: laptopSpecs.ramGb,
                storage_gb: laptopSpecs.storageGb
            }
        },
        game: {
            id: game._id,
            name: game.name,
            image: game.image,
            requirements: {
                minimum: {
                    cpu: minReqs.cpu_text || 'Unknown',
                    gpu: minReqs.gpu_text || 'Unknown',
                    ram_gb: minReqs.ram_gb || 0,
                    storage_gb: minReqs.storage_gb || 0
                },
                recommended: {
                    cpu: recReqs.cpu_text || 'Unknown',
                    gpu: recReqs.gpu_text || 'Unknown',
                    ram_gb: recReqs.ram_gb || 0,
                    storage_gb: recReqs.storage_gb || 0
                }
            }
        },
        compatibility: {
            canRun,
            verdict,
            score,
            bottleneck,
            details,
            estimatedPerformance
        }
    };
};


// =============================================================================
// CHECK ALL USER LAPTOPS AGAINST A GAME
// =============================================================================
/**
 * @function checkAllUserLaptopsForGame
 * @description Check ALL of a user's laptops against a single game
 * Useful when user has multiple laptops and wants to see which can run a game
 * 
 * @param {String} firebaseUID - Firebase UID of the user
 * @param {String} gameId - MongoDB ObjectId of the game
 * 
 * @returns {Object} Batch compatibility results for all user's laptops
 * {
 *   game: { id, name, image },
 *   results: [
 *     { userLaptop: {...}, compatibility: {...}, rank: 1 },
 *     ...
 *   ],
 *   summary: {
 *     total: 3,
 *     canRun: 2,
 *     cannotRun: 1,
 *     bestMatch: { laptopId, laptopName, score }
 *   }
 * }
 * 
 * @throws {Error} If user or game not found
 */
export const checkAllUserLaptopsForGame = async (firebaseUID, gameId) => {
    console.log(`📡 [CompatibilityService.checkAllUserLaptops] User: ${firebaseUID}, Game: ${gameId}`);

    // 1. Find user and get their laptops
    const user = await User.findOne({ firebaseUID }).lean();
    if (!user) throw new Error(`User not found: ${firebaseUID}`);

    const userLaptops = await UserLaptop.find({ userId: user._id }).lean();
    if (userLaptops.length === 0) {
        throw new Error('User has no laptops registered');
    }

    // 2. Fetch the game
    const game = await Game.findById(gameId).lean();
    if (!game) throw new Error(`Game not found: ${gameId}`);

    // 3. Check compatibility for each user laptop
    const results = await Promise.all(
        userLaptops.map(async (laptop) => {
            try {
                const result = await checkUserLaptopCompatibility(laptop._id.toString(), gameId);
                return result;
            } catch (error) {
                console.error(`Error checking laptop ${laptop._id}:`, error.message);
                return null;
            }
        })
    );

    // 4. Filter and sort by score
    let validResults = results.filter(r => r !== null);
    validResults.sort((a, b) => b.compatibility.score - a.compatibility.score);

    // 5. Add ranks
    validResults = validResults.map((result, index) => ({
        ...result,
        rank: index + 1
    }));

    // 6. Generate summary
    const canRunCount = validResults.filter(r => r.compatibility.canRun).length;
    const bestMatch = validResults[0] || null;

    return {
        game: {
            id: game._id,
            name: game.name,
            image: game.image
        },
        results: validResults,
        summary: {
            total: validResults.length,
            canRun: canRunCount,
            cannotRun: validResults.length - canRunCount,
            bestMatch: bestMatch ? {
                laptopId: bestMatch.userLaptop.id,
                laptopName: bestMatch.userLaptop.name,
                score: bestMatch.compatibility.score
            } : null
        }
    };
};


// =============================================================================
// FIND LAPTOPS THAT CAN RUN A GAME
// =============================================================================
/**
 * @function findLaptopsForGame
 * @description Find all laptops that can run a specific game, classified by tier
 * Returns laptops that meet at least the minimum requirements
 * 
 * @param {String} gameId - MongoDB ObjectId of the game
 * @param {Object} [filters={}] - Additional filters to apply (from laptopService)
 * @param {String} [rankBy='gaming'] - How to rank results: gaming, performance, value
 * @param {Number} [page=1] - Page number for pagination
 * @param {Number} [limit=20] - Results per page
 * 
 * @returns {Object} Laptops that can run the game with classification:
 * {
 *   game: { id, name, image, requirements },
 *   filters: {
 *     minCpuScore: X,
 *     minGpuScore: Y,
 *     minRam: Z,
 *     minStorage: W
 *   },
 *   results: [
 *     {
 *       laptop: {...},
 *       tier: 'exceeds_recommended' | 'meets_minimum',
 *       compatibilityScore: 85,
 *       estimatedPerformance: 'High'
 *     },
 *     ...
 *   ],
 *   summary: {
 *     total: 150,
 *     exceedsRecommended: 45,
 *     meetsMinimum: 105,
 *     page: 1,
 *     totalPages: 8
 *   }
 * }
 * 
 * @throws {Error} If game not found
 * 
 * @example
 * // Request: GET /api/compatibility/laptops-for-game/:gameId?rankBy=gaming&minPrice=500&maxPrice=2000
 * findLaptopsForGame('507f1f77bcf86cd799439022', { minPrice: 500, maxPrice: 2000 }, 'gaming')
 */
export const findLaptopsForGame = async (gameId, filters = {}, rankBy = 'gaming', page = 1, limit = 20) => {
    console.log(`📡 [CompatibilityService.findLaptopsForGame] Finding laptops for game: ${gameId}`);

    // 1. Fetch the game to get requirements
    const game = await Game.findById(gameId).lean();
    if (!game) throw new Error(`Game not found: ${gameId}`);

    const minReqs = game.requirements?.minimum || {};
    const recReqs = game.requirements?.recommended || {};

    console.log(`📡 [CompatibilityService.findLaptopsForGame] Game: ${game.name}`);
    console.log(`📡 [CompatibilityService.findLaptopsForGame] Min reqs: CPU=${minReqs.cpu_score}, GPU=${minReqs.gpu_score}, RAM=${minReqs.ram_gb}GB, Storage=${minReqs.storage_gb}GB`);

    // 2. Build laptop search filters based on game's minimum requirements
    // Only apply requirement-based filters if we have actual requirement data
    const gameBasedFilters = {
        ...filters,
        page,
        limit,
        rankBy
    };

    // Apply minimum requirements as filters (if they exist)
    if (minReqs.cpu_score && minReqs.cpu_score > 0) {
        gameBasedFilters.minCpuScore = minReqs.cpu_score;
    }
    if (minReqs.gpu_score && minReqs.gpu_score > 0) {
        gameBasedFilters.minGpuScore = minReqs.gpu_score;
    }
    if (minReqs.ram_gb && minReqs.ram_gb > 0) {
        gameBasedFilters.minRam = minReqs.ram_gb;
    }
    if (minReqs.storage_gb && minReqs.storage_gb > 0) {
        gameBasedFilters.minStorage = minReqs.storage_gb;
    }

    // 3. Use laptopService to get filtered results (this respects the search index and ranking)
    const searchResults = await laptopService.findLaptops(gameBasedFilters);

    // 4. Classify each laptop by tier and add compatibility info
    const classifiedResults = searchResults.laptops.map(laptop => {
        const laptopSpecs = {
            cpuScore: laptop.cpu?.score || 0,
            gpuScore: laptop.gpu?.score || 0,
            ramGb: laptop.ram?.size_gb || 0,
            storageGb: laptop.storage?.capacity_gb || 0
        };

        // Check if exceeds recommended
        const meetsRecCpu = recReqs.cpu_score ? laptopSpecs.cpuScore >= recReqs.cpu_score : true;
        const meetsRecGpu = recReqs.gpu_score ? laptopSpecs.gpuScore >= recReqs.gpu_score : true;
        const meetsRecRam = recReqs.ram_gb ? laptopSpecs.ramGb >= recReqs.ram_gb : true;
        const meetsRecStorage = recReqs.storage_gb ? laptopSpecs.storageGb >= recReqs.storage_gb : true;

        const exceedsRecommended = meetsRecCpu && meetsRecGpu && meetsRecRam && meetsRecStorage;

        // Calculate a quick compatibility score
        const weights = { cpu: 0.25, gpu: 0.45, ram: 0.15, storage: 0.15 };

        const cpuPct = recReqs.cpu_score ? Math.min(100, (laptopSpecs.cpuScore / recReqs.cpu_score) * 100) : 100;
        const gpuPct = recReqs.gpu_score ? Math.min(100, (laptopSpecs.gpuScore / recReqs.gpu_score) * 100) : 100;
        const ramPct = recReqs.ram_gb ? Math.min(100, (laptopSpecs.ramGb / recReqs.ram_gb) * 100) : 100;
        const storagePct = recReqs.storage_gb ? Math.min(100, (laptopSpecs.storageGb / recReqs.storage_gb) * 100) : 100;

        const compatibilityScore = Math.round(
            cpuPct * weights.cpu +
            gpuPct * weights.gpu +
            ramPct * weights.ram +
            storagePct * weights.storage
        );

        // Estimate performance tier
        let estimatedPerformance;
        if (compatibilityScore >= 90) estimatedPerformance = 'Ultra';
        else if (compatibilityScore >= 75) estimatedPerformance = 'High';
        else if (compatibilityScore >= 60) estimatedPerformance = 'Medium';
        else estimatedPerformance = 'Low';

        return {
            laptop: {
                _id: laptop._id,
                slug: laptop.slug,
                name: laptop.name,
                brand: laptop.brand,
                image: laptop.images?.[0] || null,
                price: laptop.pricing?.estimated_price_usd,
                specs: {
                    cpu: { name: laptop.cpu?.name, score: laptopSpecs.cpuScore },
                    gpu: { name: laptop.gpu?.name, score: laptopSpecs.gpuScore, vram: laptop.gpu?.vram_gb },
                    ram: laptopSpecs.ramGb,
                    storage: laptopSpecs.storageGb
                },
                rankingScore: laptop.rankingScore // From the ranking in findLaptops
            },
            tier: exceedsRecommended ? 'exceeds_recommended' : 'meets_minimum',
            compatibilityScore,
            estimatedPerformance
        };
    });

    // 5. Count tiers
    const exceedsCount = classifiedResults.filter(r => r.tier === 'exceeds_recommended').length;
    const meetsMinCount = classifiedResults.filter(r => r.tier === 'meets_minimum').length;

    // 6. Return comprehensive response
    return {
        game: {
            id: game._id,
            name: game.name,
            image: game.image,
            requirements: {
                minimum: {
                    cpu: minReqs.cpu_text || 'Unknown',
                    cpu_score: minReqs.cpu_score || 0,
                    gpu: minReqs.gpu_text || 'Unknown',
                    gpu_score: minReqs.gpu_score || 0,
                    ram_gb: minReqs.ram_gb || 0,
                    storage_gb: minReqs.storage_gb || 0
                },
                recommended: {
                    cpu: recReqs.cpu_text || 'Unknown',
                    cpu_score: recReqs.cpu_score || 0,
                    gpu: recReqs.gpu_text || 'Unknown',
                    gpu_score: recReqs.gpu_score || 0,
                    ram_gb: recReqs.ram_gb || 0,
                    storage_gb: recReqs.storage_gb || 0
                }
            }
        },
        appliedFilters: {
            gameRequirements: {
                minCpuScore: gameBasedFilters.minCpuScore,
                minGpuScore: gameBasedFilters.minGpuScore,
                minRam: gameBasedFilters.minRam,
                minStorage: gameBasedFilters.minStorage
            },
            userFilters: {
                minPrice: filters.minPrice,
                maxPrice: filters.maxPrice,
                brand: filters.brand,
                maxWeight: filters.maxWeight,
                // ... any other filters passed through
            },
            rankBy
        },
        results: classifiedResults,
        summary: {
            total: searchResults.total,
            exceedsRecommended: exceedsCount,
            meetsMinimum: meetsMinCount,
            page: searchResults.page,
            totalPages: searchResults.totalPages
        }
    };
};


// =============================================================================
// CALCULATE SINGLE COMPATIBILITY
// =============================================================================
/**
 * @function calculateCompatibility
 * @description Check if ONE laptop can run ONE game
 * 
 * @param {String} laptopId - MongoDB ObjectId of the laptop
 * @param {String} gameId - MongoDB ObjectId of the game
 * 
 * @returns {Object} Detailed compatibility report:
 * {
 *   laptop: { id, name, cpu, gpu, ram, storage, image },
 *   game: { id, name, requirements, image },
 *   compatibility: {
 *     canRun: Boolean,
 *     verdict: "Excellent" | "Good" | "Playable" | "Struggle" | "Unplayable",
 *     score: Number (0-100),
 *     bottleneck: "CPU" | "GPU" | "RAM" | "Storage" | "None",
 *     details: {
 *       cpu: { laptopScore, requiredMin, requiredRec, meets: "minimum" | "recommended" | "below" },
 *       gpu: { laptopScore, requiredMin, requiredRec, meets: "minimum" | "recommended" | "below" },
 *       ram: { laptopValue, requiredMin, requiredRec, meets: ... },
 *       storage: { laptopValue, requiredMin, requiredRec, meets: ... }
 *     },
 *     estimatedPerformance: "Low" | "Medium" | "High" | "Ultra"
 *   }
 * }
 * 
 * @throws {Error} If laptop or game not found
 * 
 * @example
 * // Request: POST /api/compatibility/check
 * // Body: { laptopId: "...", gameId: "..." }
 * calculateCompatibility('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439022')
 */
export const calculateCompatibility = async (laptopId, gameId) => {
    console.log(`📡 [CompatibilityService] Checking: Laptop ${laptopId} vs Game ${gameId}`);

    // 1. Fetch both documents
    const laptop = await Laptop.findById(laptopId).lean();
    const game = await Game.findById(gameId).lean();

    if (!laptop) throw new Error(`Laptop not found: ${laptopId}`);
    if (!game) throw new Error(`Game not found: ${gameId}`);

    console.log(`📡 [CompatibilityService] Comparing: ${laptop.name} vs ${game.name}`);

    // 2. Extract values (with fallbacks)
    const laptopSpecs = {
        cpuScore: laptop.cpu?.score || 0,
        gpuScore: laptop.gpu?.score || 0,
        ramGb: laptop.ram?.size_gb || 0,
        storageGb: laptop.storage?.capacity_gb || 0
    };

    const minReqs = game.requirements?.minimum || {};
    const recReqs = game.requirements?.recommended || {};

    // 3. Compare each component
    const details = {
        cpu: compareComponent(laptopSpecs.cpuScore, minReqs.cpu_score || 0, recReqs.cpu_score || 0),
        gpu: compareComponent(laptopSpecs.gpuScore, minReqs.gpu_score || 0, recReqs.gpu_score || 0),
        ram: compareComponent(laptopSpecs.ramGb, minReqs.ram_gb || 0, recReqs.ram_gb || 0),
        storage: compareComponent(laptopSpecs.storageGb, minReqs.storage_gb || 0, recReqs.storage_gb || 0)
    };

    // 4. Calculate overall score and verdict
    const { score, verdict, canRun } = calculateVerdict(details);

    // 5. Identify bottleneck (lowest performing component)
    const bottleneck = identifyBottleneck(details);

    // 6. Estimate performance tier
    const estimatedPerformance = getPerformanceTier(score);

    // 7. Return comprehensive report
    return {
        laptop: {
            id: laptop._id,
            name: laptop.name,
            brand: laptop.brand,
            image: laptop.images?.[0] || null,
            specs: {
                cpu: { name: laptop.cpu?.name, score: laptopSpecs.cpuScore },
                gpu: { name: laptop.gpu?.name, score: laptopSpecs.gpuScore, vram: laptop.gpu?.vram_gb },
                ram: { size_gb: laptopSpecs.ramGb, type: laptop.ram?.type },
                storage: { capacity_gb: laptopSpecs.storageGb, type: laptop.storage?.type }
            }
        },
        game: {
            id: game._id,
            name: game.name,
            image: game.image,
            requirements: {
                minimum: {
                    cpu: minReqs.cpu_text || 'Unknown',
                    gpu: minReqs.gpu_text || 'Unknown',
                    ram_gb: minReqs.ram_gb || 0,
                    storage_gb: minReqs.storage_gb || 0
                },
                recommended: {
                    cpu: recReqs.cpu_text || 'Unknown',
                    gpu: recReqs.gpu_text || 'Unknown',
                    ram_gb: recReqs.ram_gb || 0,
                    storage_gb: recReqs.storage_gb || 0
                }
            }
        },
        compatibility: {
            canRun,
            verdict,
            score,
            bottleneck,
            details,
            estimatedPerformance
        }
    };
};


// =============================================================================
// BATCH COMPATIBILITY CHECK
// =============================================================================
/**
 * @function calculateBatchCompatibility
 * @description Check MULTIPLE laptops against ONE game
 * Used for "Which of my selected laptops can run this game?"
 * 
 * @param {Array<String>} laptopIds - Array of MongoDB ObjectIds
 * @param {String} gameId - MongoDB ObjectId of the game
 * @param {String} [sortBy='score'] - How to sort results: 'score', 'price', 'value'
 * 
 * @returns {Object} Batch compatibility report:
 * {
 *   game: { id, name, image },
 *   results: [
 *     { laptop: {...}, compatibility: {...}, rank: 1 },
 *     { laptop: {...}, compatibility: {...}, rank: 2 },
 *     ...
 *   ],
 *   summary: {
 *     total: 5,
 *     canRun: 3,
 *     cannotRun: 2,
 *     bestMatch: { laptopId, laptopName, score },
 *     bestValue: { laptopId, laptopName, scorePerDollar }
 *   }
 * }
 * 
 * @example
 * // Request: POST /api/compatibility/batch
 * // Body: { laptopIds: ["...", "...", "..."], gameId: "...", sortBy: "score" }
 * calculateBatchCompatibility(['id1', 'id2', 'id3'], 'gameId', 'score')
 */
export const calculateBatchCompatibility = async (laptopIds, gameId, sortBy = 'score') => {
    console.log(`📡 [CompatibilityService.batch] Checking ${laptopIds.length} laptops vs game ${gameId}`);

    // 1. Fetch the game once
    const game = await Game.findById(gameId).lean();
    if (!game) throw new Error(`Game not found: ${gameId}`);

    // 2. Fetch all laptops
    const laptops = await laptopService.getLaptopsByIds(laptopIds);
    if (laptops.length === 0) throw new Error('No valid laptops found');

    // 3. Calculate compatibility for each laptop
    const results = await Promise.all(
        laptops.map(async (laptop) => {
            try {
                const result = await calculateCompatibility(laptop._id.toString(), gameId);
                return {
                    ...result,
                    price: laptop.pricing?.estimated_price_usd || 0
                };
            } catch (error) {
                console.error(`Error checking laptop ${laptop._id}:`, error.message);
                return null;
            }
        })
    );

    // 4. Filter out failed checks and sort
    let validResults = results.filter(r => r !== null);

    switch (sortBy) {
        case 'score':
            validResults.sort((a, b) => b.compatibility.score - a.compatibility.score);
            break;
        case 'price':
            validResults.sort((a, b) => a.price - b.price);
            break;
        case 'value':
            // Score per dollar (higher is better)
            validResults.sort((a, b) => {
                const valueA = a.price > 0 ? a.compatibility.score / a.price : 0;
                const valueB = b.price > 0 ? b.compatibility.score / b.price : 0;
                return valueB - valueA;
            });
            break;
    }

    // 5. Add ranks
    validResults = validResults.map((result, index) => ({
        ...result,
        rank: index + 1
    }));

    // 6. Generate summary
    const canRunCount = validResults.filter(r => r.compatibility.canRun).length;
    const bestMatch = validResults[0] || null;

    // Find best value (highest score per dollar among those that can run)
    const runnableLaptops = validResults.filter(r => r.compatibility.canRun && r.price > 0);
    const bestValue = runnableLaptops.length > 0
        ? runnableLaptops.reduce((best, current) => {
            const currentValue = current.compatibility.score / current.price;
            const bestValue = best.compatibility.score / best.price;
            return currentValue > bestValue ? current : best;
        })
        : null;

    return {
        game: {
            id: game._id,
            name: game.name,
            image: game.image
        },
        results: validResults,
        summary: {
            total: validResults.length,
            canRun: canRunCount,
            cannotRun: validResults.length - canRunCount,
            bestMatch: bestMatch ? {
                laptopId: bestMatch.laptop.id,
                laptopName: bestMatch.laptop.name,
                score: bestMatch.compatibility.score
            } : null,
            bestValue: bestValue ? {
                laptopId: bestValue.laptop.id,
                laptopName: bestValue.laptop.name,
                price: bestValue.price,
                scorePerDollar: (bestValue.compatibility.score / bestValue.price).toFixed(4)
            } : null
        }
    };
};


// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Compare a laptop's component value against min/rec requirements
 */
function compareComponent(laptopValue, minRequired, recRequired) {
    // Handle edge cases
    if (minRequired === 0 && recRequired === 0) {
        return {
            laptopValue,
            requiredMin: minRequired,
            requiredRec: recRequired,
            meets: 'recommended', // No requirement = always meets
            percentage: 100
        };
    }

    // Calculate percentage of recommended we're hitting
    const percentage = recRequired > 0
        ? Math.round((laptopValue / recRequired) * 100)
        : (laptopValue >= minRequired ? 100 : Math.round((laptopValue / minRequired) * 100));

    // Determine status
    let meets;
    if (laptopValue >= recRequired && recRequired > 0) {
        meets = 'recommended';
    } else if (laptopValue >= minRequired) {
        meets = 'minimum';
    } else {
        meets = 'below';
    }

    return {
        laptopValue,
        requiredMin: minRequired,
        requiredRec: recRequired,
        meets,
        percentage
    };
}

/**
 * Calculate overall verdict based on component comparisons
 */
function calculateVerdict(details) {
    const components = [details.cpu, details.gpu, details.ram, details.storage];

    // Count how many meet each tier
    const meetsRec = components.filter(c => c.meets === 'recommended').length;
    const meetsMin = components.filter(c => c.meets === 'minimum').length;
    const belowMin = components.filter(c => c.meets === 'below').length;

    // Calculate weighted score (GPU matters more for gaming)
    const weights = { cpu: 0.25, gpu: 0.45, ram: 0.15, storage: 0.15 };
    const score = Math.round(
        details.cpu.percentage * weights.cpu +
        details.gpu.percentage * weights.gpu +
        details.ram.percentage * weights.ram +
        details.storage.percentage * weights.storage
    );

    // Determine verdict
    let verdict, canRun;

    if (belowMin >= 2) {
        verdict = 'Unplayable';
        canRun = false;
    } else if (belowMin === 1 && details[getLowestComponent(details)].percentage >= 80) {
        verdict = 'Struggle';
        canRun = true; // Might work on lowest settings
    } else if (belowMin === 1) {
        verdict = 'Unplayable';
        canRun = false;
    } else if (meetsRec >= 3) {
        verdict = 'Excellent';
        canRun = true;
    } else if (meetsRec >= 1 || score >= 75) {
        verdict = 'Good';
        canRun = true;
    } else {
        verdict = 'Playable';
        canRun = true;
    }

    return { score: Math.min(100, Math.max(0, score)), verdict, canRun };
}

/**
 * Find the component that's holding back performance
 */
function identifyBottleneck(details) {
    const components = [
        { name: 'GPU', data: details.gpu },
        { name: 'CPU', data: details.cpu },
        { name: 'RAM', data: details.ram },
        { name: 'Storage', data: details.storage }
    ];

    // Find lowest percentage (most behind requirements)
    const lowest = components.reduce((min, current) =>
        current.data.percentage < min.data.percentage ? current : min
    );

    // If everything is at 100%+, no bottleneck
    if (lowest.data.percentage >= 100) return 'None';

    return lowest.name;
}

/**
 * Get the key of the lowest performing component
 */
function getLowestComponent(details) {
    let lowest = 'cpu';
    let lowestPct = details.cpu.percentage;

    for (const [key, value] of Object.entries(details)) {
        if (value.percentage < lowestPct) {
            lowest = key;
            lowestPct = value.percentage;
        }
    }

    return lowest;
}

/**
 * Map score to performance tier (for estimated FPS/settings)
 */
function getPerformanceTier(score) {
    if (score >= 90) return 'Ultra';
    if (score >= 75) return 'High';
    if (score >= 50) return 'Medium';
    if (score >= 30) return 'Low';
    return 'Unplayable';
}