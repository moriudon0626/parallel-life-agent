import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import { Physics } from "@react-three/rapier";
import { World } from "./World";
import { Robot } from "./Robot";
import { Critter } from "./Critter";
import { Crystal, Monolith, DataTower, DistantMountains } from "./EnvironmentObjects";
import { OrbitControls } from "@react-three/drei";
import { EnvironmentManager } from "./EnvironmentManager";
import { WeatherEffects } from "./WeatherEffects";
import { PostProcessing } from "./PostProcessing";
import { GrassPatches, Trees } from "./Vegetation";
import { Pond } from "./Water";
import { GlowingMushrooms, AlienFlowers } from "./Plants";
import { Butterflies, Fireflies, PondFish } from "./Creatures";
import { River } from "./River";
import { ResourceNodes } from "./ResourceNodes";
import { AmbientSounds } from "./AmbientSounds";
import { WildAnimal } from "./WildAnimal";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { WILD_ANIMAL_DEFS } from "../lib/wildAnimals";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

const WILD_ANIMALS = [
    { id: 'deer-1', species: 'deer' as const, position: [-18, 0.5, 18] as [number, number, number] },
    { id: 'deer-2', species: 'deer' as const, position: [22, 0.5, -15] as [number, number, number] },
    { id: 'bird-1', species: 'bird' as const, position: [5, 5, 12] as [number, number, number] },
    { id: 'bird-2', species: 'bird' as const, position: [-12, 6, -8] as [number, number, number] },
    { id: 'rabbit-1', species: 'rabbit' as const, position: [10, 0.5, 5] as [number, number, number] },
    { id: 'rabbit-2', species: 'rabbit' as const, position: [-8, 0.5, -12] as [number, number, number] },
    { id: 'rabbit-3', species: 'rabbit' as const, position: [15, 0.5, -3] as [number, number, number] },
    { id: 'wolf-1', species: 'wolf' as const, position: [-40, 0.5, 35] as [number, number, number] },
    { id: 'wolf-2', species: 'wolf' as const, position: [45, 0.5, -30] as [number, number, number] },
];

export const Experience = () => {
    const aliveCritters = useStore(useShallow(s =>
        s.critterRegistry.filter(c => c.isAlive)
    ));
    const controlsRef = useRef<OrbitControlsImpl>(null!);

    // Camera fly-to-target animation
    useFrame(() => {
        const target = useStore.getState().cameraTarget;
        if (!target || !controlsRef.current) return;

        const controls = controlsRef.current;
        const currentTarget = controls.target;
        const dest = new Vector3(target.x, target.y, target.z);
        currentTarget.lerp(dest, 0.05);

        // Also move camera position to keep a nice offset
        const cameraOffset = new Vector3(0, 8, 12);
        const desiredCamPos = dest.clone().add(cameraOffset);
        controls.object.position.lerp(desiredCamPos, 0.05);

        controls.update();

        // Check if close enough to clear target
        if (currentTarget.distanceTo(dest) < 0.5) {
            useStore.getState().setCameraTarget(null);
        }
    });

    return (
        <>
            <OrbitControls
                ref={controlsRef}
                makeDefault
                minPolarAngle={0.1}
                maxPolarAngle={Math.PI / 2 - 0.05}
                minDistance={3}
                maxDistance={80}
            />
            <EnvironmentManager />
            <WeatherEffects />

            <Physics debug={false} gravity={[0, -1.62, 0]}>
                <World />
                <DistantMountains />

                {/* Environment Objects */}
                <Crystal position={[-5, 2, -5]} />
                <Crystal position={[5, 1, 5]} />
                <Monolith position={[-3, 1.5, 6]} rotation={[0, 0.5, 0]} />
                <DataTower position={[8, 0, -8]} />

                {/* Vegetation */}
                <GrassPatches />
                <Trees />

                {/* Plants */}
                <GlowingMushrooms />
                <AlienFlowers />

                {/* Resource Nodes */}
                <ResourceNodes />

                {/* Wild Critters - dynamic from registry */}
                {aliveCritters.map(c => (
                    <Critter
                        key={c.id}
                        position={c.spawnPosition}
                        name={c.name}
                        color={c.color}
                    />
                ))}

                {/* Wild Animals */}
                {WILD_ANIMALS.map(a => (
                    <WildAnimal
                        key={a.id}
                        id={a.id}
                        def={WILD_ANIMAL_DEFS[a.species]}
                        position={a.position}
                    />
                ))}

                {/* The Agent */}
                <Robot />
            </Physics>

            {/* Water (outside physics) */}
            <Pond position={[10, -1.0, 15]} radius={5} />
            <Pond position={[-20, -1.5, -10]} radius={7} />
            <River />

            {/* Creatures (outside physics) */}
            <Butterflies />
            <Fireflies />
            <PondFish ponds={[[10, -1.0, 15], [-20, -1.5, -10]]} />

            {/* Ambient Sound Manager */}
            <AmbientSounds />

            {/* Post-processing effects */}
            <PostProcessing />
        </>
    );
};
