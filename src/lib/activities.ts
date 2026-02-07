// Activity System - replaces simple IDLE/MOVING with context-aware behaviors

import type { EmotionState } from './emotions';
import { getAffinity, shouldApproach, type RelationshipMap } from './relationships';

import type { Desire } from './needs';

export type Activity = 'idle' | 'explore' | 'forage' | 'rest' | 'socialize' | 'flee' | 'patrol' | 'seek_resource';

export interface ActivityState {
    current: Activity;
    startedAt: number;
    duration: number; // target duration in seconds
    targetEntityId?: string; // for socialize/flee
    targetResourceId?: string; // for seek_resource
}

export interface MovementPattern {
    wanderRadius: number;
    speedMultiplier: number;
    pauseChance: number;  // chance per decision cycle to pause
    homeAffinity: number; // 0 = ignore home, 1 = stay near home
}

const ACTIVITY_PATTERNS: Record<Activity, MovementPattern> = {
    idle:          { wanderRadius: 15, speedMultiplier: 0.5,  pauseChance: 0.6,  homeAffinity: 0.3 },
    explore:       { wanderRadius: 70, speedMultiplier: 1.2,  pauseChance: 0.1,  homeAffinity: 0.05 },
    forage:        { wanderRadius: 40, speedMultiplier: 0.8,  pauseChance: 0.25, homeAffinity: 0.3 },
    rest:          { wanderRadius: 0,  speedMultiplier: 0.0,  pauseChance: 1.0,  homeAffinity: 1.0 },
    socialize:     { wanderRadius: 12, speedMultiplier: 1.0,  pauseChance: 0.2,  homeAffinity: 0.1 },
    flee:          { wanderRadius: 0,  speedMultiplier: 1.8,  pauseChance: 0.0,  homeAffinity: 0.9 },
    patrol:        { wanderRadius: 35, speedMultiplier: 0.9,  pauseChance: 0.15, homeAffinity: 0.4 },
    seek_resource: { wanderRadius: 50, speedMultiplier: 1.1,  pauseChance: 0.05, homeAffinity: 0.0 },
};

export function getActivityMovementPattern(activity: Activity): MovementPattern {
    return ACTIVITY_PATTERNS[activity];
}

// Default durations per activity (in seconds)
const ACTIVITY_DURATIONS: Record<Activity, [number, number]> = {
    idle:          [3, 8],
    explore:       [10, 25],
    forage:        [8, 20],
    rest:          [15, 40],
    socialize:     [8, 15],
    flee:          [5, 10],
    patrol:        [10, 20],
    seek_resource: [10, 30],
};

function randomDuration(activity: Activity): number {
    const [min, max] = ACTIVITY_DURATIONS[activity];
    return min + Math.random() * (max - min);
}

export function selectNextActivity(
    emotion: EmotionState,
    time: number,
    weather: string,
    relationships: RelationshipMap,
    entityId: string,
    nearbyEntities: { id: string; distance: number }[],
    desires?: Desire[]
): ActivityState {
    const now = Date.now() / 1000;
    const isNight = time < 5 || time > 21;
    const isRaining = weather === 'rainy';

    // Desires override: urgent needs take priority
    if (desires && desires.length > 0) {
        const top = desires[0];
        if (top.urgency > 0.4) {
            if (top.type === 'eat' || top.type === 'recharge') {
                return { current: 'seek_resource', startedAt: now, duration: randomDuration('seek_resource') };
            }
            if (top.type === 'rest') {
                return { current: 'rest', startedAt: now, duration: randomDuration('rest') };
            }
        }
    }

    // Night + low energy → rest (high probability)
    if (isNight && emotion.energy < 0.4) {
        if (Math.random() < 0.85) {
            return { current: 'rest', startedAt: now, duration: randomDuration('rest') };
        }
    }

    // Rain + high fear → flee toward home
    if (isRaining && emotion.fear > 0.3) {
        if (Math.random() < 0.5) {
            return { current: 'flee', startedAt: now, duration: randomDuration('flee') };
        }
    }

    // Check for nearby friends to socialize with
    const friends = nearbyEntities.filter(e => {
        const aff = getAffinity(relationships, entityId, e.id);
        return shouldApproach(aff) && e.distance < 15;
    });
    if (friends.length > 0 && emotion.happiness > 0.3 && emotion.energy > 0.3) {
        if (Math.random() < 0.4) {
            return {
                current: 'socialize',
                startedAt: now,
                duration: randomDuration('socialize'),
                targetEntityId: friends[0].id,
            };
        }
    }

    // Explore is common — curiosity or just feeling energetic
    if (!isNight && emotion.energy > 0.3) {
        const exploreChance = emotion.curiosity > 0.4 ? 0.45 : 0.25;
        if (Math.random() < exploreChance) {
            return { current: 'explore', startedAt: now, duration: randomDuration('explore') };
        }
    }

    // Territorial + angry → patrol
    if (emotion.anger > 0.25 && emotion.energy > 0.3) {
        if (Math.random() < 0.25) {
            return { current: 'patrol', startedAt: now, duration: randomDuration('patrol') };
        }
    }

    // Low energy → rest
    if (emotion.energy < 0.25) {
        if (Math.random() < 0.6) {
            return { current: 'rest', startedAt: now, duration: randomDuration('rest') };
        }
    }

    // Default: forage, explore, or idle (spread out)
    const roll = Math.random();
    if (roll < 0.4) {
        return { current: 'forage', startedAt: now, duration: randomDuration('forage') };
    } else if (roll < 0.65) {
        return { current: 'explore', startedAt: now, duration: randomDuration('explore') };
    }

    return { current: 'idle', startedAt: now, duration: randomDuration('idle') };
}

// Check if it's time to switch activities
export function shouldSwitchActivity(activity: ActivityState | undefined): boolean {
    if (!activity) return true;
    const elapsed = Date.now() / 1000 - activity.startedAt;
    return elapsed >= activity.duration;
}
