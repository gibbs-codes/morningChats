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

// Day analysis parser with better error handling
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

// Enhanced function for day analysis with better JSON extraction
export async function analyzeDayStructure(tasks, events, context = '') {
  try {
    console.log('🧠 Starting day analysis...');
    
    const prompt = PromptTemplate.fromTemplate(`
You are analyzing someone's daily schedule. Return ONLY valid JSON with no additional text.

TASKS: {tasks}
EVENTS: {events}
CONTEXT: {context}

Return this exact JSON structure with no explanation or markdown:

{format_instructions}

IMPORTANT: Return ONLY the JSON object, no additional text or explanation.
`);
    
    const formattedPrompt = await prompt.format({
      tasks: JSON.stringify(tasks),
      events: JSON.stringify(events),
      context,
      format_instructions: dayAnalysisParser.getFormatInstructions()
    });
    
    console.log('📝 Sending prompt to LLM...');
    const response = await llm.invoke(formattedPrompt);
    console.log('🔄 Raw LLM response:', response.content);
    
    // Try to extract JSON from the response
    let jsonContent = response.content.trim();
    
    // Remove any markdown code blocks
    jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Try to find JSON object in the response
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }
    
    console.log('🔧 Cleaned JSON:', jsonContent);
    
    // Manual JSON parsing with fallback
    try {
      const parsed = JSON.parse(jsonContent);
      console.log('✅ Successfully parsed JSON:', parsed);
      return parsed;
    } catch (parseError) {
      console.log('❌ JSON parse failed, trying structured parser...');
      return await dayAnalysisParser.parse(response.content);
    }
    
  } catch (error) {
    console.error('Day analysis error:', error);
    
    // Fallback: Create analysis based on the data we have
    const fallbackAnalysis = createFallbackAnalysis(tasks, events);
    console.log('🔄 Using fallback analysis:', fallbackAnalysis);
    return fallbackAnalysis;
  }
}

// Create a simple fallback analysis when LLM fails
function createFallbackAnalysis(tasks, events) {
  const priorityItems = [];
  const timeConflicts = [];
  
  // Extract task names for priorities
  if (tasks && tasks.length > 0) {
    priorityItems.push(...tasks.slice(0, 3).map(t => t.text || t.title || 'Unknown task'));
  }
  
  // Check for time conflicts in events
  if (events && events.length > 1) {
    // Simple conflict detection
    const sortedEvents = events.sort((a, b) => new Date(a.start) - new Date(b.start));
    for (let i = 0; i < sortedEvents.length - 1; i++) {
      const current = sortedEvents[i];
      const next = sortedEvents[i + 1];
      const currentEnd = new Date(current.end || current.start);
      const nextStart = new Date(next.start);
      
      if (currentEnd > nextStart) {
        timeConflicts.push(`${current.title} overlaps with ${next.title}`);
      }
    }
  }
  
  // Default values if nothing found
  if (priorityItems.length === 0) {
    priorityItems.push('Focus on your most important task');
  }
  
  const energyAssessment = tasks.length > 5 ? 'heavy' : tasks.length > 2 ? 'moderate' : 'light';
  const focusRecommendation = priorityItems.length > 0 ? 
    `Start with: ${priorityItems[0]}` : 
    'Begin with your highest priority item';
  
  return {
    priority_items: priorityItems,
    time_conflicts: timeConflicts,
    energy_assessment: energyAssessment,
    focus_recommendation: focusRecommendation
  };
}

