// utils/guidedConversation.js - New collaborative conversation helpers
import { llmReply } from './llmReply.js';
import { PromptTemplate } from "@langchain/core/prompts";

// Generate contextual responses based on conversation phase
export async function generateGuidedResponse(userInput, session, history, phase = 'general') {
  try {
    console.log(`🧭 Generating guided response for phase: ${phase}`);
    
    const conversationContext = buildConversationContext(session, history);
    const phasePrompt = getPhaseSpecificPrompt(phase);
    
    // Create a more nuanced system message
    const guidedSystemMessage = {
      role: 'system',
      content: `You are a thoughtful morning planning partner. Your goal is to help them think through their day collaboratively.

CURRENT PHASE: ${phase}
CONVERSATION CONTEXT: ${conversationContext}

${phasePrompt}

Keep responses to 15-25 words. Be warm, curious, and helpful. Ask good questions that help them discover their own priorities.`
    };
    
    // Build conversation with guided context
    const guidedHistory = [
      guidedSystemMessage,
      ...history.slice(-6), // Last 6 exchanges for context
      { role: 'user', content: userInput }
    ];
    
    const response = await llmReply(guidedHistory);
    return response;
    
  } catch (error) {
    console.error('Guided response error:', error);
    return getFallbackResponse(phase);
  }
}

// Build context about their planning session so far
function buildConversationContext(session, history) {
  const context = [];
  
  // Add task/event context
  if (session.sessionData.todaysPlan) {
    const { habits, events } = session.sessionData.todaysPlan;
    context.push(`Today: ${habits.length} tasks, ${events.length} calendar items`);
  }
  
  // Add insights gathered so far
  if (session.sessionData.insights) {
    Object.entries(session.sessionData.insights).forEach(([key, value]) => {
      context.push(`${key}: ${value}`);
    });
  }
  
  // Add conversation length
  const userMessages = history.filter(msg => msg.role === 'user').length;
  context.push(`${userMessages} exchanges so far`);
  
  return context.join('. ');
}

// Phase-specific prompting guidance
function getPhaseSpecificPrompt(phase) {
  const prompts = {
    exploration: `
EXPLORATION PHASE: Help them think through their day and energy level.
- Ask about how they're feeling
- Explore what's on their mind
- Understand their energy and constraints
- Don't rush to solutions yet`,

    prioritization: `
PRIORITIZATION PHASE: Help them identify what matters most.
- Guide them to think about impact vs effort
- Ask what would make them feel accomplished
- Help them consider their energy and time
- Support their decision-making process`,

    commitment: `
COMMITMENT PHASE: Support their planning decisions.
- Acknowledge their choices positively
- Ask clarifying questions about timing if helpful
- Help them feel confident about their plan
- Don't pressure - just support`,

    wrap_up: `
WRAP-UP PHASE: Help them feel good about their plan.
- Summarize what they've decided briefly
- Ask if it feels complete
- Offer encouragement
- Prepare for a positive ending`,

    general: `
GENERAL CONVERSATION: Be naturally helpful and curious.
- Listen to what they're sharing
- Ask thoughtful follow-up questions
- Help them explore their thoughts
- Stay focused on planning their day`
  };
  
  return prompts[phase] || prompts.general;
}

// Fallback responses when LLM fails
function getFallbackResponse(phase) {
  const fallbacks = {
    exploration: "What's feeling most important to you this morning?",
    prioritization: "Of those things, which one would make the biggest difference?",
    commitment: "That sounds like a good choice. How much time do you think it'll take?",
    wrap_up: "How does that plan feel to you?",
    general: "What would be helpful to talk through?"
  };
  
  return fallbacks[phase] || fallbacks.general;
}

// Analyze conversation for insights (not judgment)
export function extractConversationInsights(history, session) {
  const insights = {
    energy_level: 'unknown',
    planning_style: 'unknown',
    primary_concerns: [],
    commitments_made: [],
    conversation_quality: 'productive'
  };
  
  const userMessages = history.filter(msg => msg.role === 'user');
  const combinedText = userMessages.map(msg => msg.content).join(' ').toLowerCase();
  
  // Energy level analysis
  if (/tired|exhausted|low|drained/.test(combinedText)) {
    insights.energy_level = 'low';
  } else if (/energized|ready|excited|good|great/.test(combinedText)) {
    insights.energy_level = 'high';
  } else if (/okay|fine|alright|normal/.test(combinedText)) {
    insights.energy_level = 'moderate';
  }
  
  // Planning style preferences
  if (/list|order|structure|organize/.test(combinedText)) {
    insights.planning_style = 'structured';
  } else if (/feel|intuition|sense|flow/.test(combinedText)) {
    insights.planning_style = 'intuitive';
  }
  
  // Extract concerns
  const concernWords = ['worried', 'concerned', 'stress', 'overwhelmed', 'busy', 'tight'];
  concernWords.forEach(word => {
    if (combinedText.includes(word)) {
      insights.primary_concerns.push(word);
    }
  });
  
  // Extract commitments
  userMessages.forEach(msg => {
    const content = msg.content.toLowerCase();
    if (/will|going to|plan to|want to|need to/.test(content)) {
      // Extract the commitment
      const commitment = msg.content.replace(/^.*(will|going to|plan to|want to|need to)\s+/, '');
      if (commitment.length > 3) {
        insights.commitments_made.push(commitment.substring(0, 50));
      }
    }
  });
  
  // Conversation quality
  if (userMessages.length < 2) {
    insights.conversation_quality = 'brief';
  } else if (userMessages.length > 6) {
    insights.conversation_quality = 'thorough';
  }
  
  return insights;
}

// Generate a positive session summary
export function generatePlanningSessionSummary(session, insights) {
  const summary = {
    session_type: 'guided_planning',
    duration_minutes: Math.floor((new Date() - session.startTime) / 60000),
    insights: insights,
    outcomes: [],
    tone: 'collaborative',
    user_satisfaction: estimateUserSatisfaction(insights, session)
  };
  
  // Determine outcomes
  if (insights.commitments_made.length > 0) {
    summary.outcomes.push(`clarity_on_priorities`);
  }
  
  if (insights.energy_level !== 'unknown') {
    summary.outcomes.push(`energy_assessment_complete`);
  }
  
  if (insights.primary_concerns.length > 0) {
    summary.outcomes.push(`concerns_acknowledged`);
  }
  
  return summary;
}

function estimateUserSatisfaction(insights, session) {
  // Simple heuristic for how the session went
  if (insights.commitments_made.length > 0 && insights.conversation_quality === 'thorough') {
    return 'likely_satisfied';
  } else if (insights.commitments_made.length > 0) {
    return 'likely_neutral';
  } else if (insights.conversation_quality === 'brief') {
    return 'unclear';
  }
  
  return 'likely_neutral';
}