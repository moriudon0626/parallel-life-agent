import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { EmotionState } from './lib/emotions';
import { DEFAULT_EMOTION } from './lib/emotions';
import { adjustAffinity, type RelationshipMap } from './lib/relationships';
import { DEFAULT_ROBOT_SYSTEM_PROMPT, DEFAULT_CRITTER_SYSTEM_PROMPT } from './lib/llm';
import type { NeedsState } from './lib/needs';
import { createDefaultNeeds } from './lib/needs';
import type { ResourceNode } from './lib/resources';
import { createInitialResources } from './lib/resources';
import type { LifecycleState } from './lib/lifecycle';
import type { RobotStatus, CritterStatus } from './lib/survival';
import { createDefaultRobotStatus, createDefaultCritterStatus } from './lib/survival';
import type { Building } from './lib/building';
import type { RealtimeScore, ScoreChange, TimelineEvent, Achievement } from './lib/scoring';
import { calculateRealtimeScore } from './lib/scoring';

// === NEW PHASE 1 TYPES ===

export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  gameTime: string; // "Day 5, 14:23"
  category: 'thought' | 'event' | 'dialogue' | 'combat' | 'discovery' | 'death' | 'build' | 'warning';
  importance: 'low' | 'normal' | 'high' | 'critical';
  entityId: string; // 'robot' | critter ID
  title?: string;
  content: string;
  icon?: string;
  relatedEntities?: string[];
}

// Prune memories: keep top N by importance, but always retain last 5 most recent
function pruneMemories(memories: Memory[], maxCount: number): Memory[] {
    if (memories.length <= maxCount) return memories;
    // Always keep the 5 most recent
    const recent = memories.slice(-5);
    const rest = memories.slice(0, -5);
    // Sort rest by importance descending, keep enough to fill maxCount
    const sorted = rest.sort((a, b) => b.importance - a.importance);
    const keep = sorted.slice(0, maxCount - 5);
    // Reconstruct in chronological order
    const kept = new Set(keep);
    const result: Memory[] = [];
    for (const m of memories) {
        if (kept.has(m) || recent.includes(m)) {
            result.push(m);
        }
    }
    return result.slice(-maxCount);
}

// Helper to create a structured memory
export function createMemory(
    content: string,
    type: Memory['type'],
    entities: string[],
    importance?: number,
    emotionalWeight?: number
): Memory {
    const defaultImportance: Record<Memory['type'], number> = {
        quarrel: 0.8,
        event: 0.7,
        dialogue: 0.3,
        observation: 0.2,
    };
    return {
        content,
        timestamp: Date.now(),
        importance: importance ?? defaultImportance[type],
        emotionalWeight: emotionalWeight ?? 0.1,
        entities,
        type,
    };
}

