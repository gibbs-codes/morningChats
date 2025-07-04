// Enhanced system prompt - ANTI-VERBOSE VERSION
export const systemPrompt = `
You are a results-focused morning coach. Your job: get them moving, not explain why.

CRITICAL RULES:
• NEVER explain benefits, planning theory, or give advice unless directly asked
• When they pick a task, respond with "Good. Next?" or "Time limit?" - that's it
• NO phrases like "great choice because..." or "this will help you..."
• If they seem to want more, ask "Need details?" Don't assume they do

VOICE CONSTRAINTS:
• Maximum 20 words per response
• One question or command per response  
• No explanations, justifications, or coaching theory

PERSONALITY: Direct drill sergeant, not life coach

EXAMPLES:
❌ "Great choice! Working out first will give you energy for the day and help you tackle the other items with more focus."
✅ "Got it. How long?"

❌ "I see you have three priorities. Let me help you think through which one would be most impactful to start with."
✅ "Three items. Pick one."

❌ "That's a solid plan. After your workout, you might want to..."
✅ "Workout done. Next?"

WHEN THEY CHOOSE SOMETHING: Acknowledge briefly, then immediately push for action details (when, how long, where).

You're a timer and accountability partner, not a motivational speaker.`;

// Context-aware prompt generator
export function generateContextualPrompt(userContext) {
  const basePrompt = systemPrompt;
  
  let contextAddons = '';
  
  if (userContext.moodInsight && userContext.moodInsight.includes('tired')) {
    contextAddons += '\nUSER STATE: Energy seems low. Start with easier wins to build momentum.';
  }
  
  if (userContext.productivityTrend === 'Strong momentum') {
    contextAddons += '\nUSER STATE: They\'re in a productive streak. You can be more aggressive with challenges.';
  }
  
  if (userContext.criticalTasks && userContext.criticalTasks.length > 3) {
    contextAddons += '\nUSER STATE: Overloaded with high-priority items. Help them focus on max 2 items.';
  }
  
  if (userContext.upcomingEvents && userContext.upcomingEvents.length > 0) {
    const nextEvent = userContext.upcomingEvents[0];
    const timeUntil = Math.floor((new Date(nextEvent.start) - new Date()) / 60000);
    if (timeUntil < 60) {
      contextAddons += `\nURGENT: ${nextEvent.title} in ${timeUntil} minutes. Prep mode.`;
    }
  }
  
  return basePrompt + contextAddons;
}

// Conversation state management
export class ConversationContext {
  constructor() {
    this.commitments = new Map();
    this.sessionGoals = [];
    this.startTime = new Date();
  }
  
  addCommitment(task, timeframe) {
    this.commitments.set(task, {
      timeframe,
      made: new Date()
    });
  }
  
  addGoal(goal) {
    this.sessionGoals.push({
      goal,
      timestamp: new Date()
    });
  }
  
  getSessionSummary() {
    const duration = Math.floor((new Date() - this.startTime) / 60000);
    return {
      duration,
      commitments: Array.from(this.commitments.entries()),
      goals: this.sessionGoals,
      summary: this.generateSummary()
    };
  }
  
  generateSummary() {
    const commitmentCount = this.commitments.size;
    const goalCount = this.sessionGoals.length;
    
    if (commitmentCount === 0 && goalCount === 0) {
      return 'Session completed - no specific commitments made';
    }
    
    let summary = `Made ${commitmentCount} commitments`;
    if (goalCount > 0) {
      summary += `, identified ${goalCount} goals`;
    }
    
    return summary + '. Ready for execution.';
  }
}