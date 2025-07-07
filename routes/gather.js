// Refactored gather.js for collaborative planning conversations
import pkg from 'twilio';
const { twiml } = pkg;
import { llmReply } from '../utils/llmReply.js';
import { generateGuidedResponse } from '../utils/guidedConversation.js';
import { getSession, endSession } from '../utils/sessionManager.js';
import { ctx } from '../memory/context.js';
import { log, memory } from '../mongoClient.js';

export async function handleGather(req, res) {
  const userInput = req.body.SpeechResult;
  const callSid = req.body.CallSid;
  
  console.log(`🗣️ User said: "${userInput}"`);
  
  if (!userInput) {
    return handleSilence(req, res);
  }
  
  try {
    const session = getSession(callSid);
    const history = ctx.get(callSid) || [];
    
    // Add user input to conversation history
    history.push({ role: 'user', content: userInput });
    
    // Detect conversation phase and intent
    const conversationPhase = detectConversationPhase(userInput, session);
    const userIntent = analyzeUserIntent(userInput);
    
    console.log(`🧭 Conversation phase: ${conversationPhase}, Intent: ${userIntent}`);
    
    let assistantReply;
    
    // Generate contextual response based on phase
    switch (conversationPhase) {
      case 'exploration':
        assistantReply = await generateExploratoryResponse(userInput, session, history);
        break;
      
      case 'prioritization':
        assistantReply = await generatePrioritizationResponse(userInput, session, history);
        break;
      
      case 'commitment':
        assistantReply = await generateCommitmentResponse(userInput, session, history);
        break;
      
      case 'wrap_up':
        assistantReply = await generateWrapUpResponse(userInput, session, history);
        break;
      
      default:
        assistantReply = await generateGuidedResponse(userInput, session, history);
    }
    
    // Track insights and patterns (not "performance")
    trackPlanningInsights(userInput, assistantReply, session);
    
    // Add assistant reply to history
    history.push({ role: 'assistant', content: assistantReply });
    ctx.set(callSid, history);
    
    // Enhanced session tracking
    session.addExchange(userInput, assistantReply, {
      phase: conversationPhase,
      intent: userIntent,
      approach: 'collaborative'
    });
    
    console.log(`🤝 Assistant reply: "${assistantReply}"`);
    
    // Check if conversation feels complete
    if (shouldOfferWrapUp(session, history)) {
      assistantReply += " Does that feel like a good plan for now?";
    }
    
    const response = new twiml.VoiceResponse();
    response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
    
    // Adaptive timeout based on conversation phase
    const timeout = conversationPhase === 'exploration' ? 15 : 10;
    
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: timeout,
      finishOnKey: '#'
    });
    
    res.type('text/xml').send(response.toString());
    
  } catch (error) {
    console.error('❌ Conversation error:', error);
    return handleConversationError(req, res);
  }
}

// Detect what phase of planning conversation we're in
function detectConversationPhase(userInput, session) {
  const input = userInput.toLowerCase();
  const exchangeCount = session.sessionData.conversation?.length || 0;
  
  // Early conversation - still exploring
  if (exchangeCount < 3) {
    return 'exploration';
  }
  
  // Looking for priorities
  if (input.includes('important') || input.includes('priority') || input.includes('focus')) {
    return 'prioritization';
  }
  
  // Making commitments
  if (input.includes('will') || input.includes('going to') || input.includes('plan to')) {
    return 'commitment';
  }
  
  // Ready to wrap up
  if (input.includes('done') || input.includes('good') || input.includes('ready') || exchangeCount > 8) {
    return 'wrap_up';
  }
  
  return 'exploration';
}

// Understand what the user is trying to communicate
function analyzeUserIntent(userInput) {
  const input = userInput.toLowerCase();
  
  if (input.includes('tired') || input.includes('overwhelmed') || input.includes('busy')) {
    return 'expressing_constraints';
  }
  
  if (input.includes('want to') || input.includes('need to') || input.includes('should')) {
    return 'identifying_tasks';
  }
  
  if (input.includes('time') || input.includes('when') || input.includes('schedule')) {
    return 'discussing_timing';
  }
  
  if (input.includes('yes') || input.includes('that works') || input.includes('sounds good')) {
    return 'confirming';
  }
  
  return 'general_discussion';
}

// Generate responses for each conversation phase
async function generateExploratoryResponse(userInput, session, history) {
  // Focus on understanding their day and energy
  const exploratoryPrompts = [
    "What's going through your mind about today?",
    "How does your energy feel for tackling things?",
    "What would make today feel successful?",
    "Is there anything weighing on you that we should factor in?"
  ];
  
  // Use LLM but with guidance toward exploration
  return await generateGuidedResponse(userInput, session, history, 'exploration');
}

async function generatePrioritizationResponse(userInput, session, history) {
  // Help them think through what matters most
  return await generateGuidedResponse(userInput, session, history, 'prioritization');
}

async function generateCommitmentResponse(userInput, session, history) {
  // Support their decision-making without pressure
  return await generateGuidedResponse(userInput, session, history, 'commitment');
}

async function generateWrapUpResponse(userInput, session, history) {
  // Gentle closure and encouragement
  return await generateGuidedResponse(userInput, session, history, 'wrap_up');
}

// Track insights about their planning process (not performance)
function trackPlanningInsights(userInput, assistantReply, session) {
  const input = userInput.toLowerCase();
  
  // Track energy patterns
  if (input.includes('tired')) {
    session.addInsight('energy_pattern', 'reports_low_energy');
  }
  
  if (input.includes('excited') || input.includes('ready')) {
    session.addInsight('energy_pattern', 'reports_high_energy');
  }
  
  // Track planning preferences
  if (input.includes('list') || input.includes('order')) {
    session.addInsight('planning_style', 'prefers_structure');
  }
  
  if (input.includes('feel') || input.includes('think')) {
    session.addInsight('planning_style', 'intuitive_approach');
  }
}

// Determine if conversation feels naturally complete
function shouldOfferWrapUp(session, history) {
  const exchangeCount = history.length;
  const userMessages = history.filter(msg => msg.role === 'user');
  
  // Offer wrap-up if:
  // - They've made some commitments
  // - Conversation has gone on for a while
  // - They seem satisfied with their plan
  
  if (exchangeCount > 10) return true;
  if (session.sessionData.commitments?.length > 0 && exchangeCount > 6) return true;
  
  return false;
}

// Handle silence more gently
function handleSilence(req, res) {
  const response = new twiml.VoiceResponse();
  response.say({ 
    voice: 'Google.en-US-Neural2-I' 
  }, 'Take your time thinking about it. What feels right to you?');
  
  response.gather({ 
    input: 'speech', 
    action: '/gather', 
    speechTimeout: 'auto',
    timeout: 12
  });
  
  response.say({ 
    voice: 'Google.en-US-Neural2-I' 
  }, 'No worries. Talk to you later!');
  response.hangup();
  
  return res.type('text/xml').send(response.toString());
}

// Handle errors more gracefully
function handleConversationError(req, res) {
  const response = new twiml.VoiceResponse();
  response.say({ 
    voice: 'Google.en-US-Neural2-I' 
  }, "Something got mixed up on my end. What were you saying about your priorities?");
  
  response.gather({ 
    input: 'speech', 
    action: '/gather', 
    speechTimeout: 'auto',
    timeout: 10
  });
  
  return res.type('text/xml').send(response.toString());
}