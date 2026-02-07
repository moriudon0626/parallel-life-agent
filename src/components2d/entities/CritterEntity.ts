/**
 * 2D Critter Entity Logic and Rendering
 * Ported from src/components/Critter.tsx
 *
 * This module handles all critter behavior including:
 * - Emotion system (curiosity, fear, happiness)
 * - Needs system (hunger, comfort)
 * - Lifecycle system (health, reproduction, death)
 * - AI thinking and decision making
 * - Movement and activity patterns
 * - Dialogue and social interactions
 * - World element observation
 */

import type { Camera2D } from '../../hooks/useCanvas2D';
import { worldToScreen, isVisibleOnScreen } from '../../hooks/useCanvas2D';
import { useStore } from '../../store';
import { generateSingleResponse, generateCritterThought, type CritterThoughtResult } from '../../lib/llm';
import {
  applyEmotionEvent,
  decayEmotions,
  emotionToColor,
  emotionToSpeedMultiplier,
  emotionToDialogueContext,
  emotionChanged,
  createEmotionState,
  type EmotionState
} from '../../lib/emotions';
import {
  getAffinity,
  affinityToDialogueContext,
  affinityToDialogueProbabilityMultiplier,
  shouldApproach,
  shouldAvoid
} from '../../lib/relationships';
import { createMemory, selectRelevantMemories, memoriesToPromptContext } from '../../store';
import { selectNextActivity, shouldSwitchActivity, getActivityMovementPattern } from '../../lib/activities';
import { getNearbyElements, buildEnvContext, generateThemeFromElements } from '../../lib/worldElements';
import {
  decayNeeds,
  satisfyNeed,
  computeDesires,
  needsToDialogueContext,
  createDefaultNeeds,
  type NeedsState
} from '../../lib/needs';
import {
  tickLifecycle,
  checkReproduction,
  mutateColor,
  sicknessToDialogueContext,
  getSpeedMultiplier,
  createLifecycleState,
  type LifecycleState
} from '../../lib/lifecycle';
import { getNearbyResources, type ResourceType } from '../../lib/resources';
import { isWeatherEventActive, SHELTER_TYPES } from '../../lib/environment';

// Personality types for variation
const PERSONALITIES = [
  "元気で好奇心旺盛。何でも気になる。",
  "臆病で慎重。知らないものにはちょっと距離を置く。",
  "のんびり屋。食べ物と昼寝が好き。",
  "ちょっと生意気。自分のテリトリー意識が強い。"
];

// Shared dialogue tracking (prevents spamming)
const lastDialogue: Record<string, Record<string, number>> = {};

/**
 * Critter entity state (runtime, not in Zustand)
 */
export interface CritterEntity {
  // Identity
  id: string;
  name: string;
  color: string;
  generation: number;

  // Position and movement
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  targetPos: { x: number; z: number };
  homePos: { x: number; z: number };
  rotation: number; // Angle in radians

  // Internal state
  emotion: EmotionState;
  needs: NeedsState;
  lifecycle: LifecycleState;
  personality: string;
  personalityIndex: number;

  // AI and behavior
  aiIntent: CritterThoughtResult | null;
  currentThought: string | null;
  thoughtEndTime: number;

  // Dialogue state
  isInDialogue: boolean;
  isQuarreling: boolean;
  lastDialogueTime: number;
  dialogueCount: number;
  lastConversationEnd: number;
  processedRobotMsgId: number;
  quarrelCount: number;
  initialCooldown: number; // Timestamp when critter can start talking

  // Timers
  nextMoveTime: number;
  lastThinkTime: number;
  isThinking: boolean;
  lastEmotionSync: number;
  lastNeedsSync: number;
  lastLifecycleSync: number;
  lastPositionUpdate: number;

  // Death animation
  isDying: boolean;
  opacity: number;

  // World observation
  observedElements: Set<string>;

  // Animation
  hopPhase: number; // For hop animation
}

/**
 * Create a new critter entity with default state
 */
export function createCritterEntity(
  id: string,
  name: string,
  color: string,
  spawnPosition: [number, number, number],
  generation: number = 0
): CritterEntity {
  const personalityIndex = name.charCodeAt(0) % PERSONALITIES.length;

  return {
    id,
    name,
    color,
    generation,

    position: { x: spawnPosition[0], z: spawnPosition[2] },
    velocity: { x: 0, z: 0 },
    targetPos: {
      x: spawnPosition[0] + (Math.random() - 0.5) * 4,
      z: spawnPosition[2] + (Math.random() - 0.5) * 4
    },
    homePos: { x: spawnPosition[0], z: spawnPosition[2] },
    rotation: 0,

    emotion: createEmotionState(personalityIndex),
    needs: createDefaultNeeds('critter'),
    lifecycle: createLifecycleState(generation),
    personality: PERSONALITIES[personalityIndex],
    personalityIndex,

    aiIntent: null,
    currentThought: null,
    thoughtEndTime: 0,

    isInDialogue: false,
    isQuarreling: false,
    lastDialogueTime: 0,
    dialogueCount: 0,
    lastConversationEnd: 0,
    processedRobotMsgId: 0,
    quarrelCount: 0,
    initialCooldown: Date.now() + 15000,

    nextMoveTime: Math.random() * 3,
    lastThinkTime: 0,
    isThinking: false,
    lastEmotionSync: 0,
    lastNeedsSync: 0,
    lastLifecycleSync: 0,
    lastPositionUpdate: 0,

    isDying: false,
    opacity: 1,

    observedElements: new Set(),

    hopPhase: Math.random() * Math.PI * 2,
  };
}

