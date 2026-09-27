import OpenAI from 'openai';
import { z } from 'zod';
import { DirectionIdea } from '../models/directionSession';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const ideasSchema = z.object({
  ideas: z.array(z.object({
    title: z.string(),
    hook: z.string(),
    platform: z.enum(['instagram', 'tiktok', 'linkedin', 'youtube', 'facebook']),
    angle: z.string(),
  })).min(5).max(5),
});

export async function generateWeeklyDirection(input: {
  happenedThisWeek: string;
  belief: string;
  audience: string;
  mode: 'teach' | 'show' | 'opinion';
}): Promise<DirectionIdea[]> {
  const completion = await openai.chat.completions.create({
    model: process.env.OPENAI_AUDIT_MODEL || 'gpt-4o-mini',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: 'You turn a creator\'s lived week into five concrete post ideas with hooks. Stay human, specific, and non-viral-hype.',
      },
      {
        role: 'user',
        content: [
          `What happened this week: ${input.happenedThisWeek}`,
          `What I believe: ${input.belief}`,
          `Who I am reaching: ${input.audience}`,
          `Mode: ${input.mode}`,
          'Return JSON: { "ideas": [{ "title", "hook", "platform", "angle" }] } with exactly 5 ideas.',
        ].join('\n'),
      },
    ],
  });

  const parsed = ideasSchema.parse(JSON.parse(completion.choices[0].message.content || '{}'));
  return parsed.ideas;
}
