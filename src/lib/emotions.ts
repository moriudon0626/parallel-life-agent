// Emotion System - 5-dimensional emotion vector for all entities

export interface EmotionState {
  happiness: number;   // -1.0 to 1.0
  curiosity: number;   // 0.0 to 1.0
  fear: number;        // 0.0 to 1.0
  anger: number;       // 0.0 to 1.0
  energy: number;      // 0.0 to 1.0
}

export type EmotionEvent =
  | 'positive_dialogue'
  | 'negative_dialogue'
  | 'quarrel'
  | 'encounter_friend'
  | 'encounter_stranger'
  | 'encounter_enemy'
  | 'resting'
  | 'exploring'
  | 'weather_rain'
  | 'weather_snow'
  | 'weather_sunny'
  | 'night_time'
  | 'dawn'
  | 'hunger_low'
  | 'sick'
  | 'entity_died'
  | 'new_birth';

export const DEFAULT_EMOTION: EmotionState = {
  happiness: 0.3,
  curiosity: 0.5,
  fear: 0.1,
  anger: 0.0,
  energy: 0.7,
};

// Personality index to initial emotion mapping
const PERSONALITY_EMOTIONS: EmotionState[] = [
  // 0: energetic (やんちゃで元気)
  { happiness: 0.5, curiosity: 0.7, fear: 0.05, anger: 0.05, energy: 0.9 },
  // 1: cautious (臆病で慎重)
  { happiness: 0.1, curiosity: 0.3, fear: 0.5, anger: 0.0, energy: 0.4 },
  // 2: foodie (のんびり屋で食いしん坊)
  { happiness: 0.6, curiosity: 0.4, fear: 0.05, anger: 0.0, energy: 0.6 },
  // 3: territorial (少し生意気、縄張り意識)
  { happiness: 0.2, curiosity: 0.4, fear: 0.1, anger: 0.3, energy: 0.6 },
];

// Event → emotion delta table
const EVENT_DELTAS: Record<EmotionEvent, Partial<EmotionState>> = {
  positive_dialogue:  { happiness: 0.15, curiosity: 0.1,  fear: -0.05, anger: -0.05, energy: -0.02 },
  negative_dialogue:  { happiness: -0.1, curiosity: -0.05, fear: 0.05,  anger: 0.1,   energy: -0.03 },
  quarrel:            { happiness: -0.2, curiosity: -0.1,  fear: 0.1,   anger: 0.3,   energy: -0.05 },
  encounter_friend:   { happiness: 0.1,  curiosity: 0.05, fear: -0.1,  anger: -0.05, energy: 0.02 },
  encounter_stranger: { happiness: 0.0,  curiosity: 0.15, fear: 0.05,  anger: 0.0,   energy: 0.0 },
  encounter_enemy:    { happiness: -0.1, curiosity: -0.05, fear: 0.2,   anger: 0.15,  energy: 0.05 },
  resting:            { happiness: 0.02, curiosity: -0.02, fear: -0.05, anger: -0.05, energy: 0.08 },
  exploring:          { happiness: 0.03, curiosity: 0.05, fear: -0.02, anger: -0.02, energy: -0.03 },
  weather_rain:       { happiness: -0.03, curiosity: 0.0,  fear: 0.02,  anger: 0.01,  energy: -0.02 },
  weather_snow:       { happiness: 0.02, curiosity: 0.05, fear: 0.01,  anger: 0.0,   energy: -0.03 },
  weather_sunny:      { happiness: 0.03, curiosity: 0.01, fear: -0.02, anger: -0.01, energy: 0.02 },
  night_time:         { happiness: -0.01, curiosity: -0.03, fear: 0.03,  anger: 0.0,   energy: -0.05 },
  dawn:               { happiness: 0.05, curiosity: 0.03, fear: -0.03, anger: -0.02, energy: 0.08 },
  hunger_low:          { happiness: -0.1, curiosity: -0.05, fear: 0.05,  anger: 0.1,   energy: -0.05 },
  sick:                { happiness: -0.15, curiosity: -0.1, fear: 0.1,   anger: 0.0,   energy: -0.1 },
  entity_died:         { happiness: -0.3, curiosity: 0.0,  fear: 0.15,  anger: 0.0,   energy: -0.05 },
  new_birth:           { happiness: 0.3,  curiosity: 0.15, fear: -0.05, anger: -0.1,  energy: 0.05 },
};

// Resting emotion state (decay target)
const REST_STATE: EmotionState = {
  happiness: 0.2,
  curiosity: 0.3,
  fear: 0.05,
  anger: 0.0,
  energy: 0.5,
};

function clampEmotion(state: EmotionState): EmotionState {
  return {
    happiness: Math.max(-1, Math.min(1, state.happiness)),
    curiosity: Math.max(0, Math.min(1, state.curiosity)),
    fear: Math.max(0, Math.min(1, state.fear)),
    anger: Math.max(0, Math.min(1, state.anger)),
    energy: Math.max(0, Math.min(1, state.energy)),
  };
}

