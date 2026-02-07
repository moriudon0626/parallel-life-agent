/**
 * Survival System - Health, Battery, Temperature Management
 * Phase 1: Core survival mechanics for robots and critters
 */

// ========================================
// Types
// ========================================

export interface RobotStatus {
  battery: number; // 0-100%
  durability: number; // 0-100%
  temperature: number; // -20 to 50°C
  malfunctioning: boolean; // true if battery = 0
  overheated: boolean; // true if temp > 40°C
  frozen: boolean; // true if temp < -10°C
  repairParts: number; // Parts available for self-repair
}

export interface CritterStatus {
  health: number; // 0-100
  hunger: number; // 0-100%
  fatigue: number; // 0-100%
  temperature: number; // Body temperature
  isDying: boolean; // true if health < 10
  starvationTimer: number; // Seconds until death from starvation
}

export interface EnvironmentalDamage {
  type: 'heat' | 'cold' | 'storm' | 'blizzard';
  damagePerSecond: number;
  temperatureChange: number;
  movementPenalty: number; // 0-1 (0 = normal, 1 = can't move)
}

// ========================================
// Constants
// ========================================

export const ROBOT_CONSTANTS = {
  BATTERY_DRAIN_IDLE: 0.5, // % per minute idle
  BATTERY_DRAIN_MOVING: 1.5, // % per minute moving
  BATTERY_DRAIN_WORKING: 2.0, // % per minute working

  SOLAR_CHARGE_RATE: 2.0, // % per minute in sunny weather
  ENERGY_NODE_CHARGE_RATE: 10.0, // % per minute at charging station

  MALFUNCTION_THRESHOLD: 0, // Battery % for malfunction
  DEATH_TIMER: 259200, // 3 days in seconds (259200s) before permanent death

  TEMP_NORMAL_MIN: 0,
  TEMP_NORMAL_MAX: 35,
  TEMP_OVERHEAT: 40,
  TEMP_FREEZE: -10,

  OVERHEAT_DAMAGE: 0.5, // Durability loss per second
  FREEZE_DAMAGE: 0.3, // Durability loss per second
};

export const CRITTER_CONSTANTS = {
  HUNGER_DRAIN: 2.0, // % per minute
  HUNGER_DRAIN_NIGHT: 1.0, // % per minute during sleep

  FATIGUE_GAIN_ACTIVE: 1.5, // % per minute when active
  FATIGUE_RECOVERY_REST: 5.0, // % per minute when resting
  FATIGUE_RECOVERY_SHELTER: 10.0, // % per minute in shelter

  STARVATION_DAMAGE: 1.0, // HP per second when hunger = 0
  STARVATION_DEATH_TIME: 300, // 5 minutes of starvation = death

  TEMP_NORMAL_MIN: 10,
  TEMP_NORMAL_MAX: 30,
  COLD_DAMAGE: 0.5, // HP per second in cold
  HEAT_DAMAGE: 0.3, // HP per second in heat
};

// ========================================
// Robot Status Management
// ========================================

export function createDefaultRobotStatus(): RobotStatus {
  return {
    battery: 100,
    durability: 100,
    temperature: 20,
    malfunctioning: false,
    overheated: false,
    frozen: false,
    repairParts: 3, // Start with 3 repair parts
  };
}

export function updateRobotBattery(
  status: RobotStatus,
  delta: number,
  activity: 'idle' | 'moving' | 'working'
): RobotStatus {
  const drainRates = {
    idle: ROBOT_CONSTANTS.BATTERY_DRAIN_IDLE,
    moving: ROBOT_CONSTANTS.BATTERY_DRAIN_MOVING,
    working: ROBOT_CONSTANTS.BATTERY_DRAIN_WORKING,
  };

  const drain = (drainRates[activity] / 60) * delta; // Convert per-minute to per-second
  const newBattery = Math.max(0, status.battery - drain);

  return {
    ...status,
    battery: newBattery,
    malfunctioning: newBattery <= ROBOT_CONSTANTS.MALFUNCTION_THRESHOLD,
  };
}

