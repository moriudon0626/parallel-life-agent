import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3, Color3, Quaternion } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { useStore } from "../../store";

// ---------------------------------------------------------------------------
// Seeded random for deterministic placement
// ---------------------------------------------------------------------------
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// ---------------------------------------------------------------------------
// HSL to Color3 helper
// ---------------------------------------------------------------------------
function hslToColor3(h: number, s: number, l: number): Color3 {
  h = ((h % 1) + 1) % 1; // normalize to [0,1)
  const hDeg = h * 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hDeg / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (hDeg < 60) { r = c; g = x; b = 0; }
  else if (hDeg < 120) { r = x; g = c; b = 0; }
  else if (hDeg < 180) { r = 0; g = c; b = x; }
  else if (hDeg < 240) { r = 0; g = x; b = c; }
  else if (hDeg < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return new Color3(r + m, g + m, b + m);
}

// ---------------------------------------------------------------------------
// Pond positions (matching existing water features)
// ---------------------------------------------------------------------------
const POND_POSITIONS: [number, number, number][] = [
  [-15, -0.5, 10],
  [20, -0.5, -15],
  [-8, -0.5, -25],
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const BUTTERFLY_COUNT = 6;
const FIREFLY_COUNT = 20;
const FISH_PER_POND = 3;
const FISH_COLORS: Color3[] = [
  Color3.FromHexString("#c0c0c0"), // silver
  Color3.FromHexString("#ffaa44"), // gold
  Color3.FromHexString("#6699cc"), // blue
];

// ===================================================================
// Main export
// ===================================================================

export function createCreatures(scene: Scene): { dispose: () => void } {
  // Tracking arrays for cleanup
  const allMeshes: Mesh[] = [];
  const allMaterials: StandardMaterial[] = [];
  const allLights: PointLight[] = [];

  // Elapsed time tracker
  let startTime: number | null = null;

  // ================================================================
  // 1. Butterflies (6 instances, day-only 6:00-18:00)
  // ================================================================

  interface ButterflyParams {
    cx: number;
    cz: number;
    cy: number;
    radiusX: number;
    radiusZ: number;
    speed: number;
    phase: number;
    yAmplitude: number;
    ySpeed: number;
    color: Color3;
  }

  const butterflyParams: ButterflyParams[] = [];
  const butterflyMeshes: Mesh[] = [];

  {
    const rand = seededRandom(11111);
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const params: ButterflyParams = {
        cx: (rand() - 0.5) * 30,
        cz: (rand() - 0.5) * 30,
        cy: 1.0 + rand() * 2.0,
        radiusX: 1.5 + rand() * 3,
        radiusZ: 1.5 + rand() * 3,
        speed: 0.5 + rand() * 1.0,
        phase: rand() * Math.PI * 2,
        yAmplitude: 0.3 + rand() * 0.5,
        ySpeed: 1.0 + rand() * 1.5,
        color: hslToColor3(rand(), 0.8, 0.6),
      };
      butterflyParams.push(params);

      // Small flat plane for wing shape
      const mesh = MeshBuilder.CreatePlane(`butterfly_${i}`, { size: 0.15 }, scene);
      mesh.isPickable = false;

      const mat = new StandardMaterial(`butterflyMat_${i}`, scene);
      mat.diffuseColor = params.color;
      mat.specularColor = new Color3(0.1, 0.1, 0.1);
      mat.specularPower = 16;
      mat.backFaceCulling = false;
      mat.alpha = 0.9;
      mesh.material = mat;

      butterflyMeshes.push(mesh);
      allMeshes.push(mesh);
      allMaterials.push(mat);
    }
  }

  // ================================================================
  // 2. Fireflies (20 instances, night-only 18:00-6:00)
  // ================================================================

  interface FireflyParams {
    cx: number;
    cz: number;
    cy: number;
    driftRadius: number;
    speed: number;
    phase: number;
    blinkSpeed: number;
    blinkPhase: number;
  }

  const fireflyParams: FireflyParams[] = [];
  const fireflyMeshes: Mesh[] = [];
  const fireflyLights: PointLight[] = [];

  {
    const rand = seededRandom(22222);
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const params: FireflyParams = {
        cx: (rand() - 0.5) * 40,
        cz: (rand() - 0.5) * 40,
        cy: 0.5 + rand() * 2.5,
        driftRadius: 1.0 + rand() * 3.0,
        speed: 0.2 + rand() * 0.5,
        phase: rand() * Math.PI * 2,
        blinkSpeed: 1.0 + rand() * 2.0,
        blinkPhase: rand() * Math.PI * 2,
      };
      fireflyParams.push(params);

      // Small glowing sphere
      const mesh = MeshBuilder.CreateSphere(`firefly_${i}`, { diameter: 0.06, segments: 6 }, scene);
      mesh.isPickable = false;

      const mat = new StandardMaterial(`fireflyMat_${i}`, scene);
      mat.emissiveColor = new Color3(0.67, 1, 0.27); // #aaff44
      mat.disableLighting = true;
      mesh.material = mat;

      fireflyMeshes.push(mesh);
      allMeshes.push(mesh);
      allMaterials.push(mat);
    }

    // 3 representative point lights following the first 3 fireflies
    for (let i = 0; i < 3; i++) {
      const light = new PointLight(`fireflyLight_${i}`, Vector3.Zero(), scene);
      light.diffuse = new Color3(0.67, 1, 0.27); // #aaff44
      light.specular = new Color3(0.67, 1, 0.27);
      light.range = 8;
      light.intensity = 0;
      fireflyLights.push(light);
      allLights.push(light);
    }
  }

  // ================================================================
  // 3. Pond Fish (3 per pond)
  // ================================================================

  interface FishData {
    pondIndex: number;
    angle: number;
    speed: number;
    radius: number;
    depth: number;
    phase: number;
    jumpPhase: number;
    jumpInterval: number;
  }

  const fishData: FishData[] = [];
  const fishMeshes: Mesh[] = [];
  const totalFish = POND_POSITIONS.length * FISH_PER_POND;

  {
    const rand = seededRandom(33333);
    const colorRand = seededRandom(33334);

    for (let p = 0; p < POND_POSITIONS.length; p++) {
      for (let f = 0; f < FISH_PER_POND; f++) {
        const data: FishData = {
          pondIndex: p,
          angle: rand() * Math.PI * 2,
          speed: 0.3 + rand() * 0.5,
          radius: 1.5 + rand() * 2.5,
          depth: -0.3 - rand() * 0.4,
          phase: rand() * Math.PI * 2,
          jumpPhase: rand() * 100,
          jumpInterval: 15 + rand() * 20, // Jump every 15-35 seconds
        };
        fishData.push(data);

        const idx = fishData.length - 1;

        // Small cone shape for fish body
        const mesh = MeshBuilder.CreateCylinder(`fish_${idx}`, {
          diameterTop: 0,
          diameterBottom: 0.15,
          height: 0.25,
          tessellation: 4,
        }, scene);
        mesh.isPickable = false;

        // Rotate so the cone points forward (default cone is along Y, we want along Z)
        // We will handle rotation in the update loop via rotationQuaternion

        const fishColor = FISH_COLORS[Math.floor(colorRand() * FISH_COLORS.length)];
        const mat = new StandardMaterial(`fishMat_${idx}`, scene);
        mat.diffuseColor = fishColor;
        mat.specularColor = new Color3(0.6, 0.6, 0.6); // metallic
        mat.specularPower = 64; // fairly smooth (roughness 0.3)
        mesh.material = mat;

        fishMeshes.push(mesh);
        allMeshes.push(mesh);
        allMaterials.push(mat);
      }
    }
  }

  // ================================================================
  // Per-frame update
  // ================================================================

  const renderCallback = () => {
    const now = performance.now() / 1000;
    if (startTime === null) startTime = now;
    const t = now - startTime;

    const gameTime = useStore.getState().time;
    const isDay = gameTime >= 6 && gameTime < 18;
    const isNight = gameTime >= 18 || gameTime < 6;

    // ── Butterflies ──────────────────────────────────────────────
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const p = butterflyParams[i];
      const mesh = butterflyMeshes[i];
      const st = t * p.speed + p.phase;

      if (!isDay) {
        // Hide at night
        mesh.position.set(0, -10, 0);
        mesh.scaling.set(0, 0, 0);
      } else {
        // Figure-8 flight path
        const x = p.cx + Math.sin(st) * p.radiusX;
        const z = p.cz + Math.cos(st * 0.7) * p.radiusZ;
        const y = p.cy + Math.sin(st * p.ySpeed) * p.yAmplitude;
        mesh.position.set(x, y, z);
        mesh.scaling.set(1, 1, 1);

        // Wing flap animation via rotation
        const wingAngle = Math.sin(t * 12 + i * 2) * 0.6;
        // Use rotationQuaternion for combined rotation
        if (!mesh.rotationQuaternion) {
          mesh.rotationQuaternion = Quaternion.Identity();
        }
        mesh.rotationQuaternion = Quaternion.FromEulerAngles(wingAngle, st, 0);
      }
    }

    // ── Fireflies ────────────────────────────────────────────────
    const lightPositions: Vector3[] = [];

    for (let i = 0; i < FIREFLY_COUNT; i++) {
      const p = fireflyParams[i];
      const mesh = fireflyMeshes[i];
      const st = t * p.speed + p.phase;

      if (!isNight) {
        // Hide during day
        mesh.position.set(0, -10, 0);
        mesh.scaling.set(0, 0, 0);
      } else {
        // Drifting path with slight complexity
        const x = p.cx + Math.sin(st) * p.driftRadius + Math.sin(st * 1.3) * 0.5;
        const z = p.cz + Math.cos(st * 0.8) * p.driftRadius + Math.cos(st * 1.1) * 0.5;
        const y = p.cy + Math.sin(st * 0.6) * 0.5;
        mesh.position.set(x, y, z);

        // Blink effect via scale pulsing
        const blink = 0.5 + 0.5 * Math.sin(t * p.blinkSpeed + p.blinkPhase);
        const s = 0.04 + blink * 0.04;
        // Scale relative to base diameter (0.06), normalize: s / 0.06 * diameter
        // Mesh was created with diameter=0.06, so scaling of 1 = 0.06.
        // We want effective sizes 0.04-0.08, so scale = size / 0.03 (radius)
        const scaleFactor = s / 0.03; // 0.03 = base radius (diameter 0.06 / 2)
        mesh.scaling.set(scaleFactor, scaleFactor, scaleFactor);

        if (i < 3) {
          lightPositions.push(new Vector3(x, y, z));
        }
      }
    }

    // Update representative point lights
    const lightIntensity = isNight ? 2.0 : 0;
    for (let i = 0; i < 3; i++) {
      const light = fireflyLights[i];
      if (lightPositions[i]) {
        light.position.copyFrom(lightPositions[i]);
        light.intensity = lightIntensity * (0.5 + 0.5 * Math.sin(t * 1.5 + i));
      } else {
        light.intensity = 0;
      }
    }

    // ── Pond Fish ────────────────────────────────────────────────
    for (let i = 0; i < totalFish; i++) {
      const fish = fishData[i];
      const mesh = fishMeshes[i];
      const pond = POND_POSITIONS[fish.pondIndex];

      const angle = fish.angle + t * fish.speed;
      const x = pond[0] + Math.cos(angle) * fish.radius;
      const z = pond[2] + Math.sin(angle) * fish.radius;

      // Jump calculation
      let y = pond[1] + fish.depth;
      const jumpCycle = (t + fish.jumpPhase) % fish.jumpInterval;
      if (jumpCycle < 0.5) {
        // Brief jump arc (0.5s duration, 0.8 height)
        const jumpT = jumpCycle / 0.5;
        y += Math.sin(jumpT * Math.PI) * 0.8;
      }

      mesh.position.set(x, y, z);
      mesh.scaling.set(0.15, 0.08, 0.25);

      // Face direction of movement (tangent to circle)
      const faceAngle = angle + Math.PI / 2;
      if (!mesh.rotationQuaternion) {
        mesh.rotationQuaternion = Quaternion.Identity();
      }
      mesh.rotationQuaternion = Quaternion.FromEulerAngles(0, faceAngle, 0);
    }
  };

  scene.registerBeforeRender(renderCallback);

  // ================================================================
  // Dispose
  // ================================================================

  return {
    dispose: () => {
      scene.unregisterBeforeRender(renderCallback);

      for (const mesh of allMeshes) {
        mesh.dispose();
      }
      for (const mat of allMaterials) {
        mat.dispose();
      }
      for (const light of allLights) {
        light.dispose();
      }
    },
  };
}
