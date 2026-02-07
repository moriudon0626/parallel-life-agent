import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

import { useStore, createMemory, selectRelevantMemories, memoriesToPromptContext } from "../../store";
import type { CritterRegistryEntry } from "../../store";
import { getTerrainHeight } from "../../lib/terrain";
import {
    applyEmotionEvent,
    decayEmotions,
    emotionToColor,
    emotionToSpeedMultiplier,
    emotionToDialogueContext,
    emotionChanged,
    createEmotionState,
} from "../../lib/emotions";
import type { EmotionState } from "../../lib/emotions";
import {
    getAffinity,
    shouldApproach,
    shouldAvoid,
    affinityToDialogueContext,
    affinityToDialogueProbabilityMultiplier,
} from "../../lib/relationships";
import {
    selectNextActivity,
    shouldSwitchActivity,
    getActivityMovementPattern,
} from "../../lib/activities";
import { getNearbyElements, buildEnvContext, generateThemeFromElements } from "../../lib/worldElements";
import {
    decayNeeds,
    satisfyNeed,
    computeDesires,
    needsToDialogueContext,
    createDefaultNeeds,
} from "../../lib/needs";
import type { NeedsState } from "../../lib/needs";
import {
    tickLifecycle,
    checkReproduction,
    mutateColor,
    sicknessToDialogueContext,
    getSpeedMultiplier,
    createLifecycleState,
} from "../../lib/lifecycle";
import type { LifecycleState } from "../../lib/lifecycle";
import { getNearbyResources } from "../../lib/resources";
import type { ResourceType } from "../../lib/resources";
import { generateSingleResponse, generateCritterThought } from "../../lib/llm";
import type { CritterThoughtResult } from "../../lib/llm";

// -------------------------------------------------------------------------
// Personality types for variation
// -------------------------------------------------------------------------
const PERSONALITIES = [
    "元気で好奇心旺盛。何でも気になる。",
    "臆病で慎重。知らないものにはちょっと距離を置く。",
    "のんびり屋。食べ物と昼寝が好き。",
    "ちょっと生意気。自分のテリトリー意識が強い。",
];

// -------------------------------------------------------------------------
// Helper: parse hex colour string (#RRGGBB) into Babylon Color3
// -------------------------------------------------------------------------
function hexToColor3(hex: string): Color3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new Color3(r, g, b);
}

// -------------------------------------------------------------------------
// Per-critter mutable state (replaces React refs / useState)
// -------------------------------------------------------------------------
interface CritterState {
    // Identity
    id: string;
    name: string;
    color: string;
    generation: number;
    personalityIndex: number;
    personality: string;

    // Babylon objects
    rootNode: TransformNode;
    bodyMesh: Mesh;
    bodyMat: StandardMaterial;
    eyeWhiteL: Mesh;
    eyeWhiteR: Mesh;
    pupilL: Mesh;
    pupilR: Mesh;
    pupilLMat: StandardMaterial;
    pupilRMat: StandardMaterial;
    eyeMatL: StandardMaterial;
    eyeMatR: StandardMaterial;
    aggregate: PhysicsAggregate;

    // Movement
    targetPos: Vector3;
    homePos: Vector3;
    nextMoveTime: number;

    // Emotion / Needs / Lifecycle
    emotion: EmotionState;
    needs: NeedsState;
    lifecycle: LifecycleState;

    // Timing
    lastEmotionSync: number;
    lastPositionUpdate: number;
    lastNeedsSync: number;
    lastLifecycleSync: number;
    lastLogTime: number;

    // AI Thinking
    lastThinkTime: number;
    isThinking: boolean;
    currentThought: string | null;
    aiIntent: CritterThoughtResult | null;
    thoughtClearTimeout: ReturnType<typeof setTimeout> | null;

    // Dialogue
    isInDialogue: boolean;
    isQuarreling: boolean;
    initialCooldown: number;
    lastConversationEnd: number;
    dialogueCount: number;
    processedRobotMsgId: number;
    quarrelCount: number;
    lastDialogueTime: number;

    // World observation
    observedElements: Set<string>;

    // Death handling
    isDying: boolean;
    opacity: number;
    fadeInterval: ReturnType<typeof setInterval> | null;

    // Alive flag (mirrors registry but local for fast checks)
    alive: boolean;
}

// Global dialogue cooldown tracker (shared across critters)
const lastDialoguePair: Record<string, Record<string, number>> = {};

