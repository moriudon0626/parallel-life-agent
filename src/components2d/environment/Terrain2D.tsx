import type { Camera2D } from '../../hooks/useCanvas2D';
import { worldToScreen, isVisibleOnScreen } from '../../hooks/useCanvas2D';
import { getTerrainHeight } from '../../lib/terrain';

// Offscreen canvas for terrain caching
let terrainCache: HTMLCanvasElement | null = null;
let lastCacheCamera: Camera2D | null = null;

/**
 * Render terrain with elevation-based coloring and biomes
 */
function renderTerrain(
  ctx: CanvasRenderingContext2D,
  camera: Camera2D,
  canvas: HTMLCanvasElement
) {
  // Check if we can use cached terrain
  if (terrainCache && lastCacheCamera) {
    if (
      Math.abs(lastCacheCamera.x - camera.x) < 0.5 &&
      Math.abs(lastCacheCamera.z - camera.z) < 0.5 &&
      Math.abs(lastCacheCamera.zoom - camera.zoom) < 0.1
    ) {
      // Use cache
      ctx.drawImage(terrainCache, 0, 0);
      return;
    }
  }

  // Initialize cache if needed
  if (!terrainCache) {
    terrainCache = document.createElement('canvas');
  }
  terrainCache.width = canvas.width;
  terrainCache.height = canvas.height;
  const cacheCtx = terrainCache.getContext('2d');
  if (!cacheCtx) return;

  // Calculate visible world bounds with margin
  const margin = 10; // world units
  const halfWidth = canvas.width / (2 * camera.zoom);
  const halfHeight = canvas.height / (2 * camera.zoom);
  const minX = Math.floor(camera.x - halfWidth - margin);
  const maxX = Math.ceil(camera.x + halfWidth + margin);
  const minZ = Math.floor(camera.z - halfHeight - margin);
  const maxZ = Math.ceil(camera.z + halfHeight + margin);

  // Grid resolution (pixels per terrain sample)
  const resolution = Math.max(1, Math.floor(4 / camera.zoom));

  // Render terrain grid
  for (let worldX = minX; worldX <= maxX; worldX += resolution) {
    for (let worldZ = minZ; worldZ <= maxZ; worldZ += resolution) {
      // Viewport culling
      if (!isVisibleOnScreen(worldX, worldZ, camera, canvas, 50)) continue;

      const height = getTerrainHeight(worldX, worldZ);
      const [screenX, screenY] = worldToScreen(worldX, worldZ, camera, canvas);

      // Color based on elevation and biome
      const color = getTerrainColor(height);

      cacheCtx.fillStyle = color;
      const size = Math.max(1, resolution * camera.zoom);
      cacheCtx.fillRect(screenX, screenY, size, size);
    }
  }

  // Draw cached terrain to main canvas
  ctx.drawImage(terrainCache, 0, 0);

  // Update cache metadata
  lastCacheCamera = { ...camera };
}

/**
 * Get terrain color based on elevation and position (biome)
 */
function getTerrainColor(height: number): string {
  // Base color on elevation
  if (height < -1) {
    // Deep crater - dark gray
    return '#2a2a3e';
  } else if (height < 0) {
    // Shallow crater - medium gray
    return '#3a3a4e';
  } else if (height < 1) {
    // Flat plains - light gray
    return '#4a4a5e';
  } else if (height < 3) {
    // Low hills - gray-brown
    return '#5a5550';
  } else if (height < 6) {
    // Medium hills - brown
    return '#6a5a45';
  } else {
    // High peaks - light brown
    return '#7a6a55';
  }
}

/**
 * Export render function for use in main game loop
 */
export function renderTerrainDirect(
  ctx: CanvasRenderingContext2D,
  camera: Camera2D,
  canvas: HTMLCanvasElement
) {
  renderTerrain(ctx, camera, canvas);
}
