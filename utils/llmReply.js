import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function llmReply(history) {
  const res = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: history,
    temperature: 0.7
  });

  return res.choices[0].message.content.trim();
}