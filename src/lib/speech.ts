/**
 * 音声読み上げユーティリティ
 * ElevenLabs API 対応 + Web Speech API フォールバック
 */

import { useStore } from '../store';

// --- ElevenLabs TTS ---

const elevenLabsQueue: Array<{ text: string; voiceId: string; isRobot: boolean }> = [];
let isElevenLabsPlaying = false;
let currentAudio: HTMLAudioElement | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let queueGeneration = 0; // race condition guard
let audioContext: AudioContext | null = null;

// Premade voices (free tier OK, multilingual v2 = Japanese対応)
const DEFAULT_ROBOT_VOICE = 'onwK4e9ZLuTAKqWW03F9';  // Daniel: deep British male
const DEFAULT_CRITTER_VOICE = 'jBpfuIE2acCO8z3wKNLl'; // Gigi: childish young female

function getAudioContext(): AudioContext {
    if (!audioContext) {
        audioContext = new AudioContext();
    }
    return audioContext;
}

async function playWithAudioElement(arrayBuffer: ArrayBuffer): Promise<void> {
    const blob = new Blob([arrayBuffer], { type: 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(blob);
    const audio = new Audio();
    currentAudio = audio;
    audio.preload = 'auto';

    return new Promise<void>((resolve, reject) => {
        audio.onended = () => {
            URL.revokeObjectURL(blobUrl);
            if (currentAudio === audio) currentAudio = null;
            resolve();
        };
        audio.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            if (currentAudio === audio) currentAudio = null;
            const err = audio.error;
            reject(new Error(`MediaError code=${err?.code} ${err?.message || ''}`));
        };
        audio.src = blobUrl;
        audio.play().catch((e) => {
            URL.revokeObjectURL(blobUrl);
            if (currentAudio === audio) currentAudio = null;
            reject(e);
        });
    });
}

async function playWithAudioContext(arrayBuffer: ArrayBuffer): Promise<void> {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        await ctx.resume();
    }
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);
    currentSource = source;

    return new Promise<void>((resolve) => {
        source.onended = () => {
            if (currentSource === source) currentSource = null;
            resolve();
        };
        source.start(0);
    });
}

async function speakElevenLabs(text: string, voiceId: string, isRobot: boolean): Promise<void> {
    const state = useStore.getState();
    const apiKey = state.elevenLabsKey.trim();
    if (!apiKey) return;

    const defaultVoice = isRobot ? DEFAULT_ROBOT_VOICE : DEFAULT_CRITTER_VOICE;
    const resolvedVoiceId = (voiceId || defaultVoice).trim();
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${resolvedVoiceId}?output_format=mp3_44100_128`;

    console.log(`[ElevenLabs] Requesting TTS: voice=${resolvedVoiceId}, text="${text.slice(0, 40)}..."`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '(could not read body)');
        console.error(`[ElevenLabs] API error: ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[ElevenLabs] Received audio: ${arrayBuffer.byteLength} bytes`);

    if (arrayBuffer.byteLength === 0) {
        throw new Error('ElevenLabs returned empty audio');
    }

    // Try Audio element first, fall back to AudioContext
    try {
        await playWithAudioElement(arrayBuffer);
        console.log('[ElevenLabs] Playback finished (Audio element)');
    } catch (audioErr) {
        console.warn('[ElevenLabs] Audio element failed, trying AudioContext:', audioErr);
        await playWithAudioContext(arrayBuffer);
        console.log('[ElevenLabs] Playback finished (AudioContext fallback)');
    }
}

async function processElevenLabsQueue(): Promise<void> {
    if (isElevenLabsPlaying) return;
    isElevenLabsPlaying = true;
    const gen = ++queueGeneration;

    while (elevenLabsQueue.length > 0 && gen === queueGeneration) {
        const item = elevenLabsQueue.shift()!;
        try {
            await speakElevenLabs(item.text, item.voiceId, item.isRobot);
        } catch (e) {
            console.warn('[ElevenLabs] Playback failed, falling back to Web Speech:', e);
            speakWebSpeech(item.text, item.isRobot);
        }
    }

    if (gen === queueGeneration) {
        isElevenLabsPlaying = false;
    }
}

// --- OpenAI TTS ---

const openaiQueue: Array<{ text: string; isRobot: boolean }> = [];
let isOpenaiPlaying = false;
let openaiQueueGeneration = 0;

async function speakOpenai(text: string, isRobot: boolean): Promise<void> {
    const state = useStore.getState();
    const apiKey = state.apiKey.trim();
    if (!apiKey) return;

    const voice = isRobot
        ? (state.openaiRobotVoice || 'onyx')
        : (state.openaiCritterVoice || 'nova');
    const url = 'https://api.openai.com/v1/audio/speech';

    console.log(`[OpenAI TTS] Requesting: voice=${voice}, text="${text.slice(0, 40)}..."`);

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: 'tts-1',
            input: text,
            voice,
            response_format: 'mp3',
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text().catch(() => '(could not read body)');
        console.error(`[OpenAI TTS] API error: ${response.status} ${response.statusText}`, errorBody);
        throw new Error(`OpenAI TTS API error: ${response.status} - ${errorBody}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`[OpenAI TTS] Received audio: ${arrayBuffer.byteLength} bytes`);

    if (arrayBuffer.byteLength === 0) {
        throw new Error('OpenAI TTS returned empty audio');
    }

    try {
        await playWithAudioElement(arrayBuffer);
        console.log('[OpenAI TTS] Playback finished (Audio element)');
    } catch (audioErr) {
        console.warn('[OpenAI TTS] Audio element failed, trying AudioContext:', audioErr);
        await playWithAudioContext(arrayBuffer);
        console.log('[OpenAI TTS] Playback finished (AudioContext fallback)');
    }
}

