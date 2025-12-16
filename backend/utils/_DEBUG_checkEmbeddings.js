/**
 * 🔍 DEBUG: Check embedding status in database
 * Run: node utils/_DEBUG_checkEmbeddings.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = 'mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/';
const DB_NAME = 'SpecMatch';

async function checkEmbeddings() {
  console.log('\n🔍 EMBEDDING DIAGNOSTICS\n');
  console.log('='.repeat(50));

  try {
    await mongoose.connect(`${MONGODB_URI}${DB_NAME}`);
    console.log('✅ Connected to MongoDB\n');

    const collection = mongoose.connection.db.collection('Laptops');

    // Total documents
    const totalCount = await collection.countDocuments({});
    console.log(`📊 Total laptops in collection: ${totalCount}`);

    // Documents with embedding field
    const withEmbeddingField = await collection.countDocuments({ embedding: { $exists: true } });
    console.log(`📊 Laptops with 'embedding' field: ${withEmbeddingField}`);

    // Documents with non-empty embedding array
    const withNonEmptyEmbedding = await collection.countDocuments({ 
      embedding: { $exists: true, $ne: [], $type: 'array' } 
    });
    console.log(`📊 Laptops with non-empty embedding array: ${withNonEmptyEmbedding}`);

    // Documents with embedding array of size > 0
    const withEmbeddingSize = await collection.countDocuments({
      'embedding.0': { $exists: true }
    });
    console.log(`📊 Laptops with embedding[0] existing: ${withEmbeddingSize}`);

    // Sample a document to check embedding structure
    console.log('\n📋 Sampling first laptop with embedding field:\n');
    const sample = await collection.findOne(
      { embedding: { $exists: true } },
      { projection: { name: 1, brand: 1, embedding: 1 } }
    );

    if (sample) {
      console.log(`   Name: ${sample.brand} ${sample.name}`);
      console.log(`   Embedding type: ${typeof sample.embedding}`);
      console.log(`   Is Array: ${Array.isArray(sample.embedding)}`);
      console.log(`   Embedding length: ${sample.embedding?.length || 0}`);
      if (sample.embedding && sample.embedding.length > 0) {
        console.log(`   First 5 values: [${sample.embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
      } else {
        console.log(`   ⚠️ Embedding is EMPTY!`);
      }
    } else {
      console.log('   ❌ No documents found with embedding field');
    }

    // Check different query approaches
    console.log('\n📋 Testing different MongoDB queries:\n');

    const query1 = await collection.countDocuments({ embedding: { $exists: true, $not: { $size: 0 } } });
    console.log(`   Query: { embedding: { $exists: true, $not: { $size: 0 } } }`);
    console.log(`   Result: ${query1} documents\n`);

    const query2 = await collection.countDocuments({ embedding: { $exists: true, $ne: [] } });
    console.log(`   Query: { embedding: { $exists: true, $ne: [] } }`);
    console.log(`   Result: ${query2} documents\n`);

    const query3 = await collection.countDocuments({ 'embedding.0': { $exists: true } });
    console.log(`   Query: { 'embedding.0': { $exists: true } }`);
    console.log(`   Result: ${query3} documents\n`);

    // Semantic text check
    const withSemanticText = await collection.countDocuments({ 
      semantic_text: { $exists: true, $ne: '' } 
    });
    console.log(`📊 Laptops with semantic_text: ${withSemanticText}`);

    console.log('\n' + '='.repeat(50));
    console.log('DIAGNOSIS:');
    
    if (withEmbeddingSize === 0) {
      console.log('❌ NO LAPTOPS HAVE EMBEDDINGS!');
      console.log('   Run: node utils/ingestEmbeddings.js');
    } else if (withEmbeddingSize < totalCount) {
      console.log(`⚠️ Only ${withEmbeddingSize}/${totalCount} laptops have embeddings.`);
      console.log('   Run: node utils/ingestEmbeddings.js');
    } else {
      console.log('✅ Embeddings look good!');
    }
    console.log('='.repeat(50) + '\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

checkEmbeddings();
