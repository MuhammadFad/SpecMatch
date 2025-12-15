import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';
import SteamApp from '../models/SteamApp.js';
import Game from '../models/Game.js';

// Usage: Move to backend/ and run

dotenv.config();

const STEAM_KEY = process.env.STEAM_API_KEY;
const MONGO_URI = process.env.MONGODB_URI;
const GAMES_TO_FETCH = 30; // Number of games to fetch detailed info for

// Helper function to parse system requirements
function parseRequirements(requirementsText) {
    if (!requirementsText) return null;

    const result = {
        ram_gb: 0,
        storage_gb: 0,
        gpu_score: 0,
        cpu_score: 0,
        gpu_text: '',
        cpu_text: ''
    };

    // Extract RAM (look for patterns like "8 GB RAM" or "4GB")
    const ramMatch = requirementsText.match(/(\d+)\s*GB\s*(RAM|Memory)/i);
    if (ramMatch) {
        result.ram_gb = parseInt(ramMatch[1]);
    }

    // Extract Storage (look for patterns like "50 GB available space")
    const storageMatch = requirementsText.match(/(\d+)\s*GB\s*(available space|storage|disk space)/i);
    if (storageMatch) {
        result.storage_gb = parseInt(storageMatch[1]);
    }

    // Extract GPU info (basic text extraction)
    const gpuMatch = requirementsText.match(/Graphics[:\s]+([^\n<]+)/i);
    if (gpuMatch) {
        result.gpu_text = gpuMatch[1].trim();
        // Basic scoring (this should be enhanced with a proper GPU database)
        if (/RTX 40|4090|4080|4070/i.test(result.gpu_text)) result.gpu_score = 90;
        else if (/RTX 30|3090|3080|3070/i.test(result.gpu_text)) result.gpu_score = 80;
        else if (/RTX 20|2080|2070/i.test(result.gpu_text)) result.gpu_score = 70;
        else if (/GTX 16|1660|1650/i.test(result.gpu_text)) result.gpu_score = 60;
        else if (/GTX 10|1080|1070|1060/i.test(result.gpu_text)) result.gpu_score = 55;
        else result.gpu_score = 30;
    }

    // Extract CPU info
    const cpuMatch = requirementsText.match(/Processor[:\s]+([^\n<]+)/i);
    if (cpuMatch) {
        result.cpu_text = cpuMatch[1].trim();
        // Basic scoring (this should be enhanced with a proper CPU database)
        if (/i9|Ryzen 9/i.test(result.cpu_text)) result.cpu_score = 90;
        else if (/i7|Ryzen 7/i.test(result.cpu_text)) result.cpu_score = 75;
        else if (/i5|Ryzen 5/i.test(result.cpu_text)) result.cpu_score = 60;
        else if (/i3|Ryzen 3/i.test(result.cpu_text)) result.cpu_score = 45;
        else result.cpu_score = 30;
    }

    return result;
}

