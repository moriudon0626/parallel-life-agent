import { useRef, useState, useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, Quaternion } from "three";
import { RigidBody, RapierRigidBody, CylinderCollider } from "@react-three/rapier";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { Html } from "@react-three/drei";
import { generateSingleResponse, generateCritterThought, type CritterThoughtResult } from "../lib/llm";
import { applyEmotionEvent, decayEmotions, emotionToColor, emotionToSpeedMultiplier, emotionToDialogueContext, emotionChanged, createEmotionState, type EmotionState } from '../lib/emotions';
import { getAffinity, affinityToDialogueContext, affinityToDialogueProbabilityMultiplier, shouldApproach, shouldAvoid } from '../lib/relationships';
import { createMemory, selectRelevantMemories, memoriesToPromptContext } from '../store';
import { selectNextActivity, shouldSwitchActivity, getActivityMovementPattern } from '../lib/activities';
import { getNearbyElements, buildEnvContext, generateThemeFromElements } from '../lib/worldElements';
import { decayNeeds, satisfyNeed, computeDesires, needsToDialogueContext, createDefaultNeeds, type NeedsState } from '../lib/needs';
import { tickLifecycle, checkReproduction, mutateColor, sicknessToDialogueContext, getSpeedMultiplier, createLifecycleState, type LifecycleState } from '../lib/lifecycle';
import { getNearbyResources, type ResourceType } from '../lib/resources';
import { getTerrainHeight } from '../lib/terrain';

interface CritterProps {
    position: [number, number, number];
    name?: string;
    color?: string;
}

const lastDialogue: Record<string, Record<string, number>> = {};

// Personality types for variation
const PERSONALITIES = [
    "元気で好奇心旺盛。何でも気になる。",
    "臆病で慎重。知らないものにはちょっと距離を置く。",
    "のんびり屋。食べ物と昼寝が好き。",
    "ちょっと生意気。自分のテリトリー意識が強い。"
];