// Enhanced function for conversation flow
export async function generateConversationalResponse(conversation, dayAnalysis) {
  try {
    console.log('🗨️ Generating contextual response...');
    
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

// Enhanced function for session analysis with better JSON parsing
export async function analyzeSession(conversation, decisions) {
  try {
    console.log('🔍 Starting session analysis...');
    
    const prompt = PromptTemplate.fromTemplate(`
Analyze this coaching session for logging. Return ONLY valid JSON with no additional text.

CONVERSATION: {conversation}
DECISIONS MADE: {decisions}

Return this exact JSON structure with no explanation or markdown:

{format_instructions}

IMPORTANT: Return ONLY the JSON object, no additional text or explanation.
`);
    
    const formattedPrompt = await prompt.format({
      conversation: JSON.stringify(conversation),
      decisions: JSON.stringify(decisions),
      format_instructions: sessionAnalysisParser.getFormatInstructions()
    });
    
    console.log('📝 Sending session analysis prompt to LLM...');
    const response = await llm.invoke(formattedPrompt);
    console.log('🔄 Raw session analysis response:', response.content);
    
    // Clean and extract JSON - same logic as day analysis
    let jsonContent = response.content.trim();
    
    // Remove any markdown code blocks
    jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    
    // Remove any text before the JSON object
    const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonContent = jsonMatch[0];
    }
    
    console.log('🔧 Cleaned session JSON:', jsonContent);
    
    // Try manual JSON parsing first
    try {
      const parsed = JSON.parse(jsonContent);
      console.log('✅ Successfully parsed session JSON:', parsed);
      
      // Validate the structure
      if (parsed.key_decisions && parsed.commitments && parsed.mood_energy && parsed.session_outcome) {
        return parsed;
      } else {
        console.log('⚠️ JSON missing required fields, using fallback...');
        return createFallbackSessionAnalysis(conversation, decisions);
      }
    } catch (parseError) {
      console.log('❌ Manual JSON parse failed, trying structured parser...');
      try {
        return await sessionAnalysisParser.parse(response.content);
      } catch (structuredError) {
        console.log('❌ Structured parser also failed, using fallback...');
        return createFallbackSessionAnalysis(conversation, decisions);
      }
    }
    
  } catch (error) {
    console.error('Session analysis error:', error);
    return createFallbackSessionAnalysis(conversation, decisions);
  }
}

// Create fallback session analysis when LLM fails
function createFallbackSessionAnalysis(conversation, decisions) {
  console.log('🔄 Creating fallback session analysis...');
  
  const keyDecisions = [];
  const commitments = [];
  let moodEnergy = 'neutral';
  let sessionOutcome = 'brief';
  
  // Extract decisions from the decisions array
  if (decisions && decisions.length > 0) {
    keyDecisions.push(...decisions.slice(0, 3).map(d => 
      typeof d === 'string' ? d : d.decision || 'Decision made'
    ));
  }
  
  // Look for time commitments in conversation
  if (conversation && conversation.length > 0) {
    const userMessages = conversation
      .filter(msg => msg.user || (msg.role === 'user'))
      .map(msg => msg.user || msg.content || '');
    
    const combinedText = userMessages.join(' ').toLowerCase();
    
    // Extract time commitments
    const timeMatches = combinedText.match(/\b(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/gi);
    if (timeMatches) {
      timeMatches.forEach(match => {
        commitments.push({
          task: `Time commitment: ${match}`,
          timeframe: 'Immediate'
        });
      });
    }
    
    // Analyze mood from text
    if (/good|great|excellent|ready|yes|sure|absolutely/.test(combinedText)) {
      moodEnergy = 'positive and engaged';
      sessionOutcome = 'productive';
    } else if (/tired|difficult|hard|no|maybe|unsure/.test(combinedText)) {
      moodEnergy = 'low energy or hesitant';
      sessionOutcome = 'adjustment';
    } else {
      moodEnergy = 'neutral and focused';
      sessionOutcome = conversation.length > 4 ? 'planning' : 'brief';
    }
  }
  
  // Default values if nothing extracted
  if (keyDecisions.length === 0) {
    keyDecisions.push('Session completed successfully');
  }
  
  if (commitments.length === 0) {
    commitments.push({
      task: 'Morning check-in completed',
      timeframe: 'Session duration'
    });
  }
  
  const fallbackAnalysis = {
    key_decisions: keyDecisions,
    commitments: commitments,
    mood_energy: moodEnergy,
    session_outcome: sessionOutcome
  };
  
  console.log('✅ Fallback session analysis created:', fallbackAnalysis);
  return fallbackAnalysis;
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