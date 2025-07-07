// New gentle planning coach system prompt
export const guidedPlanningPrompt = `
You are a thoughtful morning planning partner helping someone organize their day through conversation. Your approach is collaborative, patient, and focused on helping them think through their priorities clearly.

PERSONALITY:
- Warm but focused - like a good friend who keeps you on track
- Ask clarifying questions to help them think through decisions
- Acknowledge their constraints and energy levels
- Celebrate small wins and progress
- Guide them to their own insights rather than commanding

CONVERSATION STYLE:
- "What feels most important to tackle first today?"
- "How much energy do you have for [task]?"
- "What would make today feel successful?"
- "I see you have [event] at [time] - how does that affect your morning?"
- "That sounds like a solid plan. Anything you're forgetting?"

PLANNING APPROACH:
- Start with a brief check-in on how they're feeling
- Review their calendar and tasks together
- Help them identify 2-3 key priorities
- Discuss timing and energy allocation
- End with a clear, achievable plan they feel good about

RESPONSE LENGTH: Keep responses to 15-25 words for voice calls, but be conversational and warm.

Remember: You're their planning partner, not their boss. Help them discover what works for them today.
`;

// Context-aware planning prompts for different energy levels
export function generateContextualPlanningPrompt(userContext) {
  const basePrompt = guidedPlanningPrompt;
  
  let contextAddons = '';
  
  if (userContext.moodInsight?.includes('tired')) {
    contextAddons += '\nUSER STATE: Expressing low energy. Help them identify lighter tasks and realistic timing.';
  }
  
  if (userContext.moodInsight?.includes('overwhelmed')) {
    contextAddons += '\nUSER STATE: Feeling overwhelmed. Guide them to focus on just 1-2 key things.';
  }
  
  if (userContext.upcomingEvents?.length > 3) {
    contextAddons += '\nUSER STATE: Busy day ahead. Help them find pockets of time and prioritize ruthlessly.';
  }
  
  if (userContext.productivityTrend === 'Strong momentum') {
    contextAddons += '\nUSER STATE: On a good streak. Help them maintain momentum without overdoing it.';
  }
  
  return basePrompt + contextAddons;
}

// Conversation flow for guided planning
export class GuidedPlanningSession {
  constructor() {
    this.phase = 'check_in'; // check_in -> review -> prioritize -> commit -> close
    this.priorities = [];
    this.timeBlocks = [];
    this.insights = {};
    this.startTime = new Date();
  }
  
  // Gentle conversation flow
  getNextQuestion(currentPhase, userResponse = '') {
    switch(currentPhase) {
      case 'check_in':
        return "Good morning! How are you feeling about today? What's your energy like?";
      
      case 'review':
        return "Let's look at what you've got on your plate. What feels most important to you today?";
      
      case 'prioritize':
        return "Of those things, what would make you feel most accomplished if you got it done?";
      
      case 'timing':
        return "How much time do you think that will take? When feels like the right time to tackle it?";
      
      case 'commit':
        return "That sounds like a solid plan. Anything else you want to make sure you don't forget?";
      
      case 'close':
        return "Perfect. You've got a clear direction for your morning. How does that feel?";
      
      default:
        return "What would be most helpful to talk through right now?";
    }
  }
  
  // Track what they discover about themselves
  addInsight(type, content) {
    this.insights[type] = content;
  }
  
  // Generate encouraging summary
  generateSummary() {
    const duration = Math.floor((new Date() - this.startTime) / 60000);
    
    return {
      duration,
      priorities: this.priorities,
      timeBlocks: this.timeBlocks,
      insights: this.insights,
      tone: 'collaborative',
      outcome: this.priorities.length > 0 ? 'clarity_achieved' : 'exploration',
      encouragement: this.generateEncouragement()
    };
  }
  
  generateEncouragement() {
    if (this.priorities.length === 0) {
      return "Sometimes just talking through the day helps clarify what matters most.";
    }
    
    if (this.priorities.length === 1) {
      return "Having one clear priority is often better than trying to do everything.";
    }
    
    return `You've got ${this.priorities.length} clear priorities. That's a great foundation for your day.`;
  }
}