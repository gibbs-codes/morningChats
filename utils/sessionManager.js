import { memory } from '../memory/memory.js';
import { notionClient } from './notionClient.js';
import { analyzeDayStructure, analyzeSession } from './llmReply.js';

export class SessionManager {
  constructor(callSid) {
    this.callSid = callSid;
    this.sessionData = {
      startTime: new Date(),
      conversation: [],
      decisions: [],
      dayAnalysis: null,
      state: 'initial' // initial -> overview -> flow -> execution -> wrap
    };
  }
  
  // Feature 1: Day Overview Analysis
  async analyzeTodaysPlan(tasks, events) {
    try {
      console.log('🔍 Analyzing day structure...');
      
      // Get recent context from MongoDB
      const recentSessions = await this.getRecentSessions(3);
      const context = this.buildContext(recentSessions);
      
      // Use LLM to analyze the day
      const analysis = await analyzeDayStructure(tasks, events, context);
      this.sessionData.dayAnalysis = analysis;
      
      console.log('✅ Day analysis complete:', analysis);
      return analysis;
      
    } catch (error) {
      console.error('Day analysis error:', error);
      return {
        priority_items: ['Focus on your most important task'],
        time_conflicts: [],
        energy_assessment: 'moderate',
        focus_recommendation: 'Start with your highest priority item'
      };
    }
  }
  
  // Feature 2: Generate conversational overview
  generateOverviewMessage(analysis, tasks, events) {
    const priorities = analysis.priority_items.slice(0, 2).join(' and ');
    const conflicts = analysis.time_conflicts.length;
    
    if (conflicts > 0) {
      return `${priorities} are key today. I see ${conflicts} timing issues. Need adjustments?`;
    }
    
    return `Today: ${priorities}. ${analysis.energy_assessment} day. Missing anything?`;
  }
  
  // Track conversation state
  addExchange(userInput, assistantResponse, metadata = {}) {
    this.sessionData.conversation.push({
      timestamp: new Date(),
      user: userInput,
      assistant: assistantResponse,
      state: this.sessionData.state,
      ...metadata
    });
  }
  
  addDecision(decision, context = {}) {
    this.sessionData.decisions.push({
      timestamp: new Date(),
      decision,
      context,
      state: this.sessionData.state
    });
  }
  
  setState(newState) {
    console.log(`🔄 Session state: ${this.sessionData.state} → ${newState}`);
    this.sessionData.state = newState;
  }
  
  // Helper method to extract mood for Notion
  extractMoodFromAnalysis(moodEnergy) {
    if (!moodEnergy) return 'Neutral';
    
    const moodText = moodEnergy.toLowerCase();
    
    if (moodText.includes('positive') || moodText.includes('high') || moodText.includes('energetic') || moodText.includes('excited')) {
      return 'Positive';
    } else if (moodText.includes('low') || moodText.includes('tired') || moodText.includes('difficult') || moodText.includes('struggle')) {
      return 'Low';
    } else if (moodText.includes('focused') || moodText.includes('engaged') || moodText.includes('ready')) {
      return 'Focused';
    } else {
      return 'Neutral';
    }
  }

  // Enhanced session summary generation
  generateSessionSummary(analysis) {
    try {
      const commitmentCount = analysis.commitments?.length || 0;
      const decisionCount = analysis.key_decisions?.length || 0;
      const outcome = analysis.session_outcome || 'completed';
      const mood = this.extractMoodFromAnalysis(analysis.mood_energy);
      
      if (commitmentCount > 0 && decisionCount > 0) {
        return `${outcome} session: ${commitmentCount} commitments, ${decisionCount} decisions. Mood: ${mood}`;
      } else if (commitmentCount > 0) {
        return `${outcome} session: ${commitmentCount} commitments made. Mood: ${mood}`;
      } else {
        return `${outcome} session completed. Mood: ${mood}`;
      }
    } catch (error) {
      console.error('Error generating session summary:', error);
      return 'Morning coaching session completed';
    }
  }
  
