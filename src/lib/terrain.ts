import { fbm, smoothstep } from './noise';

const CRATERS = [
    { x: 10, y: 15, r: 8, d: 2 },
    { x: -20, y: -10, r: 12, d: 3 },
    { x: 30, y: -30, r: 15, d: 4 },
    { x: -40, y: 40, r: 20, d: 5 },
    { x: 5, y: -5, r: 4, d: 1 }
];

export function getTerrainHeight(px: number, pz: number): number {
    // Multi-octave FBM noise terrain
    let h = fbm(px * 0.02, pz * 0.02, 6, 2.0, 0.5) * 8;   // Large hills
    h += fbm(px * 0.1, pz * 0.1, 3, 2.0, 0.5) * 1.5;       // Medium detail
    h += fbm(px * 0.5, pz * 0.5, 2, 2.0, 0.5) * 0.3;       // Fine detail

    // Flatten center gameplay area
    const distFromCenter = Math.sqrt(px * px + pz * pz);
    if (distFromCenter < 20) {
        h *= smoothstep(8, 20, distFromCenter);
    }

    // Craters
    for (const c of CRATERS) {
        const dist = Math.sqrt((px - c.x) ** 2 + (pz - c.y) ** 2);
        if (dist < c.r) {
            const normalizedDist = dist / c.r;
            const craterH = Math.sin(normalizedDist * Math.PI) * c.d * -1;
            const rim = Math.exp(-Math.pow(normalizedDist - 0.9, 2) * 50) * (c.d * 0.5);
            h += craterH + rim;
        }
    }

    return h;
}
