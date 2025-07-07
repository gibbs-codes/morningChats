// Refactored voice.js with guided planning approach
import pkg from 'twilio';
const { twiml } = pkg;
import { getTodayPlan } from '../utils/getTodayPlan.js';
import { getSession, endSession } from '../utils/sessionManager.js';
import { ctx } from '../memory/context.js';
import { guidedPlanningPrompt } from '../prompts/gentleSystemPrompt.js';

export async function handleVoice(req, res) {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  
  console.log(`🌅 Handling morning planning call ${callSid}, status: ${callStatus}`);
  
  // Handle call completion/hangup
  if (callStatus === 'completed' || callStatus === 'no-answer' || callStatus === 'failed') {
    console.log(`📞 Call ${callStatus}, wrapping up planning session...`);
    await endSession(callSid);
    ctx.clear(callSid);
    return res.status(200).send();
  }
  
  try {
    // Get today's plan
    const { events, habits } = await getTodayPlan();
    
    console.log(`📋 Found ${habits.length} habits and ${events.length} events for planning`);
    
    // Create planning session
    const session = getSession(callSid);
    session.sessionData.todaysPlan = { events, habits };
    
    // Generate a warm, collaborative opener
    const opener = generateWelcomingOpener(habits, events);
    
    // Set conversation context with gentle system prompt
    ctx.set(callSid, [
      { role: 'system', content: guidedPlanningPrompt },
      { role: 'assistant', content: opener }
    ]);
    
    // Track this interaction
    session.addExchange('SESSION_START', opener, { 
      taskCount: habits.length, 
      eventCount: events.length,
      approach: 'guided_planning'
    });
    
    session.setState('planning_check_in');
    
    console.log(`✅ Planning session initialized: "${opener}"`);
    
    const response = new twiml.VoiceResponse();
    response.say({ voice: 'Google.en-US-Neural2-I' }, opener);
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 12, // Longer timeout for thoughtful responses
      finishOnKey: '#',
      hints: 'good morning, tired, energized, busy day, priorities, important, schedule' 
    });
    
    // Gentle fallback for no response
    response.say({ 
      voice: 'Google.en-US-Neural2-I' 
    }, 'Take your time. What feels most important to focus on this morning?');
    
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 8
    });
    
    // Final gentle fallback
    response.say({ 
      voice: 'Google.en-US-Neural2-I' 
    }, 'No worries if you need to think about it. Call back when you want to plan your day together.');
    response.hangup();
    
    res.type('text/xml').send(response.toString());
    
  } catch (error) {
    console.error('❌ Planning session error:', error);
    
    // Gentle fallback
    const opener = "Good morning! Let's take a few minutes to plan your day together.";
    
    const response = new twiml.VoiceResponse();
    response.say({ voice: 'Google.en-US-Neural2-I' }, opener);
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 10
    });
    
    res.type('text/xml').send(response.toString());
  }
}

// Generate a warm, collaborative opener based on their day
function generateWelcomingOpener(habits, events) {
  const now = new Date();
  const hour = now.getHours();
  
  let greeting;
  if (hour < 7) {
    greeting = "Early start today!";
  } else if (hour < 10) {
    greeting = "Good morning!";
  } else {
    greeting = "Morning!";
  }
  
  const taskCount = habits.length;
  const eventCount = events.length;
  
  // Create contextual opening based on their day
  if (taskCount === 0 && eventCount === 0) {
    return `${greeting} Looks like you have a pretty open day. What would you like to focus on?`;
  }
  
  if (taskCount > 0 && eventCount === 0) {
    return `${greeting} I see you have ${taskCount} things on your list. How are you feeling about tackling those today?`;
  }
  
  if (eventCount > 0 && taskCount === 0) {
    return `${greeting} You've got ${eventCount} things on your calendar. What else is on your mind for today?`;
  }
  
  if (eventCount > 3) {
    return `${greeting} Looks like a busy day with ${eventCount} calendar items. How's your energy feeling?`;
  }
  
  return `${greeting} Let's look at your day together. You've got ${taskCount} tasks and ${eventCount} calendar items. What feels most important?`;
}

// Enhanced status callback with gentle logging
export async function handleStatus(req, res) {
  const callSid = req.body.CallSid;
  const callStatus = req.body.CallStatus;
  const callDuration = req.body.CallDuration;
  
  console.log(`📊 Planning session ${callSid} ${callStatus}, duration: ${callDuration}s`);
  
  if (callStatus === 'completed') {
    try {
      // Generate planning session summary
      await generatePlanningSessionSummary(callSid, callDuration);
    } catch (error) {
      console.error('Error generating planning summary:', error);
    }
  }
  
  res.status(200).send();
}

async function generatePlanningSessionSummary(callSid, duration) {
  // This would generate a summary focused on insights and planning outcomes
  // rather than "performance" and "obedience"
  console.log(`📝 Generating collaborative planning summary for call ${callSid}`);
  // Implementation would be similar to your existing generateCallSummary
  // but with a completely different tone and focus
}