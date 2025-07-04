// Enhanced gather.js with better session ending
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

  console.log(`🎤 User said: "${userInput}"`);

  const response = new twiml.VoiceResponse();

  // Enhanced session ending detection
  if (isSessionEnding(userInput)) {
    console.log('🏁 User ending session...');
    return await handleSessionEnd(callSid, userInput, response, res);
  }

  // Check for Twilio call hangup
  if (req.body.CallStatus === 'completed' || req.body.CallStatus === 'no-answer') {
    console.log('📞 Call ended by Twilio status');
    await endSession(callSid);
    return res.status(200).send(); // Just acknowledge, no TwiML needed
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
        try {
          assistantReply = await generateConversationalResponse(
            session.sessionData.conversation,
            session.sessionData.dayAnalysis
          );
        } catch (error) {
          console.error('Contextual response failed, using basic LLM:', error);
          assistantReply = await llmReply(history);
        }
      } else {
        // Fallback to basic LLM
        console.log('📝 Using basic LLM response...');
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

    console.log(`🤖 Assistant reply: "${assistantReply}"`);

    response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 8, // 8 second timeout for responsiveness
      finishOnKey: '#' // Allow # to end call
    });

    res.type('text/xml').send(response.toString());

  } catch (error) {
    console.error('❌ Gather handler error:', error);
    
    // Fallback response
    const fallbackReply = "Let's stay focused. What's your main priority?";
    
    response.say({ voice: 'Google.en-US-Neural2-I' }, fallbackReply);
    response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });

    res.type('text/xml').send(response.toString());
  }
}

// Better session ending detection
function isSessionEnding(userInput) {
  const endPhrases = [
    /^(no|nothing else|that'?s it|i'?m done|all set|wrap up|finished|bye|goodbye)$/i,
    /^(good|ok|sounds good|alright|perfect)\s*(bye|goodbye|thanks)?$/i,
    /^(thanks|thank you|appreciate it)\s*(bye|goodbye)?$/i,
    /end call|hang up|gotta go|have to go/i,
    /see you tomorrow|talk tomorrow|tomorrow/i
  ];
  
  return endPhrases.some(pattern => pattern.test(userInput.trim()));
}

// Enhanced session ending
async function handleSessionEnd(callSid, userInput, response, res) {
  try {
    console.log('🏁 Processing session end...');
    
    // Get the session data before ending it
    const session = getSession(callSid);
    const conversationHistory = ctx.get(callSid) || [];
    
    // Extract session insights for Notion
    const sessionInsights = extractSessionInsights(conversationHistory, session);
    
    // End the session (this saves to MongoDB)
    const sessionData = await endSession(callSid);
    
    // Save to your Notion "Morning Check In" database
    if (process.env.NOTION_CHECKIN_DB_ID) {
      await saveToNotionCheckIn(sessionInsights);
    }
    
    // Clean up context
    ctx.clear(callSid);
    
    // Final response
    const endMessage = getEndingMessage(sessionInsights);
    
    response.say({ voice: 'Google.en-US-Neural2-I' }, endMessage);
    response.hangup();
    
    console.log('✅ Session ended and logged successfully');
    return res.type('text/xml').send(response.toString());
    
  } catch (error) {
    console.error('❌ Error ending session:', error);
    
    // Fallback ending
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Session complete. Talk tomorrow!');
    response.hangup();
    return res.type('text/xml').send(response.toString());
  }
}

// Extract insights for your Notion database
function extractSessionInsights(conversationHistory, session) {
  const insights = {
    date: new Date().toISOString().split('T')[0],
    priorities: [],
    mood: 'Neutral',
    energyLevel: 'Medium',
    notes: ''
  };
  
  // Extract priorities from conversation
  const userMessages = conversationHistory
    .filter(msg => msg.role === 'user')
    .map(msg => msg.content);
  
  // Look for task mentions and commitments
  const taskMentions = [];
  userMessages.forEach(msg => {
    // Look for specific task names from their habits
    if (session.sessionData.todaysPlan?.habits) {
      session.sessionData.todaysPlan.habits.forEach(habit => {
        if (msg.toLowerCase().includes(habit.text.toLowerCase().split(' ')[0])) {
          taskMentions.push(habit.text);
        }
      });
    }
    
    // Look for time commitments
    if (/\b(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i.test(msg)) {
      const timeMatch = msg.match(/\b(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/i);
      if (timeMatch) {
        taskMentions.push(`${timeMatch[0]} commitment made`);
      }
    }
  });
  
  insights.priorities = [...new Set(taskMentions)].slice(0, 3); // Top 3 unique priorities
  
  // Analyze mood from conversation tone
  const combinedText = userMessages.join(' ').toLowerCase();
  if (/good|great|excellent|awesome|ready|excited|energized/.test(combinedText)) {
    insights.mood = 'Positive';
    insights.energyLevel = 'High';
  } else if (/tired|slow|difficult|hard|struggle|overwhelmed/.test(combinedText)) {
    insights.mood = 'Low';
    insights.energyLevel = 'Low';
  } else if (/ok|fine|decent|normal|alright/.test(combinedText)) {
    insights.mood = 'Neutral';
    insights.energyLevel = 'Medium';
  }
  
  // Create notes summary
  const commitments = session.sessionData.decisions || [];
  const keyPoints = [];
  
  if (commitments.length > 0) {
    keyPoints.push(`Made ${commitments.length} commitments`);
  }
  
  if (insights.priorities.length > 0) {
    keyPoints.push(`Focus: ${insights.priorities[0]}`);
  }
  
  insights.notes = keyPoints.join('. ') || 'Brief check-in completed';
  
  return insights;
}

// Save to your Notion Morning Check In database
async function saveToNotionCheckIn(insights) {
  try {
    console.log('💾 Saving to Notion Check-In database...');
    
    const response = await fetch(`https://api.notion.com/v1/pages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_CHECKIN_DB_ID },
        properties: {
          'Date': {
            date: { start: insights.date }
          },
          'Priorities': {
            multi_select: insights.priorities.map(priority => ({ name: priority }))
          },
          'Mood': {
            select: { name: insights.mood }
          },
          'Energy Level': {
            select: { name: insights.energyLevel }
          },
          'Notes': {
            rich_text: [{ text: { content: insights.notes } }]
          }
        }
      })
    });
    
    if (response.ok) {
      console.log('✅ Successfully saved to Notion Check-In database');
    } else {
      console.error('❌ Failed to save to Notion:', await response.text());
    }
    
  } catch (error) {
    console.error('❌ Error saving to Notion Check-In:', error);
  }
}

// Get appropriate ending message based on session
function getEndingMessage(insights) {
  const messages = [
    'Good session. Execute those plans.',
    'Solid check-in. Make it happen.',
    'Plans set. Time to work.',
    'Clear priorities. Go execute.',
    'Session logged. Get after it.'
  ];
  
  if (insights.priorities.length > 0) {
    return `${insights.priorities[0]} locked in. Execute.`;
  }
  
  return messages[Math.floor(Math.random() * messages.length)];
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