async function processOpenaiQueue(): Promise<void> {
    if (isOpenaiPlaying) return;
    isOpenaiPlaying = true;
    const gen = ++openaiQueueGeneration;

    while (openaiQueue.length > 0 && gen === openaiQueueGeneration) {
        const item = openaiQueue.shift()!;
        try {
            await speakOpenai(item.text, item.isRobot);
        } catch (e) {
            console.warn('[OpenAI TTS] Playback failed, falling back to Web Speech:', e);
            speakWebSpeech(item.text, item.isRobot);
        }
    }

    if (gen === openaiQueueGeneration) {
        isOpenaiPlaying = false;
    }
}

// --- Web Speech API (fallback) ---

/**
 * 最適な日本語ボイスを探す
 */
const getBestJapaneseVoice = (voices: SpeechSynthesisVoice[]) => {
    const priority = [
        "Google 日本語",
        "Microsoft Nanami Online",
        "Microsoft Keita Online",
        "Microsoft Nanami",
        "Kyoko",
        "Otoya"
    ];

    const jaVoices = voices.filter(v => v.lang.startsWith('ja'));

    for (const name of priority) {
        const found = jaVoices.find(v => v.name.includes(name));
        if (found) return found;
    }

    return jaVoices[0] || null;
};

function speakWebSpeech(text: string, isRobot: boolean): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        console.warn("Speech synthesis not supported in this browser.");
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);

    if (isRobot) {
        utterance.pitch = 0.85;
        utterance.rate = 1.0;
        utterance.volume = 1.0;
    } else {
        utterance.pitch = 1.15;
        utterance.rate = 1.0;
        utterance.volume = 0.95;
    }

    const setVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const bestVoice = getBestJapaneseVoice(voices);
        if (bestVoice) {
            utterance.voice = bestVoice;
        }
        window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = () => {
            setVoice();
            window.speechSynthesis.onvoiceschanged = null;
        };
    } else {
        setVoice();
    }
}

// --- Public API ---

/**
 * テキストを読み上げる
 * ElevenLabs key がセットされていれば ElevenLabs API を使用、
 * 空の場合は Web Speech API にフォールバック
 */
export const speak = (text: string, isRobot: boolean): void => {
    const state = useStore.getState();
    const provider = state.ttsProvider || 'web';

    switch (provider) {
        case 'openai':
            if (state.apiKey) {
                openaiQueue.push({ text, isRobot });
                processOpenaiQueue();
            } else {
                speakWebSpeech(text, isRobot);
            }
            break;
        case 'elevenlabs':
            if (state.elevenLabsKey) {
                const voiceId = isRobot ? state.robotVoiceId : state.critterVoiceId;
                elevenLabsQueue.push({ text, voiceId, isRobot });
                processElevenLabsQueue();
            } else {
                speakWebSpeech(text, isRobot);
            }
            break;
        default:
            speakWebSpeech(text, isRobot);
    }
};

/**
 * 全ての発話を停止し、キューもクリアする
 */
export const stopAllSpeech = (): void => {
    // Stop OpenAI TTS
    openaiQueue.length = 0;
    openaiQueueGeneration++;
    isOpenaiPlaying = false;

    // Stop ElevenLabs
    elevenLabsQueue.length = 0;
    queueGeneration++;
    isElevenLabsPlaying = false;
    if (currentAudio) {
        currentAudio.pause();
        currentAudio.removeAttribute('src');
        currentAudio.load();
        currentAudio = null;
    }
    if (currentSource) {
        try { currentSource.stop(); } catch { /* already stopped */ }
        currentSource = null;
    }

    // Stop Web Speech API
    if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
};
