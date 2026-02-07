import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';

// Seeded random (same as Vegetation.tsx)
function seededRandom(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
    };
}

// Crater positions to avoid (same as Vegetation.tsx)
const CRATERS = [
    { x: 10, z: 15, r: 10 },
    { x: -20, z: -10, r: 14 },
    { x: 30, z: -30, r: 17 },
    { x: -40, z: 40, r: 22 },
    { x: 5, z: -5, r: 6 },
];

function avoidsCraters(x: number, z: number): boolean {
    return !CRATERS.some(c => Math.sqrt((x - c.x) ** 2 + (z - c.z) ** 2) < c.r);
}

// ============================================================
// 発光キノコ（GlowingMushrooms）
// ============================================================
interface MushroomData {
    position: [number, number, number];
    scale: number;
    capColor: string;
    emissiveColor: string;
}

interface ClusterData {
    mushrooms: MushroomData[];
    clusterPos: [number, number, number];
}

export const GlowingMushrooms = () => {
    const groupRef = useRef<THREE.Group>(null!);

    const clusters = useMemo(() => {
        const rand = seededRandom(77777);
        const result: ClusterData[] = [];

        // 14 clusters including distant ones
        const clusterCenters = [
            { x: -8, z: 12 }, { x: 15, z: -8 }, { x: -18, z: -15 },
            { x: 25, z: 20 }, { x: -30, z: 5 }, { x: 12, z: -20 },
            { x: -5, z: 25 }, { x: 35, z: 10 }, { x: -25, z: -25 },
            { x: 8, z: -35 }, { x: -50, z: 30 }, { x: 45, z: -40 },
            { x: -40, z: -45 }, { x: 55, z: 25 },
        ];

        const emissiveColors = ['#4488ff', '#8844ff', '#44ffaa', '#ff44aa', '#44aaff'];

        for (const center of clusterCenters) {
            // Adjust position to avoid craters
            let cx = center.x + (rand() - 0.5) * 4;
            let cz = center.z + (rand() - 0.5) * 4;
            for (let attempt = 0; attempt < 10; attempt++) {
                if (avoidsCraters(cx, cz)) break;
                cx = center.x + (rand() - 0.5) * 8;
                cz = center.z + (rand() - 0.5) * 8;
            }

            const mushroomCount = 3 + Math.floor(rand() * 3); // 3-5 per cluster
            const mushrooms: MushroomData[] = [];
            const emissive = emissiveColors[Math.floor(rand() * emissiveColors.length)];

            for (let j = 0; j < mushroomCount; j++) {
                const ox = (rand() - 0.5) * 1.5;
                const oz = (rand() - 0.5) * 1.5;
                const s = 0.3 + rand() * 0.5;
                mushrooms.push({
                    position: [ox, 0, oz],
                    scale: s,
                    capColor: `hsl(${260 + rand() * 40}, 60%, ${40 + rand() * 20}%)`,
                    emissiveColor: emissive,
                });
            }

            result.push({ mushrooms, clusterPos: [cx, 0, cz] });
        }
        return result;
    }, []);

    // Animate emissive intensity based on time of day
    useFrame(() => {
        if (!groupRef.current) return;
        const time = useStore.getState().time;
        const isNight = time >= 18 || time < 6;
        // Smooth transition: ramp up at dusk (17-19), ramp down at dawn (5-7)
        let intensity = 0;
        if (isNight) {
            intensity = 1.0;
        } else if (time >= 17 && time < 18) {
            intensity = (time - 17); // 0→1
        } else if (time >= 6 && time < 7) {
            intensity = (7 - time); // 1→0
        }

        // Update all mushroom cap materials
        groupRef.current.traverse((child) => {
            if ((child as THREE.Mesh).isMesh && child.userData.isCap) {
                const mat = (child as THREE.Mesh).material as THREE.MeshStandardMaterial;
                mat.emissiveIntensity = intensity * 1.5;
            }
        });
    });

    return (
        <group ref={groupRef}>
            {clusters.map((cluster, ci) => (
                <group key={ci} position={cluster.clusterPos}>
                    {/* One PointLight per cluster (only visible at night) */}
                    <pointLight
                        color={cluster.mushrooms[0].emissiveColor}
                        intensity={0}
                        distance={6}
                        position={[0, 0.5, 0]}
                        ref={(light) => {
                            if (light) {
                                // Store ref so useFrame can update intensity
                                light.userData.isMushroomLight = true;
                                const update = () => {
                                    const time = useStore.getState().time;
                                    const isNight = time >= 18 || time < 6;
                                    let intensity = 0;
                                    if (isNight) intensity = 1.5;
                                    else if (time >= 17 && time < 18) intensity = (time - 17) * 1.5;
                                    else if (time >= 6 && time < 7) intensity = (7 - time) * 1.5;
                                    light.intensity = intensity;
                                    requestAnimationFrame(update);
                                };
                                update();
                            }
                        }}
                    />

                    {cluster.mushrooms.map((m, mi) => (
                        <group key={mi} position={m.position} scale={m.scale}>
                            {/* Stem */}
                            <mesh position={[0, 0.15, 0]} castShadow>
                                <cylinderGeometry args={[0.04, 0.06, 0.3, 6]} />
                                <meshStandardMaterial color="#d4c8a0" roughness={0.8} />
                            </mesh>
                            {/* Cap */}
                            <mesh position={[0, 0.35, 0]} castShadow userData={{ isCap: true }}>
                                <sphereGeometry args={[0.15, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
                                <meshStandardMaterial
                                    color={m.capColor}
                                    emissive={m.emissiveColor}
                                    emissiveIntensity={0}
                                    roughness={0.3}
                                    metalness={0.2}
                                />
                            </mesh>
                        </group>
                    ))}
                </group>
            ))}
        </group>
    );
};

// ============================================================
// 異星の花（AlienFlowers）
// ============================================================
export const AlienFlowers = () => {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const count = 40;

    const { matrices, colors, baseScales, positions: flowerPositions } = useMemo(() => {
        const rand = seededRandom(99999);
        const mats: THREE.Matrix4[] = [];
        const cols: THREE.Color[] = [];
        const scales: number[] = [];
        const pos: { x: number; z: number }[] = [];
        const mat = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();

        const flowerColors = [
            new THREE.Color('#ff69b4'), // pink
            new THREE.Color('#9b59b6'), // purple
            new THREE.Color('#ff8c00'), // orange
            new THREE.Color('#00ced1'), // cyan
        ];

        for (let i = 0; i < count; i++) {
            let x: number, z: number;
            let attempts = 0;
            do {
                const angle = rand() * Math.PI * 2;
                const radius = 4 + rand() * 76;
                x = Math.cos(angle) * radius;
                z = Math.sin(angle) * radius;
                attempts++;
            } while (attempts < 15 && !avoidsCraters(x, z));

            const sc = 0.5 + rand() * 0.8;
            p.set(x, 0, z);
            q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
            s.set(sc, sc, sc);
            mat.compose(p, q, s);
            mats.push(mat.clone());
            cols.push(flowerColors[Math.floor(rand() * flowerColors.length)]);
            scales.push(sc);
            pos.push({ x, z });
        }
        return { matrices: mats, colors: cols, baseScales: scales, positions: pos };
    }, []);

    // Set initial instance data
    useMemo(() => {
        if (meshRef.current) {
            matrices.forEach((m, i) => {
                meshRef.current.setMatrixAt(i, m);
                meshRef.current.setColorAt(i, colors[i]);
            });
            meshRef.current.instanceMatrix.needsUpdate = true;
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
    }, [matrices, colors]);

    // Time-based open/close animation
    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        const time = useStore.getState().time;

        // Flowers close at night (scale Y down), open during day
        const isDay = time >= 7 && time < 17;
        const targetOpenness = isDay ? 1.0 : 0.3;

        const mat = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const q = new THREE.Quaternion();
        const s = new THREE.Vector3();

        for (let i = 0; i < count; i++) {
            matrices[i].decompose(p, q, s);

            // Each flower has slight phase offset for organic feel
            const phase = flowerPositions[i].x * 0.1 + flowerPositions[i].z * 0.1;
            const breathe = 1.0 + Math.sin(t * 0.8 + phase) * 0.05;

            // Smooth transition toward target openness
            const openness = targetOpenness + Math.sin(t * 0.3 + i) * 0.05;

            const sc = baseScales[i];
            s.set(sc * breathe, sc * openness * breathe, sc * breathe);
            mat.compose(p, q, s);
            meshRef.current.setMatrixAt(i, mat);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]} castShadow>
            <group>
                {/* Combined geometry: stem + flower head */}
            </group>
            {/* Use a cone as flower shape — petals implied */}
            <coneGeometry args={[0.2, 0.6, 6]} />
            <meshStandardMaterial
                roughness={0.4}
                metalness={0.1}
                emissive="#553366"
                emissiveIntensity={0.1}
            />
        </instancedMesh>
    );
};