// -------------------------------------------------------------------------
// createCritterVisuals: build meshes + physics for one critter
// -------------------------------------------------------------------------
function createCritterVisuals(
    scene: Scene,
    entry: CritterRegistryEntry,
): CritterState {
    const { id, name, color, spawnPosition, generation } = entry;

    // --- Root transform node ---
    const rootNode = new TransformNode(`critter_${name}_root`, scene);
    rootNode.position = new Vector3(spawnPosition[0], spawnPosition[1], spawnPosition[2]);

    // --- Body (icosahedron: polyhedron type 2) ---
    const bodyMesh = MeshBuilder.CreatePolyhedron(
        `critter_${name}_body`,
        { type: 2, size: 0.25 },
        scene,
    );
    bodyMesh.parent = rootNode;
    bodyMesh.receiveShadows = true;

    const bodyMat = new StandardMaterial(`critter_${name}_bodyMat`, scene);
    bodyMat.diffuseColor = hexToColor3(color);
    bodyMat.roughness = 0.5;
    bodyMat.specularPower = 16;
    bodyMesh.material = bodyMat;

    // --- Eyes (white spheres) ---
    const eyeWhiteL = MeshBuilder.CreateSphere(`critter_${name}_eyeL`, { diameter: 0.08 }, scene);
    eyeWhiteL.parent = rootNode;
    eyeWhiteL.position = new Vector3(0.08, 0.08, 0.2);

    const eyeMatL = new StandardMaterial(`critter_${name}_eyeMatL`, scene);
    eyeMatL.diffuseColor = Color3.White();
    eyeMatL.emissiveColor = Color3.White();
    eyeMatL.disableLighting = true;
    eyeWhiteL.material = eyeMatL;

    const eyeWhiteR = MeshBuilder.CreateSphere(`critter_${name}_eyeR`, { diameter: 0.08 }, scene);
    eyeWhiteR.parent = rootNode;
    eyeWhiteR.position = new Vector3(-0.08, 0.08, 0.2);

    const eyeMatR = new StandardMaterial(`critter_${name}_eyeMatR`, scene);
    eyeMatR.diffuseColor = Color3.White();
    eyeMatR.emissiveColor = Color3.White();
    eyeMatR.disableLighting = true;
    eyeWhiteR.material = eyeMatR;

    // --- Pupils (black spheres, dilate with curiosity) ---
    const personalityIndex = name.charCodeAt(0) % 4;
    const initEmotion = createEmotionState(personalityIndex);
    const pupilSize = 0.02 * (1 + initEmotion.curiosity * 0.5);

    const pupilL = MeshBuilder.CreateSphere(`critter_${name}_pupilL`, { diameter: pupilSize * 2 }, scene);
    pupilL.parent = rootNode;
    pupilL.position = new Vector3(0.08, 0.08, 0.23);

    const pupilLMat = new StandardMaterial(`critter_${name}_pupilLMat`, scene);
    pupilLMat.diffuseColor = Color3.Black();
    pupilLMat.disableLighting = true;
    pupilL.material = pupilLMat;

    const pupilR = MeshBuilder.CreateSphere(`critter_${name}_pupilR`, { diameter: pupilSize * 2 }, scene);
    pupilR.parent = rootNode;
    pupilR.position = new Vector3(-0.08, 0.08, 0.23);

    const pupilRMat = new StandardMaterial(`critter_${name}_pupilRMat`, scene);
    pupilRMat.diffuseColor = Color3.Black();
    pupilRMat.disableLighting = true;
    pupilR.material = pupilRMat;

    // --- Physics ---
    const aggregate = new PhysicsAggregate(
        rootNode,
        PhysicsShapeType.SPHERE,
        { mass: 0.3, restitution: 0.1, friction: 0.8 },
        scene,
    );
    aggregate.body.setLinearDamping(0.5);
    aggregate.body.setAngularDamping(10); // restrict rolling

    // --- Initialise state ---
    const state: CritterState = {
        id,
        name,
        color,
        generation,
        personalityIndex,
        personality: PERSONALITIES[personalityIndex],

        rootNode,
        bodyMesh,
        bodyMat,
        eyeWhiteL,
        eyeWhiteR,
        pupilL,
        pupilR,
        pupilLMat,
        pupilRMat,
        eyeMatL,
        eyeMatR,
        aggregate,

        targetPos: new Vector3(
            spawnPosition[0] + (Math.random() - 0.5) * 4,
            0.5,
            spawnPosition[2] + (Math.random() - 0.5) * 4,
        ),
        homePos: new Vector3(spawnPosition[0], spawnPosition[1], spawnPosition[2]),
        nextMoveTime: Math.random() * 3,

        emotion: initEmotion,
        needs: createDefaultNeeds("critter"),
        lifecycle: createLifecycleState(generation),

        lastEmotionSync: 0,
        lastPositionUpdate: 0,
        lastNeedsSync: 0,
        lastLifecycleSync: 0,
        lastLogTime: 0,

        lastThinkTime: 0,
        isThinking: false,
        currentThought: null,
        aiIntent: null,
        thoughtClearTimeout: null,

        isInDialogue: false,
        isQuarreling: false,
        initialCooldown: Date.now() + 15000,
        lastConversationEnd: 0,
        dialogueCount: 0,
        processedRobotMsgId: 0,
        quarrelCount: 0,
        lastDialogueTime: 0,

        observedElements: new Set(),

        isDying: false,
        opacity: 1,
        fadeInterval: null,

        alive: true,
    };

    return state;
}

// -------------------------------------------------------------------------
// disposeCritter: clean up a single critter's resources
// -------------------------------------------------------------------------
function disposeCritter(cs: CritterState) {
    cs.alive = false;

    if (cs.thoughtClearTimeout) {
        clearTimeout(cs.thoughtClearTimeout);
        cs.thoughtClearTimeout = null;
    }
    if (cs.fadeInterval) {
        clearInterval(cs.fadeInterval);
        cs.fadeInterval = null;
    }

    // Physics
    try { cs.aggregate.dispose(); } catch (_) { /* already disposed */ }

    // Materials
    cs.bodyMat.dispose();
    cs.eyeMatL.dispose();
    cs.eyeMatR.dispose();
    cs.pupilLMat.dispose();
    cs.pupilRMat.dispose();

    // Meshes
    cs.bodyMesh.dispose();
    cs.eyeWhiteL.dispose();
    cs.eyeWhiteR.dispose();
    cs.pupilL.dispose();
    cs.pupilR.dispose();

    // Transform
    cs.rootNode.dispose();
}

