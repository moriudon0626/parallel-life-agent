import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useStore } from '../store';
import type { ResourceNode } from '../lib/resources';

const OreCluster = ({ node }: { node: ResourceNode }) => {
    const groupRef = useRef<THREE.Group>(null!);

    useFrame((state) => {
        if (groupRef.current) {
            // Subtle glow pulsation based on capacity
            const t = state.clock.getElapsedTime();
            groupRef.current.children.forEach((child, i) => {
                if ('material' in child) {
                    const mesh = child as THREE.Mesh;
                    const mat = mesh.material as THREE.MeshStandardMaterial;
                    mat.emissiveIntensity = 0.2 + Math.sin(t * 1.5 + i) * 0.1 * node.capacity;
                }
            });
        }
    });

    const colors = ['#b87333', '#708090', '#4a9bd9']; // copper, iron, crystal blue
    const color = colors[node.id.charCodeAt(4) % colors.length];

    return (
        <group ref={groupRef} position={[node.position.x, node.position.y, node.position.z]}>
            {[...Array(5)].map((_, i) => {
                const angle = (i / 5) * Math.PI * 2;
                const r = 0.5 + Math.random() * 0.8;
                const s = 0.15 + Math.random() * 0.2;
                return (
                    <mesh
                        key={i}
                        position={[Math.cos(angle) * r, s * 0.5, Math.sin(angle) * r]}
                        rotation={[Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5]}
                        castShadow
                    >
                        <icosahedronGeometry args={[s, 0]} />
                        <meshStandardMaterial
                            color={color}
                            metalness={0.7}
                            roughness={0.3}
                            emissive={color}
                            emissiveIntensity={0.2}
                        />
                    </mesh>
                );
            })}
        </group>
    );
};

const EnergyNode = ({ node }: { node: ResourceNode }) => {
    const ringRef = useRef<THREE.Mesh>(null!);
    const lightRef = useRef<THREE.PointLight>(null!);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if (ringRef.current) {
            ringRef.current.rotation.y = t * 1.5;
            ringRef.current.rotation.x = Math.sin(t * 0.7) * 0.2;
        }
        if (lightRef.current) {
            lightRef.current.intensity = (0.5 + Math.sin(t * 2) * 0.3) * node.capacity;
        }
    });

    return (
        <group position={[node.position.x, node.position.y, node.position.z]}>
            {/* Spire */}
            <mesh position={[0, 0.6, 0]} castShadow>
                <coneGeometry args={[0.15, 1.2, 6]} />
                <meshStandardMaterial
                    color="#2a9d8f"
                    emissive="#2a9d8f"
                    emissiveIntensity={0.4 * node.capacity}
                    metalness={0.6}
                    roughness={0.2}
                />
            </mesh>
            {/* Rotating ring */}
            <mesh ref={ringRef} position={[0, 0.8, 0]}>
                <torusGeometry args={[0.4, 0.03, 8, 24]} />
                <meshStandardMaterial
                    color="#4cc9f0"
                    emissive="#4cc9f0"
                    emissiveIntensity={0.6 * node.capacity}
                    metalness={0.8}
                    roughness={0.1}
                    toneMapped={false}
                />
            </mesh>
            {/* Point light */}
            <pointLight
                ref={lightRef}
                position={[0, 0.8, 0]}
                color="#4cc9f0"
                intensity={0.5}
                distance={6}
            />
        </group>
    );
};

export const ResourceNodes = () => {
    const resourceNodes = useStore(s => s.resourceNodes);

    return (
        <>
            {resourceNodes.map(node => {
                if (node.type === 'mineral_ore') {
                    return <OreCluster key={node.id} node={node} />;
                }
                if (node.type === 'energy_node') {
                    return <EnergyNode key={node.id} node={node} />;
                }
                // glowing_mushroom and vegetation use existing visuals
                return null;
            })}
        </>
    );
};
