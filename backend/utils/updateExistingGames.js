/**
 * =============================================================================
 * UPDATE EXISTING GAMES
 * =============================================================================
 * 
 * This script updates existing games in the database that are missing
 * the pc_requirements field (raw HTML from Steam for display).
 * 
 * Run with: node utils/updateExistingGames.js
 */

import mongoose from 'mongoose';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/specmatch';

async function updateGames() {
    try {
        console.log('🔗 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB');

        // Get Games collection directly
        const Game = mongoose.connection.collection('Games');

        // Find games that don't have pc_requirements
        const games = await Game.find({
            $or: [
                { pc_requirements: { $exists: false } },
                { 'pc_requirements.minimum': { $exists: false } },
                { 'pc_requirements.minimum': '' },
                { 'pc_requirements.minimum': null }
            ]
        }).toArray();

        console.log(`📊 Found ${games.length} games to update`);

        for (const game of games) {
            console.log(`\n🎮 Updating: ${game.name} (Steam ID: ${game.steam_app_id})`);

            try {
                // Fetch from Steam API
                const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${game.steam_app_id}`;
                const response = await axios.get(steamUrl);
                const steamData = response.data[game.steam_app_id];

                if (!steamData?.success) {
                    console.log(`   ⚠️ Steam API returned no data, skipping`);
                    continue;
                }

                const gameData = steamData.data;

                // Update the game with new fields
                await Game.updateOne(
                    { _id: game._id },
                    {
                        $set: {
                            pc_requirements: {
                                minimum: gameData.pc_requirements?.minimum || '',
                                recommended: gameData.pc_requirements?.recommended || ''
                            },
                            short_description: gameData.short_description || '',
                            genres: gameData.genres || [],
                            categories: gameData.categories || [],
                            developers: gameData.developers || [],
                            publishers: gameData.publishers || [],
                            release_date: gameData.release_date || {}
                        }
                    }
                );

                console.log(`   ✅ Updated successfully`);

                // Rate limit - wait 200ms between requests
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.log(`   ❌ Error: ${error.message}`);
            }
        }

        console.log('\n✅ Update complete!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

updateGames();
