import { HfInference } from '@huggingface/inference';

// Initialize the Hugging Face Inference client
const hf = new HfInference(process.env.HUGGINGFACE_API_KEY);

// Model to use for embeddings (same as Xenova/all-MiniLM-L6-v2)
const EMBEDDING_MODEL = 'sentence-transformers/all-MiniLM-L6-v2';

/**
 * Generate embedding for a single text using HuggingFace API
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} 384-dimensional embedding vector
 */
export async function generateEmbedding(text) {
  try {
    console.log('Requesting embedding from Hugging Face API...');
    
    const embedding = await hf.featureExtraction({
      model: EMBEDDING_MODEL,
      inputs: text,
    });

    console.log('Embedding received successfully!');
    // The API returns the embedding directly as a float array
    return Array.from(embedding);
  } catch (error) {
    console.error('Error fetching embedding from HuggingFace API:', error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts using HuggingFace API
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} Array of 384-dimensional embedding vectors
 */
export async function generateEmbeddings(texts) {
  try {
    console.log(`Requesting embeddings for ${texts.length} texts from Hugging Face API...`);
    
    const embeddings = await hf.featureExtraction({
      model: EMBEDDING_MODEL,
      inputs: texts,
    });

    console.log('Embeddings received successfully!');
    // Convert to array of arrays if not already
    return embeddings.map(emb => Array.from(emb));
  } catch (error) {
    console.error('Error fetching embeddings from HuggingFace API:', error);
    throw error;
  }
}

