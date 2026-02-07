import { useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, Group, Vector3, Quaternion } from "three";
import { RigidBody, RapierRigidBody, CylinderCollider } from "@react-three/rapier";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { Html } from "@react-three/drei";
import { generateSingleResponse, generateThought, type ThoughtResult } from "../lib/llm";
import { applyEmotionEvent, decayEmotions, emotionToColor, emotionToSpeedMultiplier, emotionToDialogueContext, emotionChanged, DEFAULT_EMOTION, type EmotionState } from '../lib/emotions';
import { getAffinity, affinityToDialogueContext, affinityToDialogueProbabilityMultiplier } from '../lib/relationships';
import { createMemory, selectRelevantMemories, memoriesToPromptContext } from '../store';
import { selectNextActivity, shouldSwitchActivity, getActivityMovementPattern } from '../lib/activities';
import { getNearbyElements, buildEnvContext } from '../lib/worldElements';
import { decayNeeds, satisfyNeed, computeDesires, needsToDialogueContext, createDefaultNeeds, type NeedsState } from '../lib/needs';
import { getNearbyResources, attemptGatherResource, consumeResource, getResourceValue } from '../lib/resources';
import { getTerrainHeight } from '../lib/terrain';
import { updateRobotBattery, updateRobotTemperature } from '../lib/survival';

// Cooldown for memory and dialogue prevents spamming
const lastSeen: Record<string, number> = {};
const lastDialogue: Record<string, number> = {};

type RobotState = 'IDLE' | 'MOVING' | 'DIALOGUE';

