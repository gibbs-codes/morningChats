// routes/startCall.js - Enhanced with status callback
import Twilio from 'twilio';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, PUBLIC_URL } from '../config.js';

const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

export async function handleStartCall(req, res) {
  try {
    const { to } = req.body;
    
    console.log(`📞 Starting call to ${to}...`);
    
    // Make the call with status callback to handle hangups
    const call = await twilio.calls.create({ 
      to, 
      from: TWILIO_PHONE_NUMBER, 
      url: `${PUBLIC_URL}/voice`,
      statusCallback: `${PUBLIC_URL}/status`, // This will handle hangups!
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      statusCallbackMethod: 'POST'
    });
    
    console.log(`🎯 Call initiated with SID: ${call.sid}`);
    
    res.json({ 
      callSid: call.sid,
      message: 'Call initiated with hangup detection'
    });
    
  } catch (err) {
    console.error('❌ Start-call error:', err);
    res.status(500).json({ 
      error: 'Call failed', 
      details: err.message 
    });
  }
}