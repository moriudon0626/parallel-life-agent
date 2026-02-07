/**
 * Environment System - Weather threats and environmental hazards
 * Phase 1: Environmental damage and protection mechanics
 */

import type { RobotStatus, CritterStatus } from './survival';
import { applyEnvironmentalDamage as applyDamageToRobot, getEnvironmentalDamage } from './survival';

// ========================================
// Types
// ========================================

export type WeatherType = 'sunny' | 'rainy' | 'cloudy' | 'snowy';

export interface WeatherEvent {
  type: 'storm' | 'heatwave' | 'blizzard' | 'drought' | 'calm';
  name: string;
  duration: number; // seconds
  startTime: number; // game timestamp
  effects: {
    temperatureChange: number;
    damagePerSecond: number;
    movementPenalty: number; // 0-1
    visibilityReduction: number; // 0-1
    resourceSpawnBlock: boolean;
  };
  warning: {
    message: string;
    timeBeforeStart: number; // seconds of warning
  };
}

export interface ShelterProtection {
  temperatureStabilization: number; // 0-1 (1 = perfect stabilization)
  weatherProtection: number; // 0-1 (1 = complete protection)
  damageReduction: number; // 0-1 (1 = no damage)
}

// ========================================
// Constants
// ========================================

export const WEATHER_EVENT_CONFIGS: Record<WeatherEvent['type'], Omit<WeatherEvent, 'startTime'>> = {
  storm: {
    type: 'storm',
    name: '嵐',
    duration: 180, // 3 minutes
    effects: {
      temperatureChange: -8,
      damagePerSecond: 0.5,
      movementPenalty: 0.5,
      visibilityReduction: 0.6,
      resourceSpawnBlock: false,
    },
    warning: {
      message: '⚠️ 嵐が接近中！シェルターに避難してください',
      timeBeforeStart: 60,
    },
  },
  heatwave: {
    type: 'heatwave',
    name: '熱波',
    duration: 600, // 10 minutes
    effects: {
      temperatureChange: 20,
      damagePerSecond: 0.3,
      movementPenalty: 0.3,
      visibilityReduction: 0.2,
      resourceSpawnBlock: true,
    },
    warning: {
      message: '⚠️ 熱波が発生します！水分補給と日陰が必要です',
      timeBeforeStart: 120,
    },
  },
  blizzard: {
    type: 'blizzard',
    name: '吹雪',
    duration: 210, // 3.5 minutes
    effects: {
      temperatureChange: -25,
      damagePerSecond: 1.0,
      movementPenalty: 0.7,
      visibilityReduction: 0.8,
      resourceSpawnBlock: true,
    },
    warning: {
      message: '🚨 吹雪が迫っています！直ちに避難してください',
      timeBeforeStart: 90,
    },
  },
  drought: {
    type: 'drought',
    name: '干ばつ',
    duration: 1800, // 30 minutes
    effects: {
      temperatureChange: 10,
      damagePerSecond: 0,
      movementPenalty: 0,
      visibilityReduction: 0,
      resourceSpawnBlock: true,
    },
    warning: {
      message: '⚠️ 干ばつが予想されます。水と食料を確保してください',
      timeBeforeStart: 300,
    },
  },
  calm: {
    type: 'calm',
    name: '穏やか',
    duration: 0,
    effects: {
      temperatureChange: 0,
      damagePerSecond: 0,
      movementPenalty: 0,
      visibilityReduction: 0,
      resourceSpawnBlock: false,
    },
    warning: {
      message: '',
      timeBeforeStart: 0,
    },
  },
};

export const SHELTER_TYPES: Record<string, ShelterProtection> = {
  none: {
    temperatureStabilization: 0,
    weatherProtection: 0,
    damageReduction: 0,
  },
  tent: {
    temperatureStabilization: 0.5,
    weatherProtection: 0.6,
    damageReduction: 0.5,
  },
  wooden_shelter: {
    temperatureStabilization: 0.7,
    weatherProtection: 0.8,
    damageReduction: 0.7,
  },
  reinforced_shelter: {
    temperatureStabilization: 0.9,
    weatherProtection: 0.95,
    damageReduction: 0.9,
  },
};

// ========================================
// Weather Event Generation
// ========================================

export function shouldTriggerWeatherEvent(
  currentWeather: WeatherType,
  temperature: number,
  day: number,
  season: string
): WeatherEvent['type'] | null {
  // Random weather events based on conditions
  const roll = Math.random();

  // Storms during rainy weather
  if (currentWeather === 'rainy' && roll < 0.05) {
    return 'storm';
  }

  // Blizzards during snowy weather
  if (currentWeather === 'snowy' && temperature < 0 && roll < 0.08) {
    return 'blizzard';
  }

  // Heatwaves during sunny summer
  if (currentWeather === 'sunny' && season === 'summer' && temperature > 30 && roll < 0.03) {
    return 'heatwave';
  }

  // Drought in late summer/autumn
  if (season === 'summer' || season === 'autumn') {
    if (day % 20 === 0 && roll < 0.1) {
      return 'drought';
    }
  }

  return null;
}

export function createWeatherEvent(type: WeatherEvent['type'], gameTime: number): WeatherEvent {
  const config = WEATHER_EVENT_CONFIGS[type];
  return {
    ...config,
    startTime: gameTime,
  };
}

