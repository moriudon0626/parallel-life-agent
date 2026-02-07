import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3, Quaternion, Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { useStore, createMemory } from "../../store";
import { getTerrainHeight } from "../../lib/terrain";
import {
    WILD_ANIMAL_DEFS,
    type WildAnimalDef,
    type WildAnimalSpecies,
} from "../../lib/wildAnimals";

// ─── Types ───────────────────────────────────────────────────────────────────

type AnimalState = "idle" | "wander" | "flee" | "forage" | "rest" | "chase" | "attack";

interface AnimalInstance {
    id: string;
    def: WildAnimalDef;
    rootNode: TransformNode;
    aggregate: PhysicsAggregate;
    meshes: Mesh[];
    materials: StandardMaterial[];
    state: AnimalState;
    homePos: Vector3;
    targetPos: Vector3;
    nextDecision: number;
    chaseTargetId: string | null;
    lastAttackTime: number;
    // Bird-specific
    leftWingNode: TransformNode | null;
    rightWingNode: TransformNode | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hexToColor3(hex: string): Color3 {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return new Color3(r, g, b);
}

function makeMat(name: string, scene: Scene, color: string, roughness = 0.7): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = hexToColor3(color);
    mat.specularColor = new Color3(0.1, 0.1, 0.1);
    mat.specularPower = Math.round((1 - roughness) * 128);
    return mat;
}

function makeBasicMat(name: string, scene: Scene, color: string): StandardMaterial {
    const mat = new StandardMaterial(name, scene);
    mat.diffuseColor = hexToColor3(color);
    mat.emissiveColor = hexToColor3(color);
    mat.disableLighting = true;
    return mat;
}

// ─── Model Builders ──────────────────────────────────────────────────────────

