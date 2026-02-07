import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { Scene } from "@babylonjs/core/scene";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import { getTerrainHeight } from "../../lib/terrain";
import { getBiomeParamsAt } from "../../lib/biomes";
import { useStore } from "../../store";

// ---------------------------------------------------------------------------
// Seeded random for consistent placement (same as R3F version)
// ---------------------------------------------------------------------------
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

// ---------------------------------------------------------------------------
// HSL to RGB helper (Babylon only has Color3 in RGB)
// ---------------------------------------------------------------------------
function hslToColor3(h: number, s: number, l: number): Color3 {
  // h in degrees [0,360), s and l in [0,1]
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return new Color3(r + m, g + m, b + m);
}

// ---------------------------------------------------------------------------
// Crater positions to avoid (mirrors R3F Vegetation.tsx)
// ---------------------------------------------------------------------------
const CRATERS = [
  { x: 10, z: 15, r: 10 },
  { x: -20, z: -10, r: 14 },
  { x: 30, z: -30, r: 17 },
  { x: -40, z: 40, r: 22 },
  { x: 5, z: -5, r: 6 },
];

function avoidsCraters(x: number, z: number): boolean {
  return !CRATERS.some(c => Math.sqrt((x - c.x) ** 2 + (z - c.z) ** 2) < c.r);
}

// ---------------------------------------------------------------------------
// Tree data structure
// ---------------------------------------------------------------------------
interface TreeData {
  x: number;
  z: number;
  trunkH: number;
  trunkRadiusTop: number;
  trunkRadiusBottom: number;
  canopyR: number;
  canopyType: "sphere" | "cone";
  hueShift: number;
  index: number;
}

// ---------------------------------------------------------------------------
// Mushroom cluster data
// ---------------------------------------------------------------------------
interface MushroomData {
  ox: number;
  oz: number;
  scale: number;
  capHue: number;
  capSat: number;
  capLit: number;
}

