/**
 * Semantic Search Demo: Find similar laptops based on user query
 * 
 * This script:
 * 1. Takes user input from the console
 * 2. Generates embedding for the query
 * 3. Performs semantic search using cosine similarity
 * 4. Returns top 5 most similar laptops
 * 
 * Run: node utils/semanticSearchDemo.js
 */

import mongoose from 'mongoose';
import readline from 'readline';
import { generateEmbedding, cosineSimilarity } from './embeddings.js';

// MongoDB Configuration
const MONGODB_URI = 'mongodb+srv://MFahad:FahadIsSussy_Sus107@cluster0.nz6nvjs.mongodb.net/';
const DB_NAME = 'SpecMatch';

let collection;

async function connectDB() {
  try {
    await mongoose.connect(`${MONGODB_URI}${DB_NAME}`);
    console.log('✅ Connected to MongoDB Atlas\n');
    collection = mongoose.connection.db.collection('Laptops');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
}

/**
 * Perform semantic search using cosine similarity
 * @param {string} query - User's search query
 * @param {number} topK - Number of results to return
 * @returns {Promise<Array>} Top matching laptops
 */
async function semanticSearch(query, topK = 5) {
  console.log(`\n🔍 Searching for: "${query}"\n`);

  // Generate embedding for the query
  console.log('⏳ Generating query embedding...');
  const queryEmbedding = await generateEmbedding(query);
  console.log('✅ Query embedding generated (384 dimensions)\n');

  // Fetch all laptops with embeddings
  const laptops = await collection.find(
    { 
      embedding: { $exists: true, $not: { $size: 0 } } 
    },
    { 
      projection: { 
        _id: 1, 
        name: 1, 
        brand: 1, 
        embedding: 1, 
        semantic_text: 1,
        'pricing.estimated_price_usd': 1,
        'cpu.name': 1,
        'gpu.name': 1,
        'ram.size_gb': 1,
        'storage.capacity_gb': 1
      } 
    }
  ).toArray();

  if (laptops.length === 0) {
    console.log('⚠️ No laptops with embeddings found. Run ingestEmbeddings.js first.');
    return [];
  }

  console.log(`📊 Comparing against ${laptops.length} laptops...\n`);

  // Calculate similarity scores
  const results = laptops.map(laptop => {
    const similarity = cosineSimilarity(queryEmbedding, laptop.embedding);
    return {
      _id: laptop._id,
      name: laptop.name,
      brand: laptop.brand,
      semantic_text: laptop.semantic_text,
      price: laptop.pricing?.estimated_price_usd,
      cpu: laptop.cpu?.name,
      gpu: laptop.gpu?.name,
      ram: laptop.ram?.size_gb,
      storage: laptop.storage?.capacity_gb,
      similarity: similarity
    };
  });

  // Sort by similarity (descending) and take top K
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

/**
 * Display search results in a formatted way
 */
function displayResults(results) {
  if (results.length === 0) {
    console.log('No results found.');
    return;
  }

  console.log('═'.repeat(60));
  console.log('🏆 TOP 5 MATCHING LAPTOPS');
  console.log('═'.repeat(60));

  results.forEach((laptop, index) => {
    const similarityPercent = (laptop.similarity * 100).toFixed(2);
    
    console.log(`\n#${index + 1} [${similarityPercent}% match]`);
    console.log('─'.repeat(40));
    console.log(`📱 ${laptop.brand} ${laptop.name}`);
    console.log(`💰 Price: $${laptop.price || 'N/A'}`);
    console.log(`🖥️  CPU: ${laptop.cpu || 'N/A'}`);
    console.log(`🎮 GPU: ${laptop.gpu || 'N/A'}`);
    console.log(`💾 RAM: ${laptop.ram || 'N/A'}GB | Storage: ${laptop.storage || 'N/A'}GB`);
    console.log(`📝 ${laptop.semantic_text || 'No description'}`);
  });

  console.log('\n' + '═'.repeat(60) + '\n');
}

/**
 * Interactive CLI loop
 */
async function interactiveSearch() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('═'.repeat(60));
  console.log('🔎 LAPTOP SEMANTIC SEARCH');
  console.log('═'.repeat(60));
  console.log('Enter your search query to find matching laptops.');
  console.log('Examples:');
  console.log('  • "gaming laptop with RTX graphics"');
  console.log('  • "lightweight laptop for students"');
  console.log('  • "budget laptop for office work"');
  console.log('  • "premium ultrabook with OLED display"');
  console.log('\nType "exit" or "quit" to close.\n');

  const askQuestion = () => {
    rl.question('🔍 Search: ', async (query) => {
      query = query.trim();

      if (!query) {
        askQuestion();
        return;
      }

      if (query.toLowerCase() === 'exit' || query.toLowerCase() === 'quit') {
        console.log('\n👋 Goodbye!\n');
        rl.close();
        await mongoose.disconnect();
        process.exit(0);
      }

      try {
        const results = await semanticSearch(query, 5);
        displayResults(results);
      } catch (error) {
        console.error('❌ Search error:', error.message);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// Main entry point
async function main() {
  console.log('\n🚀 Starting Semantic Search Demo...\n');
  console.log('Model: Xenova/all-MiniLM-L6-v2 (quantized ONNX)');
  console.log('Database: SpecMatch.Laptops\n');

  await connectDB();
  
  // Pre-load the model before interactive mode
  console.log('⏳ Pre-loading embedding model...');
  await generateEmbedding('test');
  console.log('✅ Model ready!\n');

  await interactiveSearch();
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
