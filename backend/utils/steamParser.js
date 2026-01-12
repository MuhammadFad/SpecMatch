import Laptop from '../models/Laptop.js'; // Your existing Laptop model

// A. Helper to extract numbers from text (e.g. "8 GB" -> 8)
function parseGB(text) {
    if (!text) return 0;
    const match = text.match(/(\d+)\s*GB/i);
    return match ? parseInt(match[1]) : 0;
}

// B. Helper to clean HTML and extract just the text value for a specific field
function extractFieldValue(htmlString, fieldName) {
    if (!htmlString) return "";

    // Create regex to match the field and capture only its value (not subsequent fields)
    // This handles formats like:
    // <strong>Processor:</strong> Intel Core i5<br>
    // <li><strong>Memory:</strong> 8 GB RAM</li>
    const patterns = [
        // Pattern 1: <strong>Field:</strong> value<br> or </li>
        new RegExp(`<strong>${fieldName}:?<\\/strong>\\s*([^<]+?)(?:<br|<\\/li|<strong)`, 'i'),
        // Pattern 2: Field: value (without strong tags)
        new RegExp(`${fieldName}:?\\s*([^<\\n]+?)(?:<br|<\\/li|<strong|\\n)`, 'i'),
    ];

    for (const pattern of patterns) {
        const match = htmlString.match(pattern);
        if (match && match[1]) {
            // Clean up the extracted value
            return match[1]
                .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
                .replace(/&nbsp;/g, ' ')  // Replace HTML spaces
                .replace(/&amp;/g, '&')   // Replace HTML ampersand
                .trim();
        }
    }

    return "";
}

// C. Helper to find a Score by querying your Laptops collection
async function getComponentScore(componentName, type) {
    if (!componentName) return 0;

    // 1. Clean the name for better matching
    // Remove brands to focus on model numbers (e.g. "Nvidia GTX 1650" -> "GTX 1650")
    const cleanName = componentName
        .replace(/nvidia|amd|intel|geforce|radeon|core|ryzen/gi, "")
        .trim();

    if (!cleanName) return 1000;

    // 2. Query the Laptops DB
    // We look for ANY laptop that has this component string in its name
    const query = type === 'gpu'
        ? { 'gpu.name': { $regex: cleanName, $options: 'i' } }
        : { 'cpu.name': { $regex: cleanName, $options: 'i' } };

    // We only need one result to get the score
    const match = await Laptop.findOne(query).select(`${type}.score ${type}.benchmark_score`);

    if (match) {
        // Return the score found in your database
        const component = type === 'gpu' ? match.gpu : match.cpu;
        return component?.score || component?.benchmark_score || 1000;
    }

    // Fallback: If your Laptop DB doesn't have this old component
    // (e.g., Game asks for "GTX 660", but your laptops are all new)
    return 1000; // Return a low "entry level" score as default
}

// D. The Main Parsing Function
export async function parseSteamRequirements(steamData) {
    // Steam returns requirements as an array or object, we need "pc_requirements"
    const pcReqs = steamData.pc_requirements || {};

    // Helper to process one tier (Minimum or Recommended)
    const processTier = async (htmlString) => {
        if (!htmlString) return {};

        // Extract individual fields using the improved extraction
        const ramText = extractFieldValue(htmlString, 'Memory');
        const gpuText = extractFieldValue(htmlString, 'Graphics');
        const cpuText = extractFieldValue(htmlString, 'Processor');
        const storageText = extractFieldValue(htmlString, 'Storage') ||
            extractFieldValue(htmlString, 'Hard Drive') ||
            extractFieldValue(htmlString, 'Hard Disk Space');

        console.log(`📋 [SteamParser] Extracted - CPU: "${cpuText}", GPU: "${gpuText}", RAM: "${ramText}", Storage: "${storageText}"`);

        return {
            ram_gb: parseGB(ramText),
            storage_gb: parseGB(storageText),

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