// Fetch detailed game info from Steam
async function fetchGameDetails(appId) {
    try {
        const url = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
        const response = await axios.get(url);

        if (!response.data[appId]?.success) {
            return null;
        }

        const data = response.data[appId].data;

        // Only process actual games (not DLC, videos, etc.)
        if (data.type !== 'game') {
            return null;
        }

        const gameData = {
            steam_app_id: data.steam_appid,
            name: data.name,
            image: data.header_image || '',
            requirements: {
                minimum: {},
                recommended: {}
            },
            keywords: []
        };

        // Parse minimum requirements
        if (data.pc_requirements?.minimum) {
            const minReqs = parseRequirements(data.pc_requirements.minimum);
            if (minReqs) {
                gameData.requirements.minimum = minReqs;
            }
        }

        // Parse recommended requirements
        if (data.pc_requirements?.recommended) {
            const recReqs = parseRequirements(data.pc_requirements.recommended);
            if (recReqs) {
                gameData.requirements.recommended = recReqs;
            }
        }

        // Extract keywords from genres and categories
        if (data.genres) {
            gameData.keywords = data.genres.map(g => g.description.toLowerCase());
        }

        return gameData;

    } catch (error) {
        if (error.response?.status === 429) {
            console.log('⏸️  Rate limited, waiting 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            return fetchGameDetails(appId); // Retry
        }
        console.error(`❌ Error fetching game ${appId}:`, error.message);
        return null;
    }
}

async function runSteamIngestion() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected to MongoDB.\n");

        // ========== STEP 1: Fetch and Store App List ==========
        console.log("📥 STEP 1: Fetching Steam App List...");
        const response = await axios.get(`https://api.steampowered.com/IStoreService/GetAppList/v1/?key=${STEAM_KEY}`);
        const apps = response.data.response.apps;

        console.log(`📦 Found ${apps.length} total apps on Steam.\n`);

        // Store all apps in SteamApp collection
        console.log("💾 Storing app list in database...");
        const bulkOps = apps.map(app => ({
            updateOne: {
                filter: { appid: app.appid },
                update: { $set: { name: app.name } },
                upsert: true
            }
        }));

        // Process in chunks to avoid memory issues
        const chunkSize = 1000;
        let totalProcessed = 0;

        for (let i = 0; i < bulkOps.length; i += chunkSize) {
            const chunk = bulkOps.slice(i, i + chunkSize);
            await SteamApp.bulkWrite(chunk);
            totalProcessed += chunk.length;
            if (totalProcessed % 10000 === 0 || i + chunkSize >= bulkOps.length) {
                console.log(`✅ Stored ${totalProcessed}/${apps.length} apps`);
            }
        }

        console.log(`\n🎉 App list ingestion complete!\n`);

        // ========== STEP 2: Fetch Detailed Game Info ==========
        console.log(`📥 STEP 2: Fetching detailed info for first ${GAMES_TO_FETCH} games...\n`);

        // Filter out apps that are likely games (have reasonable names)
        const likelyGames = apps.filter(app =>
            app.name &&
            app.name.length > 2 &&
            app.name.length < 100 &&
            !/test|demo|soundtrack|dlc|trailer/i.test(app.name)
        ).slice(0, 100); // Get first 100 likely candidates

        let gamesStored = 0;
        let attempts = 0;

        for (const app of likelyGames) {
            if (gamesStored >= GAMES_TO_FETCH) break;

            attempts++;
            console.log(`🔍 [${attempts}/${likelyGames.length}] Fetching: ${app.name} (ID: ${app.appid})`);

            const gameDetails = await fetchGameDetails(app.appid);

            if (gameDetails) {
                try {
                    await Game.findOneAndUpdate(
                        { steam_app_id: gameDetails.steam_app_id },
                        gameDetails,
                        { upsert: true, new: true }
                    );

                    gamesStored++;
                    console.log(`✅ [${gamesStored}/${GAMES_TO_FETCH}] Stored: ${gameDetails.name}`);
                    console.log(`   📊 Min: ${gameDetails.requirements.minimum.ram_gb}GB RAM, GPU Score: ${gameDetails.requirements.minimum.gpu_score}`);
                    console.log(`   📈 Rec: ${gameDetails.requirements.recommended.ram_gb}GB RAM, GPU Score: ${gameDetails.requirements.recommended.gpu_score}\n`);

                } catch (err) {
                    console.error(`❌ Error storing ${app.name}:`, err.message);
                }
            } else {
                console.log(`⚠️  Skipped: Not a game or no data available\n`);
            }

            // Rate limiting: Wait 1.5 seconds between requests
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        console.log(`\n🎉 INGESTION COMPLETE!`);
        console.log(`📊 Summary:`);
        console.log(`   - Total apps stored: ${apps.length}`);
        console.log(`   - Detailed games stored: ${gamesStored}`);
        console.log(`   - Attempts made: ${attempts}`);

    } catch (error) {
        console.error("🔥 Fatal Error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("\n👋 Connection closed.");
        process.exit(0);
    }
}

runSteamIngestion();