export function createEmotionState(personalityIndex?: number): EmotionState {
  if (personalityIndex !== undefined && personalityIndex >= 0 && personalityIndex < PERSONALITY_EMOTIONS.length) {
    return { ...PERSONALITY_EMOTIONS[personalityIndex] };
  }
  return { ...DEFAULT_EMOTION };
}

export function applyEmotionEvent(state: EmotionState, event: EmotionEvent, intensity: number = 1.0): EmotionState {
  const deltas = EVENT_DELTAS[event];
  if (!deltas) return state;
  return clampEmotion({
    happiness: state.happiness + (deltas.happiness || 0) * intensity,
    curiosity: state.curiosity + (deltas.curiosity || 0) * intensity,
    fear: state.fear + (deltas.fear || 0) * intensity,
    anger: state.anger + (deltas.anger || 0) * intensity,
    energy: state.energy + (deltas.energy || 0) * intensity,
  });
}

export function decayEmotions(state: EmotionState, deltaSeconds: number): EmotionState {
  const rate = 0.01; // ~70s half-life
  const factor = 1 - Math.exp(-rate * deltaSeconds);
  return clampEmotion({
    happiness: state.happiness + (REST_STATE.happiness - state.happiness) * factor,
    curiosity: state.curiosity + (REST_STATE.curiosity - state.curiosity) * factor,
    fear: state.fear + (REST_STATE.fear - state.fear) * factor,
    anger: state.anger + (REST_STATE.anger - state.anger) * factor,
    energy: state.energy + (REST_STATE.energy - state.energy) * factor,
  });
}

export function getDominantEmotion(state: EmotionState): string {
  const mapped: [string, number][] = [
    ['happiness', state.happiness],
    ['curiosity', state.curiosity],
    ['fear', state.fear],
    ['anger', state.anger],
  ];
  mapped.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return mapped[0][0];
}

export function emotionToColor(state: EmotionState, baseColor: string): string {
  // Parse base color hex
  const r0 = parseInt(baseColor.slice(1, 3), 16) / 255;
  const g0 = parseInt(baseColor.slice(3, 5), 16) / 255;
  const b0 = parseInt(baseColor.slice(5, 7), 16) / 255;

  // Blend based on dominant emotions
  let r = r0, g = g0, b = b0;

  // Anger shifts toward red
  const angerInfluence = state.anger * 0.3;
  r += angerInfluence;
  g -= angerInfluence * 0.5;
  b -= angerInfluence * 0.5;

  // Fear shifts toward blue-purple
  const fearInfluence = state.fear * 0.25;
  r -= fearInfluence * 0.3;
  g -= fearInfluence * 0.3;
  b += fearInfluence;

  // Happiness shifts toward warm yellow
  const happyInfluence = Math.max(0, state.happiness) * 0.2;
  r += happyInfluence;
  g += happyInfluence * 0.8;
  b -= happyInfluence * 0.3;

  // Curiosity shifts toward green
  const curiosityInfluence = state.curiosity * 0.15;
  g += curiosityInfluence;

  // Low energy darkens
  const energyFactor = 0.6 + state.energy * 0.4;
  r *= energyFactor;
  g *= energyFactor;
  b *= energyFactor;

  // Clamp
  r = Math.max(0, Math.min(1, r));
  g = Math.max(0, Math.min(1, g));
  b = Math.max(0, Math.min(1, b));

  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function emotionToSpeedMultiplier(state: EmotionState): number {
  // High fear + low energy = frozen (0.3). High energy + curiosity = excited (1.5)
  const fearPenalty = state.fear * 0.5; // up to -0.5
  const energyBonus = state.energy * 0.5; // up to +0.5
  const curiosityBonus = state.curiosity * 0.3; // up to +0.3
  const angerBonus = state.anger * 0.2; // up to +0.2 (adrenaline)
  const mult = 0.7 + energyBonus + curiosityBonus + angerBonus - fearPenalty;
  return Math.max(0.3, Math.min(1.5, mult));
}

export function emotionToDialogueContext(state: EmotionState): string {
  const parts: string[] = [];
  if (state.happiness > 0.5) parts.push('機嫌がいい');
  else if (state.happiness < -0.3) parts.push('ちょっと落ち込んでる');

  if (state.curiosity > 0.6) parts.push('気になることがある');
  if (state.fear > 0.4) parts.push('ちょっとびびってる');
  if (state.anger > 0.4) parts.push('イライラしてる');
  if (state.energy < 0.3) parts.push('眠い');

  if (parts.length === 0) parts.push('普通');
  return `気分: ${parts.join('、')}`;
}

// Check if emotion changed significantly (for throttled store updates)
export function emotionChanged(a: EmotionState, b: EmotionState, threshold: number = 0.005): boolean {
  return (
    Math.abs(a.happiness - b.happiness) > threshold ||
    Math.abs(a.curiosity - b.curiosity) > threshold ||
    Math.abs(a.fear - b.fear) > threshold ||
    Math.abs(a.anger - b.anger) > threshold ||
    Math.abs(a.energy - b.energy) > threshold
  );
}
