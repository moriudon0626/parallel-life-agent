import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, Quaternion } from 'three';
import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useStore, createMemory } from '../store';
import type { WildAnimalDef } from '../lib/wildAnimals';
import { getTerrainHeight } from '../lib/terrain';

interface WildAnimalProps {
    def: WildAnimalDef;
    position: [number, number, number];
    id: string;
}

type AnimalState = 'idle' | 'wander' | 'flee' | 'forage' | 'rest' | 'chase' | 'attack';

export const WildAnimal = ({ def, position, id }: WildAnimalProps) => {
    const rigidRef = useRef<RapierRigidBody>(null!);
    const stateRef = useRef<AnimalState>('idle');
    const targetPos = useRef(new Vector3(position[0], position[1], position[2]));
    const homePos = useRef(new Vector3(position[0], position[1], position[2]));
    const nextDecision = useRef(Math.random() * 3);
    const wingAngle = useRef(0);
    const chaseTargetId = useRef<string | null>(null);
    const lastAttackTime = useRef(0);

    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if (!rigidRef.current) return;

        const currentTranslation = rigidRef.current.translation();
        const currentPos = new Vector3(currentTranslation.x, currentTranslation.y, currentTranslation.z);

        // Safety reset
        if (currentPos.y < -5) {
            rigidRef.current.setTranslation({ x: position[0], y: 5, z: position[2] }, true);
            rigidRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
            return;
        }

        const store = useStore.getState();
        const positions = store.entityPositions;

        // --- Aggressive (wolf) behavior ---
        if (def.aggressive && def.chaseDistance && def.attackRange && def.attackDamage) {
            // Find nearest prey (critters, rabbits, deer - not other wolves or robot)
            let nearestPreyId: string | null = null;
            let nearestPreyDist = Infinity;
            let nearestPreyPos: { x: number; z: number } | null = null;

            for (const [entityId, pos] of Object.entries(positions)) {
                if (entityId === id) continue;
                if (entityId.startsWith('wolf-')) continue; // don't chase other wolves
                if (entityId === 'robot') continue; // don't chase robot
                // Only chase critters, rabbits, and deer
                const isCritter = entityId.startsWith('Critter-');
                const isRabbit = entityId.startsWith('rabbit-');
                const isDeer = entityId.startsWith('deer-');
                if (!isCritter && !isRabbit && !isDeer) continue;

                const dx = pos.x - currentPos.x;
                const dz = pos.z - currentPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist < def.chaseDistance && dist < nearestPreyDist) {
                    nearestPreyDist = dist;
                    nearestPreyId = entityId;
                    nearestPreyPos = pos;
                }
            }

            if (nearestPreyId && nearestPreyPos) {
                if (nearestPreyDist < def.attackRange) {
                    // Attack!
                    stateRef.current = 'attack';
                    chaseTargetId.current = nearestPreyId;
                    rigidRef.current.setLinvel({ x: 0, y: rigidRef.current.linvel().y, z: 0 }, true);

                    // Deal damage (throttled to every 2 seconds)
                    if (t - lastAttackTime.current > 2.0) {
                        lastAttackTime.current = t;

                        if (nearestPreyId.startsWith('Critter-')) {
                            // Damage critter lifecycle
                            const lifecycle = store.entityLifecycles[nearestPreyId];
                            if (lifecycle && lifecycle.healthStatus !== 'dead') {
                                store.updateEntityLifecycle(nearestPreyId, {
                                    ...lifecycle,
                                    health: Math.max(0, lifecycle.health - def.attackDamage),
                                    healthStatus: lifecycle.health - def.attackDamage <= 0 ? 'dead' : lifecycle.health - def.attackDamage < 0.2 ? 'dying' : lifecycle.healthStatus,
                                });

                                // Add memory for critter
                                store.addCritterMemory(nearestPreyId, createMemory(
                                    `狼に攻撃された！痛い！`,
                                    'event',
                                    [id, nearestPreyId],
                                    0.9,
                                    0.8
                                ));

                                // Add memory for robot if nearby
                                const robotPos = positions['robot'];
                                if (robotPos) {
                                    const robotDist = Math.sqrt(
                                        (robotPos.x - currentPos.x) ** 2 + (robotPos.z - currentPos.z) ** 2
                                    );
                                    if (robotDist < 30) {
                                        store.addRobotMemory(createMemory(
                                            `狼が${nearestPreyId}を攻撃している`,
                                            'event',
                                            [id, nearestPreyId],
                                            0.7
                                        ));
                                    }
                                }
                            }
                        }
                        // For wild animals (rabbit, deer) we can't damage them since they don't have lifecycle
                    }
                } else {
                    // Chase
                    stateRef.current = 'chase';
                    chaseTargetId.current = nearestPreyId;
                    targetPos.current.set(nearestPreyPos.x, 0.5, nearestPreyPos.z);
                }
            } else {
                chaseTargetId.current = null;
                // No prey nearby - normal wander behavior
                if (t > nextDecision.current) {
                    const roll = Math.random();
                    if (roll < 0.3) {
                        stateRef.current = 'idle';
                        nextDecision.current = t + 3 + Math.random() * 5;
                    } else if (roll < 0.7) {
                        stateRef.current = 'wander';
                        const r = def.wanderRadius;
                        targetPos.current.set(
                            homePos.current.x + (Math.random() - 0.5) * r * 2,
                            0.5,
                            homePos.current.z + (Math.random() - 0.5) * r * 2
                        );
                        nextDecision.current = t + 5 + Math.random() * 8;
                    } else {
                        stateRef.current = 'rest';
                        nextDecision.current = t + 8 + Math.random() * 12;
                    }
                }
            }
        } else {
            // --- Non-aggressive animal behavior (deer, rabbit, bird) ---
            let nearestThreatDist = Infinity;
            const threatDir = new Vector3();

            for (const [entityId, pos] of Object.entries(positions)) {
                if (entityId === id) continue;
                // Flee from wolves too
                const isWolf = entityId.startsWith('wolf-');
                const isOther = true;
                if (!isWolf && !isOther) continue;

                const dx = pos.x - currentPos.x;
                const dz = pos.z - currentPos.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                // Flee from wolves at greater distance
                const fleeDist = isWolf ? def.fleeDistance * 1.5 : def.fleeDistance;
                if (dist < fleeDist && dist < nearestThreatDist) {
                    nearestThreatDist = dist;
                    threatDir.set(-dx, 0, -dz).normalize();
                }
            }

            // State machine
            if (nearestThreatDist < def.fleeDistance * 1.5) {
                stateRef.current = 'flee';
                targetPos.current.set(
                    currentPos.x + threatDir.x * 15,
                    def.flightHeight ? def.flightHeight[1] : 0.5,
                    currentPos.z + threatDir.z * 15
                );
            } else if (t > nextDecision.current) {
                const roll = Math.random();
                if (roll < 0.3) {
                    stateRef.current = 'idle';
                    nextDecision.current = t + 3 + Math.random() * 5;
                } else if (roll < 0.7) {
                    stateRef.current = 'wander';
                    const r = def.wanderRadius;
                    targetPos.current.set(
                        homePos.current.x + (Math.random() - 0.5) * r * 2,
                        def.flightHeight ? def.flightHeight[0] + Math.random() * (def.flightHeight[1] - def.flightHeight[0]) : 0.5,
                        homePos.current.z + (Math.random() - 0.5) * r * 2
                    );
                    nextDecision.current = t + 5 + Math.random() * 8;
                } else {
                    stateRef.current = 'rest';
                    nextDecision.current = t + 8 + Math.random() * 12;
                }
            }
        }

        // Movement
        const aState = stateRef.current;
        if (aState === 'idle' || aState === 'rest' || aState === 'attack') {
            rigidRef.current.setLinvel({ x: 0, y: rigidRef.current.linvel().y, z: 0 }, true);
        } else {
            const dir = targetPos.current.clone().sub(currentPos).normalize();
            const speed = (aState === 'flee' || aState === 'chase') ? def.speed * 1.5 : def.speed;
            const dist = currentPos.distanceTo(targetPos.current);

            if (dist < 1.0 && aState !== 'chase') {
                stateRef.current = 'idle';
                nextDecision.current = t + 2 + Math.random() * 3;
                rigidRef.current.setLinvel({ x: 0, y: rigidRef.current.linvel().y, z: 0 }, true);
            } else {
                if (def.flightHeight) {
                    // Flying animal - set full 3D velocity
                    rigidRef.current.setLinvel({
                        x: dir.x * speed,
                        y: dir.y * speed * 0.3,
                        z: dir.z * speed
                    }, true);
                } else if (def.species === 'rabbit') {
                    // Hopping movement
                    rigidRef.current.setLinvel({
                        x: dir.x * speed,
                        y: rigidRef.current.linvel().y,
                        z: dir.z * speed
                    }, true);
                    if (Math.random() < 0.03) {
                        rigidRef.current.applyImpulse({ x: 0, y: 0.4, z: 0 }, true);
                    }
                } else {
                    rigidRef.current.setLinvel({
                        x: dir.x * speed,
                        y: rigidRef.current.linvel().y,
                        z: dir.z * speed
                    }, true);
                }

                // Rotation
                const angle = Math.atan2(dir.x, dir.z);
                const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);
                rigidRef.current.setRotation(q, true);
            }
        }

        // Wing animation for birds
        if (def.species === 'bird') {
            wingAngle.current = Math.sin(t * 8) * 0.5;
        }

        // Terrain height correction for ground animals
        if (!def.flightHeight) {
            const terrainY = getTerrainHeight(currentPos.x, currentPos.z);
            const correctedY = terrainY + 0.5;
            if (currentPos.y < correctedY - 0.5 || currentPos.y > correctedY + 2.0) {
                rigidRef.current.setTranslation(
                    { x: currentPos.x, y: correctedY + 0.5, z: currentPos.z },
                    true
                );
            }
        }

        // Position reporting
        store.updateEntityPosition(id, currentPos.x, currentPos.z);
    });

    return (
        <RigidBody
            ref={rigidRef}
            colliders="ball"
            restitution={0.1}
            friction={0.5}
            linearDamping={def.flightHeight ? 2 : 0.5}
            position={[position[0], def.flightHeight ? def.flightHeight[0] : position[1], position[2]]}
            canSleep={false}
            enabledRotations={[false, true, false]}
            gravityScale={def.flightHeight ? 0 : 1}
            userData={{ type: 'wild_animal', name: id, species: def.species }}
        >
            <group scale={[def.scale, def.scale, def.scale]}>
                {def.species === 'deer' && <DeerModel color={def.color} />}
                {def.species === 'bird' && <BirdModel color={def.color} wingAngle={wingAngle.current} />}
                {def.species === 'rabbit' && <RabbitModel color={def.color} />}
                {def.species === 'wolf' && <WolfModel color={def.color} />}
            </group>
        </RigidBody>
    );
};

