// routes/gather.js - Enhanced with agentic calendar operations
import twilio from 'twilio';
import { llmReply } from '../utils/llmReply.js';
import { ctx } from '../utils/storage.js';
import { generatePlanningSessionSummary } from '../utils/generatePlanningSessionSummary.js';
import { notionClient } from '../utils/notionClient.js';
import { agenticCalendarClient } from '../utils/agenticCalendarClient.js';

export async function handleGather(req, res) {
  const response = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult?.trim();

  console.log(`📞 Gather: ${speechResult}`);

  try {
    if (!speechResult) {
      response.say({ voice: 'Google.en-US-Neural2-I' }, 'Didn\'t catch that. What\'s your priority?');
      response.gather({
        input: 'speech',
        action: '/gather',
        speechTimeout: 'auto',
        timeout: 5
      });
      response.hangup();
      return res.type('text/xml').send(response.toString());
    }

    // Get conversation history
    const history = ctx.get(callSid) || [];
    
    // Add user input to history
    history.push({ role: 'user', content: speechResult });

    // ===== AGENTIC CALENDAR OPERATIONS =====
    let toolResponse = null;
    const lowerInput = speechResult.toLowerCase();

    // CREATE operations
    if (lowerInput.includes('schedule') || lowerInput.includes('add to calendar') || lowerInput.includes('put on calendar')) {
      console.log('🤖 [AGENT] Detected schedule request');
      toolResponse = await agenticCalendarClient.createQuickEvent(speechResult);
    }
    
    // READ operations  
    else if (lowerInput.includes('what\'s on my calendar') || lowerInput.includes('my schedule') || lowerInput.includes('upcoming events')) {
      console.log('🤖 [AGENT] Detected schedule inquiry');
      const events = await agenticCalendarClient.getTodaysEvents();
      const analysis = await agenticCalendarClient.analyzeSchedule();
      
      if (events.length === 0) {
        toolResponse = { success: true, message: 'Your calendar is clear today.' };
      } else {
        const upcoming = events.filter(e => new Date(e.start) > new Date()).slice(0, 3);
        const eventList = upcoming.map(e => `${e.title} at ${agenticCalendarClient.formatDateTime(e.start)}`).join(', ');
        toolResponse = { 
          success: true, 
          message: `You have ${events.length} events today. Next up: ${eventList}` 
        };
      }
    }
    
    // UPDATE operations
    else if (lowerInput.includes('reschedule') || lowerInput.includes('move my')) {
      console.log('🤖 [AGENT] Detected reschedule request');
      // Extract event and new time (simplified)
      const timeMatch = speechResult.match(/to (\d+(?::\d+)?\s*(?:am|pm)?)/i);
      if (timeMatch) {
        // For demo, reschedule the next event
        const events = await agenticCalendarClient.getTodaysEvents();
        const nextEvent = events.find(e => new Date(e.start) > new Date());
        
        if (nextEvent) {
          toolResponse = await agenticCalendarClient.rescheduleEvent(nextEvent.id, timeMatch[1]);
        } else {
          toolResponse = { success: false, message: 'No upcoming events to reschedule.' };
        }
      }
    }
    
    // DELETE operations
    else if (lowerInput.includes('cancel') || lowerInput.includes('remove from calendar')) {
      console.log('🤖 [AGENT] Detected cancel request');
      // Extract event title
      const cancelMatch = speechResult.match(/cancel (?:my )?(.+)/i);
      if (cancelMatch) {
        toolResponse = await agenticCalendarClient.cancelEventByTitle(cancelMatch[1]);
      }
    }
    
    // INTELLIGENT operations
    else if (lowerInput.includes('when am i free') || lowerInput.includes('available time')) {
      console.log('🤖 [AGENT] Detected availability inquiry');
      const slots = await agenticCalendarClient.findAvailableSlots(60);
      
      if (slots.length > 0) {
        const slotTimes = slots.map(s => agenticCalendarClient.formatDateTime(s.start)).join(', ');
        toolResponse = { 
          success: true, 
          message: `You're free at: ${slotTimes}` 
        };
      } else {
        toolResponse = { success: false, message: 'Your calendar looks pretty packed today.' };
      }
    }

    // If we executed a tool, add the response to conversation
    if (toolResponse) {
      const toolMessage = toolResponse.success ? 
        `✅ ${toolResponse.message}` : 
        `❌ ${toolResponse.message}`;
      
      history.push({ role: 'assistant', content: toolMessage });
      console.log('🤖 [AGENT] Tool executed:', toolMessage);
      
      // Respond with tool result and continue conversation
      response.say({ voice: 'Google.en-US-Neural2-I' }, toolMessage);
      response.say({ voice: 'Google.en-US-Neural2-I' }, 'What else?');
      
      response.gather({
        input: 'speech',
        action: '/gather',
        speechTimeout: 'auto',
        timeout: 6
      });
      
      response.say({ voice: 'Google.en-US-Neural2-I' }, 'Good session. Execute those plans.');
      response.hangup();
      
      // Update history
      ctx.set(callSid, history);
      
      return res.type('text/xml').send(response.toString());
    }

    // ===== REGULAR CONVERSATION FLOW =====
    
    // Generate LLM response
    const assistantReply = await llmReply(history);
    console.log('🤖 LLM Reply:', assistantReply);

    // Add assistant response to history
    history.push({ role: 'assistant', content: assistantReply });

    // Check if conversation should end
    const shouldEnd = checkEndConditions(speechResult, assistantReply, history.length);

    if (shouldEnd) {
      console.log('🏁 Ending conversation');
      
      // Generate session summary with agentic insights
      const sessionSummary = await generateEnhancedSessionSummary(history, callSid);
      
      // Log to Notion if configured
      if (process.env.NOTION_API_KEY) {
        await notionClient.logMorningSession(sessionSummary);
      }

      response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
      response.say({ voice: 'Google.en-US-Neural2-I' }, getEndingMessage(sessionSummary));
      response.hangup();
    } else {
      // Continue conversation
      response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
      response.gather({
        input: 'speech',
        action: '/gather',
        speechTimeout: 'auto',
        timeout: 6
      });
      
      response.say({ voice: 'Google.en-US-Neural2-I' }, 'Talk soon.');
      response.hangup();
    }

    // Update conversation history
    ctx.set(callSid, history);

    res.type('text/xml').send(response.toString());

  } catch (error) {
    console.error('❌ Gather handler error:', error);
    
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Let\'s focus. What\'s your main priority?');
    response.gather({
      input: 'speech',
      action: '/gather',
      speechTimeout: 'auto',
      timeout: 5
    });
    response.hangup();
    
    res.type('text/xml').send(response.toString());
  }
}

