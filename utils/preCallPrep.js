// utils/preCallPrep.js
import { getTodayPlanWithAnalysis } from './getTodayPlan.js';
import { memory } from '../memory/memory.js';

class PreCallManager {
  constructor() {
    this.preparedSessions = new Map(); // callSid -> prepared data
    this.dailyCache = null;
    this.cacheExpiry = null;
  }

  async prepareForCall(phoneNumber) {
    console.log('🚀 Preparing call data in advance...');
    
    try {
      // Check if we have fresh daily cache (refreshes every 2 hours)
      if (!this.isDailyCacheValid()) {
        console.log('📊 Refreshing daily cache...');
        this.dailyCache = await getTodayPlanWithAnalysis();
        this.cacheExpiry = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
      }

      // Get user context from recent sessions
      const userContext = await this.getUserContext(phoneNumber);
      
      // Prepare session data
      const preparedData = {
        ...this.dailyCache,
        userContext,
        preparedAt: new Date(),
        phoneNumber
      };

      console.log('✅ Call preparation complete');
      return preparedData;
      
    } catch (error) {
      console.error('❌ Pre-call preparation failed:', error);
      
      // Fallback preparation
      return {
        events: [],
        habits: [],
        analysis: null,
        opener: "Morning. Let's see what needs your attention today.",
        userContext: {},
        preparedAt: new Date(),
        phoneNumber
      };
    }
  }

  // Store prepared data with a temporary key that gets mapped to callSid later
  storePreparedData(phoneNumber, data) {
    const key = `prep_${phoneNumber}`;
    this.preparedSessions.set(key, {
      ...data,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 min expiry
    });
    return key;
  }

  // Retrieve and transfer to actual callSid when call connects
  claimPreparedData(phoneNumber, callSid) {
    const key = `prep_${phoneNumber}`;
    const data = this.preparedSessions.get(key);
    
    if (data && data.expiresAt > new Date()) {
      this.preparedSessions.delete(key);
      this.preparedSessions.set(callSid, data);
      return data;
    }
    
    return null;
  }

  getPreparedData(callSid) {
    return this.preparedSessions.get(callSid);
  }

  cleanupSession(callSid) {
    this.preparedSessions.delete(callSid);
  }

  isDailyCacheValid() {
    return this.dailyCache && this.cacheExpiry && new Date() < this.cacheExpiry;
  }

  async getUserContext(phoneNumber) {
    try {
      // Get recent sessions for this user
      const recentSessions = await memory.find({
        type: 'enhanced_coaching_session',
        phoneNumber: phoneNumber,
        startTime: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // 7 days
      }).sort({ startTime: -1 }).limit(3).toArray();

      if (recentSessions.length === 0) {
        return { pattern: 'new_user', mood: 'neutral' };
      }

      // Analyze patterns
      const lastSession = recentSessions[0];
      const completionRate = this.calculateCompletionRate(recentSessions);
      const moodTrend = this.analyzeMoodTrend(recentSessions);

      return {
        pattern: completionRate > 0.7 ? 'high_performer' : 
                completionRate > 0.4 ? 'consistent' : 'needs_support',
        mood: moodTrend,
        lastSession: lastSession.endTime,
        streak: recentSessions.length
      };

    } catch (error) {
      console.error('Error getting user context:', error);
      return { pattern: 'unknown', mood: 'neutral' };
    }
  }

  calculateCompletionRate(sessions) {
    const totalCommitments = sessions.reduce((acc, s) => 
      acc + (s.sessionAnalysis?.commitments?.length || 0), 0);
    
    const completedTasks = sessions.reduce((acc, s) => 
      acc + (s.sessionAnalysis?.completedTasks || 0), 0);
    
    return totalCommitments > 0 ? completedTasks / totalCommitments : 0.5;
  }

  analyzeMoodTrend(sessions) {
    const moods = sessions.map(s => s.sessionAnalysis?.mood_energy).filter(Boolean);
    
    if (moods.length === 0) return 'neutral';
    
    const positiveCount = moods.filter(m => 
      m.includes('high') || m.includes('positive') || m.includes('energetic')).length;
    
    return positiveCount > moods.length / 2 ? 'positive' : 'neutral';
  }
}

export const preCallManager = new PreCallManager();

// Enhanced start call route
export async function initiateCall(phoneNumber) {
  console.log(`📞 Initiating call to ${phoneNumber}...`);
  
  try {
    // Prepare all data BEFORE making the call
    const preparedData = await preCallManager.prepareForCall(phoneNumber);
    const prepKey = preCallManager.storePreparedData(phoneNumber, preparedData);
    
    console.log('✅ Data prepared, making Twilio call...');
    
    // Now make the actual Twilio call with prepared data ready
    const twilio = Twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const call = await twilio.calls.create({ 
      to: phoneNumber, 
      from: TWILIO_PHONE_NUMBER, 
      url: `${PUBLIC_URL}/voice?prep=${prepKey}` // Pass prep key
    });
    
    return { callSid: call.sid, prepared: true };
    
  } catch (error) {
    console.error('❌ Call initiation failed:', error);
    throw error;
  }
}