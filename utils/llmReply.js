import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import { StructuredOutputParser } from "langchain/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { z } from "zod";

// Create LLM provider based on environment
function createLLMProvider() {
  if (process.env.LLM_PROVIDER === 'ollama') {
    return new ChatOllama({
      baseUrl: "http://localhost:11434",
      model: "qwen:7b-chat",
      temperature: 0.4,
    });
  }
  
  return new ChatOpenAI({
    modelName: "gpt-4o",
    temperature: 0.4,
    maxTokens: 150
  });
}

const llm = createLLMProvider();

// Day analysis parser
const dayAnalysisParser = StructuredOutputParser.fromZodSchema(
  z.object({
    priority_items: z.array(z.string()).describe("Top 3 priority items for the day"),
    time_conflicts: z.array(z.string()).describe("Any scheduling conflicts or tight timing"),
    energy_assessment: z.enum(['light', 'moderate', 'heavy']).describe("Overall day energy requirement"),
    focus_recommendation: z.string().describe("What should they tackle first")
  })
);

// Session analysis parser  
const sessionAnalysisParser = StructuredOutputParser.fromZodSchema(
  z.object({
    key_decisions: z.array(z.string()).describe("Major decisions made during session"),
    commitments: z.array(z.object({
      task: z.string(),
      timeframe: z.string()
    })).describe("Specific commitments user made"),
    mood_energy: z.string().describe("User's apparent mood and energy level"),
    session_outcome: z.enum(['productive', 'planning', 'adjustment', 'brief']).describe("Type of session")
  })
);

// Your existing basic LLM function - keep this for voice responses
export async function llmReply(history) {
  try {
    const ollamaMessages = history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    // Use LangChain for consistency but keep it simple for voice
    const response = await llm.invoke(ollamaMessages);
    return response.content.trim();
    
  } catch (error) {
    console.error('LLM Reply Error:', error);
    return "Let's focus. What's your top priority right now?";
  }
}

// Enhanced function for day analysis
export async function analyzeDayStructure(tasks, events, context = '') {
  try {
    const prompt = PromptTemplate.fromTemplate(`
You are analyzing someone's daily schedule. Be direct and practical.

TASKS: {tasks}
EVENTS: {events}
CONTEXT: {context}

Analyze this day and provide structured insights:

{format_instructions}
`);
    
    const formattedPrompt = await prompt.format({
      tasks: JSON.stringify(tasks),
      events: JSON.stringify(events),
      context,
      format_instructions: dayAnalysisParser.getFormatInstructions()
    });
    
    const response = await llm.invoke(formattedPrompt);
    return await dayAnalysisParser.parse(response.content);
    
  } catch (error) {
    console.error('Day analysis error:', error);
    return {
      priority_items: ['Focus on your most important task'],
      time_conflicts: [],
      energy_assessment: 'moderate',
      focus_recommendation: 'Start with your highest priority item'
    };
  }
}

// Enhanced function for conversation flow
export async function generateConversationalResponse(conversation, dayAnalysis) {
  try {
    const prompt = PromptTemplate.fromTemplate(`
You are a direct morning coach. Based on the day analysis, respond naturally.

RECENT CONVERSATION: {conversation}
DAY ANALYSIS: {analysis}

Rules:
- Keep responses under 25 words for voice
- Be direct and actionable
- Reference specific items from their schedule
- Ask forcing questions to get commitments

Response:
`);
    
    const formattedPrompt = await prompt.format({
      conversation: JSON.stringify(conversation.slice(-4)), // Last 4 exchanges
      analysis: JSON.stringify(dayAnalysis)
    });
    
    const response = await llm.invoke(formattedPrompt);
    return response.content.trim();
    
  } catch (error) {
    console.error('Conversational response error:', error);
    return "What's your main focus right now?";
  }
}

// Enhanced function for session analysis
export async function analyzeSession(conversation, decisions) {
  try {
    const prompt = PromptTemplate.fromTemplate(`
Analyze this coaching session for logging:

CONVERSATION: {conversation}
DECISIONS MADE: {decisions}

Extract key information:

{format_instructions}
`);
    
    const formattedPrompt = await prompt.format({
      conversation: JSON.stringify(conversation),
      decisions: JSON.stringify(decisions),
      format_instructions: sessionAnalysisParser.getFormatInstructions()
    });
    
    const response = await llm.invoke(formattedPrompt);
    return await sessionAnalysisParser.parse(response.content);
    
  } catch (error) {
    console.error('Session analysis error:', error);
    return {
      key_decisions: ['Session completed'],
      commitments: [],
      mood_energy: 'neutral',
      session_outcome: 'brief'
    };
  }
}

// Your existing tool calling function - keep as is
export async function llmReplyWithTools(history, availableTools = []) {
  try {
    const systemMessage = history.find(msg => msg.role === 'system');
    const conversationHistory = history.filter(msg => msg.role !== 'system');
    
    const enhancedSystemPrompt = `${systemMessage?.content || ''}

AVAILABLE ACTIONS (use sparingly, only when user explicitly wants to add something):
- ADD_TASK: When they say "add X to my todo" or "remind me to Y"
- ADD_EVENT: When they say "put X on my calendar" or "schedule Y"

TO USE A TOOL, respond with exactly this format:
TOOL_CALL: ADD_TASK "task description"
or
TOOL_CALL: ADD_EVENT "event title" "time/date"

OTHERWISE: Just respond normally as their morning coach. Keep responses under 30 words for voice.`;

    const response = await llm.invoke([
      { role: 'system', content: enhancedSystemPrompt },
      ...conversationHistory
    ]);

    const content = response.content.trim();
    
    // Simple tool parsing
    if (content.includes('TOOL_CALL: ADD_TASK')) {
      const taskMatch = content.match(/TOOL_CALL: ADD_TASK "([^"]+)"/);
      if (taskMatch) {
        return { 
          type: 'tool_call', 
          action: 'add_task',
          task: taskMatch[1],
          originalResponse: content.replace(/TOOL_CALL:.*/, '').trim()
        };
      }
    }
    
    if (content.includes('TOOL_CALL: ADD_EVENT')) {
      const eventMatch = content.match(/TOOL_CALL: ADD_EVENT "([^"]+)" "([^"]+)"/);
      if (eventMatch) {
        return { 
          type: 'tool_call', 
          action: 'add_event',
          title: eventMatch[1],
          time: eventMatch[2],
          originalResponse: content.replace(/TOOL_CALL:.*/, '').trim()
        };
      }
    }
    
    return { type: 'message', content };
    
  } catch (error) {
    console.error('LLM Reply With Tools Error:', error);
    return { type: 'message', content: "Let's stay focused. What's your main goal this morning?" };
  }
}