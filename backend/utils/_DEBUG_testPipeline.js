/**
 * 🔍 DEBUG: Test the full chatbot pipeline step by step
 * Run: node utils/_DEBUG_testPipeline.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';
import {
  routeQuery,
  extractSearchParams,
} from '../services/langchainService.js';
import { hybridSearch, buildMongoFilter } from '../services/chatbotServices.js';

dotenv.config();

const MONGODB_URI = 'mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/';
const DB_NAME = 'SpecMatch';

const TEST_MESSAGE = "I need a gaming laptop under $1500";
const TEST_HISTORY = [];

async function testPipeline() {
  console.log('\n🔍 PIPELINE DIAGNOSTICS\n');
  console.log('='.repeat(60));
  console.log(`Test message: "${TEST_MESSAGE}"`);
  console.log('='.repeat(60));

  try {
    // Step 0: Connect to DB
    console.log('\n📍 Step 0: Connecting to MongoDB...');
    await mongoose.connect(`${MONGODB_URI}${DB_NAME}`);
    console.log('✅ Connected to MongoDB');

    // Step 1: Test Router
    console.log('\n📍 Step 1: Testing Router...');
    try {
      const routeResult = await routeQuery(TEST_MESSAGE, TEST_HISTORY);
      console.log('✅ Router result:', JSON.stringify(routeResult, null, 2));
    } catch (err) {
      console.log('❌ Router FAILED:', err.message);
      return;
    }

    // Step 2: Test Extraction
    console.log('\n📍 Step 2: Testing Extraction...');
    let searchParams;
    try {
      searchParams = await extractSearchParams(TEST_MESSAGE, TEST_HISTORY);
      console.log('✅ Extraction result:', JSON.stringify(searchParams, null, 2));
    } catch (err) {
      console.log('❌ Extraction FAILED:', err.message);
      return;
    }

    // Step 3: Test MongoDB Filter
    console.log('\n📍 Step 3: Testing MongoDB Filter...');
    const mongoFilter = buildMongoFilter(searchParams.filters);
    console.log('✅ MongoDB filter:', JSON.stringify(mongoFilter, null, 2));

    // Step 4: Test raw MongoDB query
    console.log('\n📍 Step 4: Testing raw MongoDB query...');
    const collection = mongoose.connection.db.collection('Laptops');
    
    // Add embedding check
    const fullFilter = {
      ...mongoFilter,
      embedding: { $exists: true, $ne: [] }
    };
    console.log('Full filter:', JSON.stringify(fullFilter, null, 2));
    
    const rawCount = await collection.countDocuments(fullFilter);
    console.log(`✅ Matching documents: ${rawCount}`);

    // Step 5: Test embedding generation
    console.log('\n📍 Step 5: Testing embedding generation...');
    try {
      const testEmb = await generateEmbedding(searchParams.semanticQuery);
      console.log(`✅ Generated embedding: ${testEmb.length} dimensions`);
      console.log(`   First 5 values: [${testEmb.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
    } catch (err) {
      console.log('❌ Embedding FAILED:', err.message);
      return;
    }

    // Step 6: Test hybrid search
    console.log('\n📍 Step 6: Testing hybrid search...');
    try {
      const results = await hybridSearch(
        searchParams.semanticQuery,
        searchParams.filters,
        searchParams.topK
      );
      console.log(`✅ Hybrid search returned: ${results.length} laptops`);
      
      if (results.length > 0) {
        console.log('\n📋 Top 3 results:');
        results.slice(0, 3).forEach((laptop, i) => {
          console.log(`   ${i + 1}. ${laptop.brand} ${laptop.name} - $${laptop.pricing?.estimated_price_usd} (${(laptop.similarity * 100).toFixed(1)}% match)`);
        });
      } else {
        console.log('❌ NO RESULTS - Problem is in hybridSearch!');
      }
    } catch (err) {
      console.log('❌ Hybrid search FAILED:', err.message);
      console.error(err.stack);
    }

    console.log('\n' + '='.repeat(60));
    console.log('DIAGNOSTICS COMPLETE');
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.disconnect();
  }
}

testPipeline();
