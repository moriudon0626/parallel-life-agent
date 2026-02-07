# 2D Rendering Quick Reference Guide

**For:** Robot, Critter, and Environment Engineers
**Purpose:** Quick reference for rendering entities in 2D prototype

---

## Getting Started

### Import Required Utilities

```typescript
import type { Camera2D } from '../hooks/useCanvas2D';
import { worldToScreen, isVisibleOnScreen } from '../hooks/useCanvas2D';
```

### Basic Rendering Pattern

```typescript
function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: { position: { x: number; z: number } },
  camera: Camera2D,
  canvas: HTMLCanvasElement
) {
  // 1. Check if visible (optional performance optimization)
  if (!isVisibleOnScreen(entity.position.x, entity.position.z, camera, canvas)) {
    return; // Skip rendering off-screen entities
  }

  // 2. Convert world coordinates to screen coordinates
  const [screenX, screenY] = worldToScreen(
    entity.position.x,
    entity.position.z,
    camera,
    canvas
  );

  // 3. Draw entity at screen coordinates
  ctx.fillStyle = '#FF6B6B';
  ctx.beginPath();
  ctx.arc(screenX, screenY, 20, 0, Math.PI * 2);
  ctx.fill();
}
```

---

## Coordinate System

### World Coordinates
- **Origin:** Center of world (0, 0)
- **X-axis:** Right is positive
- **Z-axis:** Up is positive (Y-up for 3D compatibility)
- **Units:** Arbitrary world units

### Screen Coordinates
- **Origin:** Top-left corner (0, 0)
- **X-axis:** Right is positive
- **Y-axis:** Down is positive (standard canvas)
- **Units:** Pixels

### Conversion Functions

```typescript
// World → Screen
const [screenX, screenY] = worldToScreen(worldX, worldZ, camera, canvas);

// Screen → World (for mouse input, etc.)
const [worldX, worldZ] = screenToWorld(screenX, screenY, camera, canvas);
```

---

## Camera2D Interface

```typescript
interface Camera2D {
  x: number;      // Camera world X position
  z: number;      // Camera world Z position (using Z for 3D compat)
  zoom: number;   // Pixels per world unit (20 = 1 world unit = 20 pixels)
}
```

**Current camera:** Accessed via `useCanvas2D()` hook
**Default zoom:** 20 (defined in Canvas2D.tsx)

---

## Drawing Examples

### Example 1: Simple Circle Entity

```typescript
const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);

ctx.fillStyle = '#4A90E2';
ctx.beginPath();
ctx.arc(sx, sy, 15, 0, Math.PI * 2); // 15px radius
ctx.fill();
```

### Example 2: Rectangle Entity

```typescript
const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);
const size = 40; // pixels

ctx.fillStyle = '#E74C3C';
ctx.fillRect(sx - size/2, sy - size/2, size, size);
```

### Example 3: Polygon (like current robot rendering)

```typescript
const [sx, sy] = worldToScreen(robot.position.x, robot.position.z, camera, canvas);
const size = 30;
const sides = 12;

ctx.fillStyle = '#4a9eff';
ctx.beginPath();

for (let i = 0; i < sides; i++) {
  const angle = (i / sides) * Math.PI * 2;
  const x = sx + Math.cos(angle) * size;
  const y = sy + Math.sin(angle) * size;

  if (i === 0) ctx.moveTo(x, y);
  else ctx.lineTo(x, y);
}

ctx.closePath();
ctx.fill();
```

### Example 4: Drawing with Emotion Color

```typescript
import { emotionToColor } from '../lib/emotions';

const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);
const color = emotionToColor(entity.emotion);

ctx.fillStyle = color;
ctx.beginPath();
ctx.arc(sx, sy, 20, 0, Math.PI * 2);
ctx.fill();
```

### Example 5: Text Labels

```typescript
const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);

ctx.fillStyle = '#FFFFFF';
ctx.font = '12px monospace';
ctx.textAlign = 'center';
ctx.textBaseline = 'top';
ctx.fillText(entity.name, sx, sy + 25);
```

### Example 6: Drawing with Shadow

