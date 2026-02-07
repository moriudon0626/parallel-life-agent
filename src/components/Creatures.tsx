import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';

// Seeded random
function seededRandom(seed: number) {
    let s = seed;
    return () => {
        s = (s * 16807 + 0) % 2147483647;
        return s / 2147483647;
    };
}

// ============================================================
// 蝶（Butterflies）- 6匹、花や植物の近くを飛行
// ============================================================
const BUTTERFLY_COUNT = 6;

export const Butterflies = () => {
    const meshRef = useRef<THREE.InstancedMesh>(null!);

    // Generate initial positions and flight parameters
    const params = useMemo(() => {
        const rand = seededRandom(11111);
        return Array.from({ length: BUTTERFLY_COUNT }, () => ({
            // Center of flight area (near flowers/plants)
            cx: (rand() - 0.5) * 30,
            cz: (rand() - 0.5) * 30,
            cy: 1.0 + rand() * 2.0,
            // Flight parameters
            radiusX: 1.5 + rand() * 3,
            radiusZ: 1.5 + rand() * 3,
            speed: 0.5 + rand() * 1.0,
            phase: rand() * Math.PI * 2,
            yAmplitude: 0.3 + rand() * 0.5,
            ySpeed: 1.0 + rand() * 1.5,
            // Color
            color: new THREE.Color().setHSL(rand(), 0.8, 0.6),
        }));
    }, []);

    // Set initial colors
    useMemo(() => {
        if (meshRef.current) {
            params.forEach((p, i) => {
                meshRef.current.setColorAt(i, p.color);
            });
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
    }, [params]);

    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        const time = useStore.getState().time;

        // Butterflies only during day (6-18)
        const isDay = time >= 6 && time < 18;
        const mat = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        for (let i = 0; i < BUTTERFLY_COUNT; i++) {
            const p = params[i];
            const st = t * p.speed + p.phase;

            if (!isDay) {
                // Hide at night by scaling to 0
                scale.set(0, 0, 0);
                mat.compose(new THREE.Vector3(0, -10, 0), quat, scale);
            } else {
                // Figure-8 like flight path
                const x = p.cx + Math.sin(st) * p.radiusX;
                const z = p.cz + Math.cos(st * 0.7) * p.radiusZ;
                const y = p.cy + Math.sin(st * p.ySpeed) * p.yAmplitude;
                pos.set(x, y, z);

                // Wing flap rotation
                const wingAngle = Math.sin(t * 12 + i * 2) * 0.6;
                quat.setFromEuler(new THREE.Euler(wingAngle, st, 0));
                scale.set(0.15, 0.15, 0.15);
                mat.compose(pos, quat, scale);
            }
            meshRef.current.setMatrixAt(i, mat);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, BUTTERFLY_COUNT]} castShadow={false}>
            {/* Two small triangles for wings */}
            <planeGeometry args={[1, 0.6]} />
            <meshStandardMaterial
                side={THREE.DoubleSide}
                roughness={0.5}
                metalness={0.1}
                transparent
                opacity={0.9}
            />
        </instancedMesh>
    );
};

// ============================================================
// 蛍（Fireflies）- 20匹、夜間のみ表示
// ============================================================
const FIREFLY_COUNT = 20;

