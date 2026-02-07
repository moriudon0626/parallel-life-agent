# Game Loop and Canvas Hooks

## Overview

This directory contains custom React hooks for managing the 2D game rendering loop and canvas operations.

## Hooks

### `useGameLoop`

Manages the game's main update/render loop using `requestAnimationFrame`.

**Features:**
- Stable 60fps performance target
- Delta time calculation in seconds
- Automatic delta capping (100ms max) to prevent physics explosions on tab switches
- Built-in FPS counter
- Performance statistics tracking

**Usage:**
```typescript
import { useGameLoop } from './hooks/useGameLoop';

function Game() {
  useGameLoop((delta, stats) => {
    // delta: time since last frame (seconds)
    // stats: { fps, delta, frames }

    // Update game state
    updatePhysics(delta);

    // Render
    render();

    console.log(`FPS: ${stats.fps}`);
  }, 60); // Target 60fps
}
```

**Parameters:**
- `callback: (delta: number, stats: GameLoopStats) => void` - Called every frame
- `targetFPS: number = 60` - Target frame rate

**Performance Targets:**
- 60 FPS = ~16.67ms frame budget
- Delta capped at 100ms to handle tab switches gracefully
- Stats updated every second

### `useCanvas2D`

Manages the 2D canvas element and camera state.

**Features:**
- Automatic canvas sizing to window
- Resize handling
- Camera state management (position + zoom)
- Context initialization

**Usage:**
```typescript
import { useCanvas2D } from './hooks/useCanvas2D';

function Canvas2D() {
  const { canvasRef, ctx, camera, setCamera } = useCanvas2D();

  useGameLoop((delta) => {
    if (!ctx || !canvasRef.current) return;

    // Clear canvas
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);

    // Draw using camera
    const [sx, sy] = worldToScreen(0, 0, camera, canvasRef.current);
    ctx.fillRect(sx - 5, sy - 5, 10, 10);
  });

  return <canvas ref={canvasRef} />;
}
```

**Returns:**
- `canvasRef: RefObject<HTMLCanvasElement>` - Canvas element ref
- `ctx: CanvasRenderingContext2D | null` - 2D rendering context
- `camera: Camera2D` - Current camera state
- `setCamera: (camera: Camera2D) => void` - Update camera

## Types

### `Camera2D`

```typescript
interface Camera2D {
  x: number;      // World X position
  z: number;      // World Z position (using Z for 3D compatibility)
  zoom: number;   // Zoom level (pixels per world unit)
}
```

### `GameLoopStats`

```typescript
interface GameLoopStats {
  fps: number;    // Current frames per second
  delta: number;  // Last frame delta time (seconds)
  frames: number; // Total frames rendered
}
```

## Utility Functions

### `worldToScreen`

Converts world coordinates to screen pixel coordinates.

```typescript
function worldToScreen(
  worldX: number,
  worldZ: number,
  camera: Camera2D,
  canvas: HTMLCanvasElement
): [number, number]
```

**Coordinate System:**
- World: Center origin, Y-up (standard 3D convention)
- Screen: Top-left origin, Y-down (standard canvas)

**Example:**
```typescript
const [screenX, screenY] = worldToScreen(5, 3, camera, canvas);
ctx.fillRect(screenX, screenY, 10, 10);
```

### `screenToWorld`

Converts screen pixel coordinates to world coordinates.

```typescript
function screenToWorld(
  screenX: number,
  screenY: number,
  camera: Camera2D,
  canvas: HTMLCanvasElement
): [number, number]
```

**Example:**
```typescript
canvas.addEventListener('click', (e) => {
  const [worldX, worldZ] = screenToWorld(e.clientX, e.clientY, camera, canvas);
  console.log(`Clicked at world position: (${worldX}, ${worldZ})`);
});
```

### `worldDistance`

Calculates Euclidean distance between two world points.

```typescript
function worldDistance(
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number
```

**Example:**
```typescript
const dist = worldDistance(robot.x, robot.z, target.x, target.z);
if (dist < 5) {
  console.log('Target reached!');
}
```

### `isVisibleOnScreen`

Checks if a world point is visible on screen (with optional margin).

```typescript
function isVisibleOnScreen(
  worldX: number,
  worldZ: number,
  camera: Camera2D,
  canvas: HTMLCanvasElement,
  margin?: number
): boolean
```

**Example:**
```typescript
// Cull entities outside view
entities.forEach(entity => {
  if (isVisibleOnScreen(entity.x, entity.z, camera, canvas, 50)) {
    drawEntity(entity);
  }
});
```

## Performance Best Practices

### 1. Delta Time Usage

Always use delta time for smooth animations:

```typescript
// ❌ Bad: Frame-rate dependent
position.x += 5;

// ✅ Good: Frame-rate independent
const speed = 100; // units per second
position.x += speed * delta;
```

### 2. Avoid Recreating Functions

Use refs to avoid recreating the game loop on every render:

```typescript
// ❌ Bad: New function every render
useGameLoop((delta) => {
  updatePhysics(delta);
});

// ✅ Good: Stable callback
const updateRef = useRef((delta: number) => {
  updatePhysics(delta);
});

useGameLoop(updateRef.current);
```

### 3. Culling

Only render visible entities:

```typescript
entities.forEach(entity => {
  if (!isVisibleOnScreen(entity.x, entity.z, camera, canvas)) {
    return; // Skip rendering
  }
  drawEntity(ctx, entity, camera, canvas);
});
```

### 4. Batch Canvas Operations

Minimize state changes:

```typescript
// ❌ Bad: Many state changes
entities.forEach(e => {
  ctx.fillStyle = e.color;
  ctx.fillRect(e.x, e.y, 10, 10);
});

// ✅ Good: Group by color
Object.entries(entitiesByColor).forEach(([color, entities]) => {
  ctx.fillStyle = color;
  entities.forEach(e => ctx.fillRect(e.x, e.y, 10, 10));
});
```

## Testing

Run manual tests in browser console:

```typescript
import { runManualTests } from './hooks/__tests__/canvas-hooks.test';
runManualTests();

// Or use global function
window.runCanvasTests();
```

## Troubleshooting

### Low FPS

1. Check stats display (should show ~60 FPS)
2. Profile with browser DevTools
3. Reduce entity count or enable culling
4. Optimize draw calls (batch operations)

### Physics Jitter

1. Ensure using delta time for all movement
2. Check delta cap is working (max 100ms)
3. Verify camera smoothing is enabled

### Coordinate Issues

1. Verify Y-axis inversion (world Y-up, screen Y-down)
2. Test with `worldToScreen` → `screenToWorld` round trip
3. Check zoom factor is applied correctly

## Browser Compatibility

- Modern browsers with `requestAnimationFrame` support
- Canvas 2D context required
- Performance.now() for high-resolution timing