export function chargeRobotBattery(
  status: RobotStatus,
  delta: number,
  source: 'solar' | 'energy_node'
): RobotStatus {
  const chargeRates = {
    solar: ROBOT_CONSTANTS.SOLAR_CHARGE_RATE,
    energy_node: ROBOT_CONSTANTS.ENERGY_NODE_CHARGE_RATE,
  };

  const charge = (chargeRates[source] / 60) * delta;
  const newBattery = Math.min(100, status.battery + charge);

  return {
    ...status,
    battery: newBattery,
    malfunctioning: newBattery <= ROBOT_CONSTANTS.MALFUNCTION_THRESHOLD,
  };
}

export function updateRobotTemperature(
  status: RobotStatus,
  ambientTemp: number,
  delta: number,
  inShelter: boolean = false
): RobotStatus {
  // Temperature converges toward ambient (slower in shelter)
  const convergenceRate = inShelter ? 0.5 : 2.0;
  const tempDiff = ambientTemp - status.temperature;
  const tempChange = (tempDiff * convergenceRate * delta) / 60;

  let newTemp = status.temperature + tempChange;

  // Apply damage if out of normal range
  let newDurability = status.durability;

  if (newTemp > ROBOT_CONSTANTS.TEMP_OVERHEAT) {
    newDurability = Math.max(0, newDurability - ROBOT_CONSTANTS.OVERHEAT_DAMAGE * delta);
  } else if (newTemp < ROBOT_CONSTANTS.TEMP_FREEZE) {
    newDurability = Math.max(0, newDurability - ROBOT_CONSTANTS.FREEZE_DAMAGE * delta);
  }

  return {
    ...status,
    temperature: newTemp,
    durability: newDurability,
    overheated: newTemp > ROBOT_CONSTANTS.TEMP_OVERHEAT,
    frozen: newTemp < ROBOT_CONSTANTS.TEMP_FREEZE,
  };
}

export function repairRobot(status: RobotStatus): RobotStatus {
  if (status.repairParts <= 0) return status;

  return {
    ...status,
    durability: Math.min(100, status.durability + 30),
    repairParts: status.repairParts - 1,
  };
}

// ========================================
// Critter Status Management
// ========================================

export function createDefaultCritterStatus(): CritterStatus {
  return {
    health: 100,
    hunger: 100,
    fatigue: 0,
    temperature: 20,
    isDying: false,
    starvationTimer: 0,
  };
}

export function updateCritterHunger(
  status: CritterStatus,
  delta: number,
  isNight: boolean
): CritterStatus {
  const drainRate = isNight
    ? CRITTER_CONSTANTS.HUNGER_DRAIN_NIGHT
    : CRITTER_CONSTANTS.HUNGER_DRAIN;

  const drain = (drainRate / 60) * delta;
  const newHunger = Math.max(0, status.hunger - drain);

  // Starvation damage
  let newHealth = status.health;
  let newStarvationTimer = status.starvationTimer;

  if (newHunger === 0) {
    newStarvationTimer += delta;
    newHealth = Math.max(0, newHealth - CRITTER_CONSTANTS.STARVATION_DAMAGE * delta);
  } else {
    newStarvationTimer = 0;
  }

  return {
    ...status,
    hunger: newHunger,
    health: newHealth,
    starvationTimer: newStarvationTimer,
    isDying: newHealth < 10 || newStarvationTimer > CRITTER_CONSTANTS.STARVATION_DEATH_TIME,
  };
}

export function feedCritter(status: CritterStatus, foodValue: number): CritterStatus {
  return {
    ...status,
    hunger: Math.min(100, status.hunger + foodValue),
    starvationTimer: 0,
  };
}

export function updateCritterFatigue(
  status: CritterStatus,
  delta: number,
  activity: 'active' | 'resting',
  inShelter: boolean = false
): CritterStatus {
  let fatigueChange: number;

  if (activity === 'active') {
    fatigueChange = (CRITTER_CONSTANTS.FATIGUE_GAIN_ACTIVE / 60) * delta;
  } else {
    const recoveryRate = inShelter
      ? CRITTER_CONSTANTS.FATIGUE_RECOVERY_SHELTER
      : CRITTER_CONSTANTS.FATIGUE_RECOVERY_REST;
    fatigueChange = -(recoveryRate / 60) * delta;
  }

  const newFatigue = Math.max(0, Math.min(100, status.fatigue + fatigueChange));

  return {
    ...status,
    fatigue: newFatigue,
  };
}