// -------------------------------------------------------------------------
// Proximity-based dialogue initiation (replaces sensor collider)
// -------------------------------------------------------------------------
function checkProximityDialogue(cs: CritterState, elapsed: number) {
    if (cs.isInDialogue) return;
    const now = Date.now();
    if (now < cs.initialCooldown) return;

    const store = useStore.getState();
    const apiKey = store.apiKey;
    const provider = store.provider;
    if (!apiKey) return;
    if (store.isDialogueBusy) return;

    const myPos = store.entityPositions[cs.name];
    if (!myPos) return;

    const positions = store.entityPositions;
    const sensorRadius = 8.0;

    for (const [entityId, pos] of Object.entries(positions)) {
        if (entityId === cs.name) return;

        const dx = pos.x - myPos.x;
        const dz = pos.z - myPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > sensorRadius) continue;

        const isOtherRobot = entityId === "robot";
        const isOtherCritter = !isOtherRobot && store.critterRegistry.some(
            (c) => c.isAlive && c.name === entityId,
        );
        if (!isOtherRobot && !isOtherCritter) continue;

        const otherName = entityId;

        // Cooldown check
        if (!lastDialoguePair[cs.name]) lastDialoguePair[cs.name] = {};
        const lastTime = lastDialoguePair[cs.name][otherName] || 0;
        const cooldown = 120000;
        if (now - lastTime <= cooldown) continue;

        // Probability check
        const baseChance = isOtherRobot ? 0.20 : 0.10;
        const affinity = getAffinity(store.relationships, cs.name, otherName);
        const affinityMult = affinityToDialogueProbabilityMultiplier(affinity);
        const curiosityMult = 1 + cs.emotion.curiosity * 0.5;
        if (Math.random() > baseChance * affinityMult * curiosityMult) continue;

        const startQuarrel = !isOtherRobot && Math.random() < 0.05;

        lastDialoguePair[cs.name][otherName] = now;
        useStore.getState().setDialogueBusy(true);
        cs.dialogueCount = 0;
        cs.isQuarreling = startQuarrel;
        cs.isInDialogue = true;
        cs.lastDialogueTime = now;

        // Async dialogue generation
        (async () => {
            try {
                const state = useStore.getState();
                const relevantMemories = selectRelevantMemories(
                    state.critterMemories[cs.name] || [],
                    [otherName],
                    7,
                );
                const memoryContext = memoriesToPromptContext(relevantMemories);
                const envContext = buildEnvContext(
                    state.time,
                    state.weather,
                    myPos.x,
                    myPos.z,
                );
                const emotionContext = emotionToDialogueContext(cs.emotion);
                const affinityVal = getAffinity(state.relationships, cs.name, otherName);
                const relationContext = affinityToDialogueContext(affinityVal, otherName);
                const nearbyElements = getNearbyElements(myPos.x, myPos.z, 15, state.time);
                const dynamicThemes = generateThemeFromElements(nearbyElements);
                const theme = isOtherRobot
                    ? `${dynamicThemes}、またはロボットのこと`
                    : startQuarrel
                        ? "相手への文句"
                        : `${dynamicThemes}、または最近気になったこと`;

                const needsContext = needsToDialogueContext(cs.needs, "critter");
                const sicknessContext = sicknessToDialogueContext(cs.lifecycle);
                const bodyContext = [needsContext, sicknessContext].filter(Boolean).join("。");

                const prompt = isOtherRobot
                    ? `あなたは${cs.name}。性格: ${cs.personality}。${emotionContext}。${bodyContext ? bodyContext + "。" : ""}${relationContext}。
${envContext}。ロボットに${theme}について気軽に話しかけて。1〜2文で。大げさな表現は禁止。日本語で。
最近の記憶:\n${memoryContext}`
                    : `あなたは${cs.name}。性格: ${cs.personality}。${emotionContext}。${bodyContext ? bodyContext + "。" : ""}${relationContext}。
${envContext}。${otherName}に${theme}について${startQuarrel ? "短くイラッとした感じで" : "普通に"}話しかけて。1〜2文で。大げさ禁止。日本語で。
最近の記憶:\n${memoryContext}`;

                const response = await Promise.race([
                    generateSingleResponse(
                        provider,
                        apiKey,
                        prompt,
                        useStore.getState().critterSystemPrompt,
                    ),
                    new Promise<string>((_, reject) =>
                        setTimeout(() => reject(new Error("Timeout")), 8000),
                    ),
                ]);

                useStore.getState().addCritterMemory(
                    cs.name,
                    createMemory(
                        `${otherName}と会話した: ${response}`,
                        startQuarrel ? "quarrel" : "dialogue",
                        [cs.name, otherName],
                    ),
                );
                useStore.getState().addDialogue(cs.name, cs.name, response, false, otherName);
                cs.emotion = applyEmotionEvent(
                    cs.emotion,
                    startQuarrel ? "quarrel" : "positive_dialogue",
                );
                useStore.getState().adjustRelationship(
                    cs.name,
                    otherName,
                    startQuarrel ? -0.15 : 0.05,
                );
            } catch (error) {
                console.error("Critter initiate dialogue failed:", error);
                cs.isInDialogue = false;
                cs.isQuarreling = false;
                useStore.getState().setDialogueBusy(false);
                return;
            }

            // Post-dialogue cooldown
            setTimeout(() => {
                cs.isInDialogue = false;
                cs.isQuarreling = false;
                useStore.getState().setDialogueBusy(false);
            }, 3000);
        })();

        // Only initiate one dialogue per frame
        break;
    }
}

