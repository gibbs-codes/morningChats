import pkg from 'twilio';
const { twiml } = pkg;
import { getTodayPlan } from '../utils/getTodayPlan.js';
import { getSession } from '../utils/sessionManager.js';
import { ctx } from '../memory/context.js';
import { systemPrompt } from '../prompts/systemPrompt.js';

export async function handleVoice(req, res) {
  const callSid = req.body.CallSid;
  
  try {
    console.log('🚀 Starting enhanced morning coaching session...');
    
    // Get today's plan
    const { events, habits } = await getTodayPlan();
    
    // Create/get session manager
    const session = getSession(callSid);
    
    // Feature 1: Analyze the day structure
    const dayAnalysis = await session.analyzeTodaysPlan(habits, events);
    
    // Generate personalized opener based on analysis
    const intro = session.generateOverviewMessage(dayAnalysis, habits, events);
    
    // Set conversation context
    ctx.set(callSid, [
      { role: 'system', content: systemPrompt },
      { role: 'assistant', content: intro }
    ]);
    
    // Track this interaction
    session.addExchange('SESSION_START', intro, { 
      dayAnalysis, 
      taskCount: habits.length, 
      eventCount: events.length 
    });
    
    session.setState('overview');
    
    console.log('✅ Session initialized with day analysis');
    
    const response = new twiml.VoiceResponse();
    response.say({ voice: 'Google.en-US-Neural2-I' }, intro);
    response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });
    
    res.type('text/xml').send(response.toString());
    
  } catch (error) {
    console.error('Voice handler error:', error);
    
    // Fallback to basic functionality
    const { events, habits } = await getTodayPlan();
    const intro = `Morning. ${habits.length} tasks, ${events.length} events. What's first?`;
    
    ctx.set(callSid, [
      { role: 'system', content: systemPrompt },
      { role: 'assistant', content: intro }
    ]);
    
    const response = new twiml.VoiceResponse();
    response.say({ voice: 'Google.en-US-Neural2-I' }, intro);
    response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });
    
    res.type('text/xml').send(response.toString());
  }
}