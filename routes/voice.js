import pkg from 'twilio';
const { twiml } = pkg;
import { getTodayPlan } from '../utils/getTodayPlan.js';
import { generateDynamicOpener } from '../utils/dynamicOpener.js';
import { ctx } from '../memory/context.js';
import { systemPrompt } from '../prompts/systemPrompt.js';

export async function handleVoice(req, res) {
  const callSid = req.body.CallSid;
  const { events, habits } = await getTodayPlan();

  // Generate dynamic opener instead of static script
  const intro = generateDynamicOpener(events, habits);

  ctx.set(callSid, [
    { role: 'system', content: systemPrompt },
    { role: 'assistant', content: intro }
  ]);

  const response = new twiml.VoiceResponse();
  response.say({ voice: 'Google.en-US-Neural2-I' }, intro);
  response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });

  res.type('text/xml').send(response.toString());
}