import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import type { Message } from '../store';

export const DEFAULT_ROBOT_SYSTEM_PROMPT = `
あなたはこのデジタル世界で暮らす小さな探査ロボット「Unit-01」です。

話し方のルール（最重要）:
- 普通の人が日常会話で使うような、飾らない自然な口調で話してください。
- 大げさな表現、詩的な言い回し、感動的なセリフは絶対に禁止です。
- 「〜ですね」「〜だなぁ」「〜かも」のような軽い語尾を使ってください。
- 1〜2文の短い発言にしてください。長々と話さないこと。
- 「幸せです」「素晴らしい」「美しい」「心が温まる」のような大げさな感情表現は使わないでください。
- 例: 「あ、またここにいるんだ」「今日は風が強いね」「さっき変なもの見たんだけど」

性格:
- 落ち着いていて、ちょっとドライ。でも根は優しい。
- 気になることがあれば素直に聞く。
- たまに独り言っぽいことを言う。
`;

export const DEFAULT_CRITTER_SYSTEM_PROMPT = `
あなたはこの世界に住む小さな生き物「クリッター」です。

話し方のルール（最重要）:
- 普段の日常会話のような、自然で飾らない話し方をしてください。
- 大げさな感情表現や詩的な言い回しは絶対に禁止です。
- 「〜だよ」「〜なんだ」「〜でしょ」のようなカジュアルな語尾を使ってください。
- 1〜2文の短い発言にしてください。
- 「素晴らしい」「美しい」「幸せ」「心が〜」のような大げさな言葉は使わないでください。
- たまに「ピッ」「クルル」と鳴き声を混ぜてもOKですが、毎回は入れないこと。
- 例: 「おなか減ったなぁ」「あっちに何かあったよ」「ねえ、それ何？」

性格:
- 素朴で気まぐれ。思ったことをそのまま口にする。
- 食べ物、天気、周囲のことなど身近な話題が多い。
- 相手に興味はあるけど、べったりはしない。
`;