export const Critter = ({ position, name = "Wild Critter", color = "#44cc88" }: CritterProps) => {
    const rigidRef = useRef<RapierRigidBody>(null!);
    const [targetPos] = useState(() => new Vector3(
        position[0] + (Math.random() - 0.5) * 4,
        0.5,
        position[2] + (Math.random() - 0.5) * 4
    ));
    const nextMoveTime = useRef(Math.random() * 3);
    const homePos = useRef(new Vector3(position[0], position[1], position[2]));
    const [isInDialogue, setIsInDialogue] = useState(false);
    const [isQuarreling, setIsQuarreling] = useState(false);
    const initialCooldown = useRef(Date.now() + 15000); // 起動後15秒間は話さない (5s -> 15s)

    // Emotion system
    const personalityIndex = useMemo(() => name.charCodeAt(0) % 4, [name]);
    const emotionRef = useRef<EmotionState>(createEmotionState(personalityIndex));
    const lastEmotionSync = useRef(0);
    const lastPositionUpdate = useRef(0);

    // Needs system
    const needsRef = useRef<NeedsState>(createDefaultNeeds('critter'));
    const lastNeedsSync = useRef(0);

    // Lifecycle system
    const lifecycleRef = useRef<LifecycleState>(createLifecycleState(0));
    const lastLifecycleSync = useRef(0);
    const [opacity, setOpacity] = useState(1);
    const isDying = useRef(false);

    // World element observation tracking
    const observedElements = useRef<Set<string>>(new Set());

    // AI Thinking system
    const lastThinkTime = useRef(0);
    const isThinkingRef = useRef(false);
    const [currentThought, setCurrentThought] = useState<string | null>(null);
    const aiIntent = useRef<CritterThoughtResult | null>(null);

    // Give each critter a unique personality based on its name
    const personality = useMemo(() => {
        const index = name.charCodeAt(0) % PERSONALITIES.length;
        return PERSONALITIES[index];
    }, [name]);

    // Store state with selectors
    const apiKey = useStore(s => s.apiKey);
    const provider = useStore(s => s.provider);

    // Stable selectors for objects/arrays
    const myDialogue = useStore(useShallow(s => s.activeDialogues[name] || null));

    const robotMessage = useStore(useShallow(s => {
        const dialogues = Object.values(s.activeDialogues);
        return dialogues.find(d => d.isRobot && d.id === 'robot' && d.targetId === name) || null;
    }));

    const processedRobotMsgId = useRef<number>(0);
    const lastDialogueTime = useRef(0);
    const dialogueCount = useRef(0);

    // Watch for stuck state
    useEffect(() => {
        if (isInDialogue) {
            lastDialogueTime.current = Date.now();
            const interval = setInterval(() => {
                if (Date.now() - lastDialogueTime.current > 10000) {
                    console.warn(name, "force exit dialogue");
                    setIsInDialogue(false);
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [isInDialogue]);

    // Vision sensor handler
    // Detect robot or other critters and occasionally talk
    const handleSensorEnter = async (payload: any) => {
        const userData = payload.other.rigidBodyObject?.userData;
        if (userData && (userData.type === 'robot' || (userData.type === 'critter' && userData.name !== name))) {
            const isOtherRobot = userData.type === 'robot';
            const otherName = isOtherRobot ? 'robot' : userData.name;
            const now = Date.now();

            if (!lastDialogue[name]) lastDialogue[name] = {};
            const lastTime = lastDialogue[name][otherName] || 0;
            const cooldown = 120000; // クールダウン 120秒

            if (now - lastTime > cooldown) {
                const globalBusy = useStore.getState().isDialogueBusy;
                if (!isInDialogue && apiKey && !globalBusy && now > initialCooldown.current) {

                    // 確率で話しかける (ロボットには20%、クリッター同士は10%)
                    const baseChance = isOtherRobot ? 0.20 : 0.10;
                    const affinity = getAffinity(useStore.getState().relationships, name, otherName);
                    const affinityMult = affinityToDialogueProbabilityMultiplier(affinity);
                    const curiosityMult = 1 + emotionRef.current.curiosity * 0.5;
                    if (Math.random() > baseChance * affinityMult * curiosityMult) return;

                    const startQuarrel = !isOtherRobot && Math.random() < 0.05; // 喧嘩発生率 5% (15% -> 5%)

                    lastDialogue[name][otherName] = now;
                    useStore.getState().setDialogueBusy(true); // グローバルロックを確保
                    dialogueCount.current = 0;

                    if (startQuarrel) setIsQuarreling(true);
                    setIsInDialogue(true);

                    try {
                        const state = useStore.getState();
                        const relevantMemories = selectRelevantMemories(state.critterMemories[name] || [], [otherName], 7);
                        const memoryContext = memoriesToPromptContext(relevantMemories);
                        const myPos = state.entityPositions[name];
                        const envContext = buildEnvContext(state.time, state.weather, myPos?.x ?? position[0], myPos?.z ?? position[2]);
                        const emotionContext = emotionToDialogueContext(emotionRef.current);
                        const affinityVal = getAffinity(state.relationships, name, otherName);
                        const relationContext = affinityToDialogueContext(affinityVal, otherName);
                        const nearbyElements = getNearbyElements(myPos?.x ?? position[0], myPos?.z ?? position[2], 15, state.time);
                        const dynamicThemes = generateThemeFromElements(nearbyElements);
                        const theme = isOtherRobot
                            ? `${dynamicThemes}、またはロボットのこと`
                            : (startQuarrel ? "相手への文句" : `${dynamicThemes}、または最近気になったこと`);

                        const needsContext = needsToDialogueContext(needsRef.current, 'critter');
                        const sicknessContext = sicknessToDialogueContext(lifecycleRef.current);
                        const bodyContext = [needsContext, sicknessContext].filter(Boolean).join('。');

                        const prompt = isOtherRobot
                            ? `あなたは${name}。性格: ${personality}。${emotionContext}。${bodyContext ? bodyContext + '。' : ''}${relationContext}。
${envContext}。ロボットに${theme}について気軽に話しかけて。1〜2文で。大げさな表現は禁止。日本語で。
最近の記憶:\n${memoryContext}`
                            : `あなたは${name}。性格: ${personality}。${emotionContext}。${bodyContext ? bodyContext + '。' : ''}${relationContext}。
${envContext}。${otherName}に${theme}について${startQuarrel ? "短くイラッとした感じで" : "普通に"}話しかけて。1〜2文で。大げさ禁止。日本語で。
最近の記憶:\n${memoryContext}`;

                        const response = await Promise.race([
                            generateSingleResponse(provider, apiKey, prompt, useStore.getState().critterSystemPrompt),
                            new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
                        ]);
                        useStore.getState().addCritterMemory(name, createMemory(`${otherName}と会話した: ${response}`, startQuarrel ? 'quarrel' : 'dialogue', [name, otherName]));
                        useStore.getState().addDialogue(name, name, response, false, otherName);
                        emotionRef.current = applyEmotionEvent(emotionRef.current, startQuarrel ? 'quarrel' : 'positive_dialogue');
                        useStore.getState().adjustRelationship(name, otherName, startQuarrel ? -0.15 : 0.05);
                    } catch (error) {
                        console.error("Critter initiate dialogue failed:", error);
                        // エラー時は即座に解除
                        setIsInDialogue(false);
                        setIsQuarreling(false);
                        useStore.getState().setDialogueBusy(false);
                    } finally {
                        // 話し終わった後の余韻（7秒）を置いて解除
                        setTimeout(() => {
                            setIsInDialogue(false);
                            setIsQuarreling(false);
                            useStore.getState().setDialogueBusy(false);
                        }, 3000); // 7000 -> 3000
                    }
                }
            }
        }
    };

    // Respond to robot's dialogue
    const lastConversationEnd = useRef(0);

    useEffect(() => {
        if (!robotMessage || isInDialogue || !apiKey) return;

        const now = Date.now();
        if (processedRobotMsgId.current === robotMessage.timestamp) return;

        // Checking cooldown
        if (now - lastConversationEnd.current < 60000) { // 応答クールダウン 60秒
            return;
        }

        processedRobotMsgId.current = robotMessage.timestamp;

        // Start of a new conversation? Only reset if enough time passed.
        const timeSinceLastTalk = Date.now() - lastConversationEnd.current;

        if (timeSinceLastTalk > 600000) {
            console.log(name, "RESETTING dialogue count (New Conversation after 10min)");
            dialogueCount.current = 0;
        } else {
            console.log(name, `Continuing dialogue (Count: ${dialogueCount.current})`);
        }

        const respond = async () => {
            setIsInDialogue(true);
            lastDialogueTime.current = Date.now();
            dialogueCount.current += 1;

            if (dialogueCount.current > 8) {
                setIsInDialogue(false);
                lastConversationEnd.current = Date.now();
                return;
            }

            try {
                const state = useStore.getState();
                const ids = [robotMessage.speakerId, name].sort();
                const sessionId = ids.join(':');
                const history = state.conversationHistories[sessionId] || [];
                const relevantMemories = selectRelevantMemories(state.critterMemories[name] || [], ['robot'], 7);
                const memoryContext = memoriesToPromptContext(relevantMemories);
                const myPos = state.entityPositions[name];
                const envContext = buildEnvContext(state.time, state.weather, myPos?.x ?? position[0], myPos?.z ?? position[2]);
                const emotionContext = emotionToDialogueContext(emotionRef.current);
                const affinityVal = getAffinity(state.relationships, name, 'robot');
                const relationContext = affinityToDialogueContext(affinityVal, 'robot');

                let directionPrompt = "";
                if (dialogueCount.current >= 4) {
                    directionPrompt = "そろそろ会話を切り上げる感じで。「じゃあね」とか「またね」程度で。";
                } else {
                    directionPrompt = "普通に返事して。";
                }

                const prompt = `相手が「${robotMessage.text}」と言った。
性格: ${personality}。${emotionContext}。${relationContext}。${envContext}。
${directionPrompt}1〜2文で。大げさ禁止。日本語で。
最近の記憶:\n${memoryContext}`;

                const response = await Promise.race([
                    generateSingleResponse(provider, apiKey, prompt, useStore.getState().critterSystemPrompt, history),
                    new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
                ]);

                useStore.getState().addCritterMemory(name, createMemory(`ロボットが「${robotMessage.text}」と言った。「${response}」と返した`, 'dialogue', [name, 'robot']));
                useStore.getState().addDialogue(name, name, response, false, 'robot');
                emotionRef.current = applyEmotionEvent(emotionRef.current, 'positive_dialogue');
                useStore.getState().adjustRelationship(name, 'robot', 0.05);
            } catch (error) {
                console.error("Critter response failed:", error);
            } finally {
                setTimeout(() => {
                    if (rigidRef.current) {
                        setIsInDialogue(false);
                        lastConversationEnd.current = Date.now();
                    }
                }, 5000);
            }
        };
        respond();
    }, [robotMessage, apiKey, provider, isInDialogue, name, personality]);

    // Respond to other critter's dialogue (Quarrel check)
    const otherCritterMessage = useStore(useShallow(s => {
        const dialogues = Object.values(s.activeDialogues);
        return dialogues.find(d => !d.isRobot && d.targetId === name && d.speakerId !== name) || null;
    }));

    const quarrelCount = useRef(0);

    useEffect(() => {
        if (!otherCritterMessage || isInDialogue || !apiKey) return;

        // 喧嘩の継続判定: 1回以上続いたら終了 (2回から短縮、計2発言)
        if (quarrelCount.current >= 1) {
            console.log(name, "Stopping quarrel as it's too long.");
            quarrelCount.current = 0; // Reset for next time
            return;
        }

        const respond = async () => {
            setIsInDialogue(true);
            quarrelCount.current += 1;

            // 相手が怒っている（喧嘩をふっかけてきた）か、あるいはランダムに喧嘩に発展
            const isAggressive = otherCritterMessage.text.includes("！") || otherCritterMessage.text.includes("だめ") || Math.random() < 0.2;
            if (isAggressive) setIsQuarreling(true);

            try {
                const prompt = `${otherCritterMessage.speakerId}が「${otherCritterMessage.text}」と言った。
性格: ${personality}。普通に1〜2文で返して。大げさ禁止。日本語で。`;

                const response = await generateSingleResponse(provider, apiKey, prompt, useStore.getState().critterSystemPrompt);
                useStore.getState().addDialogue(name, name, response, false, otherCritterMessage.speakerId);
                emotionRef.current = applyEmotionEvent(emotionRef.current, isAggressive ? 'quarrel' : 'negative_dialogue');
                useStore.getState().adjustRelationship(name, otherCritterMessage.speakerId, isAggressive ? -0.15 : -0.05);
            } catch (e) {
                console.error("Critter to Critter response failed:", e);
            } finally {
                setTimeout(() => {
                    setIsInDialogue(false);
                    setIsQuarreling(false);
                    // 3回終わったらリセット
                    if (quarrelCount.current >= 3) quarrelCount.current = 0;
                }, 3000); // 5000 -> 3000
            }
        };
        respond();
    }, [otherCritterMessage, apiKey, provider, isInDialogue, name, personality]);

    const lastLogTime = useRef(0);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        const delta = state.clock.getDelta();

        // Emotion decay
        const currentEmotion = emotionRef.current;
        const decayed = decayEmotions(currentEmotion, delta);
        emotionRef.current = decayed;
        if (t - lastEmotionSync.current > 1.0) {
            const storeEmotion = useStore.getState().getEntityEmotion(name);
            if (emotionChanged(storeEmotion, emotionRef.current)) {
                useStore.getState().updateEntityEmotion(name, { ...emotionRef.current });
            }
            lastEmotionSync.current = t;
        }

        // Needs decay
        const storeState = useStore.getState();
        const isNight = storeState.time >= 18 || storeState.time < 6;
        needsRef.current = decayNeeds(needsRef.current, delta, 'critter', isNight);

        // Needs sync to store (every 1s)
        if (t - lastNeedsSync.current > 1.0) {
            storeState.updateEntityNeeds(name, { ...needsRef.current });
            lastNeedsSync.current = t;

            // Low hunger → emotion effect
            if (needsRef.current.hunger < 0.25) {
                emotionRef.current = applyEmotionEvent(emotionRef.current, 'hunger_low', 0.3);
            }
        }

        // Lifecycle tick (every 1s)
        if (t - lastLifecycleSync.current > 1.0) {
            lifecycleRef.current = tickLifecycle(lifecycleRef.current, 1.0, needsRef.current);
            storeState.updateEntityLifecycle(name, { ...lifecycleRef.current });
            lastLifecycleSync.current = t;

            // Sickness → emotion
            if (lifecycleRef.current.healthStatus === 'sick') {
                emotionRef.current = applyEmotionEvent(emotionRef.current, 'sick', 0.2);
            }

            // Death
            if (lifecycleRef.current.healthStatus === 'dead' && !isDying.current) {
                isDying.current = true;
                // Fade out and remove
                const fadeInterval = setInterval(() => {
                    setOpacity(prev => {
                        if (prev <= 0.05) {
                            clearInterval(fadeInterval);
                            // Remove from registry
                            useStore.getState().removeCritter(name);
                            // Add memory to nearby entities
                            const positions = useStore.getState().entityPositions;
                            const myPos = positions[name];
                            if (myPos) {
                                for (const [id, pos] of Object.entries(positions)) {
                                    if (id === name) continue;
                                    const dist = Math.sqrt((pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2);
                                    if (dist < 20) {
                                        if (id === 'robot') {
                                            useStore.getState().addRobotMemory(createMemory(`${name}が死んでしまった`, 'event', [name], 0.9, 0.8));
                                        } else {
                                            useStore.getState().addCritterMemory(id, createMemory(`${name}が死んでしまった`, 'event', [name], 0.9, 0.8));
                                        }
                                        const emotion = useStore.getState().getEntityEmotion(id);
                                        useStore.getState().updateEntityEmotion(id, applyEmotionEvent(emotion, 'entity_died'));
                                    }
                                }
                            }
                            return 0;
                        }
                        return prev - 0.1;
                    });
                }, 300);
            }

            // Reproduction check
            const aliveCount = storeState.critterRegistry.filter(c => c.isAlive).length;
            if (checkReproduction(lifecycleRef.current, needsRef.current, aliveCount)) {
                lifecycleRef.current.reproductionCooldown = 60; // 1 min cooldown
                const store = useStore.getState();
                const aliveCount = store.critterRegistry.filter(c => c.isAlive).length;
                if (aliveCount < 8) {
                    const myPos = store.entityPositions[name] || { x: position[0], z: position[2] };
                    const gen = lifecycleRef.current.generation + 1;
                    const childColor = mutateColor(color);
                    const childId = `Critter-${Date.now().toString(36)}`;
                    const childPos: [number, number, number] = [
                        myPos.x + (Math.random() - 0.5) * 4,
                        0.5,
                        myPos.z + (Math.random() - 0.5) * 4,
                    ];
                    store.addCritter({
                        id: childId,
                        name: childId,
                        color: childColor,
                        spawnPosition: childPos,
                        isAlive: true,
                        generation: gen,
                    });
                    // Memory and emotion
                    store.addCritterMemory(name, createMemory(`子供(${childId})が生まれた！`, 'event', [name, childId], 0.9, 0.5));
                    emotionRef.current = applyEmotionEvent(emotionRef.current, 'new_birth');

                    // Notify nearby entities
                    const positions = store.entityPositions;
                    for (const [id, pos] of Object.entries(positions)) {
                        if (id === name) continue;
                        const dist = Math.sqrt((pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2);
                        if (dist < 20) {
                            if (id === 'robot') {
                                store.addRobotMemory(createMemory(`${name}の近くに新しいクリッターが生まれた`, 'event', [name, childId], 0.7));
                            } else {
                                store.addCritterMemory(id, createMemory(`${name}の近くに新しいクリッターが生まれた`, 'event', [name, childId], 0.7));
                            }
                            const emotion = store.getEntityEmotion(id);
                            store.updateEntityEmotion(id, applyEmotionEvent(emotion, 'new_birth', 0.5));
                        }
                    }
                }
            }
        }

        // Resource seeking: when hungry, move toward nearest food resource
        if (rigidRef.current && !isInDialogue) {
            const p = rigidRef.current.translation();
            const resources = storeState.resourceNodes;
            const critterFoodTypes: ResourceType[] = ['mineral_ore', 'glowing_mushroom'];
            const nearbyResources = getNearbyResources(resources, p.x, p.z, 2.0, critterFoodTypes);

            if (nearbyResources.length > 0 && nearbyResources[0].distance < 2.0) {
                // Eating: satisfy hunger, pause briefly
                needsRef.current = satisfyNeed(needsRef.current, 'hunger', 0.15);
                needsRef.current = satisfyNeed(needsRef.current, 'comfort', 0.05);
                // Consume resource
                const updated = storeState.resourceNodes.map(r =>
                    r.id === nearbyResources[0].id ? { ...r, capacity: Math.max(0, r.capacity - 0.05) } : r
                );
                useStore.setState({ resourceNodes: updated });
            }
        }

        // Position reporting
        if (rigidRef.current && t - lastPositionUpdate.current > 0.5) {
            const p = rigidRef.current.translation();
            useStore.getState().updateEntityPosition(name, p.x, p.z);
            lastPositionUpdate.current = t;
        }

        // World element observation
        if (rigidRef.current && t - lastPositionUpdate.current < 0.6) {
            const p = rigidRef.current.translation();
            const storeState2 = useStore.getState();
            const nearby = getNearbyElements(p.x, p.z, 8, storeState2.time);
            for (const elem of nearby) {
                if (!observedElements.current.has(elem.id)) {
                    observedElements.current.add(elem.id);
                    storeState2.addCritterMemory(name, createMemory(
                        elem.description,
                        'observation',
                        ['environment'],
                        0.4
                    ));
                }
            }
        }

        // --- Critter AI Thinking Loop (30~45 second interval, staggered by personality) ---
        const thinkInterval = 30 + (personalityIndex * 5); // 30~45s based on personality
        if (apiKey && !isThinkingRef.current && !isInDialogue && t - lastThinkTime.current > thinkInterval) {
            lastThinkTime.current = t;
            isThinkingRef.current = true;

            const thinkStore = useStore.getState();
            const myPos = thinkStore.entityPositions[name];
            const positions = thinkStore.entityPositions;
            const nearbyEntities = Object.entries(positions)
                .filter(([eid]) => eid !== name)
                .map(([eid, pos]) => ({
                    id: eid,
                    distance: myPos ? Math.sqrt((pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2) : 100,
                }))
                .filter(e => e.distance < 25)
                .slice(0, 4);

            const relevantMemories = selectRelevantMemories(thinkStore.critterMemories[name] || [], nearbyEntities.map(e => e.id), 3);
            const memContext = memoriesToPromptContext(relevantMemories);
            const emotionCtx = emotionToDialogueContext(emotionRef.current);
            const needsCtx = needsToDialogueContext(needsRef.current, 'critter');
            const hours = Math.floor(thinkStore.time);
            const minutes = Math.floor((thinkStore.time % 1) * 60);
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

            const contextPrompt = `あなたは${name}。性格: ${personality}
現在地: (${(myPos?.x ?? 0).toFixed(0)}, ${(myPos?.z ?? 0).toFixed(0)})
時刻: ${timeStr} / ${thinkStore.weather}
${emotionCtx}
${needsCtx ? needsCtx : ''}
近く: ${nearbyEntities.length > 0 ? nearbyEntities.map(e => `${e.id}(${e.distance.toFixed(0)}m)`).join(', ') : 'だれもいない'}
記憶: ${memContext}`;

            generateCritterThought(provider, apiKey, contextPrompt)
                .then((result) => {
                    aiIntent.current = result;
                    setCurrentThought(result.thought);

                    const gameTimeStr = `Day ${thinkStore.day}, ${timeStr}`;
                    useStore.getState().addCritterThought(name, {
                        thought: result.thought,
                        action: result.action,
                        timestamp: Date.now(),
                        gameTime: gameTimeStr,
                        critterName: name,
                        color: color,
                    });

                    useStore.getState().addCritterMemory(name, createMemory(
                        `[思考] ${result.thought}`,
                        'observation',
                        ['self'],
                        0.3
                    ));

                    setTimeout(() => setCurrentThought(null), 5000);
                })
                .catch((err) => {
                    console.error(`${name} thinking failed:`, err);
                })
                .finally(() => {
                    isThinkingRef.current = false;
                });
        }

        if (t - lastLogTime.current > 1.0) {
            lastLogTime.current = t;
            if (rigidRef.current) {
                const p = rigidRef.current.translation();
                const v = rigidRef.current.linvel();
                const sleep = rigidRef.current.isSleeping();
                console.log(`[Critter ${name} DEBUG] InDialogue:${isInDialogue} Pos:(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) Vel:(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) Sleep:${sleep}`);
            }
        }

        if (rigidRef.current) {
            if (!isInDialogue) {
                // No damping for velocity control
                rigidRef.current.setLinearDamping(0);

                const currentTranslation = rigidRef.current.translation();
                const currentPos = new Vector3(currentTranslation.x, currentTranslation.y, currentTranslation.z);

                // Terrain height correction (small critter offset)
                const terrainY = getTerrainHeight(currentPos.x, currentPos.z);
                const correctedY = terrainY + 0.35;
                if (currentPos.y < correctedY - 0.2) {
                    rigidRef.current.setTranslation(
                        { x: currentPos.x, y: correctedY + 0.3, z: currentPos.z },
                        true
                    );
                    const vel = rigidRef.current.linvel();
                    if (vel.y < 0) {
                        rigidRef.current.setLinvel({ x: vel.x, y: 0, z: vel.z }, true);
                    }
                } else if (currentPos.y > correctedY + 2.0) {
                    rigidRef.current.setTranslation(
                        { x: currentPos.x, y: correctedY + 0.5, z: currentPos.z },
                        true
                    );
                }

                const store = useStore.getState();

                // Activity-based movement
                const currentActivity = store.entityActivities[name];
                if (shouldSwitchActivity(currentActivity)) {
                    const positions = store.entityPositions;
                    const myPos = positions[name];
                    const nearbyEntities = Object.entries(positions)
                        .filter(([id]) => id !== name)
                        .map(([id, pos]) => ({
                            id,
                            distance: myPos ? Math.sqrt((pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2) : 100,
                        }))
                        .filter(e => e.distance < 30);

                    const desires = computeDesires(needsRef.current, 'critter');
                    const newActivity = selectNextActivity(
                        emotionRef.current,
                        store.time,
                        store.weather,
                        store.relationships,
                        name,
                        nearbyEntities,
                        desires
                    );

                    // Override with AI intent if available
                    if (aiIntent.current) {
                        const intent = aiIntent.current;
                        const validActivities: string[] = ['explore', 'forage', 'rest', 'socialize', 'seek_resource', 'flee', 'idle'];
                        if (validActivities.includes(intent.action)) {
                            newActivity.current = intent.action as typeof newActivity.current;
                        }
                        aiIntent.current = null;
                    }

                    // If seeking resource, find nearest food resource and set target
                    if (newActivity.current === 'seek_resource' && myPos) {
                        const critterFoodTypes: ResourceType[] = ['mineral_ore', 'glowing_mushroom'];
                        const nearbyRes = getNearbyResources(store.resourceNodes, myPos.x, myPos.z, 50, critterFoodTypes);
                        if (nearbyRes.length > 0) {
                            newActivity.targetResourceId = nearbyRes[0].id;
                        }
                    }

                    store.setEntityActivity(name, newActivity);
                }

                const activity = store.entityActivities[name]?.current || 'forage';
                const pattern = getActivityMovementPattern(activity);

                // Wander Logic - Activity-driven
                if (activity === 'rest') {
                    // Stay still during rest
                    rigidRef.current.setLinvel({ x: 0, y: rigidRef.current.linvel().y, z: 0 }, true);
                    // Skip movement, go to rotation section
                } else if (activity === 'seek_resource') {
                    // Move toward target resource
                    const resId = store.entityActivities[name]?.targetResourceId;
                    const resNode = resId ? store.resourceNodes.find(r => r.id === resId) : null;
                    if (resNode && resNode.capacity > 0.05) {
                        targetPos.set(resNode.position.x, 0.5, resNode.position.z);
                    } else {
                        // Resource depleted or not found, fallback to forage
                        const myPos2 = store.entityPositions[name];
                        if (myPos2) {
                            const critterFoodTypes2: ResourceType[] = ['mineral_ore', 'glowing_mushroom'];
                            const nearby2 = getNearbyResources(store.resourceNodes, myPos2.x, myPos2.z, 50, critterFoodTypes2);
                            if (nearby2.length > 0) {
                                targetPos.set(nearby2[0].position.x, 0.5, nearby2[0].position.z);
                            }
                        }
                    }
                } else {
                    if (currentPos.distanceTo(targetPos) < 0.5 || t > nextMoveTime.current) {
                        const r = pattern.wanderRadius || 10;
                        const hw = pattern.homeAffinity;

                        if (activity === 'socialize') {
                            const socialTarget = store.entityActivities[name]?.targetEntityId;
                            const socialPos = socialTarget ? store.entityPositions[socialTarget] : null;
                            if (socialPos) {
                                targetPos.set(
                                    socialPos.x + (Math.random() - 0.5) * 4,
                                    0.5,
                                    socialPos.z + (Math.random() - 0.5) * 4
                                );
                            } else {
                                targetPos.set(
                                    homePos.current.x + (Math.random() - 0.5) * r * 2,
                                    0.5,
                                    homePos.current.z + (Math.random() - 0.5) * r * 2
                                );
                            }
                        } else if (activity === 'flee') {
                            // Flee toward home
                            targetPos.set(
                                homePos.current.x + (Math.random() - 0.5) * 3,
                                0.5,
                                homePos.current.z + (Math.random() - 0.5) * 3
                            );
                        } else {
                            // Normal activity wander: blend between random and home-biased
                            const randX = (Math.random() - 0.5) * r * 2;
                            const randZ = (Math.random() - 0.5) * r * 2;
                            targetPos.set(
                                homePos.current.x * hw + randX * (1 - hw * 0.5),
                                0.5,
                                homePos.current.z * hw + randZ * (1 - hw * 0.5)
                            );
                        }
                        nextMoveTime.current = t + 5 + Math.random() * 8;
                    }

                    // Relationship-based movement bias
                    const positions = store.entityPositions;
                    const relationships = store.relationships;
                    for (const [entityId, pos] of Object.entries(positions)) {
                        if (entityId === name) continue;
                        const dx = pos.x - currentPos.x;
                        const dz = pos.z - currentPos.z;
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        if (dist < 15) {
                            const aff = getAffinity(relationships, name, entityId);
                            if (shouldAvoid(aff) || (entityId === 'robot' && emotionRef.current.fear > 0.4)) {
                                targetPos.x -= dx * 0.3;
                                targetPos.z -= dz * 0.3;
                            } else if (shouldApproach(aff)) {
                                targetPos.x += dx * 0.2;
                                targetPos.z += dz * 0.2;
                            }
                        }
                    }
                }

                const direction = targetPos.clone().sub(currentPos).normalize();
                const lifecycleSpeedMult = getSpeedMultiplier(lifecycleRef.current);
                const speed = activity === 'rest' ? 0 : 2.0 * emotionToSpeedMultiplier(emotionRef.current) * pattern.speedMultiplier * lifecycleSpeedMult;

                // Velocity Control
                rigidRef.current.setLinvel({
                    x: direction.x * speed,
                    y: rigidRef.current.linvel().y,
                    z: direction.z * speed
                }, true);

                // Occasional hop
                if (Math.random() < 0.005) {
                    rigidRef.current.applyImpulse({ x: 0, y: 0.5, z: 0 }, true);
                }

                // Rotation
                const angle = Math.atan2(direction.x, direction.z);
                const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);
                rigidRef.current.setRotation(q, true);
            } else {
                // High damping during dialogue
                rigidRef.current.setLinearDamping(20);

                // Shake if quarreling
                if (isQuarreling) {
                    rigidRef.current.setLinvel({
                        x: (Math.random() - 0.5) * 5,
                        y: 0,
                        z: (Math.random() - 0.5) * 5
                    }, true);
                } else {
                    rigidRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
                }
            }
        }
    });
    return (
        <RigidBody
            ref={rigidRef}
            colliders="ball"
            restitution={0.1}
            friction={0.8}
            linearDamping={0.5}
            position={position}
            canSleep={false}
            enabledRotations={[false, true, false]}
            userData={{ type: 'critter', name }}
        >
            {/* Speech Bubble */}
            {myDialogue && (
                <Html position={[0, 0.8, 0]} center distanceFactor={10}>
                    <div style={{
                        background: isQuarreling ? '#ffdddd' : 'white',
                        padding: '6px 10px',
                        borderRadius: '10px',
                        border: isQuarreling ? '2px solid #ff4444' : '2px solid #44cc88',
                        color: isQuarreling ? '#cc0000' : 'black',
                        width: 'max-content',
                        maxWidth: '280px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                        pointerEvents: 'none',
                        animation: isQuarreling ? 'quarrel-shake 0.1s infinite' : 'bubble-in 0.3s ease-out'
                    }}>
                        {isQuarreling && "💢 "}{myDialogue.text}
                    </div>
                </Html>
            )}

            {/* Thought Bubble */}
            {currentThought && !myDialogue && (
                <Html position={[0, 1.0, 0]} center distanceFactor={10}>
                    <div style={{
                        background: 'rgba(200, 240, 220, 0.9)',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        border: '1.5px dashed #66aa88',
                        width: 'max-content',
                        maxWidth: '220px',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        fontSize: '10px',
                        fontStyle: 'italic',
                        color: '#336644',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                        pointerEvents: 'none',
                        animation: 'bubble-in 0.3s ease-out',
                    }}>
                        {currentThought}
                    </div>
                </Html>
            )}

            <group>
                {/* Body - organic rounded shape */}
                <mesh castShadow receiveShadow>
                    <icosahedronGeometry args={[0.25, 1]} />
                    <meshStandardMaterial
                        color={emotionToColor(emotionRef.current, color)}
                        roughness={0.5}
                        metalness={0.1}
                        transparent={opacity < 1}
                        opacity={opacity}
                        // Sickness desaturation handled via emotion color shift
                    />
                </mesh>
                {/* Eyes */}
                <mesh position={[0.08, 0.08, 0.2]}>
                    <sphereGeometry args={[0.04]} />
                    <meshBasicMaterial color="white" />
                </mesh>
                <mesh position={[-0.08, 0.08, 0.2]}>
                    <sphereGeometry args={[0.04]} />
                    <meshBasicMaterial color="white" />
                </mesh>
                {/* Pupils - dilate with curiosity */}
                <mesh position={[0.08, 0.08, 0.23]}>
                    <sphereGeometry args={[0.02 * (1 + emotionRef.current.curiosity * 0.5)]} />
                    <meshBasicMaterial color="black" />
                </mesh>
                <mesh position={[-0.08, 0.08, 0.23]}>
                    <sphereGeometry args={[0.02 * (1 + emotionRef.current.curiosity * 0.5)]} />
                    <meshBasicMaterial color="black" />
                </mesh>
            </group>

            <CylinderCollider
                args={[0.5, 8.0]} // halfHeight 0.5, radius 8.0 (拡大)
                position={[0, 0, 0]}
                sensor
                onIntersectionEnter={handleSensorEnter}
            />
        </RigidBody>
    );
};
