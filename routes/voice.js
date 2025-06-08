import pkg from 'twilio';
const { twiml } = pkg;
import { getTodayPlan } from '../utils/getTodayPlan.js';
import { formatTime } from '../utils/formatTime.js';
import { ctx } from '../memory/context.js';
import { systemPrompt } from '../prompts/systemPrompt.js'; // adjust path if needed

export async function handleVoice(req, res) {
  const callSid = req.body.CallSid;
  const { events, habits } = await getTodayPlan();

  const opener = ['Morning!', 'Hey there!', 'Hello!'][Math.floor(Math.random() * 3)];
  const evList = events.length ? events.map(e => `${e.title} at ${formatTime(e.start)}`).join(', ') : 'No events';
  const habitList = habits.length ? habits.map(h => h.text).join(', ') : 'No Habitica tasks';
  const intro = `${opener} You have: ${evList}. Habitica tasks: ${habitList}. What should we tackle first?`;

  ctx.set(callSid, [
    { role: 'system', content: systemPrompt },
    { role: 'assistant', content: intro }
  ]);

  const response = new twiml.VoiceResponse();
  response.say({ voice: 'Google.en-US-Neural2-I' }, intro);
  response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });

  res.type('text/xml').send(response.toString());
}