/**
 * Building System - Shelter construction and management
 * Phase 1: Basic shelters for survival
 */

// ========================================
// Types
// ========================================

export type BuildingType = 'tent' | 'storage' | 'charging_station' | 'wooden_shelter' | 'workshop';

export interface Building {
  id: string;
  type: BuildingType;
  name: string;
  position: { x: number; y: number; z: number };
  radius: number; // Area of effect
  capacity: number; // How many entities can use it
  durability: number; // 0-100
  level: number; // 1-3
  effects: {
    shelterProtection?: number; // 0-1
    storageSlots?: number;
    chargeRate?: number; // Battery % per second
    repairRate?: number; // Durability % per second
    temperatureControl?: number; // Temperature stabilization
  };
  requiredMaterials: {
    fiber?: number;
    scrap_metal?: number;
    crystal?: number;
    high_quality_parts?: number;
  };
  built: boolean;
  constructionProgress: number; // 0-1
  constructionTime: number; // seconds
}

// ========================================
// Building Templates
// ========================================

export const BUILDING_TEMPLATES: Record<BuildingType, Omit<Building, 'id' | 'position' | 'built' | 'constructionProgress'>> = {
  tent: {
    type: 'tent',
    name: '簡易テント',
    radius: 3,
    capacity: 2,
    durability: 100,
    level: 1,
    effects: {
      shelterProtection: 0.6,
      temperatureControl: 0.5,
    },
    requiredMaterials: {
      fiber: 5,
    },
    constructionTime: 30, // 30 seconds
  },
  storage: {
    type: 'storage',
    name: '倉庫',
    radius: 2,
    capacity: 1,
    durability: 100,
    level: 1,
    effects: {
      storageSlots: 100,
    },
    requiredMaterials: {
      fiber: 5,
      scrap_metal: 5,
    },
    constructionTime: 60,
  },
  charging_station: {
    type: 'charging_station',
    name: '充電ステーション',
    radius: 2,
    capacity: 1,
    durability: 100,
    level: 1,
    effects: {
      chargeRate: 0.3, // 30% per second
    },
    requiredMaterials: {
      scrap_metal: 15,
      crystal: 3,
    },
    constructionTime: 90,
  },
  wooden_shelter: {
    type: 'wooden_shelter',
    name: '木造シェルター',
    radius: 5,
    capacity: 4,
    durability: 100,
    level: 2,
    effects: {
      shelterProtection: 0.8,
      temperatureControl: 0.7,
      storageSlots: 50,
    },
    requiredMaterials: {
      fiber: 15,
      scrap_metal: 10,
    },
    constructionTime: 180, // 3 minutes
  },
  workshop: {
    type: 'workshop',
    name: '作業場',
    radius: 4,
    capacity: 2,
    durability: 100,
    level: 2,
    effects: {
      repairRate: 0.1, // 10% durability per second
      shelterProtection: 0.5,
    },
    requiredMaterials: {
      scrap_metal: 20,
      fiber: 10,
      crystal: 2,
    },
    constructionTime: 150,
  },
};

// ========================================
// Building Management
// ========================================

