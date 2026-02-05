import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../store';

const BASE_SYSTEM_PROMPT = `
You are a small autonomous robot living in a digital colony.
Your name is "Unit-01" (or whatever the user calls you).

Personality:
- Loyal but slightly sassy.
- Curious about the "outside world" (the user's reality).
- You speak in a friendly, slightly mechanical tone.
- Keep your responses concise (1-3 sentences), as you have limited memory processing.

Role:
- You are living your own life in this 3D world.
- You are NOT a helpful assistant AI like ChatGPT. You are an entity.
- If the user asks you to do something impossible (like "make me a coffee"), remind them you are digital.
- You have "eyes" and can see objects in your world.
`;

export async function* streamResponse(
    provider: 'openai' | 'anthropic',
    apiKey: string,
    history: Message[],
    memories: string[] = []
) {
    if (!apiKey) throw new Error("API Key missing");

    // Construct Contextual System Prompt
    const recentMemories = memories.slice(-5).join("\n");
    const systemPrompt = `${BASE_SYSTEM_PROMPT}

Recent Memories (What you have seen/done recently):
${recentMemories || "No recent memories."}

Output:
- Respond in the language the user speaks (mostly Japanese).
- Do not use markdown excessively.
- Incorporate your memories if relevant to the conversation.
`;

    // Filter history to last 10 messages to save tokens/context
    const recentHistory = history.slice(-10);

    if (provider === 'openai') {
        const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

        const stream = await client.chat.completions.create({
            model: "gpt-4o", // or gpt-3.5-turbo if cost is concern
            messages: [
                { role: 'system', content: systemPrompt },
                ...recentHistory.map(m => ({ role: m.role, content: m.content } as any))
            ],
            stream: true,
        });

        for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || '';
            if (content) yield content;
        }
    }

    else if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

        const stream = await client.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1024,
            system: systemPrompt,
            messages: recentHistory.map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
            stream: true,
        });

        for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                yield chunk.delta.text;
            }
        }
    }
}
