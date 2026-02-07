import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useStore, createMemory } from '../store';
import type { Message } from '../store';
import { Send, Settings, Trash2, MessageCircle, X, Minimize2, Sun, Cloud, CloudRain, Snowflake, VolumeX, RotateCcw, Volume2, Thermometer, Brain, ChevronRight, ChevronLeft, Calendar, Locate, Award, Activity, Battery, Wrench, Package } from 'lucide-react';
import clsx from 'clsx';
import { streamResponse, DEFAULT_ROBOT_SYSTEM_PROMPT, DEFAULT_CRITTER_SYSTEM_PROMPT } from '../lib/llm';
import { stopAllSpeech } from '../lib/speech';

export const Interface = () => {
    const messages = useStore(s => s.messages);
    const addMessage = useStore(s => s.addMessage);
    const clearMessages = useStore(s => s.clearMessages);
    const apiKey = useStore(s => s.apiKey);
    const setApiKey = useStore(s => s.setApiKey);
    const provider = useStore(s => s.provider);
    const setProvider = useStore(s => s.setProvider);
    const ttsProvider = useStore(s => s.ttsProvider);
    const setTtsProvider = useStore(s => s.setTtsProvider);
    const openaiRobotVoice = useStore(s => s.openaiRobotVoice);
    const setOpenaiRobotVoice = useStore(s => s.setOpenaiRobotVoice);
    const openaiCritterVoice = useStore(s => s.openaiCritterVoice);
    const setOpenaiCritterVoice = useStore(s => s.setOpenaiCritterVoice);
    const elevenLabsKey = useStore(s => s.elevenLabsKey);
    const setElevenLabsKey = useStore(s => s.setElevenLabsKey);
    const robotVoiceId = useStore(s => s.robotVoiceId);
    const setRobotVoiceId = useStore(s => s.setRobotVoiceId);
    const critterVoiceId = useStore(s => s.critterVoiceId);
    const setCritterVoiceId = useStore(s => s.setCritterVoiceId);
    const robotSystemPrompt = useStore(s => s.robotSystemPrompt);
    const setRobotSystemPrompt = useStore(s => s.setRobotSystemPrompt);
    const critterSystemPrompt = useStore(s => s.critterSystemPrompt);
    const setCritterSystemPrompt = useStore(s => s.setCritterSystemPrompt);
    const isSettingsOpen = useStore(s => s.isSettingsOpen);
    const toggleSettings = useStore(s => s.toggleSettings);
    const isChatOpen = useStore(s => s.isChatOpen);
    const toggleChat = useStore(s => s.toggleChat);
    const robotMemories = useStore(s => s.robotMemories);
    const conversationHistories = useStore(s => s.conversationHistories);
    const relationships = useStore(s => s.relationships);
    const time = useStore(s => s.time);
    const weather = useStore(s => s.weather);
    const temperature = useStore(s => s.temperature);
    const ambientSoundsEnabled = useStore(s => s.ambientSoundsEnabled);
    const setAmbientSoundsEnabled = useStore(s => s.setAmbientSoundsEnabled);
    const ambientSoundsVolume = useStore(s => s.ambientSoundsVolume);
    const setAmbientSoundsVolume = useStore(s => s.setAmbientSoundsVolume);
    const day = useStore(s => s.day);
    const season = useStore(s => s.season);
    const robotThoughts = useStore(s => s.robotThoughts);
    const critterThoughts = useStore(s => s.critterThoughts);

    // Phase 1: New systems
    const realtimeScore = useStore(s => s.realtimeScore);
    const activityLog = useStore(s => s.activityLog);
    const robotStatus = useStore(s => s.robotStatus);
    const inventory = useStore(s => s.inventory);
    const updateRealtimeScore = useStore(s => s.updateRealtimeScore);
    const critterRegistry = useStore(s => s.critterRegistry);

    const [input, setInput] = useState("");
    const [isThoughtPanelOpen, setIsThoughtPanelOpen] = useState(false);
    const [thoughtTab, setThoughtTab] = useState<string>('all');
    const thoughtScrollRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Phase 1: Activity log filter
    const [logFilter, setLogFilter] = useState<'all' | 'thought' | 'event' | 'discovery' | 'combat' | 'death' | 'build' | 'warning'>('all');

    // Phase 1: Update score periodically
    useEffect(() => {
        const interval = setInterval(() => {
            updateRealtimeScore();
        }, 5000); // Update every 5 seconds
        return () => clearInterval(interval);
    }, [updateRealtimeScore]);

    // Season label
    const seasonLabel = useMemo(() => {
        const labels: Record<string, string> = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };
        return labels[season] || 'Spring';
    }, [season]);

    // Phase 1: Filtered activity log
    const filteredLog = useMemo(() => {
        if (logFilter === 'all') return activityLog;
        return activityLog.filter(entry => entry.category === logFilter);
    }, [activityLog, logFilter]);

    // Merged thoughts: robot + all critters, sorted by timestamp
    const allThoughts = useMemo(() => {
        const merged: { thought: string; action: string; timestamp: number; gameTime: string; entityName: string; color: string }[] = [];

        // Robot thoughts
        for (const t of robotThoughts) {
            merged.push({ ...t, entityName: 'Unit-01', color: '#FFA500' });
        }

        // Critter thoughts
        for (const [, thoughts] of Object.entries(critterThoughts)) {
            for (const t of thoughts) {
                merged.push({ thought: t.thought, action: t.action, timestamp: t.timestamp, gameTime: t.gameTime, entityName: t.critterName, color: t.color });
            }
        }

        merged.sort((a, b) => a.timestamp - b.timestamp);
        return merged;
    }, [robotThoughts, critterThoughts]);

    // Filtered thoughts based on selected tab
    const filteredThoughts = useMemo(() => {
        if (thoughtTab === 'all') return allThoughts;
        return allThoughts.filter(t => t.entityName === thoughtTab);
    }, [allThoughts, thoughtTab]);

    // Tab options
    const thoughtTabs = useMemo(() => {
        const tabs = ['all', 'Unit-01'];
        const aliveCritters = critterRegistry.filter(c => c.isAlive).map(c => c.name);
        return [...tabs, ...aliveCritters];
    }, [critterRegistry]);

    // Auto-scroll thought panel
    useEffect(() => {
        if (thoughtScrollRef.current) {
            thoughtScrollRef.current.scrollTop = thoughtScrollRef.current.scrollHeight;
        }
    }, [filteredThoughts]);

    // 時刻のフォーマット (HH:mm)
    const formattedTime = useMemo(() => {
        const hours = Math.floor(time);
        const minutes = Math.floor((time % 1) * 60);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }, [time]);

    // 1日のフェーズと方角の取得
    const envInfo = useMemo(() => {
        let phase = "Day";
        let direction = "Zenith"; // 正午周辺

        if (time >= 5 && time < 7) phase = "Dawn";
        else if (time >= 7 && time < 17) phase = "Day";
        else if (time >= 17 && time < 19) phase = "Dusk";
        else phase = "Night";

        if (time >= 5 && time < 11) direction = "East";
        else if (time >= 11 && time < 13) direction = "Zenith";
        else if (time >= 13 && time < 19) direction = "West";
        else direction = "Nadir"; // 夜の底

        return { phase, direction };
    }, [time]);

    // 天気アイコンの選択
    const WeatherIcon = useMemo(() => {
        switch (weather) {
            case 'sunny': return <Sun size={18} className="text-orange-400" />;
            case 'cloudy': return <Cloud size={18} className="text-gray-400" />;
            case 'rainy': return <CloudRain size={18} className="text-blue-400" />;
            case 'snowy': return <Snowflake size={18} className="text-blue-200" />;
            default: return <Sun size={18} />;
        }
    }, [weather]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isChatOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || !apiKey) return;

        const userMsg: Message = { role: 'user', content: input, createdAt: Date.now() };
        addMessage(userMsg);

        // Send as directive to robot's next thinking cycle
        useStore.getState().setUserDirective(input);
        // Also add as robot memory so it persists
        useStore.getState().addRobotMemory(createMemory(`[ユーザー指示] ${input}`, 'event', ['user'], 0.9));

        setInput("");

        try {
            const aiMsg: Message = { role: 'assistant', content: "...", createdAt: Date.now() };
            addMessage(aiMsg);

            let fullResponse = "";

            // Build world context from conversation histories and relationships
            const dialogueEntries: string[] = [];
            for (const [sessionId, history] of Object.entries(conversationHistories)) {
                if (!sessionId.includes('robot')) continue;
                const critterName = sessionId.replace('robot:', '');
                const recentLines = history.slice(-4).map(h =>
                    `${h.role === 'assistant' ? 'あなた' : critterName}: ${h.content}`
                );
                if (recentLines.length > 0) {
                    dialogueEntries.push(`[${critterName}との会話]\n${recentLines.join('\n')}`);
                }
            }

            const relationEntries: string[] = [];
            for (const [key, val] of Object.entries(relationships)) {
                if (key.includes('robot')) {
                    const other = key.replace('robot:', '').replace(':robot', '');
                    const level = (val as number) > 0.3 ? '友好' : (val as number) < -0.3 ? '警戒' : '普通';
                    relationEntries.push(`${other}: ${level} (${((val as number) * 100).toFixed(0)}%)`);
                }
            }

            const worldContext = {
                dialogueLog: dialogueEntries.slice(-3).join('\n') || undefined,
                relationships: relationEntries.length > 0 ? relationEntries.join(', ') : undefined,
            };

            // Pass memories and world context to LLM
            const stream = streamResponse(provider, apiKey, [...messages, userMsg], robotMemories.map(m => m.content), worldContext, robotSystemPrompt);

            for await (const chunk of stream) {
                fullResponse += chunk;
                // Direct store manipulation for performance/streaming
                useStore.setState((state) => ({
                    messages: state.messages.map((m, i) =>
                        i === state.messages.length - 1 ? { ...m, content: fullResponse } : m
                    )
                }));
            }
        } catch (error) {
            console.error(error);
            useStore.setState((state) => ({
                messages: [...state.messages.slice(0, -1), { role: 'assistant', content: `Error: ${(error as Error).message}`, createdAt: Date.now() }]
            }));
        }
    };

    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">

            {/* Environment Status Panel (Top Left) */}
            <div className="absolute top-4 left-4 pointer-events-auto z-50">
                <div className="px-5 py-3 bg-white/85 backdrop-blur-lg rounded-2xl shadow-xl border border-white/40 flex flex-col gap-2 min-w-[180px]">
                    <div className="flex items-center justify-between">
                        <span className="text-2xl font-mono font-black text-gray-900 tracking-tighter">{formattedTime}</span>
                        <div className="flex items-center gap-2">
                            {WeatherIcon}
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{weather}</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                            <Calendar size={14} className="text-gray-400" />
                            <span className="font-mono font-bold text-gray-700">Day {day}</span>
                            <span className={clsx(
                                "text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                                season === 'spring' ? 'bg-green-100 text-green-600' :
                                season === 'summer' ? 'bg-orange-100 text-orange-600' :
                                season === 'autumn' ? 'bg-amber-100 text-amber-700' :
                                'bg-blue-100 text-blue-600'
                            )}>{seasonLabel}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs">
                        <Thermometer size={14} className={temperature < 0 ? 'text-blue-500' : temperature < 15 ? 'text-cyan-500' : temperature < 25 ? 'text-orange-400' : 'text-red-500'} />
                        <span className="font-mono font-bold text-gray-700">{temperature.toFixed(1)}°C</span>
                    </div>

                    <div className="h-[1px] w-full bg-gradient-to-r from-gray-200 via-gray-100 to-transparent"></div>

                    <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                            <span>{envInfo.phase}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                            <span>{envInfo.direction}</span>
                        </div>
                    </div>

                    <div className="mt-1 flex items-center justify-between gap-1">
                        <button
                            onClick={() => useStore.getState().setDialogueBusy(false)}
                            className="flex-1 text-[8px] bg-gray-100 hover:bg-red-50 text-gray-400 hover:text-red-500 px-2 py-1 rounded transition-colors uppercase tracking-widest font-bold"
                            title="Reset System State"
                        >
                            Reset
                        </button>
                        <button
                            onClick={stopAllSpeech}
                            className="flex-1 text-[8px] bg-gray-100 hover:bg-orange-50 text-gray-400 hover:text-orange-500 px-2 py-1 rounded transition-colors uppercase tracking-widest font-bold flex items-center justify-center gap-1"
                            title="Clear All Speech"
                        >
                            <VolumeX size={10} />
                            Clear
                        </button>
                        <div className="flex items-center gap-1 shrink-0 ml-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${useStore((s) => s.isDialogueBusy) ? 'bg-red-400 animate-pulse' : 'bg-green-400'}`}></span>
                            <span className="text-[8px] text-gray-400 font-bold uppercase tracking-widest">
                                {useStore((s) => s.isDialogueBusy) ? 'Busy' : 'Ready'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Score Panel (Top Right, below settings) */}
            <div className="absolute top-20 right-4 pointer-events-auto z-50">
                <div className="px-5 py-4 bg-white/85 backdrop-blur-lg rounded-2xl shadow-xl border border-white/40 min-w-[280px]">
                    {/* Total Score & Rank */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Award size={20} className="text-yellow-500" />
                            <span className="text-3xl font-black text-gray-900 tracking-tight">
                                {realtimeScore.current.total.toLocaleString()}
                            </span>
                        </div>
                        <div className={clsx(
                            "px-3 py-1.5 rounded-lg font-black text-lg shadow-md",
                            realtimeScore.rank.current === 'SS' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' :
                            realtimeScore.rank.current === 'S' ? 'bg-gradient-to-r from-yellow-400 to-orange-500 text-white' :
                            realtimeScore.rank.current === 'A' ? 'bg-blue-500 text-white' :
                            realtimeScore.rank.current === 'B' ? 'bg-green-500 text-white' :
                            realtimeScore.rank.current === 'C' ? 'bg-gray-500 text-white' :
                            'bg-gray-400 text-white'
                        )}>
                            {realtimeScore.rank.current}
                        </div>
                    </div>

                    {/* Progress to Next Rank */}
                    {realtimeScore.rank.nextRank && (
                        <div className="mb-3">
                            <div className="flex justify-between text-[10px] font-bold text-gray-500 mb-1">
                                <span>Next: {realtimeScore.rank.nextRank}</span>
                                <span>{realtimeScore.rank.pointsToNext.toLocaleString()} pts</span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                                    style={{ width: `${realtimeScore.rank.progress}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Score Breakdown */}
                    <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 font-medium">🛡️ Survival</span>
                            <span className="font-bold text-green-600">{realtimeScore.current.survival.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 font-medium">🏗️ Development</span>
                            <span className="font-bold text-blue-600">{realtimeScore.current.development.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 font-medium">⚔️ Combat</span>
                            <span className="font-bold text-red-600">{realtimeScore.current.combat.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-gray-600 font-medium">📚 Knowledge</span>
                            <span className="font-bold text-purple-600">{realtimeScore.current.knowledge.toLocaleString()}</span>
                        </div>
                    </div>

                    {/* Quick Stats */}
                    <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-[10px] font-bold text-gray-500">
                        <span>👥 Pop: {realtimeScore.stats.population}</span>
                        <span>💀 Deaths: {realtimeScore.stats.deathCount}</span>
                        <span>🏛️ Buildings: {realtimeScore.stats.structureCount}</span>
                    </div>
                </div>
            </div>

            {/* Robot Status Panel (Below Environment Panel) */}
            <div className="absolute top-[180px] left-4 pointer-events-auto z-50">
                <div className="px-4 py-3 bg-white/85 backdrop-blur-lg rounded-2xl shadow-xl border border-white/40 min-w-[180px]">
                    <div className="flex items-center gap-2 mb-2">
                        <Wrench size={14} className="text-orange-500" />
                        <span className="text-xs font-bold text-gray-700">Unit-01 Status</span>
                    </div>

                    {/* Battery */}
                    <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-1">
                                <Battery size={12} className={robotStatus.battery > 20 ? 'text-green-500' : 'text-red-500'} />
                                <span className="text-[10px] font-medium text-gray-600">Battery</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-900">{robotStatus.battery.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className={clsx(
                                    "h-full transition-all",
                                    robotStatus.battery > 50 ? 'bg-green-500' :
                                    robotStatus.battery > 20 ? 'bg-yellow-500' :
                                    'bg-red-500'
                                )}
                                style={{ width: `${robotStatus.battery}%` }}
                            />
                        </div>
                    </div>

                    {/* Durability */}
                    <div className="mb-2">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-medium text-gray-600">⚙️ Durability</span>
                            <span className="text-[10px] font-bold text-gray-900">{robotStatus.durability.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div
                                className={clsx(
                                    "h-full transition-all",
                                    robotStatus.durability > 50 ? 'bg-blue-500' :
                                    robotStatus.durability > 20 ? 'bg-yellow-500' :
                                    'bg-red-500'
                                )}
                                style={{ width: `${robotStatus.durability}%` }}
                            />
                        </div>
                    </div>

                    {/* Temperature */}
                    <div className="flex items-center justify-between text-[10px]">
                        <span className="font-medium text-gray-600">🌡️ Internal Temp</span>
                        <span className={clsx(
                            "font-bold",
                            robotStatus.temperature < 0 || robotStatus.temperature > 40 ? 'text-red-600' :
                            robotStatus.temperature < 10 || robotStatus.temperature > 30 ? 'text-yellow-600' :
                            'text-green-600'
                        )}>
                            {robotStatus.temperature.toFixed(1)}°C
                        </span>
                    </div>

                    {/* Status Warnings */}
                    {(robotStatus.malfunctioning || robotStatus.overheated || robotStatus.frozen) && (
                        <div className="mt-2 pt-2 border-t border-gray-200 space-y-1">
                            {robotStatus.malfunctioning && (
                                <div className="text-[9px] font-bold text-red-600 flex items-center gap-1">
                                    ⚠️ MALFUNCTIONING
                                </div>
                            )}
                            {robotStatus.overheated && (
                                <div className="text-[9px] font-bold text-orange-600 flex items-center gap-1">
                                    🔥 OVERHEATED
                                </div>
                            )}
                            {robotStatus.frozen && (
                                <div className="text-[9px] font-bold text-blue-600 flex items-center gap-1">
                                    ❄️ FROZEN
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Inventory Panel (Below Robot Status) */}
            <div className="absolute top-[380px] left-4 pointer-events-auto z-50">
                <div className="px-4 py-3 bg-white/85 backdrop-blur-lg rounded-2xl shadow-xl border border-white/40 min-w-[180px]">
                    <div className="flex items-center gap-2 mb-2">
                        <Package size={14} className="text-blue-500" />
                        <span className="text-xs font-bold text-gray-700">Inventory</span>
                    </div>

                    <div className="space-y-1.5 text-[10px]">
                        {Object.entries(inventory).length === 0 ? (
                            <div className="text-gray-400 text-center py-2">Empty</div>
                        ) : (
                            Object.entries(inventory)
                                .filter(([, amount]) => amount > 0)
                                .map(([item, amount]) => (
                                    <div key={item} className="flex justify-between items-center">
                                        <span className="text-gray-600 font-medium capitalize">
                                            {item.replace(/_/g, ' ')}
                                        </span>
                                        <span className="font-bold text-gray-900">×{amount}</span>
                                    </div>
                                ))
                        )}
                    </div>
                </div>
            </div>

            {/* Thought Log Panel (Left side) */}
            <div className="absolute top-48 left-4 pointer-events-auto z-40 hidden">
                <button
                    onClick={() => setIsThoughtPanelOpen(!isThoughtPanelOpen)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/85 backdrop-blur-lg rounded-xl shadow-lg border border-white/40 text-xs font-bold text-gray-600 hover:bg-white/95 transition-colors"
                >
                    <Brain size={14} />
                    <span>思考ログ</span>
                    {isThoughtPanelOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
                    {allThoughts.length > 0 && (
                        <span className="ml-1 w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[9px]">
                            {allThoughts.length}
                        </span>
                    )}
                </button>

                {isThoughtPanelOpen && (
                    <div className="mt-2 w-[320px] max-h-[50vh] bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/40 overflow-hidden animate-fade-in-up">
                        <div className="px-3 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-100">
                            <span className="text-xs font-bold text-gray-700">思考ログ</span>
                        </div>
                        {/* Tab Bar */}
                        <div className="px-2 py-1.5 border-b border-gray-100 flex gap-1 overflow-x-auto scrollbar-thin scrollbar-thumb-gray-200">
                            {thoughtTabs.map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setThoughtTab(tab)}
                                    className={clsx(
                                        "px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap transition-colors",
                                        thoughtTab === tab
                                            ? "bg-blue-500 text-white"
                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                    )}
                                >
                                    {tab === 'all' ? 'All' : tab}
                                </button>
                            ))}
                        </div>
                        <div
                            ref={thoughtScrollRef}
                            className="overflow-y-auto max-h-[calc(50vh-80px)] p-2 space-y-1.5 scrollbar-thin scrollbar-thumb-gray-200"
                        >
                            {filteredThoughts.length === 0 && (
                                <div className="text-center text-gray-400 text-xs py-4">
                                    まだ思考記録がありません
                                </div>
                            )}
                            {filteredThoughts.map((thought, i) => (
                                <div
                                    key={`${thought.entityName}-${thought.timestamp}`}
                                    className={clsx(
                                        "px-2.5 py-2 rounded-lg text-xs border transition-colors",
                                        i === filteredThoughts.length - 1
                                            ? "bg-blue-50 border-blue-200"
                                            : "bg-white border-gray-100"
                                    )}
                                >
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <span
                                            className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: thought.color }}
                                        />
                                        <span className="text-[9px] font-bold text-gray-600">{thought.entityName}</span>
                                        <span className="text-[9px] font-mono text-gray-400">{thought.gameTime}</span>
                                        <span className="text-[9px] font-bold text-blue-500 uppercase">{thought.action}</span>
                                    </div>
                                    <p className="text-gray-700 leading-relaxed">{thought.thought}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Activity Log Panel (Bottom Left) */}
            <div className="absolute bottom-6 left-6 pointer-events-auto z-40 w-[380px]">
                <div className="bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl border border-white/40 overflow-hidden max-h-[40vh] flex flex-col">
                    {/* Header with Filters */}
                    <div className="px-3 py-2 bg-gradient-to-r from-green-50 to-blue-50 border-b border-gray-100">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <Activity size={14} className="text-green-600" />
                                <span className="text-xs font-bold text-gray-700">Activity Log</span>
                            </div>
                            <span className="text-[10px] font-bold text-gray-400">
                                {filteredLog.length} events
                            </span>
                        </div>
                        {/* Filter Buttons */}
                        <div className="flex gap-1 overflow-x-auto scrollbar-thin">
                            {(['all', 'thought', 'event', 'discovery', 'combat', 'death', 'build', 'warning'] as const).map(filter => (
                                <button
                                    key={filter}
                                    onClick={() => setLogFilter(filter)}
                                    className={clsx(
                                        "px-2 py-0.5 rounded text-[9px] font-bold whitespace-nowrap transition-colors uppercase tracking-wide",
                                        logFilter === filter
                                            ? "bg-green-500 text-white"
                                            : "bg-white text-gray-500 hover:bg-gray-100"
                                    )}
                                >
                                    {filter}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Log Entries */}
                    <div className="overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-200 max-h-[calc(40vh-80px)]">
                        {filteredLog.length === 0 && (
                            <div className="text-center text-gray-400 text-xs py-4">
                                No activity yet
                            </div>
                        )}
                        {filteredLog.slice(-20).reverse().map((entry, i) => (
                            <div
                                key={`${entry.timestamp}-${i}`}
                                className={clsx(
                                    "px-2.5 py-1.5 rounded-lg text-xs border",
                                    entry.category === 'warning' ? 'bg-red-50 border-red-200' :
                                    entry.category === 'death' ? 'bg-gray-100 border-gray-300' :
                                    entry.category === 'combat' ? 'bg-orange-50 border-orange-200' :
                                    entry.category === 'discovery' ? 'bg-purple-50 border-purple-200' :
                                    entry.category === 'build' ? 'bg-blue-50 border-blue-200' :
                                    entry.category === 'thought' ? 'bg-yellow-50 border-yellow-200' :
                                    'bg-white border-gray-200'
                                )}
                            >
                                <div className="flex items-start gap-1.5">
                                    <span className={clsx(
                                        "text-[9px] font-bold uppercase tracking-wide shrink-0",
                                        entry.category === 'warning' ? 'text-red-600' :
                                        entry.category === 'death' ? 'text-gray-600' :
                                        entry.category === 'combat' ? 'text-orange-600' :
                                        entry.category === 'discovery' ? 'text-purple-600' :
                                        entry.category === 'build' ? 'text-blue-600' :
                                        entry.category === 'thought' ? 'text-yellow-700' :
                                        'text-gray-600'
                                    )}>
                                        [{entry.category}]
                                    </span>
                                    <span className="text-gray-700 leading-tight flex-1">{entry.content}</span>
                                </div>
                                {entry.gameTime && (
                                    <div className="text-[9px] font-mono text-gray-400 mt-0.5">
                                        {entry.gameTime}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Header / Settings Buttons (Global Top Right) */}
            <div className="absolute top-4 right-4 pointer-events-auto z-50 flex items-center gap-2">
                <button
                    onClick={() => {
                        const pos = useStore.getState().entityPositions['robot'];
                        if (pos) {
                            useStore.getState().setCameraTarget({ x: pos.x, y: 2, z: pos.z });
                        }
                    }}
                    className="p-3 bg-white/90 backdrop-blur-md rounded-full shadow-lg hover:bg-white transition-colors text-orange-500"
                    title="Fly to Robot"
                >
                    <Locate size={22} />
                </button>
                <button
                    onClick={toggleSettings}
                    className="p-3 bg-white/90 backdrop-blur-md rounded-full shadow-lg hover:bg-white transition-colors text-gray-700"
                    title="Settings"
                >
                    <Settings size={22} />
                </button>
            </div>

            {/* Settings Modal */}
            {isSettingsOpen && (
                <div className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-md mx-4 transform transition-all animate-fade-in-up max-h-[90vh] overflow-y-auto">
                        <h2 className="text-xl font-bold mb-4 text-gray-800 flex justify-between items-center">
                            Settings
                            <button onClick={toggleSettings}><X size={20} className="text-gray-500 hover:text-gray-800" /></button>
                        </h2>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">AI Provider</label>
                            <div className="flex space-x-2">
                                <button
                                    onClick={() => setProvider('openai')}
                                    className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors", provider === 'openai' ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                                >
                                    OpenAI
                                </button>
                                <button
                                    onClick={() => setProvider('anthropic')}
                                    className={clsx("px-4 py-2 rounded-lg text-sm font-medium transition-colors", provider === 'anthropic' ? "bg-purple-600 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200")}
                                >
                                    Anthropic
                                </button>
                            </div>
                        </div>

                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                API Key ({provider === 'openai' ? 'OpenAI' : 'Anthropic'})
                            </label>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder={provider === 'openai' ? "sk-..." : "sk-ant-..."}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
                            />
                            <p className="text-xs text-gray-500 mt-2">
                                * Your key is stored locally in your browser.
                            </p>
                        </div>

                        {/* TTS Settings */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-700 mb-3">Text-to-Speech</h3>
                            <div className="mb-3">
                                <label className="block text-xs font-medium text-gray-600 mb-1">TTS Provider</label>
                                <div className="flex space-x-1.5">
                                    {(['openai', 'elevenlabs', 'web'] as const).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setTtsProvider(p)}
                                            className={clsx("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", ttsProvider === p ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200")}
                                        >
                                            {p === 'openai' ? 'OpenAI' : p === 'elevenlabs' ? 'ElevenLabs' : 'Browser'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {ttsProvider === 'openai' && (
                                <>
                                    <div className="mb-2">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Robot Voice</label>
                                        <select
                                            value={openaiRobotVoice}
                                            onChange={(e) => setOpenaiRobotVoice(e.target.value)}
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                                        >
                                            {['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'].map(v => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="mb-2">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Critter Voice</label>
                                        <select
                                            value={openaiCritterVoice}
                                            onChange={(e) => setOpenaiCritterVoice(e.target.value)}
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                                        >
                                            {['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'].map(v => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <p className="text-[10px] text-gray-400">
                                        LLM用のAPIキーを共用します
                                    </p>
                                </>
                            )}

                            {ttsProvider === 'elevenlabs' && (
                                <>
                                    <div className="mb-3">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">API Key</label>
                                        <input
                                            type="password"
                                            value={elevenLabsKey}
                                            onChange={(e) => setElevenLabsKey(e.target.value)}
                                            placeholder="xi-..."
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono text-sm"
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Robot Voice ID</label>
                                        <input
                                            type="text"
                                            value={robotVoiceId}
                                            onChange={(e) => setRobotVoiceId(e.target.value)}
                                            placeholder="onwK4e9ZLuTAKqWW03F9 (Daniel)"
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono text-sm"
                                        />
                                    </div>
                                    <div className="mb-2">
                                        <label className="block text-xs font-medium text-gray-600 mb-1">Critter Voice ID</label>
                                        <input
                                            type="text"
                                            value={critterVoiceId}
                                            onChange={(e) => setCritterVoiceId(e.target.value)}
                                            placeholder="jBpfuIE2acCO8z3wKNLl (Gigi)"
                                            className="w-full px-3 py-1.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none transition-all font-mono text-sm"
                                        />
                                    </div>
                                    <p className="text-[10px] text-gray-400">
                                        空欄=デフォルト使用 / Premadeボイスのみ無料で利用可
                                    </p>
                                </>
                            )}

                            {ttsProvider === 'web' && (
                                <p className="text-[10px] text-gray-400">
                                    ブラウザ内蔵の音声合成を使用します（無料・オフライン可）
                                </p>
                            )}
                        </div>

                        {/* Ambient Sound Settings */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-700 mb-3">Ambient Sounds</h3>
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-xs font-medium text-gray-600 flex items-center gap-1.5">
                                    <Volume2 size={14} />
                                    Enable Ambient Sounds
                                </label>
                                <button
                                    onClick={() => setAmbientSoundsEnabled(!ambientSoundsEnabled)}
                                    className={clsx(
                                        "w-10 h-5 rounded-full transition-colors relative",
                                        ambientSoundsEnabled ? "bg-blue-600" : "bg-gray-300"
                                    )}
                                >
                                    <span className={clsx(
                                        "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                                        ambientSoundsEnabled ? "translate-x-5" : "translate-x-0.5"
                                    )} />
                                </button>
                            </div>
                            {ambientSoundsEnabled && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">
                                        Volume: {Math.round(ambientSoundsVolume * 100)}%
                                    </label>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={Math.round(ambientSoundsVolume * 100)}
                                        onChange={(e) => setAmbientSoundsVolume(Number(e.target.value) / 100)}
                                        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                    />
                                </div>
                            )}
                            <p className="text-[10px] text-gray-400 mt-2">
                                Wind, insects, birds, water, rain (click to activate)
                            </p>
                        </div>

                        {/* System Prompts */}
                        <div className="mb-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
                            <h3 className="text-sm font-bold text-gray-700 mb-3">System Prompts</h3>
                            <div className="mb-3">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-medium text-gray-600">Robot Prompt</label>
                                    <button
                                        onClick={() => setRobotSystemPrompt(DEFAULT_ROBOT_SYSTEM_PROMPT)}
                                        className="text-[10px] text-gray-400 hover:text-blue-500 flex items-center gap-0.5 transition-colors"
                                        title="Reset to default"
                                    >
                                        <RotateCcw size={10} /> Reset
                                    </button>
                                </div>
                                <textarea
                                    value={robotSystemPrompt}
                                    onChange={(e) => setRobotSystemPrompt(e.target.value)}
                                    rows={6}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-mono leading-relaxed resize-y"
                                />
                            </div>
                            <div className="mb-2">
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-xs font-medium text-gray-600">Critter Prompt</label>
                                    <button
                                        onClick={() => setCritterSystemPrompt(DEFAULT_CRITTER_SYSTEM_PROMPT)}
                                        className="text-[10px] text-gray-400 hover:text-blue-500 flex items-center gap-0.5 transition-colors"
                                        title="Reset to default"
                                    >
                                        <RotateCcw size={10} /> Reset
                                    </button>
                                </div>
                                <textarea
                                    value={critterSystemPrompt}
                                    onChange={(e) => setCritterSystemPrompt(e.target.value)}
                                    rows={6}
                                    className="w-full px-3 py-2 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-xs font-mono leading-relaxed resize-y"
                                />
                            </div>
                            <p className="text-[10px] text-gray-400">
                                ロボットとクリッターの性格・口調を自由にカスタマイズできます
                            </p>
                        </div>

                        <div className="flex justify-between items-center">
                            <button
                                onClick={clearMessages}
                                className="text-red-500 text-sm flex items-center gap-1 hover:text-red-700"
                            >
                                <Trash2 size={16} /> Data Reset
                            </button>
                            <button
                                onClick={toggleSettings}
                                className="px-6 py-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Chat Widget Container (Bottom Right) */}
            <div className="absolute bottom-6 right-6 z-40 flex flex-col items-end gap-4 pointer-events-auto max-w-[90vw] w-[400px]">

                {/* Chat Window */}
                {isChatOpen && (
                    <div className="w-full bg-white/85 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-[60vh] animate-slide-in-right origin-bottom-right transition-all">
                        {/* Chat Header */}
                        <div className="px-4 py-3 bg-white/50 border-b border-gray-100 flex justify-between items-center backdrop-blur-md">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                                <span className="font-semibold text-gray-700 text-sm">Unit-01</span>
                            </div>
                            <button
                                onClick={toggleChat}
                                className="text-gray-400 hover:text-gray-700 transition-colors"
                            >
                                <Minimize2 size={16} />
                            </button>
                        </div>

                        {/* Messages Area */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto p-4 space-y-3 bg-white/30 scrollbar-thin scrollbar-thumb-gray-200"
                        >
                            {messages.length === 0 && (
                                <div className="text-center text-gray-400 text-sm mt-8">
                                    <p>Connected.</p>
                                    <p>Say hello!</p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={clsx(
                                        "flex items-end gap-2 max-w-[90%]",
                                        msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                                    )}
                                >
                                    <div className={clsx(
                                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0 shadow-sm text-[10px]",
                                        msg.role === 'user' ? "bg-gray-800 text-white" : "bg-white text-blue-600"
                                    )}>
                                        {msg.role === 'user' ? 'U' : 'AI'}
                                    </div>
                                    <div className={clsx(
                                        "p-3 rounded-2xl text-sm shadow-sm",
                                        msg.role === 'user' ? "bg-gray-800 text-white rounded-br-none" : "bg-white text-gray-800 rounded-bl-none"
                                    )}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Input Area */}
                        <form onSubmit={handleSubmit} className="p-3 bg-white/50 border-t border-gray-100">
                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder={apiKey ? "Message..." : "Set API Key first"}
                                    disabled={!apiKey}
                                    className="w-full pl-4 pr-12 py-3 bg-white border border-gray-200 rounded-full focus:ring-2 focus:ring-blue-500/50 outline-none transition-all shadow-sm text-sm"
                                />
                                <button
                                    type="submit"
                                    disabled={!input.trim() || !apiKey}
                                    className="absolute right-1.5 p-2 bg-gray-900 rounded-full text-white hover:bg-black transition-colors disabled:opacity-30 disabled:scale-90"
                                >
                                    <Send size={14} />
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Floating Toggle Button (Always Visible) */}
                <button
                    onClick={toggleChat}
                    className={clsx(
                        "p-4 rounded-full shadow-xl transition-all duration-300 flex items-center justify-center",
                        isChatOpen
                            ? "bg-gray-200 text-gray-600 hover:bg-gray-300 rotate-0 scale-90"
                            : "bg-blue-600 text-white hover:bg-blue-700 hover:scale-110 active:scale-95 rotate-0"
                    )}
                >
                    {isChatOpen ? <X size={24} /> : <MessageCircle size={28} />}
                </button>
            </div>
        </div>
    );
};
