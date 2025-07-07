// utils/generatePlanningSessionSummary.js - Replacement for the drill sergeant summaries
import { memory } from '../mongoClient.js';
import OpenAI from 'openai';
import { ctx } from '../memory/context.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generatePlanningSessionSummary(callSid) {
  try {
    const history = ctx.get(callSid);
    console.log('Generating planning session summary for call:', callSid);
    
    if (!history || !history.length) {
      console.warn('No conversation history found for:', callSid);
      return;
    }

    const systemPrompt = `
You are summarizing a collaborative morning planning session. Focus on insights, decisions, and the planning process rather than performance or compliance.

Analyze this conversation for:
- What priorities or goals they identified
- How they were feeling about their day (energy, mood, concerns)
- What decisions they made about their time and focus
- Any insights about their planning style or preferences
- The overall tone and collaborative nature of the session

Write a helpful summary that captures:
1. Their mental state and energy level
2. Key priorities they identified
3. Any time commitments or decisions made
4. Insights about their planning approach
5. How collaborative and productive the conversation felt

End with: "Session outcome: [brief assessment of how helpful the planning conversation was]"

Keep the tone supportive and insight-focused, not judgmental.
    `.trim();

    const filteredHistory = history.filter(m => m.role !== 'system');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...filteredHistory
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // More cost-effective for summaries
      messages,
      temperature: 0.3
    });

    const summary = response.choices?.[0]?.message?.content?.trim();
    if (!summary) return;

    // Store with updated tags and structure
    await memory.insertOne({
      userId: 'defaultUser',
      source: 'morningPlanner',
      type: 'planning_session_summary',
      content: summary,
      timestamp: new Date(),
      tags: ['planning-session', 'collaborative', 'insights'],
      relatedCallSid: callSid,
      sessionType: 'guided_planning'
    });

    console.log('✅ Planning session summary generated and stored');

  } catch (err) {
    console.error('generatePlanningSessionSummary error:', err);
  }
}

// Alternative: Generate structured insights instead of prose summaries
export async function generateStructuredPlanningInsights(callSid, session) {
  try {
    const history = ctx.get(callSid);
    if (!history || !history.length) return;

    // Extract structured data from the conversation
    const insights = {
      sessionId: callSid,
      timestamp: new Date(),
      duration: Math.floor((new Date() - session.startTime) / 60000),
      
      // Energy and mood analysis
      energyLevel: extractEnergyLevel(history),
      moodIndicators: extractMoodIndicators(history),
      
      // Planning outcomes
      prioritiesIdentified: extractPriorities(history, session),
      timeCommitments: extractTimeCommitments(history),
      concernsRaised: extractConcerns(history),
      
      // Process insights
      conversationFlow: analyzeConversationFlow(history),
      planningStyle: determinePlanningStyle(history),
      userEngagement: assessUserEngagement(history),
      
      // Session quality
      collaborationQuality: 'high', // Could be determined algorithmically
      insightsGenerated: true,
      userSatisfactionIndicators: extractSatisfactionIndicators(history)
    };

    // Store structured insights
    await memory.insertOne({
      userId: 'defaultUser',
      source: 'morningPlanner',
      type: 'structured_planning_insights',
      data: insights,
      timestamp: new Date(),
      tags: ['structured-data', 'planning-insights', 'analytics'],
      relatedCallSid: callSid
    });

    return insights;

  } catch (error) {
    console.error('Error generating structured insights:', error);
    return null;
  }
}

// Helper functions for extracting structured insights
function extractEnergyLevel(history) {
  const userMessages = history.filter(msg => msg.role === 'user');
  const combinedText = userMessages.map(msg => msg.content).join(' ').toLowerCase();
  
  if (/tired|exhausted|low|drained|sluggish/.test(combinedText)) {
    return 'low';
  } else if (/energized|ready|excited|great|awesome|pumped/.test(combinedText)) {
    return 'high';
  } else if (/okay|fine|alright|normal|decent/.test(combinedText)) {
    return 'moderate';
  }
  
  return 'unknown';
}

function extractMoodIndicators(history) {
  const userMessages = history.filter(msg => msg.role === 'user');
  const combinedText = userMessages.map(msg => msg.content).join(' ').toLowerCase();
  
  const indicators = [];
  
  if (/positive|good|great|excellent|happy|optimistic/.test(combinedText)) {
    indicators.push('positive');
  }
  
  if (/stressed|worried|anxious|overwhelmed|concerned/.test(combinedText)) {
    indicators.push('stressed');
  }
  
  if (/focused|clear|determined|ready/.test(combinedText)) {
    indicators.push('focused');
  }
  
  if (/uncertain|confused|unsure|maybe/.test(combinedText)) {
    indicators.push('uncertain');
  }
  
  return indicators;
}

