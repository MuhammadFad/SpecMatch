/**
 * Chatbot Services
 * Orchestrates the RAG pipeline: routing → extraction → hybrid search → response
 */

import mongoose from 'mongoose';
import { generateEmbedding } from '../utils/embeddings.js';
import {
  routeQuery,
  extractSearchParams,
  generateResponse,
  generateNoResultsResponse,
  generateNeedMoreInfoResponse,
  getNotRelevantResponse,
} from './langchainService.js';

// Vector search index name (must match the index created in MongoDB Atlas)
const VECTOR_INDEX_NAME = 'vector_index';

// Get the Laptops collection with error handling
const getLaptopCollection = () => {
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error('MongoDB not connected. Ensure database connection is established.');
  }
  return mongoose.connection.db.collection('Laptops');
};

/**
 * Build MongoDB filter query from extracted filters
 * @param {Object} filters - Extracted filter object
 * @returns {Object} MongoDB query object
 * 
 * NOTE: Filters are currently DISABLED for testing.
 * Set ENABLE_FILTERS = true to re-enable.
 */
const ENABLE_FILTERS = false; // Toggle to enable/disable filtering

export function buildMongoFilter(filters = {}) {
  const query = {};

  // FILTERS DISABLED FOR TESTING - Remove this block to re-enable
  if (!ENABLE_FILTERS) {
    console.log('⚠️ Filters DISABLED - returning all laptops for semantic ranking');
    return query;
  }

  // Brand filter (case-insensitive)
  if (filters.brand) {
    query.brand = { $regex: new RegExp(`^${filters.brand}$`, 'i') };
  }

  // Price range
  if (filters.price_min || filters.price_max) {
    query['pricing.estimated_price_usd'] = {};
    if (filters.price_min) {
      query['pricing.estimated_price_usd'].$gte = filters.price_min;
    }
    if (filters.price_max) {
      query['pricing.estimated_price_usd'].$lte = filters.price_max;
    }
  }

  // CPU filters
  if (filters.cpu_brand) {
    query['cpu.manufacturer'] = { $regex: new RegExp(filters.cpu_brand, 'i') };
  }
  if (filters.cpu_name) {
    query['cpu.name'] = { $regex: new RegExp(filters.cpu_name, 'i') };
  }

  // GPU filters
  if (filters.gpu_brand) {
    query['gpu.manufacturer'] = { $regex: new RegExp(filters.gpu_brand, 'i') };
  }
  if (filters.gpu_name) {
    query['gpu.name'] = { $regex: new RegExp(filters.gpu_name, 'i') };
  }

  // RAM minimum
  if (filters.ram_min) {
    query['ram.size_gb'] = { $gte: filters.ram_min };
  }

  // Storage minimum
  if (filters.storage_min) {
    query['storage.capacity_gb'] = { $gte: filters.storage_min };
  }

  // Weight maximum
  if (filters.weight_max) {
    query['chassis.weight_kg'] = { $lte: filters.weight_max };
  }

  // Display size range
  if (filters.display_size_min || filters.display_size_max) {
    query['displays.0.size_inch'] = {};
    if (filters.display_size_min) {
      query['displays.0.size_inch'].$gte = filters.display_size_min;
    }
    if (filters.display_size_max) {
      query['displays.0.size_inch'].$lte = filters.display_size_max;
    }
  }

  // Refresh rate minimum
  if (filters.refresh_rate_min) {
    query['displays.0.refresh_rate_hz'] = { $gte: filters.refresh_rate_min };
  }

  // Touchscreen
  if (filters.touch !== undefined) {
    query['displays.0.touch'] = filters.touch;
  }

  // Keywords (match all specified keywords)
  if (filters.keywords && Array.isArray(filters.keywords) && filters.keywords.length > 0) {
    query.keywords = { $all: filters.keywords.map(k => k.toLowerCase()) };
  }

  return query;
}