/**
 * Update critter logic (called every frame)
 * Handles emotions, needs, lifecycle, AI, movement, etc.
 */
export function updateCritter(critter: CritterEntity, delta: number, totalTime: number): CritterEntity {
  const store = useStore.getState();
  const apiKey = store.apiKey;

  // Create a copy to avoid mutations
  const updated = { ...critter };

  // === EMOTION DECAY ===
  updated.emotion = decayEmotions(updated.emotion, delta);

  // Sync emotion to store (every 1s)
  if (totalTime - updated.lastEmotionSync > 1.0) {
    const storeEmotion = store.getEntityEmotion(updated.name);
    if (emotionChanged(storeEmotion, updated.emotion)) {
      store.updateEntityEmotion(updated.name, { ...updated.emotion });
    }
    updated.lastEmotionSync = totalTime;
  }

  // === NEEDS DECAY ===
  const isNight = store.time >= 18 || store.time < 6;
  updated.needs = decayNeeds(updated.needs, delta, 'critter', isNight);

  // Sync needs to store (every 1s)
  if (totalTime - updated.lastNeedsSync > 1.0) {
    store.updateEntityNeeds(updated.name, { ...updated.needs });
    updated.lastNeedsSync = totalTime;

    // Low hunger → emotion effect
    if (updated.needs.hunger < 0.25) {
      updated.emotion = applyEmotionEvent(updated.emotion, 'hunger_low', 0.3);
    }
  }

  // === LIFECYCLE TICK (every 1s) ===
  if (totalTime - updated.lastLifecycleSync > 1.0) {
    updated.lifecycle = tickLifecycle(updated.lifecycle, 1.0, updated.needs);
    store.updateEntityLifecycle(updated.name, { ...updated.lifecycle });
    updated.lastLifecycleSync = totalTime;

    // Sickness → emotion
    if (updated.lifecycle.healthStatus === 'sick') {
      updated.emotion = applyEmotionEvent(updated.emotion, 'sick', 0.2);
    }

    // Death handling
    if (updated.lifecycle.healthStatus === 'dead' && !updated.isDying) {
      updated.isDying = true;

      // Add death log
      store.addActivityLog({
        category: 'death',
        importance: 'high',
        entityId: updated.name,
        content: `💀 ${updated.name} が死亡しました（世代: ${updated.lifecycle.generation}）`,
      });

      // Note: Fade-out animation handled in drawCritter, removal handled externally
    }

    // === ENVIRONMENTAL DAMAGE SYSTEM ===
    if (!updated.isDying) {
      const currentWeatherEvent = store.currentWeatherEvent;
      if (currentWeatherEvent && isWeatherEventActive(currentWeatherEvent, store.time * 3600 + store.day * 86400)) {
        // Check if critter is in shelter
        let inShelter = false;
        let shelterType: keyof typeof SHELTER_TYPES = 'none';

        const nearbyBuildings = store.buildings.filter(b => {
          if (!b.built) return false;
          const dx = b.position.x - updated.position.x;
          const dz = b.position.z - updated.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          return dist < b.radius;
        });

        if (nearbyBuildings.length > 0) {
          inShelter = true;
          const bestShelter = nearbyBuildings.reduce((best, current) => {
            const currentProtection = SHELTER_TYPES[current.type as keyof typeof SHELTER_TYPES]?.damageReduction || 0;
            const bestProtection = SHELTER_TYPES[best.type as keyof typeof SHELTER_TYPES]?.damageReduction || 0;
            return currentProtection > bestProtection ? current : best;
          });
          shelterType = bestShelter.type as keyof typeof SHELTER_TYPES;
        }

        // Apply weather damage to health
        const protection = SHELTER_TYPES[shelterType];
        const effectiveDamage = inShelter
          ? currentWeatherEvent.effects.damagePerSecond * (1 - protection.damageReduction)
          : currentWeatherEvent.effects.damagePerSecond;

        if (effectiveDamage > 0) {
          const damageAmount = effectiveDamage * 1.0;
          updated.lifecycle = {
            ...updated.lifecycle,
            health: Math.max(0, updated.lifecycle.health - damageAmount),
          };
        }
      }
    }

    // === REPRODUCTION CHECK ===
    const aliveCount = store.critterRegistry.filter(c => c.isAlive).length;
    if (checkReproduction(updated.lifecycle, updated.needs, aliveCount)) {
      updated.lifecycle.reproductionCooldown = 60;

      if (aliveCount < 8) {
        const gen = updated.lifecycle.generation + 1;
        const childColor = mutateColor(updated.color);
        const childId = `Critter-${Date.now().toString(36)}`;
        const childPos: [number, number, number] = [
          updated.position.x + (Math.random() - 0.5) * 4,
          0.5,
          updated.position.z + (Math.random() - 0.5) * 4,
        ];

        store.addCritter({
          id: childId,
          name: childId,
          color: childColor,
          spawnPosition: childPos,
          isAlive: true,
          generation: gen,
        });

        // Add birth log
        store.addActivityLog({
          category: 'event',
          importance: 'high',
          entityId: childId,
          content: `🐣 ${childId} が誕生しました！親: ${updated.name}（世代: ${gen}）`,
        });

        // Memory and emotion
        store.addCritterMemory(updated.name, createMemory(`子供(${childId})が生まれた！`, 'event', [updated.name, childId], 0.9, 0.5));
        updated.emotion = applyEmotionEvent(updated.emotion, 'new_birth');

        // Notify nearby entities
        const positions = store.entityPositions;
        for (const [id, pos] of Object.entries(positions)) {
          if (id === updated.name) continue;
          const dist = Math.sqrt((pos.x - updated.position.x) ** 2 + (pos.z - updated.position.z) ** 2);
          if (dist < 20) {
            if (id === 'robot') {
              store.addRobotMemory(createMemory(`${updated.name}の近くに新しいクリッターが生まれた`, 'event', [updated.name, childId], 0.7));
            } else {
              store.addCritterMemory(id, createMemory(`${updated.name}の近くに新しいクリッターが生まれた`, 'event', [updated.name, childId], 0.7));
            }
            const emotion = store.getEntityEmotion(id);
            store.updateEntityEmotion(id, applyEmotionEvent(emotion, 'new_birth', 0.5));
          }
        }
      }
    }
  }

  // === RESOURCE SEEKING (Eating) ===
  if (!updated.isInDialogue) {
    const resources = store.resourceNodes;
    const critterFoodTypes: ResourceType[] = ['mineral_ore', 'glowing_mushroom'];
    const nearbyResources = getNearbyResources(resources, updated.position.x, updated.position.z, 2.0, critterFoodTypes);

    if (nearbyResources.length > 0 && nearbyResources[0].distance < 2.0) {
      // Eating: satisfy hunger, pause briefly
      updated.needs = satisfyNeed(updated.needs, 'hunger', 0.15);
      updated.needs = satisfyNeed(updated.needs, 'comfort', 0.05);

      // Consume resource
      const updatedRes = store.resourceNodes.map(r =>
        r.id === nearbyResources[0].id ? { ...r, capacity: Math.max(0, r.capacity - 0.05) } : r
      );
      useStore.setState({ resourceNodes: updatedRes });
    }
  }

  // === POSITION REPORTING (every 0.5s) ===
  if (totalTime - updated.lastPositionUpdate > 0.5) {
    store.updateEntityPosition(updated.name, updated.position.x, updated.position.z);
    updated.lastPositionUpdate = totalTime;
  }

  // === WORLD ELEMENT OBSERVATION ===
  const nearby = getNearbyElements(updated.position.x, updated.position.z, 8, store.time);
  for (const elem of nearby) {
    if (!updated.observedElements.has(elem.id)) {
      updated.observedElements.add(elem.id);
      store.addCritterMemory(updated.name, createMemory(
        elem.description,
        'observation',
        ['environment'],
        0.4
      ));
    }
  }

  // === ROBOT MESSAGE RESPONSE ===
  // Check if robot sent us a message and respond
  const robotMessage = Object.values(store.activeDialogues).find(
    d => d.isRobot && d.id === 'robot' && d.targetId === updated.name
  );

  if (robotMessage && !updated.isInDialogue && apiKey && updated.processedRobotMsgId !== robotMessage.timestamp) {
    const now = Date.now();

    // Checking cooldown
    if (now - updated.lastConversationEnd >= 60000) {
      updated.processedRobotMsgId = robotMessage.timestamp;

      // Check if new conversation
      const timeSinceLastTalk = now - updated.lastConversationEnd;
      if (timeSinceLastTalk > 600000) {
        updated.dialogueCount = 0;
      }

      if (updated.dialogueCount <= 8) {
        updated.isInDialogue = true;
        updated.lastDialogueTime = now;
        updated.dialogueCount += 1;

        // Trigger async response (don't await)
        respondToRobot(updated, robotMessage).finally(() => {
          setTimeout(() => {
            updated.isInDialogue = false;
            updated.lastConversationEnd = Date.now();
          }, 5000);
        });
      }
    }
  }

  // === CRITTER-TO-CRITTER MESSAGE RESPONSE ===
  // Check if another critter sent us a message
  const otherCritterMessage = Object.values(store.activeDialogues).find(
    d => !d.isRobot && d.targetId === updated.name && d.speakerId !== updated.name
  );

  if (otherCritterMessage && !updated.isInDialogue && apiKey) {
    // Quarrel continuation check: stop after 1 round
    if (updated.quarrelCount >= 1) {
      updated.quarrelCount = 0;
    } else {
      updated.isInDialogue = true;
      updated.quarrelCount += 1;

      const isAggressive = otherCritterMessage.text.includes("！") || otherCritterMessage.text.includes("だめ") || Math.random() < 0.2;
      if (isAggressive) updated.isQuarreling = true;

      // Trigger async response (don't await)
      respondToCritter(updated, otherCritterMessage, isAggressive).finally(() => {
        setTimeout(() => {
          updated.isInDialogue = false;
          updated.isQuarreling = false;
          if (updated.quarrelCount >= 3) updated.quarrelCount = 0;
        }, 3000);
      });
    }
  }

  // === VISION DETECTION (replaces 3D sensor) ===
  // Detect nearby entities (robot or other critters) and occasionally talk
  if (!updated.isInDialogue && apiKey && Date.now() > updated.initialCooldown) {
    const positions = store.entityPositions;
    const visionRadius = 8.0; // Same as 3D sensor radius

    for (const [entityId, pos] of Object.entries(positions)) {
      if (entityId === updated.name) continue;

      const dx = pos.x - updated.position.x;
      const dz = pos.z - updated.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < visionRadius) {
        const isRobot = entityId === 'robot';
        const now = Date.now();

        if (!lastDialogue[updated.name]) lastDialogue[updated.name] = {};
        const lastTime = lastDialogue[updated.name][entityId] || 0;
        const cooldown = 120000; // 120s cooldown

        if (now - lastTime > cooldown) {
          const globalBusy = store.isDialogueBusy;
          if (!globalBusy) {
            // Probability check
            const baseChance = isRobot ? 0.20 : 0.10;
            const affinity = getAffinity(store.relationships, updated.name, entityId);
            const affinityMult = affinityToDialogueProbabilityMultiplier(affinity);
            const curiosityMult = 1 + updated.emotion.curiosity * 0.5;

            if (Math.random() < baseChance * affinityMult * curiosityMult) {
              const startQuarrel = !isRobot && Math.random() < 0.05;

              lastDialogue[updated.name][entityId] = now;
              store.setDialogueBusy(true);
              updated.dialogueCount = 0;

              if (startQuarrel) updated.isQuarreling = true;
              updated.isInDialogue = true;

              // Trigger async dialogue (don't await)
              initiateDialogue(updated, entityId, isRobot, startQuarrel).finally(() => {
                setTimeout(() => {
                  updated.isInDialogue = false;
                  updated.isQuarreling = false;
                  store.setDialogueBusy(false);
                }, 3000);
              });

              break; // Only talk to one entity at a time
            }
          }
        }
      }
    }
  }

  // === AI THINKING LOOP (30~45s interval, staggered by personality) ===
  const thinkInterval = 30 + (updated.personalityIndex * 5);
  if (apiKey && !updated.isThinking && !updated.isInDialogue && totalTime - updated.lastThinkTime > thinkInterval) {
    updated.lastThinkTime = totalTime;
    updated.isThinking = true;

    // Trigger async thinking (don't await, handle via callback)
    performAIThinking(updated).finally(() => {
      updated.isThinking = false;
    });
  }

  // Clear thought after 5s
  if (updated.currentThought && Date.now() > updated.thoughtEndTime) {
    updated.currentThought = null;
  }

  // === MOVEMENT AND ACTIVITY ===
  if (!updated.isInDialogue) {
    // Update activity if needed
    const currentActivity = store.entityActivities[updated.name];
    if (shouldSwitchActivity(currentActivity)) {
      const positions = store.entityPositions;
      const myPos = positions[updated.name];
      const nearbyEntities = Object.entries(positions)
        .filter(([id]) => id !== updated.name)
        .map(([id, pos]) => ({
          id,
          distance: myPos ? Math.sqrt((pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2) : 100,
        }))
        .filter(e => e.distance < 30);

      const desires = computeDesires(updated.needs, 'critter');
      const newActivity = selectNextActivity(
        updated.emotion,
        store.time,
        store.weather,
        store.relationships,
        updated.name,
        nearbyEntities,
        desires
      );

      // Override with AI intent if available
      if (updated.aiIntent) {
        const validActivities: string[] = ['explore', 'forage', 'rest', 'socialize', 'seek_resource', 'flee', 'idle'];
        if (validActivities.includes(updated.aiIntent.action)) {
          newActivity.current = updated.aiIntent.action as typeof newActivity.current;
        }
        updated.aiIntent = null;
      }

      // If seeking resource, find nearest food resource and set target
      if (newActivity.current === 'seek_resource' && myPos) {
        const critterFoodTypes2: ResourceType[] = ['mineral_ore', 'glowing_mushroom'];
        const nearbyRes = getNearbyResources(store.resourceNodes, myPos.x, myPos.z, 50, critterFoodTypes2);
        if (nearbyRes.length > 0) {
          newActivity.targetResourceId = nearbyRes[0].id;
        }
      }

      store.setEntityActivity(updated.name, newActivity);
    }

    const activity = store.entityActivities[updated.name]?.current || 'forage';
    const pattern = getActivityMovementPattern(activity);

    // Activity-driven movement
    if (activity === 'rest') {
      // Stay still during rest
      updated.velocity = { x: 0, z: 0 };
    } else if (activity === 'seek_resource') {
      // Move toward target resource
      const resId = store.entityActivities[updated.name]?.targetResourceId;
      const resNode = resId ? store.resourceNodes.find(r => r.id === resId) : null;
      if (resNode && resNode.capacity > 0.05) {
        updated.targetPos = { x: resNode.position.x, z: resNode.position.z };
      } else {
        // Resource depleted, find new one
        const myPos2 = store.entityPositions[updated.name];
        if (myPos2) {
          const critterFoodTypes2: ResourceType[] = ['mineral_ore', 'glowing_mushroom'];
          const nearby2 = getNearbyResources(store.resourceNodes, myPos2.x, myPos2.z, 50, critterFoodTypes2);
          if (nearby2.length > 0) {
            updated.targetPos = { x: nearby2[0].position.x, z: nearby2[0].position.z };
          }
        }
      }
    } else {
      // Check if reached target or time to pick new target
      const distToTarget = Math.sqrt(
        (updated.position.x - updated.targetPos.x) ** 2 +
        (updated.position.z - updated.targetPos.z) ** 2
      );

      if (distToTarget < 0.5 || totalTime > updated.nextMoveTime) {
        const r = pattern.wanderRadius || 10;
        const hw = pattern.homeAffinity;

        if (activity === 'socialize') {
          const socialTarget = store.entityActivities[updated.name]?.targetEntityId;
          const socialPos = socialTarget ? store.entityPositions[socialTarget] : null;
          if (socialPos) {
            updated.targetPos = {
              x: socialPos.x + (Math.random() - 0.5) * 4,
              z: socialPos.z + (Math.random() - 0.5) * 4
            };
          } else {
            updated.targetPos = {
              x: updated.homePos.x + (Math.random() - 0.5) * r * 2,
              z: updated.homePos.z + (Math.random() - 0.5) * r * 2
            };
          }
        } else if (activity === 'flee') {
          // Flee toward home
          updated.targetPos = {
            x: updated.homePos.x + (Math.random() - 0.5) * 3,
            z: updated.homePos.z + (Math.random() - 0.5) * 3
          };
        } else {
          // Normal wander: blend between random and home-biased
          const randX = (Math.random() - 0.5) * r * 2;
          const randZ = (Math.random() - 0.5) * r * 2;
          updated.targetPos = {
            x: updated.homePos.x * hw + randX * (1 - hw * 0.5),
            z: updated.homePos.z * hw + randZ * (1 - hw * 0.5)
          };
        }

        updated.nextMoveTime = totalTime + 5 + Math.random() * 8;
      }

      // Relationship-based movement bias
      const positions = store.entityPositions;
      const relationships = store.relationships;
      for (const [entityId, pos] of Object.entries(positions)) {
        if (entityId === updated.name) continue;
        const dx = pos.x - updated.position.x;
        const dz = pos.z - updated.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 15) {
          const aff = getAffinity(relationships, updated.name, entityId);
          if (shouldAvoid(aff) || (entityId === 'robot' && updated.emotion.fear > 0.4)) {
            updated.targetPos.x -= dx * 0.3;
            updated.targetPos.z -= dz * 0.3;
          } else if (shouldApproach(aff)) {
            updated.targetPos.x += dx * 0.2;
            updated.targetPos.z += dz * 0.2;
          }
        }
      }
    }

    // Calculate velocity
    const dx = updated.targetPos.x - updated.position.x;
    const dz = updated.targetPos.z - updated.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist > 0.01) {
      const dirX = dx / dist;
      const dirZ = dz / dist;

      const lifecycleSpeedMult = getSpeedMultiplier(updated.lifecycle);
      const speed = activity === 'rest' ? 0 : 2.0 * emotionToSpeedMultiplier(updated.emotion) * pattern.speedMultiplier * lifecycleSpeedMult;

      updated.velocity = {
        x: dirX * speed,
        z: dirZ * speed
      };

      // Update rotation to face movement direction
      updated.rotation = Math.atan2(dirX, dirZ);
    } else {
      updated.velocity = { x: 0, z: 0 };
    }

    // Update position
    updated.position.x += updated.velocity.x * delta;
    updated.position.z += updated.velocity.z * delta;

    // Hop animation (update phase)
    updated.hopPhase += delta * 5;
  } else {
    // In dialogue: stop moving, but shake if quarreling
    if (updated.isQuarreling) {
      updated.velocity = {
        x: (Math.random() - 0.5) * 5,
        z: (Math.random() - 0.5) * 5
      };
      updated.position.x += updated.velocity.x * delta * 0.1;
      updated.position.z += updated.velocity.z * delta * 0.1;
    } else {
      updated.velocity = { x: 0, z: 0 };
    }
  }

  // Death fade animation
  if (updated.isDying) {
    updated.opacity = Math.max(0, updated.opacity - delta * 0.3);
  }

  return updated;
}