function buildDeerModel(
    id: string,
    scene: Scene,
    parent: TransformNode,
    color: string,
): { meshes: Mesh[]; materials: StandardMaterial[] } {
    const meshes: Mesh[] = [];
    const materials: StandardMaterial[] = [];

    const bodyMat = makeMat(`${id}_bodyMat`, scene, color, 0.7);
    materials.push(bodyMat);
    const hoofMat = makeMat(`${id}_hoofMat`, scene, "#3a2a1a", 0.8);
    materials.push(hoofMat);
    const antlerMat = makeMat(`${id}_antlerMat`, scene, "#5C4033", 0.8);
    materials.push(antlerMat);
    const eyeMat = makeBasicMat(`${id}_eyeMat`, scene, "#000000");
    materials.push(eyeMat);

    // Body - elongated sphere
    const body = MeshBuilder.CreateSphere(`${id}_body`, { diameter: 2, segments: 8 }, scene);
    body.scaling = new Vector3(0.28, 0.3, 0.5);
    body.position = new Vector3(0, 0.55, 0);
    body.material = bodyMat;
    body.parent = parent;
    meshes.push(body);

    // Neck
    const neck = MeshBuilder.CreateCylinder(`${id}_neck`, {
        diameterTop: 0.16, diameterBottom: 0.2, height: 0.3, tessellation: 6,
    }, scene);
    neck.position = new Vector3(0, 0.72, 0.35);
    neck.rotation = new Vector3(-0.5, 0, 0);
    neck.material = bodyMat;
    neck.parent = parent;
    meshes.push(neck);

    // Head
    const head = MeshBuilder.CreateSphere(`${id}_head`, { diameter: 0.24, segments: 8 }, scene);
    head.scaling = new Vector3(0.8, 0.8, 1.2);
    head.position = new Vector3(0, 0.85, 0.5);
    head.material = bodyMat;
    head.parent = parent;
    meshes.push(head);

    // Snout
    const snout = MeshBuilder.CreateCylinder(`${id}_snout`, {
        diameterTop: 0, diameterBottom: 0.1, height: 0.1, tessellation: 5,
    }, scene);
    snout.position = new Vector3(0, 0.82, 0.64);
    snout.rotation = new Vector3(Math.PI / 2, 0, 0);
    snout.material = bodyMat;
    snout.parent = parent;
    meshes.push(snout);

    // Eyes
    for (const sx of [-1, 1]) {
        const eye = MeshBuilder.CreateSphere(`${id}_eye_${sx}`, { diameter: 0.04, segments: 6 }, scene);
        eye.position = new Vector3(0.08 * sx, 0.88, 0.55);
        eye.material = eyeMat;
        eye.parent = parent;
        meshes.push(eye);
    }

    // Ears
    for (const sx of [-1, 1]) {
        const ear = MeshBuilder.CreateCylinder(`${id}_ear_${sx}`, {
            diameterTop: 0, diameterBottom: 0.08, height: 0.1, tessellation: 4,
        }, scene);
        ear.position = new Vector3(0.1 * sx, 0.97, 0.45);
        ear.rotation = new Vector3(0.2, 0.3 * sx, 0.4 * sx);
        ear.material = bodyMat;
        ear.parent = parent;
        meshes.push(ear);
    }

    // Front legs
    const frontLegPositions = [
        new Vector3(-0.12, 0.35, 0.25),
        new Vector3(0.12, 0.35, 0.25),
    ];
    for (let i = 0; i < frontLegPositions.length; i++) {
        const lp = frontLegPositions[i];
        // Upper
        const upper = MeshBuilder.CreateCylinder(`${id}_fl_upper_${i}`, {
            diameterTop: 0.08, diameterBottom: 0.07, height: 0.25, tessellation: 5,
        }, scene);
        upper.position = lp.clone();
        upper.material = bodyMat;
        upper.parent = parent;
        meshes.push(upper);

        // Lower
        const lower = MeshBuilder.CreateCylinder(`${id}_fl_lower_${i}`, {
            diameterTop: 0.06, diameterBottom: 0.05, height: 0.2, tessellation: 5,
        }, scene);
        lower.position = new Vector3(lp.x, lp.y - 0.22, lp.z + 0.02);
        lower.material = bodyMat;
        lower.parent = parent;
        meshes.push(lower);

        // Hoof
        const hoof = MeshBuilder.CreateSphere(`${id}_fl_hoof_${i}`, { diameter: 0.05, segments: 6 }, scene);
        hoof.position = new Vector3(lp.x, lp.y - 0.33, lp.z + 0.02);
        hoof.material = hoofMat;
        hoof.parent = parent;
        meshes.push(hoof);
    }

    // Hind legs
    const hindLegPositions = [
        new Vector3(-0.13, 0.38, -0.25),
        new Vector3(0.13, 0.38, -0.25),
    ];
    for (let i = 0; i < hindLegPositions.length; i++) {
        const lp = hindLegPositions[i];
        // Upper
        const upper = MeshBuilder.CreateCylinder(`${id}_hl_upper_${i}`, {
            diameterTop: 0.1, diameterBottom: 0.08, height: 0.28, tessellation: 5,
        }, scene);
        upper.position = lp.clone();
        upper.material = bodyMat;
        upper.parent = parent;
        meshes.push(upper);

        // Lower
        const lower = MeshBuilder.CreateCylinder(`${id}_hl_lower_${i}`, {
            diameterTop: 0.07, diameterBottom: 0.05, height: 0.22, tessellation: 5,
        }, scene);
        lower.position = new Vector3(lp.x, lp.y - 0.25, lp.z - 0.02);
        lower.material = bodyMat;
        lower.parent = parent;
        meshes.push(lower);

        // Hoof
        const hoof = MeshBuilder.CreateSphere(`${id}_hl_hoof_${i}`, { diameter: 0.05, segments: 6 }, scene);
        hoof.position = new Vector3(lp.x, lp.y - 0.37, lp.z - 0.02);
        hoof.material = hoofMat;
        hoof.parent = parent;
        meshes.push(hoof);
    }

    // Antlers - left
    const antlerL1 = MeshBuilder.CreateCylinder(`${id}_antlerL1`, {
        diameterTop: 0.02, diameterBottom: 0.03, height: 0.2, tessellation: 4,
    }, scene);
    antlerL1.position = new Vector3(-0.08, 1.0, 0.45);
    antlerL1.rotation = new Vector3(0.3, 0, -0.4);
    antlerL1.material = antlerMat;
    antlerL1.parent = parent;
    meshes.push(antlerL1);

    const antlerL2 = MeshBuilder.CreateCylinder(`${id}_antlerL2`, {
        diameterTop: 0.012, diameterBottom: 0.02, height: 0.12, tessellation: 4,
    }, scene);
    antlerL2.position = new Vector3(-0.14, 1.1, 0.45);
    antlerL2.rotation = new Vector3(0.2, 0, -0.8);
    antlerL2.material = antlerMat;
    antlerL2.parent = parent;
    meshes.push(antlerL2);

    const antlerL3 = MeshBuilder.CreateCylinder(`${id}_antlerL3`, {
        diameterTop: 0.01, diameterBottom: 0.016, height: 0.1, tessellation: 4,
    }, scene);
    antlerL3.position = new Vector3(-0.18, 1.15, 0.47);
    antlerL3.rotation = new Vector3(0.1, 0.2, -1.0);
    antlerL3.material = antlerMat;
    antlerL3.parent = parent;
    meshes.push(antlerL3);

    // Antlers - right
    const antlerR1 = MeshBuilder.CreateCylinder(`${id}_antlerR1`, {
        diameterTop: 0.02, diameterBottom: 0.03, height: 0.2, tessellation: 4,
    }, scene);
    antlerR1.position = new Vector3(0.08, 1.0, 0.45);
    antlerR1.rotation = new Vector3(0.3, 0, 0.4);
    antlerR1.material = antlerMat;
    antlerR1.parent = parent;
    meshes.push(antlerR1);

    const antlerR2 = MeshBuilder.CreateCylinder(`${id}_antlerR2`, {
        diameterTop: 0.012, diameterBottom: 0.02, height: 0.12, tessellation: 4,
    }, scene);
    antlerR2.position = new Vector3(0.14, 1.1, 0.45);
    antlerR2.rotation = new Vector3(0.2, 0, 0.8);
    antlerR2.material = antlerMat;
    antlerR2.parent = parent;
    meshes.push(antlerR2);

    const antlerR3 = MeshBuilder.CreateCylinder(`${id}_antlerR3`, {
        diameterTop: 0.01, diameterBottom: 0.016, height: 0.1, tessellation: 4,
    }, scene);
    antlerR3.position = new Vector3(0.18, 1.15, 0.47);
    antlerR3.rotation = new Vector3(0.1, -0.2, 1.0);
    antlerR3.material = antlerMat;
    antlerR3.parent = parent;
    meshes.push(antlerR3);

    // Tail
    const tail = MeshBuilder.CreateCylinder(`${id}_tail`, {
        diameterTop: 0, diameterBottom: 0.06, height: 0.08, tessellation: 4,
    }, scene);
    tail.position = new Vector3(0, 0.6, -0.5);
    tail.rotation = new Vector3(0.5, 0, 0);
    tail.material = bodyMat;
    tail.parent = parent;
    meshes.push(tail);

    return { meshes, materials };
}

