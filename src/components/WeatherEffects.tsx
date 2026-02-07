import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "../store";

export const WeatherEffects = () => {
    const weather = useStore((state) => state.weather);
    const time = useStore((state) => state.time);
    const rainRef = useRef<THREE.Points>(null);
    const snowRef = useRef<THREE.Points>(null);
    const fireflyRef = useRef<THREE.Points>(null);
    const dustRef = useRef<THREE.Points>(null);

    const count = 2000;
    const positions = useMemo(() => {
        const pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 50;
            pos[i * 3 + 1] = Math.random() * 20;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
        }
        return pos;
    }, []);

    // Per-particle random seeds for snow variation
    const snowSeeds = useMemo(() => {
        const seeds = new Float32Array(count);
        for (let i = 0; i < count; i++) {
            seeds[i] = Math.random() * 10;
        }
        return seeds;
    }, []);

    // Firefly positions (smaller count)
    const fireflyCount = 80;
    const fireflyPositions = useMemo(() => {
        const pos = new Float32Array(fireflyCount * 3);
        for (let i = 0; i < fireflyCount; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 40;
            pos[i * 3 + 1] = 0.5 + Math.random() * 3;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 40;
        }
        return pos;
    }, []);

    // Dust positions
    const dustCount = 40;
    const dustPositions = useMemo(() => {
        const pos = new Float32Array(dustCount * 3);
        for (let i = 0; i < dustCount; i++) {
            pos[i * 3] = (Math.random() - 0.5) * 30;
            pos[i * 3 + 1] = 0.3 + Math.random() * 2;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 30;
        }
        return pos;
    }, []);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();

        // Rain with wind
        if (weather === 'rainy' && rainRef.current) {
            const pos = rainRef.current.geometry.attributes.position.array as Float32Array;
            const windX = Math.sin(t * 0.3) * 0.15;
            const windZ = Math.cos(t * 0.2) * 0.08;
            for (let i = 0; i < count; i++) {
                pos[i * 3] += windX;
                pos[i * 3 + 1] -= 0.5;
                pos[i * 3 + 2] += windZ;
                if (pos[i * 3 + 1] < 0) {
                    pos[i * 3 + 1] = 20;
                    pos[i * 3] = (Math.random() - 0.5) * 50;
                    pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
                }
            }
            rainRef.current.geometry.attributes.position.needsUpdate = true;
        }

        // Snow with gusts and variable speed
        if (weather === 'snowy' && snowRef.current) {
            const pos = snowRef.current.geometry.attributes.position.array as Float32Array;
            const gustX = Math.sin(t * 0.15) * 0.03;
            for (let i = 0; i < count; i++) {
                const seed = snowSeeds[i];
                const fallSpeed = 0.03 + seed * 0.003;
                pos[i * 3 + 1] -= fallSpeed;
                pos[i * 3] += Math.sin(t * 0.5 + seed) * 0.015 + gustX;
                pos[i * 3 + 2] += Math.cos(t * 0.4 + seed * 1.3) * 0.01;
                if (pos[i * 3 + 1] < 0) {
                    pos[i * 3 + 1] = 20;
                    pos[i * 3] = (Math.random() - 0.5) * 50;
                    pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
                }
            }
            snowRef.current.geometry.attributes.position.needsUpdate = true;
        }

        // Fireflies at night
        const showFireflies = time > 18.5 || time < 5;
        if (showFireflies && fireflyRef.current) {
            const pos = fireflyRef.current.geometry.attributes.position.array as Float32Array;
            for (let i = 0; i < fireflyCount; i++) {
                pos[i * 3] += Math.sin(t * 0.3 + i * 1.7) * 0.008;
                pos[i * 3 + 1] += Math.sin(t * 0.5 + i * 2.3) * 0.005;
                pos[i * 3 + 2] += Math.cos(t * 0.4 + i * 1.1) * 0.008;
                // Keep in bounds
                if (Math.abs(pos[i * 3]) > 25) pos[i * 3] *= 0.99;
                if (pos[i * 3 + 1] < 0.3) pos[i * 3 + 1] = 0.5;
                if (pos[i * 3 + 1] > 4) pos[i * 3 + 1] = 3;
                if (Math.abs(pos[i * 3 + 2]) > 25) pos[i * 3 + 2] *= 0.99;
            }
            fireflyRef.current.geometry.attributes.position.needsUpdate = true;
            // Pulse size
            const mat = fireflyRef.current.material as THREE.PointsMaterial;
            mat.opacity = 0.5 + Math.sin(t * 2) * 0.3;
        }

        // Dust during sunny daytime
        const showDust = weather === 'sunny' && time >= 7 && time <= 17;
        if (showDust && dustRef.current) {
            const pos = dustRef.current.geometry.attributes.position.array as Float32Array;
            const driftX = Math.sin(t * 0.1) * 0.02;
            for (let i = 0; i < dustCount; i++) {
                pos[i * 3] += driftX + Math.sin(t * 0.2 + i) * 0.003;
                pos[i * 3 + 1] += Math.sin(t * 0.15 + i * 0.7) * 0.002;
                pos[i * 3 + 2] += Math.cos(t * 0.12 + i) * 0.003;
                if (Math.abs(pos[i * 3]) > 20) pos[i * 3] = (Math.random() - 0.5) * 20;
                if (pos[i * 3 + 1] < 0.2 || pos[i * 3 + 1] > 3) pos[i * 3 + 1] = 0.5 + Math.random() * 1.5;
            }
            dustRef.current.geometry.attributes.position.needsUpdate = true;
        }
    });

    const showFireflies = time > 18.5 || time < 5;
    const showDust = weather === 'sunny' && time >= 7 && time <= 17;

    return (
        <>
            {weather === 'rainy' && (
                <points ref={rainRef}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                    </bufferGeometry>
                    <pointsMaterial size={0.1} color="#aaaaff" transparent opacity={0.6} />
                </points>
            )}
            {weather === 'snowy' && (
                <points ref={snowRef}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                    </bufferGeometry>
                    <pointsMaterial size={0.15} color="#ffffff" transparent opacity={0.8} />
                </points>
            )}
            {showFireflies && (
                <points ref={fireflyRef}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" args={[fireflyPositions, 3]} />
                    </bufferGeometry>
                    <pointsMaterial
                        size={0.25}
                        color="#ccff66"
                        transparent
                        opacity={0.7}
                        sizeAttenuation
                        toneMapped={false}
                    />
                </points>
            )}
            {showDust && (
                <points ref={dustRef}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" args={[dustPositions, 3]} />
                    </bufferGeometry>
                    <pointsMaterial size={0.2} color="#ddccaa" transparent opacity={0.25} sizeAttenuation />
                </points>
            )}
        </>
    );
};