/**
 * Respond to another critter's dialogue (async)
 */
async function respondToCritter(critter: CritterEntity, otherMessage: any, isAggressive: boolean): Promise<void> {
  const store = useStore.getState();
  const apiKey = store.apiKey;
  const provider = store.provider;

  if (!apiKey) return;

  try {
    const prompt = `${otherMessage.speakerId}が「${otherMessage.text}」と言った。
性格: ${critter.personality}。普通に1〜2文で返して。大げさ禁止。日本語で。`;

    const response = await generateSingleResponse(provider, apiKey, prompt, store.critterSystemPrompt);
    store.addDialogue(critter.name, critter.name, response, false, otherMessage.speakerId);
    critter.emotion = applyEmotionEvent(critter.emotion, isAggressive ? 'quarrel' : 'negative_dialogue');
    store.adjustRelationship(critter.name, otherMessage.speakerId, isAggressive ? -0.15 : -0.05);
  } catch (e) {
    console.error("Critter to Critter response failed:", e);
  }
}

/**
 * Respond to robot's dialogue (async)
 */
async function respondToRobot(critter: CritterEntity, robotMessage: any): Promise<void> {
  const store = useStore.getState();
  const apiKey = store.apiKey;
  const provider = store.provider;

  if (!apiKey) return;

  try {
    const ids = [robotMessage.speakerId, critter.name].sort();
    const sessionId = ids.join(':');
    const history = store.conversationHistories[sessionId] || [];
    const relevantMemories = selectRelevantMemories(store.critterMemories[critter.name] || [], ['robot'], 7);
    const memoryContext = memoriesToPromptContext(relevantMemories);
    const myPos = store.entityPositions[critter.name];
    const envContext = buildEnvContext(store.time, store.weather, myPos?.x ?? critter.position.x, myPos?.z ?? critter.position.z);
    const emotionContext = emotionToDialogueContext(critter.emotion);
    const affinityVal = getAffinity(store.relationships, critter.name, 'robot');
    const relationContext = affinityToDialogueContext(affinityVal, 'robot');

    let directionPrompt = "";
    if (critter.dialogueCount >= 4) {
      directionPrompt = "そろそろ会話を切り上げる感じで。「じゃあね」とか「またね」程度で。";
    } else {
      directionPrompt = "普通に返事して。";
    }

    const prompt = `相手が「${robotMessage.text}」と言った。
性格: ${critter.personality}。${emotionContext}。${relationContext}。${envContext}。
${directionPrompt}1〜2文で。大げさ禁止。日本語で。
最近の記憶:\n${memoryContext}`;

    const response = await Promise.race([
      generateSingleResponse(provider, apiKey, prompt, store.critterSystemPrompt, history),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
    ]);

    store.addCritterMemory(critter.name, createMemory(`ロボットが「${robotMessage.text}」と言った。「${response}」と返した`, 'dialogue', [critter.name, 'robot']));
    store.addDialogue(critter.name, critter.name, response, false, 'robot');
    critter.emotion = applyEmotionEvent(critter.emotion, 'positive_dialogue');
    store.adjustRelationship(critter.name, 'robot', 0.05);
  } catch (error) {
    console.error("Critter response to robot failed:", error);
  }
}