function buildBirdModel(
    id: string,
    scene: Scene,
    parent: TransformNode,
    color: string,
): {
    meshes: Mesh[];
    materials: StandardMaterial[];
    leftWingNode: TransformNode;
    rightWingNode: TransformNode;
} {
    const meshes: Mesh[] = [];
    const materials: StandardMaterial[] = [];

    const bodyMat = makeMat(`${id}_bodyMat`, scene, color, 0.5);
    materials.push(bodyMat);
    const beakMat = makeMat(`${id}_beakMat`, scene, "#FFA500", 0.5);
    materials.push(beakMat);
    const beakLowerMat = makeMat(`${id}_beakLowerMat`, scene, "#E8960C", 0.5);
    materials.push(beakLowerMat);
    const eyeMat = makeBasicMat(`${id}_eyeMat`, scene, "#000000");
    materials.push(eyeMat);

    // Body - streamlined oval
    const body = MeshBuilder.CreateSphere(`${id}_body`, { diameter: 0.3, segments: 8 }, scene);
    body.scaling = new Vector3(0.8, 0.7, 1.2);
    body.position = new Vector3(0, 0, 0);
    body.material = bodyMat;
    body.parent = parent;
    meshes.push(body);

    // Head
    const head = MeshBuilder.CreateSphere(`${id}_head`, { diameter: 0.16, segments: 8 }, scene);
    head.position = new Vector3(0, 0.1, 0.18);
    head.material = bodyMat;
    head.parent = parent;
    meshes.push(head);

    // Eyes
    for (const sx of [-1, 1]) {
        const eye = MeshBuilder.CreateSphere(`${id}_eye_${sx}`, { diameter: 0.03, segments: 6 }, scene);
        eye.position = new Vector3(0.05 * sx, 0.12, 0.24);
        eye.material = eyeMat;
        eye.parent = parent;
        meshes.push(eye);
    }

    // Upper beak
    const beak = MeshBuilder.CreateCylinder(`${id}_beak`, {
        diameterTop: 0, diameterBottom: 0.05, height: 0.08, tessellation: 4,
    }, scene);
    beak.position = new Vector3(0, 0.08, 0.28);
    beak.rotation = new Vector3(Math.PI / 2, 0, 0);
    beak.material = beakMat;
    beak.parent = parent;
    meshes.push(beak);

    // Lower beak
    const beakLower = MeshBuilder.CreateCylinder(`${id}_beakLower`, {
        diameterTop: 0, diameterBottom: 0.036, height: 0.05, tessellation: 4,
    }, scene);
    beakLower.position = new Vector3(0, 0.06, 0.26);
    beakLower.rotation = new Vector3(Math.PI / 2 + 0.3, 0, 0);
    beakLower.material = beakLowerMat;
    beakLower.parent = parent;
    meshes.push(beakLower);

    // Left wing (pivot node for animation)
    const leftWingNode = new TransformNode(`${id}_leftWingPivot`, scene);
    leftWingNode.position = new Vector3(-0.1, 0.02, 0);
    leftWingNode.parent = parent;

    const leftWing = MeshBuilder.CreateBox(`${id}_leftWing`, {
        width: 0.3, height: 0.15 * 0.15, depth: 0.2 * 0.6,
    }, scene);
    leftWing.position = new Vector3(-0.15, 0, 0);
    leftWing.scaling = new Vector3(1, 1, 1);
    leftWing.material = bodyMat;
    leftWing.parent = leftWingNode;
    meshes.push(leftWing);

    // Right wing (pivot node for animation)
    const rightWingNode = new TransformNode(`${id}_rightWingPivot`, scene);
    rightWingNode.position = new Vector3(0.1, 0.02, 0);
    rightWingNode.parent = parent;

    const rightWing = MeshBuilder.CreateBox(`${id}_rightWing`, {
        width: 0.3, height: 0.15 * 0.15, depth: 0.2 * 0.6,
    }, scene);
    rightWing.position = new Vector3(0.15, 0, 0);
    rightWing.scaling = new Vector3(1, 1, 1);
    rightWing.material = bodyMat;
    rightWing.parent = rightWingNode;
    meshes.push(rightWing);

    // Tail feathers
    const tail1 = MeshBuilder.CreateBox(`${id}_tail1`, {
        width: 0.12 * 0.6, height: 0.05 * 0.12, depth: 0.12,
    }, scene);
    tail1.position = new Vector3(0, 0.02, -0.2);
    tail1.rotation = new Vector3(-0.3, 0, 0);
    tail1.material = bodyMat;
    tail1.parent = parent;
    meshes.push(tail1);

    const tail2 = MeshBuilder.CreateBox(`${id}_tail2`, {
        width: 0.08 * 0.5, height: 0.04 * 0.1, depth: 0.1,
    }, scene);
    tail2.position = new Vector3(-0.03, 0.02, -0.22);
    tail2.rotation = new Vector3(-0.3, -0.15, 0);
    tail2.material = bodyMat;
    tail2.parent = parent;
    meshes.push(tail2);

    const tail3 = MeshBuilder.CreateBox(`${id}_tail3`, {
        width: 0.08 * 0.5, height: 0.04 * 0.1, depth: 0.1,
    }, scene);
    tail3.position = new Vector3(0.03, 0.02, -0.22);
    tail3.rotation = new Vector3(-0.3, 0.15, 0);
    tail3.material = bodyMat;
    tail3.parent = parent;
    meshes.push(tail3);

    return { meshes, materials, leftWingNode, rightWingNode };
}

