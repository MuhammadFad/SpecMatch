import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Laptop from '../models/Laptop.js'; // Your Data Model
import { transformParentToChildren } from './migration.js'; // Your Logic

//Usage: Move migration_script.js and migration.js to backend/, then run the former

dotenv.config();

const MONGO_URI = process.env.MONGODB_URI;
const BATCH_SIZE = 50;

async function runMigration() {
    try {
        console.log("🔌 Connecting to MongoDB...");
        await mongoose.connect(MONGO_URI);
        console.log("✅ Connected.");
        console.log("🔌 Connected to Database Name:", mongoose.connection.name);
        console.log("📂 Writing to Collection Name:", Laptop.collection.name);

        // Access the old collection directly (no model needed for source)
        const OldCollection = mongoose.connection.db.collection('OldLaptops');

        const totalDocs = await OldCollection.countDocuments();
        console.log(`📦 Found ${totalDocs} parent documents to migrate.`);

        let processed = 0;
        let created = 0;
        const cursor = OldCollection.find().batchSize(BATCH_SIZE);

        while (await cursor.hasNext()) {
            const oldDoc = await cursor.next();

            try {
                // 1. Call your imported migration logic
                const newVariants = transformParentToChildren(oldDoc);

                // 2. Insert valid variants into the new collection
                if (newVariants.length > 0) {
                    // ordered: false ensures that if one duplicate fails, the rest still insert
                    await Laptop.insertMany(newVariants, { ordered: false });
                    created += newVariants.length;
                }
            } catch (err) {
                // Ignore duplicate key errors (code 11000) for re-runs
                if (err.code !== 11000) {
                    console.error(`❌ Error processing ID ${oldDoc.id}:`, err.message);
                }
            }

            processed++;
            if (processed % 100 === 0) {
                console.log(`⏳ Progress: ${processed}/${totalDocs} parents. (${created} new variants)`);
            }
        }

        console.log(`\n🎉 Migration Complete!`);
        console.log(`📊 Processed: ${processed} parents`);
        console.log(`🚀 Created: ${created} new variants`);

    } catch (error) {
        console.error("🔥 Fatal Error:", error);
    } finally {
        await mongoose.disconnect();
        console.log("👋 Connection closed.");
        process.exit(0);
    }
}

runMigration();