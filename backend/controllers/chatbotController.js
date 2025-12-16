/**
 * Chatbot Controller
 * Handles HTTP requests for the chatbot API
 */

import { handleMessage } from '../services/chatbotServices.js';

/**
 * @route   POST /api/chat/message
 * @desc    Process a chat message and return AI response with laptop recommendations
 * @access  Public
 */
export async function sendMessage(req, res) {
  try {
    const { message, history = [] } = req.body;

    // Validate required fields
    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'message is required and must be a non-empty string',
      });
    }

    // Validate history format if provided
    if (!Array.isArray(history)) {
      return res.status(400).json({
        success: false,
        message: 'history must be an array of {role, content} objects',
      });
    }

    // Validate each history entry
    for (const entry of history) {
      if (!entry.role || !entry.content) {
        return res.status(400).json({
          success: false,
          message: 'Each history entry must have role and content properties',
        });
      }
      if (!['user', 'assistant'].includes(entry.role)) {
        return res.status(400).json({
          success: false,
          message: 'History role must be either "user" or "assistant"',
        });
      }
    }

    // Process the message through the RAG pipeline
    const result = await handleMessage(message.trim(), history);

    return res.status(200).json(result);

  } catch (error) {
    console.error('❌ Chatbot controller error:', error);
    
    return res.status(500).json({
      success: false,
      message: 'An error occurred while processing your message',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
}

export default {
  sendMessage,
};
