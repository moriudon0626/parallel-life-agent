import type { Camera2D } from '../../hooks/useCanvas2D';
import { worldToScreen, isVisibleOnScreen } from '../../hooks/useCanvas2D';
import type { Building, BuildingType } from '../../lib/building';
import { isBuildingFunctional } from '../../lib/building';

/**
 * Render buildings with range circles and construction progress
 */
export function renderBuildings(
  ctx: CanvasRenderingContext2D,
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  buildings: Building[]
) {
  for (const building of buildings) {
    // Viewport culling
    if (!isVisibleOnScreen(building.position.x, building.position.z, camera, canvas, 100)) {
      continue;
    }

    const [screenX, screenY] = worldToScreen(
      building.position.x,
      building.position.z,
      camera,
      canvas
    );

    // Draw range circle (semi-transparent)
    const rangeRadius = building.radius * camera.zoom;
    ctx.fillStyle = getBuildingRangeColor(building.type, 0.1);
    ctx.beginPath();
    ctx.arc(screenX, screenY, rangeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw range border
    ctx.strokeStyle = getBuildingRangeColor(building.type, 0.4);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(screenX, screenY, rangeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw building rectangle
    const buildingSize = Math.max(16, building.radius * camera.zoom * 0.5);
    const buildingColor = getBuildingColor(building.type);

    // Building base
    ctx.fillStyle = buildingColor;
    ctx.fillRect(
      screenX - buildingSize / 2,
      screenY - buildingSize / 2,
      buildingSize,
      buildingSize
    );

    // Building border
    ctx.strokeStyle = isBuildingFunctional(building) ? '#ffffff' : '#888888';
    ctx.lineWidth = 2;
    ctx.strokeRect(
      screenX - buildingSize / 2,
      screenY - buildingSize / 2,
      buildingSize,
      buildingSize
    );

    // Construction progress indicator (if under construction)
    if (!building.built) {
      drawConstructionProgress(
        ctx,
        screenX - buildingSize / 2,
        screenY + buildingSize / 2 + 4,
        buildingSize,
        building.constructionProgress
      );
    }

    // Durability indicator
    if (building.built && building.durability < 100) {
      drawDurabilityBar(
        ctx,
        screenX - buildingSize / 2,
        screenY + buildingSize / 2 + 4,
        buildingSize,
        building.durability
      );
    }

    // Building icon
    const icon = getBuildingIcon(building.type);
    const iconSize = Math.max(12, buildingSize * 0.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = `${iconSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, screenX, screenY);

    // Building name (if zoomed in enough)
    if (camera.zoom > 15) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(building.name, screenX, screenY + buildingSize / 2 + 16);
    }

    // Capacity indicator (how many entities can use it)
    if (camera.zoom > 10) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(
        `${building.capacity}👤`,
        screenX + buildingSize / 2 - 2,
        screenY - buildingSize / 2 + 2
      );
    }
  }
}

/**
 * Get range color for building type
 */
function getBuildingRangeColor(type: BuildingType, alpha: number): string {
  const colors: Record<BuildingType, string> = {
    tent: '#90EE90',           // Light green (shelter)
    storage: '#FFD700',        // Gold (storage)
    charging_station: '#4169E1', // Royal blue (energy)
    wooden_shelter: '#8FBC8F', // Dark sea green (shelter)
    workshop: '#CD853F',       // Peru (repair)
  };

  const hex = colors[type] || '#FFFFFF';
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get solid color for building
 */
function getBuildingColor(type: BuildingType): string {
  const colors: Record<BuildingType, string> = {
    tent: '#6B8E23',           // Olive drab
    storage: '#B8860B',        // Dark golden rod
    charging_station: '#4682B4', // Steel blue
    wooden_shelter: '#8B4513', // Saddle brown
    workshop: '#A0522D',       // Sienna
  };

  return colors[type] || '#808080';
}

/**
 * Get icon for building type
 */
function getBuildingIcon(type: BuildingType): string {
  const icons: Record<BuildingType, string> = {
    tent: '⛺',
    storage: '📦',
    charging_station: '🔋',
    wooden_shelter: '🏠',
    workshop: '🔧',
  };

  return icons[type] || '🏢';
}

/**
 * Draw construction progress bar
 */
function drawConstructionProgress(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  progress: number
) {
  const height = 4;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(x, y, width, height);

  // Progress fill
  ctx.fillStyle = '#FFA500'; // Orange for construction
  ctx.fillRect(x, y, width * progress, height);

  // Border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Progress text
  ctx.fillStyle = '#ffffff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`${Math.floor(progress * 100)}%`, x + width / 2, y + height + 2);
}

/**
 * Draw durability bar
 */
function drawDurabilityBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  durability: number
) {
  const height = 4;
  const normalizedDurability = durability / 100;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(x, y, width, height);

  // Durability fill with color gradient
  const fillColor =
    normalizedDurability > 0.6
      ? '#00ff00'
      : normalizedDurability > 0.3
      ? '#ffff00'
      : '#ff0000';
  ctx.fillStyle = fillColor;
  ctx.fillRect(x, y, width * normalizedDurability, height);

  // Border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);
}
