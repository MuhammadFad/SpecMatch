import "dotenv/config"
import { ChatCerebras } from "@langchain/cerebras";
import { ChatPromptTemplate, MessagesPlaceholder } from "@langchain/core/prompts"
import { StringOutputParser }  from "@langchain/core/output_parsers";
import { HumanMessage, AIMessage } from "@langchain/core/messages";

async function main() {
    // 1. Initialize Model
    const model = new ChatCerebras({
        apiKey: process.env.CEREBRAS_API_KEY,
        model: "llama3.3-70b",
        temperature: 0.1, // Low temp because we want factual rephrasing, not creativity
    });

    // 2. Define the Prompt Template
    // This instructs the LLM on how to handle the history.
    const reformulationPrompt = ChatPromptTemplate.fromMessages([
        ["system", `Given a chat history and the latest user question which might reference context in the chat history, formulate a standalone question which can be understood without the chat history. 
        
        Rules:
        1. If the user's question is completely new and unrelated to history, return it as is.
        2. If the user's question refers to "it", "that", or "the previous one", replace those words with the actual subject from history.
        3. Do NOT answer the question. Just rewrite it.
        `],
        
        // This placeholder tells LangChain: "Expect a list of messages here named 'chat_history'"
        new MessagesPlaceholder("chat_history"),
        
        ["human", "{input}"],
    ]);

    // 3. Create the Chain
    // Prompt -> Model -> StringOutputParser (cleans up quotes/spaces)
    const historyChain = reformulationPrompt.pipe(model).pipe(new StringOutputParser());

    // --- TEST SCENARIO ---
    
    // Simulate a conversation history:
    // User asked about a Dell laptop, AI responded.
    const fakeHistory = [
        new HumanMessage("I am looking for a Dell XPS 15."),
        new AIMessage("That is a great choice. It has a 4K display and 32GB RAM."),
    ];

    // The user's NEW message (vague):
    const userNewInput = "How much does it cost?";

    console.log("Original Input:", userNewInput);
    console.log("...Reformulating...");

    // 4. Run the Chain
    const result = await historyChain.invoke({
        chat_history: fakeHistory,
        input: userNewInput
    });

    console.log("Standalone Output:", result);
}

main();