export const Fireflies = () => {
    const meshRef = useRef<THREE.InstancedMesh>(null!);
    const light1Ref = useRef<THREE.PointLight>(null!);
    const light2Ref = useRef<THREE.PointLight>(null!);
    const light3Ref = useRef<THREE.PointLight>(null!);

    const params = useMemo(() => {
        const rand = seededRandom(22222);
        return Array.from({ length: FIREFLY_COUNT }, () => ({
            cx: (rand() - 0.5) * 40,
            cz: (rand() - 0.5) * 40,
            cy: 0.5 + rand() * 2.5,
            driftRadius: 1.0 + rand() * 3.0,
            speed: 0.2 + rand() * 0.5,
            phase: rand() * Math.PI * 2,
            blinkSpeed: 1.0 + rand() * 2.0,
            blinkPhase: rand() * Math.PI * 2,
        }));
    }, []);

    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();
        const time = useStore.getState().time;
        const isNight = time >= 18 || time < 6;

        const mat = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3();

        // Track first 3 firefly positions for representative lights
        const lightPositions: THREE.Vector3[] = [];

        for (let i = 0; i < FIREFLY_COUNT; i++) {
            const p = params[i];
            const st = t * p.speed + p.phase;

            if (!isNight) {
                scale.set(0, 0, 0);
                mat.compose(new THREE.Vector3(0, -10, 0), quat, scale);
            } else {
                const x = p.cx + Math.sin(st) * p.driftRadius + Math.sin(st * 1.3) * 0.5;
                const z = p.cz + Math.cos(st * 0.8) * p.driftRadius + Math.cos(st * 1.1) * 0.5;
                const y = p.cy + Math.sin(st * 0.6) * 0.5;
                pos.set(x, y, z);

                // Blink effect via scale
                const blink = 0.5 + 0.5 * Math.sin(t * p.blinkSpeed + p.blinkPhase);
                const s = 0.04 + blink * 0.04;
                scale.set(s, s, s);
                mat.compose(pos, quat, scale);

                if (i < 3) lightPositions.push(pos.clone());
            }
            meshRef.current.setMatrixAt(i, mat);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;

        // Update representative point lights
        const lightIntensity = isNight ? 2.0 : 0;
        const lights = [light1Ref.current, light2Ref.current, light3Ref.current];
        lights.forEach((light, i) => {
            if (light && lightPositions[i]) {
                light.position.copy(lightPositions[i]);
                light.intensity = lightIntensity * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
            } else if (light) {
                light.intensity = 0;
            }
        });
    });

    return (
        <group>
            <instancedMesh ref={meshRef} args={[undefined, undefined, FIREFLY_COUNT]}>
                <sphereGeometry args={[1, 6, 6]} />
                <meshStandardMaterial
                    color="#aaff44"
                    emissive="#aaff44"
                    emissiveIntensity={3}
                    toneMapped={false}
                />
            </instancedMesh>
            {/* 3 representative point lights */}
            <pointLight ref={light1Ref} color="#aaff44" intensity={0} distance={8} />
            <pointLight ref={light2Ref} color="#aaff44" intensity={0} distance={8} />
            <pointLight ref={light3Ref} color="#aaff44" intensity={0} distance={8} />
        </group>
    );
};

// ============================================================
// 池の魚（PondFish）- 各池に3匹
// ============================================================
interface PondFishProps {
    ponds: [number, number, number][];
}

interface FishData {
    pondIndex: number;
    angle: number;
    speed: number;
    radius: number;
    depth: number;
    phase: number;
    jumpPhase: number;
    jumpInterval: number;
}

export const PondFish = ({ ponds }: PondFishProps) => {
    const fishPerPond = 3;
    const totalFish = ponds.length * fishPerPond;
    const meshRef = useRef<THREE.InstancedMesh>(null!);

    const fishData = useMemo(() => {
        const rand = seededRandom(33333);
        const data: FishData[] = [];

        for (let p = 0; p < ponds.length; p++) {
            for (let f = 0; f < fishPerPond; f++) {
                data.push({
                    pondIndex: p,
                    angle: rand() * Math.PI * 2,
                    speed: 0.3 + rand() * 0.5,
                    radius: 1.5 + rand() * 2.5,
                    depth: -0.3 - rand() * 0.4,
                    phase: rand() * Math.PI * 2,
                    jumpPhase: rand() * 100,
                    jumpInterval: 15 + rand() * 20, // Jump every 15-35 seconds
                });
            }
        }
        return data;
    }, [ponds]);

    // Set colors
    useMemo(() => {
        if (meshRef.current) {
            const rand = seededRandom(33334);
            const fishColors = [
                new THREE.Color('#c0c0c0'), // silver
                new THREE.Color('#ffaa44'), // goldfish
                new THREE.Color('#6699cc'), // blue
            ];
            for (let i = 0; i < totalFish; i++) {
                meshRef.current.setColorAt(i, fishColors[Math.floor(rand() * fishColors.length)]);
            }
            if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
        }
    }, [totalFish]);

    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();

        const mat = new THREE.Matrix4();
        const pos = new THREE.Vector3();
        const quat = new THREE.Quaternion();
        const scale = new THREE.Vector3(0.15, 0.08, 0.25);

        for (let i = 0; i < totalFish; i++) {
            const fish = fishData[i];
            const pond = ponds[fish.pondIndex];

            const angle = fish.angle + t * fish.speed;
            const x = pond[0] + Math.cos(angle) * fish.radius;
            const z = pond[2] + Math.sin(angle) * fish.radius;

            // Jump calculation
            let y = pond[1] + fish.depth;
            const jumpCycle = (t + fish.jumpPhase) % fish.jumpInterval;
            if (jumpCycle < 0.5) {
                // Brief jump arc
                const jumpT = jumpCycle / 0.5;
                y += Math.sin(jumpT * Math.PI) * 0.8;
            }

            pos.set(x, y, z);

            // Face direction of movement
            const faceAngle = angle + Math.PI / 2;
            quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceAngle);

            mat.compose(pos, quat, scale);
            meshRef.current.setMatrixAt(i, mat);
        }
        meshRef.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, totalFish]}>
            <coneGeometry args={[1, 2, 4]} />
            <meshStandardMaterial roughness={0.3} metalness={0.6} />
        </instancedMesh>
    );
};
