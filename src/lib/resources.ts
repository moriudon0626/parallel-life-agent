// Resource Nodes - Points in the world where entities can satisfy needs
// Phase 1 Extension: Food, Water, Materials with quality and danger

export type ResourceType =
    // Food sources
    | 'mineral_ore' | 'glowing_mushroom' | 'vegetation' | 'berry_bush' | 'prey_animal'
    // Energy sources
    | 'energy_node' | 'solar_panel' | 'ancient_battery'
    // Materials
    | 'scrap_metal' | 'fiber' | 'high_quality_parts' | 'crystal'
    // Water
    | 'water' | 'river' | 'pond';

export type ResourceCategory = 'food' | 'energy' | 'material' | 'water';

export interface ResourceNode {
    id: string;
    type: ResourceType;
    category: ResourceCategory;
    name: string;
    position: { x: number; y: number; z: number };
    radius: number;
    capacity: number;    // 0-1, current available amount
    regenRate: number;   // per second regeneration
    maxCapacity: number; // always 1.0
    quality: number;     // 0.5-1.5 multiplier for effectiveness (NEW)
    dangerLevel: number; // 0-1, chance of damage when gathering (NEW)
    requiresTool: boolean; // Some resources need tools to gather (NEW)
}

export function createInitialResources(): ResourceNode[] {
    return [
        // === FOOD SOURCES ===
        // Mineral ore (critter food) - low quality but safe
        { id: 'ore-1', type: 'mineral_ore', category: 'food', name: '鉱石', position: { x: -25, y: 0.3, z: 15 }, radius: 3, capacity: 1.0, regenRate: 0.005, maxCapacity: 1.0, quality: 0.7, dangerLevel: 0.0, requiresTool: false },
        { id: 'ore-2', type: 'mineral_ore', category: 'food', name: '鉱石', position: { x: 20, y: 0.3, z: -20 }, radius: 3, capacity: 1.0, regenRate: 0.005, maxCapacity: 1.0, quality: 0.7, dangerLevel: 0.0, requiresTool: false },
        { id: 'ore-3', type: 'mineral_ore', category: 'food', name: '鉱石', position: { x: 30, y: 0.3, z: 10 }, radius: 3, capacity: 1.0, regenRate: 0.005, maxCapacity: 1.0, quality: 0.7, dangerLevel: 0.0, requiresTool: false },

        // Glowing mushrooms - high quality, slight danger (poisonous variants)
        { id: 'mushroom-food-1', type: 'glowing_mushroom', category: 'food', name: '光るキノコ', position: { x: -8, y: 0, z: 12 }, radius: 3, capacity: 1.0, regenRate: 0.004, maxCapacity: 1.0, quality: 1.2, dangerLevel: 0.1, requiresTool: false },
        { id: 'mushroom-food-2', type: 'glowing_mushroom', category: 'food', name: '光るキノコ', position: { x: 15, y: 0, z: -8 }, radius: 3, capacity: 1.0, regenRate: 0.004, maxCapacity: 1.0, quality: 1.2, dangerLevel: 0.1, requiresTool: false },

        // Berry bushes - good quality, fast regen
        { id: 'berry-1', type: 'berry_bush', category: 'food', name: 'ベリーの木', position: { x: 5, y: 0, z: 5 }, radius: 2, capacity: 1.0, regenRate: 0.01, maxCapacity: 1.0, quality: 1.0, dangerLevel: 0.0, requiresTool: false },
        { id: 'berry-2', type: 'berry_bush', category: 'food', name: 'ベリーの木', position: { x: -12, y: 0, z: -8 }, radius: 2, capacity: 1.0, regenRate: 0.01, maxCapacity: 1.0, quality: 1.0, dangerLevel: 0.0, requiresTool: false },

        // Vegetation (for herbivores)
        { id: 'veg-1', type: 'vegetation', category: 'food', name: '草地', position: { x: 12, y: 0, z: 8 }, radius: 4, capacity: 1.0, regenRate: 0.006, maxCapacity: 1.0, quality: 0.8, dangerLevel: 0.0, requiresTool: false },
        { id: 'veg-2', type: 'vegetation', category: 'food', name: '草地', position: { x: -15, y: 0, z: -12 }, radius: 4, capacity: 1.0, regenRate: 0.006, maxCapacity: 1.0, quality: 0.8, dangerLevel: 0.0, requiresTool: false },
        { id: 'veg-3', type: 'vegetation', category: 'food', name: '草地', position: { x: -10, y: 0, z: 20 }, radius: 4, capacity: 1.0, regenRate: 0.006, maxCapacity: 1.0, quality: 0.8, dangerLevel: 0.0, requiresTool: false },

        // === ENERGY SOURCES ===
        // Energy nodes - high output, slow regen
        { id: 'energy-1', type: 'energy_node', category: 'energy', name: 'エネルギーノード', position: { x: 8, y: 0.5, z: -8 }, radius: 2.5, capacity: 1.0, regenRate: 0.008, maxCapacity: 1.0, quality: 1.0, dangerLevel: 0.0, requiresTool: false },
        { id: 'energy-2', type: 'energy_node', category: 'energy', name: 'エネルギーノード', position: { x: -5, y: 0.5, z: -5 }, radius: 2.5, capacity: 1.0, regenRate: 0.008, maxCapacity: 1.0, quality: 1.0, dangerLevel: 0.0, requiresTool: false },

        // Ancient battery - one-time use, very high quality
        { id: 'battery-1', type: 'ancient_battery', category: 'energy', name: '古代バッテリー', position: { x: -18, y: 0.5, z: 18 }, radius: 1, capacity: 1.0, regenRate: 0.0, maxCapacity: 1.0, quality: 2.0, dangerLevel: 0.2, requiresTool: false },

        // === MATERIALS ===
        // Scrap metal - for repairs and building
        { id: 'scrap-1', type: 'scrap_metal', category: 'material', name: 'スクラップ金属', position: { x: 22, y: 0, z: 5 }, radius: 2, capacity: 1.0, regenRate: 0.0, maxCapacity: 1.0, quality: 0.8, dangerLevel: 0.1, requiresTool: false },
        { id: 'scrap-2', type: 'scrap_metal', category: 'material', name: 'スクラップ金属', position: { x: -20, y: 0, z: -15 }, radius: 2, capacity: 1.0, regenRate: 0.0, maxCapacity: 1.0, quality: 0.8, dangerLevel: 0.1, requiresTool: false },

        // Fiber - for shelter building
        { id: 'fiber-1', type: 'fiber', category: 'material', name: '繊維', position: { x: 0, y: 0, z: 15 }, radius: 3, capacity: 1.0, regenRate: 0.003, maxCapacity: 1.0, quality: 1.0, dangerLevel: 0.0, requiresTool: false },
        { id: 'fiber-2', type: 'fiber', category: 'material', name: '繊維', position: { x: -8, y: 0, z: -18 }, radius: 3, capacity: 1.0, regenRate: 0.003, maxCapacity: 1.0, quality: 1.0, dangerLevel: 0.0, requiresTool: false },

        // Crystal - rare, high quality, for advanced building
        { id: 'crystal-1', type: 'crystal', category: 'material', name: 'クリスタル', position: { x: 25, y: 0.8, z: -25 }, radius: 1.5, capacity: 1.0, regenRate: 0.001, maxCapacity: 1.0, quality: 1.5, dangerLevel: 0.15, requiresTool: true },

        // === WATER SOURCES ===
        // River - infinite water source
        { id: 'river-1', type: 'river', category: 'water', name: '川', position: { x: 0, y: 0, z: -10 }, radius: 5, capacity: 1.0, regenRate: 0.1, maxCapacity: 1.0, quality: 1.0, dangerLevel: 0.0, requiresTool: false },

        // Pond - limited but closer
        { id: 'pond-1', type: 'pond', category: 'water', name: '池', position: { x: 10, y: 0, z: 12 }, radius: 3, capacity: 1.0, regenRate: 0.05, maxCapacity: 1.0, quality: 0.9, dangerLevel: 0.0, requiresTool: false },
    ];
}