/**
 * Initiate dialogue with another entity (async)
 */
async function initiateDialogue(
  critter: CritterEntity,
  otherEntityId: string,
  isRobot: boolean,
  startQuarrel: boolean
): Promise<void> {
  const store = useStore.getState();
  const apiKey = store.apiKey;
  const provider = store.provider;

  if (!apiKey) return;

  try {
    const relevantMemories = selectRelevantMemories(store.critterMemories[critter.name] || [], [otherEntityId], 7);
    const memoryContext = memoriesToPromptContext(relevantMemories);
    const myPos = store.entityPositions[critter.name];
    const envContext = buildEnvContext(store.time, store.weather, myPos?.x ?? critter.position.x, myPos?.z ?? critter.position.z);
    const emotionContext = emotionToDialogueContext(critter.emotion);
    const affinityVal = getAffinity(store.relationships, critter.name, otherEntityId);
    const relationContext = affinityToDialogueContext(affinityVal, otherEntityId);
    const nearbyElements = getNearbyElements(myPos?.x ?? critter.position.x, myPos?.z ?? critter.position.z, 15, store.time);
    const dynamicThemes = generateThemeFromElements(nearbyElements);
    const theme = isRobot
      ? `${dynamicThemes}、またはロボットのこと`
      : (startQuarrel ? "相手への文句" : `${dynamicThemes}、または最近気になったこと`);

    const needsContext = needsToDialogueContext(critter.needs, 'critter');
    const sicknessContext = sicknessToDialogueContext(critter.lifecycle);
    const bodyContext = [needsContext, sicknessContext].filter(Boolean).join('。');

    const prompt = isRobot
      ? `あなたは${critter.name}。性格: ${critter.personality}。${emotionContext}。${bodyContext ? bodyContext + '。' : ''}${relationContext}。
${envContext}。ロボットに${theme}について気軽に話しかけて。1〜2文で。大げさな表現は禁止。日本語で。
最近の記憶:\n${memoryContext}`
      : `あなたは${critter.name}。性格: ${critter.personality}。${emotionContext}。${bodyContext ? bodyContext + '。' : ''}${relationContext}。
${envContext}。${otherEntityId}に${theme}について${startQuarrel ? "短くイラッとした感じで" : "普通に"}話しかけて。1〜2文で。大げさ禁止。日本語で。
最近の記憶:\n${memoryContext}`;

    const response = await Promise.race([
      generateSingleResponse(provider, apiKey, prompt, store.critterSystemPrompt),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
    ]);

    store.addCritterMemory(critter.name, createMemory(`${otherEntityId}と会話した: ${response}`, startQuarrel ? 'quarrel' : 'dialogue', [critter.name, otherEntityId]));
    store.addDialogue(critter.name, critter.name, response, false, otherEntityId);
    critter.emotion = applyEmotionEvent(critter.emotion, startQuarrel ? 'quarrel' : 'positive_dialogue');
    store.adjustRelationship(critter.name, otherEntityId, startQuarrel ? -0.15 : 0.05);
  } catch (error) {
    console.error("Critter initiate dialogue failed:", error);
    critter.isInDialogue = false;
    critter.isQuarreling = false;
    store.setDialogueBusy(false);
  }
}

