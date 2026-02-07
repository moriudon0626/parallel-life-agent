import { Sky, ContactShadows, Stars } from "@react-three/drei";
import { HeightfieldCollider, RigidBody } from "@react-three/rapier";
import { useStore } from "../store";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { getBiomeParamsAt } from "../lib/biomes";
import { getTerrainHeight } from "../lib/terrain";

const TERRAIN_SIZE = 200;
const TERRAIN_SEGMENTS = 128;
const TERRAIN_VERTICES = TERRAIN_SEGMENTS + 1; // 129

export const World = () => {
    const time = useStore((state) => state.time);
    const weather = useStore((state) => state.weather);
    const starsRef = useRef<THREE.Group>(null!);

    // 惑星の自転に基づく太陽の位置と星空の回転
    // time 0-24
    // 6時(Sunrise) = East, 12時(Noon) = Top, 18時(Sunset) = West
    const sunPosition = useMemo(() => {
        // 時間を角度に変換 (0-2PI)
        // 6時:Sunrise, 12時:Noon, 18時:Sunset
        // theta = 仰角 (傾き), phi = 方位角

        // 仰角: 12時に真上 (Math.PI/2), 0時・24時に真下 (-Math.PI/2)
        const inclination = (time / 24) * Math.PI * 2 - Math.PI / 2;

        // 方位角: 6時(東) -> 18時(西)
        const azimuth = 0.25; // わずかに傾ける

        const x = Math.cos(inclination);
        const y = Math.sin(inclination);
        const z = azimuth;

        return new THREE.Vector3(x, y, z).normalize();
    }, [time]);

    // 星空の自転 (太陽と逆方向に回転させることで惑星の自転を表現)
    useFrame(() => {
        if (starsRef.current) {
            // 24時間で一周 (2PI)
            const rotationAngle = (time / 24) * Math.PI * 2;
            starsRef.current.rotation.x = rotationAngle;
        }
    });

    // スムーズなライティング遷移
    const lightConfig = useMemo(() => {
        const nightColor = new THREE.Color("#1a1a4e");
        const sunriseColor = new THREE.Color("#ffccaa");
        const dayColor = new THREE.Color("#ffffff");
        const sunsetColor = new THREE.Color("#ff8844");

        let color: THREE.Color;
        if (time < 5) {
            color = nightColor.clone();
        } else if (time < 7) {
            const t = (time - 5) / 2;
            color = nightColor.clone().lerp(sunriseColor, t);
        } else if (time < 9) {
            const t = (time - 7) / 2;
            color = sunriseColor.clone().lerp(dayColor, t);
        } else if (time < 16) {
            color = dayColor.clone();
        } else if (time < 18) {
            const t = (time - 16) / 2;
            color = dayColor.clone().lerp(sunsetColor, t);
        } else if (time < 20) {
            const t = (time - 18) / 2;
            color = sunsetColor.clone().lerp(nightColor, t);
        } else {
            color = nightColor.clone();
        }

        const sunHeight = sunPosition.y;
        const intensity = Math.max(0, sunHeight) * 1.5;
        let ambientIntensity = THREE.MathUtils.lerp(0.05, 0.3, Math.max(0, sunHeight));

        // 天候による減衰
        const weatherDim = weather === 'rainy' ? 0.3 : weather === 'cloudy' ? 0.75 : weather === 'snowy' ? 0.4 : 1.0;

        return {
            intensity: intensity * weatherDim,
            ambientIntensity: ambientIntensity + (1 - weatherDim) * 0.2,
            color: `#${color.getHexString()}`
        };
    }, [sunPosition, time, weather]);

    // スムーズなフォグ遷移 (常時有効)
    const fogConfig = useMemo(() => {
        const nightFog = new THREE.Color("#000011");
        const dayFog = new THREE.Color("#aaccee");
        const rainFog = new THREE.Color("#555566");
        const snowFog = new THREE.Color("#ddeeff");
        const cloudyFog = new THREE.Color("#888899");

        // 時刻ベースのベースカラー
        let baseColor: THREE.Color;
        if (time < 5 || time > 20) {
            baseColor = nightFog.clone();
        } else if (time < 7) {
            baseColor = nightFog.clone().lerp(dayFog, (time - 5) / 2);
        } else if (time < 18) {
            baseColor = dayFog.clone();
        } else {
            baseColor = dayFog.clone().lerp(nightFog, (time - 18) / 2);
        }

        // 天候によるブレンド
        if (weather === 'rainy') baseColor.lerp(rainFog, 0.8);
        else if (weather === 'snowy') baseColor.lerp(snowFog, 0.8);
        else if (weather === 'cloudy') baseColor.lerp(cloudyFog, 0.25);

        const far = weather === 'rainy' ? 40 : weather === 'snowy' ? 35 : weather === 'cloudy' ? 90 : 100;
        const near = weather === 'rainy' ? 1 : weather === 'snowy' ? 2 : weather === 'cloudy' ? 10 : 5;

        return { color: `#${baseColor.getHexString()}`, near, far };
    }, [weather, time]);

    // Pre-compute terrain height data for both visual mesh and physics collider
    const terrainData = useMemo(() => {
        const isSnowy = weather === 'snowy';
        const total = TERRAIN_VERTICES * TERRAIN_VERTICES;
        const heights = new Array<number>(total);
        const colors = new Float32Array(total * 3);

        // PlaneGeometry vertex order: rows go from +height/2 to -height/2 (y in plane space)
        // cols go from -width/2 to +width/2 (x in plane space)
        // After rotation (-PI/2 around X): plane y -> world -z, plane z(height) -> world y
        const halfSize = TERRAIN_SIZE / 2;

        for (let row = 0; row < TERRAIN_VERTICES; row++) {
            for (let col = 0; col < TERRAIN_VERTICES; col++) {
                const idx = row * TERRAIN_VERTICES + col;

                // PlaneGeometry coordinates
                const px = (col / TERRAIN_SEGMENTS) * TERRAIN_SIZE - halfSize; // -100 to +100
                const py = (1 - row / TERRAIN_SEGMENTS) * TERRAIN_SIZE - halfSize; // +100 to -100

                const h = getTerrainHeight(px, py);

                heights[idx] = h;

                // Vertex colors based on height
                let r: number, g: number, b: number;
                if (h < -1.5) {
                    r = 0.3; g = 0.28; b = 0.25;
                } else if (h < -0.3) {
                    r = 0.4; g = 0.35; b = 0.28;
                } else if (h < 1.0) {
                    r = 0.35; g = 0.48; b = 0.28;
                } else if (h < 3.0) {
                    r = 0.4; g = 0.45; b = 0.3;
                } else {
                    r = 0.55; g = 0.53; b = 0.48;
                }

                // Blend biome tint (subtle)
                const biomeTint = getBiomeParamsAt(px, py);
                const blendFactor = 0.25;
                r = r * (1 - blendFactor) + biomeTint.groundTint[0] * blendFactor;
                g = g * (1 - blendFactor) + biomeTint.groundTint[1] * blendFactor;
                b = b * (1 - blendFactor) + biomeTint.groundTint[2] * blendFactor;

                if (isSnowy) {
                    const snowFactor = Math.min(1, Math.max(0, (h + 2) / 6));
                    r = r + (1 - r) * snowFactor * 0.8;
                    g = g + (1 - g) * snowFactor * 0.8;
                    b = b + (1 - b) * snowFactor * 0.85;
                }

                colors[idx * 3] = r;
                colors[idx * 3 + 1] = g;
                colors[idx * 3 + 2] = b;
            }
        }

        // HeightfieldCollider heights:
        // Rapier heightfield: args=[nRows, nCols, heights, scale]
        // The heights array is row-major, rows along Z, cols along X
        // Row 0 = -scale.z/2 (most negative Z), last row = +scale.z/2
        // Col 0 = -scale.x/2 (most negative X), last col = +scale.x/2
        //
        // PlaneGeometry after rotation:
        // row 0 in plane = py=+100 -> world z = -100 (negative Z)
        // row 128 in plane = py=-100 -> world z = +100 (positive Z)
        // col 0 in plane = px=-100 -> world x = -100 (negative X)
        // col 128 in plane = px=+100 -> world x = +100 (positive X)
        //
        // So the PlaneGeometry row/col order matches Rapier's expected order directly!
        // Row 0 (py=+100, world z=-100) = Rapier row 0 (z=-scale.z/2)
        // This means we can use the same heights array directly.

        return { heights, colors };
    }, [weather]);

    return (
        <>
            {/* Lighting & Atmosphere */}
            <Sky sunPosition={sunPosition} turbidity={0.1} rayleigh={0.5} mieCoefficient={0.005} mieDirectionalG={0.8} />
            <group ref={starsRef}>
                <Stars radius={200} depth={100} count={10000} factor={6} saturation={0.5} fade speed={0.5} />
            </group>

            <fog attach="fog" args={[fogConfig.color, fogConfig.near, fogConfig.far]} />

            <directionalLight
                position={sunPosition.clone().multiplyScalar(50)}
                intensity={lightConfig.intensity}
                color={lightConfig.color}
                castShadow
                shadow-mapSize={[2048, 2048]}
            >
                <orthographicCamera attach="shadow-camera" args={[-40, 40, 40, -40]} />
            </directionalLight>
            <ambientLight intensity={lightConfig.ambientIntensity * 0.5} color={lightConfig.color} />

            {/* Floor */}
            <RigidBody type="fixed" colliders={false}>
                <HeightfieldCollider
                    args={[
                        TERRAIN_SEGMENTS,
                        TERRAIN_SEGMENTS,
                        terrainData.heights,
                        { x: TERRAIN_SIZE, y: 1, z: TERRAIN_SIZE }
                    ]}
                />
                <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS]} onUpdate={(self) => {
                        const pos = self.attributes.position;

                        for (let i = 0; i < pos.count; i++) {
                            pos.setZ(i, terrainData.heights[i]);
                        }

                        self.setAttribute('color', new THREE.BufferAttribute(terrainData.colors, 3));
                        pos.needsUpdate = true;
                        self.computeVertexNormals();
                    }} />
                    <meshStandardMaterial
                        vertexColors
                        roughness={0.9}
                        metalness={0.1}
                    />
                </mesh>
            </RigidBody>

            {/* Visual Decor - No Grid */}

            {/* Contact Shadows for grounding objects */}
            <ContactShadows resolution={1024} scale={100} blur={2} opacity={0.4} far={10} color="#000000" />
        </>
    );
};