function buildRabbitModel(
    id: string,
    scene: Scene,
    parent: TransformNode,
    color: string,
): { meshes: Mesh[]; materials: StandardMaterial[] } {
    const meshes: Mesh[] = [];
    const materials: StandardMaterial[] = [];

    const bodyMat = makeMat(`${id}_bodyMat`, scene, color, 0.7);
    materials.push(bodyMat);
    const noseMat = makeMat(`${id}_noseMat`, scene, "#ffaaaa", 0.5);
    materials.push(noseMat);
    const innerEarMat = makeMat(`${id}_innerEarMat`, scene, "#ffb8b8", 0.5);
    materials.push(innerEarMat);
    const whiteMat = makeMat(`${id}_whiteMat`, scene, "#ffffff", 0.7);
    materials.push(whiteMat);
    const eyeMat = makeBasicMat(`${id}_eyeMat`, scene, "#000000");
    materials.push(eyeMat);

    // Body - slightly elongated
    const body = MeshBuilder.CreateSphere(`${id}_body`, { diameter: 0.36, segments: 8 }, scene);
    body.scaling = new Vector3(1, 0.9, 1.2);
    body.position = new Vector3(0, 0.13, -0.02);
    body.material = bodyMat;
    body.parent = parent;
    meshes.push(body);

    // Head
    const head = MeshBuilder.CreateSphere(`${id}_head`, { diameter: 0.26, segments: 8 }, scene);
    head.position = new Vector3(0, 0.28, 0.16);
    head.material = bodyMat;
    head.parent = parent;
    meshes.push(head);

    // Nose
    const nose = MeshBuilder.CreateSphere(`${id}_nose`, { diameter: 0.03, segments: 6 }, scene);
    nose.position = new Vector3(0, 0.26, 0.28);
    nose.material = noseMat;
    nose.parent = parent;
    meshes.push(nose);

    // Ears
    for (const sx of [-1, 1]) {
        const ear = MeshBuilder.CreateCylinder(`${id}_ear_${sx}`, {
            diameterTop: 0.03, diameterBottom: 0.05, height: 0.23, tessellation: 8,
        }, scene);
        ear.position = new Vector3(0.05 * sx, 0.42, 0.13);
        ear.rotation = new Vector3(0.1, 0, 0.15 * sx);
        ear.material = bodyMat;
        ear.parent = parent;
        meshes.push(ear);

        // Inner ear
        const innerEar = MeshBuilder.CreateCylinder(`${id}_innerEar_${sx}`, {
            diameterTop: 0.02, diameterBottom: 0.035, height: 0.18, tessellation: 8,
        }, scene);
        innerEar.position = new Vector3(0.05 * sx, 0.42, 0.135);
        innerEar.rotation = new Vector3(0.1, 0, 0.15 * sx);
        innerEar.material = innerEarMat;
        innerEar.parent = parent;
        meshes.push(innerEar);
    }

    // Front paws
    for (const sx of [-1, 1]) {
        const paw = MeshBuilder.CreateSphere(`${id}_fpaw_${sx}`, { diameter: 0.06, segments: 6 }, scene);
        paw.position = new Vector3(0.06 * sx, 0.03, 0.12);
        paw.material = bodyMat;
        paw.parent = parent;
        meshes.push(paw);
    }

    // Hind legs
    for (const sx of [-1, 1]) {
        const hindLeg = MeshBuilder.CreateSphere(`${id}_hind_${sx}`, { diameter: 0.12, segments: 6 }, scene);
        hindLeg.scaling = new Vector3(1, 1.2, 0.8);
        hindLeg.position = new Vector3(0.08 * sx, 0.06, -0.12);
        hindLeg.material = bodyMat;
        hindLeg.parent = parent;
        meshes.push(hindLeg);

        // Hind feet
        const foot = MeshBuilder.CreateSphere(`${id}_hfoot_${sx}`, { diameter: 0.08, segments: 6 }, scene);
        foot.scaling = new Vector3(0.6, 0.3, 1.2);
        foot.position = new Vector3(0.09 * sx, 0.02, -0.06);
        foot.material = bodyMat;
        foot.parent = parent;
        meshes.push(foot);
    }

    // Fluffy tail
    const tail = MeshBuilder.CreateSphere(`${id}_tail`, { diameter: 0.14, segments: 6 }, scene);
    tail.position = new Vector3(0, 0.16, -0.22);
    tail.material = whiteMat;
    tail.parent = parent;
    meshes.push(tail);

    // Eyes
    for (const sx of [-1, 1]) {
        const eye = MeshBuilder.CreateSphere(`${id}_eye_${sx}`, { diameter: 0.04, segments: 6 }, scene);
        eye.position = new Vector3(0.07 * sx, 0.31, 0.25);
        eye.material = eyeMat;
        eye.parent = parent;
        meshes.push(eye);
    }

    return { meshes, materials };
}