export function createBuilding(
  type: BuildingType,
  position: { x: number; y: number; z: number }
): Building {
  const template = BUILDING_TEMPLATES[type];
  return {
    ...template,
    id: `building_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    position,
    built: false,
    constructionProgress: 0,
  };
}

export function canBuildHere(
  position: { x: number; z: number },
  existingBuildings: Building[],
  minDistance: number = 5
): boolean {
  // Check if too close to other buildings
  for (const building of existingBuildings) {
    const dx = building.position.x - position.x;
    const dz = building.position.z - position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < minDistance) return false;
  }

  // Check world bounds
  if (Math.abs(position.x) > 90 || Math.abs(position.z) > 90) {
    return false;
  }

  return true;
}

export function hasRequiredMaterials(
  building: Building,
  inventory: Record<string, number>
): boolean {
  const required = building.requiredMaterials;

  for (const [material, amount] of Object.entries(required)) {
    if ((inventory[material] || 0) < amount) {
      return false;
    }
  }

  return true;
}

export function consumeMaterials(
  building: Building,
  inventory: Record<string, number>
): Record<string, number> {
  const newInventory = { ...inventory };

  for (const [material, amount] of Object.entries(building.requiredMaterials)) {
    newInventory[material] = (newInventory[material] || 0) - amount;
  }

  return newInventory;
}

export function updateConstructionProgress(
  building: Building,
  delta: number,
  workerCount: number = 1
): Building {
  if (building.built) return building;

  // Progress faster with more workers (max 3x speed with 3 workers)
  const speedMultiplier = Math.min(3, 1 + (workerCount - 1) * 0.5);
  const progressDelta = (delta / building.constructionTime) * speedMultiplier;
  const newProgress = Math.min(1, building.constructionProgress + progressDelta);

  return {
    ...building,
    constructionProgress: newProgress,
    built: newProgress >= 1,
  };
}

export function isEntityInBuilding(
  entityPos: { x: number; z: number },
  building: Building
): boolean {
  if (!building.built) return false;

  const dx = entityPos.x - building.position.x;
  const dz = entityPos.z - building.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  return dist <= building.radius;
}

export function repairBuilding(
  building: Building,
  repairAmount: number,
  materialCost: number,
  inventory: Record<string, number>
): { building: Building; inventory: Record<string, number> } | null {
  if (building.durability >= 100) return null;

  const scrapMetal = inventory.scrap_metal || 0;
  if (scrapMetal < materialCost) return null;

  return {
    building: {
      ...building,
      durability: Math.min(100, building.durability + repairAmount),
    },
    inventory: {
      ...inventory,
      scrap_metal: scrapMetal - materialCost,
    },
  };
}

export function damageBuilding(
  building: Building,
  damage: number
): Building {
  return {
    ...building,
    durability: Math.max(0, building.durability - damage),
  };
}

export function isBuildingFunctional(building: Building): boolean {
  return building.built && building.durability > 0;
}

// ========================================
// Building Effects
// ========================================

export function getBuildingEffect<K extends keyof Building['effects']>(
  buildings: Building[],
  position: { x: number; z: number },
  effectType: K
): NonNullable<Building['effects'][K]> {
  let bestEffect: any = 0;

  for (const building of buildings) {
    if (!isBuildingFunctional(building)) continue;
    if (!isEntityInBuilding(position, building)) continue;

    const effect = building.effects[effectType];
    if (effect !== undefined && effect > bestEffect) {
      bestEffect = effect;
    }
  }

  return bestEffect;
}

export function getAvailableBuildings(
  inventory: Record<string, number>
): BuildingType[] {
  const available: BuildingType[] = [];

  for (const [type, template] of Object.entries(BUILDING_TEMPLATES)) {
    const building = { ...template, requiredMaterials: template.requiredMaterials } as Building;
    if (hasRequiredMaterials(building, inventory)) {
      available.push(type as BuildingType);
    }
  }

  return available;
}

export function getBuildingDescription(building: Building): string {
  const effectsDesc: string[] = [];

  if (building.effects.shelterProtection) {
    effectsDesc.push(`保護: ${(building.effects.shelterProtection * 100).toFixed(0)}%`);
  }
  if (building.effects.storageSlots) {
    effectsDesc.push(`保管: ${building.effects.storageSlots}スロット`);
  }
  if (building.effects.chargeRate) {
    effectsDesc.push(`充電: ${(building.effects.chargeRate * 100).toFixed(0)}%/秒`);
  }
  if (building.effects.temperatureControl) {
    effectsDesc.push(`温度調整: ${(building.effects.temperatureControl * 100).toFixed(0)}%`);
  }

  const materialsDesc = Object.entries(building.requiredMaterials)
    .map(([mat, amt]) => `${mat}×${amt}`)
    .join(', ');

  return `${building.name} [${effectsDesc.join(', ')}] 必要素材: ${materialsDesc}`;
}
