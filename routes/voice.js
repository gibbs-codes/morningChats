// Enhanced voice.js with better call handling
import pkg from 'twilio';
const { twiml } = pkg;
import { getTodayPlan } from '../utils/getTodayPlan.js';
import { getSession, endSession } from '../utils/sessionManager.js';
import { ctx } from '../memory/context.js';
import { systemPrompt } from '../prompts/systemPrompt.js';

export async function handleVoice(req, res) {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  
  console.log(`🎯 Handling voice for call ${callSid}, status: ${callStatus}`);
  
  // Handle call completion/hangup
  if (callStatus === 'completed' || callStatus === 'no-answer' || callStatus === 'failed') {
    console.log(`📞 Call ${callStatus}, cleaning up session...`);
    await endSession(callSid);
    ctx.clear(callSid);
    return res.status(200).send(); // Just acknowledge, no TwiML needed
  }
  
  try {
    // Get today's plan (this should be fast now)
    const { events, habits } = await getTodayPlan();
    
    console.log(`📋 Fetched ${habits.length} habits and ${events.length} events`);
    
    // Create session manager
    const session = getSession(callSid);
    
    // Store the plan data in session for later use
    session.sessionData.todaysPlan = { events, habits };
    
    // Generate a simple, informative opener
    const opener = generateSimpleOpener(habits, events);
    
    // Set conversation context
    ctx.set(callSid, [
      { role: 'system', content: systemPrompt },
      { role: 'assistant', content: opener }
    ]);
    
    // Track this interaction
    session.addExchange('SESSION_START', opener, { 
      taskCount: habits.length, 
      eventCount: events.length 
    });
    
    session.setState('overview');
    
    console.log(`✅ Session initialized with opener: "${opener}"`);
    
    const response = new twiml.VoiceResponse();
    response.say({ voice: 'Google.en-US-Neural2-I' }, opener);
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 8, // 8 second timeout
      finishOnKey: '#', // Allow # to end call
      hints: 'DTT, office attendance, yes, no, done, fifteen minutes' // Help speech recognition
    });
    
    // Add a fallback for no response
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Still there? What do you want to tackle first?');
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 5
    });
    
    // Final fallback - end call if no response
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Talk to you tomorrow. Stay focused.');
    response.hangup();
    
    res.type('text/xml').send(response.toString());
    
  } catch (error) {
    console.error('❌ Voice handler error:', error);
    
    // Simple fallback
    const opener = "Morning. Ready to tackle your day?";
    
    ctx.set(callSid, [
      { role: 'system', content: systemPrompt },
      { role: 'assistant', content: opener }
    ]);
    
    const response = new twiml.VoiceResponse();
    response.say({ voice: 'Google.en-US-Neural2-I' }, opener);
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 8,
      finishOnKey: '#'
    });
    
    // Fallback hangup
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Talk tomorrow.');
    response.hangup();
    
    res.type('text/xml').send(response.toString());
  }
}

function generateSimpleOpener(habits, events) {
  const hour = new Date().getHours();
  const greeting = hour < 8 ? "Early start today." : 
                  hour < 10 ? "Morning." : "Getting going.";
  
  // Get upcoming events in next few hours
  const now = new Date();
  const soonEvents = events.filter(e => {
    const eventTime = new Date(e.start);
    const hoursUntil = (eventTime - now) / (1000 * 60 * 60);
    return hoursUntil > 0 && hoursUntil < 3; // Next 3 hours
  });
  
  // Get top habits by name
  const topHabits = habits.slice(0, 2);
  
  let details = [];
  
  // Add urgent events
  if (soonEvents.length > 0) {
    const nextEvent = soonEvents[0];
    const minutesUntil = Math.floor((new Date(nextEvent.start) - now) / 60000);
    
    if (minutesUntil < 90) {
      details.push(`${nextEvent.title} in ${minutesUntil} minutes`);
    }
  }
  
  // Add habits by name
  if (topHabits.length > 0) {
    const habitNames = topHabits.map(h => {
      const text = h.text || h.title || 'Task';
      return text.length > 20 ? text.substring(0, 20) + '...' : text;
    });
    
    if (habitNames.length === 1) {
      details.push(`${habitNames[0]} to do`);
    } else {
      details.push(`${habitNames[0]} and ${habitNames[1]} to do`);
    }
  }
  
  // Build the opener
  if (details.length === 0) {
    return `${greeting} What's your main focus today?`;
  }
  
  if (details.length === 1) {
    return `${greeting} ${details[0]}. Ready?`;
  }
  
  return `${greeting} ${details.join(', ')}. What's first?`;
}

// Add this route to handle status callbacks from Twilio
export async function handleStatus(req, res) {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  
  console.log(`📊 Call status update: ${callSid} -> ${callStatus}`);
  
  if (callStatus === 'completed' || callStatus === 'no-answer' || callStatus === 'failed') {
    console.log(`🧹 Cleaning up completed call: ${callSid}`);
    await endSession(callSid);
    ctx.clear(callSid);
  }
  
  res.status(200).send('OK');
}