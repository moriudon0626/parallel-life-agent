import type { Camera2D } from '../../hooks/useCanvas2D';
import { worldToScreen, isVisibleOnScreen } from '../../hooks/useCanvas2D';
import type { ResourceNode, ResourceCategory } from '../../lib/resources';

/**
 * Render resource nodes with icons and capacity indicators
 */
export function renderResourceNodes(
  ctx: CanvasRenderingContext2D,
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  resources: ResourceNode[]
) {
  for (const resource of resources) {
    // Viewport culling
    if (!isVisibleOnScreen(resource.position.x, resource.position.z, camera, canvas, 100)) {
      continue;
    }

    const [screenX, screenY] = worldToScreen(
      resource.position.x,
      resource.position.z,
      camera,
      canvas
    );

    // Draw resource circle (area of effect)
    const radius = resource.radius * camera.zoom;

    // Fill circle with category color (semi-transparent)
    ctx.fillStyle = getCategoryColor(resource.category, 0.2);
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = getCategoryColor(resource.category, 0.6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Draw resource icon
    const iconSize = Math.max(12, Math.min(24, radius * 0.6));
    const icon = getResourceIcon(resource.category);
    ctx.fillStyle = getCategoryColor(resource.category, 1);
    ctx.font = `${iconSize}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, screenX, screenY);

    // Draw capacity bar
    if (resource.capacity < 1.0) {
      drawCapacityBar(ctx, screenX, screenY + radius + 8, radius * 2, resource.capacity);
    }

    // Draw name (if zoomed in enough)
    if (camera.zoom > 15) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(resource.name, screenX, screenY + radius + 20);
    }

    // Draw danger indicator
    if (resource.dangerLevel > 0) {
      ctx.fillStyle = `rgba(255, 0, 0, ${resource.dangerLevel})`;
      ctx.beginPath();
      ctx.arc(screenX + radius * 0.7, screenY - radius * 0.7, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw tool required indicator
    if (resource.requiresTool) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🔧', screenX - radius * 0.7, screenY - radius * 0.7);
    }
  }
}

/**
 * Get color for resource category
 */
function getCategoryColor(category: ResourceCategory, alpha: number): string {
  const colors: Record<ResourceCategory, string> = {
    food: '#90EE90',      // Light green
    energy: '#FFD700',    // Gold
    material: '#CD853F',  // Peru/brown
    water: '#4169E1',     // Royal blue
  };

  const hex = colors[category];
  const r = parseInt(hex.substring(1, 3), 16);
  const g = parseInt(hex.substring(3, 5), 16);
  const b = parseInt(hex.substring(5, 7), 16);

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Get icon for resource category
 */
function getResourceIcon(category: ResourceCategory): string {
  const icons: Record<ResourceCategory, string> = {
    food: '🍄',
    energy: '⚡',
    material: '📦',
    water: '💧',
  };

  return icons[category];
}

/**
 * Draw capacity bar below resource
 */
function drawCapacityBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  capacity: number
) {
  const height = 4;
  const barWidth = Math.max(20, width);

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.fillRect(x - barWidth / 2, y, barWidth, height);

  // Capacity fill
  const fillColor = capacity > 0.5 ? '#00ff00' : capacity > 0.2 ? '#ffff00' : '#ff0000';
  ctx.fillStyle = fillColor;
  ctx.fillRect(x - barWidth / 2, y, barWidth * capacity, height);

  // Border
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - barWidth / 2, y, barWidth, height);
}
