// routes/gather.js - Enhanced with collaborative conversation flow and loop detection
import twilio from 'twilio';
import { generateGuidedResponse, extractConversationInsights } from '../utils/guidedConversation.js';
import { getSession, endSession } from '../utils/sessionManager.js';
import { ctx } from '../utils/storage.js';
import { generatePlanningSessionSummary } from '../utils/generatePlanningSessionSummary.js';
import { notionClient } from '../utils/notionClient.js';
import { agenticCalendarClient } from '../utils/agenticCalendarClient.js';

export async function handleGather(req, res) {
  const response = new twilio.twiml.VoiceResponse();
  const callSid = req.body.CallSid;
  const speechResult = req.body.SpeechResult?.trim();

  console.log(`📞 Gather (Collaborative): ${speechResult}`);

  try {
    if (!speechResult) {
      response.say({ voice: 'Google.en-US-Neural2-I' }, 'Take your time. What would be helpful to talk through?');
      response.gather({
        input: 'speech',
        action: '/gather',
        speechTimeout: 'auto',
        timeout: 8
      });
      response.hangup();
      return res.type('text/xml').send(response.toString());
    }

    // Get conversation history and session
    const history = ctx.get(callSid) || [];
    const session = getSession(callSid);
    
    // Add user input to history
    history.push({ role: 'user', content: speechResult });

    // === CONVERSATION STATE TRACKING ===
    const conversationState = analyzeConversationState(history);
    console.log(`🧭 Conversation state: ${JSON.stringify(conversationState)}`);

    // === LOOP DETECTION ===
    if (conversationState.isLooping) {
      console.log('🔄 Loop detected, switching conversation approach');
      const breakLoopResponse = await handleConversationLoop(history, conversationState);
      
      response.say({ voice: 'Google.en-US-Neural2-I' }, breakLoopResponse);
      
      if (conversationState.shouldEnd) {
        response.say({ voice: 'Google.en-US-Neural2-I' }, 'Sounds like you have a good sense of your day. Go make it happen!');
        response.hangup();
        await endConversation(callSid);
        return res.type('text/xml').send(response.toString());
      }
      
      response.gather({
        input: 'speech',
        action: '/gather',
        speechTimeout: 'auto',
        timeout: 10
      });
      response.hangup();
      
      ctx.set(callSid, history);
      return res.type('text/xml').send(response.toString());
    }

    // === AGENTIC CALENDAR OPERATIONS ===
    const toolResponse = await handleCalendarOperations(speechResult);
    
    if (toolResponse) {
      const toolMessage = toolResponse.success ? 
        `✅ ${toolResponse.message}` : 
        `❌ ${toolResponse.message}`;
      
      history.push({ role: 'assistant', content: toolMessage });
      console.log('🤖 [CALENDAR] Tool executed:', toolMessage);
      
      // Continue conversation after tool use
      response.say({ voice: 'Google.en-US-Neural2-I' }, toolMessage);
      response.say({ voice: 'Google.en-US-Neural2-I' }, 'What else would be helpful to plan?');
      
      response.gather({
        input: 'speech',
        action: '/gather',
        speechTimeout: 'auto',
        timeout: 8
      });
      
      response.say({ voice: 'Google.en-US-Neural2-I' }, 'Have a great day!');
      response.hangup();
      
      ctx.set(callSid, history);
      return res.type('text/xml').send(response.toString());
    }

    // === COLLABORATIVE CONVERSATION FLOW ===
    
    // Determine conversation phase based on state
    const currentPhase = determineConversationPhase(conversationState, history);
    console.log(`📊 Current phase: ${currentPhase}`);
    
    // Generate contextual, phase-aware response
    const assistantReply = await generateGuidedResponse(
      speechResult, 
      session, 
      history, 
      currentPhase
    );
    
    console.log('🤖 Guided Reply:', assistantReply);

    // Add assistant response to history
    history.push({ role: 'assistant', content: assistantReply });

    // Update conversation state
    session.addExchange('CONVERSATION', assistantReply, {
      phase: currentPhase,
      loopRisk: conversationState.loopRisk,
      userEngagement: conversationState.userEngagement
    });

    // Check if conversation should naturally end
    const shouldEnd = checkNaturalEndConditions(speechResult, assistantReply, conversationState);

    if (shouldEnd) {
      console.log('🏁 Natural conversation ending detected');
      
      const sessionSummary = await generateEnhancedSessionSummary(history, callSid);
      
      if (process.env.NOTION_API_KEY) {
        await notionClient.logMorningSession(sessionSummary);
      }

      response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
      response.say({ voice: 'Google.en-US-Neural2-I' }, getPositiveEndingMessage(sessionSummary));
      response.hangup();
      
      await endConversation(callSid);
    } else {
      // Continue conversation with natural flow
      response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
      response.gather({
        input: 'speech',
        action: '/gather',
        speechTimeout: 'auto',
        timeout: 10,
        hints: generateContextualHints(currentPhase)
      });
      
      response.say({ 
        voice: 'Google.en-US-Neural2-I' 
      }, 'No worries if you need to think about it. What feels right to you?');
      response.hangup();
    }

    // Update conversation history
    ctx.set(callSid, history);
    res.type('text/xml').send(response.toString());

  } catch (error) {
    console.error('❌ Collaborative gather handler error:', error);
    
    // Gentle fallback with supportive tone
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Let\'s take a step back. What feels most important to you right now?');
    response.gather({
      input: 'speech',
      action: '/gather',
      speechTimeout: 'auto',
      timeout: 8
    });
    response.hangup();
    
    res.type('text/xml').send(response.toString());
  }
}

