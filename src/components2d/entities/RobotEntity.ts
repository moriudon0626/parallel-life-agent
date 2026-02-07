/**
 * RobotEntity.ts - 2D Robot entity logic
 *
 * Ported from Robot.tsx useFrame hook to pure TypeScript for 2D rendering.
 * All game logic (emotions, needs, battery, AI thinking, activities) reuses
 * existing lib/ functions.
 */

import type { EmotionState } from '../../lib/emotions';
import {
  decayEmotions,
  emotionChanged,
  emotionToSpeedMultiplier,
  emotionToDialogueContext,
  DEFAULT_EMOTION,
} from '../../lib/emotions';
import type { NeedsState } from '../../lib/needs';
import {
  decayNeeds,
  satisfyNeed,
  computeDesires,
  needsToDialogueContext,
  createDefaultNeeds,
} from '../../lib/needs';
import {
  selectNextActivity,
  shouldSwitchActivity,
  getActivityMovementPattern,
} from '../../lib/activities';
import type { ActivityState } from '../../lib/activities';
import { getNearbyElements } from '../../lib/worldElements';
import { getNearbyResources, attemptGatherResource, consumeResource, getResourceValue } from '../../lib/resources';
import { getTerrainHeight } from '../../lib/terrain';
import { isWeatherEventActive, SHELTER_TYPES } from '../../lib/environment';
import { createBuilding, canBuildHere, hasRequiredMaterials, consumeMaterials, getBuildingEffect } from '../../lib/building';
import { generateThought, type ThoughtResult } from '../../lib/llm';
import { createMemory, selectRelevantMemories } from '../../store';
import { useStore } from '../../store';

export interface Robot2D {
  position: { x: number; z: number };
  velocity: { x: number; z: number };
  rotation: number; // Angle in radians
  state: 'IDLE' | 'MOVING' | 'DIALOGUE';
  emotion: EmotionState;
  needs: NeedsState;
  targetPos: { x: number; z: number } | null;
  lookAtTarget: { x: number; z: number } | null;
  currentThought: string | null;
  // Animation state
  animationTime: number;
  bobOffset: number;
}

// Internal state not exposed to renderer
interface RobotInternalState {
  nextDecisionTime: number;
  lastEmotionSync: number;
  lastNeedsSync: number;
  lastPositionUpdate: number;
  observedElements: Set<string>;
  lastThinkTime: number;
  isThinking: boolean;
  aiIntent: ThoughtResult | null;
  gatherCooldown: number;
  buildingCooldown: number;
  lastBatteryLog: number;
  lastStateChange: number;
  initialCooldown: number;
}

// Cooldowns for memory and dialogue (shared across instances)
// NOTE: These will be used when dialogue system is ported to 2D
// const lastSeen: Record<string, number> = {};
// const lastDialogue: Record<string, number> = {};

let robot: Robot2D | null = null;
let internalState: RobotInternalState | null = null;

/**
 * Initialize the robot entity
 */
export function initRobot(): void {
  robot = {
    position: { x: 0, z: 0 },
    velocity: { x: 0, z: 0 },
    rotation: 0,
    state: 'IDLE',
    emotion: { ...DEFAULT_EMOTION },
    needs: createDefaultNeeds('robot'),
    targetPos: null,
    lookAtTarget: null,
    currentThought: null,
    animationTime: 0,
    bobOffset: 0,
  };

  internalState = {
    nextDecisionTime: 0.5,
    lastEmotionSync: 0,
    lastNeedsSync: 0,
    lastPositionUpdate: 0,
    observedElements: new Set(),
    lastThinkTime: 0,
    isThinking: false,
    aiIntent: null,
    gatherCooldown: 0,
    buildingCooldown: 0,
    lastBatteryLog: 0,
    lastStateChange: Date.now(),
    initialCooldown: Date.now() + 5000,
  };

  // Initialize robot in store
  useStore.setState({ robot });
}

/**
 * Get current robot state
 */
export function getRobot(): Robot2D | null {
  return robot;
}

/**
 * Main update loop - call this every frame with delta time
 */
