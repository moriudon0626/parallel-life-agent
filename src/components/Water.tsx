import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface PondProps {
    position: [number, number, number];
    radius: number;
}

export const Pond = ({ position, radius }: PondProps) => {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (meshRef.current) {
            const mat = meshRef.current.material as THREE.MeshStandardMaterial;
            mat.emissiveIntensity = 0.05 + Math.sin(state.clock.getElapsedTime() * 0.8) * 0.03;

            // Gentle wave via vertex displacement
            const geo = meshRef.current.geometry;
            const pos = geo.attributes.position;
            const t = state.clock.getElapsedTime();

            for (let i = 0; i < pos.count; i++) {
                const x = pos.getX(i);
                const y = pos.getY(i);
                const wave = Math.sin(x * 2 + t * 1.5) * 0.03 + Math.cos(y * 2.5 + t * 1.2) * 0.02;
                pos.setZ(i, wave);
            }
            pos.needsUpdate = true;
        }
    });

    return (
        <mesh ref={meshRef} position={position} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[radius, 32]} />
            <meshStandardMaterial
                color="#2288aa"
                transparent
                opacity={0.7}
                metalness={0.9}
                roughness={0.1}
                emissive="#114466"
                emissiveIntensity={0.05}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
};
