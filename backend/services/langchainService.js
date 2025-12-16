/**
 * LangChain Service
 * Handles all LLM interactions for the chatbot pipeline
 */

import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { llm, routerLlm, extractionLlm } from '../config/langchainConfig.js';
import {
  routerSystemPrompt,
  routerUserPrompt,
  extractionSystemPrompt,
  extractionUserPrompt,
  responseSystemPrompt,
  responseUserPrompt,
  noResultsSystemPrompt,
  noResultsUserPrompt,
  needMoreInfoSystemPrompt,
  needMoreInfoUserPrompt,
  notRelevantResponse,
} from '../utils/promptTemplate.js';

// Maximum history messages to include
const MAX_HISTORY_MESSAGES = 15;

/**
 * Format chat history for prompts
 * @param {Array} history - Array of {role, content} messages
 * @returns {string} Formatted history string
 */
function formatHistory(history = []) {
  // Take only last N messages
  const recentHistory = history.slice(-MAX_HISTORY_MESSAGES);
  
  if (recentHistory.length === 0) {
    return '(No previous messages)';
  }

  return recentHistory
    .map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
    .join('\n');
}

/**
 * Parse JSON from LLM response, handling markdown code blocks
 * @param {string} text - LLM response text
 * @returns {Object} Parsed JSON object
 */
function parseJsonResponse(text) {
  // Remove markdown code blocks if present
  let cleaned = text.trim();
  
  // Handle ```json ... ``` blocks
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }
  
  // Try to find JSON object in the text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    console.error('Failed to parse JSON:', text);
    throw new Error('Invalid JSON response from LLM');
  }
}

/**
 * Route the user query to determine intent
 * @param {string} message - User's latest message
 * @param {Array} history - Conversation history
 * @returns {Promise<Object>} Classification result
 */
export async function routeQuery(message, history = []) {
  const formattedHistory = formatHistory(history);
  
  const userPrompt = routerUserPrompt
    .replace('{history}', formattedHistory)
    .replace('{message}', message);

  const response = await routerLlm.invoke([
    new SystemMessage(routerSystemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const result = parseJsonResponse(response.content);
  
  return {
    classification: result.classification || 'NEED_MORE_INFO',
    reason: result.reason || '',
    followUpQuestion: result.followUpQuestion || null,
  };
}

/**
 * Extract search parameters from conversation
 * @param {string} message - User's latest message
 * @param {Array} history - Conversation history
 * @returns {Promise<Object>} Extracted parameters
 */
export async function extractSearchParams(message, history = []) {
  const formattedHistory = formatHistory(history);
  
  const userPrompt = extractionUserPrompt
    .replace('{history}', formattedHistory)
    .replace('{message}', message);

  const response = await extractionLlm.invoke([
    new SystemMessage(extractionSystemPrompt),
    new HumanMessage(userPrompt),
  ]);

  const result = parseJsonResponse(response.content);
  
  return {
    semanticQuery: result.semanticQuery || message,
    filters: result.filters || {},
    topK: Math.min(Math.max(result.topK || 5, 3), 10), // Clamp between 3-10
  };
}

/**
 * Generate response with retrieved laptops
 * @param {string} message - User's latest message
 * @param {Array} history - Conversation history
 * @param {Array} laptops - Retrieved laptop documents
 * @returns {Promise<string>} Generated response
 */
export async function generateResponse(message, history = [], laptops = []) {
  const formattedHistory = formatHistory(history);
  
  // Format laptops for the prompt
  const formattedLaptops = laptops.map((laptop, index) => {
    const similarity = laptop.similarity 
      ? `(${(laptop.similarity * 100).toFixed(1)}% match)` 
      : '';
    
    // Use displayName if available (cleaned), otherwise fall back to brand + name
    const laptopName = laptop.displayName 
      ? `${laptop.brand} ${laptop.displayName}` 
      : laptop.name;
    
    return `
${index + 1}. **${laptopName}** ${similarity}
   - Price: $${laptop.pricing?.estimated_price_usd || 'N/A'}
   - CPU: ${laptop.cpu?.name || 'N/A'}
   - GPU: ${laptop.gpu?.name || 'Integrated'}
   - RAM: ${laptop.ram?.size_gb || 'N/A'}GB
   - Storage: ${laptop.storage?.capacity_gb || 'N/A'}GB ${laptop.storage?.type || ''}
   - Display: ${laptop.displays?.[0]?.size_inch || 'N/A'}" ${laptop.displays?.[0]?.refresh_rate_hz || 60}Hz
   - Weight: ${laptop.chassis?.weight_kg || 'N/A'}kg
   - Battery: ${laptop.battery?.capacity_wh || 'N/A'}Wh
`.trim();
  }).join('\n\n');

  const userPrompt = responseUserPrompt
    .replace('{history}', formattedHistory)
    .replace('{message}', message)
    .replace('{laptops}', formattedLaptops || 'No laptops retrieved');

  const response = await llm.invoke([
    new SystemMessage(responseSystemPrompt),
    new HumanMessage(userPrompt),
  ]);

  return response.content;
}

/**
 * Generate response when no results found
 * @param {string} message - User's latest message
 * @param {Array} history - Conversation history
 * @param {Object} filters - Filters that were applied
 * @returns {Promise<string>} Generated response
 */
export async function generateNoResultsResponse(message, history = [], filters = {}) {
  const formattedHistory = formatHistory(history);
  const formattedFilters = JSON.stringify(filters, null, 2);

  const userPrompt = noResultsUserPrompt
    .replace('{history}', formattedHistory)
    .replace('{message}', message)
    .replace('{filters}', formattedFilters);

  const response = await llm.invoke([
    new SystemMessage(noResultsSystemPrompt),
    new HumanMessage(userPrompt),
  ]);

  return response.content;
}

/**
 * Generate response asking for more information
 * @param {string} message - User's latest message
 * @param {Array} history - Conversation history
 * @param {string} followUpQuestion - Suggested follow-up from router
 * @returns {Promise<string>} Generated response
 */
export async function generateNeedMoreInfoResponse(message, history = [], followUpQuestion = '') {
  const formattedHistory = formatHistory(history);

  const userPrompt = needMoreInfoUserPrompt
    .replace('{history}', formattedHistory)
    .replace('{message}', message)
    .replace('{followUpQuestion}', followUpQuestion || 'Ask about budget and use case');

  const response = await llm.invoke([
    new SystemMessage(needMoreInfoSystemPrompt),
    new HumanMessage(userPrompt),
  ]);

  return response.content;
}

/**
 * Get not relevant response
 * @returns {string} Static not relevant response
 */
export function getNotRelevantResponse() {
  return notRelevantResponse;
}

export default {
  routeQuery,
  extractSearchParams,
  generateResponse,
  generateNoResultsResponse,
  generateNeedMoreInfoResponse,
  getNotRelevantResponse,
};
