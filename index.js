import 'dotenv/config';
import fs from 'fs';
import express from 'express';
import fetch from 'node-fetch';
import Twilio from 'twilio';
import OpenAI from 'openai';
import { format } from 'date-fns';

// ───────────────────────────────────────────
// ENVIRONMENT
// ───────────────────────────────────────────
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

// ───────────────────────────────────────────
// CLIENTS
// ───────────────────────────────────────────
const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// ───────────────────────────────────────────
// EXPRESS APP
// ───────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
const ctx = new Map(); // conversation state

// ───────────────────────────────────────────
// SYSTEM PROMPT
// ───────────────────────────────────────────
const systemPrompt = fs.readFileSync('./system_prompt.txt', 'utf8');

// ───────────────────────────────────────────
// HELPERS
// ───────────────────────────────────────────
function formatTime(value) {
  const d = /^\d+$/.test(value)
    ? new Date(Number(value) * 1000)
    : new Date(value);
  return isNaN(d) ? 'Unknown time' : format(d, 'h:mm a');
}

async function getTodayPlan() {
  const eventsP = fetch(EVENTS_ENDPOINT).then(r => r.json());
  const habitsP = fetch('https://habitica.com/api/v3/tasks/user', {
    headers: { 'x-api-user': HABITICA_USER_ID, 'x-api-key': HABITICA_API_TOKEN }
  }).then(r => r.json());
  const [events, habitsResp] = await Promise.all([eventsP, habitsP]);
  return { events, habits: habitsResp.data };
}

async function createHabiticaTodo(task) {
  if (!task) return;
  await fetch('https://habitica.com/api/v3/tasks/user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-user': HABITICA_USER_ID, 'x-api-key': HABITICA_API_TOKEN },
    body: JSON.stringify({ text: task, type: 'todo', priority: 1 })
  });
}

async function llmReply(history) {
  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',  // use function-calling capable model
      messages: history,
      temperature: 0.3,
      functions: [
        {
          name: 'create_task',
          description: 'Add a new Habitica to-do',
          parameters: {
            type: 'object',
            properties: { task: { type: 'string', description: 'Task text' } },
            required: ['task']
          }
        }
      ],
      function_call: 'auto'
    });
    const choice = resp.choices?.[0];
    if (!choice) return 'Could you repeat that?';
    if (choice.finish_reason === 'function_call' && choice.function_call?.name === 'create_task') {
      const { task } = JSON.parse(choice.function_call.parameters);
      await createHabiticaTodo(task);
      return `Added “${task}” to your Habitica.`;  // direct confirmation
    }
    return choice.message?.content?.trim() || '';
  } catch (err) {
    console.error('llmReply error', err);
    return 'Sorry, I hit an error—please say that again.';
  }
}

// ───────────────────────────────────────────
// ROUTES
// ───────────────────────────────────────────
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

  // Create conversational intro
  const opener = ['Morning!','Hey there!','Hello!'][Math.floor(Math.random()*3)];
  const evList = events.length ? events.map(e=>`${e.title} at ${formatTime(e.start)}`).join(', ') : 'No events';
  const habitList = habits.length ? habits.map(h=>h.text).join(', ') : 'No Habitica tasks';
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
  const callSid   = req.body.CallSid;
  const userInput = (req.body.SpeechResult || '').trim().toLowerCase();

  // 1) Check if the *user* is done
  if (/^(no|nothing else|that'?s it|i'?m done|all set)$/i.test(userInput)) {
    const twiml = new Twilio.twiml.VoiceResponse();
    twiml.say({ voice: 'Polly.Matthew' },
      'Great work today! Talk to you tomorrow. Keep it up!');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }

  // 2) Otherwise, process the LLM (including function calls)
  const history = ctx.get(callSid) || [];
  history.push({ role: 'user', content: userInput });

  const assistantReply = await llmReply(history);
  history.push({ role: 'assistant', content: assistantReply });
  ctx.set(callSid, history);

  // 3) Always reprompt after speaking
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.say({ voice: 'Polly.Matthew' }, assistantReply);
  twiml.gather({ input: 'speech', action: '/gather', speechTimeout: 'auto' });
  res.type('text/xml').send(twiml.toString());
});

// START SERVER
app.listen(PORT, () => console.log(`Listening on ${PORT}`));(PORT, () => console.log(`Listening on ${PORT}`));