```typescript
const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);

// Shadow
ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
ctx.beginPath();
ctx.ellipse(sx, sy + 20, 15, 5, 0, 0, Math.PI * 2);
ctx.fill();

// Entity
ctx.fillStyle = '#FF6B6B';
ctx.beginPath();
ctx.arc(sx, sy, 20, 0, Math.PI * 2);
ctx.fill();
```

---

## Performance Optimizations

### 1. Frustum Culling (Recommended)

Only render entities visible on screen:

```typescript
entities.forEach(entity => {
  if (!isVisibleOnScreen(entity.x, entity.z, camera, canvas, 50)) {
    return; // Skip off-screen entities
  }
  drawEntity(ctx, entity, camera, canvas);
});
```

**Margin parameter:** Optional padding (default 50px) to render slightly off-screen entities for smooth transitions.

### 2. Level of Detail (LOD)

Draw simpler shapes when zoomed out:

```typescript
const worldSize = 30 / camera.zoom; // Actual size in world units

if (worldSize < 2) {
  // Very small on screen - draw as dot
  ctx.fillRect(sx - 1, sy - 1, 2, 2);
} else if (worldSize < 10) {
  // Medium - draw simple circle
  ctx.arc(sx, sy, 10, 0, Math.PI * 2);
  ctx.fill();
} else {
  // Large - draw detailed version
  drawDetailedEntity(ctx, entity, sx, sy);
}
```

### 3. Batch Drawing

Group operations by style to minimize state changes:

```typescript
// ❌ Bad: Many state changes
entities.forEach(e => {
  ctx.fillStyle = e.color;
  ctx.fillRect(e.x, e.y, 10, 10);
});

// ✅ Good: Batch by color
const byColor = groupBy(entities, 'color');
Object.entries(byColor).forEach(([color, ents]) => {
  ctx.fillStyle = color;
  ents.forEach(e => ctx.fillRect(e.x, e.y, 10, 10));
});
```

### 4. Canvas State Management

Save/restore instead of resetting all properties:

```typescript
ctx.save(); // Save current state

ctx.fillStyle = '#FF0000';
ctx.globalAlpha = 0.5;
ctx.translate(sx, sy);
// ... draw complex entity

ctx.restore(); // Restore to saved state
```

---

## Integration with Game Loop

Rendering happens inside `useGameLoop` callback in Canvas2D.tsx:

```typescript
// Current structure in Canvas2D.tsx
useGameLoop((delta, stats) => {
  if (!ctx || !canvasRef.current) return;

  const canvas = canvasRef.current;

  // 1. Clear canvas
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 2. Draw grid (reference)
  drawGrid(ctx, camera, canvas);

  // 3. Draw entities (your code here!)
  if (robot) drawRobot(ctx, robot, camera, canvas);
  // TODO: Add critters, environment, etc.

  // 4. Draw UI overlays (stats, etc.)
  drawStats(ctx, stats, frameCountRef.current, camera);
}, 60);
```

**Your task:** Add your entity rendering in step 3.

---

## Entity Data Access

Entities are stored in Zustand store:

```typescript
import { useStore } from '../store';

// In Canvas2D component
const robot = useStore((state) => state.robot);
const critters = useStore((state) => state.critters);
const environment = /* TBD by environment engineer */;
```

### Robot Structure
```typescript
{
  position: { x: number; y: number; z: number },
  emotion: string,
  needs: { energy: number, maintenance: number, ... },
  // ... other fields from store
}
```

### Critter Structure
```typescript
{
  id: string,
  name: string,
  position: { x: number; y: number; z: number },
  emotion: string,
  // ... other fields
}
```

---

## Utility Functions

### Calculate Distance

```typescript
import { worldDistance } from '../hooks/useCanvas2D';

const dist = worldDistance(robot.x, robot.z, critter.x, critter.z);
if (dist < 5) {
  // Entities are close - draw interaction indicator
}
```

### Check Visibility

```typescript
import { isVisibleOnScreen } from '../hooks/useCanvas2D';

if (isVisibleOnScreen(entity.x, entity.z, camera, canvas)) {
  drawEntity(ctx, entity, camera, canvas);
}
```

---

## Animation Tips

### 1. Time-based Animation

Use `Date.now()` or `performance.now()` for continuous animations:

