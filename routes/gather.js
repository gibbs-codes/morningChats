import pkg from 'twilio';
const { twiml } = pkg;
import { ctx } from '../memory/context.js';
import { log } from '../memory/log.js';
import { memory } from '../memory/memory.js';
import { llmReply } from '../utils/llmReply.js';

export async function handleGather(req, res) {
  const callSid = req.body.CallSid;
  const userInput = (req.body.SpeechResult || '').trim().toLowerCase();

  const response = new twiml.VoiceResponse();

  if (/^(no|nothing else|that'?s it|i'?m done|all set)$/i.test(userInput)) {
    response.say({ voice: 'Google.en-US-Neural2-I' }, 'Great work today! Talk to you tomorrow. Keep it up!');
    response.hangup();

    await memory.insertOne({
      userId: 'defaultUser',
      source: 'morningCoach',
      type: 'summary',
      content: 'Call completed. Summary not yet implemented.',
      timestamp: new Date(),
      tags: ['call-end']
    });

    return res.type('text/xml').send(response.toString());
  }

  const history = ctx.get(callSid) || [];
  history.push({ role: 'user', content: userInput });

  const assistantReply = await llmReply(history);
  history.push({ role: 'assistant', content: assistantReply });
  ctx.set(callSid, history);

  await log.insertOne({
    callSid,
    timestamp: new Date(),
    userInput,
    assistantReply,
    source: 'morningCoach'
  });

  response.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
  response.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });

  res.type('text/xml').send(response.toString());
}