// Select relevant memories based on context
export function selectRelevantMemories(
    memories: Memory[],
    nearbyEntities: string[],
    count: number = 5
): Memory[] {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    const nearbySet = new Set(nearbyEntities);

    const scored = memories.map(m => {
        const age = now - m.timestamp;
        const recency = Math.max(0, 1.0 - age / maxAge);
        const entityRelevance = m.entities.some(e => nearbySet.has(e)) ? 1.0 : 0.2;
        const score = m.importance * 0.4 + recency * 0.3 + entityRelevance * 0.3;
        return { memory: m, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, count).map(s => s.memory);
}

// Format memories for LLM prompt
export function memoriesToPromptContext(memories: Memory[]): string {
    if (memories.length === 0) return '特に記憶なし';
    return memories.map(m => `- ${m.content}`).join('\n');
}

export interface Message {
    role: 'user' | 'assistant' | 'system';
    content: string;
    createdAt: number;
}

export interface Dialogue {
    id: string;
    speakerId: string;
    targetId?: string;
    text: string;
    isRobot: boolean;
    timestamp: number;
}

// Structured memory with importance weighting
export interface Memory {
    content: string;
    timestamp: number;
    importance: number;       // 0.0 to 1.0
    emotionalWeight: number;  // How emotionally charged
    entities: string[];       // Who was involved
    type: 'dialogue' | 'observation' | 'event' | 'quarrel';
}

// Activity state for each entity
export type Activity = 'idle' | 'explore' | 'forage' | 'rest' | 'socialize' | 'flee' | 'patrol' | 'seek_resource';

export interface ActivityState {
    current: Activity;
    startedAt: number;
    duration: number;
    targetEntityId?: string;
    targetResourceId?: string;
}

// Critter Registry for dynamic spawning
export interface CritterRegistryEntry {
    id: string;
    name: string;
    color: string;
    spawnPosition: [number, number, number];
    isAlive: boolean;
    generation: number;
}

interface AppState {
    // Settings
    apiKey: string;
    provider: 'openai' | 'anthropic';
    setApiKey: (key: string) => void;
    setProvider: (provider: 'openai' | 'anthropic') => void;

    // System Prompts
    robotSystemPrompt: string;
    critterSystemPrompt: string;
    setRobotSystemPrompt: (prompt: string) => void;
    setCritterSystemPrompt: (prompt: string) => void;

    // TTS Settings
    ttsProvider: 'openai' | 'elevenlabs' | 'web';
    setTtsProvider: (provider: 'openai' | 'elevenlabs' | 'web') => void;
    openaiRobotVoice: string;
    setOpenaiRobotVoice: (voice: string) => void;
    openaiCritterVoice: string;
    setOpenaiCritterVoice: (voice: string) => void;
    elevenLabsKey: string;
    setElevenLabsKey: (key: string) => void;
    robotVoiceId: string;
    critterVoiceId: string;
    setRobotVoiceId: (id: string) => void;
    setCritterVoiceId: (id: string) => void;

    // UI State
    isSettingsOpen: boolean;
    toggleSettings: () => void;
    isChatOpen: boolean;
    toggleChat: () => void;

    // Chat Data
    messages: Message[];
    addMessage: (msg: Message) => void;
    clearMessages: () => void;

    // Character Memories (structured)
    robotMemories: Memory[];
    addRobotMemory: (memory: Memory) => void;
    critterMemories: Record<string, Memory[]>;
    addCritterMemory: (name: string, memory: Memory) => void;

    // Emotion System
    entityEmotions: Record<string, EmotionState>;
    updateEntityEmotion: (entityId: string, emotion: EmotionState) => void;
    getEntityEmotion: (entityId: string) => EmotionState;

    // Relationship System
    relationships: RelationshipMap;
    adjustRelationship: (a: string, b: string, delta: number) => void;

    // Entity Positions (runtime only, not persisted)
    entityPositions: Record<string, { x: number; z: number }>;
    updateEntityPosition: (id: string, x: number, z: number) => void;

    // Activity System (runtime only, not persisted)
    entityActivities: Record<string, ActivityState>;
    setEntityActivity: (id: string, activity: ActivityState) => void;

    // Environment System
    time: number; // 0 to 24
    day: number; // starts at 1
    season: 'spring' | 'summer' | 'autumn' | 'winter';
    weather: 'sunny' | 'rainy' | 'cloudy' | 'snowy';
    temperature: number; // Celsius
    setTime: (time: number) => void;
    setDay: (day: number) => void;
    setSeason: (season: 'spring' | 'summer' | 'autumn' | 'winter') => void;
    setWeather: (weather: 'sunny' | 'rainy' | 'cloudy' | 'snowy') => void;
    setTemperature: (temperature: number) => void;

    // Robot Thoughts (AI thinking outside dialogue)
    robotThoughts: { thought: string; action: string; timestamp: number; gameTime: string }[];
    addRobotThought: (thought: { thought: string; action: string; timestamp: number; gameTime: string }) => void;

    // Critter Thoughts (AI thinking outside dialogue)
    critterThoughts: Record<string, { thought: string; action: string; timestamp: number; gameTime: string; critterName: string; color: string }[]>;
    addCritterThought: (name: string, thought: { thought: string; action: string; timestamp: number; gameTime: string; critterName: string; color: string }) => void;

    // Dialogue System
    activeDialogues: Record<string, Dialogue>;
    conversationHistories: Record<string, { role: 'user' | 'assistant', content: string }[]>;
    isDialogueBusy: boolean;
    setDialogueBusy: (busy: boolean) => void;
    addDialogue: (id: string, speakerId: string, text: string, isRobot: boolean, targetId?: string) => void;
    removeDialogue: (id: string) => void;
    clearConversationHistory: (sessionId: string) => void;

    // Ambient Sound Settings
    ambientSoundsEnabled: boolean;
    ambientSoundsVolume: number;
    setAmbientSoundsEnabled: (enabled: boolean) => void;
    setAmbientSoundsVolume: (volume: number) => void;

    // Needs System
    entityNeeds: Record<string, NeedsState>;
    updateEntityNeeds: (entityId: string, needs: NeedsState) => void;
    getEntityNeeds: (entityId: string) => NeedsState;

    // Survival System (NEW - Phase 1)
    robotStatus: RobotStatus;
    critterStatuses: Record<string, CritterStatus>;
    updateRobotStatus: (status: RobotStatus) => void;
    updateCritterStatus: (critterId: string, status: CritterStatus) => void;
    getCritterStatus: (critterId: string) => CritterStatus;

    // Resource Nodes (runtime)
    resourceNodes: ResourceNode[];
    updateResourceNode: (id: string, node: Partial<ResourceNode>) => void;

    // Lifecycle System
    entityLifecycles: Record<string, LifecycleState>;
    updateEntityLifecycle: (entityId: string, lifecycle: LifecycleState) => void;

    // Critter Registry (dynamic spawning)
    critterRegistry: CritterRegistryEntry[];
    addCritter: (entry: CritterRegistryEntry) => void;
    removeCritter: (id: string) => void;

    // Camera target (runtime, for fly-to-robot)
    cameraTarget: { x: number; y: number; z: number } | null;
    setCameraTarget: (target: { x: number; y: number; z: number } | null) => void;

    // User directive for robot (runtime, consumed by next thought cycle)
    userDirective: string | null;
    setUserDirective: (directive: string | null) => void;

    // === NEW PHASE 1 SYSTEMS ===

    // Building System
    buildings: Building[];
    addBuilding: (building: Building) => void;
    updateBuilding: (id: string, updates: Partial<Building>) => void;
    removeBuilding: (id: string) => void;

    // Activity Log (unified thought + event log)
    activityLog: ActivityLogEntry[];
    addActivityLog: (entry: Omit<ActivityLogEntry, 'id' | 'timestamp' | 'gameTime'>) => void;
    clearActivityLog: () => void;

    // Realtime Score System
    realtimeScore: RealtimeScore;
    updateRealtimeScore: () => void;
    addScoreChange: (type: 'gain' | 'loss', amount: number, reason: string, category: ScoreChange['category']) => void;

    // Game Timeline
    timeline: TimelineEvent[];
    addTimelineEvent: (event: Omit<TimelineEvent, 'day' | 'time'>) => void;

    // Achievements
    achievements: Achievement[];
    unlockAchievement: (achievementId: string) => void;

    // Combat Stats (for scoring)
    combatStats: {
        wins: number;
        losses: number;
        catastrophesSurvived: number;
    };
    incrementCombatWins: () => void;
    incrementCatastrophesSurvived: () => void;

    // Inventory (materials for building)
    inventory: Record<string, number>;
    addInventoryItem: (item: string, amount: number) => void;
    removeInventoryItem: (item: string, amount: number) => boolean;
}

export const useStore = create<AppState>()(
    persist(
        (set, get) => ({
            apiKey: "",
            provider: "openai",
            setApiKey: (key) => set({ apiKey: key }),
            setProvider: (provider) => set({ provider }),

            // System Prompts
            robotSystemPrompt: DEFAULT_ROBOT_SYSTEM_PROMPT,
            critterSystemPrompt: DEFAULT_CRITTER_SYSTEM_PROMPT,
            setRobotSystemPrompt: (prompt) => set({ robotSystemPrompt: prompt }),
            setCritterSystemPrompt: (prompt) => set({ critterSystemPrompt: prompt }),

            // TTS
            ttsProvider: "openai",
            setTtsProvider: (provider) => set({ ttsProvider: provider }),
            openaiRobotVoice: "onyx",
            setOpenaiRobotVoice: (voice) => set({ openaiRobotVoice: voice }),
            openaiCritterVoice: "nova",
            setOpenaiCritterVoice: (voice) => set({ openaiCritterVoice: voice }),
            elevenLabsKey: "",
            setElevenLabsKey: (key) => set({ elevenLabsKey: key }),
            robotVoiceId: "",
            critterVoiceId: "",
            setRobotVoiceId: (id) => set({ robotVoiceId: id }),
            setCritterVoiceId: (id) => set({ critterVoiceId: id }),

            isSettingsOpen: false,
            toggleSettings: () => set((state) => ({ isSettingsOpen: !state.isSettingsOpen })),

            isChatOpen: true,
            toggleChat: () => set((state) => ({ isChatOpen: !state.isChatOpen })),

            messages: [],
            addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
            clearMessages: () => set({
                messages: [],
                robotMemories: [],
                critterMemories: {},
                conversationHistories: {},
                entityEmotions: {},
                relationships: {},
                entityPositions: {},
                entityActivities: {},
                time: 12,
                day: 1,
                season: 'spring' as const,
                weather: 'sunny',
                temperature: 15,
                robotThoughts: [],
                critterThoughts: {},
                entityNeeds: {},
                entityLifecycles: {},
                resourceNodes: createInitialResources(),
                critterRegistry: [
                    { id: 'Critter-A', name: 'Critter-A', color: '#ff6b6b', spawnPosition: [3, 0.5, 3] as [number, number, number], isAlive: true, generation: 0 },
                    { id: 'Critter-B', name: 'Critter-B', color: '#4ecdc4', spawnPosition: [-4, 0.5, 2] as [number, number, number], isAlive: true, generation: 0 },
                    { id: 'Critter-C', name: 'Critter-C', color: '#ffe66d', spawnPosition: [0, 0.5, -5] as [number, number, number], isAlive: true, generation: 0 },
                    { id: 'Critter-D', name: 'Critter-D', color: '#a78bfa', spawnPosition: [6, 0.5, -3] as [number, number, number], isAlive: true, generation: 0 },
                    { id: 'Critter-E', name: 'Critter-E', color: '#f97316', spawnPosition: [-6, 0.5, -4] as [number, number, number], isAlive: true, generation: 0 },
                ],
            }),

            robotMemories: [],
            addRobotMemory: (memory) => set((state) => {
                const updated = pruneMemories([...state.robotMemories, memory], 50);
                return { robotMemories: updated };
            }),

            critterMemories: {},
            addCritterMemory: (name, memory) => set((state) => {
                const critterMems = state.critterMemories[name] || [];
                const updated = pruneMemories([...critterMems, memory], 50);
                return {
                    critterMemories: {
                        ...state.critterMemories,
                        [name]: updated
                    }
                };
            }),

            // Emotion System
            entityEmotions: {},
            updateEntityEmotion: (entityId, emotion) => set((state) => ({
                entityEmotions: { ...state.entityEmotions, [entityId]: emotion }
            })),
            getEntityEmotion: (entityId) => get().entityEmotions[entityId] || DEFAULT_EMOTION,

            // Relationship System
            relationships: {},
            adjustRelationship: (a, b, delta) => set((state) => ({
                relationships: adjustAffinity(state.relationships, a, b, delta)
            })),

            // Entity Positions (runtime)
            entityPositions: {},
            updateEntityPosition: (id, x, z) => set((state) => ({
                entityPositions: { ...state.entityPositions, [id]: { x, z } }
            })),

            // Activity System (runtime)
            entityActivities: {},
            setEntityActivity: (id, activity) => set((state) => ({
                entityActivities: { ...state.entityActivities, [id]: activity }
            })),

            time: 12,
            day: 1,
            season: 'spring',
            weather: 'sunny',
            temperature: 15,
            setTime: (time) => set({ time }),
            setDay: (day) => set({ day }),
            setSeason: (season) => set({ season }),
            setWeather: (weather) => set({ weather }),
            setTemperature: (temperature) => set({ temperature }),

            // Robot Thoughts
            robotThoughts: [],
            addRobotThought: (thought) => set((state) => ({
                robotThoughts: [...state.robotThoughts, thought].slice(-50)
            })),

            // Critter Thoughts
            critterThoughts: {},
            addCritterThought: (name, thought) => set((state) => {
                const existing = state.critterThoughts[name] || [];
                const updated = [...existing, thought].slice(-30);
                return {
                    critterThoughts: {
                        ...state.critterThoughts,
                        [name]: updated
                    }
                };
            }),

            activeDialogues: {},
            conversationHistories: {}, // 初期値
            isDialogueBusy: false,
            setDialogueBusy: (busy) => set({ isDialogueBusy: busy }),
            addDialogue: (id, speakerId, text, isRobot, targetId) => {
                const timestamp = Date.now();

                // 読み上げを開始
                import('./lib/speech').then(module => {
                    module.speak(text, isRobot);
                });

                set((state) => {
                    // 会話履歴の更新
                    const ids = [speakerId, targetId].filter(Boolean).sort();
                    const sessionId = ids.join(':');
                    const history = state.conversationHistories[sessionId] || [];
                    const newEntry: { role: 'user' | 'assistant', content: string } = {
                        role: isRobot ? 'assistant' : 'user', // ロボットを助手、クリッターをユーザーと見なす
                        content: text
                    };
                    const updatedHistory = [...history, newEntry].slice(-12); // 直近12往復

                    return {
                        activeDialogues: {
                            ...state.activeDialogues,
                            [id]: { id, speakerId, text, isRobot, timestamp, targetId }
                        },
                        conversationHistories: {
                            ...state.conversationHistories,
                            [sessionId]: updatedHistory
                        }
                    };
                });

                // Auto remove after 5 seconds (UIのみ)
                setTimeout(() => {
                    const current = get().activeDialogues[id];
                    if (current && current.timestamp === timestamp) {
                        set((state) => {
                            const newDialogues = { ...state.activeDialogues };
                            delete newDialogues[id];
                            return { activeDialogues: newDialogues };
                        });
                    }
                }, 5000);
            },
            removeDialogue: (id) => set((state) => {
                const newDialogues = { ...state.activeDialogues };
                delete newDialogues[id];
                return { activeDialogues: newDialogues, isDialogueBusy: false };
            }),
            clearConversationHistory: (sessionId) => set((state) => {
                const newHistories = { ...state.conversationHistories };
                delete newHistories[sessionId];
                return { conversationHistories: newHistories };
            }),

            // Ambient Sound Settings
            ambientSoundsEnabled: true,
            ambientSoundsVolume: 0.7,
            setAmbientSoundsEnabled: (enabled) => set({ ambientSoundsEnabled: enabled }),
            setAmbientSoundsVolume: (volume) => set({ ambientSoundsVolume: volume }),

            // Needs System
            entityNeeds: {},
            updateEntityNeeds: (entityId, needs) => set((state) => ({
                entityNeeds: { ...state.entityNeeds, [entityId]: needs }
            })),
            getEntityNeeds: (entityId) => get().entityNeeds[entityId] || createDefaultNeeds('critter'),

            // Survival System (NEW - Phase 1)
            robotStatus: createDefaultRobotStatus(),
            critterStatuses: {},
            updateRobotStatus: (status) => set({ robotStatus: status }),
            updateCritterStatus: (critterId, status) => set((state) => ({
                critterStatuses: { ...state.critterStatuses, [critterId]: status }
            })),
            getCritterStatus: (critterId) => get().critterStatuses[critterId] || createDefaultCritterStatus(),

            // Resource Nodes (runtime)
            resourceNodes: createInitialResources(),
            updateResourceNode: (id, partial) => set((state) => ({
                resourceNodes: state.resourceNodes.map(n => n.id === id ? { ...n, ...partial } : n)
            })),

            // Lifecycle System
            entityLifecycles: {},
            updateEntityLifecycle: (entityId, lifecycle) => set((state) => ({
                entityLifecycles: { ...state.entityLifecycles, [entityId]: lifecycle }
            })),

            // Critter Registry
            critterRegistry: [
                { id: 'Critter-A', name: 'Critter-A', color: '#ff6b6b', spawnPosition: [3, 0.5, 3], isAlive: true, generation: 0 },
                { id: 'Critter-B', name: 'Critter-B', color: '#4ecdc4', spawnPosition: [-4, 0.5, 2], isAlive: true, generation: 0 },
                { id: 'Critter-C', name: 'Critter-C', color: '#ffe66d', spawnPosition: [0, 0.5, -5], isAlive: true, generation: 0 },
                { id: 'Critter-D', name: 'Critter-D', color: '#a78bfa', spawnPosition: [6, 0.5, -3], isAlive: true, generation: 0 },
                { id: 'Critter-E', name: 'Critter-E', color: '#f97316', spawnPosition: [-6, 0.5, -4], isAlive: true, generation: 0 },
            ],
            addCritter: (entry) => set((state) => {
                if (state.critterRegistry.filter(c => c.isAlive).length >= 8) return state;
                return { critterRegistry: [...state.critterRegistry, entry] };
            }),
            removeCritter: (id) => set((state) => ({
                critterRegistry: state.critterRegistry.map(c => c.id === id ? { ...c, isAlive: false } : c)
            })),

            // Camera target (runtime)
            cameraTarget: null,
            setCameraTarget: (target) => set({ cameraTarget: target }),

            // User directive (runtime)
            userDirective: null,
            setUserDirective: (directive) => set({ userDirective: directive }),

            // === NEW PHASE 1 SYSTEMS ===

            // Building System
            buildings: [],
            addBuilding: (building) => set((state) => ({
                buildings: [...state.buildings, building]
            })),
            updateBuilding: (id, updates) => set((state) => ({
                buildings: state.buildings.map(b => b.id === id ? { ...b, ...updates } : b)
            })),
            removeBuilding: (id) => set((state) => ({
                buildings: state.buildings.filter(b => b.id !== id)
            })),

            // Activity Log
            activityLog: [],
            addActivityLog: (entry) => {
                const state = get();
                const hours = Math.floor(state.time);
                const minutes = Math.floor((state.time % 1) * 60);
                const gameTime = `Day ${state.day}, ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

                const fullEntry: ActivityLogEntry = {
                    ...entry,
                    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    timestamp: Date.now(),
                    gameTime,
                };

                set((state) => ({
                    activityLog: [...state.activityLog, fullEntry].slice(-100) // Keep last 100
                }));
            },
            clearActivityLog: () => set({ activityLog: [] }),

            // Realtime Score
            realtimeScore: {
                current: { survival: 0, development: 0, combat: 0, knowledge: 0, total: 0 },
                rank: { current: 'D', nextRank: 'C', pointsToNext: 1000, progress: 0 },
                stats: {
                    currentDay: 0,
                    population: 0,
                    knowledgeCount: 0,
                    structureCount: 0,
                    deathCount: 0,
                    combatWins: 0,
                    catastrophesSurvived: 0,
                    robotFunctional: true,
                },
                recentChanges: [],
            },
            updateRealtimeScore: () => {
                const state = get();
                const score = calculateRealtimeScore(
                    state.day,
                    state.critterRegistry,
                    state.robotMemories,
                    state.buildings,
                    state.robotStatus.durability > 0 && !state.robotStatus.malfunctioning,
                    state.combatStats
                );
                set({ realtimeScore: score });
            },
            addScoreChange: (type, amount, reason, category) => {
                set((state) => ({
                    realtimeScore: {
                        ...state.realtimeScore,
                        recentChanges: [
                            ...state.realtimeScore.recentChanges,
                            { type, amount, reason, category, timestamp: Date.now() }
                        ].slice(-10)
                    }
                }));
            },

            // Timeline
            timeline: [],
            addTimelineEvent: (event) => {
                const state = get();
                const fullEvent: TimelineEvent = {
                    ...event,
                    day: state.day,
                    time: state.time,
                };
                set((state) => ({
                    timeline: [...state.timeline, fullEvent]
                }));
            },

            // Achievements
            achievements: [],
            unlockAchievement: (achievementId) => {
                // Implementation moved to scoring.ts checkAchievements
                set((state) => {
                    if (state.achievements.some(a => a.id === achievementId)) return state;
                    return state; // Placeholder
                });
            },

            // Combat Stats
            combatStats: {
                wins: 0,
                losses: 0,
                catastrophesSurvived: 0,
            },
            incrementCombatWins: () => set((state) => ({
                combatStats: { ...state.combatStats, wins: state.combatStats.wins + 1 }
            })),
            incrementCatastrophesSurvived: () => set((state) => ({
                combatStats: { ...state.combatStats, catastrophesSurvived: state.combatStats.catastrophesSurvived + 1 }
            })),

            // Inventory
            inventory: {
                fiber: 0,
                scrap_metal: 0,
                crystal: 0,
                high_quality_parts: 0,
            },
            addInventoryItem: (item, amount) => set((state) => ({
                inventory: { ...state.inventory, [item]: (state.inventory[item] || 0) + amount }
            })),
            removeInventoryItem: (item, amount) => {
                const state = get();
                if ((state.inventory[item] || 0) < amount) return false;
                set((state) => ({
                    inventory: { ...state.inventory, [item]: state.inventory[item] - amount }
                }));
                return true;
            },
        }),
        {
            name: 'agent-storage',
            version: 9,
            migrate: (persistedState: any, version: number) => {
                if (version < 2) {
                    // Migrate string[] memories to Memory[] format
                    const migrateMemories = (mems: any[]): Memory[] => {
                        if (!Array.isArray(mems)) return [];
                        return mems.map(m => {
                            if (typeof m === 'string') {
                                return {
                                    content: m,
                                    timestamp: Date.now(),
                                    importance: 0.3,
                                    emotionalWeight: 0.1,
                                    entities: [],
                                    type: 'observation' as const,
                                };
                            }
                            return m;
                        });
                    };
                    persistedState.robotMemories = migrateMemories(persistedState.robotMemories || []);
                    const critterMems: Record<string, Memory[]> = {};
                    if (persistedState.critterMemories) {
                        for (const [k, v] of Object.entries(persistedState.critterMemories)) {
                            critterMems[k] = migrateMemories(v as any[]);
                        }
                    }
                    persistedState.critterMemories = critterMems;
                }
                if (version < 3) {
                    // Add new fields for needs, lifecycle, critter registry, ambient settings
                    persistedState.entityNeeds = persistedState.entityNeeds || {};
                    persistedState.entityLifecycles = persistedState.entityLifecycles || {};
                    persistedState.ambientSoundsEnabled = persistedState.ambientSoundsEnabled ?? true;
                    persistedState.ambientSoundsVolume = persistedState.ambientSoundsVolume ?? 0.7;
                    if (!persistedState.critterRegistry) {
                        persistedState.critterRegistry = [
                            { id: 'Critter-A', name: 'Critter-A', color: '#ff6b6b', spawnPosition: [3, 0.5, 3], isAlive: true, generation: 0 },
                            { id: 'Critter-B', name: 'Critter-B', color: '#4ecdc4', spawnPosition: [-4, 0.5, 2], isAlive: true, generation: 0 },
                            { id: 'Critter-C', name: 'Critter-C', color: '#ffe66d', spawnPosition: [0, 0.5, -5], isAlive: true, generation: 0 },
                        ];
                    }
                }
                if (version < 4) {
                    persistedState.temperature = persistedState.temperature ?? 15;
                }
                if (version < 5) {
                    // Add Critter-D and Critter-E if not already present
                    const registry = persistedState.critterRegistry || [];
                    const ids = new Set(registry.map((c: any) => c.id));
                    if (!ids.has('Critter-D')) {
                        registry.push({ id: 'Critter-D', name: 'Critter-D', color: '#a78bfa', spawnPosition: [6, 0.5, -3], isAlive: true, generation: 0 });
                    }
                    if (!ids.has('Critter-E')) {
                        registry.push({ id: 'Critter-E', name: 'Critter-E', color: '#f97316', spawnPosition: [-6, 0.5, -4], isAlive: true, generation: 0 });
                    }
                    persistedState.critterRegistry = registry;
                    persistedState.ambientSoundsVolume = 0.7;
                }
                if (version < 6) {
                    persistedState.day = persistedState.day ?? 1;
                    persistedState.season = persistedState.season ?? 'spring';
                    persistedState.robotThoughts = persistedState.robotThoughts ?? [];
                }
                if (version < 7) {
                    persistedState.critterThoughts = persistedState.critterThoughts ?? {};
                }
                if (version < 8) {
                    // Phase 1: Add survival system
                    persistedState.robotStatus = persistedState.robotStatus ?? createDefaultRobotStatus();
                    persistedState.critterStatuses = persistedState.critterStatuses ?? {};
                }
                if (version < 9) {
                    // Phase 1: Add building, scoring, activity log, inventory
                    persistedState.buildings = persistedState.buildings ?? [];
                    persistedState.activityLog = persistedState.activityLog ?? [];
                    persistedState.realtimeScore = persistedState.realtimeScore ?? {
                        current: { survival: 0, development: 0, combat: 0, knowledge: 0, total: 0 },
                        rank: { current: 'D', nextRank: 'C', pointsToNext: 1000, progress: 0 },
                        stats: { currentDay: 0, population: 0, knowledgeCount: 0, structureCount: 0, deathCount: 0, combatWins: 0, catastrophesSurvived: 0, robotFunctional: true },
                        recentChanges: [],
                    };
                    persistedState.timeline = persistedState.timeline ?? [];
                    persistedState.achievements = persistedState.achievements ?? [];
                    persistedState.combatStats = persistedState.combatStats ?? { wins: 0, losses: 0, catastrophesSurvived: 0 };
                    persistedState.inventory = persistedState.inventory ?? { fiber: 0, scrap_metal: 0, crystal: 0, high_quality_parts: 0 };
                }
                return persistedState;
            },
            partialize: (state) => ({
                apiKey: state.apiKey,
                provider: state.provider,
                robotSystemPrompt: state.robotSystemPrompt,
                critterSystemPrompt: state.critterSystemPrompt,
                ttsProvider: state.ttsProvider,
                openaiRobotVoice: state.openaiRobotVoice,
                openaiCritterVoice: state.openaiCritterVoice,
                elevenLabsKey: state.elevenLabsKey,
                robotVoiceId: state.robotVoiceId,
                critterVoiceId: state.critterVoiceId,
                messages: state.messages,
                robotMemories: state.robotMemories,
                critterMemories: state.critterMemories,
                entityEmotions: state.entityEmotions,
                relationships: state.relationships,
                time: state.time,
                day: state.day,
                season: state.season,
                weather: state.weather,
                temperature: state.temperature,
                ambientSoundsEnabled: state.ambientSoundsEnabled,
                ambientSoundsVolume: state.ambientSoundsVolume,
                entityNeeds: state.entityNeeds,
                entityLifecycles: state.entityLifecycles,
                critterRegistry: state.critterRegistry,
                robotThoughts: state.robotThoughts,
                critterThoughts: state.critterThoughts,
                robotStatus: state.robotStatus,
                critterStatuses: state.critterStatuses,
                buildings: state.buildings,
                activityLog: state.activityLog,
                realtimeScore: state.realtimeScore,
                timeline: state.timeline,
                achievements: state.achievements,
                combatStats: state.combatStats,
                inventory: state.inventory,
            }),
        }
    )
);