/**
 * Perform hybrid search combining filters and semantic similarity using MongoDB Atlas $vectorSearch
 * @param {string} semanticQuery - Natural language query for embedding
 * @param {Object} filters - MongoDB filter object
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} Sorted array of matching laptops
 */
export async function hybridSearch(semanticQuery, filters = {}, topK = 5) {
  console.log('🔍 hybridSearch called with:', { semanticQuery, filters, topK });

  let collection;
  try {
    collection = getLaptopCollection();
    console.log('✅ Got collection reference');
  } catch (err) {
    console.error('❌ Failed to get collection:', err.message);
    throw err;
  }

  // Generate query embedding
  console.log('🔍 Generating query embedding...');
  const queryEmbedding = await generateEmbedding(semanticQuery);
  console.log(`✅ Generated embedding (${queryEmbedding.length} dimensions)`);

  // Build the MongoDB filter for pre/post filtering
  const mongoFilter = buildMongoFilter(filters);
  console.log('📊 MongoDB Filter:', JSON.stringify(mongoFilter, null, 2));

  // Build the $vectorSearch aggregation pipeline
  // MongoDB Atlas $vectorSearch is highly optimized and runs on Atlas infrastructure
  const numCandidates = Math.max(topK * 20, 100); // Get more candidates for better results after deduplication

  const pipeline = [
    {
      $vectorSearch: {
        index: VECTOR_INDEX_NAME,
        path: 'embedding',
        queryVector: queryEmbedding,
        numCandidates: numCandidates,
        limit: numCandidates, // Get more to account for deduplication
        // filter: mongoFilter, // Uncomment when filters are enabled and index supports them
      }
    },
    {
      $addFields: {
        similarity: { $meta: 'vectorSearchScore' }
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        brand: 1,
        slug: 1,
        group_id: 1,
        cpu: 1,
        gpu: 1,
        ram: 1,
        storage: 1,
        displays: 1,
        chassis: 1,
        battery: 1,
        pricing: 1,
        keywords: 1,
        semantic_text: 1,
        images: 1,
        similarity: 1,
        // Note: embedding is NOT projected (saves bandwidth)
      }
    }
  ];

  // Apply post-filter if we have filters (until filter is enabled in $vectorSearch)
  if (Object.keys(mongoFilter).length > 0) {
    pipeline.push({ $match: mongoFilter });
  }

  console.log('🚀 Running $vectorSearch aggregation...');
  
  let laptops;
  try {
    laptops = await collection.aggregate(pipeline).toArray();
    console.log(`📊 Vector search returned: ${laptops.length} laptops`);
  } catch (err) {
    console.error('❌ $vectorSearch failed:', err.message);
    // Fallback error message for common issues
    if (err.message.includes('index') || err.message.includes('vectorSearch')) {
      console.error('💡 Hint: Make sure you have created a vector search index named "vector_index" in MongoDB Atlas');
      console.error('   Index should be on the "embedding" field with 384 dimensions and cosine similarity');
    }
    throw err;
  }

  if (laptops.length === 0) {
    return [];
  }

  // Process results: clean up display names and deduplicate
  const processedLaptops = laptops.map(laptop => {
    // Clean up the display name (remove duplicate brand from name)
    let displayName = laptop.name || '';
    const brand = laptop.brand || '';

    // Remove brand repetition from name (handles "HP HP 15" -> "HP 15")
    if (brand && displayName.toLowerCase().startsWith(brand.toLowerCase())) {
      displayName = displayName.substring(brand.length).trim();
      // Handle double brand like "HP HP 15" -> "HP 15"
      if (displayName.toLowerCase().startsWith(brand.toLowerCase())) {
        displayName = displayName.substring(brand.length).trim();
      }
    }

    return {
      ...laptop,
      displayName,
    };
  });

  // Deduplicate by group_id or slug prefix (keep only highest scoring variant per model)
  // Results are already sorted by similarity from $vectorSearch
  const seen = new Set();
  const deduplicated = [];
  
  for (const laptop of processedLaptops) {
    const dedupeKey = laptop.group_id || laptop.slug?.replace(/-\d+$/, '') || laptop._id.toString();

    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      deduplicated.push(laptop);
    }

    if (deduplicated.length >= topK) {
      break;
    }
  }
  
  console.log(`✅ Found ${deduplicated.length} unique matching laptops`);
  
  return deduplicated;
}

