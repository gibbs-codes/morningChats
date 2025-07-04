import { memory } from '../mongoClient.js';
import OpenAI from 'openai';
import { ctx } from '../memory/context.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generateCallSummary(callSid) {
  try {
    const history = ctx.get(callSid);
    console.log('Generating summary for call:', callSid);
    console.log('Conversation history:', history);
    if (!history || !history.length) {
      console.warn('No conversation history found in ctx for:', callSid);
      return;
    }

    const systemPrompt = `
You are MorningCoach, a dominant accountability assistant overseeing the daily behavior of a locked, submissive client.
Summarize this voice coaching session with a focus on obedience, resistance, tone, task follow-through, and attitude.

Highlight:
- Any disobedience, hesitation, or excuses
- Moments of good service, honesty, or enthusiasm
- Tasks assigned or goals discussed
- Any behavior that stood out—positive or negative

End with one short final line beginning with: “Verdict: ...” that clearly states the client’s performance.
    `.trim();

    const filteredHistory = history.filter(m => m.role !== 'system');

    const messages = [
      { role: 'system', content: systemPrompt },
      ...filteredHistory
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages,
      temperature: 0.4
    });

    const summary = response.choices?.[0]?.message?.content?.trim();
    if (!summary) return;

    await memory.insertOne({
      userId: 'defaultUser',
      source: 'morningCoach',
      type: 'summary',
      content: summary,
      timestamp: new Date(),
      tags: ['call-summary', 'obedience'],
      relatedCallSid: callSid
    });

  } catch (err) {
    console.error('generateCallSummary error:', err);
  }
}