// Lifecycle System - Birth, Sickness, Death

import type { NeedsState } from './needs';

export type HealthStatus = 'healthy' | 'sick' | 'dying' | 'dead';

export interface LifecycleState {
    age: number;             // in game-time minutes (real seconds)
    maxAge: number;          // 60-120 game-time minutes
    health: number;          // 0-1
    healthStatus: HealthStatus;
    sicknessDuration: number; // remaining sickness time in seconds
    reproductionCooldown: number; // seconds until can reproduce again
    generation: number;
}

export function createLifecycleState(generation: number = 0): LifecycleState {
    return {
        age: 0,
        maxAge: 60 + Math.random() * 60, // 60-120 game minutes
        health: 1.0,
        healthStatus: 'healthy',
        sicknessDuration: 0,
        reproductionCooldown: 15, // 15s initial cooldown
        generation,
    };
}

export function tickLifecycle(
    state: LifecycleState,
    deltaSeconds: number,
    needs: NeedsState
): LifecycleState {
    const result = { ...state };

    // Age (1 real second = 1 game minute)
    result.age += deltaSeconds;

    // Reproduction cooldown
    if (result.reproductionCooldown > 0) {
        result.reproductionCooldown = Math.max(0, result.reproductionCooldown - deltaSeconds);
    }

    // Sickness progression
    if (result.healthStatus === 'sick') {
        result.sicknessDuration -= deltaSeconds;
        result.health -= 0.002 * deltaSeconds; // slow health drain while sick

        // Eating helps recovery
        if (needs.hunger > 0.6) {
            result.health += 0.003 * deltaSeconds;
        }

        if (result.sicknessDuration <= 0) {
            // Recovered
            result.healthStatus = 'healthy';
            result.sicknessDuration = 0;
            result.health = Math.min(1, result.health + 0.2);
        }
    }

    // Check for sickness onset
    if (result.healthStatus === 'healthy') {
        const sickChance = checkSickness(needs);
        if (sickChance) {
            result.healthStatus = 'sick';
            result.sicknessDuration = 120 + Math.random() * 180; // 2-5 game minutes (real seconds)
            result.health = Math.max(0.3, result.health - 0.15);
        }
    }

    // Check death conditions
    if (result.health <= 0 || result.age >= result.maxAge) {
        result.healthStatus = 'dead';
        result.health = 0;
    } else if (result.health < 0.2 && result.healthStatus !== 'dead') {
        result.healthStatus = 'dying';
    }

    result.health = Math.max(0, Math.min(1, result.health));

    return result;
}

function checkSickness(needs: NeedsState): boolean {
    // Higher chance if very hungry
    if (needs.hunger < 0.15) {
        return Math.random() < 0.002; // ~0.2% per tick when starving
    }
    // Small random chance
    return Math.random() < 0.0001; // ~0.01% per tick normally
}

export function checkReproduction(
    state: LifecycleState,
    needs: NeedsState,
    aliveCount?: number
): boolean {
    if (state.reproductionCooldown > 0) return false;
    if (state.age < 15) return false; // must be at least 15 game minutes old

    // Emergency reproduction when population is critically low
    const isEmergency = aliveCount !== undefined && aliveCount <= 2;

    if (isEmergency) {
        // Relaxed conditions: even sick critters can reproduce
        if (state.healthStatus === 'dead' || state.healthStatus === 'dying') return false;
        if (needs.hunger < 0.2 || needs.energy < 0.2) return false;
        return Math.random() < 0.003; // 0.3% per tick
    }

    // Normal reproduction
    if (state.healthStatus !== 'healthy') return false;
    if (needs.hunger < 0.4 || needs.energy < 0.35) return false;
    return Math.random() < 0.001; // 0.1% per tick
}

export function mutateColor(parentColor: string): string {
    const r = parseInt(parentColor.slice(1, 3), 16);
    const g = parseInt(parentColor.slice(3, 5), 16);
    const b = parseInt(parentColor.slice(5, 7), 16);

    const mutate = (v: number) => Math.max(0, Math.min(255, v + Math.floor((Math.random() - 0.5) * 60)));

    const nr = mutate(r);
    const ng = mutate(g);
    const nb = mutate(b);

    return `#${nr.toString(16).padStart(2, '0')}${ng.toString(16).padStart(2, '0')}${nb.toString(16).padStart(2, '0')}`;
}

export function sicknessToDialogueContext(state: LifecycleState): string {
    if (state.healthStatus === 'sick') return '具合が悪い...';
    if (state.healthStatus === 'dying') return 'とても体調が悪い...';
    return '';
}

export function getSpeedMultiplier(state: LifecycleState): number {
    if (state.healthStatus === 'sick') return 0.3;
    if (state.healthStatus === 'dying') return 0.15;
    // Slight slowdown with age
    const ageFactor = 1 - (state.age / state.maxAge) * 0.2;
    return ageFactor;
}
