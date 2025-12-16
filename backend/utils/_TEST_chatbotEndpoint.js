/**
 * ============================================================================
 * 🧪 TEST FILE - Chatbot Endpoint Tester (DELETE AFTER TESTING)
 * ============================================================================
 * 
 * Interactive CLI to test the /api/chat/message endpoint
 * Maintains chat history across messages just like the frontend would
 * 
 * Run: node utils/_TEST_chatbotEndpoint.js
 * 
 * Commands:
 *   - Type any message to chat
 *   - /history  - View current chat history
 *   - /clear    - Clear chat history
 *   - /debug    - Toggle debug mode (show full API response)
 *   - /exit     - Exit the tester
 */

import readline from 'readline';

// Configuration
const API_URL = 'http://localhost:3000/api/chat/message';
const MAX_HISTORY = 30; // Keep last 30 messages (15 exchanges)

// State
let chatHistory = [];
let debugMode = false;

/**
 * Send message to chatbot API
 */
async function sendMessage(message) {
  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message,
        history: chatHistory,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || `HTTP ${response.status}`);
    }

    return data;

  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') {
      throw new Error('❌ Cannot connect to server. Is it running on port 3000?');
    }
    throw error;
  }
}

/**
 * Format laptop for display
 */
function formatLaptop(laptop, index) {
  const similarity = laptop.similarity 
    ? `${(laptop.similarity * 100).toFixed(1)}%` 
    : 'N/A';
  
  return `   ${index + 1}. ${laptop.brand} ${laptop.name} - $${laptop.pricing?.estimated_price_usd || 'N/A'} (${similarity} match)`;
}

/**
 * Display the bot's response
 */
function displayResponse(data) {
  console.log('\n' + '─'.repeat(60));
  console.log('🤖 SpecMatch:');
  console.log('─'.repeat(60));
  console.log(data.data.reply);
  
  if (data.data.retrieved && data.data.retrieved.length > 0) {
    console.log('\n📋 Retrieved Laptops:');
    data.data.retrieved.forEach((laptop, i) => {
      console.log(formatLaptop(laptop, i));
    });
  }

  if (debugMode) {
    console.log('\n🔧 Debug Info:');
    console.log('   Classification:', data.data.classification);
    if (data.data.searchParams) {
      console.log('   Semantic Query:', data.data.searchParams.semanticQuery);
      console.log('   Filters:', JSON.stringify(data.data.searchParams.filters));
      console.log('   TopK:', data.data.searchParams.topK);
    }
  }
  
  console.log('─'.repeat(60) + '\n');
}

/**
 * Display chat history
 */
function displayHistory() {
  console.log('\n' + '═'.repeat(60));
  console.log('📜 CHAT HISTORY (' + chatHistory.length + ' messages)');
  console.log('═'.repeat(60));
  
  if (chatHistory.length === 0) {
    console.log('(empty)');
  } else {
    chatHistory.forEach((msg, i) => {
      const icon = msg.role === 'user' ? '👤' : '🤖';
      const preview = msg.content.length > 80 
        ? msg.content.substring(0, 80) + '...' 
        : msg.content;
      console.log(`${i + 1}. ${icon} ${preview}`);
    });
  }
  
  console.log('═'.repeat(60) + '\n');
}

/**
 * Add messages to history
 */
function addToHistory(userMessage, botReply) {
  chatHistory.push({ role: 'user', content: userMessage });
  chatHistory.push({ role: 'assistant', content: botReply });
  
  // Trim to max history
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory = chatHistory.slice(-MAX_HISTORY);
  }
}

/**
 * Process user input
 */
async function processInput(input) {
  const trimmed = input.trim();
  
  if (!trimmed) return true;
  
  // Handle commands
  if (trimmed.startsWith('/')) {
    const command = trimmed.toLowerCase();
    
    switch (command) {
      case '/exit':
      case '/quit':
        console.log('\n👋 Goodbye!\n');
        return false;
        
      case '/history':
        displayHistory();
        return true;
        
      case '/clear':
        chatHistory = [];
        console.log('\n🗑️  Chat history cleared.\n');
        return true;
        
      case '/debug':
        debugMode = !debugMode;
        console.log(`\n🔧 Debug mode: ${debugMode ? 'ON' : 'OFF'}\n`);
        return true;
        
      case '/help':
        console.log('\n📚 Commands:');
        console.log('   /history  - View chat history');
        console.log('   /clear    - Clear chat history');
        console.log('   /debug    - Toggle debug mode');
        console.log('   /exit     - Exit tester\n');
        return true;
        
      default:
        console.log('\n❓ Unknown command. Type /help for available commands.\n');
        return true;
    }
  }
  
  // Send message to API
  try {
    console.log('\n⏳ Sending to API...');
    const startTime = Date.now();
    
    const response = await sendMessage(trimmed);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Response received in ${elapsed}s`);
    
    // Display response
    displayResponse(response);
    
    // Add to history
    if (response.success && response.data?.reply) {
      addToHistory(trimmed, response.data.reply);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (debugMode && error.stack) {
      console.error(error.stack);
    }
    console.log('');
  }
  
  return true;
}

/**
 * Main interactive loop
 */
async function main() {
  console.log('\n' + '═'.repeat(60));
  console.log('🧪 CHATBOT ENDPOINT TESTER');
  console.log('═'.repeat(60));
  console.log('Endpoint:', API_URL);
  console.log('Commands: /help, /history, /clear, /debug, /exit');
  console.log('═'.repeat(60) + '\n');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const askQuestion = () => {
    rl.question('👤 You: ', async (input) => {
      const shouldContinue = await processInput(input);
      
      if (shouldContinue) {
        askQuestion();
      } else {
        rl.close();
        process.exit(0);
      }
    });
  };
  
  askQuestion();
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