export function updateCritterTemperature(
  status: CritterStatus,
  ambientTemp: number,
  delta: number,
  inShelter: boolean = false
): CritterStatus {
  // Body temperature regulation (critters are better at this than robots)
  const convergenceRate = inShelter ? 0.2 : 1.0;
  const tempDiff = ambientTemp - status.temperature;
  const tempChange = (tempDiff * convergenceRate * delta) / 60;

  let newTemp = status.temperature + tempChange;
  let newHealth = status.health;

  // Temperature damage
  if (newTemp < CRITTER_CONSTANTS.TEMP_NORMAL_MIN) {
    newHealth = Math.max(0, newHealth - CRITTER_CONSTANTS.COLD_DAMAGE * delta);
  } else if (newTemp > CRITTER_CONSTANTS.TEMP_NORMAL_MAX) {
    newHealth = Math.max(0, newHealth - CRITTER_CONSTANTS.HEAT_DAMAGE * delta);
  }

  return {
    ...status,
    temperature: newTemp,
    health: newHealth,
    isDying: newHealth < 10,
  };
}

export function healCritter(status: CritterStatus, healAmount: number): CritterStatus {
  return {
    ...status,
    health: Math.min(100, status.health + healAmount),
    isDying: false,
  };
}

// ========================================
// Environmental Damage
// ========================================

export function getEnvironmentalDamage(
  weather: 'sunny' | 'rainy' | 'cloudy' | 'snowy',
  temperature: number
): EnvironmentalDamage | null {
  // Storm conditions (heavy rain + wind)
  if (weather === 'rainy' && Math.random() < 0.1) {
    return {
      type: 'storm',
      damagePerSecond: 0.5,
      temperatureChange: -5,
      movementPenalty: 0.5,
    };
  }

  // Blizzard (snow + extreme cold)
  if (weather === 'snowy' && temperature < -5) {
    return {
      type: 'blizzard',
      damagePerSecond: 1.0,
      temperatureChange: -15,
      movementPenalty: 0.7,
    };
  }

  // Heatwave
  if (weather === 'sunny' && temperature > 35) {
    return {
      type: 'heat',
      damagePerSecond: 0.3,
      temperatureChange: 10,
      movementPenalty: 0.3,
    };
  }

  // Extreme cold
  if (temperature < -10) {
    return {
      type: 'cold',
      damagePerSecond: 0.5,
      temperatureChange: -10,
      movementPenalty: 0.4,
    };
  }

  return null;
}

export function applyEnvironmentalDamage(
  damage: EnvironmentalDamage,
  robotStatus: RobotStatus,
  delta: number
): RobotStatus {
  const dmg = damage.damagePerSecond * delta;

  return {
    ...robotStatus,
    durability: Math.max(0, robotStatus.durability - dmg),
  };
}

// ========================================
// Status Checks
// ========================================

export function isRobotFunctional(status: RobotStatus): boolean {
  return !status.malfunctioning && status.durability > 0;
}

export function isCritterAlive(status: CritterStatus): boolean {
  return status.health > 0 && !status.isDying;
}

export function getRobotStatusWarnings(status: RobotStatus): string[] {
  const warnings: string[] = [];

  if (status.battery < 20) warnings.push('バッテリー低下');
  if (status.battery === 0) warnings.push('⚠️ 機能停止');
  if (status.durability < 30) warnings.push('耐久性低下');
  if (status.overheated) warnings.push('🔥 オーバーヒート');
  if (status.frozen) warnings.push('❄️ 凍結');
  if (status.repairParts === 0) warnings.push('修理部品なし');

  return warnings;
}

export function getCritterStatusWarnings(status: CritterStatus): string[] {
  const warnings: string[] = [];

  if (status.hunger < 20) warnings.push('空腹');
  if (status.hunger === 0) warnings.push('⚠️ 餓死寸前');
  if (status.fatigue > 80) warnings.push('疲労困憊');
  if (status.health < 30) warnings.push('瀕死');
  if (status.isDying) warnings.push('🚨 危篤状態');

  return warnings;
}
