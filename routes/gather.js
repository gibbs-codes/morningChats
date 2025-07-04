import pkg from 'twilio';
const { twiml } = pkg;
import { ctx } from '../memory/context.js';
import { log } from '../memory/log.js';
import { memory } from '../memory/memory.js';
import { llmReply, llmReplyWithTools } from '../utils/llmReply.js';
import { notionClient } from '../utils/notionClient.js';
import { calendarClient } from '../utils/calendarClient.js';
import { generateDynamicOpener } from '../utils/dynamicOpener.js';

export async function handleGather(req, res) {
  const callSid = req.body.CallSid;
  const userInput = (req.body.SpeechResult || '').trim().toLowerCase();

  const response = new twiml.VoiceResponse();

  if (/^(no|nothing else|that'?s it|i'?m done|all set)$/i.test(userInput)) {
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Great work today! Talk to you tomorrow. Keep it up!');
    response.hangup();

    await memory.insertOne({
      userId: 'defaultUser',
      source: 'morningCoach',
      type: 'summary',
      content: 'Call completed. Summary not yet implemented.',
      timestamp: new Date(),
      tags: ['call-end']
    });

    return res.type('text/xml').send(response.toString());
  }

  const history = ctx.get(callSid) || [];
  history.push({ role: 'user', content: userInput });

  // Check if this might need tools (simple keyword detection)
  const needsTools = /\b(add|create|schedule|remind|put.*calendar|todo)\b/i.test(userInput);
  
  let assistantReply;
  let toolResult = null;

  if (needsTools) {
    const llmResponse = await llmReplyWithTools(history);
    
    if (llmResponse.type === 'tool_call') {
      // Execute the tool
      toolResult = await executeToolCall(llmResponse);
      
      // Use the original response if available, otherwise confirm the action
      assistantReply = llmResponse.originalResponse || 
        (toolResult.success ? `Got it. ${toolResult.message}` : `Couldn't add that. ${toolResult.message}`);
    } else {
      assistantReply = llmResponse.content;
    }
  } else {
    assistantReply = await llmReply(history);
  }

  history.push({ role: 'assistant', content: assistantReply });
  ctx.set(callSid, history);

  // Log the interaction
  await log.insertOne({
    callSid,
    timestamp: new Date(),
    userInput,
    assistantReply,
    toolUsed: toolResult ? toolResult.tool : null,
    toolSuccess: toolResult ? toolResult.success : null,
    source: 'morningCoach'
  });

  response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
  response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });

  res.type('text/xml').send(response.toString());
}

async function executeToolCall(toolCall) {
  try {
    switch (toolCall.action) {
      case 'add_task':
        if (process.env.NOTION_TASKS_DB_ID) {
          const result = await notionClient.addTask(process.env.NOTION_TASKS_DB_ID, {
            title: toolCall.task,
            priority: 'Medium'
          });
          
          return {
            tool: 'add_task',
            success: !!result,
            message: result ? 'Added to your tasks.' : 'Task creation failed.'
          };
        }
        return { tool: 'add_task', success: false, message: 'Tasks not configured.' };

      case 'add_event':
        if (process.env.GOOGLE_CALENDAR_ACCESS_TOKEN) {
          const result = await calendarClient.addEvent({
            title: toolCall.title,
            time: toolCall.time
          });
          
          return {
            tool: 'add_event',
            success: !!result,
            message: result ? 'Added to your calendar.' : 'Calendar event failed.'
          };
        }
        return { tool: 'add_event', success: false, message: 'Calendar not configured.' };

      default:
        return { tool: 'unknown', success: false, message: 'Unknown action.' };
    }
  } catch (error) {
    console.error('Tool execution error:', error);
    return { 
      tool: toolCall.action, 
      success: false, 
      message: 'Something went wrong.' 
    };
  }
}