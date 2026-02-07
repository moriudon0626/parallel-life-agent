import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { useStore } from "../../store";

// ─── Constants ────────────────────────────────────────────────────────────────

const RAIN_COUNT = 1500;
const SNOW_COUNT = 1500;
const DUST_COUNT = 40;
const SPREAD = 50;
const HEIGHT = 20;

const POND_DEFS: { position: [number, number, number]; radius: number }[] = [
  { position: [-15, -0.3, 10], radius: 5 },
  { position: [20, -0.3, -15], radius: 4 },
  { position: [-8, -0.3, -25], radius: 3.5 },
];

// ─── Main Export ──────────────────────────────────────────────────────────────

export function createWeatherAndWater(scene: Scene): { dispose: () => void } {
  const allMeshes: (Mesh | LinesMesh)[] = [];
  const allMats: StandardMaterial[] = [];
  let elapsed = 0;

  // ────────────────────────────────────────────────────────────────────────────
  // 1. Rain – LineSystem with direct vertex buffer updates
  // ────────────────────────────────────────────────────────────────────────────

  // Each raindrop = 2 vertices (top, bottom of streak)
  // Store per-particle position in a flat array, update vertex buffer directly
  const rainData = new Float32Array(RAIN_COUNT * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    rainData[i * 3] = (Math.random() - 0.5) * SPREAD;
    rainData[i * 3 + 1] = Math.random() * HEIGHT;
    rainData[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
  }

  // Build initial lines array for CreateLineSystem
  const rainLines: Vector3[][] = [];
  for (let i = 0; i < RAIN_COUNT; i++) {
    const x = rainData[i * 3], y = rainData[i * 3 + 1], z = rainData[i * 3 + 2];
    rainLines.push([new Vector3(x, y, z), new Vector3(x, y - 0.3, z)]);
  }
  const rainMesh = MeshBuilder.CreateLineSystem("rain", { lines: rainLines, updatable: true }, scene);
  rainMesh.color = new Color3(0.67, 0.67, 1);
  rainMesh.alpha = 0.6;
  rainMesh.isPickable = false;
  rainMesh.setEnabled(false);
  allMeshes.push(rainMesh);

  // ────────────────────────────────────────────────────────────────────────────
  // 2. Snow – Same approach, tiny segments
  // ────────────────────────────────────────────────────────────────────────────

  const snowData = new Float32Array(SNOW_COUNT * 3);
  const snowSeeds = new Float32Array(SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) {
    snowData[i * 3] = (Math.random() - 0.5) * SPREAD;
    snowData[i * 3 + 1] = Math.random() * HEIGHT;
    snowData[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
    snowSeeds[i] = Math.random() * 10;
  }

  const snowLines: Vector3[][] = [];
  for (let i = 0; i < SNOW_COUNT; i++) {
    const x = snowData[i * 3], y = snowData[i * 3 + 1], z = snowData[i * 3 + 2];
    snowLines.push([new Vector3(x, y, z), new Vector3(x + 0.03, y + 0.03, z)]);
  }
  const snowMesh = MeshBuilder.CreateLineSystem("snow", { lines: snowLines, updatable: true }, scene);
  snowMesh.color = new Color3(1, 1, 1);
  snowMesh.alpha = 0.8;
  snowMesh.isPickable = false;
  snowMesh.setEnabled(false);
  allMeshes.push(snowMesh);

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Dust – Small floating particles (sunny daytime)
  // ────────────────────────────────────────────────────────────────────────────

  const dustData = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustData[i * 3] = (Math.random() - 0.5) * 30;
    dustData[i * 3 + 1] = 0.3 + Math.random() * 2;
    dustData[i * 3 + 2] = (Math.random() - 0.5) * 30;
  }

  const dustLines: Vector3[][] = [];
  for (let i = 0; i < DUST_COUNT; i++) {
    const x = dustData[i * 3], y = dustData[i * 3 + 1], z = dustData[i * 3 + 2];
    dustLines.push([new Vector3(x, y, z), new Vector3(x + 0.03, y + 0.03, z)]);
  }
  const dustMesh = MeshBuilder.CreateLineSystem("dust", { lines: dustLines, updatable: true }, scene);
  dustMesh.color = new Color3(0.87, 0.8, 0.67);
  dustMesh.alpha = 0.25;
  dustMesh.isPickable = false;
  dustMesh.setEnabled(false);
  allMeshes.push(dustMesh);

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Ponds (animated water discs)
  // ────────────────────────────────────────────────────────────────────────────

  const ponds: { mesh: Mesh; origPositions: Float32Array }[] = [];

  for (const def of POND_DEFS) {
    const pond = MeshBuilder.CreateDisc(`pond-${def.position[0]}`, {
      radius: def.radius,
      tessellation: 32,
      updatable: true,
    }, scene);
    pond.rotation.x = Math.PI / 2;
    pond.position = new Vector3(def.position[0], def.position[1], def.position[2]);
    pond.receiveShadows = true;
    pond.isPickable = false;

    const pondMat = new StandardMaterial(`pondMat-${def.position[0]}`, scene);
    pondMat.diffuseColor = new Color3(0.13, 0.53, 0.67);
    pondMat.specularColor = new Color3(0.8, 0.8, 0.9);
    pondMat.alpha = 0.7;
    pondMat.emissiveColor = new Color3(0.07, 0.27, 0.4);
    pondMat.backFaceCulling = false;
    pond.material = pondMat;

    const posData = pond.getVerticesData(VertexBuffer.PositionKind);
    const origPositions = posData ? new Float32Array(posData) : new Float32Array(0);

    ponds.push({ mesh: pond, origPositions });
    allMeshes.push(pond);
    allMats.push(pondMat);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Per-frame update – direct vertex buffer manipulation
  // ────────────────────────────────────────────────────────────────────────────

  const updateCallback = () => {
    const dt = scene.getEngine().getDeltaTime() / 1000;
    elapsed += dt;
    const t = elapsed;

    const store = useStore.getState();
    const weather = store.weather;
    const time = store.time;

    // ── Rain ──
    const isRainy = weather === "rainy";
    rainMesh.setEnabled(isRainy);
    if (isRainy) {
      const windX = Math.sin(t * 0.3) * 0.15;
      const windZ = Math.cos(t * 0.2) * 0.08;
      for (let i = 0; i < RAIN_COUNT; i++) {
        rainData[i * 3] += windX;
        rainData[i * 3 + 1] -= 0.5;
        rainData[i * 3 + 2] += windZ;
        if (rainData[i * 3 + 1] < 0) {
          rainData[i * 3 + 1] = HEIGHT;
          rainData[i * 3] = (Math.random() - 0.5) * SPREAD;
          rainData[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
        }
      }
      // Update vertex buffer directly: each particle has 2 vertices (6 floats)
      const vb = rainMesh.getVerticesData(VertexBuffer.PositionKind);
      if (vb) {
        for (let i = 0; i < RAIN_COUNT; i++) {
          const x = rainData[i * 3], y = rainData[i * 3 + 1], z = rainData[i * 3 + 2];
          const vi = i * 6; // 2 vertices * 3 components
          vb[vi] = x; vb[vi + 1] = y; vb[vi + 2] = z;
          vb[vi + 3] = x; vb[vi + 4] = y - 0.3; vb[vi + 5] = z;
        }
        rainMesh.updateVerticesData(VertexBuffer.PositionKind, vb);
      }
    }

    // ── Snow ──
    const isSnowy = weather === "snowy";
    snowMesh.setEnabled(isSnowy);
    if (isSnowy) {
      const gustX = Math.sin(t * 0.15) * 0.03;
      for (let i = 0; i < SNOW_COUNT; i++) {
        const seed = snowSeeds[i];
        const fallSpeed = 0.03 + seed * 0.003;
        snowData[i * 3 + 1] -= fallSpeed;
        snowData[i * 3] += Math.sin(t * 0.5 + seed) * 0.015 + gustX;
        snowData[i * 3 + 2] += Math.cos(t * 0.4 + seed * 1.3) * 0.01;
        if (snowData[i * 3 + 1] < 0) {
          snowData[i * 3 + 1] = HEIGHT;
          snowData[i * 3] = (Math.random() - 0.5) * SPREAD;
          snowData[i * 3 + 2] = (Math.random() - 0.5) * SPREAD;
        }
      }
      const vb = snowMesh.getVerticesData(VertexBuffer.PositionKind);
      if (vb) {
        for (let i = 0; i < SNOW_COUNT; i++) {
          const x = snowData[i * 3], y = snowData[i * 3 + 1], z = snowData[i * 3 + 2];
          const vi = i * 6;
          vb[vi] = x; vb[vi + 1] = y; vb[vi + 2] = z;
          vb[vi + 3] = x + 0.03; vb[vi + 4] = y + 0.03; vb[vi + 5] = z;
        }
        snowMesh.updateVerticesData(VertexBuffer.PositionKind, vb);
      }
    }

    // ── Dust (sunny daytime) ──
    const showDust = weather === "sunny" && time >= 7 && time <= 17;
    dustMesh.setEnabled(showDust);
    if (showDust) {
      const driftX = Math.sin(t * 0.1) * 0.02;
      for (let i = 0; i < DUST_COUNT; i++) {
        dustData[i * 3] += driftX + Math.sin(t * 0.2 + i) * 0.003;
        dustData[i * 3 + 1] += Math.sin(t * 0.15 + i * 0.7) * 0.002;
        dustData[i * 3 + 2] += Math.cos(t * 0.12 + i) * 0.003;
        if (Math.abs(dustData[i * 3]) > 20) dustData[i * 3] = (Math.random() - 0.5) * 20;
        if (dustData[i * 3 + 1] < 0.2 || dustData[i * 3 + 1] > 3) {
          dustData[i * 3 + 1] = 0.5 + Math.random() * 1.5;
        }
      }
      const vb = dustMesh.getVerticesData(VertexBuffer.PositionKind);
      if (vb) {
        for (let i = 0; i < DUST_COUNT; i++) {
          const x = dustData[i * 3], y = dustData[i * 3 + 1], z = dustData[i * 3 + 2];
          const vi = i * 6;
          vb[vi] = x; vb[vi + 1] = y; vb[vi + 2] = z;
          vb[vi + 3] = x + 0.03; vb[vi + 4] = y + 0.03; vb[vi + 5] = z;
        }
        dustMesh.updateVerticesData(VertexBuffer.PositionKind, vb);
      }
    }

    // ── Pond wave animation ──
    for (const pond of ponds) {
      const positions = pond.mesh.getVerticesData(VertexBuffer.PositionKind);
      if (!positions) continue;

      for (let i = 0; i < positions.length / 3; i++) {
        const ox = pond.origPositions[i * 3];
        const oy = pond.origPositions[i * 3 + 1];
        // Disc is rotated via mesh.rotation.x, so local Z is "up"
        const wave = Math.sin(ox * 2 + t * 1.5) * 0.03 + Math.cos(oy * 2.5 + t * 1.2) * 0.02;
        positions[i * 3 + 2] = wave;
      }
      pond.mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
    }
  };

  scene.registerBeforeRender(updateCallback);

  // ────────────────────────────────────────────────────────────────────────────
  // Dispose
  // ────────────────────────────────────────────────────────────────────────────

  return {
    dispose: () => {
      scene.unregisterBeforeRender(updateCallback);
      for (const m of allMats) m.dispose();
      for (const m of allMeshes) m.dispose();
    },
  };
}