export function getNearbyResources(
    resources: ResourceNode[],
    x: number, z: number,
    range: number,
    typeFilter?: ResourceType[]
): (ResourceNode & { distance: number })[] {
    return resources
        .filter(r => {
            if (r.capacity < 0.05) return false; // depleted
            if (typeFilter && !typeFilter.includes(r.type)) return false;
            const dx = r.position.x - x;
            const dz = r.position.z - z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            return dist < range + r.radius;
        })
        .map(r => {
            const dx = r.position.x - x;
            const dz = r.position.z - z;
            return { ...r, distance: Math.sqrt(dx * dx + dz * dz) };
        })
        .sort((a, b) => a.distance - b.distance);
}

export function consumeResource(resources: ResourceNode[], id: string, amount: number): ResourceNode[] {
    return resources.map(r => {
        if (r.id !== id) return r;
        return { ...r, capacity: Math.max(0, r.capacity - amount) };
    });
}

export function regenerateResources(resources: ResourceNode[], deltaSeconds: number): ResourceNode[] {
    return resources.map(r => {
        if (r.capacity >= r.maxCapacity) return r;
        return { ...r, capacity: Math.min(r.maxCapacity, r.capacity + r.regenRate * deltaSeconds) };
    });
}

// === NEW PHASE 1 HELPERS ===

export function getResourcesByCategory(
    resources: ResourceNode[],
    category: ResourceCategory
): ResourceNode[] {
    return resources.filter(r => r.category === category && r.capacity > 0.05);
}

export function getResourceValue(resource: ResourceNode, amount: number): number {
    // Returns the effective value considering quality
    return amount * resource.quality;
}

export function attemptGatherResource(
    resource: ResourceNode,
    hasTool: boolean
): { success: boolean; damaged: boolean; amount: number } {
    // Check if tool is required
    if (resource.requiresTool && !hasTool) {
        return { success: false, damaged: false, amount: 0 };
    }

    // Check danger
    const damaged = Math.random() < resource.dangerLevel;

    // Gather amount (0.1-0.3 of capacity)
    const gatherAmount = Math.min(resource.capacity, 0.1 + Math.random() * 0.2);

    return {
        success: true,
        damaged,
        amount: gatherAmount
    };
}

export function getResourceDescription(resource: ResourceNode): string {
    const qualityDesc = resource.quality > 1.2 ? '高品質' : resource.quality < 0.8 ? '低品質' : '標準';
    const dangerDesc = resource.dangerLevel > 0.2 ? '危険' : resource.dangerLevel > 0 ? 'やや危険' : '安全';
    const regenDesc = resource.regenRate > 0.005 ? '再生' : resource.regenRate > 0 ? '低再生' : '非再生';

    return `${resource.name} (${qualityDesc}, ${dangerDesc}, ${regenDesc})`;
}
