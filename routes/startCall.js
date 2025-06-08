import Twilio from 'twilio';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, PUBLIC_URL } from '../config.js';

const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

export async function handleStartCall(req, res) {
  try {
    const { to } = req.body;
    const call = await twilio.calls.create({ to, from: TWILIO_PHONE_NUMBER, url: `${PUBLIC_URL}/voice` });
    res.json({ callSid: call.sid });
  } catch (err) {
    console.error('start-call error', err);
    res.status(500).json({ error: 'Call failed' });
  }
}