/**
 * =============================================================================
 * CHATBOT ROUTES
 * =============================================================================
 *
 * BASE URL: /api/chat
 *
 * PURPOSE:
 * Handle chatbot requests for semantic laptop search + RAG responses.
 *
 * IMPORTANT (NO CHAT PERSISTENCE):
 * - The backend does NOT store chat history.
 * - The frontend MUST send the recent chat history on every request.
 * - If the page reloads or user logs out, history is lost automatically.
 *
 * AVAILABLE ENDPOINTS:
 *
 * | Method | Endpoint   | Description                          |
 * |--------|------------|--------------------------------------|
 * | POST   | /message   | Send a message + history to the bot  |
 */

import express from 'express';
import * as chatBotController from './controllers/chatBotController.js';

const router = express.Router();


// =============================================================================
// SEND CHAT MESSAGE (STATELESS)
// =============================================================================
/**
 * @route   POST /api/chat/message
 * @desc    Send a user message + recent history (provided by frontend) and get a bot reply
 * @access  Public (or Protected if you add auth middleware)
 *
 * @body {String} message - The user's latest message (required)
 * @body {Array}  [history] - Recent messages for context (optional but recommended)
 *
 * history format:
 * [
 *   { role: "user", content: "I want a laptop for university" },
 *   { role: "assistant", content: "Sure — budget and use case?" },
 *   ...
 * ]
 *
 * OPTIONAL FIELDS (if you want them on the frontend):
 * @body {Object} [filters] - Hard filters for retrieval (e.g., maxPrice, minRam, tags)
 * @body {Number} [topK=10] - How many laptops to retrieve for RAG
 *
 * @example
 * POST /api/chat/message
 * {
 *   "message": "I need a sturdy laptop for students under $800",
 *   "history": [
 *     { "role": "user", "content": "Hi" },
 *     { "role": "assistant", "content": "How can I help you?" }
 *   ],
 *   "filters": { "maxPrice": 800, "keywordsAll": ["student", "sturdy"] },
 *   "topK": 12
 * }
 *
 * @returns {Object} 200 - Success
 * {
 *   success: true,
 *   data: {
 *     reply: "Here are a few solid options...",
 *     retrieved: [
 *       { _id, name, brand, slug, pricing, keywords, scoreSummary },
 *       ...
 *     ]
 *   }
 * }
 *
 * @returns {Object} 400 - Bad Request
 * {
 *   success: false,
 *   message: "message is required"
 * }
 */
router.post('/message', chatBotController.sendMessage);


export default router;
