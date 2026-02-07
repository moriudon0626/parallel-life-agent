import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { RigidBody } from '@react-three/rapier';
import { getBiomeParamsAt } from '../lib/biomes';
import { getTerrainHeight } from '../lib/terrain';
import { useStore } from '../store';

// Seeded random for consistent placement
function seededRandom(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
    };
}

// Grass patches using instanced mesh
export const GrassPatches = () => {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const count = 800;

    const matrices = useMemo(() => {
        const rand = seededRandom(12345);
        const arr: THREE.Matrix4[] = [];
        const mat = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        let placed = 0;
        let attempts = 0;
        while (placed < count && attempts < count * 3) {
            attempts++;
            // Place in ring around center (r=3 to r=85)
            const angle = rand() * Math.PI * 2;
            const radius = 3 + rand() * 82;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            // Biome density filter
            const biome = getBiomeParamsAt(x, z);
            if (rand() > biome.grassDensity) continue;

            pos.set(x, getTerrainHeight(x, z), z);
            quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
            const s = 0.3 + rand() * 0.5;
            scale.set(s * 0.3, s, s * 0.3);

            mat.compose(pos, quat, scale);
            arr.push(mat.clone());
            placed++;
        }
        return arr;
    }, []);

    // Cache base transforms to avoid decompose every frame
    const baseTransforms = useMemo(() => {
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        return matrices.map(m => {
            m.decompose(pos, quat, scale);
            return { pos: pos.clone(), quat: quat.clone(), scale: scale.clone() };
        });
    }, [matrices]);

    // Update instance matrices once
    useMemo(() => {
        if (meshRef.current) {
            matrices.forEach((m, i) => {
                meshRef.current.setMatrixAt(i, m);
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
        }
    }, [matrices]);

    // Gentle wind sway with natural variation
    const windAxis = useMemo(() => new THREE.Vector3(1, 0, 0.5).normalize(), []);
    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        const mat = new THREE.Matrix4();
        const windQuat = new THREE.Quaternion();

        for (let i = 0; i < count; i++) {
            const base = baseTransforms[i];
            // Primary sway: slow, gentle
            const windAngle = Math.sin(t * 0.4 + base.pos.x * 0.1 + base.pos.z * 0.08) * 0.06;
            // Secondary harmonic: adds natural irregularity
            const windAngle2 = Math.sin(t * 0.7 + base.pos.x * 0.15 + base.pos.z * 0.12) * 0.03;
            windQuat.setFromAxisAngle(windAxis, windAngle + windAngle2);
            const finalQuat = base.quat.clone().multiply(windQuat);
            mat.compose(base.pos, finalQuat, base.scale);
            meshRef.current.setMatrixAt(i, mat);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
            <coneGeometry args={[0.15, 1.0, 4]} />
            <meshStandardMaterial color="#4a7a3a" roughness={0.8} metalness={0.0} side={THREE.DoubleSide} />
        </instancedMesh>
    );
};

// Simple trees
export const Trees = () => {
    const season = useStore(s => s.season);

    const trees = useMemo(() => {
        const rand = seededRandom(54321);
        const result: { x: number; z: number; trunkH: number; canopyR: number; canopyType: 'sphere' | 'cone'; hueShift: number }[] = [];

        // Crater positions to avoid
        const craters = [
            { x: 10, y: 15, r: 10 },
            { x: -20, y: -10, r: 14 },
            { x: 30, y: -30, r: 17 },
            { x: -40, y: 40, r: 22 },
            { x: 5, y: -5, r: 6 }
        ];

        let placed = 0;
        let totalAttempts = 0;
        while (placed < 35 && totalAttempts < 200) {
            totalAttempts++;
            let x: number, z: number;
            let attempts = 0;
            do {
                const angle = rand() * Math.PI * 2;
                const radius = 8 + rand() * 75;
                x = Math.cos(angle) * radius;
                z = Math.sin(angle) * radius;
                attempts++;
            } while (
                attempts < 20 &&
                craters.some(c => Math.sqrt((x - c.x) ** 2 + (z - c.y) ** 2) < c.r)
            );

            // Biome density filter for trees
            const biome = getBiomeParamsAt(x, z);
            if (rand() > biome.treeDensity) continue;

            result.push({
                x, z,
                trunkH: 1.5 + rand() * 2.0,
                canopyR: 0.8 + rand() * 1.2,
                canopyType: rand() > 0.5 ? 'sphere' : 'cone',
                hueShift: biome.hueShift,
            });
            placed++;
        }
        return result;
    }, []);

    return (
        <>
            {trees.map((tree, i) => (
                <RigidBody key={i} type="fixed" position={[tree.x, getTerrainHeight(tree.x, tree.z), tree.z]}>
                    <group>
                        {/* Trunk */}
                        <mesh position={[0, tree.trunkH / 2, 0]} castShadow>
                            <cylinderGeometry args={[0.12, 0.18, tree.trunkH, 6]} />
                            <meshStandardMaterial color="#5a3a1a" roughness={0.9} metalness={0.0} />
                        </mesh>
                        {/* Canopy */}
                        <mesh position={[0, tree.trunkH + tree.canopyR * 0.5, 0]} castShadow>
                            {tree.canopyType === 'sphere'
                                ? <icosahedronGeometry args={[tree.canopyR, 1]} />
                                : <coneGeometry args={[tree.canopyR, tree.canopyR * 2, 6]} />
                            }
                            <meshStandardMaterial
                                color={(() => {
                                    const baseVariation = Math.sin(i) * 20;
                                    const lightVariation = Math.sin(i * 2) * 8;
                                    switch (season) {
                                        case 'spring':
                                            return `hsl(${110 + baseVariation + tree.hueShift}, 50%, ${33 + lightVariation}%)`;
                                        case 'summer':
                                            return `hsl(${120 + baseVariation + tree.hueShift}, 45%, ${25 + lightVariation}%)`;
                                        case 'autumn':
                                            return `hsl(${30 + Math.abs(baseVariation) + tree.hueShift}, 55%, ${35 + lightVariation}%)`;
                                        case 'winter':
                                            return `hsl(${30 + tree.hueShift}, 15%, ${40 + lightVariation}%)`;
                                        default:
                                            return `hsl(${110 + baseVariation + tree.hueShift}, 45%, ${28 + lightVariation}%)`;
                                    }
                                })()}
                                roughness={0.75}
                                metalness={0.0}
                                transparent={season === 'winter'}
                                opacity={season === 'winter' ? 0.3 + Math.abs(Math.sin(i * 3)) * 0.5 : 1}
                            />
                        </mesh>
                    </group>
                </RigidBody>
            ))}
        </>
    );
};
