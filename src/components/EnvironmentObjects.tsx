import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import { Float, Sparkles } from "@react-three/drei";
import { useStore } from "../store";
import * as THREE from "three";

export const Crystal = ({ position }: { position: [number, number, number] }) => {
    const ref = useRef<any>(null);
    const matRef = useRef<THREE.MeshStandardMaterial>(null);
    const lightRef = useRef<THREE.PointLight>(null);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        const time = useStore.getState().time;

        // 夜間の発光倍率を計算 (夜: 4x, 昼: 1x, 薄暮/薄明: 補間)
        let glowMultiplier = 1.0;
        if (time >= 18 || time < 6) {
            glowMultiplier = 4.0;
        } else if (time >= 17 && time < 18) {
            glowMultiplier = 1.0 + (time - 17) * 3.0; // 1→4
        } else if (time >= 6 && time < 7) {
            glowMultiplier = 4.0 - (time - 6) * 3.0; // 4→1
        }

        // 脈動アニメーション
        const pulse = 1.0 + Math.sin(t * 1.5) * 0.15;
        const finalMultiplier = glowMultiplier * pulse;

        if (matRef.current) {
            matRef.current.emissiveIntensity = 0.5 * finalMultiplier;
        }
        if (lightRef.current) {
            lightRef.current.intensity = 2 * finalMultiplier;
            lightRef.current.distance = 3 + glowMultiplier * 1.5; // 夜はより遠くまで照らす
        }

        if (ref.current) {
            ref.current.rotation.y = t * 0.2;
            ref.current.rotation.x = Math.sin(t * 0.5) * 0.1;
        }
    });

    return (
        <RigidBody type="fixed" colliders="hull" position={position} userData={{ type: 'object', name: 'Glowing Crystal' }}>
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                <group ref={ref}>
                    <mesh castShadow receiveShadow>
                        <octahedronGeometry args={[0.8, 0]} />
                        <meshStandardMaterial ref={matRef} color="#66ffff" emissive="#00ffff" emissiveIntensity={0.5} metalness={0.8} roughness={0.1} transparent opacity={0.8} toneMapped={false} />
                    </mesh>
                    <Sparkles count={20} scale={2} size={4} speed={0.4} opacity={0.5} color="#ccffff" />
                    <pointLight ref={lightRef} distance={3} intensity={2} color="#00ffff" />
                </group>
            </Float>
        </RigidBody>
    );
};

export const Monolith = ({ position, rotation = [0, 0, 0] }: { position: [number, number, number], rotation?: [number, number, number] }) => {
    return (
        <RigidBody type="fixed" colliders="cuboid" position={position} rotation={rotation as any} userData={{ type: 'object', name: 'Ancient Monolith' }}>
            <mesh castShadow receiveShadow position={[0, 1.5, 0]}>
                <boxGeometry args={[1, 3, 0.4]} />
                <meshStandardMaterial color="#111111" roughness={0.05} metalness={0.8} />
            </mesh>
        </RigidBody>
    );
};

export const DataTower = ({ position }: { position: [number, number, number] }) => {
    return (
        <RigidBody type="fixed" colliders="hull" position={position} userData={{ type: 'object', name: 'Data Tower' }}>
            <group>
                {/* Base */}
                <mesh castShadow receiveShadow position={[0, 0.5, 0]}>
                    <cylinderGeometry args={[0.5, 0.8, 1, 8]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
                {/* Tower */}
                <mesh castShadow receiveShadow position={[0, 2, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 4, 8]} />
                    <meshStandardMaterial color="#444" metalness={0.6} />
                </mesh>
                {/* Top Light */}
                <mesh position={[0, 4, 0]}>
                    <sphereGeometry args={[0.3]} />
                    <meshStandardMaterial color="orange" emissive="orange" emissiveIntensity={2} toneMapped={false} />
                </mesh>
                <pointLight position={[0, 4, 0]} distance={5} intensity={1} color="orange" />
            </group>
        </RigidBody>
    );
};

export const DistantMountains = () => {
    return (
        <group>
            {/* 遠くの山々 - 巨大な円錐や不規則な形状で構成 */}
            <mesh position={[0, -2, -80]} rotation={[0, Math.PI / 4, 0]}>
                <coneGeometry args={[40, 30, 6]} />
                <meshStandardMaterial color="#555555" roughness={1} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[-60, -5, -60]} rotation={[0.1, 0, 0.2]}>
                <coneGeometry args={[50, 40, 5]} />
                <meshStandardMaterial color="#444444" roughness={1} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[70, -10, -50]} rotation={[-0.1, 1, 0]}>
                <coneGeometry args={[60, 50, 4]} />
                <meshStandardMaterial color="#666666" roughness={1} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[100, -15, 20]} rotation={[0, -Math.PI / 3, 0.1]}>
                <coneGeometry args={[80, 60, 5]} />
                <meshStandardMaterial color="#333333" roughness={1} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[-110, -20, 40]} rotation={[0, Math.PI / 6, -0.1]}>
                <coneGeometry args={[90, 70, 7]} />
                <meshStandardMaterial color="#444444" roughness={1} side={THREE.DoubleSide} />
            </mesh>
            <mesh position={[0, -10, 100]} rotation={[0, Math.PI, 0]}>
                <coneGeometry args={[70, 45, 6]} />
                <meshStandardMaterial color="#555555" roughness={1} side={THREE.DoubleSide} />
            </mesh>
        </group>
    );
};