// Enhanced session summary with calendar insights
async function generateEnhancedSessionSummary(history, callSid) {
  console.log('📊 Generating enhanced session summary...');
  
  try {
    // Get regular session analysis (using your existing function signature)
    const basicSummary = await generatePlanningSessionSummary(callSid);
    
    // Add calendar insights
    const calendarAnalysis = await agenticCalendarClient.analyzeSchedule();
    
    return {
      ...basicSummary,
      calendarInsights: {
        totalEvents: calendarAnalysis?.totalEvents || 0,
        upcomingEvents: calendarAnalysis?.upcomingEvents || 0,
        timeUntilNext: calendarAnalysis?.timeUntilNext || null,
        recommendations: calendarAnalysis?.recommendations || [],
        agentActions: extractAgentActions(history)
      },
      type: 'enhanced_coaching_session_with_calendar'
    };
  } catch (error) {
    console.error('Enhanced summary failed:', error);
    // Fallback to basic summary
    return await generatePlanningSessionSummary(callSid);
  }
}

// Extract what the agent did during the session
function extractAgentActions(history) {
  const actions = [];
  
  history.forEach(msg => {
    if (msg.role === 'assistant' && msg.content.includes('✅')) {
      actions.push({
        type: 'success',
        action: msg.content.replace('✅ ', ''),
        timestamp: new Date()
      });
    } else if (msg.role === 'assistant' && msg.content.includes('❌')) {
      actions.push({
        type: 'error',
        action: msg.content.replace('❌ ', ''),
        timestamp: new Date()
      });
    }
  });
  
  return actions;
}

// Check if conversation should end
function checkEndConditions(userInput, assistantReply, historyLength) {
  const userLower = userInput.toLowerCase();
  const replyLower = assistantReply.toLowerCase();
  
  // Explicit endings
  if (userLower.includes('bye') || userLower.includes('done') || userLower.includes('that\'s it')) {
    return true;
  }
  
  // Assistant suggests ending
  if (replyLower.includes('sounds good') || replyLower.includes('you\'re set')) {
    return true;
  }
  
  // Long conversation
  if (historyLength > 12) {
    return true;
  }
  
  return false;
}

// Get ending message based on session insights
function getEndingMessage(sessionSummary) {
  const messages = [
    'Good session. Execute those plans.',
    'Solid check-in. Make it happen.',
    'Plans set. Time to work.',
    'Clear priorities. Go execute.'
  ];
  
  // Add calendar-aware endings
  if (sessionSummary.calendarInsights?.upcomingEvents > 0) {
    messages.push('Calendar updated. Next event coming up.');
  }
  
  if (sessionSummary.calendarInsights?.agentActions?.length > 0) {
    messages.push('Calendar changes made. You\'re all set.');
  }
  
  return messages[Math.floor(Math.random() * messages.length)];
}