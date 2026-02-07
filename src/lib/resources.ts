// Resource Nodes - Points in the world where entities can satisfy needs

export type ResourceType = 'mineral_ore' | 'glowing_mushroom' | 'energy_node' | 'water' | 'vegetation';

export interface ResourceNode {
    id: string;
    type: ResourceType;
    name: string;
    position: { x: number; y: number; z: number };
    radius: number;
    capacity: number;    // 0-1, current available amount
    regenRate: number;   // per second regeneration
    maxCapacity: number; // always 1.0
}

export function createInitialResources(): ResourceNode[] {
    return [
        // Mineral ore (critter food) - 3 locations around the map edges
        { id: 'ore-1', type: 'mineral_ore', name: '鉱石', position: { x: -25, y: 0.3, z: 15 }, radius: 3, capacity: 1.0, regenRate: 0.005, maxCapacity: 1.0 },
        { id: 'ore-2', type: 'mineral_ore', name: '鉱石', position: { x: 20, y: 0.3, z: -20 }, radius: 3, capacity: 1.0, regenRate: 0.005, maxCapacity: 1.0 },
        { id: 'ore-3', type: 'mineral_ore', name: '鉱石', position: { x: 30, y: 0.3, z: 10 }, radius: 3, capacity: 1.0, regenRate: 0.005, maxCapacity: 1.0 },

        // Energy nodes (robot charging) - near landmarks
        { id: 'energy-1', type: 'energy_node', name: 'エネルギーノード', position: { x: 8, y: 0.5, z: -8 }, radius: 2.5, capacity: 1.0, regenRate: 0.008, maxCapacity: 1.0 },
        { id: 'energy-2', type: 'energy_node', name: 'エネルギーノード', position: { x: -5, y: 0.5, z: -5 }, radius: 2.5, capacity: 1.0, regenRate: 0.008, maxCapacity: 1.0 },

        // Glowing mushrooms as food source (reusing existing positions)
        { id: 'mushroom-food-1', type: 'glowing_mushroom', name: '光るキノコ', position: { x: -8, y: 0, z: 12 }, radius: 3, capacity: 1.0, regenRate: 0.004, maxCapacity: 1.0 },
        { id: 'mushroom-food-2', type: 'glowing_mushroom', name: '光るキノコ', position: { x: 15, y: 0, z: -8 }, radius: 3, capacity: 1.0, regenRate: 0.004, maxCapacity: 1.0 },

        // Vegetation patches (wild animal food)
        { id: 'veg-1', type: 'vegetation', name: '草地', position: { x: 12, y: 0, z: 8 }, radius: 4, capacity: 1.0, regenRate: 0.006, maxCapacity: 1.0 },
        { id: 'veg-2', type: 'vegetation', name: '草地', position: { x: -15, y: 0, z: -12 }, radius: 4, capacity: 1.0, regenRate: 0.006, maxCapacity: 1.0 },
        { id: 'veg-3', type: 'vegetation', name: '草地', position: { x: -10, y: 0, z: 20 }, radius: 4, capacity: 1.0, regenRate: 0.006, maxCapacity: 1.0 },
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