// -------------------------------------------------------------------------
// Check and respond to robot messages directed at this critter
// -------------------------------------------------------------------------
function checkRobotMessage(cs: CritterState) {
    if (cs.isInDialogue) return;

    const store = useStore.getState();
    const apiKey = store.apiKey;
    const provider = store.provider;
    if (!apiKey) return;

    // Find robot message targeting this critter
    const dialogues = Object.values(store.activeDialogues);
    const robotMessage = dialogues.find(
        (d) => d.isRobot && d.id === "robot" && d.targetId === cs.name,
    );
    if (!robotMessage) return;

    const now = Date.now();
    if (cs.processedRobotMsgId === robotMessage.timestamp) return;
    if (now - cs.lastConversationEnd < 60000) return;

    cs.processedRobotMsgId = robotMessage.timestamp;

    const timeSinceLastTalk = now - cs.lastConversationEnd;
    if (timeSinceLastTalk > 600000) {
        cs.dialogueCount = 0;
    }

    cs.isInDialogue = true;
    cs.lastDialogueTime = now;
    cs.dialogueCount += 1;

    if (cs.dialogueCount > 8) {
        cs.isInDialogue = false;
        cs.lastConversationEnd = now;
        return;
    }

    (async () => {
        try {
            const state = useStore.getState();
            const ids = [robotMessage.speakerId, cs.name].sort();
            const sessionId = ids.join(":");
            const history = state.conversationHistories[sessionId] || [];
            const relevantMemories = selectRelevantMemories(
                state.critterMemories[cs.name] || [],
                ["robot"],
                7,
            );
            const memoryContext = memoriesToPromptContext(relevantMemories);
            const myPos = state.entityPositions[cs.name];
            const px = myPos?.x ?? cs.homePos.x;
            const pz = myPos?.z ?? cs.homePos.z;
            const envContext = buildEnvContext(state.time, state.weather, px, pz);
            const emotionContext = emotionToDialogueContext(cs.emotion);
            const affinityVal = getAffinity(state.relationships, cs.name, "robot");
            const relationContext = affinityToDialogueContext(affinityVal, "robot");

            let directionPrompt = "";
            if (cs.dialogueCount >= 4) {
                directionPrompt = "そろそろ会話を切り上げる感じで。「じゃあね」とか「またね」程度で。";
            } else {
                directionPrompt = "普通に返事して。";
            }

            const prompt = `相手が「${robotMessage.text}」と言った。
性格: ${cs.personality}。${emotionContext}。${relationContext}。${envContext}。
${directionPrompt}1〜2文で。大げさ禁止。日本語で。
最近の記憶:\n${memoryContext}`;

            const response = await Promise.race([
                generateSingleResponse(
                    provider,
                    apiKey,
                    prompt,
                    useStore.getState().critterSystemPrompt,
                    history,
                ),
                new Promise<string>((_, reject) =>
                    setTimeout(() => reject(new Error("Timeout")), 8000),
                ),
            ]);

            useStore.getState().addCritterMemory(
                cs.name,
                createMemory(
                    `ロボットが「${robotMessage.text}」と言った。「${response}」と返した`,
                    "dialogue",
                    [cs.name, "robot"],
                ),
            );
            useStore.getState().addDialogue(cs.name, cs.name, response, false, "robot");
            cs.emotion = applyEmotionEvent(cs.emotion, "positive_dialogue");
            useStore.getState().adjustRelationship(cs.name, "robot", 0.05);
        } catch (error) {
            console.error("Critter response failed:", error);
        } finally {
            setTimeout(() => {
                cs.isInDialogue = false;
                cs.lastConversationEnd = Date.now();
            }, 5000);
        }
    })();
}

// -------------------------------------------------------------------------
// Check and respond to other critter messages directed at this critter
// -------------------------------------------------------------------------
function checkOtherCritterMessage(cs: CritterState) {
    if (cs.isInDialogue) return;

    const store = useStore.getState();
    const apiKey = store.apiKey;
    const provider = store.provider;
    if (!apiKey) return;

    const dialogues = Object.values(store.activeDialogues);
    const otherMsg = dialogues.find(
        (d) => !d.isRobot && d.targetId === cs.name && d.speakerId !== cs.name,
    );
    if (!otherMsg) return;

    // Quarrel limit
    if (cs.quarrelCount >= 1) {
        cs.quarrelCount = 0;
        return;
    }

    cs.isInDialogue = true;
    cs.quarrelCount += 1;

    const isAggressive =
        otherMsg.text.includes("！") ||
        otherMsg.text.includes("だめ") ||
        Math.random() < 0.2;
    if (isAggressive) cs.isQuarreling = true;

    (async () => {
        try {
            const prompt = `${otherMsg.speakerId}が「${otherMsg.text}」と言った。
性格: ${cs.personality}。普通に1〜2文で返して。大げさ禁止。日本語で。`;

            const response = await generateSingleResponse(
                provider,
                apiKey,
                prompt,
                useStore.getState().critterSystemPrompt,
            );
            useStore.getState().addDialogue(cs.name, cs.name, response, false, otherMsg.speakerId);
            cs.emotion = applyEmotionEvent(
                cs.emotion,
                isAggressive ? "quarrel" : "negative_dialogue",
            );
            useStore.getState().adjustRelationship(
                cs.name,
                otherMsg.speakerId,
                isAggressive ? -0.15 : -0.05,
            );
        } catch (e) {
            console.error("Critter to Critter response failed:", e);
        } finally {
            setTimeout(() => {
                cs.isInDialogue = false;
                cs.isQuarreling = false;
                if (cs.quarrelCount >= 3) cs.quarrelCount = 0;
            }, 3000);
        }
    })();
}