function buildWolfModel(
    id: string,
    scene: Scene,
    parent: TransformNode,
    color: string,
): { meshes: Mesh[]; materials: StandardMaterial[] } {
    const meshes: Mesh[] = [];
    const materials: StandardMaterial[] = [];

    const bodyMat = makeMat(`${id}_bodyMat`, scene, color, 0.8);
    materials.push(bodyMat);
    const pawMat = makeMat(`${id}_pawMat`, scene, "#333333", 0.8);
    materials.push(pawMat);
    const noseMat = makeMat(`${id}_noseMat`, scene, "#222222", 0.5);
    materials.push(noseMat);

    // Eye material with emissive amber glow
    const eyeMat = new StandardMaterial(`${id}_eyeMat`, scene);
    eyeMat.diffuseColor = hexToColor3("#FFD700");
    eyeMat.emissiveColor = new Color3(
        hexToColor3("#FFD700").r * 0.3,
        hexToColor3("#FFD700").g * 0.3,
        hexToColor3("#FFD700").b * 0.3,
    );
    eyeMat.specularColor = new Color3(0.3, 0.3, 0.3);
    materials.push(eyeMat);

    // Body - muscular, elongated
    const body = MeshBuilder.CreateSphere(`${id}_body`, { diameter: 2, segments: 8 }, scene);
    body.scaling = new Vector3(0.32, 0.28, 0.55);
    body.position = new Vector3(0, 0.45, 0);
    body.material = bodyMat;
    body.parent = parent;
    meshes.push(body);

    // Chest
    const chest = MeshBuilder.CreateSphere(`${id}_chest`, { diameter: 2, segments: 8 }, scene);
    chest.scaling = new Vector3(0.28, 0.25, 0.2);
    chest.position = new Vector3(0, 0.48, 0.2);
    chest.material = bodyMat;
    chest.parent = parent;
    meshes.push(chest);

    // Neck
    const neck = MeshBuilder.CreateCylinder(`${id}_neck`, {
        diameterTop: 0.2, diameterBottom: 0.24, height: 0.25, tessellation: 6,
    }, scene);
    neck.position = new Vector3(0, 0.58, 0.35);
    neck.rotation = new Vector3(-0.6, 0, 0);
    neck.material = bodyMat;
    neck.parent = parent;
    meshes.push(neck);

    // Head
    const head = MeshBuilder.CreateSphere(`${id}_head`, { diameter: 0.26, segments: 8 }, scene);
    head.scaling = new Vector3(0.9, 0.8, 1.1);
    head.position = new Vector3(0, 0.68, 0.48);
    head.material = bodyMat;
    head.parent = parent;
    meshes.push(head);

    // Snout
    const snout = MeshBuilder.CreateCylinder(`${id}_snout`, {
        diameterTop: 0, diameterBottom: 0.12, height: 0.15, tessellation: 5,
    }, scene);
    snout.position = new Vector3(0, 0.64, 0.63);
    snout.rotation = new Vector3(Math.PI / 2, 0, 0);
    snout.material = bodyMat;
    snout.parent = parent;
    meshes.push(snout);

    // Nose
    const nose = MeshBuilder.CreateSphere(`${id}_nose`, { diameter: 0.05, segments: 6 }, scene);
    nose.position = new Vector3(0, 0.64, 0.71);
    nose.material = noseMat;
    nose.parent = parent;
    meshes.push(nose);

    // Eyes
    for (const sx of [-1, 1]) {
        const eye = MeshBuilder.CreateSphere(`${id}_eye_${sx}`, { diameter: 0.04, segments: 6 }, scene);
        eye.position = new Vector3(0.08 * sx, 0.72, 0.55);
        eye.material = eyeMat;
        eye.parent = parent;
        meshes.push(eye);
    }

    // Ears
    for (const sx of [-1, 1]) {
        const ear = MeshBuilder.CreateCylinder(`${id}_ear_${sx}`, {
            diameterTop: 0, diameterBottom: 0.08, height: 0.12, tessellation: 4,
        }, scene);
        ear.position = new Vector3(0.08 * sx, 0.82, 0.45);
        ear.rotation = new Vector3(0.3, 0.2 * sx, 0.2 * sx);
        ear.material = bodyMat;
        ear.parent = parent;
        meshes.push(ear);
    }

    // Front legs
    const frontLegPositions = [
        new Vector3(-0.12, 0.25, 0.2),
        new Vector3(0.12, 0.25, 0.2),
    ];
    for (let i = 0; i < frontLegPositions.length; i++) {
        const lp = frontLegPositions[i];
        // Upper
        const upper = MeshBuilder.CreateCylinder(`${id}_wfl_upper_${i}`, {
            diameterTop: 0.08, diameterBottom: 0.07, height: 0.3, tessellation: 5,
        }, scene);
        upper.position = lp.clone();
        upper.material = bodyMat;
        upper.parent = parent;
        meshes.push(upper);

        // Lower
        const lower = MeshBuilder.CreateCylinder(`${id}_wfl_lower_${i}`, {
            diameterTop: 0.06, diameterBottom: 0.05, height: 0.2, tessellation: 5,
        }, scene);
        lower.position = new Vector3(lp.x, lp.y - 0.25, lp.z);
        lower.material = bodyMat;
        lower.parent = parent;
        meshes.push(lower);

        // Paw
        const paw = MeshBuilder.CreateSphere(`${id}_wfl_paw_${i}`, { diameter: 0.06, segments: 6 }, scene);
        paw.position = new Vector3(lp.x, lp.y - 0.36, lp.z);
        paw.material = pawMat;
        paw.parent = parent;
        meshes.push(paw);
    }

    // Hind legs
    const hindLegPositions = [
        new Vector3(-0.13, 0.28, -0.25),
        new Vector3(0.13, 0.28, -0.25),
    ];
    for (let i = 0; i < hindLegPositions.length; i++) {
        const lp = hindLegPositions[i];
        // Upper
        const upper = MeshBuilder.CreateCylinder(`${id}_whl_upper_${i}`, {
            diameterTop: 0.1, diameterBottom: 0.08, height: 0.32, tessellation: 5,
        }, scene);
        upper.position = lp.clone();
        upper.material = bodyMat;
        upper.parent = parent;
        meshes.push(upper);

        // Lower
        const lower = MeshBuilder.CreateCylinder(`${id}_whl_lower_${i}`, {
            diameterTop: 0.07, diameterBottom: 0.05, height: 0.22, tessellation: 5,
        }, scene);
        lower.position = new Vector3(lp.x, lp.y - 0.27, lp.z - 0.02);
        lower.material = bodyMat;
        lower.parent = parent;
        meshes.push(lower);

        // Paw
        const paw = MeshBuilder.CreateSphere(`${id}_whl_paw_${i}`, { diameter: 0.06, segments: 6 }, scene);
        paw.position = new Vector3(lp.x, lp.y - 0.39, lp.z - 0.02);
        paw.material = pawMat;
        paw.parent = parent;
        meshes.push(paw);
    }

    // Tail - bushy, hanging
    const tail = MeshBuilder.CreateCylinder(`${id}_tail`, {
        diameterTop: 0.05, diameterBottom: 0.08, height: 0.28, tessellation: 8,
    }, scene);
    tail.position = new Vector3(0, 0.4, -0.55);
    tail.rotation = new Vector3(0.8, 0, 0);
    tail.scaling = new Vector3(0.8, 1.5, 0.8);
    tail.material = bodyMat;
    tail.parent = parent;
    meshes.push(tail);

    return { meshes, materials };
}

