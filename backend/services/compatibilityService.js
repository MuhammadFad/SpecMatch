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
import * as laptopService from './laptopService.js';


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