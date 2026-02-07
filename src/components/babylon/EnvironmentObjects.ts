import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";
import { getTerrainHeight } from "../../lib/terrain";
import { useStore } from "../../store";

// ── Helpers ──────────────────────────────────────────────────────────

function hexToColor3(hex: string): Color3 {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new Color3(r, g, b);
}

/**
 * Calculate night glow multiplier based on in-game time (0-24).
 * Night (18-6): 4x, Day: 1x, Dusk (17-18) & Dawn (6-7): interpolated.
 */
function getGlowMultiplier(time: number): number {
  if (time >= 18 || time < 6) {
    return 4.0;
  } else if (time >= 17 && time < 18) {
    return 1.0 + (time - 17) * 3.0; // 1 -> 4
  } else if (time >= 6 && time < 7) {
    return 4.0 - (time - 6) * 3.0; // 4 -> 1
  }
  return 1.0;
}

// ── Crystal positions ────────────────────────────────────────────────

const CRYSTAL_POSITIONS: [number, number, number][] = [
  [15, 0, -20],
  [-25, 0, 15],
  [30, 0, 30],
  [-10, 0, -35],
];

// ── Monolith positions ───────────────────────────────────────────────

const MONOLITH_POSITIONS: [number, number, number][] = [
  [-15, 0, 25],
  [35, 0, -15],
];

// ── Data Tower positions ─────────────────────────────────────────────

const DATA_TOWER_POSITIONS: [number, number, number][] = [
  [40, 0, 10],
  [-30, 0, -30],
];

// ── Mountain definitions ─────────────────────────────────────────────

interface MountainDef {
  position: [number, number, number];
  radius: number;
  height: number;
  segments: number;
  color: string;
  rotation: [number, number, number];
}

const MOUNTAIN_DEFS: MountainDef[] = [
  { position: [0, -2, -80], radius: 40, height: 30, segments: 6, color: "#555555", rotation: [0, Math.PI / 4, 0] },
  { position: [-60, -5, -60], radius: 50, height: 40, segments: 5, color: "#444444", rotation: [0.1, 0, 0.2] },
  { position: [70, -10, -50], radius: 60, height: 50, segments: 4, color: "#666666", rotation: [-0.1, 1, 0] },
  { position: [100, -15, 20], radius: 80, height: 60, segments: 5, color: "#333333", rotation: [0, -Math.PI / 3, 0.1] },
  { position: [-110, -20, 40], radius: 90, height: 70, segments: 7, color: "#444444", rotation: [0, Math.PI / 6, -0.1] },
  { position: [0, -10, 100], radius: 70, height: 45, segments: 6, color: "#555555", rotation: [0, Math.PI, 0] },
];

// ── Main export ──────────────────────────────────────────────────────

