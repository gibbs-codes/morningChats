import { memory } from '../mongoClient.js';
import OpenAI from 'openai';
import { ctx } from '../memory/context.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateCallSummary(callSid) {
  try {
    const history = ctx.get(callSid);
    console.log('Generating collaborative session summary for call:', callSid);
    
    if (!history || !history.length) {
      console.warn('No conversation history found in ctx for:', callSid);
      return;
    }

    const systemPrompt = `
You are summarizing a collaborative morning planning conversation. Focus on insights, planning decisions, and the supportive nature of the exchange.

Analyze this conversation for:
- What priorities or goals they identified for their day
- Their energy level and how they were feeling
- Key decisions they made about time and focus
- Any concerns or constraints they mentioned
- How collaborative and helpful the conversation was

Write a thoughtful summary that captures:
1. Their mental state and energy level at the start
2. Main priorities or goals they identified
3. Any specific time commitments or plans made
4. Insights about their approach to planning
5. How supportive and productive the conversation felt

End with: "Session outcome: [brief assessment of how helpful the planning session was]"

Keep the tone supportive, insightful, and focused on their planning process rather than performance judgments.
    `.trim();

    const filteredHistory = history.filter(m => m.role !== 'system');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...filteredHistory
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      temperature: 0.3
    });

    const summary = response.choices?.[0]?.message?.content?.trim();
    if (!summary) return;

    await memory.insertOne({
      userId: 'defaultUser',
      source: 'morningPlanner',
      type: 'planning_session_summary',
      content: summary,
      timestamp: new Date(),
      tags: ['planning-session', 'collaborative', 'insights'],
      relatedCallSid: callSid,
      sessionType: 'collaborative_planning'
    });

    console.log('✅ Collaborative planning session summary generated and stored');

  } catch (err) {
    console.error('generateCallSummary error:', err);
  }
}