// === CONVERSATION STATE ANALYSIS ===
function analyzeConversationState(history) {
  const userMessages = history.filter(msg => msg.role === 'user');
  const assistantMessages = history.filter(msg => msg.role === 'assistant');
  
  // Loop detection: Check for repetitive patterns
  const recentAssistantMessages = assistantMessages.slice(-3);
  const priorityQuestions = recentAssistantMessages.filter(msg => 
    msg.content.toLowerCase().includes('priority') || 
    msg.content.toLowerCase().includes('important') ||
    msg.content.toLowerCase().includes('focus')
  );
  
  const isLooping = priorityQuestions.length >= 2;
  const loopRisk = priorityQuestions.length >= 1 ? 'high' : 'low';
  
  // Engagement analysis
  const avgUserMessageLength = userMessages.length > 0 ? 
    userMessages.reduce((sum, msg) => sum + msg.content.length, 0) / userMessages.length : 0;
  
  const userEngagement = avgUserMessageLength > 50 ? 'high' : 
                        avgUserMessageLength > 20 ? 'medium' : 'low';
  
  // Progress analysis
  const hasSpecificCommitments = userMessages.some(msg => 
    /\b(\d+)\s*(minutes?|hours?|am|pm)\b/i.test(msg.content) ||
    /(will|going to|plan to)\s+/i.test(msg.content)
  );
  
  const conversationDepth = history.length;
  
  return {
    isLooping,
    loopRisk,
    userEngagement,
    hasSpecificCommitments,
    conversationDepth,
    shouldEnd: conversationDepth > 16 || (conversationDepth > 8 && hasSpecificCommitments)
  };
}

// === LOOP BREAKING ===
async function handleConversationLoop(history, state) {
  console.log('🔄 Breaking conversation loop with fresh approach');
  
  // Analyze user engagement patterns for strategy selection
  
  // Different loop-breaking strategies
  const strategies = [
    "Let me try a different approach. How are you feeling about your energy today?",
    "I hear you. What's one small thing that would make this morning feel good?",
    "Let's think about this differently. What time do you want to wrap up your morning tasks?",
    "I notice we're going in circles. What if we just picked one thing to start with?",
    "You know what? Sometimes the best plan is the simple one. What feels doable right now?"
  ];
  
  // Choose strategy based on conversation state
  let strategy;
  if (state.userEngagement === 'low') {
    strategy = strategies[4]; // Simple approach
  } else if (state.conversationDepth > 12) {
    strategy = strategies[3]; // Decision forcing
  } else {
    strategy = strategies[Math.floor(Math.random() * 3)]; // Fresh angles
  }
  
  // Add to history to track loop breaking
  history.push({ role: 'assistant', content: strategy });
  
  return strategy;
}

// === PHASE DETERMINATION ===
function determineConversationPhase(state, history) {
  const conversationDepth = history.length;
  
  if (conversationDepth <= 4) {
    return 'exploration';
  } else if (!state.hasSpecificCommitments && conversationDepth <= 10) {
    return 'prioritization';
  } else if (state.hasSpecificCommitments) {
    return 'commitment';
  } else if (conversationDepth > 10) {
    return 'wrap_up';
  }
  
  return 'general';
}