export function createEnvironmentObjects(scene: Scene) {
  // Track animated entities for the render loop
  const crystalData: {
    mesh: ReturnType<typeof MeshBuilder.CreatePolyhedron>;
    material: StandardMaterial;
    light: PointLight;
  }[] = [];

  // ────────────────────────────────────────────────────────────────────
  // 1. Glowing Crystals
  // ────────────────────────────────────────────────────────────────────

  CRYSTAL_POSITIONS.forEach((pos, i) => {
    const [x, , z] = pos;
    const terrainY = getTerrainHeight(x, z);

    // Octahedron mesh (type 1 = octahedron)
    const crystal = MeshBuilder.CreatePolyhedron(`crystal_${i}`, { type: 1, size: 0.8 }, scene);
    crystal.position = new Vector3(x, terrainY + 0.8, z);

    // Cyan translucent material with emissive glow
    const mat = new StandardMaterial(`crystalMat_${i}`, scene);
    mat.diffuseColor = hexToColor3("#66ffff");
    mat.emissiveColor = hexToColor3("#00ffff");
    mat.specularColor = new Color3(1, 1, 1);
    mat.specularPower = 16; // high specular (metalness equivalent)
    mat.alpha = 0.8;
    mat.backFaceCulling = false;
    crystal.material = mat;

    // Point light per crystal
    const light = new PointLight(`crystalLight_${i}`, crystal.position.clone(), scene);
    light.diffuse = hexToColor3("#00ffff");
    light.specular = hexToColor3("#00ffff");
    light.range = 3;
    light.intensity = 2;

    crystalData.push({ mesh: crystal, material: mat, light });
  });

  // ────────────────────────────────────────────────────────────────────
  // 2. Monoliths
  // ────────────────────────────────────────────────────────────────────

  MONOLITH_POSITIONS.forEach((pos, i) => {
    const [x, , z] = pos;
    const terrainY = getTerrainHeight(x, z);

    const monolith = MeshBuilder.CreateBox(`monolith_${i}`, { width: 1, height: 3, depth: 0.4 }, scene);
    monolith.position = new Vector3(x, terrainY + 1.5, z);

    const mat = new StandardMaterial(`monolithMat_${i}`, scene);
    mat.diffuseColor = hexToColor3("#111111");
    mat.specularColor = new Color3(0.8, 0.8, 0.8); // high specular (metalness 0.8)
    mat.specularPower = 128; // very smooth (roughness 0.05)
    mat.backFaceCulling = false;
    monolith.material = mat;

    // Cast shadows
    monolith.receiveShadows = true;
  });

  // ────────────────────────────────────────────────────────────────────
  // 3. Data Towers
  // ────────────────────────────────────────────────────────────────────

  DATA_TOWER_POSITIONS.forEach((pos, i) => {
    const [x, , z] = pos;
    const terrainY = getTerrainHeight(x, z);

    // Base cylinder (0.5 top radius -> 0.8 bottom radius, height 1)
    const base = MeshBuilder.CreateCylinder(`towerBase_${i}`, {
      diameterTop: 1.0,    // radius 0.5
      diameterBottom: 1.6, // radius 0.8
      height: 1,
      tessellation: 8,
    }, scene);
    base.position = new Vector3(x, terrainY + 0.5, z);

    const baseMat = new StandardMaterial(`towerBaseMat_${i}`, scene);
    baseMat.diffuseColor = hexToColor3("#333333");
    base.material = baseMat;

    // Tower cylinder (radius 0.2, height 4)
    const tower = MeshBuilder.CreateCylinder(`towerShaft_${i}`, {
      diameterTop: 0.4,
      diameterBottom: 0.4,
      height: 4,
      tessellation: 8,
    }, scene);
    tower.position = new Vector3(x, terrainY + 2.0, z); // center of 4-unit height above 1-unit base

    const towerMat = new StandardMaterial(`towerShaftMat_${i}`, scene);
    towerMat.diffuseColor = hexToColor3("#444444");
    towerMat.specularColor = new Color3(0.6, 0.6, 0.6); // metallic
    towerMat.specularPower = 64;
    tower.material = towerMat;

    // Top light sphere (radius 0.3)
    const topSphere = MeshBuilder.CreateSphere(`towerTop_${i}`, { diameter: 0.6, segments: 8 }, scene);
    topSphere.position = new Vector3(x, terrainY + 4.0, z);

    const topMat = new StandardMaterial(`towerTopMat_${i}`, scene);
    topMat.diffuseColor = Color3.FromHexString("#ff8c00");
    topMat.emissiveColor = Color3.FromHexString("#ff8c00");
    topSphere.material = topMat;

    // Point light at top
    const topLight = new PointLight(`towerLight_${i}`, new Vector3(x, terrainY + 4.0, z), scene);
    topLight.diffuse = Color3.FromHexString("#ff8c00");
    topLight.specular = Color3.FromHexString("#ff8c00");
    topLight.range = 5;
    topLight.intensity = 1;
  });

  // ────────────────────────────────────────────────────────────────────
  // 4. Distant Mountains
  // ────────────────────────────────────────────────────────────────────

  MOUNTAIN_DEFS.forEach((def, i) => {
    const [px, py, pz] = def.position;
    const [rx, ry, rz] = def.rotation;

    // CreateCylinder with diameterTop=0 produces a cone
    const mountain = MeshBuilder.CreateCylinder(`mountain_${i}`, {
      diameterTop: 0,
      diameterBottom: def.radius * 2,
      height: def.height,
      tessellation: def.segments,
    }, scene);
    mountain.position = new Vector3(px, py, pz);
    mountain.rotation = new Vector3(rx, ry, rz);

    const mat = new StandardMaterial(`mountainMat_${i}`, scene);
    mat.diffuseColor = hexToColor3(def.color);
    mat.specularColor = new Color3(0, 0, 0); // matte (roughness 1.0)
    mat.specularPower = 1;
    mat.backFaceCulling = false;
    mountain.material = mat;
  });

  // ────────────────────────────────────────────────────────────────────
  // Animation loop (crystals only)
  // ────────────────────────────────────────────────────────────────────

  let startTime: number | null = null;

  scene.registerBeforeRender(() => {
    const now = performance.now() / 1000; // seconds
    if (startTime === null) startTime = now;
    const t = now - startTime;
    const dt = scene.getEngine().getDeltaTime() / 1000;

    // Read game time for night glow
    const gameTime = useStore.getState().time;
    const glowMultiplier = getGlowMultiplier(gameTime);

    for (const { mesh, material, light } of crystalData) {
      // Slow rotation
      mesh.rotation.y += dt * 0.2;

      // Emissive pulsation
      const pulse = 1.0 + Math.sin(t * 1.5) * 0.15;
      const finalMultiplier = glowMultiplier * pulse;

      // Apply emissive intensity via color scaling
      const baseEmissive = hexToColor3("#00ffff");
      const scaledIntensity = 0.5 * finalMultiplier;
      material.emissiveColor = new Color3(
        baseEmissive.r * scaledIntensity,
        baseEmissive.g * scaledIntensity,
        baseEmissive.b * scaledIntensity,
      );

      // Update light intensity and range
      light.intensity = 2 * finalMultiplier;
      light.range = 3 + glowMultiplier * 1.5; // lights reach farther at night
    }
  });
}