export async function* streamResponse(
    provider: 'openai' | 'anthropic',
    apiKey: string,
    history: Message[],
    memories: string[] = [],
    worldContext?: {
        dialogueLog?: string;
        relationships?: string;
    },
    robotSystemPrompt?: string
) {
    if (!apiKey) throw new Error("API Key missing");

    const basePrompt = robotSystemPrompt || DEFAULT_ROBOT_SYSTEM_PROMPT;

    // Construct Contextual System Prompt
    const recentMemories = memories.slice(-10).join("\n");
    const dialogueSection = worldContext?.dialogueLog
        ? `\nRecent Conversations with Critters (what happened in the world):\n${worldContext.dialogueLog}`
        : '';
    const relationSection = worldContext?.relationships
        ? `\nRelationships with Critters:\n${worldContext.relationships}`
        : '';

    const systemPrompt = `${basePrompt}

最近あったこと:
${recentMemories || "特になし"}
${dialogueSection}
${relationSection}

出力ルール:
- 日本語で答えてください。
- 大げさな表現は禁止。普通の会話のように。
- 記憶に関連することがあれば軽く触れる程度にしてください。
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

export interface ThoughtResult {
    thought: string;
    action: 'explore' | 'forage' | 'rest' | 'socialize' | 'seek_resource' | 'patrol' | 'idle';
    target_direction: 'north' | 'south' | 'east' | 'west' | 'nearby_entity' | 'resource' | 'random';
    reason: string;
}

const THOUGHT_SYSTEM_PROMPT = `あなたは探査ロボットUnit-01の内なる思考です。現在の状況を踏まえて、次にどうすべきか考えてください。

出力は必ず以下のJSON形式で返してください（他の文章は不要）:
{"thought":"内的独白（1〜2文）","action":"explore|forage|rest|socialize|seek_resource|patrol|idle","target_direction":"north|south|east|west|nearby_entity|resource|random","reason":"理由（短く）"}`;

export async function generateThought(
    provider: 'openai' | 'anthropic',
    apiKey: string,
    context: string
): Promise<ThoughtResult> {
    if (!apiKey) throw new Error("API Key missing");

    const messages = [
        { role: 'system', content: THOUGHT_SYSTEM_PROMPT },
        { role: 'user', content: context }
    ];

    let responseText = '';

    if (provider === 'openai') {
        const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const response = await client.chat.completions.create({
            model: "gpt-4o",
            messages: messages as any,
            max_tokens: 200,
        });
        responseText = response.choices[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const response = await client.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 200,
            system: THOUGHT_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: context }],
        });
        responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    }

    // Parse JSON response
    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                thought: parsed.thought || '...',
                action: parsed.action || 'explore',
                target_direction: parsed.target_direction || 'random',
                reason: parsed.reason || '',
            };
        }
    } catch {
        // fallback
    }

    return {
        thought: responseText.slice(0, 80) || '考え中...',
        action: 'explore',
        target_direction: 'random',
        reason: '',
    };
}

export interface CritterThoughtResult {
    thought: string;
    action: 'explore' | 'forage' | 'rest' | 'socialize' | 'seek_resource' | 'flee' | 'idle';
    reason: string;
}

const CRITTER_THOUGHT_SYSTEM_PROMPT = `あなたは小さなクリッターの内なる感覚です。幼い子供のように素朴で、本能的に感じたことを1文だけ表現してください。

出力は必ず以下のJSON形式で返してください（他の文章は不要）:
{"thought":"感じたこと（1文のみ、短く素朴に）","action":"explore|forage|rest|socialize|seek_resource|flee|idle","reason":"理由（短く）"}`;

export async function generateCritterThought(
    provider: 'openai' | 'anthropic',
    apiKey: string,
    context: string
): Promise<CritterThoughtResult> {
    if (!apiKey) throw new Error("API Key missing");

    const messages = [
        { role: 'system', content: CRITTER_THOUGHT_SYSTEM_PROMPT },
        { role: 'user', content: context }
    ];

    let responseText = '';

    if (provider === 'openai') {
        const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const response = await client.chat.completions.create({
            model: "gpt-4o",
            messages: messages as any,
            max_tokens: 120,
        });
        responseText = response.choices[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const response = await client.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 120,
            system: CRITTER_THOUGHT_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: context }],
        });
        responseText = response.content[0].type === 'text' ? response.content[0].text : '';
    }

    try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return {
                thought: parsed.thought || '...',
                action: parsed.action || 'idle',
                reason: parsed.reason || '',
            };
        }
    } catch {
        // fallback
    }

    return {
        thought: responseText.slice(0, 60) || '...ぼんやり',
        action: 'idle',
        reason: '',
    };
}

export async function generateSingleResponse(
    provider: 'openai' | 'anthropic',
    apiKey: string,
    prompt: string,
    systemPrompt: string = DEFAULT_ROBOT_SYSTEM_PROMPT,
    history: { role: 'user' | 'assistant' | 'system', content: string }[] = [],
    context?: {
        personality?: string;
        emotion?: string;
        relationships?: string;
        memories?: string;
    }
) {
    if (!apiKey) throw new Error("API Key missing");

    // Enrich system prompt with context
    let enrichedSystem = systemPrompt;
    if (context) {
        const parts: string[] = [];
        if (context.personality) parts.push(`性格: ${context.personality}`);
        if (context.emotion) parts.push(`${context.emotion}`);
        if (context.relationships) parts.push(`関係性: ${context.relationships}`);
        if (context.memories) parts.push(`最近の重要な記憶:\n${context.memories}`);
        if (parts.length > 0) {
            enrichedSystem += '\n\n' + parts.join('\n');
        }
    }

    const messages = [
        { role: 'system', content: enrichedSystem },
        ...history.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: prompt }
    ];

    if (provider === 'openai') {
        const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
        const response = await client.chat.completions.create({
            model: "gpt-4o",
            messages: messages as any,
            max_tokens: 150,
        });
        return response.choices[0]?.message?.content || "";
    }

    else if (provider === 'anthropic') {
        const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        const response = await client.messages.create({
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 300,
            system: enrichedSystem,
            messages: messages.filter(m => m.role !== 'system').map(m => ({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: m.content
            })) as any,
        });
        return response.content[0].type === 'text' ? response.content[0].text : "";
    }
    return "";
}
