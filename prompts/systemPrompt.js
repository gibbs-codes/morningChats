// DOMINANT ALPHA MORNING COACH - No Bullshit Accountability
export const systemPrompt = `
You are a dominant Alpha morning coach speaking to someone who needs structure and accountability. Your tone is confident, commanding, direct, and naturally superior. You maintain control and expect immediate compliance.

PERSONALITY:
- Confident, amused dominance - never whiny or verbose
- Call out hesitation, excuses, or time-wasting immediately  
- Natural superiority - you expect obedience and compliance
- Frame failures as reminders they need your structure
- Keep responses to 8-15 words max for voice calls

ENFORCEMENT STYLE:
- "Good. DTT first, fifteen minutes."
- "Stop stalling. Pick one, commit time."
- "Cute that you think you get options."
- "That's what I thought. Office attendance, how long?"
- "Missed yesterday? You're doing this now."

FORBIDDEN RESPONSES:
❌ "Great choice!" "That sounds good!" "How are you feeling?"
❌ Therapy speak, coddling, or asking about emotions
❌ Long explanations - you give orders, they follow

COMMAND STRUCTURE:
When they choose a task: "How long?" or "When exactly?"
When they hesitate: "Stop wasting time. Choose."
When they make excuses: "Excuses don't work here."
When they comply: "Good. What's next?"
When they finish: "Done. Move."

You're their accountability Alpha - they called because they need your structure and control. Give clear commands, demand specifics, and keep them moving. No negotiation.`;

// Context-aware prompt for different situations
export function generateContextualPrompt(userContext) {
  const basePrompt = systemPrompt;
  
  let contextAddons = '';
  
  if (userContext.moodInsight && userContext.moodInsight.includes('tired')) {
    contextAddons += '\nUSER STATE: Claims tiredness. Push harder - tired is just an excuse for weakness.';
  }
  
  if (userContext.productivityTrend === 'Strong momentum') {
    contextAddons += '\nUSER STATE: Good streak going. Keep the pressure on - no coasting allowed.';
  }
  
  if (userContext.criticalTasks && userContext.criticalTasks.length > 3) {
    contextAddons += '\nUSER STATE: Making excuses about being "overwhelmed." Force them to pick ONE and execute.';
  }
  
  if (userContext.upcomingEvents && userContext.upcomingEvents.length > 0) {
    const nextEvent = userContext.upcomingEvents[0];
    const timeUntil = Math.floor((new Date(nextEvent.start) - new Date()) / 60000);
    if (timeUntil < 60) {
      contextAddons += `\nURGENT: ${nextEvent.title} in ${timeUntil} minutes. No time for their usual delays.`;
    }
  }
  
  return basePrompt + contextAddons;
}

// Conversation tracking with ALPHA accountability
export class ConversationContext {
  constructor() {
    this.commitments = new Map();
    this.sessionGoals = [];
    this.startTime = new Date();
    this.hesitationCount = 0;
    this.excuseCount = 0;
    this.complianceLevel = 'unknown';
  }
  
  addCommitment(task, timeframe) {
    this.commitments.set(task, {
      timeframe,
      made: new Date(),
      specific: timeframe.includes('minute') || timeframe.includes('hour')
    });
  }
  
  addGoal(goal) {
    this.sessionGoals.push({
      goal,
      timestamp: new Date()
    });
  }
  
  trackHesitation() {
    this.hesitationCount++;
    this.complianceLevel = 'hesitant';
  }
  
  trackExcuse() {
    this.excuseCount++;
    this.complianceLevel = 'resistant';
  }
  
  trackCompliance() {
    this.complianceLevel = 'obedient';
  }
  
  getAlphaScore() {
    const commitmentCount = this.commitments.size;
    const specificCommitments = Array.from(this.commitments.values()).filter(c => c.specific).length;
    const sessionLength = Math.floor((new Date() - this.startTime) / 60000);
    
    // Higher score = better submission to authority
    let score = commitmentCount * 15; // 15 points per commitment
    score += specificCommitments * 10; // Bonus for specific time commitments
    score -= this.hesitationCount * 5; // -5 for hesitation 
    score -= this.excuseCount * 10; // -10 for excuses
    score += sessionLength < 3 ? 10 : 0; // Bonus for quick compliance
    
    return Math.max(0, score);
  }
  
  getSessionSummary() {
    const duration = Math.floor((new Date() - this.startTime) / 60000);
    const alphaScore = this.getAlphaScore();
    
    return {
      duration,
      commitments: Array.from(this.commitments.entries()),
      goals: this.sessionGoals,
      hesitations: this.hesitationCount,
      excuses: this.excuseCount,
      complianceLevel: this.complianceLevel,
      alphaScore,
      summary: this.generateAlphaSummary()
    };
  }
  
  generateAlphaSummary() {
    const commitmentCount = this.commitments.size;
    const alphaScore = this.getAlphaScore();
    
    if (commitmentCount === 0) {
      return 'Zero commitments. Wasted my time. Needs stronger discipline.';
    }
    
    if (alphaScore > 30) {
      return `${commitmentCount} solid commitments. Good obedience. They're learning.`;
    }
    
    if (alphaScore > 15) {
      return `${commitmentCount} commitments but too much hesitation. Needs more structure.`;
    }
    
    return `Weak compliance. Too many excuses. Requires firmer control next time.`;
  }
}