const DeerModel = ({ color }: { color: string }) => (
    <group>
        {/* Body - elongated ellipsoid */}
        <mesh position={[0, 0.55, 0]} castShadow scale={[0.28, 0.3, 0.5]}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Neck - angled cylinder */}
        <mesh position={[0, 0.72, 0.35]} rotation={[-0.5, 0, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.1, 0.3, 6]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Head - elongated sphere */}
        <mesh position={[0, 0.85, 0.5]} castShadow scale={[0.8, 0.8, 1.2]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Snout */}
        <mesh position={[0, 0.82, 0.64]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.05, 0.1, 5]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Eyes */}
        <mesh position={[0.08, 0.88, 0.55]}>
            <sphereGeometry args={[0.02]} />
            <meshBasicMaterial color="black" />
        </mesh>
        <mesh position={[-0.08, 0.88, 0.55]}>
            <sphereGeometry args={[0.02]} />
            <meshBasicMaterial color="black" />
        </mesh>
        {/* Ears */}
        <mesh position={[-0.1, 0.97, 0.45]} rotation={[0.2, -0.3, -0.4]}>
            <coneGeometry args={[0.04, 0.1, 4]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0.1, 0.97, 0.45]} rotation={[0.2, 0.3, 0.4]}>
            <coneGeometry args={[0.04, 0.1, 4]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Front legs - upper */}
        {[[-0.12, 0.35, 0.25], [0.12, 0.35, 0.25]].map((pos, i) => (
            <group key={`fl-${i}`}>
                <mesh position={[pos[0], pos[1], pos[2]]} castShadow>
                    <cylinderGeometry args={[0.04, 0.035, 0.25, 5]} />
                    <meshStandardMaterial color={color} roughness={0.7} />
                </mesh>
                {/* Lower leg */}
                <mesh position={[pos[0], pos[1] - 0.22, pos[2] + 0.02]} castShadow>
                    <cylinderGeometry args={[0.03, 0.025, 0.2, 5]} />
                    <meshStandardMaterial color={color} roughness={0.7} />
                </mesh>
                {/* Hoof */}
                <mesh position={[pos[0], pos[1] - 0.33, pos[2] + 0.02]}>
                    <sphereGeometry args={[0.025]} />
                    <meshStandardMaterial color="#3a2a1a" roughness={0.8} />
                </mesh>
            </group>
        ))}
        {/* Hind legs - upper (thicker) */}
        {[[-0.13, 0.38, -0.25], [0.13, 0.38, -0.25]].map((pos, i) => (
            <group key={`hl-${i}`}>
                <mesh position={[pos[0], pos[1], pos[2]]} castShadow>
                    <cylinderGeometry args={[0.05, 0.04, 0.28, 5]} />
                    <meshStandardMaterial color={color} roughness={0.7} />
                </mesh>
                {/* Lower leg */}
                <mesh position={[pos[0], pos[1] - 0.25, pos[2] - 0.02]} castShadow>
                    <cylinderGeometry args={[0.035, 0.025, 0.22, 5]} />
                    <meshStandardMaterial color={color} roughness={0.7} />
                </mesh>
                {/* Hoof */}
                <mesh position={[pos[0], pos[1] - 0.37, pos[2] - 0.02]}>
                    <sphereGeometry args={[0.025]} />
                    <meshStandardMaterial color="#3a2a1a" roughness={0.8} />
                </mesh>
            </group>
        ))}
        {/* Antlers - left */}
        <group position={[-0.08, 1.0, 0.45]}>
            {/* Main branch */}
            <mesh rotation={[0.3, 0, -0.4]}>
                <cylinderGeometry args={[0.015, 0.01, 0.2, 4]} />
                <meshStandardMaterial color="#5C4033" roughness={0.8} />
            </mesh>
            {/* Fork 1 */}
            <mesh position={[-0.06, 0.1, 0]} rotation={[0.2, 0, -0.8]}>
                <cylinderGeometry args={[0.01, 0.006, 0.12, 4]} />
                <meshStandardMaterial color="#5C4033" roughness={0.8} />
            </mesh>
            {/* Fork 2 */}
            <mesh position={[-0.1, 0.15, 0.02]} rotation={[0.1, 0.2, -1.0]}>
                <cylinderGeometry args={[0.008, 0.005, 0.1, 4]} />
                <meshStandardMaterial color="#5C4033" roughness={0.8} />
            </mesh>
        </group>
        {/* Antlers - right */}
        <group position={[0.08, 1.0, 0.45]}>
            <mesh rotation={[0.3, 0, 0.4]}>
                <cylinderGeometry args={[0.015, 0.01, 0.2, 4]} />
                <meshStandardMaterial color="#5C4033" roughness={0.8} />
            </mesh>
            <mesh position={[0.06, 0.1, 0]} rotation={[0.2, 0, 0.8]}>
                <cylinderGeometry args={[0.01, 0.006, 0.12, 4]} />
                <meshStandardMaterial color="#5C4033" roughness={0.8} />
            </mesh>
            <mesh position={[0.1, 0.15, 0.02]} rotation={[0.1, -0.2, 1.0]}>
                <cylinderGeometry args={[0.008, 0.005, 0.1, 4]} />
                <meshStandardMaterial color="#5C4033" roughness={0.8} />
            </mesh>
        </group>
        {/* Tail */}
        <mesh position={[0, 0.6, -0.5]} rotation={[0.5, 0, 0]}>
            <coneGeometry args={[0.03, 0.08, 4]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
    </group>
);

