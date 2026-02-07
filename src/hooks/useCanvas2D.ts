import { useEffect, useRef, useState } from 'react';

export interface Camera2D {
  x: number;
  z: number; // Using z for 3D compatibility
  zoom: number;
}

/**
 * Custom hook for managing 2D canvas and camera
 */
export function useCanvas2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ctx, setCtx] = useState<CanvasRenderingContext2D | null>(null);
  const [camera, setCamera] = useState<Camera2D>({ x: 0, z: 0, zoom: 1 });

  // Initialize canvas context and handle resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    setCtx(context);

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return { canvasRef, ctx, camera, setCamera };
}

/**
 * Convert world coordinates to screen coordinates
 * World: center origin, Y-up (uses x, z from 3D)
 * Screen: top-left origin, Y-down
 */
export function worldToScreen(
  worldX: number,
  worldZ: number,
  camera: Camera2D,
  canvas: HTMLCanvasElement
): [number, number] {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  const screenX = centerX + (worldX - camera.x) * camera.zoom;
  const screenY = centerY - (worldZ - camera.z) * camera.zoom; // Invert Y

  return [screenX, screenY];
}

/**
 * Convert screen coordinates to world coordinates
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: Camera2D,
  canvas: HTMLCanvasElement
): [number, number] {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  const worldX = camera.x + (screenX - centerX) / camera.zoom;
  const worldZ = camera.z - (screenY - centerY) / camera.zoom; // Invert Y

  return [worldX, worldZ];
}

/**
 * Calculate distance between two world points
 */
export function worldDistance(
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Check if a world point is visible on screen (with margin)
 */
export function isVisibleOnScreen(
  worldX: number,
  worldZ: number,
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  margin: number = 50
): boolean {
  const [screenX, screenY] = worldToScreen(worldX, worldZ, camera, canvas);
  return (
    screenX >= -margin &&
    screenX <= canvas.width + margin &&
    screenY >= -margin &&
    screenY <= canvas.height + margin
  );
}