/**
 * Main message handler - orchestrates the full RAG pipeline
 * @param {string} message - User's latest message
 * @param {Array} history - Conversation history [{role, content}, ...]
 * @returns {Promise<Object>} Response object with reply and metadata
 */
export async function handleMessage(message, history = []) {
  try {
    console.log('\n' + '='.repeat(60));
    console.log(' Processing message:', message);
    console.log('='.repeat(60));

    // Step 1: Route the query
    console.log('\n📍 Step 1: Routing query...');
    const routeResult = await routeQuery(message, history);
    console.log('Route result:', routeResult);

    // Handle NOT_RELEVANT
    if (routeResult.classification === 'NOT_RELEVANT') {
      console.log('Query not relevant to laptops');
      return {
        success: true,
        data: {
          reply: getNotRelevantResponse(),
          classification: 'NOT_RELEVANT',
          retrieved: [],
        }
      };
    }

    // Handle NEED_MORE_INFO
    if (routeResult.classification === 'NEED_MORE_INFO') {
      console.log('Need more information');
      const reply = await generateNeedMoreInfoResponse(
        message,
        history,
        routeResult.followUpQuestion
      );
      return {
        success: true,
        data: {
          reply,
          classification: 'NEED_MORE_INFO',
          retrieved: [],
        }
      };
    }

    // Step 2: Extract search parameters
    console.log('\n📍 Step 2: Extracting search parameters...');
    const searchParams = await extractSearchParams(message, history);
    console.log('Semantic query:', searchParams.semanticQuery);
    console.log('Filters:', searchParams.filters);
    console.log('TopK:', searchParams.topK);

    // Step 3: Perform hybrid search
    console.log('\n📍 Step 3: Performing hybrid search...');
    const laptops = await hybridSearch(
      searchParams.semanticQuery,
      searchParams.filters,
      searchParams.topK
    );
    console.log(`Found ${laptops.length} matching laptops`);

    // Step 4: Generate response
    console.log('\n📍 Step 4: Generating response...');
    let reply;

    if (laptops.length === 0) {
      // No results - suggest broadening search
      reply = await generateNoResultsResponse(message, history, searchParams.filters);
    } else {
      // Generate response with laptops
      reply = await generateResponse(message, history, laptops);
    }

    // Prepare retrieved laptops for frontend (without large fields)
    const retrievedForFrontend = laptops.map(laptop => ({
      _id: laptop._id,
      name: laptop.displayName || laptop.name, // Use cleaned name
      brand: laptop.brand,
      slug: laptop.slug,
      pricing: laptop.pricing,
      cpu: laptop.cpu?.name,
      gpu: laptop.gpu?.name,
      ram: laptop.ram?.size_gb,
      storage: laptop.storage?.capacity_gb,
      display: laptop.displays?.[0]?.size_inch,
      weight: laptop.chassis?.weight_kg,
      battery: laptop.battery?.capacity_wh,
      keywords: laptop.keywords,
      similarity: laptop.similarity,
      images: laptop.images,
    }));

    console.log('\n✅ Response generated successfully');
    console.log('='.repeat(60) + '\n');

    return {
      success: true,
      data: {
        reply,
        classification: 'SEARCH_READY',
        retrieved: retrievedForFrontend,
        searchParams: {
          semanticQuery: searchParams.semanticQuery,
          filters: searchParams.filters,
          topK: searchParams.topK,
        },
      }
    };

  } catch (error) {
    console.error('❌ Error in handleMessage:', error);
    throw error;
  }
}

export default {
  buildMongoFilter,
  hybridSearch,
  handleMessage,
};