export function updateRobot(delta: number, elapsedTime: number): void {
  if (!robot || !internalState) return;

  const store = useStore.getState();

  // Update animation time
  robot.animationTime += delta;
  robot.bobOffset = Math.sin(robot.animationTime * 2) * 0.05;

  // === EMOTION DECAY ===
  robot.emotion = decayEmotions(robot.emotion, delta);
  if (elapsedTime - internalState.lastEmotionSync > 1.0) {
    const storeEmotion = store.getEntityEmotion('robot');
    if (emotionChanged(storeEmotion, robot.emotion)) {
      store.updateEntityEmotion('robot', { ...robot.emotion });
    }
    internalState.lastEmotionSync = elapsedTime;
  }

  // === NEEDS DECAY ===
  const isNight = store.time >= 18 || store.time < 6;
  robot.needs = decayNeeds(robot.needs, delta, 'robot', isNight);

  // Solar charging during day
  if (!isNight && store.weather === 'sunny') {
    robot.needs = satisfyNeed(robot.needs, 'energy', 0.0008 * delta);
  }

  // Sync needs to store every second
  if (elapsedTime - internalState.lastNeedsSync > 1.0) {
    store.updateEntityNeeds('robot', { ...robot.needs });
    internalState.lastNeedsSync = elapsedTime;
  }

  // === BATTERY MANAGEMENT ===
  const robotStatus = store.robotStatus;
  // Activity type for future battery consumption calculations
  // const activity: 'idle' | 'moving' | 'working' =
  //   robot.state === 'MOVING' ? 'moving' :
  //   robot.state === 'DIALOGUE' ? 'working' :
  //   'idle';

  // Battery drain (5% per minute)
  const batteryDrain = 5.0 * (delta / 60);
  let newBattery = Math.max(0, robotStatus.battery - batteryDrain);

  // Solar charging during sunny day (1% per minute)
  if (!isNight && store.weather === 'sunny') {
    const solarCharge = 1.0 * (delta / 60);
    newBattery = Math.min(100, newBattery + solarCharge);
  }

  // Charging station effect
  const chargeRate = getBuildingEffect(store.buildings, robot.position, 'chargeRate');
  if (chargeRate > 0) {
    const effectiveRate = Math.min(chargeRate, 0.2) * 100;
    newBattery = Math.min(100, newBattery + effectiveRate * delta);
  }

  // Temperature adjustment
  const tempDiff = store.temperature - robotStatus.temperature;
  const newTemp = robotStatus.temperature + (tempDiff * 0.01 * delta);

  // Malfunction check
  const malfunctioning = newBattery <= 0;

  // Update robot status
  store.updateRobotStatus({
    battery: newBattery,
    durability: robotStatus.durability,
    temperature: newTemp,
    malfunctioning,
    overheated: newTemp > 40,
    frozen: newTemp < -10,
    repairParts: robotStatus.repairParts,
  });

  // Log battery
  if (!internalState.lastBatteryLog || elapsedTime - internalState.lastBatteryLog >= 1.0) {
    internalState.lastBatteryLog = elapsedTime;
    console.log('[Robot 2D] Battery:', newBattery.toFixed(2), '%');
  }

  // Critical state change logging
  if (!robotStatus.malfunctioning && malfunctioning) {
    store.addActivityLog({
      category: 'warning',
      importance: 'critical',
      entityId: 'robot',
      content: '⚠️ ロボットのバッテリーが切れました！機能停止中...',
    });
  }

  // === ENVIRONMENTAL DAMAGE SYSTEM ===
  const currentWeatherEvent = store.currentWeatherEvent;
  if (currentWeatherEvent && isWeatherEventActive(currentWeatherEvent, store.time * 3600 + store.day * 86400)) {
    // Check for shelter
    let inShelter = false;
    let shelterType: keyof typeof SHELTER_TYPES = 'none';

    const nearbyBuildings = store.buildings.filter(b => {
      if (!b.built) return false;
      const dx = b.position.x - robot!.position.x;
      const dz = b.position.z - robot!.position.z;
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

    // Apply weather damage
    const protection = SHELTER_TYPES[shelterType];
    const effectiveDamage = inShelter
      ? currentWeatherEvent.effects.damagePerSecond * (1 - protection.damageReduction)
      : currentWeatherEvent.effects.damagePerSecond;

    if (effectiveDamage > 0) {
      const damageAmount = effectiveDamage * delta;
      const newDurability = Math.max(0, store.robotStatus.durability - damageAmount);

      store.updateRobotStatus({
        ...store.robotStatus,
        durability: newDurability,
      });

      // Log damage every 5 seconds
      const lastEnvDamageLog = (window as any).__robotEnvDamageLog || 0;
      if (elapsedTime - lastEnvDamageLog > 5) {
        (window as any).__robotEnvDamageLog = elapsedTime;
        store.addActivityLog({
          category: 'warning',
          importance: inShelter ? 'low' : 'high',
          entityId: 'robot',
          content: inShelter
            ? `${currentWeatherEvent.name}の影響を受けています（シェルター内: ${(protection.damageReduction * 100).toFixed(0)}%軽減）`
            : `⚠️ ${currentWeatherEvent.name}で耐久度がダメージを受けています！シェルターに避難してください`,
        });
      }
    }
  }

  // === RESOURCE GATHERING ===
  if (elapsedTime - internalState.gatherCooldown > 2) {
    const materialNodes = getNearbyResources(store.resourceNodes, robot.position.x, robot.position.z, 5.0, ['scrap_metal', 'fiber', 'crystal']);

    if (materialNodes.length > 0) {
      internalState.gatherCooldown = elapsedTime;
      const node = materialNodes[0];

      if (node.capacity > 0.05) {
        const hasTool = false;
        const result = attemptGatherResource(node, hasTool);

        if (result.success) {
          const materialType = node.type as 'scrap_metal' | 'fiber' | 'crystal';
          const effectiveAmount = Math.max(1, Math.floor(getResourceValue(node, result.amount) * 10));

          console.log('[Robot 2D] Gathering:', node.name, '| Type:', materialType, '| Amount:', effectiveAmount);
          store.addInventoryItem(materialType, effectiveAmount);

          const updated = consumeResource(store.resourceNodes, node.id, result.amount);
          useStore.setState({ resourceNodes: updated });

          store.addActivityLog({
            category: 'event',
            importance: 'normal',
            entityId: 'robot',
            content: `🔨 ${node.name}を採取しました（×${effectiveAmount}）`,
          });

          store.addRobotMemory(createMemory(
            `${node.name}を採取した（×${effectiveAmount}）`,
            'event',
            ['resource'],
            0.6
          ));

          if (result.damaged) {
            const newDurability = Math.max(0, store.robotStatus.durability - 5);
            store.updateRobotStatus({
              ...store.robotStatus,
              durability: newDurability
            });
            store.addActivityLog({
              category: 'warning',
              importance: 'normal',
              entityId: 'robot',
              content: `⚠️ 採取中にダメージを受けました（-5 耐久度）`,
            });
          }
        }
      }
    }
  }

  // === BUILDING CONSTRUCTION ===
  if (elapsedTime - internalState.buildingCooldown > 30) {
    internalState.buildingCooldown = elapsedTime;
    const inventory = store.inventory;
    const buildings = store.buildings;

    // Auto-build tent if none exists
    const hasTent = buildings.some(b => b.type === 'tent');
    if (!hasTent) {
      const tentTemplate = createBuilding('tent', { x: robot.position.x, y: 0, z: robot.position.z });

      if (hasRequiredMaterials(tentTemplate, inventory) && canBuildHere(robot.position, buildings)) {
        const newInventory = consumeMaterials(tentTemplate, inventory);
        Object.keys(newInventory).forEach(key => {
          store.addInventoryItem(key, newInventory[key] - (inventory[key] || 0));
        });

        const newBuilding = {
          ...tentTemplate,
          constructionProgress: 0.01,
        };
        store.addBuilding(newBuilding);

        store.addActivityLog({
          category: 'build',
          importance: 'high',
          entityId: 'robot',
          content: `🏗️ ${tentTemplate.name}の建設を開始しました！`,
        });

        store.addRobotMemory(createMemory(
          `${tentTemplate.name}の建設を開始した`,
          'event',
          ['building'],
          0.8
        ));
      }
    }

    // Auto-build charging station if needed
    const hasChargingStation = buildings.some(b => b.type === 'charging_station');
    if (!hasChargingStation && store.robotStatus.battery < 50) {
      const stationTemplate = createBuilding('charging_station', { x: robot.position.x, y: 0, z: robot.position.z });

      if (hasRequiredMaterials(stationTemplate, inventory) && canBuildHere(robot.position, buildings)) {
        const newInventory = consumeMaterials(stationTemplate, inventory);
        Object.keys(newInventory).forEach(key => {
          store.addInventoryItem(key, newInventory[key] - (inventory[key] || 0));
        });

        const newBuilding = {
          ...stationTemplate,
          constructionProgress: 0.01,
        };
        store.addBuilding(newBuilding);

        store.addActivityLog({
          category: 'build',
          importance: 'high',
          entityId: 'robot',
          content: `🏗️ ${stationTemplate.name}の建設を開始しました！`,
        });

        store.addRobotMemory(createMemory(
          `${stationTemplate.name}の建設を開始した`,
          'event',
          ['building'],
          0.8
        ));
      }
    }
  }

  // === POSITION REPORTING ===
  if (elapsedTime - internalState.lastPositionUpdate > 0.5) {
    store.updateEntityPosition('robot', robot.position.x, robot.position.z);
    internalState.lastPositionUpdate = elapsedTime;
  }

  // === WORLD ELEMENT OBSERVATION ===
  if (elapsedTime - internalState.lastPositionUpdate < 0.6) {
    const nearby = getNearbyElements(robot.position.x, robot.position.z, 8, store.time);
    for (const elem of nearby) {
      if (!internalState.observedElements.has(elem.id)) {
        internalState.observedElements.add(elem.id);
        store.addRobotMemory(createMemory(
          elem.description,
          'observation',
          ['environment'],
          0.4
        ));
      }
    }
  }

  // === AI THINKING LOOP ===
  const apiKey = store.apiKey;
  const provider = store.provider;
  if (apiKey && !internalState.isThinking && elapsedTime - internalState.lastThinkTime > 20 && !store.robotStatus.malfunctioning) {
    internalState.lastThinkTime = elapsedTime;
    internalState.isThinking = true;

    const robotPos = store.entityPositions['robot'];
    const positions = store.entityPositions;
    const nearbyEntities = Object.entries(positions)
      .filter(([eid]) => eid !== 'robot')
      .map(([eid, pos]) => ({
        id: eid,
        distance: robotPos ? Math.sqrt((pos.x - robotPos.x) ** 2 + (pos.z - robotPos.z) ** 2) : 100,
      }))
      .filter(e => e.distance < 30)
      .slice(0, 5);

    const relevantMemories = selectRelevantMemories(store.robotMemories, nearbyEntities.map(e => e.id), 5);
    const memContext = relevantMemories.map(m => m.content).join('\n');
    const emotionCtx = emotionToDialogueContext(robot.emotion);
    const needsCtx = needsToDialogueContext(robot.needs, 'robot');
    const hours = Math.floor(store.time);
    const minutes = Math.floor((store.time % 1) * 60);
    const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;

    const recentThoughts = store.robotThoughts.slice(-3);
    const prevThoughtsCtx = recentThoughts.length > 0
      ? recentThoughts.map(t => `[${t.gameTime}] 思考:「${t.thought}」→ 行動: ${t.action}`).join('\n')
      : 'なし';

    const userDirective = store.userDirective;

    const contextPrompt = `現在地: (${robotPos?.x ?? 0}, ${robotPos?.z ?? 0})
時刻: ${timeStr} / Day ${store.day} / ${store.season}
天気: ${store.weather} / 気温: ${store.temperature}°C
${emotionCtx}
${needsCtx || ''}
近くのエンティティ: ${nearbyEntities.length > 0 ? nearbyEntities.map(e => `${e.id}(距離${e.distance.toFixed(0)})`).join(', ') : 'なし'}
前回の思考:
${prevThoughtsCtx}
${userDirective ? `\nユーザーからの指示: ${userDirective}` : ''}
最近の記憶:
${memContext}`;

    generateThought(provider, apiKey, contextPrompt)
      .then((result) => {
        if (!internalState) return;
        internalState.aiIntent = result;
        if (robot) {
          robot.currentThought = result.thought;
        }

        const gameTimeStr = `Day ${store.day}, ${timeStr}`;
        store.addRobotThought({
          thought: result.thought,
          action: result.action,
          timestamp: Date.now(),
          gameTime: gameTimeStr,
        });

        store.addActivityLog({
          category: 'thought',
          importance: 'normal',
          entityId: 'robot',
          content: `${result.action}: ${result.thought}`,
        });

        store.addRobotMemory(createMemory(
          `[思考] ${result.thought}`,
          'observation',
          ['self'],
          0.5
        ));

        if (userDirective) {
          store.setUserDirective(null);
        }

        // Clear thought bubble after 5 seconds
        setTimeout(() => {
          if (robot) {
            robot.currentThought = null;
          }
        }, 5000);
      })
      .catch((err) => {
        console.error('AI thinking failed:', err);
      })
      .finally(() => {
        if (internalState) {
          internalState.isThinking = false;
        }
      });
  }

  // === ACTIVITY-BASED AI LOGIC ===
  if (robot.state !== 'DIALOGUE' && elapsedTime > internalState.nextDecisionTime && !store.robotStatus.malfunctioning) {
    const currentActivity = store.entityActivities['robot'];

    if (shouldSwitchActivity(currentActivity)) {
      const positions = store.entityPositions;
      const robotPos = positions['robot'];
      const nearbyEntities = Object.entries(positions)
        .filter(([id]) => id !== 'robot')
        .map(([id, pos]) => ({
          id,
          distance: robotPos ? Math.sqrt((pos.x - robotPos.x) ** 2 + (pos.z - robotPos.z) ** 2) : 100,
        }))
        .filter(e => e.distance < 30);

      const desires = computeDesires(robot.needs, 'robot');
      let newActivity: ActivityState;

      // Use AI intent if available
      if (internalState.aiIntent) {
        const intent = internalState.aiIntent;
        const validActivities: string[] = ['explore', 'forage', 'rest', 'socialize', 'seek_resource', 'patrol', 'idle'];
        const activity = validActivities.includes(intent.action) ? intent.action : 'explore';
        newActivity = selectNextActivity(
          robot.emotion,
          store.time,
          store.weather,
          store.relationships,
          'robot',
          nearbyEntities,
          desires
        );
        newActivity.current = activity as typeof newActivity.current;
        internalState.aiIntent = null;
      } else {
        newActivity = selectNextActivity(
          robot.emotion,
          store.time,
          store.weather,
          store.relationships,
          'robot',
          nearbyEntities,
          desires
        );
      }

      // Handle seek_resource activity
      if (newActivity.current === 'seek_resource') {
        const nearbyRes = getNearbyResources(store.resourceNodes, robot.position.x, robot.position.z, 50, ['energy_node']);
        if (nearbyRes.length > 0) {
          newActivity.targetResourceId = nearbyRes[0].id;
        }
      }

      store.setEntityActivity('robot', newActivity);

      const pattern = getActivityMovementPattern(newActivity.current);

      if (newActivity.current === 'rest') {
        robot.state = 'IDLE';
        robot.targetPos = null;
        internalState.nextDecisionTime = elapsedTime + newActivity.duration;
      } else if (newActivity.current === 'seek_resource' && newActivity.targetResourceId) {
        const resNode = store.resourceNodes.find(r => r.id === newActivity.targetResourceId);
        if (resNode) {
          robot.targetPos = { x: resNode.position.x, z: resNode.position.z };
          robot.state = 'MOVING';
          internalState.nextDecisionTime = elapsedTime + 8 + Math.random() * 5;
        }
      } else if (newActivity.current === 'socialize' && newActivity.targetEntityId) {
        const targetPos = positions[newActivity.targetEntityId];
        if (targetPos) {
          robot.targetPos = { x: targetPos.x + (Math.random() - 0.5) * 3, z: targetPos.z + (Math.random() - 0.5) * 3 };
        } else {
          robot.targetPos = { x: (Math.random() - 0.5) * 10, z: (Math.random() - 0.5) * 10 };
        }
        robot.state = 'MOVING';
        internalState.nextDecisionTime = elapsedTime + 5 + Math.random() * 5;
      } else {
        const r = pattern.wanderRadius;
        const homeWeight = pattern.homeAffinity;
        const curX = robot.position.x;
        const curZ = robot.position.z;
        const baseX = curX * (1 - homeWeight);
        const baseZ = curZ * (1 - homeWeight);
        const newTargetX = baseX + (Math.random() - 0.5) * 2 * r;
        const newTargetZ = baseZ + (Math.random() - 0.5) * 2 * r;
        robot.targetPos = {
          x: Math.max(-90, Math.min(90, newTargetX)),
          z: Math.max(-90, Math.min(90, newTargetZ)),
        };
        robot.state = 'MOVING';
        internalState.nextDecisionTime = elapsedTime + 4 + Math.random() * 4;
      }
    } else if (robot.state === 'MOVING' && !robot.targetPos) {
      robot.state = 'IDLE';
      internalState.nextDecisionTime = elapsedTime + 2 + Math.random() * 2;
    } else if (robot.state === 'IDLE') {
      const activity = currentActivity?.current || 'forage';
      const pattern = getActivityMovementPattern(activity);
      if (Math.random() > pattern.pauseChance) {
        const r = pattern.wanderRadius || 10;
        const tx = Math.max(-90, Math.min(90, robot.position.x + (Math.random() - 0.5) * 2 * r));
        const tz = Math.max(-90, Math.min(90, robot.position.z + (Math.random() - 0.5) * 2 * r));
        robot.targetPos = { x: tx, z: tz };
        robot.state = 'MOVING';
      }
      internalState.nextDecisionTime = elapsedTime + 3 + Math.random() * 3;
    } else {
      robot.state = 'IDLE';
      robot.targetPos = null;
      internalState.nextDecisionTime = elapsedTime + 2 + Math.random() * 2;
    }
  }

  // === SHUTDOWN: Stop movement when battery is dead ===
  if (store.robotStatus.malfunctioning) {
    robot.velocity.x = 0;
    robot.velocity.z = 0;
    robot.state = 'IDLE';
    robot.targetPos = null;
  }

  // === MOVEMENT & PHYSICS ===
  // Safety bounds check
  if (robot.position.x < -95) robot.position.x = -95;
  if (robot.position.x > 95) robot.position.x = 95;
  if (robot.position.z < -95) robot.position.z = -95;
  if (robot.position.z > 95) robot.position.z = 95;

  // Terrain height correction (not used in 2D, but kept for future 3D compatibility)
  // const terrainY = getTerrainHeight(robot.position.x, robot.position.z);

  // Handle movement
  if (robot.state === 'DIALOGUE') {
    // Stop movement during dialogue
    robot.velocity.x = 0;
    robot.velocity.z = 0;

    if (robot.lookAtTarget) {
      const dx = robot.lookAtTarget.x - robot.position.x;
      const dz = robot.lookAtTarget.z - robot.position.z;
      robot.rotation = Math.atan2(dx, dz);
    }
  }

  if (robot.state === 'MOVING' && robot.targetPos) {
    const dx = robot.targetPos.x - robot.position.x;
    const dz = robot.targetPos.z - robot.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 1.0) {
      robot.state = 'IDLE';
      robot.targetPos = null;
      internalState.nextDecisionTime = elapsedTime + 2 + Math.random() * 2;
      robot.velocity.x = 0;
      robot.velocity.z = 0;
    } else {
      const dirX = dx / dist;
      const dirZ = dz / dist;
      const activityPattern = getActivityMovementPattern(store.entityActivities['robot']?.current || 'forage');
      const speed = 3.0 * emotionToSpeedMultiplier(robot.emotion) * activityPattern.speedMultiplier;
      robot.velocity.x = dirX * speed;
      robot.velocity.z = dirZ * speed;

      // Update rotation to face movement direction
      robot.rotation = Math.atan2(dirX, dirZ);
    }
  }

  // Apply velocity to position
  robot.position.x += robot.velocity.x * delta;
  robot.position.z += robot.velocity.z * delta;

  // Sync robot state to store
  useStore.setState({ robot: { ...robot } });
}

/**
 * Clean up robot state
 */
export function destroyRobot(): void {
  robot = null;
  internalState = null;
}
