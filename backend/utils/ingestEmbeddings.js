/**
 * Ingestion Script: Generate embeddings for laptop semantic_text
 * 
 * This script:
 * 1. Connects to MongoDB Atlas
 * 2. Fetches laptops with semantic_text but empty/missing embeddings
 * 3. Generates embeddings using all-MiniLM-L6-v2 (quantized ONNX)
 * 4. Saves embeddings back to the `embedding` array field
 * 
 * Run: node utils/ingestEmbeddings.js
 */

import mongoose from 'mongoose';
import { generateEmbedding } from './embeddings.js';

// MongoDB Configuration
const MONGODB_URI = 'mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/';
const DB_NAME = 'SpecMatch';
const COLLECTION_NAME = 'laptops'; // mongoose lowercases collection names

// Batch size for processing
const BATCH_SIZE = 50;

async function connectDB() {
  try {
    await mongoose.connect(`${MONGODB_URI}${DB_NAME}`);
    console.log('✅ Connected to MongoDB Atlas');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

async function ingestEmbeddings() {
  await connectDB();

  // Access the collection directly (no schema needed for raw updates)
  const db = mongoose.connection.db;
  const collection = db.collection('Laptops'); // Use exact collection name

  // Find documents that need embeddings
  // - Have semantic_text
  // - Either no embedding field, or embedding is empty array
  const query = {
    semantic_text: { $exists: true, $ne: '', $type: 'string' },
    $or: [
      { embedding: { $exists: false } },
      { embedding: { $size: 0 } },
      { embedding: null }
    ]
  };

  const totalCount = await collection.countDocuments(query);
  console.log(`📊 Found ${totalCount} laptops needing embeddings`);

  if (totalCount === 0) {
    console.log('✅ All laptops already have embeddings!');
    await mongoose.disconnect();
    return;
  }

  // Process in batches
  let processed = 0;
  let failed = 0;

  const cursor = collection.find(query, {
    projection: { _id: 1, semantic_text: 1, name: 1 }
  });

  let batch = [];

  for await (const doc of cursor) {
    batch.push(doc);

    if (batch.length >= BATCH_SIZE) {
      const results = await processBatch(batch, collection);
      processed += results.success;
      failed += results.failed;
      console.log(`📈 Progress: ${processed}/${totalCount} (${failed} failed)`);
      batch = [];
    }
  }

  // Process remaining documents
  if (batch.length > 0) {
    const results = await processBatch(batch, collection);
    processed += results.success;
    failed += results.failed;
  }

  console.log('\n========================================');
  console.log(`✅ Ingestion complete!`);
  console.log(`   Total processed: ${processed}`);
  console.log(`   Failed: ${failed}`);
  console.log('========================================\n');

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

async function processBatch(batch, collection) {
  let success = 0;
  let failed = 0;

  const bulkOps = [];

  for (const doc of batch) {
    try {
      const semanticText = doc.semantic_text;

      if (!semanticText || typeof semanticText !== 'string') {
        console.warn(`⚠️ Skipping ${doc._id}: Invalid semantic_text`);
        failed++;
        continue;
      }

      // Generate embedding using the quantized model
      const embedding = await generateEmbedding(semanticText);

      // Prepare bulk update operation - ONLY updates embedding field
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: {
            $set: {
              embedding: embedding,
              'embedding_meta': {
                model: 'all-MiniLM-L6-v2',
                dimensions: embedding.length,
                generated_at: new Date(),
                source_field: 'semantic_text'
              }
            }
          }
        }
      });

      success++;

    } catch (error) {
      console.error(`❌ Error processing ${doc.name || doc._id}:`, error.message);
      failed++;
    }
  }

  // Execute bulk write
  if (bulkOps.length > 0) {
    try {
      await collection.bulkWrite(bulkOps, { ordered: false });
    } catch (error) {
      console.error('❌ Bulk write error:', error.message);
    }
  }

  return { success, failed };
}

// Run the ingestion
console.log('\n🚀 Starting embedding ingestion...\n');
console.log('Model: Xenova/all-MiniLM-L6-v2 (quantized ONNX)');
console.log('Output: 384-dimensional embeddings\n');

ingestEmbeddings().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