  // Feature 3: Enhanced logging to Mongo + Notion - CONSOLIDATED METHOD
  async endSession() {
    try {
      console.log('🏁 Ending session, analyzing conversation...');
      
      // Mark session as ended to prevent double logging
      this.sessionData.state = 'ended';
      
      // Check if this was a real conversation or just voicemail/short interaction
      const conversationLength = this.sessionData.conversation.length;
      const userMessages = this.sessionData.conversation.filter(msg => msg.user && msg.user.trim().length > 5);
      
      console.log(`📊 Conversation analysis: ${conversationLength} total exchanges, ${userMessages.length} meaningful user messages`);
      
      let sessionAnalysis;
      
      // Only do LLM analysis for real conversations
      if (userMessages.length >= 2 && conversationLength >= 3) {
        try {
          console.log('🧠 Real conversation detected, running LLM analysis...');
          sessionAnalysis = await analyzeSession(
            this.sessionData.conversation,
            this.sessionData.decisions
          );
          console.log('✅ Session analysis successful:', sessionAnalysis);
        } catch (analysisError) {
          console.error('❌ Session analysis failed:', analysisError);
          sessionAnalysis = this.createBasicFallbackAnalysis();
        }
      } else {
        console.log('⚠️ Short/minimal conversation detected, using basic analysis');
        sessionAnalysis = this.createMinimalSessionAnalysis(userMessages);
      }
      
      const sessionRecord = {
        ...this.sessionData,
        endTime: new Date(),
        duration: Math.floor((new Date() - this.sessionData.startTime) / 60000), // minutes
        sessionAnalysis,
        userId: 'defaultUser',
        callSid: this.callSid
      };
      
      // Save to MongoDB (detailed technical log)
      try {
        await memory.insertOne({
          ...sessionRecord,
          type: 'enhanced_coaching_session',
          source: 'morningCoach'
        });
        console.log('✅ Successfully saved to MongoDB');
      } catch (mongoError) {
        console.error('❌ MongoDB save failed:', mongoError);
      }
      
      // Save to Notion with better error handling and validation
      if (process.env.NOTION_LOGS_DB_ID && process.env.NOTION_API_KEY) {
        try {
          console.log('💾 Attempting to save to Notion...');
          
          const notionData = {
            summary: this.generateSessionSummary(sessionAnalysis),
            goals: sessionAnalysis.commitments?.map(c => c.task).join(', ') || 'No specific goals set',
            mood: this.extractMoodFromAnalysis(sessionAnalysis.mood_energy),
            duration: sessionRecord.duration
          };
          
          console.log('📋 Notion data prepared:', notionData);
          
          const notionResult = await notionClient.logMorningSession(process.env.NOTION_LOGS_DB_ID, notionData);
          
          if (notionResult && notionResult.id) {
            console.log('✅ Successfully saved to Notion:', notionResult.id);
          } else {
            console.log('⚠️ Notion save returned no ID, might have failed');
          }
          
        } catch (notionError) {
          console.error('❌ Notion save failed:', notionError);
          // Log the specific error for debugging
          if (notionError.response) {
            console.error('Notion API Response:', await notionError.response.text());
          }
        }
      } else {
        console.log('⚠️ Notion not configured (missing NOTION_LOGS_DB_ID or NOTION_API_KEY)');
      }
      
      console.log('✅ Session ending process complete');
      return sessionRecord;
      
    } catch (error) {
      console.error('❌ Error ending session:', error);
      
      // Even if everything fails, return a basic session record
      return {
        callSid: this.callSid,
        startTime: this.sessionData.startTime,
        endTime: new Date(),
        duration: Math.floor((new Date() - this.sessionData.startTime) / 60000),
        error: 'Session ended with errors',
        conversation: this.sessionData.conversation,
        decisions: this.sessionData.decisions
      };
    }
  }
  
  // Create analysis for minimal/short sessions (likely voicemail or hang-ups)
  createMinimalSessionAnalysis(userMessages) {
    const firstMessage = userMessages[0]?.user || '';
    
    // Check if this looks like voicemail response
    if (/^\d+\.?$/.test(firstMessage) || firstMessage.length < 10) {
      return {
        key_decisions: ['Minimal interaction - likely voicemail or technical issue'],
        commitments: [{
          task: 'No meaningful commitments made',
          timeframe: 'N/A'
        }],
        mood_energy: 'Unknown - insufficient interaction',
        session_outcome: 'brief'
      };
    }
    
    return {
      key_decisions: ['Brief check-in completed'],
      commitments: [{
        task: 'Quick morning check-in',
        timeframe: 'Session'
      }],
      mood_energy: 'Brief but engaged',
      session_outcome: 'brief'
    };
  }
  
  // Create basic fallback when LLM fails
  createBasicFallbackAnalysis() {
    return {
      key_decisions: ['Session completed with technical difficulties'],
      commitments: [{
        task: 'Morning check-in attempted',
        timeframe: 'Session duration'
      }],
      mood_energy: 'Unable to analyze due to technical issues',
      session_outcome: 'brief'
    };
  }
  
  async getRecentSessions(days = 7) {
    try {
      const since = new Date();
      since.setDate(since.getDate() - days);
      
      return await memory.find({
        type: 'enhanced_coaching_session',
        startTime: { $gte: since }
      }).sort({ startTime: -1 }).toArray();
      
    } catch (error) {
      console.error('Error fetching recent sessions:', error);
      return [];
    }
  }
  
  buildContext(recentSessions) {
    if (!recentSessions.length) return '';
    
    const lastSession = recentSessions[0];
    const patterns = this.analyzePatterns(recentSessions);
    
    return `Recent pattern: ${patterns}. Last session: ${lastSession.sessionAnalysis?.session_outcome || 'unknown'}.`;
  }
  
  analyzePatterns(sessions) {
    const outcomes = sessions.map(s => s.sessionAnalysis?.session_outcome).filter(Boolean);
    const moods = sessions.map(s => s.sessionAnalysis?.mood_energy).filter(Boolean);
    
    if (outcomes.filter(o => o === 'productive').length > outcomes.length / 2) {
      return 'strong execution';
    }
    
    if (moods.filter(m => m.includes('low')).length > moods.length / 2) {
      return 'energy management needed';
    }
    
    return 'steady progress';
  }
}

// Global session storage (in production, you'd use Redis or similar)
const activeSessions = new Map();

export function getSession(callSid) {
  if (!activeSessions.has(callSid)) {
    activeSessions.set(callSid, new SessionManager(callSid));
  }
  return activeSessions.get(callSid);
}

export async function endSession(callSid) {
  const session = activeSessions.get(callSid);
  if (session) {
    const result = await session.endSession();
    activeSessions.delete(callSid);
    return result;
  }
  return null;
}