// -------------------------------------------------------------------------
// updateCritter: per-frame logic for one critter (called inside
//                scene.registerBeforeRender)
// -------------------------------------------------------------------------
function updateCritter(cs: CritterState, dt: number, elapsed: number) {
    if (!cs.alive) return;
    const t = elapsed;

    // =================================================================
    //  Dialogue stuck failsafe (10s)
    // =================================================================
    if (cs.isInDialogue && Date.now() - cs.lastDialogueTime > 10000) {
        console.warn(cs.name, "force exit dialogue");
        cs.isInDialogue = false;
        cs.isQuarreling = false;
    }

    // =================================================================
    //  Emotion decay (every frame, sync to store every 1s)
    // =================================================================
    cs.emotion = decayEmotions(cs.emotion, dt);

    if (t - cs.lastEmotionSync > 1.0) {
        const storeEmotion = useStore.getState().getEntityEmotion(cs.name);
        if (emotionChanged(storeEmotion, cs.emotion)) {
            useStore.getState().updateEntityEmotion(cs.name, { ...cs.emotion });
        }
        cs.lastEmotionSync = t;
    }

    // =================================================================
    //  Needs decay
    // =================================================================
    const storeState = useStore.getState();
    const isNight = storeState.time >= 18 || storeState.time < 6;
    cs.needs = decayNeeds(cs.needs, dt, "critter", isNight);

    // Needs sync (every 1s)
    if (t - cs.lastNeedsSync > 1.0) {
        storeState.updateEntityNeeds(cs.name, { ...cs.needs });
        cs.lastNeedsSync = t;

        if (cs.needs.hunger < 0.25) {
            cs.emotion = applyEmotionEvent(cs.emotion, "hunger_low", 0.3);
        }
    }

    // =================================================================
    //  Lifecycle tick (every 1s)
    // =================================================================
    if (t - cs.lastLifecycleSync > 1.0) {
        cs.lifecycle = tickLifecycle(cs.lifecycle, 1.0, cs.needs);
        storeState.updateEntityLifecycle(cs.name, { ...cs.lifecycle });
        cs.lastLifecycleSync = t;

        // Sickness -> emotion
        if (cs.lifecycle.healthStatus === "sick") {
            cs.emotion = applyEmotionEvent(cs.emotion, "sick", 0.2);
        }

        // Death
        if (cs.lifecycle.healthStatus === "dead" && !cs.isDying) {
            cs.isDying = true;

            useStore.getState().addActivityLog({
                category: "death",
                importance: "high",
                entityId: cs.name,
                content: `${cs.name} が死亡しました（世代: ${cs.lifecycle.generation}）`,
            });

            // Fade out
            cs.fadeInterval = setInterval(() => {
                cs.opacity -= 0.1;
                if (cs.opacity <= 0.05) {
                    if (cs.fadeInterval) {
                        clearInterval(cs.fadeInterval);
                        cs.fadeInterval = null;
                    }
                    cs.opacity = 0;

                    // Remove from registry
                    useStore.getState().removeCritter(cs.name);

                    // Add memory to nearby entities
                    const positions = useStore.getState().entityPositions;
                    const myPos = positions[cs.name];
                    if (myPos) {
                        for (const [eid, pos] of Object.entries(positions)) {
                            if (eid === cs.name) continue;
                            const dist = Math.sqrt(
                                (pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2,
                            );
                            if (dist < 20) {
                                if (eid === "robot") {
                                    useStore.getState().addRobotMemory(
                                        createMemory(
                                            `${cs.name}が死んでしまった`,
                                            "event",
                                            [cs.name],
                                            0.9,
                                            0.8,
                                        ),
                                    );
                                } else {
                                    useStore.getState().addCritterMemory(
                                        eid,
                                        createMemory(
                                            `${cs.name}が死んでしまった`,
                                            "event",
                                            [cs.name],
                                            0.9,
                                            0.8,
                                        ),
                                    );
                                }
                                const emotion = useStore.getState().getEntityEmotion(eid);
                                useStore.getState().updateEntityEmotion(
                                    eid,
                                    applyEmotionEvent(emotion, "entity_died"),
                                );
                            }
                        }
                    }

                    // Mark local state as dead for cleanup
                    cs.alive = false;
                }
            }, 300);
        }

        // Reproduction check
        const aliveCount = storeState.critterRegistry.filter((c) => c.isAlive).length;
        if (checkReproduction(cs.lifecycle, cs.needs, aliveCount)) {
            cs.lifecycle.reproductionCooldown = 60;
            const store = useStore.getState();
            const currentAlive = store.critterRegistry.filter((c) => c.isAlive).length;
            if (currentAlive < 8) {
                const myPos = store.entityPositions[cs.name] || {
                    x: cs.homePos.x,
                    z: cs.homePos.z,
                };
                const gen = cs.lifecycle.generation + 1;
                const childColor = mutateColor(cs.color);
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

                store.addActivityLog({
                    category: "event",
                    importance: "high",
                    entityId: childId,
                    content: `${childId} が誕生しました！親: ${cs.name}（世代: ${gen}）`,
                });

                store.addCritterMemory(
                    cs.name,
                    createMemory(
                        `子供(${childId})が生まれた！`,
                        "event",
                        [cs.name, childId],
                        0.9,
                        0.5,
                    ),
                );
                cs.emotion = applyEmotionEvent(cs.emotion, "new_birth");

                // Notify nearby entities
                const positions = store.entityPositions;
                for (const [eid, pos] of Object.entries(positions)) {
                    if (eid === cs.name) continue;
                    const dist = Math.sqrt(
                        (pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2,
                    );
                    if (dist < 20) {
                        if (eid === "robot") {
                            store.addRobotMemory(
                                createMemory(
                                    `${cs.name}の近くに新しいクリッターが生まれた`,
                                    "event",
                                    [cs.name, childId],
                                    0.7,
                                ),
                            );
                        } else {
                            store.addCritterMemory(
                                eid,
                                createMemory(
                                    `${cs.name}の近くに新しいクリッターが生まれた`,
                                    "event",
                                    [cs.name, childId],
                                    0.7,
                                ),
                            );
                        }
                        const emotion = store.getEntityEmotion(eid);
                        store.updateEntityEmotion(
                            eid,
                            applyEmotionEvent(emotion, "new_birth", 0.5),
                        );
                    }
                }
            }
        }
    }

    // =================================================================
    //  Resource eating: when near food, satisfy hunger
    // =================================================================
    if (!cs.isInDialogue) {
        const p = cs.rootNode.position;
        const resources = storeState.resourceNodes;
        const critterFoodTypes: ResourceType[] = ["mineral_ore", "glowing_mushroom"];
        const nearbyResources = getNearbyResources(resources, p.x, p.z, 2.0, critterFoodTypes);

        if (nearbyResources.length > 0 && nearbyResources[0].distance < 2.0) {
            cs.needs = satisfyNeed(cs.needs, "hunger", 0.15);
            cs.needs = satisfyNeed(cs.needs, "comfort", 0.05);
            const updated = storeState.resourceNodes.map((r) =>
                r.id === nearbyResources[0].id
                    ? { ...r, capacity: Math.max(0, r.capacity - 0.05) }
                    : r,
            );
            useStore.setState({ resourceNodes: updated });
        }
    }

    // =================================================================
    //  Position reporting (every 0.5s)
    // =================================================================
    if (t - cs.lastPositionUpdate > 0.5) {
        const p = cs.rootNode.position;
        useStore.getState().updateEntityPosition(cs.name, p.x, p.z);
        cs.lastPositionUpdate = t;
    }

    // =================================================================
    //  World element observation
    // =================================================================
    {
        const p = cs.rootNode.position;
        const store2 = useStore.getState();
        const nearby = getNearbyElements(p.x, p.z, 8, store2.time);
        for (const elem of nearby) {
            if (!cs.observedElements.has(elem.id)) {
                cs.observedElements.add(elem.id);
                store2.addCritterMemory(
                    cs.name,
                    createMemory(elem.description, "observation", ["environment"], 0.4),
                );
            }
        }
    }

    // =================================================================
    //  AI Thinking Loop (30-45s interval, staggered by personality)
    // =================================================================
    const thinkInterval = 30 + cs.personalityIndex * 5;
    const apiKey = useStore.getState().apiKey;
    const provider = useStore.getState().provider;

    if (apiKey && !cs.isThinking && !cs.isInDialogue && t - cs.lastThinkTime > thinkInterval) {
        cs.lastThinkTime = t;
        cs.isThinking = true;

        const thinkStore = useStore.getState();
        const myPos = thinkStore.entityPositions[cs.name];
        const positions = thinkStore.entityPositions;
        const nearbyEntities = Object.entries(positions)
            .filter(([eid]) => eid !== cs.name)
            .map(([eid, pos]) => ({
                id: eid,
                distance: myPos
                    ? Math.sqrt((pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2)
                    : 100,
            }))
            .filter((e) => e.distance < 25)
            .slice(0, 4);

        const relevantMemories = selectRelevantMemories(
            thinkStore.critterMemories[cs.name] || [],
            nearbyEntities.map((e) => e.id),
            3,
        );
        const memContext = memoriesToPromptContext(relevantMemories);
        const emotionCtx = emotionToDialogueContext(cs.emotion);
        const needsCtx = needsToDialogueContext(cs.needs, "critter");
        const hours = Math.floor(thinkStore.time);
        const minutes = Math.floor((thinkStore.time % 1) * 60);
        const timeStr = `${hours.toString().padStart(2, "0")}:${minutes
            .toString()
            .padStart(2, "0")}`;

        const contextPrompt = `あなたは${cs.name}。性格: ${cs.personality}
現在地: (${(myPos?.x ?? 0).toFixed(0)}, ${(myPos?.z ?? 0).toFixed(0)})
時刻: ${timeStr} / ${thinkStore.weather}
${emotionCtx}
${needsCtx ? needsCtx : ""}
近く: ${
            nearbyEntities.length > 0
                ? nearbyEntities
                      .map((e) => `${e.id}(${e.distance.toFixed(0)}m)`)
                      .join(", ")
                : "だれもいない"
        }
記憶: ${memContext}`;

        generateCritterThought(provider, apiKey, contextPrompt)
            .then((result) => {
                cs.aiIntent = result;
                cs.currentThought = result.thought;

                const gameTimeStr = `Day ${thinkStore.day}, ${timeStr}`;
                useStore.getState().addCritterThought(cs.name, {
                    thought: result.thought,
                    action: result.action,
                    timestamp: Date.now(),
                    gameTime: gameTimeStr,
                    critterName: cs.name,
                    color: cs.color,
                });

                useStore.getState().addActivityLog({
                    category: "thought",
                    importance: "low",
                    entityId: cs.name,
                    content: `[${cs.name}] ${result.action}: ${result.thought}`,
                });

                useStore.getState().addCritterMemory(
                    cs.name,
                    createMemory(
                        `[思考] ${result.thought}`,
                        "observation",
                        ["self"],
                        0.3,
                    ),
                );

                if (cs.thoughtClearTimeout) clearTimeout(cs.thoughtClearTimeout);
                cs.thoughtClearTimeout = setTimeout(() => {
                    cs.currentThought = null;
                    cs.thoughtClearTimeout = null;
                }, 5000);
            })
            .catch((err) => {
                console.error(`${cs.name} thinking failed:`, err);
            })
            .finally(() => {
                cs.isThinking = false;
            });
    }

    // =================================================================
    //  Dialogue checks (proximity-based sensor replacement)
    // =================================================================
    checkProximityDialogue(cs, t);
    checkRobotMessage(cs);
    checkOtherCritterMessage(cs);

    // =================================================================
    //  Physics & Movement
    // =================================================================
    const currentPos = cs.rootNode.position.clone();

    // --- Safety reset ---
    if (currentPos.y < -5) {
        cs.aggregate.body.disablePreStep = false;
        cs.rootNode.position = new Vector3(cs.homePos.x, 5, cs.homePos.z);
        cs.aggregate.body.setLinearVelocity(new Vector3(0, 0, 0));
    }

    // --- Terrain height correction ---
    const terrainY = getTerrainHeight(currentPos.x, currentPos.z);
    const correctedY = terrainY + 0.35;

    if (currentPos.y < correctedY - 0.2) {
        cs.aggregate.body.disablePreStep = false;
        cs.rootNode.position = new Vector3(currentPos.x, correctedY + 0.3, currentPos.z);
        const vel = cs.aggregate.body.getLinearVelocity();
        if (vel.y < 0) {
            cs.aggregate.body.setLinearVelocity(new Vector3(vel.x, 0, vel.z));
        }
    } else if (currentPos.y > correctedY + 2.0) {
        cs.aggregate.body.disablePreStep = false;
        cs.rootNode.position = new Vector3(currentPos.x, correctedY + 0.5, currentPos.z);
    }

    if (!cs.isInDialogue) {
        // Normal damping
        cs.aggregate.body.setLinearDamping(0);

        const store = useStore.getState();

        // --- Activity system ---
        const currentActivity = store.entityActivities[cs.name];
        if (shouldSwitchActivity(currentActivity)) {
            const positions = store.entityPositions;
            const myPos = positions[cs.name];
            const nearbyEntities = Object.entries(positions)
                .filter(([eid]) => eid !== cs.name)
                .map(([eid, pos]) => ({
                    id: eid,
                    distance: myPos
                        ? Math.sqrt((pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2)
                        : 100,
                }))
                .filter((e) => e.distance < 30);

            const desires = computeDesires(cs.needs, "critter");
            const newActivity = selectNextActivity(
                cs.emotion,
                store.time,
                store.weather,
                store.relationships,
                cs.name,
                nearbyEntities,
                desires,
            );

            // Override with AI intent if available
            if (cs.aiIntent) {
                const intent = cs.aiIntent;
                const validActivities: string[] = [
                    "explore",
                    "forage",
                    "rest",
                    "socialize",
                    "seek_resource",
                    "flee",
                    "idle",
                ];
                if (validActivities.includes(intent.action)) {
                    newActivity.current = intent.action as typeof newActivity.current;
                }
                cs.aiIntent = null;
            }

            // If seeking resource, find nearest food
            if (newActivity.current === "seek_resource" && myPos) {
                const critterFoodTypes: ResourceType[] = ["mineral_ore", "glowing_mushroom"];
                const nearbyRes = getNearbyResources(
                    store.resourceNodes,
                    myPos.x,
                    myPos.z,
                    50,
                    critterFoodTypes,
                );
                if (nearbyRes.length > 0) {
                    newActivity.targetResourceId = nearbyRes[0].id;
                }
            }

            store.setEntityActivity(cs.name, newActivity);
        }

        const activity = store.entityActivities[cs.name]?.current || "forage";
        const pattern = getActivityMovementPattern(activity);

        // --- Activity-based movement ---
        if (activity === "rest") {
            // Stay still
            const vel = cs.aggregate.body.getLinearVelocity();
            cs.aggregate.body.setLinearVelocity(new Vector3(0, vel.y, 0));
        } else if (activity === "seek_resource") {
            // Move toward target resource
            const resId = store.entityActivities[cs.name]?.targetResourceId;
            const resNode = resId
                ? store.resourceNodes.find((r) => r.id === resId)
                : null;
            if (resNode && resNode.capacity > 0.05) {
                cs.targetPos.set(resNode.position.x, 0.5, resNode.position.z);
            } else {
                // Resource depleted, find another
                const myPos2 = store.entityPositions[cs.name];
                if (myPos2) {
                    const critterFoodTypes2: ResourceType[] = [
                        "mineral_ore",
                        "glowing_mushroom",
                    ];
                    const nearby2 = getNearbyResources(
                        store.resourceNodes,
                        myPos2.x,
                        myPos2.z,
                        50,
                        critterFoodTypes2,
                    );
                    if (nearby2.length > 0) {
                        cs.targetPos.set(
                            nearby2[0].position.x,
                            0.5,
                            nearby2[0].position.z,
                        );
                    }
                }
            }
        } else {
            // Wander logic
            const distToTarget = Vector3.Distance(
                new Vector3(currentPos.x, 0, currentPos.z),
                new Vector3(cs.targetPos.x, 0, cs.targetPos.z),
            );

            if (distToTarget < 0.5 || t > cs.nextMoveTime) {
                const r = pattern.wanderRadius || 10;
                const hw = pattern.homeAffinity;

                if (activity === "socialize") {
                    const socialTarget = store.entityActivities[cs.name]?.targetEntityId;
                    const socialPos = socialTarget
                        ? store.entityPositions[socialTarget]
                        : null;
                    if (socialPos) {
                        cs.targetPos.set(
                            socialPos.x + (Math.random() - 0.5) * 4,
                            0.5,
                            socialPos.z + (Math.random() - 0.5) * 4,
                        );
                    } else {
                        cs.targetPos.set(
                            cs.homePos.x + (Math.random() - 0.5) * r * 2,
                            0.5,
                            cs.homePos.z + (Math.random() - 0.5) * r * 2,
                        );
                    }
                } else if (activity === "flee") {
                    cs.targetPos.set(
                        cs.homePos.x + (Math.random() - 0.5) * 3,
                        0.5,
                        cs.homePos.z + (Math.random() - 0.5) * 3,
                    );
                } else {
                    // Normal wander: blend random and home-biased
                    const randX = (Math.random() - 0.5) * r * 2;
                    const randZ = (Math.random() - 0.5) * r * 2;
                    cs.targetPos.set(
                        cs.homePos.x * hw + randX * (1 - hw * 0.5),
                        0.5,
                        cs.homePos.z * hw + randZ * (1 - hw * 0.5),
                    );
                }
                cs.nextMoveTime = t + 5 + Math.random() * 8;
            }

            // --- Relationship-based movement bias ---
            const positions = store.entityPositions;
            const relationships = store.relationships;
            for (const [entityId, pos] of Object.entries(positions)) {
                if (entityId === cs.name) continue;
                const dx = pos.x - currentPos.x;
                const dz = pos.z - currentPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < 15) {
                    const aff = getAffinity(relationships, cs.name, entityId);
                    if (
                        shouldAvoid(aff) ||
                        (entityId === "robot" && cs.emotion.fear > 0.4)
                    ) {
                        cs.targetPos.x -= dx * 0.3;
                        cs.targetPos.z -= dz * 0.3;
                    } else if (shouldApproach(aff)) {
                        cs.targetPos.x += dx * 0.2;
                        cs.targetPos.z += dz * 0.2;
                    }
                }
            }
        }

        // --- Velocity toward target ---
        const direction = cs.targetPos.subtract(currentPos).normalize();
        const lifecycleSpeedMult = getSpeedMultiplier(cs.lifecycle);
        const speed =
            activity === "rest"
                ? 0
                : 2.0 *
                  emotionToSpeedMultiplier(cs.emotion) *
                  pattern.speedMultiplier *
                  lifecycleSpeedMult;

        const vel = cs.aggregate.body.getLinearVelocity();
        cs.aggregate.body.setLinearVelocity(
            new Vector3(direction.x * speed, vel.y, direction.z * speed),
        );

        // Occasional hop
        if (Math.random() < 0.005) {
            const curVel = cs.aggregate.body.getLinearVelocity();
            cs.aggregate.body.setLinearVelocity(
                new Vector3(curVel.x, curVel.y + 2.0, curVel.z),
            );
        }

        // --- Rotation toward movement direction ---
        if (speed > 0.01) {
            const angle = Math.atan2(direction.x, direction.z);
            const targetQ = Quaternion.FromEulerAngles(0, angle, 0);
            if (cs.rootNode.rotationQuaternion) {
                Quaternion.SlerpToRef(
                    cs.rootNode.rotationQuaternion,
                    targetQ,
                    0.1,
                    cs.rootNode.rotationQuaternion,
                );
            } else {
                cs.rootNode.rotationQuaternion = Quaternion.Slerp(
                    Quaternion.Identity(),
                    targetQ,
                    0.1,
                );
            }
        }
    } else {
        // --- In dialogue: high damping, minimal movement ---
        cs.aggregate.body.setLinearDamping(20);

        if (cs.isQuarreling) {
            cs.aggregate.body.setLinearVelocity(
                new Vector3(
                    (Math.random() - 0.5) * 5,
                    0,
                    (Math.random() - 0.5) * 5,
                ),
            );
        } else {
            cs.aggregate.body.setLinearVelocity(new Vector3(0, 0, 0));
        }
    }

    // =================================================================
    //  Dynamic material updates (emotion color, opacity for dying)
    // =================================================================
    const emotionColor = hexToColor3(emotionToColor(cs.emotion, cs.color));
    cs.bodyMat.diffuseColor = emotionColor;

    if (cs.opacity < 1) {
        cs.bodyMat.alpha = cs.opacity;
        cs.eyeMatL.alpha = cs.opacity;
        cs.eyeMatR.alpha = cs.opacity;
        cs.pupilLMat.alpha = cs.opacity;
        cs.pupilRMat.alpha = cs.opacity;
    }

    // Update pupil size based on curiosity
    const pupilScale = 1 + cs.emotion.curiosity * 0.5;
    cs.pupilL.scaling = new Vector3(pupilScale, pupilScale, pupilScale);
    cs.pupilR.scaling = new Vector3(pupilScale, pupilScale, pupilScale);
}

// =========================================================================
// createCritters  -- main factory
// =========================================================================
export function createCritters(scene: Scene): { dispose: () => void } {
    // Map of active critter states keyed by critter id
    const critterMap = new Map<string, CritterState>();

    // Track which registry IDs we have already spawned
    const spawnedIds = new Set<string>();

    // Accumulated elapsed time
    let elapsed = 0;

    // Registry poll interval for dynamic spawning/death
    let registryPollTimer = 0;
    const REGISTRY_POLL_INTERVAL = 1.0; // check every 1s

    // ------------------------------------------------------------------
    //  Initial spawn from registry
    // ------------------------------------------------------------------
    const registry = useStore.getState().critterRegistry;
    for (const entry of registry) {
        if (entry.isAlive) {
            const cs = createCritterVisuals(scene, entry);
            critterMap.set(entry.id, cs);
            spawnedIds.add(entry.id);
        }
    }

    // ------------------------------------------------------------------
    //  registerBeforeRender: main loop
    // ------------------------------------------------------------------
    const renderCallback = () => {
        const dt = scene.getEngine().getDeltaTime() / 1000;
        elapsed += dt;

        // --- Dynamic registry watch (spawn new / detect dead) ---
        registryPollTimer += dt;
        if (registryPollTimer > REGISTRY_POLL_INTERVAL) {
            registryPollTimer = 0;
            const currentRegistry = useStore.getState().critterRegistry;

            // Spawn new critters
            for (const entry of currentRegistry) {
                if (entry.isAlive && !spawnedIds.has(entry.id)) {
                    const cs = createCritterVisuals(scene, entry);
                    critterMap.set(entry.id, cs);
                    spawnedIds.add(entry.id);
                }
            }

            // Clean up dead critters that have finished fading
            for (const [cid, cs] of critterMap.entries()) {
                if (!cs.alive && cs.opacity <= 0) {
                    disposeCritter(cs);
                    critterMap.delete(cid);
                }
            }

            // Mark critters that died in registry but haven't started dying
            for (const entry of currentRegistry) {
                if (!entry.isAlive && critterMap.has(entry.id)) {
                    const cs = critterMap.get(entry.id)!;
                    if (!cs.isDying) {
                        cs.isDying = true;
                        cs.lifecycle.healthStatus = "dead";
                        // Start fade
                        cs.fadeInterval = setInterval(() => {
                            cs.opacity -= 0.1;
                            if (cs.opacity <= 0.05) {
                                if (cs.fadeInterval) {
                                    clearInterval(cs.fadeInterval);
                                    cs.fadeInterval = null;
                                }
                                cs.opacity = 0;
                                cs.alive = false;
                            }
                        }, 300);
                    }
                }
            }
        }

        // --- Update each living critter ---
        for (const cs of critterMap.values()) {
            updateCritter(cs, dt, elapsed);
        }
    };

    scene.registerBeforeRender(renderCallback);

    // ------------------------------------------------------------------
    //  Dispose: clean up everything
    // ------------------------------------------------------------------
    function dispose() {
        scene.unregisterBeforeRender(renderCallback);

        for (const cs of critterMap.values()) {
            disposeCritter(cs);
        }
        critterMap.clear();
        spawnedIds.clear();
    }

    return { dispose };
}