const BirdModel = ({ color, wingAngle }: { color: string; wingAngle: number }) => (
    <group>
        {/* Body - streamlined oval */}
        <mesh castShadow scale={[0.8, 0.7, 1.2]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 0.1, 0.18]} castShadow>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        {/* Eyes */}
        <mesh position={[0.05, 0.12, 0.24]}>
            <sphereGeometry args={[0.015]} />
            <meshBasicMaterial color="black" />
        </mesh>
        <mesh position={[-0.05, 0.12, 0.24]}>
            <sphereGeometry args={[0.015]} />
            <meshBasicMaterial color="black" />
        </mesh>
        {/* Upper beak */}
        <mesh position={[0, 0.08, 0.28]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.025, 0.08, 4]} />
            <meshStandardMaterial color="#FFA500" roughness={0.5} />
        </mesh>
        {/* Lower beak */}
        <mesh position={[0, 0.06, 0.26]} rotation={[Math.PI / 2 + 0.3, 0, 0]}>
            <coneGeometry args={[0.018, 0.05, 4]} />
            <meshStandardMaterial color="#E8960C" roughness={0.5} />
        </mesh>
        {/* Left wing - at wing root, rotating */}
        <group position={[-0.1, 0.02, 0]} rotation={[0, 0, wingAngle]}>
            <mesh position={[-0.15, 0, 0]} scale={[1, 0.15, 0.6]}>
                <boxGeometry args={[0.3, 0.15, 0.2]} />
                <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
        </group>
        {/* Right wing */}
        <group position={[0.1, 0.02, 0]} rotation={[0, 0, -wingAngle]}>
            <mesh position={[0.15, 0, 0]} scale={[1, 0.15, 0.6]}>
                <boxGeometry args={[0.3, 0.15, 0.2]} />
                <meshStandardMaterial color={color} roughness={0.5} />
            </mesh>
        </group>
        {/* Tail feathers */}
        <mesh position={[0, 0.02, -0.2]} rotation={[-0.3, 0, 0]} scale={[0.6, 0.12, 1]}>
            <boxGeometry args={[0.12, 0.05, 0.12]} />
            <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[-0.03, 0.02, -0.22]} rotation={[-0.3, -0.15, 0]} scale={[0.5, 0.1, 1]}>
            <boxGeometry args={[0.08, 0.04, 0.1]} />
            <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
        <mesh position={[0.03, 0.02, -0.22]} rotation={[-0.3, 0.15, 0]} scale={[0.5, 0.1, 1]}>
            <boxGeometry args={[0.08, 0.04, 0.1]} />
            <meshStandardMaterial color={color} roughness={0.5} />
        </mesh>
    </group>
);

