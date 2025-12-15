import Laptop from '../models/Laptop.js'; // Your existing Laptop model

// A. Helper to extract numbers from text (e.g. "8 GB" -> 8)
function parseGB(text) {
    if (!text) return 0;
    const match = text.match(/(\d+)\s*GB/i);
    return match ? parseInt(match[1]) : 0;
}

// B. Helper to find a Score by querying your Laptops collection
async function getComponentScore(componentName, type) {
    if (!componentName) return 0;

    // 1. Clean the name for better matching
    // Remove brands to focus on model numbers (e.g. "Nvidia GTX 1650" -> "GTX 1650")
    const cleanName = componentName
        .replace(/nvidia|amd|intel|geforce|radeon|core|ryzen/gi, "")
        .trim();

    // 2. Query the Laptops DB
    // We look for ANY laptop that has this component string in its name
    const query = type === 'gpu'
        ? { 'gpu.name': { $regex: cleanName, $options: 'i' } }
        : { 'cpu.name': { $regex: cleanName, $options: 'i' } };

    // We only need one result to get the score
    const match = await Laptop.findOne(query).select(`${type}.score`);

    if (match) {
        // Return the score found in your database
        return type === 'gpu' ? match.gpu.score : match.cpu.score;
    }

    // Fallback: If your Laptop DB doesn't have this old component
    // (e.g., Game asks for "GTX 660", but your laptops are all new)
    return 1000; // Return a low "entry level" score as default
}

// C. The Main Parsing Function
export async function parseSteamRequirements(steamData) {
    // Steam returns requirements as an array or object, we need "pc_requirements"
    const pcReqs = steamData.pc_requirements || {};

    // Helper to process one tier (Minimum or Recommended)
    const processTier = async (htmlString) => {
        if (!htmlString) return {};

        // Simple Regex to extract the text lines from HTML
        const ramMatch = htmlString.match(/Memory:<\/strong>\s*(.*?)(<br>|<\/li>)/i);
        const gpuMatch = htmlString.match(/Graphics:<\/strong>\s*(.*?)(<br>|<\/li>)/i);
        const cpuMatch = htmlString.match(/Processor:<\/strong>\s*(.*?)(<br>|<\/li>)/i);
        const storageMatch = htmlString.match(/Storage:<\/strong>\s*(.*?)(<br>|<\/li>)/i);

        const gpuText = gpuMatch ? gpuMatch[1] : "";
        const cpuText = cpuMatch ? cpuMatch[1] : "";

        return {
            ram_gb: parseGB(ramMatch ? ramMatch[1] : ""),
            storage_gb: parseGB(storageMatch ? storageMatch[1] : ""),

            // ASYNC LOOKUP: Go find the scores from your Laptop DB
            gpu_score: await getComponentScore(gpuText, 'gpu'),
            cpu_score: await getComponentScore(cpuText, 'cpu'),

            gpu_text: gpuText,
            cpu_text: cpuText
        };
    };

    return {
        minimum: await processTier(pcReqs.minimum),
        recommended: await processTier(pcReqs.recommended)
    };
}