// === CALENDAR OPERATIONS ===
async function handleCalendarOperations(speechResult) {
  const lowerInput = speechResult.toLowerCase();
  
  // CREATE operations
  if (lowerInput.includes('schedule') || lowerInput.includes('add to calendar') || lowerInput.includes('put on calendar')) {
    console.log('🤖 [AGENT] Detected schedule request');
    return await agenticCalendarClient.createQuickEvent(speechResult);
  }
  
  // READ operations  
  if (lowerInput.includes('what\'s on my calendar') || lowerInput.includes('my schedule') || lowerInput.includes('upcoming events')) {
    console.log('🤖 [AGENT] Detected schedule inquiry');
    const events = await agenticCalendarClient.getTodaysEvents();
    
    if (events.length === 0) {
      return { success: true, message: 'Your calendar is clear today.' };
    } else {
      const upcoming = events.filter(e => new Date(e.start) > new Date()).slice(0, 3);
      const eventList = upcoming.map(e => `${e.title} at ${agenticCalendarClient.formatDateTime(e.start)}`).join(', ');
      return { 
        success: true, 
        message: `You have ${events.length} events today. Next up: ${eventList}` 
      };
    }
  }
  
  // UPDATE operations
  if (lowerInput.includes('reschedule') || lowerInput.includes('move my')) {
    console.log('🤖 [AGENT] Detected reschedule request');
    const timeMatch = speechResult.match(/to (\d+(?::\d+)?\s*(?:am|pm)?)/i);
    if (timeMatch) {
      const events = await agenticCalendarClient.getTodaysEvents();
      const nextEvent = events.find(e => new Date(e.start) > new Date());
      
      if (nextEvent) {
        return await agenticCalendarClient.rescheduleEvent(nextEvent.id, timeMatch[1]);
      } else {
        return { success: false, message: 'No upcoming events to reschedule.' };
      }
    }
  }
  
  return null;
}

// === NATURAL END CONDITIONS ===
function checkNaturalEndConditions(userInput, assistantReply, state) {
  const userLower = userInput.toLowerCase();
  const replyLower = assistantReply.toLowerCase();
  
  // Explicit endings
  if (userLower.includes('bye') || userLower.includes('done') || userLower.includes('that\'s all') || userLower.includes('thank you')) {
    return true;
  }
  
  // Assistant suggests natural ending
  if (replyLower.includes('sounds good') || replyLower.includes('you\'re all set') || replyLower.includes('great plan')) {
    return true;
  }
  
  // Natural completion indicators
  if (state.hasSpecificCommitments && state.conversationDepth > 6) {
    return true;
  }
  
  // Long conversation with engagement dropping
  if (state.conversationDepth > 14 && state.userEngagement === 'low') {
    return true;
  }
  
  return false;
}

// === ENHANCED SESSION SUMMARY ===
async function generateEnhancedSessionSummary(history, callSid) {
  console.log('📊 Generating enhanced collaborative session summary...');
  
  try {
    const basicSummary = await generatePlanningSessionSummary(callSid);
    const insights = extractConversationInsights(history, { startTime: new Date() });
    const calendarAnalysis = await agenticCalendarClient.analyzeSchedule();
    
    return {
      ...basicSummary,
      conversationInsights: insights,
      calendarInsights: {
        totalEvents: calendarAnalysis?.totalEvents || 0,
        upcomingEvents: calendarAnalysis?.upcomingEvents || 0,
        timeUntilNext: calendarAnalysis?.timeUntilNext || null,
        recommendations: calendarAnalysis?.recommendations || []
      },
      type: 'collaborative_planning_session',
      approach: 'guided_conversation'
    };
  } catch (error) {
    console.error('Enhanced summary failed:', error);
    return await generatePlanningSessionSummary(callSid);
  }
}

// === POSITIVE ENDING MESSAGES ===
function getPositiveEndingMessage(sessionSummary) {
  const messages = [
    'You\'ve got a clear direction. Have a great day!',
    'That sounds like a solid plan. Go make it happen!',
    'Perfect. You know what you\'re doing. Take care!',
    'Great session. You\'re all set for a good day.',
    'Excellent. You\'ve got this figured out.'
  ];
  
  // Add insights-based endings
  if (sessionSummary.conversationInsights?.commitments_made?.length > 0) {
    messages.push('Nice work planning that out. Execute well!');
  }
  
  if (sessionSummary.conversationInsights?.energy_level === 'high') {
    messages.push('I can hear the energy. Channel it well today!');
  }
  
  return messages[Math.floor(Math.random() * messages.length)];
}

// === CONTEXTUAL HINTS ===
function generateContextualHints(phase) {
  const baseHints = 'good morning, feeling, energy, important, focus, time, schedule';
  
  const phaseHints = {
    exploration: 'tired, energized, busy, overwhelmed, ready, excited',
    prioritization: 'important, urgent, focus, priority, first, main',
    commitment: 'will do, plan to, going to, time, when, duration',
    wrap_up: 'done, finished, ready, set, good, thanks'
  };
  
  return `${baseHints}, ${phaseHints[phase] || phaseHints.general}`;
}

// === SESSION CLEANUP ===
async function endConversation(callSid) {
  try {
    await endSession(callSid);
    ctx.clear(callSid);
    console.log(`✅ Collaborative conversation ended cleanly for ${callSid}`);
  } catch (error) {
    console.error('Error ending conversation:', error);
  }
}