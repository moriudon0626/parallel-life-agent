/**
 * Shared types and utilities for 2D entity rendering
 */

import type { Camera2D } from '../../hooks/useCanvas2D';

/**
 * Base interface for all 2D entities
 */
export interface Entity2D {
  position: { x: number; y?: number; z: number };
  rotation?: number;
  scale?: number;
}

/**
 * Animation state for entities
 */
export interface AnimationState {
  time: number;
  bobOffset: number;
  rotationOffset: number;
  scaleMultiplier: number;
}

/**
 * Drawing context for all entity renderers
 */
export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  camera: Camera2D;
  canvas: HTMLCanvasElement;
  time: number;
  delta: number;
}

/**
 * Helper to draw shadow beneath entity
 */
export function drawShadow(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  opacity = 0.3
) {
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${opacity})`;
  ctx.beginPath();
  ctx.ellipse(sx, sy + size * 0.4, size * 0.8, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Helper to draw gradient glow effect
 */
export function drawGlow(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  color = 'rgba(255, 255, 255, 0.3)'
) {
  ctx.save();
  const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, size);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(sx, sy, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Helper to draw a polygon (for robot 12-sided body, etc.)
 */
export function drawPolygon(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  sides: number,
  rotation = 0,
  fillColor?: string,
  strokeColor?: string,
  strokeWidth = 0
) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(rotation);

  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const x = Math.cos(angle) * size;
    const y = Math.sin(angle) * size;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();

  if (fillColor) {
    ctx.fillStyle = fillColor;
    ctx.fill();
  }

  if (strokeColor && strokeWidth > 0) {
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Calculate bob animation offset (for walking/hopping)
 */
export function calculateBobOffset(time: number, speed = 3, amplitude = 5): number {
  return Math.sin(time * speed) * amplitude;
}

/**
 * Calculate rotation animation
 */
export function calculateRotation(time: number, speed = 1): number {
  return (time * speed) % (Math.PI * 2);
}

/**
 * Check if entity is in viewport (for culling)
 */
export function isInViewport(
  worldX: number,
  worldZ: number,
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  margin = 100
): boolean {
  const screenX = (worldX - camera.x) * camera.zoom + canvas.width / 2;
  const screenY = -(worldZ - camera.z) * camera.zoom + canvas.height / 2;

  return (
    screenX >= -margin &&
    screenX <= canvas.width + margin &&
    screenY >= -margin &&
    screenY <= canvas.height + margin
  );
}