/**
 * Perform AI thinking (async, updates store directly)
 */
async function performAIThinking(critter: CritterEntity): Promise<void> {
  const store = useStore.getState();
  const apiKey = store.apiKey;
  const provider = store.provider;

  if (!apiKey) return;

  const myPos = store.entityPositions[critter.name];
  const positions = store.entityPositions;
  const nearbyEntities = Object.entries(positions)
    .filter(([eid]) => eid !== critter.name)
    .map(([eid, pos]) => ({
      id: eid,
      distance: myPos ? Math.sqrt((pos.x - myPos.x) ** 2 + (pos.z - myPos.z) ** 2) : 100,
    }))
    .filter(e => e.distance < 25)
    .slice(0, 4);

  const relevantMemories = selectRelevantMemories(store.critterMemories[critter.name] || [], nearbyEntities.map(e => e.id), 3);
  const memContext = memoriesToPromptContext(relevantMemories);
  const emotionCtx = emotionToDialogueContext(critter.emotion);
  const needsCtx = needsToDialogueContext(critter.needs, 'critter');
  const hours = Math.floor(store.time);
  const minutes = Math.floor((store.time % 1) * 60);
  const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

  const contextPrompt = `あなたは${critter.name}。性格: ${critter.personality}
現在地: (${(myPos?.x ?? 0).toFixed(0)}, ${(myPos?.z ?? 0).toFixed(0)})
時刻: ${timeStr} / ${store.weather}
${emotionCtx}
${needsCtx ? needsCtx : ''}
近く: ${nearbyEntities.length > 0 ? nearbyEntities.map(e => `${e.id}(${e.distance.toFixed(0)}m)`).join(', ') : 'だれもいない'}
記憶: ${memContext}`;

  try {
    const result = await generateCritterThought(provider, apiKey, contextPrompt);

    // Update critter's AI intent (stored separately, will be applied in next update cycle)
    critter.aiIntent = result;
    critter.currentThought = result.thought;
    critter.thoughtEndTime = Date.now() + 5000;

    const gameTimeStr = `Day ${store.day}, ${timeStr}`;
    store.addCritterThought(critter.name, {
      thought: result.thought,
      action: result.action,
      timestamp: Date.now(),
      gameTime: gameTimeStr,
      critterName: critter.name,
      color: critter.color,
    });

    // Add to activity log
    store.addActivityLog({
      category: 'thought',
      importance: 'low',
      entityId: critter.name,
      content: `[${critter.name}] ${result.action}: ${result.thought}`,
    });

    store.addCritterMemory(critter.name, createMemory(
      `[思考] ${result.thought}`,
      'observation',
      ['self'],
      0.3
    ));
  } catch (err) {
    console.error(`${critter.name} thinking failed:`, err);
  }
}

