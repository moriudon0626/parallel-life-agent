import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3, Quaternion, Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { useStore } from "../../store";
import { createMemory, selectRelevantMemories, memoriesToPromptContext } from "../../store";
import { generateThought, type ThoughtResult } from "../../lib/llm";
import {
    applyEmotionEvent,
    decayEmotions,
    emotionToColor,
    emotionToSpeedMultiplier,
    emotionToDialogueContext,
    emotionChanged,
    DEFAULT_EMOTION,
    type EmotionState,
} from "../../lib/emotions";
import {
    selectNextActivity,
    shouldSwitchActivity,
    getActivityMovementPattern,
} from "../../lib/activities";
import { getNearbyElements, buildEnvContext } from "../../lib/worldElements";
import {
    decayNeeds,
    satisfyNeed,
    computeDesires,
    needsToDialogueContext,
    createDefaultNeeds,
    type NeedsState,
} from "../../lib/needs";
import {
    getNearbyResources,
    attemptGatherResource,
    consumeResource,
    getResourceValue,
} from "../../lib/resources";
import { getTerrainHeight } from "../../lib/terrain";

// -------------------------------------------------------------------------
// State-machine type
// -------------------------------------------------------------------------
type RobotState = "IDLE" | "MOVING" | "DIALOGUE";

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
// createRobot  -- main factory
// -------------------------------------------------------------------------
export function createRobot(scene: Scene): { rootNode: TransformNode; dispose: () => void } {
    // =====================================================================
    //  1. Visual Mesh Construction
    // =====================================================================

    // Root transform -- everything is parented here
    const rootNode = new TransformNode("robotRoot", scene);
    rootNode.position = new Vector3(0, 5, 0);
    rootNode.scaling = new Vector3(2, 2, 2);

    // --- Body (Dodecahedron) ---
    const body = MeshBuilder.CreatePolyhedron(
        "robotBody",
        { type: 2, size: 0.45 },
        scene,
    );
    body.parent = rootNode;

    const bodyMat = new StandardMaterial("robotBodyMat", scene);
    bodyMat.diffuseColor = Color3.FromHexString("#FFA500");
    bodyMat.specularColor = new Color3(0.5, 0.5, 0.5);
    bodyMat.roughness = 0.1;
    body.material = bodyMat;
    body.receiveShadows = true;
    // Babylon shadow casters are added externally via ShadowGenerator.addShadowCaster(body)

    // --- Inner glow core ---
    const core = MeshBuilder.CreateSphere("robotCore", { diameter: 0.6 }, scene);
    core.parent = rootNode;

    const coreMat = new StandardMaterial("robotCoreMat", scene);
    coreMat.diffuseColor = Color3.FromHexString("#FFA500");
    coreMat.emissiveColor = Color3.FromHexString("#FFA500");
    coreMat.alpha = 0.4;
    core.material = coreMat;

    // --- Orbiting ring ---
    const ring = MeshBuilder.CreateTorus(
        "robotRing",
        { diameter: 1.1, thickness: 0.04, tessellation: 32 },
        scene,
    );
    ring.parent = rootNode;
    ring.rotation.x = Math.PI / 2;

    const ringMat = new StandardMaterial("robotRingMat", scene);
    ringMat.diffuseColor = Color3.White();
    ringMat.specularColor = new Color3(0.9, 0.9, 0.9);
    ringMat.roughness = 0.1;
    ring.material = ringMat;

    // --- Floating head group ---
    const headGroup = new TransformNode("robotHeadGroup", scene);
    headGroup.parent = rootNode;
    headGroup.position = new Vector3(0, 0.6, 0);

    // Head box
    const headBox = MeshBuilder.CreateBox(
        "robotHeadBox",
        { width: 0.4, height: 0.3, depth: 0.4 },
        scene,
    );
    headBox.parent = headGroup;

    const headMat = new StandardMaterial("robotHeadMat", scene);
    headMat.diffuseColor = Color3.White();
    headMat.specularColor = new Color3(0.8, 0.8, 0.8);
    headMat.roughness = 0.2;
    headBox.material = headMat;
    headBox.receiveShadows = true;

    // Display plane (front face)
    const display = MeshBuilder.CreatePlane(
        "robotDisplay",
        { width: 0.3, height: 0.1 },
        scene,
    );
    display.parent = headGroup;
    display.position = new Vector3(0, 0.05, 0.18);

    const displayMat = new StandardMaterial("robotDisplayMat", scene);
    displayMat.emissiveColor = Color3.FromHexString("#00FFCC");
    displayMat.disableLighting = true;
    display.material = displayMat;

    // Antenna cylinder
    const antenna = MeshBuilder.CreateCylinder(
        "robotAntenna",
        { diameter: 0.04, height: 0.3, tessellation: 8 },
        scene,
    );
    antenna.parent = headGroup;
    antenna.position = new Vector3(0, 0.25, 0);

    const antennaMat = new StandardMaterial("robotAntennaMat", scene);
    antennaMat.diffuseColor = Color3.FromHexString("#333333");
    antenna.material = antennaMat;

    // Red light at antenna tip
    const light = MeshBuilder.CreateSphere(
        "robotAntennaLight",
        { diameter: 0.1 },
        scene,
    );
    light.parent = headGroup;
    light.position = new Vector3(0, 0.4, 0);

    const lightMat = new StandardMaterial("robotLightMat", scene);
    lightMat.diffuseColor = Color3.Red();
    lightMat.emissiveColor = Color3.Red();
    lightMat.disableLighting = true;
    light.material = lightMat;

    // =====================================================================
    //  2. Physics
    // =====================================================================

    const aggregate = new PhysicsAggregate(
        rootNode,
        PhysicsShapeType.SPHERE,
        { mass: 1, restitution: 0.1, friction: 0.8 },
        scene,
    );
    aggregate.body.setLinearDamping(0.5);
    aggregate.body.setAngularDamping(0.5);

    // =====================================================================
    //  3. Mutable state (replaces React refs / useState)
    // =====================================================================

    let robotState: RobotState = "IDLE";
    let targetPos: Vector3 | null = null;
    const targetRotation = Quaternion.Identity();

    // Timers
    let nextDecisionTime = 0.5;
    let elapsed = 0; // accumulated scene time (seconds)
    let lastPositionUpdate = 0;
    let lastEmotionSync = 0;
    let lastNeedsSync = 0;
    let lastGatherCheck = 0;
    let lastThinkTime = 0;
    let isThinking = false;
    let lastStateChangeTime = Date.now();

    // Emotion & Needs
    let emotion: EmotionState = { ...DEFAULT_EMOTION };
    let needs: NeedsState = createDefaultNeeds("robot");

    // AI intent from thinking
    let aiIntent: ThoughtResult | null = null;
    let currentThought: string | null = null;
    let thoughtClearTimeout: ReturnType<typeof setTimeout> | null = null;

    // World element observation tracking
    const observedElements = new Set<string>();

    // =====================================================================
    //  Helper: setState wrapper that tracks timestamp
    // =====================================================================
    function setRobotState(newState: RobotState) {
        if (robotState !== newState) {
            robotState = newState;
            lastStateChangeTime = Date.now();
        }
    }

    // =====================================================================
    //  4. registerBeforeRender -- the main update loop
    // =====================================================================

    scene.registerBeforeRender(() => {
        const dt = scene.getEngine().getDeltaTime() / 1000; // seconds
        elapsed += dt;
        const t = elapsed; // convenience alias matching the R3F `clock.getElapsedTime()`

        // =================================================================
        //  Emotion decay (every frame, sync to store every 1s)
        // =================================================================
        emotion = decayEmotions(emotion, dt);

        if (t - lastEmotionSync > 1.0) {
            const storeEmotion = useStore.getState().getEntityEmotion("robot");
            if (emotionChanged(storeEmotion, emotion)) {
                useStore.getState().updateEntityEmotion("robot", { ...emotion });
            }
            lastEmotionSync = t;
        }

        // =================================================================
        //  Needs decay (every frame, sync to store every 1s)
        // =================================================================
        const storeForNeeds = useStore.getState();
        const isNight = storeForNeeds.time >= 18 || storeForNeeds.time < 6;
        needs = decayNeeds(needs, dt, "robot", isNight);

        // Solar charging during sunny daytime
        if (!isNight && storeForNeeds.weather === "sunny") {
            needs = satisfyNeed(needs, "energy", 0.0008 * dt);
        }

        // Sync needs to store every 1s
        if (t - lastNeedsSync > 1.0) {
            storeForNeeds.updateEntityNeeds("robot", { ...needs });
            lastNeedsSync = t;
        }

        // =================================================================
        //  Robot Status (battery, temperature, malfunction)
        // =================================================================
        const robotStatus = storeForNeeds.robotStatus;

        // Battery drain: 1% per minute
        const batteryDrain = 1.0 * (dt / 60);
        let finalBattery = Math.max(0, robotStatus.battery - batteryDrain);

        // Solar charging: 0.5% per minute during sunny daytime
        if (!isNight && storeForNeeds.weather === "sunny") {
            finalBattery = Math.min(100, finalBattery + 0.5 * dt / 60);
        }

        // Temperature convergence toward environment
        const tempDiff = storeForNeeds.temperature - robotStatus.temperature;
        const newTemp = robotStatus.temperature + tempDiff * 0.01 * dt;

        // Malfunction detection
        const malfunctioning = finalBattery <= 0;

        // Persist every frame
        storeForNeeds.updateRobotStatus({
            battery: finalBattery,
            durability: robotStatus.durability,
            temperature: newTemp,
            malfunctioning,
            overheated: newTemp > 40,
            frozen: newTemp < -10,
            repairParts: robotStatus.repairParts,
        });

        // Log critical state change
        if (!robotStatus.malfunctioning && malfunctioning) {
            storeForNeeds.addActivityLog({
                category: "warning",
                importance: "critical",
                entityId: "robot",
                content: "ロボットのバッテリーが切れました！機能停止中...",
            });
        }

        // =================================================================
        //  Position reporting (every 0.5s)
        // =================================================================
        if (t - lastPositionUpdate > 0.5) {
            const p = rootNode.position;
            useStore.getState().updateEntityPosition("robot", p.x, p.z);
            lastPositionUpdate = t;
        }

        // =================================================================
        //  World element observation
        // =================================================================
        {
            const p = rootNode.position;
            const storeState = useStore.getState();
            const nearby = getNearbyElements(p.x, p.z, 8, storeState.time);
            for (const elem of nearby) {
                if (!observedElements.has(elem.id)) {
                    observedElements.add(elem.id);
                    storeState.addRobotMemory(
                        createMemory(elem.description, "observation", ["environment"], 0.4),
                    );
                }
            }
        }

        // =================================================================
        //  Resource Gathering (every 2s)
        // =================================================================
        if (t - lastGatherCheck > 2) {
            lastGatherCheck = t;
            const p = rootNode.position;
            const gatherStore = useStore.getState();

            // Energy node charging
            const energyNodes = getNearbyResources(
                gatherStore.resourceNodes,
                p.x,
                p.z,
                2.5,
                ["energy_node"],
            );
            if (energyNodes.length > 0 && energyNodes[0].distance < 2.5) {
                needs = satisfyNeed(needs, "energy", 0.05 * dt);
                const updated = gatherStore.resourceNodes.map((r) =>
                    r.id === energyNodes[0].id
                        ? { ...r, capacity: Math.max(0, r.capacity - 0.02 * dt) }
                        : r,
                );
                useStore.setState({ resourceNodes: updated });
            }

            // Material gathering (scrap_metal, fiber, crystal)
            const materialNodes = getNearbyResources(
                gatherStore.resourceNodes,
                p.x,
                p.z,
                5.0,
                ["scrap_metal", "fiber", "crystal"],
            );

            if (materialNodes.length > 0) {
                const node = materialNodes[0];
                if (node.capacity > 0.05) {
                    const hasTool = false;
                    const result = attemptGatherResource(node, hasTool);

                    if (result.success) {
                        const materialType = node.type as "scrap_metal" | "fiber" | "crystal";
                        const effectiveAmount = Math.max(
                            1,
                            Math.floor(getResourceValue(node, result.amount) * 10),
                        );
                        gatherStore.addInventoryItem(materialType, effectiveAmount);

                        const updatedRes = consumeResource(
                            gatherStore.resourceNodes,
                            node.id,
                            result.amount,
                        );
                        useStore.setState({ resourceNodes: updatedRes });

                        gatherStore.addActivityLog({
                            category: "event",
                            importance: "normal",
                            entityId: "robot",
                            content: `${node.name}を採取しました（x${effectiveAmount}）`,
                        });

                        gatherStore.addRobotMemory(
                            createMemory(
                                `${node.name}を採取した（x${effectiveAmount}）`,
                                "event",
                                ["resource"],
                                0.6,
                            ),
                        );

                        if (result.damaged) {
                            const newDurability = Math.max(
                                0,
                                gatherStore.robotStatus.durability - 5,
                            );
                            gatherStore.updateRobotStatus({
                                ...gatherStore.robotStatus,
                                durability: newDurability,
                            });
                            gatherStore.addActivityLog({
                                category: "warning",
                                importance: "normal",
                                entityId: "robot",
                                content: "採取中にダメージを受けました（-5 耐久度）",
                            });
                            gatherStore.addRobotMemory(
                                createMemory(
                                    "採取中にダメージを受けた",
                                    "event",
                                    ["damage"],
                                    0.7,
                                ),
                            );
                        }
                    }
                }
            }
        }

        // =================================================================
        //  AI Thinking Loop (every 20s)
        // =================================================================
        const apiKey = useStore.getState().apiKey;
        const provider = useStore.getState().provider;

        if (apiKey && !isThinking && t - lastThinkTime > 20) {
            lastThinkTime = t;
            isThinking = true;

            const thinkStore = useStore.getState();
            const robotPos = thinkStore.entityPositions["robot"];
            const positions = thinkStore.entityPositions;
            const nearbyEntities = Object.entries(positions)
                .filter(([eid]) => eid !== "robot")
                .map(([eid, pos]) => ({
                    id: eid,
                    distance: robotPos
                        ? Math.sqrt(
                              (pos.x - robotPos.x) ** 2 + (pos.z - robotPos.z) ** 2,
                          )
                        : 100,
                }))
                .filter((e) => e.distance < 30)
                .slice(0, 5);

            const relevantMemories = selectRelevantMemories(
                thinkStore.robotMemories,
                nearbyEntities.map((e) => e.id),
                5,
            );
            const memContext = memoriesToPromptContext(relevantMemories);
            const emotionCtx = emotionToDialogueContext(emotion);
            const needsCtx = needsToDialogueContext(needs, "robot");
            const hours = Math.floor(thinkStore.time);
            const minutes = Math.floor((thinkStore.time % 1) * 60);
            const timeStr = `${hours.toString().padStart(2, "0")}:${minutes
                .toString()
                .padStart(2, "0")}`;

            // Build previous thoughts context
            const recentThoughts = thinkStore.robotThoughts.slice(-3);
            const prevThoughtsCtx =
                recentThoughts.length > 0
                    ? recentThoughts
                          .map(
                              (th) =>
                                  `[${th.gameTime}] 思考:「${th.thought}」-> 行動: ${th.action}`,
                          )
                          .join("\n")
                    : "なし";

            const userDirective = thinkStore.userDirective;

            const contextPrompt = `現在地: (${(robotPos?.x ?? 0).toFixed(0)}, ${(robotPos?.z ?? 0).toFixed(0)})
時刻: ${timeStr} / Day ${thinkStore.day} / ${thinkStore.season}
天気: ${thinkStore.weather} / 気温: ${thinkStore.temperature}°C
${emotionCtx}
${needsCtx ? needsCtx : ""}
近くのエンティティ: ${
                nearbyEntities.length > 0
                    ? nearbyEntities
                          .map((e) => `${e.id}(距離${e.distance.toFixed(0)})`)
                          .join(", ")
                    : "なし"
            }
前回の思考:
${prevThoughtsCtx}
${userDirective ? `\nユーザーからの指示: ${userDirective}` : ""}
最近の記憶:
${memContext}`;

            generateThought(provider, apiKey, contextPrompt)
                .then((result) => {
                    aiIntent = result;
                    currentThought = result.thought;

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
                        category: "thought",
                        importance: "normal",
                        entityId: "robot",
                        content: `${result.action}: ${result.thought}`,
                    });

                    // Store as memory
                    useStore.getState().addRobotMemory(
                        createMemory(
                            `[思考] ${result.thought}`,
                            "observation",
                            ["self"],
                            0.5,
                        ),
                    );

                    // Clear user directive after consuming
                    if (userDirective) {
                        useStore.getState().setUserDirective(null);
                    }

                    // Clear thought bubble after 5 seconds
                    if (thoughtClearTimeout) clearTimeout(thoughtClearTimeout);
                    thoughtClearTimeout = setTimeout(() => {
                        currentThought = null;
                        thoughtClearTimeout = null;
                    }, 5000);
                })
                .catch((err) => {
                    console.error("AI thinking failed:", err);
                })
                .finally(() => {
                    isThinking = false;
                });
        }

        // =================================================================
        //  Failsafe: Reset stuck DIALOGUE state after 10s
        // =================================================================
        if (robotState === "DIALOGUE" && Date.now() - lastStateChangeTime > 10000) {
            console.warn("Robot stuck in DIALOGUE, forcing reset");
            setRobotState("IDLE");
        }

        // =================================================================
        //  Animation: Floating Head
        // =================================================================
        headGroup.position.y = 0.6 + Math.sin(t * 2) * 0.05;
        headGroup.rotation.y = Math.sin(t * 0.5) * 0.1;

        // =================================================================
        //  Activity System (every 3-8s via nextDecisionTime)
        // =================================================================
        if (robotState !== "DIALOGUE" && t > nextDecisionTime) {
            const store = useStore.getState();
            const currentActivity = store.entityActivities["robot"];

            if (shouldSwitchActivity(currentActivity)) {
                // Gather nearby entities for activity selection
                const positions = store.entityPositions;
                const robotPos = positions["robot"];
                const nearbyEnts = Object.entries(positions)
                    .filter(([id]) => id !== "robot")
                    .map(([id, pos]) => ({
                        id,
                        distance: robotPos
                            ? Math.sqrt(
                                  (pos.x - robotPos.x) ** 2 +
                                      (pos.z - robotPos.z) ** 2,
                              )
                            : 100,
                    }))
                    .filter((e) => e.distance < 30);

                const desires = computeDesires(needs, "robot");
                let newActivity;

                // Use AI intent if available
                if (aiIntent) {
                    const intent = aiIntent;
                    const validActivities: string[] = [
                        "explore",
                        "forage",
                        "rest",
                        "socialize",
                        "seek_resource",
                        "patrol",
                        "idle",
                    ];
                    newActivity = selectNextActivity(
                        emotion,
                        store.time,
                        store.weather,
                        store.relationships,
                        "robot",
                        nearbyEnts,
                        desires,
                    );
                    const activity = validActivities.includes(intent.action)
                        ? intent.action
                        : "explore";
                    newActivity.current = activity as typeof newActivity.current;
                    aiIntent = null; // consumed
                } else {
                    newActivity = selectNextActivity(
                        emotion,
                        store.time,
                        store.weather,
                        store.relationships,
                        "robot",
                        nearbyEnts,
                        desires,
                    );
                }

                // If seeking resource (energy), find nearest energy node
                if (newActivity.current === "seek_resource") {
                    const robotPos2 = positions["robot"];
                    if (robotPos2) {
                        const nearbyRes = getNearbyResources(
                            store.resourceNodes,
                            robotPos2.x,
                            robotPos2.z,
                            50,
                            ["energy_node"],
                        );
                        if (nearbyRes.length > 0) {
                            newActivity.targetResourceId = nearbyRes[0].id;
                        }
                    }
                }

                store.setEntityActivity("robot", newActivity);

                const pattern = getActivityMovementPattern(newActivity.current);

                if (newActivity.current === "rest") {
                    setRobotState("IDLE");
                    targetPos = null;
                    nextDecisionTime = t + newActivity.duration;
                } else if (
                    newActivity.current === "seek_resource" &&
                    newActivity.targetResourceId
                ) {
                    const resNode = store.resourceNodes.find(
                        (r) => r.id === newActivity.targetResourceId,
                    );
                    if (resNode) {
                        targetPos = new Vector3(
                            resNode.position.x,
                            0.5,
                            resNode.position.z,
                        );
                        setRobotState("MOVING");
                        nextDecisionTime = t + 8 + Math.random() * 5;
                    }
                } else if (
                    newActivity.current === "socialize" &&
                    newActivity.targetEntityId
                ) {
                    const targetEntPos = positions[newActivity.targetEntityId];
                    if (targetEntPos) {
                        targetPos = new Vector3(
                            targetEntPos.x + (Math.random() - 0.5) * 3,
                            0.5,
                            targetEntPos.z + (Math.random() - 0.5) * 3,
                        );
                    } else {
                        targetPos = new Vector3(
                            (Math.random() - 0.5) * 10,
                            0.5,
                            (Math.random() - 0.5) * 10,
                        );
                    }
                    setRobotState("MOVING");
                    nextDecisionTime = t + 5 + Math.random() * 5;
                } else {
                    // explore, forage, patrol, idle
                    const r = pattern.wanderRadius;
                    const homeWeight = pattern.homeAffinity;
                    const currentRobotPos = positions["robot"];
                    const curX = currentRobotPos?.x ?? 0;
                    const curZ = currentRobotPos?.z ?? 0;
                    const baseX = curX * (1 - homeWeight);
                    const baseZ = curZ * (1 - homeWeight);
                    const newTarget = new Vector3(
                        baseX + (Math.random() - 0.5) * 2 * r,
                        0.5,
                        baseZ + (Math.random() - 0.5) * 2 * r,
                    );
                    // Clamp to world bounds
                    newTarget.x = Math.max(-90, Math.min(90, newTarget.x));
                    newTarget.z = Math.max(-90, Math.min(90, newTarget.z));
                    targetPos = newTarget;
                    setRobotState("MOVING");
                    nextDecisionTime = t + 4 + Math.random() * 4;
                }
            } else if (robotState === "MOVING" && !targetPos) {
                setRobotState("IDLE");
                nextDecisionTime = t + 2 + Math.random() * 2;
            } else if (robotState === "IDLE") {
                // Continue current activity with new wander target
                const activity = currentActivity?.current || "forage";
                const pattern = getActivityMovementPattern(activity);
                if (Math.random() > pattern.pauseChance) {
                    const r = pattern.wanderRadius || 10;
                    const curPos = store.entityPositions["robot"];
                    const cx = curPos?.x ?? 0;
                    const cz = curPos?.z ?? 0;
                    const tx = Math.max(
                        -90,
                        Math.min(90, cx + (Math.random() - 0.5) * 2 * r),
                    );
                    const tz = Math.max(
                        -90,
                        Math.min(90, cz + (Math.random() - 0.5) * 2 * r),
                    );
                    targetPos = new Vector3(tx, 0.5, tz);
                    setRobotState("MOVING");
                }
                nextDecisionTime = t + 3 + Math.random() * 3;
            } else {
                setRobotState("IDLE");
                targetPos = null;
                nextDecisionTime = t + 2 + Math.random() * 2;
            }
        }

        // =================================================================
        //  Physics & Movement
        // =================================================================
        const currentPos = rootNode.position.clone();

        // --- Safety Reset ---
        if (currentPos.y < -5) {
            aggregate.body.disablePreStep = false;
            rootNode.position = new Vector3(0, 5, 0);
            aggregate.body.setLinearVelocity(new Vector3(0, 0, 0));
        }

        // --- Terrain height correction ---
        const terrainY = getTerrainHeight(currentPos.x, currentPos.z);
        const correctedY = terrainY + 1.0;

        if (currentPos.y < correctedY - 0.3) {
            // Sunk into terrain - teleport up
            aggregate.body.disablePreStep = false;
            rootNode.position = new Vector3(
                currentPos.x,
                correctedY + 0.5,
                currentPos.z,
            );
            // Clamp downward velocity
            const vel = aggregate.body.getLinearVelocity();
            if (vel.y < 0) {
                aggregate.body.setLinearVelocity(new Vector3(vel.x, 0, vel.z));
            }
        } else if (currentPos.y > correctedY + 3.0) {
            // Too high above terrain - gently correct
            aggregate.body.disablePreStep = false;
            rootNode.position = new Vector3(
                currentPos.x,
                correctedY + 1.5,
                currentPos.z,
            );
        }

        // --- DIALOGUE state: freeze horizontal motion ---
        if (robotState === "DIALOGUE") {
            const vel = aggregate.body.getLinearVelocity();
            aggregate.body.setLinearVelocity(new Vector3(0, vel.y, 0));
            aggregate.body.setLinearDamping(10);
        } else {
            // Restore normal damping when not in dialogue
            aggregate.body.setLinearDamping(0.5);
        }

        // --- MOVING state: velocity toward target ---
        if (robotState === "MOVING" && targetPos) {
            const horizPos = new Vector3(currentPos.x, 0, currentPos.z);
            const horizTarget = new Vector3(targetPos.x, 0, targetPos.z);
            const dist = Vector3.Distance(horizPos, horizTarget);

            if (dist < 1.0) {
                // Reached target
                setRobotState("IDLE");
                targetPos = null;
                nextDecisionTime = t + 2 + Math.random() * 2;
                const vel = aggregate.body.getLinearVelocity();
                aggregate.body.setLinearVelocity(new Vector3(0, vel.y, 0));
            } else {
                const direction = targetPos.subtract(currentPos).normalize();
                const activityPattern = getActivityMovementPattern(
                    useStore.getState().entityActivities["robot"]?.current || "forage",
                );
                const speed =
                    3.0 *
                    emotionToSpeedMultiplier(emotion) *
                    activityPattern.speedMultiplier;

                const vel = aggregate.body.getLinearVelocity();
                aggregate.body.setLinearVelocity(
                    new Vector3(direction.x * speed, vel.y, direction.z * speed),
                );

                // Compute target rotation (facing movement direction)
                const angle = Math.atan2(direction.x, direction.z);
                Quaternion.FromEulerAnglesToRef(0, angle, 0, targetRotation);
            }
        }

        // --- Smooth rotation slerp toward target rotation ---
        if (robotState === "MOVING" || robotState === "DIALOGUE") {
            if (rootNode.rotationQuaternion) {
                Quaternion.SlerpToRef(
                    rootNode.rotationQuaternion,
                    targetRotation,
                    0.1,
                    rootNode.rotationQuaternion,
                );
            } else {
                rootNode.rotationQuaternion = Quaternion.Slerp(
                    Quaternion.Identity(),
                    targetRotation,
                    0.1,
                );
            }
        }

        // =================================================================
        //  Dynamic material updates based on emotion
        // =================================================================
        const emotionColor = hexToColor3(emotionToColor(emotion, "#FFA500"));
        bodyMat.diffuseColor = robotState === "DIALOGUE"
            ? Color3.FromHexString("#00FFCC")
            : emotionColor;
        coreMat.diffuseColor = emotionColor;
        coreMat.emissiveColor = emotionColor;
        coreMat.alpha = 0.4;
        displayMat.emissiveColor = robotState === "IDLE"
            ? Color3.FromHexString("#00FFCC")
            : Color3.FromHexString("#FF00CC");
    });

    // =====================================================================
    //  Dispose function -- cleans up all meshes and physics
    // =====================================================================
    function dispose() {
        // Clear any pending timeouts
        if (thoughtClearTimeout) {
            clearTimeout(thoughtClearTimeout);
            thoughtClearTimeout = null;
        }

        // Dispose physics
        aggregate.dispose();

        // Dispose materials
        bodyMat.dispose();
        coreMat.dispose();
        ringMat.dispose();
        headMat.dispose();
        displayMat.dispose();
        antennaMat.dispose();
        lightMat.dispose();

        // Dispose meshes
        body.dispose();
        core.dispose();
        ring.dispose();
        headBox.dispose();
        display.dispose();
        antenna.dispose();
        light.dispose();

        // Dispose transform nodes
        headGroup.dispose();
        rootNode.dispose();
    }

    return { rootNode, dispose };
}
