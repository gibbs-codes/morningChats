// Enhanced voice.js with missed call accountability
import pkg from 'twilio';
const { twiml } = pkg;
import { getTodayPlan } from '../utils/getTodayPlan.js';
import { getSession, endSession } from '../utils/sessionManager.js';
import { ctx } from '../memory/context.js';
import { systemPrompt } from '../prompts/systemPrompt.js';
import { notionClient } from '../utils/notionClient.js';

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
    
    // Generate a DOMINANT opener with more bite
    const opener = generateDominantOpener(habits, events);
    
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
    
    console.log(`✅ Session initialized with DOMINANT opener: "${opener}"`);
    
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
    
    // Add MORE ALPHA fallback for no response
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Still there? Stop wasting my time. What are you doing?');
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 5
    });
    
    // Final ALPHA fallback - end call with accountability
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Not responding? Call back when you are ready to work.');
    response.hangup();
    
    res.type('text/xml').send(response.toString());
    
  } catch (error) {
    console.error('❌ Voice handler error:', error);
    
    // DOMINANT fallback
    const opener = "Morning. Time to work. What's first?";
    
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
    
    // Dominant hangup
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Call back when ready.');
    response.hangup();
    
    res.type('text/xml').send(response.toString());
  }
}

function generateDominantOpener(habits, events) {
  const hour = new Date().getHours();
  
  // ALPHA time-based greetings
  const greeting = hour < 7 ? "Early. Good boy." : 
                  hour < 8 ? "On time. Let's work." :
                  hour < 9 ? "Morning." : 
                  hour < 10 ? "Running late already?" : "Behind schedule. Typical.";
  
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
  
  // Add urgent events with ALPHA PRESSURE
  if (soonEvents.length > 0) {
    const nextEvent = soonEvents[0];
    const minutesUntil = Math.floor((new Date(nextEvent.start) - now) / 60000);
    
    if (minutesUntil < 60) {
      details.push(`${nextEvent.title} in ${minutesUntil} minutes. Move.`);
    } else if (minutesUntil < 90) {
      details.push(`${nextEvent.title} coming up. Ready?`);
    }
  }
  
  // Add habits with COMMANDING Alpha tone
  if (topHabits.length > 0) {
    const habitNames = topHabits.map(h => {
      const text = h.text || h.title || 'Task';
      return text.length > 20 ? text.substring(0, 20) + '...' : text;
    });
    
    if (habitNames.length === 1) {
      details.push(`${habitNames[0]} waiting.`);
    } else {
      details.push(`${habitNames[0]} and ${habitNames[1]} both waiting.`);
    }
  }
  
  // Build ALPHA opener
  if (details.length === 0) {
    return `${greeting} What's your focus today?`;
  }
  
  if (details.length === 1) {
    return `${greeting} ${details[0]} How long?`;
  }
  
  return `${greeting} ${details.join(' ')} Pick one.`;
}

// Enhanced status callback with MISSED CALL ACCOUNTABILITY
export async function handleStatus(req, res) {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const phoneNumber = req.body.To;
  
  console.log(`📊 Call status update: ${callSid} -> ${callStatus}`);
  
  // Log ONLY true missed calls for ACCOUNTABILITY (not when they hang up properly)
  if (callStatus === 'no-answer' || callStatus === 'failed' || callStatus === 'canceled') {
    console.log(`🚨 MISSED CALL DETECTED: ${callStatus}`);
    
    // Only log if session wasn't already ended properly by gather handler
    const session = getSession(callSid);
    if (session && session.sessionData.state !== 'ended') {
      // Log to Notion for accountability tracking
      if (process.env.NOTION_LOGS_DB_ID) {
        await notionClient.logMissedCall(process.env.NOTION_LOGS_DB_ID, phoneNumber, callStatus);
        console.log('📝 Missed call logged to Notion for accountability');
      }
    } else {
      console.log('⚠️ Session already ended properly, skipping missed call log');
    }
    
    // Clean up any session that might have been created
    await endSession(callSid);
    ctx.clear(callSid);
  }
  
  if (callStatus === 'completed') {
    console.log(`🧹 Cleaning up completed call: ${callSid}`);
    // Only clean up if session wasn't already ended by gather handler
    const session = getSession(callSid);
    if (session && session.sessionData.state !== 'ended') {
      console.log('⚠️ Session not properly ended by gather handler, ending now...');
      await endSession(callSid);
    } else {
      console.log('✅ Session already ended properly by gather handler');
    }
    ctx.clear(callSid);
  }
  
  res.status(200).send('OK');
}