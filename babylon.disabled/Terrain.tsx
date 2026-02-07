import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import { PhysicsShapeHeightField } from "@babylonjs/core/Physics/v2/physicsShape";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import type { Scene } from "@babylonjs/core/scene";
import { getTerrainHeight } from "../../lib/terrain";
import { getBiomeParamsAt } from "../../lib/biomes";

const TERRAIN_SIZE = 200;
const TERRAIN_SEGMENTS = 128;
const TERRAIN_VERTICES = TERRAIN_SEGMENTS + 1;

function computeTerrainData(isSnowy: boolean) {
  const total = TERRAIN_VERTICES * TERRAIN_VERTICES;
  const heights = new Float32Array(total);
  const colors = new Float32Array(total * 4);
  const halfSize = TERRAIN_SIZE / 2;

  for (let row = 0; row < TERRAIN_VERTICES; row++) {
    for (let col = 0; col < TERRAIN_VERTICES; col++) {
      const idx = row * TERRAIN_VERTICES + col;
      const px = (col / TERRAIN_SEGMENTS) * TERRAIN_SIZE - halfSize;
      const pz = (row / TERRAIN_SEGMENTS) * TERRAIN_SIZE - halfSize;
      const h = getTerrainHeight(px, pz);
      heights[idx] = h;

      let r: number, g: number, b: number;
      if (h < -1.5) { r = 0.3; g = 0.28; b = 0.25; }
      else if (h < -0.3) { r = 0.4; g = 0.35; b = 0.28; }
      else if (h < 1.0) { r = 0.35; g = 0.48; b = 0.28; }
      else if (h < 3.0) { r = 0.4; g = 0.45; b = 0.3; }
      else { r = 0.55; g = 0.53; b = 0.48; }

      const biomeTint = getBiomeParamsAt(px, pz);
      const bf = 0.25;
      r = r * (1 - bf) + biomeTint.groundTint[0] * bf;
      g = g * (1 - bf) + biomeTint.groundTint[1] * bf;
      b = b * (1 - bf) + biomeTint.groundTint[2] * bf;

      if (isSnowy) {
        const sf = Math.min(1, Math.max(0, (h + 2) / 6));
        r = r + (1 - r) * sf * 0.8;
        g = g + (1 - g) * sf * 0.8;
        b = b + (1 - b) * sf * 0.85;
      }

      colors[idx * 4] = r;
      colors[idx * 4 + 1] = g;
      colors[idx * 4 + 2] = b;
      colors[idx * 4 + 3] = 1.0;
    }
  }
  return { heights, colors };
}

export function createTerrain(scene: Scene) {
  const ground = MeshBuilder.CreateGround("terrain", {
    width: TERRAIN_SIZE, height: TERRAIN_SIZE,
    subdivisions: TERRAIN_SEGMENTS, updatable: true,
  }, scene);
  ground.receiveShadows = true;

  const { heights, colors } = computeTerrainData(false);

  // Apply height to vertices
  const positions = ground.getVerticesData(VertexBuffer.PositionKind);
  if (positions) {
    for (let i = 0; i < positions.length / 3; i++) {
      positions[i * 3 + 1] = heights[i];
    }
    ground.updateVerticesData(VertexBuffer.PositionKind, positions);

    // Recompute normals
    const normals = ground.getVerticesData(VertexBuffer.NormalKind);
    const indices = ground.getIndices();
    if (normals && indices) {
      VertexData.ComputeNormals(positions, indices, normals);
      ground.updateVerticesData(VertexBuffer.NormalKind, normals);
    }
  }

  // Vertex colors
  ground.setVerticesData(VertexBuffer.ColorKind, colors);

  // Material
  const mat = new StandardMaterial("terrainMat", scene);
  mat.diffuseColor = new Color3(1, 1, 1);
  mat.specularColor = new Color3(0.1, 0.1, 0.1);
  // mat.useVertexColors = true; // Property removed in newer Babylon.js versions
  ground.material = mat;

  // Physics: HeightField collider
  const physicsShape = new PhysicsShapeHeightField(
    TERRAIN_SIZE, TERRAIN_SIZE,
    TERRAIN_VERTICES, TERRAIN_VERTICES,
    heights, scene
  );
  const physicsBody = new PhysicsBody(ground, PhysicsMotionType.STATIC, false, scene);
  physicsBody.shape = physicsShape;

  return ground;
}

export function createPhysicsTestSphere(scene: Scene) {
  const sphere = MeshBuilder.CreateSphere("testSphere", { diameter: 1.5, segments: 16 }, scene);
  sphere.position = new Vector3(0, 10, 0);

  const mat = new StandardMaterial("testSphereMat", scene);
  mat.diffuseColor = new Color3(0.8, 0.3, 0.2);
  mat.specularColor = new Color3(0.5, 0.5, 0.5);
  sphere.material = mat;

  const aggregate = new PhysicsAggregate(sphere, PhysicsShapeType.SPHERE, {
    mass: 1, restitution: 0.3, friction: 0.8,
  }, scene);

  return sphere;
}