export const Robot = (props: any) => {
    const bodyRef = useRef<Mesh>(null!);
    const headRef = useRef<Group>(null!);
    const rigidRef = useRef<RapierRigidBody>(null!);

    // AI State
    const [robotState, setRobotState] = useState<RobotState>('IDLE');
    const [targetPos, setTargetPos] = useState<Vector3 | null>(null);
    const [lookAtTarget, setLookAtTarget] = useState<Vector3 | null>(null);

    // Timers
    const nextDecisionTime = useRef(0.5);
    const initialCooldown = useRef(Date.now() + 5000); // 起動後5秒間は話さない

    // Smooth rotation target
    const targetRotation = useRef(new Quaternion());

    // Emotion system
    const emotionRef = useRef<EmotionState>({ ...DEFAULT_EMOTION });
    const lastEmotionSync = useRef(0);

    // Needs system
    const needsRef = useRef<NeedsState>(createDefaultNeeds('robot'));
    const lastNeedsSync = useRef(0);

    // Position reporting
    const lastPositionUpdate = useRef(0);

    // World element observation tracking
    const observedElements = useRef<Set<string>>(new Set());

    // AI Thinking system
    const lastThinkTime = useRef(0);
    const isThinking = useRef(false);
    const [currentThought, setCurrentThought] = useState<string | null>(null);
    const aiIntent = useRef<ThoughtResult | null>(null);

    // Store state with selectors
    const apiKey = useStore(s => s.apiKey);
    const provider = useStore(s => s.provider);
    const myDialogue = useStore(useShallow(s => s.activeDialogues['robot'] || null));

    const latestIncoming = useStore(useShallow(s => {
        const dialogues = Object.values(s.activeDialogues);
        return dialogues.find(d => !d.isRobot && d.id !== 'robot') || null;
    }));

    const processedMessagesId = useRef<Set<number>>(new Set());

    const lastStateChange = useRef(Date.now());

    // Update state change timestamp
    useEffect(() => {
        lastStateChange.current = Date.now();
    }, [robotState]);

    // Vision detector
    const handleSensorEnter = async (payload: any) => {
        const userData = payload.other.rigidBodyObject?.userData;
        const now = Date.now();
        const globalBusy = useStore.getState().isDialogueBusy;

        if (userData && userData.type === 'critter' && !globalBusy) {
            const name = userData.name;

            // Handle Memory
            if (!lastSeen[name] || now - lastSeen[name] > 15000) {
                useStore.getState().addRobotMemory(createMemory(`${name}を発見`, 'observation', [name]));
                lastSeen[name] = now;
            }

            // Handle Dialogue
            if (!lastDialogue[name] || now - lastDialogue[name] > 90000) { // クールダウン 90秒
                if (now < initialCooldown.current || globalBusy || robotState === 'DIALOGUE') return;

                // 4% chance to initiate conversation, modified by affinity and curiosity
                const affinity = getAffinity(useStore.getState().relationships, 'robot', name);
                const affinityMult = affinityToDialogueProbabilityMultiplier(affinity);
                const curiosityMult = 1 + emotionRef.current.curiosity;
                if (Math.random() > 0.15 * affinityMult * curiosityMult) return;

                lastDialogue[name] = now;
                if (apiKey) {
                    setRobotState('DIALOGUE');
                    useStore.getState().setDialogueBusy(true);
                    const sessionId = `robot:${name}`;

                    const otherBody = payload.other.rigidBody;
                    if (otherBody) {
                        const translation = otherBody.translation();
                        const targetVec = new Vector3(translation.x, 0.5, translation.z);
                        setLookAtTarget(targetVec);

                        try {
                            const state = useStore.getState();
                            const history = state.conversationHistories[sessionId] || [];
                            const relevantMemories = selectRelevantMemories(state.robotMemories, [name], 10);
                            const memoryContext = memoriesToPromptContext(relevantMemories);
                            const robotPos = state.entityPositions['robot'];
                            const envContext = buildEnvContext(state.time, state.weather, robotPos?.x ?? 0, robotPos?.z ?? 0);
                            const emotionContext = emotionToDialogueContext(emotionRef.current);
                            const affinity2 = getAffinity(state.relationships, 'robot', name);
                            const relationContext = affinityToDialogueContext(affinity2, name);

                            const needsContext = needsToDialogueContext(needsRef.current, 'robot');

                            const prompt = `${emotionContext}。${needsContext ? needsContext + '。' : ''}${relationContext}。
${name}に会った。${envContext}。
普段の会話みたいに、気軽に1〜2文で話しかけて。大げさな表現は禁止。日本語で。
最近の記憶:\n${memoryContext}`;

                            const response = await Promise.race([
                                generateSingleResponse(provider, apiKey, prompt, state.robotSystemPrompt, history),
                                new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
                            ]);

                            useStore.getState().addDialogue('robot', 'robot', response, true, name);
                            emotionRef.current = applyEmotionEvent(emotionRef.current, 'positive_dialogue');
                            useStore.getState().adjustRelationship('robot', name, 0.05);
                        } catch (error) {
                            console.error("Dialogue generation failed:", error);
                            // エラー時は即座にリセット
                            setRobotState('IDLE');
                            setLookAtTarget(null);
                            useStore.getState().setDialogueBusy(false);
                        } finally {
                            setTimeout(() => {
                                setRobotState('IDLE');
                                setLookAtTarget(null);
                                useStore.getState().setDialogueBusy(false);
                            }, 6000); // 6秒後に次の対話可能（余韻を持たせる）
                        }
                    } else {
                        setRobotState('IDLE');
                        useStore.getState().setDialogueBusy(false);
                    }
                }
            }
        }
    };

    // React to incoming dialogue
    useEffect(() => {
        if (!latestIncoming || robotState === 'DIALOGUE' || !apiKey) return;

        if (!processedMessagesId.current.has(latestIncoming.timestamp)) {
            processedMessagesId.current.add(latestIncoming.timestamp);

            const respond = async () => {
                setRobotState('DIALOGUE');
                useStore.getState().setDialogueBusy(true);
                const sessionId = `robot:${latestIncoming.speakerId}`;

                try {
                    const state = useStore.getState();
                    const history = state.conversationHistories[sessionId] || [];
                    const relevantMemories = selectRelevantMemories(state.robotMemories, [latestIncoming.speakerId], 5);
                    const memoryContext = memoriesToPromptContext(relevantMemories);
                    const robotPos = state.entityPositions['robot'];
                    const envContext = buildEnvContext(state.time, state.weather, robotPos?.x ?? 0, robotPos?.z ?? 0);
                    const emotionContext = emotionToDialogueContext(emotionRef.current);
                    const affinity = getAffinity(state.relationships, 'robot', latestIncoming.speakerId);
                    const relationContext = affinityToDialogueContext(affinity, latestIncoming.speakerId);

                    const prompt = `${emotionContext}。${relationContext}。
相手が「${latestIncoming.text}」と言った。${envContext}。
普通に返事して。1〜2文で。大げさな表現は禁止。日本語で。
最近の記憶:\n${memoryContext}`;

                    const response = await Promise.race([
                        generateSingleResponse(provider, apiKey, prompt, undefined, history),
                        new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
                    ]);
                    useStore.getState().addDialogue('robot', 'robot', response, true, latestIncoming.speakerId);
                    emotionRef.current = applyEmotionEvent(emotionRef.current, 'positive_dialogue');
                    useStore.getState().adjustRelationship('robot', latestIncoming.speakerId, 0.05);
                } catch (error) {
                    console.error("Response failed:", error);
                } finally {
                    setTimeout(() => {
                        setRobotState('IDLE');
                        setLookAtTarget(null);
                        useStore.getState().setDialogueBusy(false);
                    }, 5000);
                }
            };
            respond();
        }
    }, [latestIncoming, apiKey, provider, robotState]);

    // AI Logic
    const lastLogTime = useRef(0);

    // AI Logic
    useFrame((state) => {
        const t = state.clock.getElapsedTime();

        if (t - lastLogTime.current > 1.0) {
            lastLogTime.current = t;
            if (rigidRef.current) {
                const p = rigidRef.current.translation();
                const v = rigidRef.current.linvel();
                const sleep = rigidRef.current.isSleeping();
                console.log(`[Robot DEBUG] State:${robotState} Pos:(${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}) Vel:(${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}) Sleep:${sleep} Target:${targetPos ? `(${targetPos.x.toFixed(2)},${targetPos.z.toFixed(2)})` : 'None'}`);
            }
        }

        // Emotion decay (every frame, sync to store every 1s)
        const currentEmotion = emotionRef.current;
        const decayed = decayEmotions(currentEmotion, state.clock.getDelta());
        emotionRef.current = decayed;
        if (t - lastEmotionSync.current > 1.0) {
            const storeEmotion = useStore.getState().getEntityEmotion('robot');
            if (emotionChanged(storeEmotion, emotionRef.current)) {
                useStore.getState().updateEntityEmotion('robot', { ...emotionRef.current });
            }
            lastEmotionSync.current = t;
        }

        // Needs decay
        const storeForNeeds = useStore.getState();
        const isNight = storeForNeeds.time >= 18 || storeForNeeds.time < 6;
        needsRef.current = decayNeeds(needsRef.current, state.clock.getDelta(), 'robot', isNight);

        // Solar charging during day
        if (!isNight && storeForNeeds.weather === 'sunny') {
            needsRef.current = satisfyNeed(needsRef.current, 'energy', 0.0008 * state.clock.getDelta());
        }

        // Needs sync (every 1s)
        if (t - lastNeedsSync.current > 1.0) {
            storeForNeeds.updateEntityNeeds('robot', { ...needsRef.current });
            lastNeedsSync.current = t;
        }

        // Robot Status Management (battery, durability, temperature)
        const robotStatus = storeForNeeds.robotStatus;
        const delta = state.clock.getDelta();
        const activity: 'idle' | 'moving' | 'working' =
            robotState === 'MOVING' ? 'moving' :
            robotState === 'DIALOGUE' ? 'working' :
            'idle';

        // Battery consumption
        let updatedStatus = updateRobotBattery(robotStatus, delta / 60, activity); // delta is in seconds, convert to minutes

        // Solar charging during sunny day
        if (!isNight && storeForNeeds.weather === 'sunny') {
            updatedStatus = {
                ...updatedStatus,
                battery: Math.min(100, updatedStatus.battery + (2.0 * delta / 60)) // SOLAR_CHARGE_RATE
            };
        }

        // Temperature update based on environment
        updatedStatus = updateRobotTemperature(updatedStatus, storeForNeeds.temperature, delta);

        // Update store if changed
        if (updatedStatus.battery !== robotStatus.battery ||
            updatedStatus.durability !== robotStatus.durability ||
            updatedStatus.temperature !== robotStatus.temperature ||
            updatedStatus.malfunctioning !== robotStatus.malfunctioning) {

            // Check for critical状態变化 and log
            if (!robotStatus.malfunctioning && updatedStatus.malfunctioning) {
                storeForNeeds.addActivityLog({
                    category: 'warning',
                    importance: 'critical',
                    entityId: 'robot',
                    content: '⚠️ ロボットのバッテリーが切れました！機能停止中...',
                });
            }

            storeForNeeds.updateRobotStatus(updatedStatus);
        }

        // Energy node charging: if near energy node, recharge
        if (rigidRef.current) {
            const rp = rigidRef.current.translation();
            const energyNodes = getNearbyResources(storeForNeeds.resourceNodes, rp.x, rp.z, 2.5, ['energy_node']);
            if (energyNodes.length > 0 && energyNodes[0].distance < 2.5) {
                needsRef.current = satisfyNeed(needsRef.current, 'energy', 0.05 * state.clock.getDelta());
                // Consume resource
                const updated = storeForNeeds.resourceNodes.map(r =>
                    r.id === energyNodes[0].id ? { ...r, capacity: Math.max(0, r.capacity - 0.02 * state.clock.getDelta()) } : r
                );
                useStore.setState({ resourceNodes: updated });
            }

            // Resource gathering: materials for building
            const materialNodes = getNearbyResources(storeForNeeds.resourceNodes, rp.x, rp.z, 2.5, ['scrap_metal', 'fiber', 'crystal']);
            if (materialNodes.length > 0 && Math.random() < 0.02) { // 2% chance per frame to gather
                const node = materialNodes[0];
                const hasTool = false; // TODO: Check inventory for tools
                const result = attemptGatherResource(node, hasTool);

                if (result.success) {
                    // Add to inventory
                    const materialType = node.type as 'scrap_metal' | 'fiber' | 'crystal';
                    const effectiveAmount = Math.floor(getResourceValue(node, result.amount) * 10); // Convert to integer
                    storeForNeeds.addInventoryItem(materialType, effectiveAmount);

                    // Consume from node
                    const updated = consumeResource(storeForNeeds.resourceNodes, node.id, result.amount);
                    useStore.setState({ resourceNodes: updated });

                    // Log gathering
                    storeForNeeds.addActivityLog({
                        category: 'event',
                        importance: 'normal',
                        entityId: 'robot',
                        content: `🔨 ${node.name}を採取しました（×${effectiveAmount}）`,
                    });

                    // Damage if dangerous
                    if (result.damaged) {
                        const damagedStatus = {
                            ...storeForNeeds.robotStatus,
                            durability: Math.max(0, storeForNeeds.robotStatus.durability - 5)
                        };
                        storeForNeeds.updateRobotStatus(damagedStatus);
                        storeForNeeds.addActivityLog({
                            category: 'warning',
                            importance: 'normal',
                            entityId: 'robot',
                            content: `⚠️ 採取中にダメージを受けました（-5 耐久度）`,
                        });
                    }

                    // Add memory
                    storeForNeeds.addRobotMemory(createMemory(
                        `${node.name}を採取した`,
                        'event',
                        ['resource'],
                        0.5
                    ));
                }
            }
        }

        // Position reporting (every 0.5s)
        if (rigidRef.current && t - lastPositionUpdate.current > 0.5) {
            const p = rigidRef.current.translation();
            useStore.getState().updateEntityPosition('robot', p.x, p.z);
            lastPositionUpdate.current = t;
        }

        // --- World element observation ---
        if (rigidRef.current && t - lastPositionUpdate.current < 0.6) {
            const p = rigidRef.current.translation();
            const storeState = useStore.getState();
            const nearby = getNearbyElements(p.x, p.z, 8, storeState.time);
            for (const elem of nearby) {
                if (!observedElements.current.has(elem.id)) {
                    observedElements.current.add(elem.id);
                    storeState.addRobotMemory(createMemory(
                        elem.description,
                        'observation',
                        ['environment'],
                        0.4
                    ));
                }
            }
        }

        // --- AI Thinking Loop (every 20 real seconds = ~1 game hour at 3x speed) ---
        if (apiKey && !isThinking.current && t - lastThinkTime.current > 20) {
            lastThinkTime.current = t;
            isThinking.current = true;

            const thinkStore = useStore.getState();
            const robotPos = thinkStore.entityPositions['robot'];
            const positions = thinkStore.entityPositions;
            const nearbyEntities = Object.entries(positions)
                .filter(([eid]) => eid !== 'robot')
                .map(([eid, pos]) => ({
                    id: eid,
                    distance: robotPos ? Math.sqrt((pos.x - robotPos.x) ** 2 + (pos.z - robotPos.z) ** 2) : 100,
                }))
                .filter(e => e.distance < 30)
                .slice(0, 5);

            const relevantMemories = selectRelevantMemories(thinkStore.robotMemories, nearbyEntities.map(e => e.id), 5);
            const memContext = memoriesToPromptContext(relevantMemories);
            const emotionCtx = emotionToDialogueContext(emotionRef.current);
            const needsCtx = needsToDialogueContext(needsRef.current, 'robot');
            const hours = Math.floor(thinkStore.time);
            const minutes = Math.floor((thinkStore.time % 1) * 60);
            const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

            // Build previous thoughts context
            const recentThoughts = thinkStore.robotThoughts.slice(-3);
            const prevThoughtsCtx = recentThoughts.length > 0
                ? recentThoughts.map(t => `[${t.gameTime}] 思考:「${t.thought}」→ 行動: ${t.action}`).join('\n')
                : 'なし';

            // Check for user directive
            const userDirective = thinkStore.userDirective;

            const contextPrompt = `現在地: (${(robotPos?.x ?? 0).toFixed(0)}, ${(robotPos?.z ?? 0).toFixed(0)})
時刻: ${timeStr} / Day ${thinkStore.day} / ${thinkStore.season}
天気: ${thinkStore.weather} / 気温: ${thinkStore.temperature}°C
${emotionCtx}
${needsCtx ? needsCtx : ''}
近くのエンティティ: ${nearbyEntities.length > 0 ? nearbyEntities.map(e => `${e.id}(距離${e.distance.toFixed(0)})`).join(', ') : 'なし'}
前回の思考:
${prevThoughtsCtx}
${userDirective ? `\nユーザーからの指示: ${userDirective}` : ''}
最近の記憶:
${memContext}`;

            generateThought(provider, apiKey, contextPrompt)
                .then((result) => {
                    aiIntent.current = result;
                    setCurrentThought(result.thought);

                    // Store thought
                    const gameTimeStr = `Day ${thinkStore.day}, ${timeStr}`;
                    useStore.getState().addRobotThought({
                        thought: result.thought,
                        action: result.action,
                        timestamp: Date.now(),
                        gameTime: gameTimeStr,
                    });

                    // Add to activity log
                    useStore.getState().addActivityLog({
                        category: 'thought',
                        importance: 'normal',
                        entityId: 'robot',
                        content: `${result.action}: ${result.thought}`,
                    });

                    // Store as memory
                    useStore.getState().addRobotMemory(createMemory(
                        `[思考] ${result.thought}`,
                        'observation',
                        ['self'],
                        0.5
                    ));

                    // Clear user directive after consuming
                    if (userDirective) {
                        useStore.getState().setUserDirective(null);
                    }

                    // Clear thought bubble after 5 seconds
                    setTimeout(() => setCurrentThought(null), 5000);
                })
                .catch((err) => {
                    console.error('AI thinking failed:', err);
                })
                .finally(() => {
                    isThinking.current = false;
                });
        }

        // --- Failsafe: Reset if stuck in DIALOGUE for too long ---
        if (robotState === 'DIALOGUE' && Date.now() - lastStateChange.current > 10000) {
            console.warn("Robot stuck in DIALOGUE, forcing reset");
            setRobotState('IDLE');
            setLookAtTarget(null);
        }

        // --- Animation: Floating Head ---
        if (headRef.current) {
            headRef.current.position.y = 0.6 + Math.sin(t * 2) * 0.05;
            headRef.current.rotation.y = Math.sin(t * 0.5) * 0.1;
        }

        // --- Activity-Based AI Logic ---
        if (robotState !== 'DIALOGUE' && t > nextDecisionTime.current) {
            const store = useStore.getState();
            const currentActivity = store.entityActivities['robot'];

            if (shouldSwitchActivity(currentActivity)) {
                // Gather nearby entities for activity selection
                const positions = store.entityPositions;
                const robotPos = positions['robot'];
                const nearbyEntities = Object.entries(positions)
                    .filter(([id]) => id !== 'robot')
                    .map(([id, pos]) => ({
                        id,
                        distance: robotPos ? Math.sqrt((pos.x - robotPos.x) ** 2 + (pos.z - robotPos.z) ** 2) : 100,
                    }))
                    .filter(e => e.distance < 30);

                const desires = computeDesires(needsRef.current, 'robot');
                let newActivity;

                // Use AI intent if available
                if (aiIntent.current) {
                    const intent = aiIntent.current;
                    const validActivities: string[] = ['explore', 'forage', 'rest', 'socialize', 'seek_resource', 'patrol', 'idle'];
                    const activity = validActivities.includes(intent.action) ? intent.action : 'explore';
                    newActivity = selectNextActivity(
                        emotionRef.current,
                        store.time,
                        store.weather,
                        store.relationships,
                        'robot',
                        nearbyEntities,
                        desires
                    );
                    // Override activity with AI intent
                    newActivity.current = activity as typeof newActivity.current;
                    aiIntent.current = null; // consumed
                } else {
                    newActivity = selectNextActivity(
                        emotionRef.current,
                        store.time,
                        store.weather,
                        store.relationships,
                        'robot',
                        nearbyEntities,
                        desires
                    );
                }

                // If seeking resource (energy), find nearest energy node
                if (newActivity.current === 'seek_resource') {
                    const robotPos2 = positions['robot'];
                    if (robotPos2) {
                        const nearbyRes = getNearbyResources(store.resourceNodes, robotPos2.x, robotPos2.z, 50, ['energy_node']);
                        if (nearbyRes.length > 0) {
                            newActivity.targetResourceId = nearbyRes[0].id;
                        }
                    }
                }

                store.setEntityActivity('robot', newActivity);

                const pattern = getActivityMovementPattern(newActivity.current);

                if (newActivity.current === 'rest') {
                    setRobotState('IDLE');
                    setTargetPos(null);
                    nextDecisionTime.current = t + newActivity.duration;
                } else if (newActivity.current === 'seek_resource' && newActivity.targetResourceId) {
                    const resNode = store.resourceNodes.find(r => r.id === newActivity.targetResourceId);
                    if (resNode) {
                        setTargetPos(new Vector3(resNode.position.x, 0.5, resNode.position.z));
                        setRobotState('MOVING');
                        nextDecisionTime.current = t + 8 + Math.random() * 5;
                    }
                } else if (newActivity.current === 'socialize' && newActivity.targetEntityId) {
                    const targetPos2 = positions[newActivity.targetEntityId];
                    if (targetPos2) {
                        setTargetPos(new Vector3(targetPos2.x + (Math.random() - 0.5) * 3, 0.5, targetPos2.z + (Math.random() - 0.5) * 3));
                    } else {
                        setTargetPos(new Vector3((Math.random() - 0.5) * 10, 0.5, (Math.random() - 0.5) * 10));
                    }
                    setRobotState('MOVING');
                    nextDecisionTime.current = t + 5 + Math.random() * 5;
                } else {
                    const r = pattern.wanderRadius;
                    const homeWeight = pattern.homeAffinity;
                    // Use current position as base, blend toward origin based on homeAffinity
                    const currentRobotPos = positions['robot'];
                    const curX = currentRobotPos?.x ?? 0;
                    const curZ = currentRobotPos?.z ?? 0;
                    const baseX = curX * (1 - homeWeight); // blend toward origin
                    const baseZ = curZ * (1 - homeWeight);
                    const newTarget = new Vector3(
                        baseX + (Math.random() - 0.5) * 2 * r,
                        0.5,
                        baseZ + (Math.random() - 0.5) * 2 * r
                    );
                    // Clamp to world bounds
                    newTarget.x = Math.max(-90, Math.min(90, newTarget.x));
                    newTarget.z = Math.max(-90, Math.min(90, newTarget.z));
                    setTargetPos(newTarget);
                    setRobotState('MOVING');
                    nextDecisionTime.current = t + 4 + Math.random() * 4;
                }
            } else if (robotState === 'MOVING' && !targetPos) {
                setRobotState('IDLE');
                nextDecisionTime.current = t + 2 + Math.random() * 2;
            } else if (robotState === 'IDLE') {
                // Continue current activity with new wander target
                const activity = currentActivity?.current || 'forage';
                const pattern = getActivityMovementPattern(activity);
                if (Math.random() > pattern.pauseChance) {
                    const r = pattern.wanderRadius || 10;
                    const curPos = store.entityPositions['robot'];
                    const cx = curPos?.x ?? 0;
                    const cz = curPos?.z ?? 0;
                    const tx = Math.max(-90, Math.min(90, cx + (Math.random() - 0.5) * 2 * r));
                    const tz = Math.max(-90, Math.min(90, cz + (Math.random() - 0.5) * 2 * r));
                    setTargetPos(new Vector3(tx, 0.5, tz));
                    setRobotState('MOVING');
                }
                nextDecisionTime.current = t + 3 + Math.random() * 3;
            } else {
                setRobotState('IDLE');
                setTargetPos(null);
                nextDecisionTime.current = t + 2 + Math.random() * 2;
            }
        }

        // --- Physics & Movement ---
        if (rigidRef.current) {
            const currentTranslation = rigidRef.current.translation();
            const currentPos = new Vector3(currentTranslation.x, currentTranslation.y, currentTranslation.z);

            // Safety Reset
            if (currentPos.y < -5) {
                rigidRef.current.setTranslation({ x: 0, y: 5, z: 0 }, true);
                rigidRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            }

            // Terrain height correction (2x scale robot needs larger offset)
            const terrainY = getTerrainHeight(currentPos.x, currentPos.z);
            const correctedY = terrainY + 1.0;
            if (currentPos.y < correctedY - 0.3) {
                // Sunk into terrain - teleport up
                rigidRef.current.setTranslation(
                    { x: currentPos.x, y: correctedY + 0.5, z: currentPos.z },
                    true
                );
                // Clamp downward velocity
                const vel = rigidRef.current.linvel();
                if (vel.y < 0) {
                    rigidRef.current.setLinvel({ x: vel.x, y: 0, z: vel.z }, true);
                }
            } else if (currentPos.y > correctedY + 3.0) {
                // Too high above terrain - gently correct
                rigidRef.current.setTranslation(
                    { x: currentPos.x, y: correctedY + 1.5, z: currentPos.z },
                    true
                );
            }

            if (robotState === 'DIALOGUE') {
                // Stop immediately (Velocity 0)
                rigidRef.current.setLinvel({ x: 0, y: rigidRef.current.linvel().y, z: 0 }, true);
                rigidRef.current.setLinearDamping(10); // 物理的な制動を強化

                if (lookAtTarget) {
                    const direction = lookAtTarget.clone().sub(currentPos).normalize();
                    const angle = Math.atan2(direction.x, direction.z);
                    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);
                    const currentRot = rigidRef.current.rotation();
                    const qCurrent = new Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w);
                    qCurrent.slerp(q, 0.1);
                    rigidRef.current.setRotation(qCurrent, true);
                }
            }

            if (robotState === 'MOVING' && targetPos) {
                const horizPos = currentPos.clone().setY(0);
                const horizTarget = targetPos.clone().setY(0);
                const dist = horizPos.distanceTo(horizTarget);

                if (dist < 1.0) {
                    // console.log("Robot reached target, switching to IDLE");
                    setRobotState('IDLE');
                    setTargetPos(null);
                    nextDecisionTime.current = t + 2 + Math.random() * 2;
                    // Stop
                    rigidRef.current.setLinvel({ x: 0, y: rigidRef.current.linvel().y, z: 0 }, true);
                } else {
                    const direction = targetPos.clone().sub(currentPos).normalize();
                    const activityPattern = getActivityMovementPattern(useStore.getState().entityActivities['robot']?.current || 'forage');
                    const speed = 3.0 * emotionToSpeedMultiplier(emotionRef.current) * activityPattern.speedMultiplier;
                    // Force velocity
                    rigidRef.current.setLinvel({
                        x: direction.x * speed,
                        y: rigidRef.current.linvel().y,
                        z: direction.z * speed
                    }, true);

                    const angle = Math.atan2(direction.x, direction.z);
                    const q = new Quaternion();
                    q.setFromAxisAngle(new Vector3(0, 1, 0), angle);
                    targetRotation.current.copy(q);
                }
            }

            if (robotState === 'MOVING') {
                const currentRot = rigidRef.current.rotation();
                const qCurrent = new Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w);
                qCurrent.slerp(targetRotation.current, 0.1);
                rigidRef.current.setRotation(qCurrent, true);
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
            angularDamping={0.5}
            canSleep={false}
            position={[0, 5, 0]}
            enabledRotations={[false, true, false]}
            userData={{ type: 'robot', name: 'Unit-01' }}
            {...props}
        >
            <group scale={[2, 2, 2]}>
                {/* Speech Bubble */}
                {myDialogue && (
                    <Html position={[0, 1.5, 0]} center distanceFactor={10}>
                        <div style={{
                            background: 'white',
                            padding: '8px 12px',
                            borderRadius: '12px',
                            border: '2px solid #FFA500',
                            width: 'max-content',
                            maxWidth: '350px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: '14px',
                            fontWeight: 'bold',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                            pointerEvents: 'none',
                            animation: 'bubble-in 0.3s ease-out'
                        }}>
                            {myDialogue.text}
                        </div>
                    </Html>
                )}

                {/* Thought Bubble */}
                {currentThought && !myDialogue && (
                    <Html position={[0, 1.8, 0]} center distanceFactor={10}>
                        <div style={{
                            background: 'rgba(200, 220, 255, 0.9)',
                            padding: '6px 10px',
                            borderRadius: '10px',
                            border: '1.5px dashed #7799dd',
                            width: 'max-content',
                            maxWidth: '280px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontSize: '12px',
                            fontStyle: 'italic',
                            color: '#445577',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                            pointerEvents: 'none',
                            animation: 'bubble-in 0.3s ease-out',
                        }}>
                            💭 {currentThought}
                        </div>
                    </Html>
                )}

                {/* Body */}
                <mesh ref={bodyRef} castShadow receiveShadow position={[0, 0, 0]}>
                    <dodecahedronGeometry args={[0.45, 0]} />
                    <meshStandardMaterial
                        color={robotState === 'DIALOGUE' ? "#00ffcc" : emotionToColor(emotionRef.current, "#FFA500")}
                        roughness={0.1}
                        metalness={0.5}
                    />
                </mesh>
                {/* Inner glow core */}
                <mesh position={[0, 0, 0]}>
                    <sphereGeometry args={[0.3]} />
                    <meshStandardMaterial
                        color={emotionToColor(emotionRef.current, "#FFA500")}
                        emissive={emotionToColor(emotionRef.current, "#FFA500")}
                        emissiveIntensity={0.3 + emotionRef.current.energy * 0.5}
                        transparent
                        opacity={0.4}
                        toneMapped={false}
                    />
                </mesh>
                {/* Orbiting ring */}
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                    <torusGeometry args={[0.55, 0.02, 8, 32]} />
                    <meshStandardMaterial color="#ffffff" metalness={0.9} roughness={0.1} />
                </mesh>

                {/* Head Group (Floating) */}
                <group ref={headRef} position={[0, 0.6, 0]}>
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[0.4, 0.3, 0.4]} />
                        <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.8} />
                    </mesh>

                    <mesh position={[0, 0.05, 0.18]}>
                        <planeGeometry args={[0.3, 0.1]} />
                        <meshBasicMaterial
                            color={robotState === 'IDLE' ? "#00ffcc" : "#ff00cc"}
                            toneMapped={false}
                        />
                    </mesh>

                    <mesh position={[0, 0.25, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.3]} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                    <mesh position={[0, 0.4, 0]}>
                        <sphereGeometry args={[0.05]} />
                        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={2} toneMapped={false} />
                    </mesh>
                </group>

                <CylinderCollider
                    args={[1.0, 5.0]} // halfHeight 1.0 (total height 2.0), radius 5.0. Note: inside scale 2 group
                    position={[0, 0, 0]}
                    sensor
                    onIntersectionEnter={handleSensorEnter}
                />
            </group>
        </RigidBody>
    );
};
