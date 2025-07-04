// routes/startCall.js - Updated to use pre-call preparation
import Twilio from 'twilio';
import { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER, PUBLIC_URL } from '../config.js';
import { preCallManager } from '../utils/preCallPrep.js';

const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

export async function handleStartCall(req, res) {
  try {
    const { to } = req.body;
    
    console.log(`📞 Starting call preparation for ${to}...`);
    
    // Step 1: Prepare all data BEFORE making the call
    const preparedData = await preCallManager.prepareForCall(to);
    const prepKey = preCallManager.storePreparedData(to, preparedData);
    
    console.log('✅ Data prepared, initiating Twilio call...');
    console.log(`📋 Prepared opener: "${preparedData.opener}"`);
    
    // Step 2: Make the call with prepared data ready
    const call = await twilio.calls.create({ 
      to, 
      from: TWILIO_PHONE_NUMBER, 
      url: `${PUBLIC_URL}/voice?prep=${prepKey}` // Pass preparation key
    });
    
    console.log(`🎯 Call initiated with SID: ${call.sid}`);
    
    res.json({ 
      callSid: call.sid, 
      prepared: true,
      taskCount: preparedData.habits.length,
      eventCount: preparedData.events.length,
      opener: preparedData.opener
    });
    
  } catch (err) {
    console.error('❌ Start-call error:', err);
    res.status(500).json({ 
      error: 'Call failed', 
      details: err.message 
    });
  }
}