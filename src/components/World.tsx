import { Environment, SoftShadows, ContactShadows } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";

export const World = () => {
    return (
        <>
            {/* Lighting & Atmosphere */}
            <Environment preset="city" />
            <directionalLight
                position={[5, 10, 5]}
                intensity={1.5}
                castShadow
                shadow-mapSize={[1024, 1024]}
            >
                <orthographicCamera attach="shadow-camera" args={[-10, 10, 10, -10]} />
            </directionalLight>
            <ambientLight intensity={0.5} />

            {/* Shadow configurations for aesthetics */}
            <SoftShadows size={10} samples={16} focus={0.5} />

            {/* Floor */}
            <RigidBody type="fixed" colliders={false}>
                <CuboidCollider args={[20, 0.1, 20]} position={[0, -0.1, 0]} />
                <mesh position={[0, -0.1, 0]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
                    <planeGeometry args={[50, 50]} />
                    <shadowMaterial transparent opacity={0.2} />
                </mesh>
            </RigidBody>

            {/* Visual Floor (Grid for aesthetic) */}
            <gridHelper args={[50, 50, 0xdddddd, 0xf0f0f0]} position={[0, 0.01, 0]} />

            {/* Contact Shadows for grounding objects */}
            <ContactShadows resolution={1024} scale={50} blur={1} opacity={0.5} far={10} color="#000000" />
        </>
    );
};
