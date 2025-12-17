/**
 * LangChain Configuration
 * Configures Cerebras LLM with llama-3.3-70b model
 */

import { ChatCerebras } from '@langchain/cerebras';
import dotenv from 'dotenv';

dotenv.config();

// Validate API key
if (!process.env.CEREBRAS_API_KEY) {
  console.warn('⚠️ CEREBRAS_API_KEY not found in environment variables');
}

/**
 * Main LLM instance for chat/reasoning tasks
 * Uses llama-3.3-70b via Cerebras API
 */
export const llm = new ChatCerebras({
  model: 'llama-3.3-70b',
  apiKey: process.env.CEREBRAS_API_KEY,
  temperature: 0.3,
  maxTokens: 2048,
});

/**
 * Router LLM - faster responses for classification
 */
export const routerLlm = new ChatCerebras({
  model: 'qwen-3-32b',
  apiKey: process.env.CEREBRAS_API_KEY,
  temperature: 0.1, 
  maxTokens: 512,
});

/**
 * Extraction LLM - structured output extraction
 */
export const extractionLlm = new ChatCerebras({
  model: 'llama-3.3-70b',
  apiKey: process.env.CEREBRAS_API_KEY,
  temperature: 0.1,
  maxTokens: 1024,
});

export default { llm, routerLlm, extractionLlm };
