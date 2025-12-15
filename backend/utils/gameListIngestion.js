// scripts/updateSteamIndex.js
import axios from 'axios';
import SteamApp from '../models/SteamApp.js';

const STEAM_KEY = process.env.STEAM_API_KEY

async function updateGameIndex() {
    console.log("⬇️ Fetching App List from Steam...");
    // 1. Get the list (Warning: This file is 10MB+)
    const response = await axios.get(`https://api.steampowered.com/IStoreService/GetAppList/v1/?key=${STEAM_KEY}`);
    const apps = response.data.applist.apps;

    console.log(`📦 Found ${apps.length} games. Updating Database...`);

    // 2. Bulk Write (Much faster than saving one by one)
    const bulkOps = apps.map(app => ({
        updateOne: {
            filter: { appid: app.appid },
            update: { $set: { name: app.name } },
            upsert: true // Insert if doesn't exist
        }
    }));

    // Process in chunks of 1000 to avoid memory crash
    const chunkSize = 1000;
    for (let i = 0; i < bulkOps.length; i += chunkSize) {
        const chunk = bulkOps.slice(i, i + chunkSize);
        await SteamApp.bulkWrite(chunk);
        console.log(`✅ Processed ${i + chunk.length}/${apps.length}`);
    }
}