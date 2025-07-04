import pkg from 'twilio';
const { twiml } = pkg;
import { ctx } from '../memory/context.js';
import { log } from '../memory/log.js';
import { llmReply, llmReplyWithTools, generateConversationalResponse } from '../utils/llmReply.js';
import { notionClient } from '../utils/notionClient.js';
import { calendarClient } from '../utils/calendarClient.js';
import { getSession, endSession } from '../utils/sessionManager.js';

export async function handleGather(req, res) {
  const callSid = req.body.CallSid;
  const userInput = (req.body.SpeechResult || '').trim();

  const response = new twitml.VoiceResponse();

  // Check for session end
  if (/^(no|nothing else|that'?s it|i'?m done|all set|wrap up|finished)$/i.test(userInput)) {
    console.log('🏁 User ending session...');
    
    // Enhanced session ending with analysis
    const sessionData = await endSession(callSid);
    
    const endMessage = sessionData ? 
      'Session logged. Go execute. Check in tomorrow.' :
      'Great work today! Talk to you tomorrow. Keep it up!';
    
    response.say({ voice: 'Google.en-US-Neural2-I' }, endMessage);
    response.hangup();

    return res.type('text/xml').send(response.toString());
  }

  try {
    // Get session manager
    const session = getSession(callSid);
    const history = ctx.get(callSid) || [];
    
    // Add user input to history
    history.push({ role: 'user', content: userInput });

    // Check if this might need tools
    const needsTools = /\b(add|create|schedule|remind|put.*calendar|todo)\b/i.test(userInput);
    
    let assistantReply;
    let toolResult = null;

    if (needsTools) {
      console.log('🔧 Processing tool request...');
      const llmResponse = await llmReplyWithTools(history);
      
      if (llmResponse.type === 'tool_call') {
        toolResult = await executeToolCall(llmResponse);
        assistantReply = llmResponse.originalResponse || 
          (toolResult.success ? `Got it. ${toolResult.message}` : `Couldn't add that. ${toolResult.message}`);
        
        // Track this as a decision
        if (toolResult.success) {
          session.addDecision(`Added: ${toolResult.item || llmResponse.task || llmResponse.title}`);
        }
      } else {
        assistantReply = llmResponse.content;
      }
    } else {
      // Feature 2: Use enhanced conversational response if we have day analysis
      if (session.sessionData.dayAnalysis) {
        console.log('🧠 Generating contextual response...');
        assistantReply = await generateConversationalResponse(
          session.sessionData.conversation,
          session.sessionData.dayAnalysis
        );
      } else {
        // Fallback to basic LLM
        assistantReply = await llmReply(history);
      }
    }

    // Add assistant reply to history
    history.push({ role: 'assistant', content: assistantReply });
    ctx.set(callSid, history);

    // Track in session manager
    session.addExchange(userInput, assistantReply, {
      toolUsed: toolResult?.tool,
      toolSuccess: toolResult?.success
    });

    // Track commitments and decisions
    if (/\b(will|going to|plan to|commit|promise)\b/i.test(userInput)) {
      session.addDecision(`User commitment: ${userInput}`);
    }

    // Legacy logging (keep for backwards compatibility)
    await log.insertOne({
      callSid,
      timestamp: new Date(),
      userInput,
      assistantReply,
      toolUsed: toolResult ? toolResult.tool : null,
      toolSuccess: toolResult ? toolResult.success : null,
      sessionState: session.sessionData.state,
      source: 'morningCoach'
    });

    response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
    response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });

    res.type('text/xml').send(response.toString());

  } catch (error) {
    console.error('Gather handler error:', error);
    
    // Fallback response
    const fallbackReply = "Let's stay focused. What's your main priority?";
    
    response.say({ voice: 'Google.en-US-Neural2-I' }, fallbackReply);
    response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });

    res.type('text/xml').send(response.toString());
  }
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
            message: result ? 'Added to your tasks.' : 'Task creation failed.',
            item: toolCall.task
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
            message: result ? 'Added to your calendar.' : 'Calendar event failed.',
            item: `${toolCall.title} at ${toolCall.time}`
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