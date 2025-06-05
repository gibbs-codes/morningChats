import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import fetch from 'node-fetch';
import Twilio from 'twilio';
import OpenAI from 'openai';
import { format } from 'date-fns';

const {
  PORT,
  PUBLIC_URL,
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_PHONE_NUMBER,
  OPENAI_API_KEY,
  EVENTS_ENDPOINT,
  HABITICA_USER_ID,
  HABITICA_API_TOKEN
} = process.env;
if (!PORT || !PUBLIC_URL) throw new Error('Missing PORT or PUBLIC_URL');

const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
const ctx = new Map();

const systemPrompt = fs.readFileSync('./system_prompt.txt', 'utf8');

function formatTime(value) {
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  const chicagoOffset = 5 * 60 * 60000;
  const chicagoTime = new Date(local.getTime() - chicagoOffset);
  return isNaN(chicagoTime) ? 'Unknown time' : format(chicagoTime, 'h:mm a');
}

async function getTodayPlan() {
  const eventsP = fetch(EVENTS_ENDPOINT).then(r => r.json());
  const habitsP = fetch('https://habitica.com/api/v3/tasks/user', {
    headers: { 'x-api-user': HABITICA_USER_ID, 'x-api-key': HABITICA_API_TOKEN }
  }).then(r => r.json());
  const [events, habitsResp] = await Promise.all([eventsP, habitsP]);
  return { events, habits: habitsResp.data };
}

async function llmReply(history) {
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: history,
      temperature: 0.3
    });
    const choice = resp.choices?.[0];
    return choice?.message?.content?.trim() || 'Could you repeat that?';
  } catch (err) {
    console.error('llmReply error', err);
    return 'Sorry, I hit an error—please say that again.';
  }
}

app.post('/start-call', async (req, res) => {
  try {
    const { to } = req.body;
    const call = await twilio.calls.create({ to, from: TWILIO_PHONE_NUMBER, url: `${PUBLIC_URL}/voice` });
    res.json({ callSid: call.sid });
  } catch (err) {
    console.error('start-call error', err);
    res.status(500).json({ error: 'Call failed' });
  }
});

app.post('/voice', async (req, res) => {
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

  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say({ voice: 'Google.en-US-Neural2-I' }, intro);
  twiml.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });
  res.type('text/xml').send(twiml.toString());
});

app.post('/gather', async (req, res) => {
  const callSid = req.body.CallSid;
  const userInput = (req.body.SpeechResult || '').trim().toLowerCase();

  if (/^(no|nothing else|that'?s it|i'?m done|all set)$/i.test(userInput)) {
    const twiml = new Twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'Google.en-US-Neural2-I' }, 'Great work today! Talk to you tomorrow. Keep it up!');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  const history = ctx.get(callSid) || [];
  history.push({ role: 'user', content: userInput });

  const assistantReply = await llmReply(history);
  history.push({ role: 'assistant', content: assistantReply });
  ctx.set(callSid, history);

  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say({ voice: 'Google.en-US-Neural2-I' }, assistantReply);
  twiml.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });
  res.type('text/xml').send(twiml.toString());
});

app.listen(PORT, () => console.log(`Listening on ${PORT}`));
