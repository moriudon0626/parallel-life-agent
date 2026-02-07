// Wild Animals - Non-conversational environment creatures

export type WildAnimalSpecies = 'deer' | 'bird' | 'rabbit' | 'wolf';

export interface WildAnimalDef {
    species: WildAnimalSpecies;
    name: string;
    fleeDistance: number;
    wanderRadius: number;
    speed: number;
    scale: number;
    color: string;
    flightHeight?: [number, number]; // for birds: min/max y
    aggressive?: boolean;
    chaseDistance?: number;
    attackRange?: number;
    attackDamage?: number;
}

export const WILD_ANIMAL_DEFS: Record<WildAnimalSpecies, WildAnimalDef> = {
    deer: {
        species: 'deer',
        name: '鹿',
        fleeDistance: 10,
        wanderRadius: 20,
        speed: 2.5,
        scale: 0.6,
        color: '#8B6914',
    },
    bird: {
        species: 'bird',
        name: '鳥',
        fleeDistance: 8,
        wanderRadius: 30,
        speed: 3.0,
        scale: 0.3,
        color: '#708090',
        flightHeight: [3, 8],
    },
    rabbit: {
        species: 'rabbit',
        name: 'うさぎ',
        fleeDistance: 7,
        wanderRadius: 12,
        speed: 3.5,
        scale: 0.25,
        color: '#D2B48C',
    },
    wolf: {
        species: 'wolf',
        name: '狼',
        fleeDistance: 0, // wolves don't flee
        wanderRadius: 25,
        speed: 3.0,
        scale: 0.5,
        color: '#6B6B6B',
        aggressive: true,
        chaseDistance: 20,
        attackRange: 2.0,
        attackDamage: 0.15,
    },
};