// ========================================
// Environmental Damage Application
// ========================================

export function applyWeatherDamage(
  event: WeatherEvent,
  robotStatus: RobotStatus,
  critterStatus: CritterStatus,
  delta: number,
  inShelter: boolean,
  shelterType: keyof typeof SHELTER_TYPES = 'none'
): { robot: RobotStatus; critter: CritterStatus } {
  const protection = SHELTER_TYPES[shelterType];

  // Calculate effective damage with shelter protection
  const effectiveDamage = inShelter
    ? event.effects.damagePerSecond * (1 - protection.damageReduction)
    : event.effects.damagePerSecond;

  // Apply damage to robot
  const newRobotDurability = Math.max(0, robotStatus.durability - effectiveDamage * delta);

  // Apply damage to critter
  const newCritterHealth = Math.max(0, critterStatus.health - effectiveDamage * delta);

  return {
    robot: {
      ...robotStatus,
      durability: newRobotDurability,
    },
    critter: {
      ...critterStatus,
      health: newCritterHealth,
    },
  };
}

export function getEffectiveTemperature(
  ambientTemp: number,
  event: WeatherEvent | null,
  inShelter: boolean,
  shelterType: keyof typeof SHELTER_TYPES = 'none'
): number {
  let effectiveTemp = ambientTemp;

  // Apply weather event temperature change
  if (event) {
    effectiveTemp += event.effects.temperatureChange;
  }

  // Apply shelter stabilization
  if (inShelter) {
    const protection = SHELTER_TYPES[shelterType];
    const stabilizationTarget = 20; // comfortable temperature
    const tempDiff = effectiveTemp - stabilizationTarget;
    effectiveTemp = stabilizationTarget + tempDiff * (1 - protection.temperatureStabilization);
  }

  return effectiveTemp;
}

export function getMovementSpeed(
  baseSpeed: number,
  event: WeatherEvent | null,
  inShelter: boolean
): number {
  if (inShelter) return baseSpeed; // No movement penalty in shelter

  if (!event) return baseSpeed;

  return baseSpeed * (1 - event.effects.movementPenalty);
}

// ========================================
// Weather Warnings and UI
// ========================================

export function getWeatherWarning(
  event: WeatherEvent,
  currentGameTime: number
): string | null {
  const timeUntilStart = event.startTime - currentGameTime;

  if (timeUntilStart > 0 && timeUntilStart <= event.warning.timeBeforeStart) {
    const minutesUntil = Math.ceil(timeUntilStart / 60);
    return `${event.warning.message} (${minutesUntil}分後)`;
  }

  return null;
}

export function isWeatherEventActive(
  event: WeatherEvent,
  currentGameTime: number
): boolean {
  const elapsedTime = currentGameTime - event.startTime;
  return elapsedTime >= 0 && elapsedTime < event.duration;
}

export function getWeatherEventProgress(
  event: WeatherEvent,
  currentGameTime: number
): number {
  const elapsedTime = currentGameTime - event.startTime;
  return Math.min(1, Math.max(0, elapsedTime / event.duration));
}

// ========================================
// Resource Impact
// ========================================

export function shouldBlockResourceRegen(
  event: WeatherEvent | null,
  currentGameTime: number
): boolean {
  if (!event) return false;

  if (isWeatherEventActive(event, currentGameTime)) {
    return event.effects.resourceSpawnBlock;
  }

  return false;
}

// ========================================
// Daily Weather Cycle
// ========================================

export interface DailyWeatherPattern {
  morning: { weather: WeatherType; temperature: number };
  afternoon: { weather: WeatherType; temperature: number };
  evening: { weather: WeatherType; temperature: number };
  night: { weather: WeatherType; temperature: number };
}

export function generateDailyWeather(
  day: number,
  season: 'spring' | 'summer' | 'autumn' | 'winter'
): DailyWeatherPattern {
  const seed = day * 7919; // Simple pseudo-random based on day
  const random = (Math.sin(seed) + 1) / 2;

  const seasonalBaseTemp = {
    spring: 15,
    summer: 25,
    autumn: 12,
    winter: -5,
  };

  const baseTemp = seasonalBaseTemp[season];

  // Determine dominant weather for the day
  let dominantWeather: WeatherType;
  if (random < 0.3) dominantWeather = 'sunny';
  else if (random < 0.6) dominantWeather = 'cloudy';
  else if (season === 'winter') dominantWeather = 'snowy';
  else dominantWeather = 'rainy';

  return {
    morning: {
      weather: dominantWeather,
      temperature: baseTemp - 3 + Math.random() * 2,
    },
    afternoon: {
      weather: dominantWeather === 'cloudy' && random > 0.7 ? 'sunny' : dominantWeather,
      temperature: baseTemp + 5 + Math.random() * 3,
    },
    evening: {
      weather: dominantWeather,
      temperature: baseTemp + Math.random() * 2,
    },
    night: {
      weather: dominantWeather === 'sunny' ? 'cloudy' : dominantWeather,
      temperature: baseTemp - 5 + Math.random() * 2,
    },
  };
}

export function getTimeOfDay(time: number): keyof DailyWeatherPattern {
  if (time >= 6 && time < 12) return 'morning';
  if (time >= 12 && time < 18) return 'afternoon';
  if (time >= 18 && time < 22) return 'evening';
  return 'night';
}
