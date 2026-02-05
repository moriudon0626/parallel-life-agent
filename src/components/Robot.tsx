import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Mesh, Group, Vector3, Quaternion } from "three";
import { RigidBody, RapierRigidBody, CylinderCollider } from "@react-three/rapier";
import { useStore } from "../store";

type RobotState = 'IDLE' | 'MOVING';

export const Robot = (props: any) => {
    const bodyRef = useRef<Mesh>(null!);
    const headRef = useRef<Group>(null!);
    const rigidRef = useRef<RapierRigidBody>(null!);
    const addMemory = useStore(state => state.addMemory);

    // AI State
    const [robotState, setRobotState] = useState<RobotState>('IDLE');
    const [targetPos, setTargetPos] = useState<Vector3 | null>(null);

    // Timers
    const nextDecisionTime = useRef(0.5);

    // Smooth rotation target
    const targetRotation = useRef(new Quaternion());

    // Memory throttle
    const lastSeen = useRef<{ [key: string]: number }>({});

    useFrame((state) => {
        const t = state.clock.getElapsedTime();

        // --- Animation: Floating Head ---
        if (headRef.current) {
            headRef.current.position.y = 0.6 + Math.sin(t * 2) * 0.05;
            headRef.current.rotation.y = Math.sin(t * 0.5) * 0.1;
        }

        // --- AI Logic (State Machine) ---
        if (t > nextDecisionTime.current) {
            if (robotState === 'IDLE') {
                const r = 6;
                const newTarget = new Vector3((Math.random() - 0.5) * 2 * r, 0, (Math.random() - 0.5) * 2 * r);
                setTargetPos(newTarget);
                setRobotState('MOVING');
                nextDecisionTime.current = t + 4 + Math.random() * 4;
            } else {
                setRobotState('IDLE');
                setTargetPos(null);
                nextDecisionTime.current = t + 2 + Math.random() * 2;
            }
        }

        // --- Physics & Movement ---
        if (rigidRef.current) {
            const currentTranslation = rigidRef.current.translation();
            const currentPos = new Vector3(currentTranslation.x, currentTranslation.y, currentTranslation.z);

            if (robotState === 'MOVING' && targetPos) {
                const dist = currentPos.distanceTo(targetPos);
                if (dist < 1.0) {
                    setRobotState('IDLE');
                    setTargetPos(null);
                    nextDecisionTime.current = t + 2 + Math.random() * 2;
                } else {
                    const direction = targetPos.clone().sub(currentPos).normalize();
                    const speed = 3.0;
                    const impulse = direction.multiplyScalar(speed * 0.02);
                    rigidRef.current.applyImpulse({ x: impulse.x, y: 0, z: impulse.z }, true);

                    const angle = Math.atan2(direction.x, direction.z);
                    const q = new Quaternion();
                    q.setFromAxisAngle(new Vector3(0, 1, 0), angle);
                    targetRotation.current.copy(q);
                }
            }

            if (robotState === 'MOVING') {
                const currentRot = rigidRef.current.rotation();
                const qCurrent = new Quaternion(currentRot.x, currentRot.y, currentRot.z, currentRot.w);
                qCurrent.slerp(targetRotation.current, 0.1);
                rigidRef.current.setRotation(qCurrent, true);
            }
        }
    });

    // Handle sensor detection
    const handleSensorEnter = (payload: any) => {
        const userData = payload.other.rigidBodyObject?.userData;
        if (userData && (userData.type === 'object' || userData.type === 'critter')) {
            const name = userData.name;
            const now = Date.now();
            if (!lastSeen.current[name] || now - lastSeen.current[name] > 15000) {
                console.log("Robot saw:", name);
                addMemory(`Spotted ${name}`);
                lastSeen.current[name] = now;
            }
        }
    };

    return (
        <RigidBody
            ref={rigidRef}
            colliders="hull"
            restitution={0.2}
            friction={1}
            linearDamping={2.0}
            angularDamping={2.0}
            position={[0, 1, 0]}
            enabledRotations={[false, true, false]}
            {...props}
        >
            <group>
                {/* Body */}
                <mesh ref={bodyRef} castShadow receiveShadow position={[0, 0, 0]}>
                    <dodecahedronGeometry args={[0.5, 0]} />
                    <meshStandardMaterial
                        color={robotState === 'IDLE' ? "#FFA500" : "#00BFFF"}
                        roughness={0.1}
                        metalness={0.5}
                    />
                </mesh>

                {/* Head Group (Floating) */}
                <group ref={headRef} position={[0, 0.6, 0]}>
                    {/* Head Shape */}
                    <mesh castShadow receiveShadow>
                        <boxGeometry args={[0.4, 0.3, 0.4]} />
                        <meshStandardMaterial color="#ffffff" roughness={0.2} metalness={0.8} />
                    </mesh>

                    {/* Eye (Visor) */}
                    <mesh position={[0, 0.05, 0.18]}>
                        <planeGeometry args={[0.3, 0.1]} />
                        <meshBasicMaterial
                            color={robotState === 'IDLE' ? "#00ffcc" : "#ff00cc"}
                            toneMapped={false}
                        />
                    </mesh>

                    {/* Antenna */}
                    <mesh position={[0, 0.25, 0]}>
                        <cylinderGeometry args={[0.02, 0.02, 0.3]} />
                        <meshStandardMaterial color="#333" />
                    </mesh>
                    <mesh position={[0, 0.4, 0]}>
                        <sphereGeometry args={[0.05]} />
                        <meshStandardMaterial color="red" emissive="red" emissiveIntensity={2} toneMapped={false} />
                    </mesh>
                </group>

                {/* Vision Sensor */}
                <CylinderCollider
                    args={[0.3, 2.5]}
                    position={[0, 0.3, 2]}
                    rotation={[Math.PI / 2, 0, 0]}
                    sensor
                    onIntersectionEnter={handleSensorEnter}
                />
            </group>
        </RigidBody>
    );
};