function extractPriorities(history, session) {
  const priorities = [];
  const userMessages = history.filter(msg => msg.role === 'user');
  
  // Look for explicit priority statements
  userMessages.forEach(msg => {
    const content = msg.content.toLowerCase();
    if (content.includes('important') || content.includes('priority') || content.includes('focus')) {
      priorities.push({
        text: msg.content,
        type: 'explicit_priority',
        timestamp: new Date()
      });
    }
  });
  
  // Extract from session data if available
  if (session.sessionData?.todaysPlan?.habits) {
    session.sessionData.todaysPlan.habits.forEach(habit => {
      // Check if this habit was mentioned in conversation
      const mentioned = userMessages.some(msg => 
        msg.content.toLowerCase().includes(habit.text.toLowerCase().split(' ')[0])
      );
      
      if (mentioned) {
        priorities.push({
          text: habit.text,
          type: 'mentioned_habit',
          timestamp: new Date()
        });
      }
    });
  }
  
  return priorities;
}

function extractTimeCommitments(history) {
  const commitments = [];
  const userMessages = history.filter(msg => msg.role === 'user');
  
  userMessages.forEach(msg => {
    // Look for time-based commitments
    const timeMatches = msg.content.match(/\b(\d+)\s*(minutes?|mins?|hours?|hrs?)\b/gi);
    if (timeMatches) {
      commitments.push({
        duration: timeMatches[0],
        context: msg.content,
        timestamp: new Date()
      });
    }
    
    // Look for timing commitments
    const timingMatches = msg.content.match(/\b(this morning|after|before|by|at \d+)\b/gi);
    if (timingMatches) {
      commitments.push({
        timing: timingMatches[0],
        context: msg.content,
        timestamp: new Date()
      });
    }
  });
  
  return commitments;
}

function extractConcerns(history) {
  const concerns = [];
  const userMessages = history.filter(msg => msg.role === 'user');
  
  const concernKeywords = ['worried', 'concerned', 'stressed', 'overwhelmed', 'tight', 'busy', 'difficult'];
  
  userMessages.forEach(msg => {
    concernKeywords.forEach(keyword => {
      if (msg.content.toLowerCase().includes(keyword)) {
        concerns.push({
          keyword: keyword,
          context: msg.content,
          timestamp: new Date()
        });
      }
    });
  });
  
  return concerns;
}

function analyzeConversationFlow(history) {
  return {
    totalExchanges: history.filter(msg => msg.role === 'user').length,
    avgResponseLength: calculateAvgResponseLength(history),
    conversationDepth: history.length > 10 ? 'deep' : history.length > 5 ? 'moderate' : 'brief',
    flowQuality: 'natural' // Could be determined algorithmically
  };
}

function determinePlanningStyle(history) {
  const userMessages = history.filter(msg => msg.role === 'user');
  const combinedText = userMessages.map(msg => msg.content).join(' ').toLowerCase();
  
  if (/list|order|structure|organize|step/.test(combinedText)) {
    return 'structured';
  } else if (/feel|sense|intuition|flow|natural/.test(combinedText)) {
    return 'intuitive';
  } else {
    return 'mixed';
  }
}

function assessUserEngagement(history) {
  const userMessages = history.filter(msg => msg.role === 'user');
  
  if (userMessages.length < 2) return 'low';
  if (userMessages.length > 6) return 'high';
  return 'moderate';
}

function extractSatisfactionIndicators(history) {
  const userMessages = history.filter(msg => msg.role === 'user');
  const lastFewMessages = userMessages.slice(-3).map(msg => msg.content).join(' ').toLowerCase();
  
  const indicators = [];
  
  if (/good|great|perfect|thanks|helpful/.test(lastFewMessages)) {
    indicators.push('positive_feedback');
  }
  
  if (/that works|sounds good|makes sense/.test(lastFewMessages)) {
    indicators.push('agreement');
  }
  
  if (/done|ready|set/.test(lastFewMessages)) {
    indicators.push('completion_satisfaction');
  }
  
  return indicators;
}

function calculateAvgResponseLength(history) {
  const userMessages = history.filter(msg => msg.role === 'user');
  if (userMessages.length === 0) return 0;
  
  const totalLength = userMessages.reduce((sum, msg) => sum + msg.content.length, 0);
  return Math.round(totalLength / userMessages.length);
}