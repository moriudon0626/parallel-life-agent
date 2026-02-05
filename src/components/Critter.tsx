import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, Quaternion } from "three";
import { RigidBody, RapierRigidBody } from "@react-three/rapier";

export const Critter = ({ position }: { position: [number, number, number] }) => {
    const rigidRef = useRef<RapierRigidBody>(null!);
    const [targetPos] = useState(() => new Vector3((Math.random() - 0.5) * 8, 0.5, (Math.random() - 0.5) * 8));
    const nextMoveTime = useRef(Math.random() * 5);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();

        if (rigidRef.current) {
            const currentTranslation = rigidRef.current.translation();
            const currentPos = new Vector3(currentTranslation.x, currentTranslation.y, currentTranslation.z);

            // Wander Logic - Stay close to center
            if (currentPos.distanceTo(targetPos) < 0.5 || t > nextMoveTime.current) {
                targetPos.set((Math.random() - 0.5) * 8, 0.5, (Math.random() - 0.5) * 8);
                nextMoveTime.current = t + 3 + Math.random() * 4;
            }

            const direction = targetPos.clone().sub(currentPos).normalize();
            const speed = 1.5;  // Slower speed
            const impulse = direction.multiplyScalar(speed * 0.01);
            rigidRef.current.applyImpulse({ x: impulse.x, y: 0, z: impulse.z }, true);

            // Random hops
            if (Math.random() < 0.005) {
                rigidRef.current.applyImpulse({ x: 0, y: 0.3, z: 0 }, true);
            }

            // Rotation
            const angle = Math.atan2(direction.x, direction.z);
            const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);
            rigidRef.current.setRotation(q, true);
        }
    });

    return (
        <RigidBody
            ref={rigidRef}
            colliders="hull"
            restitution={0.5}
            friction={1}
            position={position}
            enabledRotations={[false, true, false]}
            userData={{ type: 'critter', name: 'Wild Critter' }}
        >
            <mesh castShadow receiveShadow>
                <tetrahedronGeometry args={[0.3]} />
                <meshStandardMaterial color="#88cc44" roughness={0.2} />
            </mesh>
        </RigidBody>
    );
};
