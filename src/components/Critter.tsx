import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, Quaternion } from "three";
import { RigidBody, RapierRigidBody } from "@react-three/rapier";

interface CritterProps {
    position: [number, number, number];
    name?: string;
}

export const Critter = ({ position, name = "Wild Critter" }: CritterProps) => {
    const rigidRef = useRef<RapierRigidBody>(null!);
    const [targetPos] = useState(() => new Vector3(
        position[0] + (Math.random() - 0.5) * 4,
        0.5,
        position[2] + (Math.random() - 0.5) * 4
    ));
    const nextMoveTime = useRef(Math.random() * 3);
    const homePos = useRef(new Vector3(position[0], position[1], position[2]));

    useFrame((state) => {
        const t = state.clock.getElapsedTime();

        if (rigidRef.current) {
            const currentTranslation = rigidRef.current.translation();
            const currentPos = new Vector3(currentTranslation.x, currentTranslation.y, currentTranslation.z);

            // Wander Logic - Stay close to home
            if (currentPos.distanceTo(targetPos) < 0.5 || t > nextMoveTime.current) {
                // Stay within 5 units of home position
                targetPos.set(
                    homePos.current.x + (Math.random() - 0.5) * 6,
                    0.5,
                    homePos.current.z + (Math.random() - 0.5) * 6
                );
                nextMoveTime.current = t + 3 + Math.random() * 4;
            }

            const direction = targetPos.clone().sub(currentPos).normalize();
            const speed = 1.2;
            const impulse = direction.multiplyScalar(speed * 0.008);
            rigidRef.current.applyImpulse({ x: impulse.x, y: 0, z: impulse.z }, true);

            // Occasional hop
            if (Math.random() < 0.003) {
                rigidRef.current.applyImpulse({ x: 0, y: 0.15, z: 0 }, true);
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
            restitution={0.3}
            friction={1}
            linearDamping={3}
            position={position}
            enabledRotations={[false, true, false]}
            userData={{ type: 'critter', name }}
        >
            <mesh castShadow receiveShadow>
                <tetrahedronGeometry args={[0.25]} />
                <meshStandardMaterial color="#66cc44" roughness={0.3} metalness={0.2} />
            </mesh>
        </RigidBody>
    );
};