/**
 * Draw critter with expressive 2D visuals
 * Features:
 * - Emotion-based body color
 * - Eyes with pupils that dilate based on curiosity
 * - Hop animation (vertical bounce)
 * - Speech bubbles for dialogue
 * - Thought bubbles for AI thinking
 * - Frustum culling for performance
 */
export function drawCritter(
  ctx: CanvasRenderingContext2D,
  critter: CritterEntity,
  camera: Camera2D,
  canvas: HTMLCanvasElement
): void {
  // Frustum culling: skip rendering if critter is off-screen
  // 50px margin keeps critters visible as they move onto screen
  if (!isVisibleOnScreen(critter.position.x, critter.position.z, camera, canvas, 50)) {
    return;
  }

  const store = useStore.getState();

  // Get screen position
  const [sx, sy] = worldToScreen(critter.position.x, critter.position.z, camera, canvas);

  // Base size (smaller than robot)
  const baseSize = 20;

  // Hop animation (bounce up and down)
  const hopOffset = Math.abs(Math.sin(critter.hopPhase)) * 5;
  const drawY = sy - hopOffset;

  // Apply opacity (for death fade)
  ctx.globalAlpha = critter.opacity;

  // 1. Shadow (ellipse at feet)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + baseSize * 0.2, baseSize * 0.6, baseSize * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Body (organic rounded shape - circle for simplicity, emotion color)
  const bodyColor = emotionToColor(critter.emotion, critter.color);
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(sx, drawY, baseSize, 0, Math.PI * 2);
  ctx.fill();

  // 3. Inner highlight (gradient for depth)
  const gradient = ctx.createRadialGradient(sx - baseSize * 0.3, drawY - baseSize * 0.3, 0, sx, drawY, baseSize);
  gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(sx, drawY, baseSize, 0, Math.PI * 2);
  ctx.fill();

  // 4. Eyes (white circles)
  const eyeOffsetX = baseSize * 0.35;
  const eyeOffsetY = baseSize * 0.2;
  const eyeSize = baseSize * 0.2;

  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(sx - eyeOffsetX, drawY - eyeOffsetY, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + eyeOffsetX, drawY - eyeOffsetY, eyeSize, 0, Math.PI * 2);
  ctx.fill();

  // 5. Pupils (dilate with curiosity)
  const pupilScale = 1 + critter.emotion.curiosity * 0.5;
  const pupilSize = eyeSize * 0.5 * pupilScale;

  ctx.fillStyle = 'black';
  ctx.beginPath();
  ctx.arc(sx - eyeOffsetX, drawY - eyeOffsetY, pupilSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + eyeOffsetX, drawY - eyeOffsetY, pupilSize, 0, Math.PI * 2);
  ctx.fill();

  // Reset global alpha
  ctx.globalAlpha = 1.0;

  // 6. Speech bubble (if in dialogue)
  const myDialogue = store.activeDialogues[critter.name];
  if (myDialogue) {
    drawSpeechBubble(ctx, sx, drawY - baseSize - 10, myDialogue.text, critter.isQuarreling);
  }

  // 7. Thought bubble (if thinking and not in dialogue)
  if (critter.currentThought && !myDialogue) {
    drawThoughtBubble(ctx, sx, drawY - baseSize - 10, critter.currentThought);
  }

  // Debug: show name and position
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `${critter.name}`,
    sx,
    sy + baseSize + 15
  );
  ctx.fillText(
    `(${critter.position.x.toFixed(1)}, ${critter.position.z.toFixed(1)})`,
    sx,
    sy + baseSize + 27
  );
}

