import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import { Float, Sparkles } from "@react-three/drei";

export const Crystal = ({ position }: { position: [number, number, number] }) => {
    const ref = useRef<any>();
    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if (ref.current) {
            ref.current.rotation.y = t * 0.2;
            ref.current.rotation.x = Math.sin(t * 0.5) * 0.1;
        }
    });

    return (
        <RigidBody type="fixed" colliders="hull" position={position}>
            <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
                <group ref={ref}>
                    <mesh castShadow receiveShadow>
                        <octahedronGeometry args={[0.8, 0]} />
                        <meshStandardMaterial color="#66ffff" emissive="#00ffff" emissiveIntensity={0.5} metalness={0.8} roughness={0.1} transparent opacity={0.8} />
                    </mesh>
                    <Sparkles count={20} scale={2} size={4} speed={0.4} opacity={0.5} color="#ccffff" />
                    <pointLight distance={3} intensity={2} color="#00ffff" />
                </group>
            </Float>
        </RigidBody>
    );
};

export const Monolith = ({ position, rotation = [0, 0, 0] }: { position: [number, number, number], rotation?: [number, number, number] }) => {
    return (
        <RigidBody type="fixed" colliders="cuboid" position={position} rotation={rotation as any}>
            <mesh castShadow receiveShadow position={[0, 1.5, 0]}>
                <boxGeometry args={[1, 3, 0.4]} />
                <meshStandardMaterial color="#111111" roughness={0.05} metalness={0.8} />
            </mesh>
        </RigidBody>
    );
};

export const DataTower = ({ position }: { position: [number, number, number] }) => {
    return (
        <RigidBody type="fixed" colliders="hull" position={position}>
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