const RabbitModel = ({ color }: { color: string }) => (
    <group>
        {/* Body - slightly elongated */}
        <mesh position={[0, 0.13, -0.02]} castShadow scale={[1, 0.9, 1.2]}>
            <sphereGeometry args={[0.18, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Head - larger, positioned higher and forward */}
        <mesh position={[0, 0.28, 0.16]} castShadow>
            <sphereGeometry args={[0.13, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Nose - tiny pink sphere */}
        <mesh position={[0, 0.26, 0.28]}>
            <sphereGeometry args={[0.015]} />
            <meshStandardMaterial color="#ffaaaa" roughness={0.5} />
        </mesh>
        {/* Left ear - longer with inner pink */}
        <group position={[-0.05, 0.42, 0.13]} rotation={[0.1, 0, -0.15]}>
            <mesh>
                <capsuleGeometry args={[0.025, 0.18, 4, 8]} />
                <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
            {/* Inner ear pink */}
            <mesh position={[0, 0, 0.005]} scale={[0.6, 0.85, 0.3]}>
                <capsuleGeometry args={[0.025, 0.15, 4, 8]} />
                <meshStandardMaterial color="#ffb8b8" roughness={0.5} />
            </mesh>
        </group>
        {/* Right ear */}
        <group position={[0.05, 0.42, 0.13]} rotation={[0.1, 0, 0.15]}>
            <mesh>
                <capsuleGeometry args={[0.025, 0.18, 4, 8]} />
                <meshStandardMaterial color={color} roughness={0.7} />
            </mesh>
            <mesh position={[0, 0, 0.005]} scale={[0.6, 0.85, 0.3]}>
                <capsuleGeometry args={[0.025, 0.15, 4, 8]} />
                <meshStandardMaterial color="#ffb8b8" roughness={0.5} />
            </mesh>
        </group>
        {/* Front paws - small spheres tucked under */}
        <mesh position={[-0.06, 0.03, 0.12]}>
            <sphereGeometry args={[0.03]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0.06, 0.03, 0.12]}>
            <sphereGeometry args={[0.03]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Hind legs - larger/thicker */}
        <mesh position={[-0.08, 0.06, -0.12]} castShadow scale={[1, 1.2, 0.8]}>
            <sphereGeometry args={[0.06]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0.08, 0.06, -0.12]} castShadow scale={[1, 1.2, 0.8]}>
            <sphereGeometry args={[0.06]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Hind feet */}
        <mesh position={[-0.09, 0.02, -0.06]} scale={[0.6, 0.3, 1.2]}>
            <sphereGeometry args={[0.04]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        <mesh position={[0.09, 0.02, -0.06]} scale={[0.6, 0.3, 1.2]}>
            <sphereGeometry args={[0.04]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Fluffy tail */}
        <mesh position={[0, 0.16, -0.22]}>
            <sphereGeometry args={[0.07]} />
            <meshStandardMaterial color="white" roughness={0.7} />
        </mesh>
        {/* Eyes */}
        <mesh position={[0.07, 0.31, 0.25]}>
            <sphereGeometry args={[0.02]} />
            <meshBasicMaterial color="black" />
        </mesh>
        <mesh position={[-0.07, 0.31, 0.25]}>
            <sphereGeometry args={[0.02]} />
            <meshBasicMaterial color="black" />
        </mesh>
    </group>
);

const WolfModel = ({ color }: { color: string }) => (
    <group>
        {/* Body - muscular, elongated */}
        <mesh position={[0, 0.45, 0]} castShadow scale={[0.32, 0.28, 0.55]}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Chest - slightly bigger front */}
        <mesh position={[0, 0.48, 0.2]} castShadow scale={[0.28, 0.25, 0.2]}>
            <sphereGeometry args={[1, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Neck */}
        <mesh position={[0, 0.58, 0.35]} rotation={[-0.6, 0, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.12, 0.25, 6]} />
            <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Head - angular, wolf-like */}
        <mesh position={[0, 0.68, 0.48]} castShadow scale={[0.9, 0.8, 1.1]}>
            <sphereGeometry args={[0.13, 8, 8]} />
            <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Snout - longer than deer */}
        <mesh position={[0, 0.64, 0.63]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.06, 0.15, 5]} />
            <meshStandardMaterial color={color} roughness={0.7} />
        </mesh>
        {/* Nose */}
        <mesh position={[0, 0.64, 0.71]}>
            <sphereGeometry args={[0.025]} />
            <meshStandardMaterial color="#222222" roughness={0.5} />
        </mesh>
        {/* Eyes - yellow/amber, menacing */}
        <mesh position={[0.08, 0.72, 0.55]}>
            <sphereGeometry args={[0.02]} />
            <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[-0.08, 0.72, 0.55]}>
            <sphereGeometry args={[0.02]} />
            <meshStandardMaterial color="#FFD700" emissive="#FFD700" emissiveIntensity={0.3} />
        </mesh>
        {/* Ears - pointy, upright */}
        <mesh position={[-0.08, 0.82, 0.45]} rotation={[0.3, -0.2, -0.2]}>
            <coneGeometry args={[0.04, 0.12, 4]} />
            <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        <mesh position={[0.08, 0.82, 0.45]} rotation={[0.3, 0.2, 0.2]}>
            <coneGeometry args={[0.04, 0.12, 4]} />
            <meshStandardMaterial color={color} roughness={0.8} />
        </mesh>
        {/* Front legs */}
        {[[-0.12, 0.25, 0.2], [0.12, 0.25, 0.2]].map((pos, i) => (
            <group key={`wfl-${i}`}>
                <mesh position={[pos[0], pos[1], pos[2]]} castShadow>
                    <cylinderGeometry args={[0.04, 0.035, 0.3, 5]} />
                    <meshStandardMaterial color={color} roughness={0.8} />
                </mesh>
                <mesh position={[pos[0], pos[1] - 0.25, pos[2]]}>
                    <cylinderGeometry args={[0.03, 0.025, 0.2, 5]} />
                    <meshStandardMaterial color={color} roughness={0.8} />
                </mesh>
                <mesh position={[pos[0], pos[1] - 0.36, pos[2]]}>
                    <sphereGeometry args={[0.03]} />
                    <meshStandardMaterial color="#333333" roughness={0.8} />
                </mesh>
            </group>
        ))}
        {/* Hind legs */}
        {[[-0.13, 0.28, -0.25], [0.13, 0.28, -0.25]].map((pos, i) => (
            <group key={`whl-${i}`}>
                <mesh position={[pos[0], pos[1], pos[2]]} castShadow>
                    <cylinderGeometry args={[0.05, 0.04, 0.32, 5]} />
                    <meshStandardMaterial color={color} roughness={0.8} />
                </mesh>
                <mesh position={[pos[0], pos[1] - 0.27, pos[2] - 0.02]}>
                    <cylinderGeometry args={[0.035, 0.025, 0.22, 5]} />
                    <meshStandardMaterial color={color} roughness={0.8} />
                </mesh>
                <mesh position={[pos[0], pos[1] - 0.39, pos[2] - 0.02]}>
                    <sphereGeometry args={[0.03]} />
                    <meshStandardMaterial color="#333333" roughness={0.8} />
                </mesh>
            </group>
        ))}
        {/* Tail - bushy, hanging */}
        <mesh position={[0, 0.4, -0.55]} rotation={[0.8, 0, 0]} scale={[0.8, 0.8, 1.5]}>
            <capsuleGeometry args={[0.04, 0.2, 4, 8]} />
            <meshStandardMaterial color={color} roughness={0.9} />
        </mesh>
    </group>
);
