// routes/voice.js - Updated to use pre-prepared data
import pkg from 'twilio';
const { twiml } = pkg;
import { preCallManager } from '../utils/preCallPrep.js';
import { getSession } from '../utils/sessionManager.js';
import { ctx } from '../memory/context.js';
import { systemPrompt } from '../prompts/systemPrompt.js';

export async function handleVoice(req, res) {
  const callSid = req.body.CallSid;
  const callerNumber = req.body.From;
  const prepKey = req.query.prep; // From URL params when call was initiated
  
  console.log(`🎯 Handling voice for call ${callSid}`);
  
  try {
    let preparedData = null;
    
    // Try to get pre-prepared data
    if (prepKey) {
      preparedData = preCallManager.claimPreparedData(callerNumber, callSid);
    }
    
    // Fallback if no prepared data (shouldn't happen in normal flow)
    if (!preparedData) {
      console.log('⚠️ No prepared data found, using fallback...');
      preparedData = {
        events: [],
        habits: [],
        analysis: null,
        opener: "Morning. Let's see what needs your attention today.",
        userContext: { pattern: 'unknown' }
      };
    }

    // Create session manager with prepared data
    const session = getSession(callSid);
    session.sessionData.dayAnalysis = preparedData.analysis;
    session.sessionData.userContext = preparedData.userContext;
    session.sessionData.todaysPlan = {
      events: preparedData.events,
      habits: preparedData.habits
    };

    // Use the pre-prepared opener message
    const opener = preparedData.opener;
    
    // Set conversation context
    ctx.set(callSid, [
      { role: 'system', content: systemPrompt },
      { role: 'assistant', content: opener }
    ]);
    
    // Track this interaction
    session.addExchange('SESSION_START', opener, { 
      hadPreparedData: !!preparedData,
      taskCount: preparedData.habits.length, 
      eventCount: preparedData.events.length,
      userPattern: preparedData.userContext?.pattern
    });
    
    session.setState('overview');
    
    console.log('✅ Session initialized instantly with prepared data');
    console.log(`📢 Opener: "${opener}"`);
    
    const response = new twiml.VoiceResponse();
    response.say({ voice: 'Google.en-US-Neural2-I' }, opener);
    response.gather({ 
      input: 'speech', 
      action: '/gather', 
      speechTimeout: 'auto',
      timeout: 5
    });
    
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
    response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });
    
    res.type('text/xml').send(response.toString());
  }
}