interface ClusterData {
  cx: number;
  cz: number;
  mushrooms: MushroomData[];
  emissiveColor: Color3;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export function createVegetation(scene: Scene) {
  const allMeshes: Mesh[] = [];
  const allInstances: InstancedMesh[] = [];
  const allLights: PointLight[] = [];
  const allMaterials: StandardMaterial[] = [];

  // =========================================================================
  // 1. TREES (~35 trees)
  // =========================================================================
  const treeRand = seededRandom(54321);

  const trees: TreeData[] = [];
  let placed = 0;
  let totalAttempts = 0;
  while (placed < 35 && totalAttempts < 200) {
    totalAttempts++;
    let x: number, z: number;
    let attempts = 0;
    do {
      const angle = treeRand() * Math.PI * 2;
      const radius = 8 + treeRand() * 75;
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      attempts++;
    } while (
      attempts < 20 &&
      CRATERS.some(c => Math.sqrt((x - c.x) ** 2 + (z - c.z) ** 2) < c.r)
    );

    // Biome density filter for trees
    const biome = getBiomeParamsAt(x, z);
    if (treeRand() > biome.treeDensity) continue;

    trees.push({
      x,
      z,
      trunkH: 1.5 + treeRand() * 2.0,
      trunkRadiusTop: 0.12,
      trunkRadiusBottom: 0.18,
      canopyR: 0.8 + treeRand() * 1.2,
      canopyType: treeRand() > 0.5 ? "sphere" : "cone",
      hueShift: biome.hueShift,
      index: placed,
    });
    placed++;
  }

  // Get season for canopy color
  const season = useStore.getState().season;

  // ---- Trunk source mesh (hidden) ----
  const trunkSource = MeshBuilder.CreateCylinder(
    "trunkSource",
    { height: 1, diameterTop: 0.24, diameterBottom: 0.36, tessellation: 6 },
    scene
  );
  trunkSource.isVisible = false;
  allMeshes.push(trunkSource);

  const trunkMat = new StandardMaterial("trunkMat", scene);
  trunkMat.diffuseColor = Color3.FromHexString("#5a3a1a");
  trunkMat.roughness = 0.9;
  trunkMat.specularColor = Color3.Black();
  trunkSource.material = trunkMat;
  allMaterials.push(trunkMat);

  // ---- Canopy source meshes (one sphere, one cone) ----
  const canopySphereSource = MeshBuilder.CreateSphere(
    "canopySphereSource",
    { diameter: 2, segments: 8 },
    scene
  );
  canopySphereSource.isVisible = false;
  allMeshes.push(canopySphereSource);

  const canopyConeSource = MeshBuilder.CreateCylinder(
    "canopyConeSource",
    { height: 2, diameterTop: 0, diameterBottom: 2, tessellation: 6 },
    scene
  );
  canopyConeSource.isVisible = false;
  allMeshes.push(canopyConeSource);

  // Create per-tree canopy materials (each tree gets a unique seasonal color)
  // We'll store materials for reuse and assign per-instance via individual meshes
  // Since Babylon instances share the source material, we need individual meshes
  // for unique colors. To balance performance with unique coloring, we create
  // a small palette of canopy materials and assign the closest one.

  function getCanopyColor(treeIndex: number, hueShift: number, currentSeason: string): Color3 {
    const baseVariation = Math.sin(treeIndex) * 20;
    const lightVariation = Math.sin(treeIndex * 2) * 8;
    let h: number, s: number, l: number;
    switch (currentSeason) {
      case "spring":
        h = 110 + baseVariation + hueShift;
        s = 0.50;
        l = (33 + lightVariation) / 100;
        break;
      case "summer":
        h = 120 + baseVariation + hueShift;
        s = 0.45;
        l = (25 + lightVariation) / 100;
        break;
      case "autumn":
        h = 30 + Math.abs(baseVariation) + hueShift;
        s = 0.55;
        l = (35 + lightVariation) / 100;
        break;
      case "winter":
        h = 30 + hueShift;
        s = 0.15;
        l = (40 + lightVariation) / 100;
        break;
      default:
        h = 110 + baseVariation + hueShift;
        s = 0.45;
        l = (28 + lightVariation) / 100;
        break;
    }
    return hslToColor3(h, s, l);
  }

  // For trees, each needs a unique canopy color.
  // We create individual canopy meshes as clones with unique materials,
  // and use instances for trunks (which all share the same brown).
  for (let i = 0; i < trees.length; i++) {
    const tree = trees[i];
    const terrainY = getTerrainHeight(tree.x, tree.z);

    // --- Trunk instance ---
    const trunkInst = trunkSource.createInstance("trunk_" + i);
    trunkInst.position.set(tree.x, terrainY + tree.trunkH / 2, tree.z);
    trunkInst.scaling.set(1, tree.trunkH, 1);
    trunkInst.freezeWorldMatrix();
    allInstances.push(trunkInst);

    // --- Canopy (clone with unique material for color) ---
    const canopyColor = getCanopyColor(tree.index, tree.hueShift, season);
    const canopyMat = new StandardMaterial("canopyMat_" + i, scene);
    canopyMat.diffuseColor = canopyColor;
    canopyMat.roughness = 0.75;
    canopyMat.specularColor = Color3.Black();
    if (season === "winter") {
      canopyMat.alpha = 0.3 + Math.abs(Math.sin(i * 3)) * 0.5;
    }
    allMaterials.push(canopyMat);

    const canopySource = tree.canopyType === "sphere" ? canopySphereSource : canopyConeSource;
    const canopyInst = canopySource.createInstance("canopy_" + i);
    canopyInst.position.set(
      tree.x,
      terrainY + tree.trunkH + tree.canopyR * 0.5,
      tree.z
    );
    canopyInst.scaling.set(tree.canopyR, tree.canopyR, tree.canopyR);
    // Apply material to instance - instances use source material by default.
    // For unique colors we need to use clone meshes instead of instances.
    // Let's switch: use a thin wrapper (clone) for canopy to support unique colors.
    canopyInst.dispose();

    const canopyMesh = canopySource.clone("canopyMesh_" + i, null);
    if (canopyMesh) {
      canopyMesh.isVisible = true;
      canopyMesh.material = canopyMat;
      canopyMesh.position.set(
        tree.x,
        terrainY + tree.trunkH + tree.canopyR * 0.5,
        tree.z
      );
      canopyMesh.scaling.set(tree.canopyR, tree.canopyR, tree.canopyR);
      canopyMesh.freezeWorldMatrix();
      allMeshes.push(canopyMesh);
    }
  }

  // =========================================================================
  // 2. GRASS PATCHES (800 instances)
  // =========================================================================
  const grassRand = seededRandom(12345);
  const grassCount = 800;

  const grassSource = MeshBuilder.CreateCylinder(
    "grassSource",
    { height: 1.0, diameterTop: 0, diameterBottom: 0.15, tessellation: 4 },
    scene
  );
  grassSource.isVisible = false;
  allMeshes.push(grassSource);

  const grassMat = new StandardMaterial("grassMat", scene);
  grassMat.diffuseColor = Color3.FromHexString("#4a7a3a");
  grassMat.roughness = 0.8;
  grassMat.specularColor = Color3.Black();
  grassSource.material = grassMat;
  allMaterials.push(grassMat);

  let grassPlaced = 0;
  let grassAttempts = 0;
  while (grassPlaced < grassCount && grassAttempts < grassCount * 3) {
    grassAttempts++;

    // Place in ring around center (r=3 to r=85)
    const angle = grassRand() * Math.PI * 2;
    const radius = 3 + grassRand() * 82;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // Biome density filter
    const biome = getBiomeParamsAt(x, z);
    if (grassRand() > biome.grassDensity) continue;

    const terrainY = getTerrainHeight(x, z);
    const yRot = grassRand() * Math.PI * 2;
    const s = 0.3 + grassRand() * 0.5;

    const inst = grassSource.createInstance("grass_" + grassPlaced);
    inst.position.set(x, terrainY + (s * 1.0) / 2, z);
    inst.scaling.set(s * 0.3, s, s * 0.3);
    inst.rotation.y = yRot;
    inst.freezeWorldMatrix();
    allInstances.push(inst);

    grassPlaced++;
  }

  // =========================================================================
  // 3. GLOWING MUSHROOMS (14 clusters)
  // =========================================================================
  const mushRand = seededRandom(77777);

  const emissiveColors = [
    Color3.FromHexString("#4488ff"),
    Color3.FromHexString("#8844ff"),
    Color3.FromHexString("#44ffaa"),
    Color3.FromHexString("#ff44aa"),
    Color3.FromHexString("#44aaff"),
  ];

  const clusterCenters = [
    { x: -8, z: 12 }, { x: 15, z: -8 }, { x: -18, z: -15 },
    { x: 25, z: 20 }, { x: -30, z: 5 }, { x: 12, z: -20 },
    { x: -5, z: 25 }, { x: 35, z: 10 }, { x: -25, z: -25 },
    { x: 8, z: -35 }, { x: -50, z: 30 }, { x: 45, z: -40 },
    { x: -40, z: -45 }, { x: 55, z: 25 },
  ];

  const clusters: ClusterData[] = [];

  // Mushroom source meshes
  const stemSource = MeshBuilder.CreateCylinder(
    "mushroomStemSource",
    { height: 0.3, diameterTop: 0.08, diameterBottom: 0.12, tessellation: 6 },
    scene
  );
  stemSource.isVisible = false;
  allMeshes.push(stemSource);

  const stemMat = new StandardMaterial("stemMat", scene);
  stemMat.diffuseColor = Color3.FromHexString("#d4c8a0");
  stemMat.roughness = 0.8;
  stemMat.specularColor = Color3.Black();
  stemSource.material = stemMat;
  allMaterials.push(stemMat);

  // Cap source - hemisphere (sphere sliced at equator via scaling)
  const capSource = MeshBuilder.CreateSphere(
    "mushroomCapSource",
    { diameter: 0.3, segments: 8, slice: 0.5 },
    scene
  );
  capSource.isVisible = false;
  allMeshes.push(capSource);

  // We need per-cluster cap materials for unique colors and emissive control
  // Store references for animation
  const capMaterials: StandardMaterial[] = [];
  const clusterLights: PointLight[] = [];

  for (const center of clusterCenters) {
    // Adjust position to avoid craters
    let cx = center.x + (mushRand() - 0.5) * 4;
    let cz = center.z + (mushRand() - 0.5) * 4;
    for (let attempt = 0; attempt < 10; attempt++) {
      if (avoidsCraters(cx, cz)) break;
      cx = center.x + (mushRand() - 0.5) * 8;
      cz = center.z + (mushRand() - 0.5) * 8;
    }

    const mushroomCount = 3 + Math.floor(mushRand() * 3); // 3-5 per cluster
    const emissive = emissiveColors[Math.floor(mushRand() * emissiveColors.length)];
    const clusterTerrainY = getTerrainHeight(cx, cz);

    const mushrooms: MushroomData[] = [];

    // Create a unique cap material for this cluster (shared by mushrooms in same cluster)
    const capMat = new StandardMaterial("capMat_cluster_" + clusters.length, scene);
    capMat.roughness = 0.3;
    capMat.specularColor = new Color3(0.2, 0.2, 0.2);
    capMat.emissiveColor = emissive;
    capMat.alpha = 1.0;
    capMaterials.push(capMat);
    allMaterials.push(capMat);

    for (let j = 0; j < mushroomCount; j++) {
      const ox = (mushRand() - 0.5) * 1.5;
      const oz = (mushRand() - 0.5) * 1.5;
      const s = 0.3 + mushRand() * 0.5;
      const capHue = 260 + mushRand() * 40;
      const capSat = 0.60;
      const capLit = (40 + mushRand() * 20) / 100;

      mushrooms.push({ ox, oz, scale: s, capHue, capSat, capLit });

      const localTerrainY = getTerrainHeight(cx + ox, cz + oz);

      // Stem instance
      const stemInst = stemSource.createInstance("stem_" + clusters.length + "_" + j);
      stemInst.position.set(cx + ox, localTerrainY + 0.15 * s, cz + oz);
      stemInst.scaling.set(s, s, s);
      stemInst.freezeWorldMatrix();
      allInstances.push(stemInst);

      // Cap - clone (needs unique material per cluster)
      const capClone = capSource.clone("cap_" + clusters.length + "_" + j, null);
      if (capClone) {
        capClone.isVisible = true;
        const thisCapMat = capMat.clone("capMatIndiv_" + clusters.length + "_" + j);
        thisCapMat.diffuseColor = hslToColor3(capHue, capSat, capLit);
        thisCapMat.emissiveColor = emissive;
        // Start with zero emissive intensity (controlled via diffuse/emissive balance)
        capClone.material = thisCapMat;
        capClone.position.set(cx + ox, localTerrainY + 0.35 * s, cz + oz);
        capClone.scaling.set(s, s, s);
        capClone.freezeWorldMatrix();
        allMeshes.push(capClone);
        // We won't push individual materials; we animate the cluster material
        // But since we cloned, push to allMaterials for cleanup
        allMaterials.push(thisCapMat);
      }
    }

    // PointLight per cluster
    const light = new PointLight(
      "mushroomLight_" + clusters.length,
      new Vector3(cx, clusterTerrainY + 0.5, cz),
      scene
    );
    light.diffuse = emissive;
    light.specular = emissive;
    light.intensity = 0; // Start off; animate based on time
    light.range = 6;
    clusterLights.push(light);
    allLights.push(light);

    clusters.push({ cx, cz, mushrooms, emissiveColor: emissive });
  }

  // =========================================================================
  // Animation: mushroom glow based on time of day
  // =========================================================================
  // Collect all cap materials (the individually cloned ones) for emissive animation
  // Store base emissive colors so we can scale them each frame without degradation
  const capAnimationData: { mat: StandardMaterial; baseEmissive: Color3 }[] = [];
  for (const mat of allMaterials) {
    if (mat.name.startsWith("capMatIndiv_")) {
      capAnimationData.push({
        mat,
        baseEmissive: mat.emissiveColor.clone(),
      });
    }
  }

  scene.registerBeforeRender(() => {
    const time = useStore.getState().time;

    // Smooth intensity: night = full glow, dawn/dusk = transition
    let intensity = 0;
    if (time >= 18 || time < 6) {
      intensity = 1.0;
    } else if (time >= 17 && time < 18) {
      intensity = time - 17; // 0 -> 1
    } else if (time >= 6 && time < 7) {
      intensity = 7 - time; // 1 -> 0
    }

    // Update mushroom cap emissive colors (scale base emissive by intensity)
    const scale = intensity * 1.5;
    for (const { mat, baseEmissive } of capAnimationData) {
      mat.emissiveColor = new Color3(
        Math.min(1, baseEmissive.r * scale),
        Math.min(1, baseEmissive.g * scale),
        Math.min(1, baseEmissive.b * scale)
      );
    }

    // Update cluster point lights
    for (const light of clusterLights) {
      light.intensity = intensity * 1.5;
    }
  });

  // =========================================================================
  // Season change listener - update canopy colors when season changes
  // =========================================================================
  // We store the canopy materials for live updates
  const canopyMats = allMaterials.filter(m => m.name.startsWith("canopyMat_"));

  let lastSeason = season;
  scene.registerBeforeRender(() => {
    const currentSeason = useStore.getState().season;
    if (currentSeason === lastSeason) return;
    lastSeason = currentSeason;

    // Update each canopy material color
    for (let i = 0; i < trees.length && i < canopyMats.length; i++) {
      const tree = trees[i];
      const mat = canopyMats[i];
      const newColor = getCanopyColor(tree.index, tree.hueShift, currentSeason);
      mat.diffuseColor = newColor;
      if (currentSeason === "winter") {
        mat.alpha = 0.3 + Math.abs(Math.sin(i * 3)) * 0.5;
      } else {
        mat.alpha = 1.0;
      }
    }
  });

  // =========================================================================
  // Dispose function
  // =========================================================================
  return {
    dispose: () => {
      // Dispose instances
      for (const inst of allInstances) {
        inst.dispose();
      }
      // Dispose meshes
      for (const mesh of allMeshes) {
        mesh.dispose();
      }
      // Dispose lights
      for (const light of allLights) {
        light.dispose();
      }
      // Dispose materials
      for (const mat of allMaterials) {
        mat.dispose();
      }
    },
  };
}
