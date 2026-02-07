// Needs/Desires System - Gives entities motivation to act

import type { EmotionState } from './emotions';

export type EntityKind = 'robot' | 'critter' | 'wild_animal';

export interface NeedsState {
    hunger: number;   // 0-1 (0 = starving, 1 = full)
    energy: number;   // 0-1 (0 = exhausted, 1 = fully charged)
    social: number;   // 0-1 (0 = lonely, 1 = satisfied)
    comfort: number;  // 0-1 (0 = miserable, 1 = comfortable)
}

export interface Desire {
    type: 'eat' | 'recharge' | 'socialize' | 'rest' | 'seek_shelter';
    urgency: number; // 0-1
}

export function createDefaultNeeds(kind: EntityKind): NeedsState {
    switch (kind) {
        case 'robot':
            return { hunger: 1.0, energy: 0.8, social: 0.6, comfort: 0.8 };
        case 'critter':
            return { hunger: 0.7, energy: 0.7, social: 0.5, comfort: 0.7 };
        case 'wild_animal':
            return { hunger: 0.6, energy: 0.7, social: 0.3, comfort: 0.6 };
    }
}

export function decayNeeds(needs: NeedsState, deltaSeconds: number, kind: EntityKind, isNight: boolean): NeedsState {
    const result = { ...needs };

    if (kind === 'critter') {
        result.hunger = Math.max(0, result.hunger - 0.008 * deltaSeconds);
        result.energy = Math.max(0, result.energy - (isNight ? 0.005 : 0.004) * deltaSeconds);
        result.social = Math.max(0, result.social - 0.003 * deltaSeconds);
        result.comfort = Math.max(0, result.comfort - 0.002 * deltaSeconds);
    } else if (kind === 'robot') {
        // Robots don't get hungry, but need energy
        result.energy = Math.max(0, result.energy - (isNight ? 0.008 : 0.005) * deltaSeconds);
        result.social = Math.max(0, result.social - 0.002 * deltaSeconds);
        result.comfort = Math.max(0, result.comfort - 0.001 * deltaSeconds);
    } else if (kind === 'wild_animal') {
        result.hunger = Math.max(0, result.hunger - 0.004 * deltaSeconds);
        result.energy = Math.max(0, result.energy - 0.002 * deltaSeconds);
    }

    return result;
}

export function satisfyNeed(needs: NeedsState, need: keyof NeedsState, amount: number): NeedsState {
    return {
        ...needs,
        [need]: Math.min(1, needs[need] + amount),
    };
}

export function computeDesires(needs: NeedsState, kind: EntityKind): Desire[] {
    const desires: Desire[] = [];

    if (kind !== 'robot') {
        // Hunger → eat
        const hungerUrgency = 1 - needs.hunger;
        if (hungerUrgency > 0.2) {
            desires.push({ type: 'eat', urgency: hungerUrgency });
        }
    }

    // Energy → recharge/rest
    const energyUrgency = 1 - needs.energy;
    if (energyUrgency > 0.2) {
        desires.push({
            type: kind === 'robot' ? 'recharge' : 'rest',
            urgency: energyUrgency,
        });
    }

    // Social
    if (kind !== 'wild_animal') {
        const socialUrgency = 1 - needs.social;
        if (socialUrgency > 0.5) {
            desires.push({ type: 'socialize', urgency: socialUrgency * 0.6 });
        }
    }

    // Sort by urgency descending
    desires.sort((a, b) => b.urgency - a.urgency);
    return desires;
}

export function needsToActivityBias(desires: Desire[]): { seekResource: boolean; preferRest: boolean; preferSocial: boolean; targetResourceType?: string } {
    const top = desires[0];
    if (!top) return { seekResource: false, preferRest: false, preferSocial: false };

    if (top.urgency > 0.4) {
        if (top.type === 'eat') return { seekResource: true, preferRest: false, preferSocial: false, targetResourceType: 'food' };
        if (top.type === 'recharge') return { seekResource: true, preferRest: false, preferSocial: false, targetResourceType: 'energy' };
        if (top.type === 'rest') return { seekResource: false, preferRest: true, preferSocial: false };
        if (top.type === 'socialize') return { seekResource: false, preferRest: false, preferSocial: true };
    }

    return { seekResource: false, preferRest: false, preferSocial: false };
}

export function needsToDialogueContext(needs: NeedsState, kind: EntityKind): string {
    const parts: string[] = [];

    if (kind !== 'robot') {
        if (needs.hunger < 0.2) {
            parts.push('すごくお腹空いた');
        } else if (needs.hunger < 0.5) {
            parts.push('ちょっとお腹空いてきた');
        }
    }
    if (needs.energy < 0.2) {
        parts.push(kind === 'robot' ? 'すぐ充電しないと' : 'すごく疲れた');
    } else if (needs.energy < 0.5) {
        parts.push(kind === 'robot' ? 'そろそろ充電したい' : 'ちょっと疲れてきた');
    }
    if (kind !== 'wild_animal') {
        if (needs.social < 0.2) {
            parts.push('すごく寂しい');
        } else if (needs.social < 0.5) {
            parts.push('誰かと話したいな');
        }
    }
    if (needs.comfort < 0.2) {
        parts.push('すごく居心地が悪い');
    } else if (needs.comfort < 0.5) {
        parts.push('ちょっと居心地悪い');
    }

    if (parts.length === 0) return '';
    return `体調: ${parts.join('、')}`;
}

export function needsToEmotionInfluence(needs: NeedsState, kind: EntityKind): Partial<EmotionState> {
    const influence: Partial<EmotionState> = {};

    if (kind !== 'robot' && needs.hunger < 0.25) {
        influence.happiness = -0.1;
        influence.anger = 0.05;
    }

    if (needs.energy < 0.2) {
        influence.energy = -0.1;
        influence.happiness = (influence.happiness || 0) - 0.05;
    }

    return influence;
}