```typescript
const time = Date.now() / 1000; // Time in seconds

// Rotating effect
const angle = time * Math.PI; // Rotate once per 2 seconds
ctx.rotate(angle);

// Pulsing effect
const pulse = Math.sin(time * 3) * 0.2 + 1; // 0.8 to 1.2
const size = baseSize * pulse;
```

### 2. Delta-based Animation

Use `delta` from game loop for smooth, frame-rate independent animation:

```typescript
let rotation = 0;

useGameLoop((delta) => {
  rotation += delta * Math.PI; // Rotate 180° per second

  const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);

  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(rotation);
  // Draw rotated entity
  ctx.restore();
});
```

### 3. Easing Functions

Smooth transitions:

```typescript
// Ease in-out
function easeInOut(t: number): number {
  return t < 0.5
    ? 2 * t * t
    : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

// Usage
const progress = easeInOut(time / duration);
const x = startX + (endX - startX) * progress;
```

---

## Common Patterns

### Pattern 1: Entity with Health Bar

```typescript
const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);

// Entity
ctx.fillStyle = '#4A90E2';
ctx.beginPath();
ctx.arc(sx, sy, 20, 0, Math.PI * 2);
ctx.fill();

// Health bar background
ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
ctx.fillRect(sx - 20, sy - 30, 40, 4);

// Health bar fill
const healthPercent = entity.health / entity.maxHealth;
ctx.fillStyle = healthPercent > 0.5 ? '#00FF00' : '#FF0000';
ctx.fillRect(sx - 20, sy - 30, 40 * healthPercent, 4);
```

### Pattern 2: Entity with Direction Indicator

```typescript
const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);
const direction = Math.atan2(entity.velocity.z, entity.velocity.x);

ctx.save();
ctx.translate(sx, sy);
ctx.rotate(direction);

// Arrow pointing in movement direction
ctx.fillStyle = '#FFFFFF';
ctx.beginPath();
ctx.moveTo(20, 0);
ctx.lineTo(10, -5);
ctx.lineTo(10, 5);
ctx.closePath();
ctx.fill();

ctx.restore();
```

### Pattern 3: Particle Effects

```typescript
particles.forEach(p => {
  const [sx, sy] = worldToScreen(p.x, p.z, camera, canvas);

  ctx.globalAlpha = p.life; // Fade out over time
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
  ctx.fill();
});

ctx.globalAlpha = 1; // Reset
```

---

## Debugging Tips

### 1. Draw World Origin

```typescript
const [ox, oy] = worldToScreen(0, 0, camera, canvas);

ctx.strokeStyle = 'red';
ctx.lineWidth = 2;

// X-axis
ctx.beginPath();
ctx.moveTo(ox - 20, oy);
ctx.lineTo(ox + 20, oy);
ctx.stroke();

// Z-axis
ctx.beginPath();
ctx.moveTo(ox, oy - 20);
ctx.lineTo(ox, oy + 20);
ctx.stroke();
```

### 2. Draw Entity Bounds

```typescript
const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);

ctx.strokeStyle = 'yellow';
ctx.lineWidth = 1;
ctx.strokeRect(sx - 25, sy - 25, 50, 50);
```

### 3. Log Screen Coordinates

```typescript
const [sx, sy] = worldToScreen(entity.x, entity.z, camera, canvas);
console.log(`Entity at world (${entity.x}, ${entity.z}) → screen (${sx}, ${sy})`);
```

---

## Reference: Current Robot Rendering

See `src/components2d/Canvas2D.tsx` lines 128-210 for complete example of:
- Shadow rendering
- 12-sided polygon body
- Gradient glow
- Rotating ring animation
- LED eyes
- Antenna
- Position label

This serves as a template for your entity rendering!

---

## Questions?

If you need help with:
- Coordinate conversions → Ask foundation-engineer
- Performance issues → Check profiler, use frustum culling
- Animation glitches → Verify delta time usage
- Rendering bugs → Check camera/zoom calculations

**Documentation:**
- API reference: `src/hooks/README.md`
- Test examples: `src/hooks/__tests__/canvas-hooks.test.ts`

---

**Good luck with your entity rendering!** 🎨