// ─── Spawn layout ────────────────────────────────────────────────────────────

interface SpawnDef {
    species: WildAnimalSpecies;
    position: [number, number, number];
}

function generateSpawns(): SpawnDef[] {
    const spawns: SpawnDef[] = [];

    // 2 deer at random positions within [-40, 40]
    for (let i = 0; i < 2; i++) {
        spawns.push({
            species: "deer",
            position: [
                (Math.random() - 0.5) * 80,
                0.5,
                (Math.random() - 0.5) * 80,
            ],
        });
    }

    // 3 rabbits at random positions within [-30, 30]
    for (let i = 0; i < 3; i++) {
        spawns.push({
            species: "rabbit",
            position: [
                (Math.random() - 0.5) * 60,
                0.5,
                (Math.random() - 0.5) * 60,
            ],
        });
    }

    // 2 birds at random positions, flight height 3-8
    for (let i = 0; i < 2; i++) {
        const flightH = 3 + Math.random() * 5;
        spawns.push({
            species: "bird",
            position: [
                (Math.random() - 0.5) * 80,
                flightH,
                (Math.random() - 0.5) * 80,
            ],
        });
    }

    // 1 wolf at a far corner position
    const corners = [
        [35, 0.5, 35],
        [-35, 0.5, 35],
        [35, 0.5, -35],
        [-35, 0.5, -35],
    ] as [number, number, number][];
    const cornerIdx = Math.floor(Math.random() * corners.length);
    spawns.push({
        species: "wolf",
        position: corners[cornerIdx],
    });

    return spawns;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export function createWildAnimals(scene: Scene): { dispose: () => void } {
    const animals: AnimalInstance[] = [];
    const spawns = generateSpawns();

    // ─ Create each animal ────────────────────────────────────────────────────

    for (let si = 0; si < spawns.length; si++) {
        const spawn = spawns[si];
        const def = WILD_ANIMAL_DEFS[spawn.species];
        const id = `${spawn.species}-${si}`;

        // Root TransformNode
        const rootNode = new TransformNode(`${id}_root`, scene);
        const startY = def.flightHeight
            ? spawn.position[1]
            : getTerrainHeight(spawn.position[0], spawn.position[2]) + 0.5;
        rootNode.position = new Vector3(spawn.position[0], startY, spawn.position[2]);

        // Model group (scaled by def.scale)
        const modelGroup = new TransformNode(`${id}_model`, scene);
        modelGroup.scaling = new Vector3(def.scale, def.scale, def.scale);
        modelGroup.parent = rootNode;

        let allMeshes: Mesh[] = [];
        let allMaterials: StandardMaterial[] = [];
        let leftWingNode: TransformNode | null = null;
        let rightWingNode: TransformNode | null = null;

        switch (spawn.species) {
            case "deer": {
                const result = buildDeerModel(id, scene, modelGroup, def.color);
                allMeshes = result.meshes;
                allMaterials = result.materials;
                break;
            }
            case "bird": {
                const result = buildBirdModel(id, scene, modelGroup, def.color);
                allMeshes = result.meshes;
                allMaterials = result.materials;
                leftWingNode = result.leftWingNode;
                rightWingNode = result.rightWingNode;
                break;
            }
            case "rabbit": {
                const result = buildRabbitModel(id, scene, modelGroup, def.color);
                allMeshes = result.meshes;
                allMaterials = result.materials;
                break;
            }
            case "wolf": {
                const result = buildWolfModel(id, scene, modelGroup, def.color);
                allMeshes = result.meshes;
                allMaterials = result.materials;
                break;
            }
        }

        // Physics aggregate on rootNode
        const aggregate = new PhysicsAggregate(
            rootNode,
            PhysicsShapeType.SPHERE,
            { mass: 0.5, restitution: 0.1, friction: 0.5 },
            scene,
        );
        aggregate.body.setLinearDamping(def.flightHeight ? 2 : 0.5);
        aggregate.body.setAngularDamping(5);

        // Birds: zero gravity
        if (def.flightHeight) {
            aggregate.body.setGravityFactor(0);
        }

        animals.push({
            id,
            def,
            rootNode,
            aggregate,
            meshes: allMeshes,
            materials: allMaterials,
            state: "idle",
            homePos: new Vector3(spawn.position[0], startY, spawn.position[2]),
            targetPos: new Vector3(spawn.position[0], startY, spawn.position[2]),
            nextDecision: Math.random() * 3,
            chaseTargetId: null,
            lastAttackTime: 0,
            leftWingNode,
            rightWingNode,
        });
    }

    // ─ Per-frame update ──────────────────────────────────────────────────────

    let elapsed = 0;

    const updateCallback = () => {
        const dt = scene.getEngine().getDeltaTime() / 1000;
        elapsed += dt;
        const t = elapsed;

        const store = useStore.getState();
        const positions = store.entityPositions;

        for (const animal of animals) {
            const { def, rootNode: node, aggregate: agg, id: animalId } = animal;

            const currentPos = node.position.clone();

            // Safety reset - fallen below world
            if (currentPos.y < -5) {
                agg.body.disablePreStep = false;
                node.position = new Vector3(
                    animal.homePos.x,
                    animal.homePos.y + 5,
                    animal.homePos.z,
                );
                agg.body.setLinearVelocity(Vector3.Zero());
                continue;
            }

            // ── Aggressive (wolf) behavior ───────────────────────────────

            if (def.aggressive && def.chaseDistance && def.attackRange && def.attackDamage) {
                let nearestPreyId: string | null = null;
                let nearestPreyDist = Infinity;
                let nearestPreyPos: { x: number; z: number } | null = null;

                for (const [entityId, pos] of Object.entries(positions)) {
                    if (entityId === animalId) continue;
                    if (entityId.startsWith("wolf-")) continue;
                    if (entityId === "robot") continue;

                    const isCritter = entityId.startsWith("Critter-");
                    const isRabbit = entityId.startsWith("rabbit-");
                    const isDeer = entityId.startsWith("deer-");
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
                        // Attack
                        animal.state = "attack";
                        animal.chaseTargetId = nearestPreyId;
                        const vel = agg.body.getLinearVelocity();
                        agg.body.setLinearVelocity(new Vector3(0, vel.y, 0));

                        // Deal damage (throttled to every 2 seconds)
                        if (t - animal.lastAttackTime > 2.0) {
                            animal.lastAttackTime = t;

                            if (nearestPreyId.startsWith("Critter-")) {
                                const lifecycle = store.entityLifecycles[nearestPreyId];
                                if (lifecycle && lifecycle.healthStatus !== "dead") {
                                    const newHealth = Math.max(0, lifecycle.health - def.attackDamage);
                                    store.updateEntityLifecycle(nearestPreyId, {
                                        ...lifecycle,
                                        health: newHealth,
                                        healthStatus:
                                            newHealth <= 0
                                                ? "dead"
                                                : newHealth < 0.2
                                                  ? "dying"
                                                  : lifecycle.healthStatus,
                                    });

                                    // Add memory for critter
                                    store.addCritterMemory(
                                        nearestPreyId,
                                        createMemory(
                                            "狼に攻撃された！痛い！",
                                            "event",
                                            [animalId, nearestPreyId],
                                            0.9,
                                            0.8,
                                        ),
                                    );

                                    // Add memory for robot if nearby
                                    const robotPos = positions["robot"];
                                    if (robotPos) {
                                        const robotDist = Math.sqrt(
                                            (robotPos.x - currentPos.x) ** 2 +
                                                (robotPos.z - currentPos.z) ** 2,
                                        );
                                        if (robotDist < 30) {
                                            store.addRobotMemory(
                                                createMemory(
                                                    `狼が${nearestPreyId}を攻撃している`,
                                                    "event",
                                                    [animalId, nearestPreyId],
                                                    0.7,
                                                ),
                                            );
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        // Chase
                        animal.state = "chase";
                        animal.chaseTargetId = nearestPreyId;
                        animal.targetPos.set(nearestPreyPos.x, 0.5, nearestPreyPos.z);
                    }
                } else {
                    animal.chaseTargetId = null;
                    // Normal wander behavior
                    if (t > animal.nextDecision) {
                        const roll = Math.random();
                        if (roll < 0.3) {
                            animal.state = "idle";
                            animal.nextDecision = t + 3 + Math.random() * 5;
                        } else if (roll < 0.7) {
                            animal.state = "wander";
                            const r = def.wanderRadius;
                            animal.targetPos.set(
                                animal.homePos.x + (Math.random() - 0.5) * r * 2,
                                0.5,
                                animal.homePos.z + (Math.random() - 0.5) * r * 2,
                            );
                            animal.nextDecision = t + 5 + Math.random() * 8;
                        } else {
                            animal.state = "rest";
                            animal.nextDecision = t + 8 + Math.random() * 12;
                        }
                    }
                }
            } else {
                // ── Non-aggressive (deer, rabbit, bird) behavior ─────────

                let nearestThreatDist = Infinity;
                const threatDir = new Vector3(0, 0, 0);

                for (const [entityId, pos] of Object.entries(positions)) {
                    if (entityId === animalId) continue;

                    const isWolf = entityId.startsWith("wolf-");
                    const dx = pos.x - currentPos.x;
                    const dz = pos.z - currentPos.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    // Flee from wolves at 1.5x distance
                    const fleeDist = isWolf ? def.fleeDistance * 1.5 : def.fleeDistance;
                    if (dist < fleeDist && dist < nearestThreatDist) {
                        nearestThreatDist = dist;
                        const len = Math.sqrt(dx * dx + dz * dz) || 1;
                        threatDir.set(-dx / len, 0, -dz / len);
                    }
                }

                // State machine
                if (nearestThreatDist < def.fleeDistance * 1.5) {
                    animal.state = "flee";
                    animal.targetPos.set(
                        currentPos.x + threatDir.x * 15,
                        def.flightHeight ? def.flightHeight[1] : 0.5,
                        currentPos.z + threatDir.z * 15,
                    );
                } else if (t > animal.nextDecision) {
                    const roll = Math.random();
                    if (roll < 0.3) {
                        animal.state = "idle";
                        animal.nextDecision = t + 3 + Math.random() * 5;
                    } else if (roll < 0.7) {
                        animal.state = "wander";
                        const r = def.wanderRadius;
                        animal.targetPos.set(
                            animal.homePos.x + (Math.random() - 0.5) * r * 2,
                            def.flightHeight
                                ? def.flightHeight[0] +
                                      Math.random() * (def.flightHeight[1] - def.flightHeight[0])
                                : 0.5,
                            animal.homePos.z + (Math.random() - 0.5) * r * 2,
                        );
                        animal.nextDecision = t + 5 + Math.random() * 8;
                    } else {
                        animal.state = "rest";
                        animal.nextDecision = t + 8 + Math.random() * 12;
                    }
                }
            }

            // ── Movement ─────────────────────────────────────────────────

            const aState = animal.state;

            if (aState === "idle" || aState === "rest" || aState === "attack") {
                const vel = agg.body.getLinearVelocity();
                agg.body.setLinearVelocity(new Vector3(0, vel.y, 0));
            } else {
                const dir = animal.targetPos.subtract(currentPos).normalize();
                const speed =
                    aState === "flee" || aState === "chase" ? def.speed * 1.5 : def.speed;
                const dist = Vector3.Distance(currentPos, animal.targetPos);

                if (dist < 1.0 && aState !== "chase") {
                    animal.state = "idle";
                    animal.nextDecision = t + 2 + Math.random() * 3;
                    const vel = agg.body.getLinearVelocity();
                    agg.body.setLinearVelocity(new Vector3(0, vel.y, 0));
                } else {
                    if (def.flightHeight) {
                        // Flying animal - full 3D velocity
                        agg.body.setLinearVelocity(
                            new Vector3(dir.x * speed, dir.y * speed * 0.3, dir.z * speed),
                        );
                    } else if (def.species === "rabbit") {
                        // Hopping movement
                        const vel = agg.body.getLinearVelocity();
                        agg.body.setLinearVelocity(
                            new Vector3(dir.x * speed, vel.y, dir.z * speed),
                        );
                        // Occasional hop impulse
                        if (Math.random() < 0.03) {
                            agg.body.setLinearVelocity(
                                new Vector3(dir.x * speed, vel.y + 2.0, dir.z * speed),
                            );
                        }
                    } else {
                        const vel = agg.body.getLinearVelocity();
                        agg.body.setLinearVelocity(
                            new Vector3(dir.x * speed, vel.y, dir.z * speed),
                        );
                    }

                    // Rotation - face movement direction
                    const angle = Math.atan2(dir.x, dir.z);
                    const targetQ = Quaternion.FromEulerAngles(0, angle, 0);
                    if (node.rotationQuaternion) {
                        Quaternion.SlerpToRef(
                            node.rotationQuaternion,
                            targetQ,
                            0.1,
                            node.rotationQuaternion,
                        );
                    } else {
                        node.rotationQuaternion = Quaternion.Slerp(
                            Quaternion.Identity(),
                            targetQ,
                            0.1,
                        );
                    }
                }
            }

            // ── Wing animation for birds ─────────────────────────────────

            if (def.species === "bird" && animal.leftWingNode && animal.rightWingNode) {
                const wingAngle = Math.sin(t * 8) * 0.5;
                animal.leftWingNode.rotation.z = wingAngle;
                animal.rightWingNode.rotation.z = -wingAngle;
            }

            // ── Terrain height correction for ground animals ─────────────

            if (!def.flightHeight) {
                const terrainY = getTerrainHeight(currentPos.x, currentPos.z);
                const correctedY = terrainY + 0.5;
                if (currentPos.y < correctedY - 0.5 || currentPos.y > correctedY + 2.0) {
                    agg.body.disablePreStep = false;
                    node.position = new Vector3(currentPos.x, correctedY + 0.5, currentPos.z);
                }
            }

            // ── Position reporting ───────────────────────────────────────

            store.updateEntityPosition(animalId, currentPos.x, currentPos.z);
        }
    };

    scene.registerBeforeRender(updateCallback);

    // ─ Dispose ───────────────────────────────────────────────────────────────

    function dispose() {
        // Unregister the render callback
        scene.unregisterBeforeRender(updateCallback);

        for (const animal of animals) {
            // Dispose physics
            animal.aggregate.dispose();

            // Dispose materials
            for (const mat of animal.materials) {
                mat.dispose();
            }

            // Dispose meshes
            for (const mesh of animal.meshes) {
                mesh.dispose();
            }

            // Dispose wing nodes (bird-specific)
            if (animal.leftWingNode) {
                animal.leftWingNode.dispose();
            }
            if (animal.rightWingNode) {
                animal.rightWingNode.dispose();
            }

            // Dispose model group and root node
            // model group is the child of rootNode
            const modelGroup = animal.rootNode.getChildren()[0];
            if (modelGroup) {
                modelGroup.dispose();
            }
            animal.rootNode.dispose();

            // Remove entity position from store
            const state = useStore.getState();
            const newPositions = { ...state.entityPositions };
            delete newPositions[animal.id];
            useStore.setState({ entityPositions: newPositions });
        }

        animals.length = 0;
    }

    return { dispose };
}