/**
 * Draw speech bubble above critter
 */
function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  isQuarreling: boolean
): void {
  const maxWidth = 200;
  const padding = 8;
  const fontSize = 12;
  const lineHeight = 16;

  ctx.font = `${fontSize}px sans-serif`;
  ctx.textAlign = 'center';

  // Word wrap
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const bubbleWidth = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width))) + padding * 2;
  const bubbleHeight = lines.length * lineHeight + padding * 2;

  // Background
  ctx.fillStyle = isQuarreling ? '#ffdddd' : 'white';
  ctx.strokeStyle = isQuarreling ? '#ff4444' : '#44cc88';
  ctx.lineWidth = 2;

  const bx = x - bubbleWidth / 2;
  const by = y - bubbleHeight;

  ctx.beginPath();
  ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, 10);
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = isQuarreling ? '#cc0000' : 'black';
  ctx.textBaseline = 'top';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, by + padding + i * lineHeight);
  }

  // Emoji for quarrel
  if (isQuarreling) {
    ctx.fillText('💢', bx + padding, by + padding);
  }
}

/**
 * Draw thought bubble above critter (dashed border, italic style)
 */
function drawThoughtBubble(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string
): void {
  const maxWidth = 180;
  const padding = 6;
  const fontSize = 10;
  const lineHeight = 14;

  ctx.font = `italic ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';

  // Word wrap
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const bubbleWidth = Math.min(maxWidth, Math.max(...lines.map(l => ctx.measureText(l).width))) + padding * 2;
  const bubbleHeight = lines.length * lineHeight + padding * 2;

  // Background (semi-transparent green)
  ctx.fillStyle = 'rgba(200, 240, 220, 0.9)';
  ctx.strokeStyle = '#66aa88';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 3]);

  const bx = x - bubbleWidth / 2;
  const by = y - bubbleHeight - 10;

  ctx.beginPath();
  ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, 8);
  ctx.fill();
  ctx.stroke();

  ctx.setLineDash([]);

  // Text
  ctx.fillStyle = '#336644';
  ctx.textBaseline = 'top';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, by + padding + i * lineHeight);
  }
}
