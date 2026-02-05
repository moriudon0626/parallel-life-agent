import { Physics } from "@react-three/rapier";
import { World } from "./World";
import { Robot } from "./Robot";
import { Critter } from "./Critter";
import { Crystal, Monolith, DataTower } from "./EnvironmentObjects";
import { OrbitControls } from "@react-three/drei";

export const Experience = () => {
    return (
        <>
            <OrbitControls makeDefault />

            <Physics debug={false} gravity={[0, -9.81, 0]}>
                <World />

                {/* Environment Objects */}
                <Crystal position={[-5, 2, -5]} />
                <Crystal position={[5, 1, 5]} />
                <Monolith position={[-3, 1.5, 6]} rotation={[0, 0.5, 0]} />
                <DataTower position={[8, 0, -8]} />

                {/* Wild Critters - stay near their spawn points */}
                <Critter position={[3, 0.5, 3]} name="Critter Alpha" />
                <Critter position={[-4, 0.5, 2]} name="Critter Beta" />
                <Critter position={[0, 0.5, -5]} name="Critter Gamma" />

                {/* The Agent */}
                <Robot />
            </Physics>
        </>
    );
};
