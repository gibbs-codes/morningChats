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
  
  // Feature 3: Enhanced logging to Mongo + Notion
  async endSession() {
    try {
      console.log('🏁 Ending session, analyzing conversation...');
      
      // Analyze the session with LLM
      const sessionAnalysis = await analyzeSession(
        this.sessionData.conversation,
        this.sessionData.decisions
      );
      
      const sessionRecord = {
        ...this.sessionData,
        endTime: new Date(),
        duration: Math.floor((new Date() - this.sessionData.startTime) / 60000), // minutes
        sessionAnalysis,
        userId: 'defaultUser',
        callSid: this.callSid
      };
      
      // Save to MongoDB (detailed technical log)
      await memory.insertOne({
        ...sessionRecord,
        type: 'enhanced_coaching_session',
        source: 'morningCoach'
      });
      
      // Save to Notion (user-friendly summary)
      if (process.env.NOTION_LOGS_DB_ID) {
        await notionClient.logMorningSession(process.env.NOTION_LOGS_DB_ID, {
          summary: this.generateSessionSummary(sessionAnalysis),
          goals: sessionAnalysis.commitments.map(c => c.task).join(', '),
          mood: sessionAnalysis.mood_energy,
          duration: sessionRecord.duration
        });
      }
      
      console.log('✅ Session logged to both MongoDB and Notion');
      return sessionRecord;
      
    } catch (error) {
      console.error('Error ending session:', error);
      return null;
    }
  }
  
  generateSessionSummary(analysis) {
    const commitmentCount = analysis.commitments.length;
    const decisionCount = analysis.key_decisions.length;
    
    return `${analysis.session_outcome} session: ${commitmentCount} commitments, ${decisionCount} decisions. Energy: ${analysis.mood_energy}`;
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

export function endSession(callSid) {
  const session = activeSessions.get(callSid);
  if (session) {
    activeSessions.delete(callSid);
    return session.endSession();
  }
  return null;
}