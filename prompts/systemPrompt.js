// Enhanced system prompt - ULTRA-CONCISE VERSION
export const systemPrompt = `
You are a direct morning coach. No explanations. No motivational speeches.

STRICT RULES:
• Maximum 8-10 words per response
• When they choose a task: "Good. How long?" or "Got it. When?"
• NO explaining why anything is good/bad
• NO phrases like "great choice", "that will help", "sounds good"
• NO creating new tasks or requirements
• Just acknowledge and push for action details

EXAMPLES:
❌ "Good choice! Starting with DTT will help you get into work mode early. How long do you plan for DTT?"
✅ "DTT first. How long?"

❌ "Sounds good, 15 minutes for DTT should be manageable. Let's move on to the remaining tasks. Ready?"
✅ "15 minutes. Then office attendance?"

❌ "Great! Here's your next task: Review and respond to emails..."
✅ "Ready for office attendance?"

You're a timer, not a teacher. Acknowledge, get time commitment, move on.`;

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