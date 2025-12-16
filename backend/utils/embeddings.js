import { pipeline, env } from '@huggingface/transformers';

// Configure cache directory for ONNX models
env.cacheDir = './.cache';

// Initialize the embedding model (lazy-loaded singleton)
let embedder = null;

/**
 * Get or initialize the embedding model
 * Uses Xenova/all-MiniLM-L6-v2 quantized ONNX model
 * @returns {Promise} The embedding pipeline
 */
export async function getEmbedder() {
  if (!embedder) {
    console.log('Loading embedding model (all-MiniLM-L6-v2 quantized)...');
    embedder = await pipeline(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      { quantized: true }
    );
    console.log('Embedding model loaded successfully!');
  }
  return embedder;
}

/**
 * Generate embedding for a single text
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} 384-dimensional embedding vector
 */
export async function generateEmbedding(text) {
  const model = await getEmbedder();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Generate embeddings for multiple texts
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of 384-dimensional embedding vectors
 */
export async function generateEmbeddings(texts) {
  const model = await getEmbedder();
  const embeddings = await Promise.all(
    texts.map(text => model(text, { pooling: 'mean', normalize: true }))
  );
  return embeddings.map(emb => Array.from(emb.data));
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} Cosine similarity score (0-1)
 */
export function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
