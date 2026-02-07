// Biome System - Maps world coordinates to biome types using noise

import { noise2D } from './noise';

export type BiomeType = 'plains' | 'crystal_forest' | 'mushroom_grove' | 'rocky_desert' | 'wetlands';

export interface BiomeParams {
    grassDensity: number;   // 0-2 multiplier
    treeDensity: number;    // 0-2 multiplier
    hueShift: number;       // degrees to shift base color hue
    groundTint: [number, number, number]; // RGB tint to blend with terrain
}

const BIOME_PARAMS: Record<BiomeType, BiomeParams> = {
    plains: {
        grassDensity: 1.2,
        treeDensity: 0.8,
        hueShift: 0,
        groundTint: [0.38, 0.50, 0.30],
    },
    crystal_forest: {
        grassDensity: 0.6,
        treeDensity: 1.8,
        hueShift: 30,
        groundTint: [0.35, 0.42, 0.50],
    },
    mushroom_grove: {
        grassDensity: 1.0,
        treeDensity: 0.5,
        hueShift: -20,
        groundTint: [0.40, 0.35, 0.45],
    },
    rocky_desert: {
        grassDensity: 0.3,
        treeDensity: 0.2,
        hueShift: 15,
        groundTint: [0.50, 0.45, 0.35],
    },
    wetlands: {
        grassDensity: 1.5,
        treeDensity: 0.6,
        hueShift: -10,
        groundTint: [0.30, 0.45, 0.38],
    },
};

const BIOME_TYPES: BiomeType[] = ['plains', 'crystal_forest', 'mushroom_grove', 'rocky_desert', 'wetlands'];

export function getBiomeAt(x: number, z: number): BiomeType {
    // Use noise at a large scale to create biome regions
    const n = noise2D(x * 0.015, z * 0.015);
    // Map noise range [-1, 1] to biome index [0, 4]
    const normalized = (n + 1) * 0.5; // 0-1
    const index = Math.min(4, Math.floor(normalized * 5));
    return BIOME_TYPES[index];
}

export function getBiomeParams(biome: BiomeType): BiomeParams {
    return BIOME_PARAMS[biome];
}

export function getBiomeParamsAt(x: number, z: number): BiomeParams {
    return BIOME_PARAMS[getBiomeAt(x, z)];
}
