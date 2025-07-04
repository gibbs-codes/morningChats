import fetch from 'node-fetch';

// Use Ollama API instead of OpenAI
export async function llmReply(history) {
  try {
    // Convert OpenAI format to Ollama format
    const ollamaMessages = history.map(msg => ({
      role: msg.role,
      content: msg.content
    }));

    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen:7b-chat', // Your specific model
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.message.content.trim();
    
  } catch (error) {
    console.error('LLM Reply Error:', error);
    // Fallback response if Ollama fails
    return "I'm having trouble thinking right now. Let's focus on your top priority - what needs your attention most this morning?";
  }
}

// Simplified tool calling - only ADD actions, no completions
export async function llmReplyWithTools(history, availableTools = []) {
  try {
    const systemMessage = history.find(msg => msg.role === 'system');
    const conversationHistory = history.filter(msg => msg.role !== 'system');
    
    // Much simpler tool instructions - only adding, not completing
    const enhancedSystemPrompt = `${systemMessage?.content || ''}

AVAILABLE ACTIONS (use sparingly, only when user explicitly wants to add something):
- ADD_TASK: When they say "add X to my todo" or "remind me to Y"
- ADD_EVENT: When they say "put X on my calendar" or "schedule Y"

TO USE A TOOL, respond with exactly this format:
TOOL_CALL: ADD_TASK "task description"
or
TOOL_CALL: ADD_EVENT "event title" "time/date"

OTHERWISE: Just respond normally as their morning coach. Keep responses under 30 words for voice.`;

    const response = await fetch('http://localhost:11434/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen:7b-chat',
        messages: [
          { role: 'system', content: enhancedSystemPrompt },
          ...conversationHistory
        ],
        stream: false,
        options: {
          temperature: 0.4, // Lower for more consistent tool usage
          top_p: 0.8,
          repeat_penalty: 1.1,
        }
      })
    });

    const data = await response.json();
    const content = data.message.content.trim();
    
    // Simple tool parsing - much more forgiving
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