/**
 * LangChain Configuration
 * Configures Cerebras LLM with llama-3.3-70b model
 * Lazy-loaded to allow server to start without API key
 */

import { ChatCerebras } from '@langchain/cerebras';
import dotenv from 'dotenv';

dotenv.config();

// Validate API key
const hasApiKey = !!process.env.CEREBRAS_API_KEY;
if (!hasApiKey) {
  console.warn('⚠️ CEREBRAS_API_KEY not found - Chatbot features will be disabled');
}

// Lazy-loaded LLM instances
let _llm = null;
let _routerLlm = null;
let _extractionLlm = null;

/**
 * Main LLM instance for chat/reasoning tasks
 * Uses llama-3.3-70b via Cerebras API
 */
export const getLlm = () => {
  if (!hasApiKey) return null;
  if (!_llm) {
    _llm = new ChatCerebras({
      model: 'llama-3.3-70b',
      apiKey: process.env.CEREBRAS_API_KEY,
      temperature: 0.3,
      maxTokens: 2048,
    });
  }
  return _llm;
};

// Legacy export for backward compatibility
export const llm = hasApiKey ? new ChatCerebras({
  model: 'llama-3.3-70b',
  apiKey: process.env.CEREBRAS_API_KEY,
  temperature: 0.3,
  maxTokens: 2048,
}) : null;

/**
 * Router LLM - faster responses for classification
 */
export const routerLlm = hasApiKey ? new ChatCerebras({
  model: 'qwen-3-32b',
  apiKey: process.env.CEREBRAS_API_KEY,
  temperature: 0.1,
  maxTokens: 512,
}) : null;

/**
 * Extraction LLM - structured output extraction
 */
export const extractionLlm = hasApiKey ? new ChatCerebras({
  model: 'llama-3.3-70b',
  apiKey: process.env.CEREBRAS_API_KEY,
  temperature: 0.1,
  maxTokens: 1024,
}) : null;

export default { llm, routerLlm, extractionLlm, getLlm };
