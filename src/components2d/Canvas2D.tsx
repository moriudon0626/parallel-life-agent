import { useRef, useEffect } from 'react';
import type { Camera2D } from '../hooks/useCanvas2D';
import { useCanvas2D, worldToScreen } from '../hooks/useCanvas2D';
import { useGameLoop } from '../hooks/useGameLoop';
import { useStore } from '../store';
import { emotionToColor } from '../lib/emotions';
import { initRobot, updateRobot, getRobot } from './entities/RobotEntity';
import { renderTerrainDirect, renderWeather, renderResourceNodes, renderBuildings } from './environment';
import { createCritterEntity, updateCritter, drawCritter, type CritterEntity } from './entities/CritterEntity';

export function Canvas2D() {
  const { canvasRef, ctx, camera, setCamera } = useCanvas2D();
  const frameCountRef = useRef(0);
  const totalTimeRef = useRef(0);

  // const robot = useStore((state) => state.robot); // Robot managed via getRobot() function
  const weather = useStore((state) => state.weather);
  const time = useStore((state) => state.time);
  const resourceNodes = useStore((state) => state.resourceNodes);
  const buildings = useStore((state) => state.buildings);
  const critterRegistry = useStore((state) => state.critterRegistry);

  // Critter entity instances (runtime state, not in Zustand)
  const critterEntitiesRef = useRef<Map<string, CritterEntity>>(new Map());

  // Initialize robot entity on mount
  useEffect(() => {
    initRobot();
  }, []);

  // Camera follow robot - update every frame
  // (Camera follows robot position which updates in the game loop)

  // Sync critter entities with registry (add new, remove dead)
  useEffect(() => {
    const entities = critterEntitiesRef.current;

    // Add new critters from registry
    for (const entry of critterRegistry) {
      if (entry.isAlive && !entities.has(entry.id)) {
        const critterEntity = createCritterEntity(
          entry.id,
          entry.name,
          entry.color,
          entry.spawnPosition,
          entry.generation
        );
        entities.set(entry.id, critterEntity);
      }
    }

    // Remove dead/missing critters
    for (const [id, entity] of entities.entries()) {
      const registryEntry = critterRegistry.find(c => c.id === id);
      if (!registryEntry || !registryEntry.isAlive || entity.opacity <= 0) {
        entities.delete(id);
      }
    }
  }, [critterRegistry]);

  // Main render loop with performance stats
  useGameLoop((delta, stats) => {
    if (!ctx || !canvasRef.current) return;

    const canvas = canvasRef.current;
    frameCountRef.current++;
    totalTimeRef.current += delta;

    // Update robot entity
    updateRobot(delta, totalTimeRef.current);

    // Camera follow robot
    const currentRobot = getRobot();
    if (currentRobot) {
      setCamera({
        x: currentRobot.position.x,
        z: currentRobot.position.z,
        zoom: 20,
      });
    }

    // Update critter entities
    const entities = critterEntitiesRef.current;
    for (const [id, critter] of entities.entries()) {
      const updated = updateCritter(critter, delta, totalTimeRef.current);
      entities.set(id, updated);
    }

    // 1. Draw weather/sky gradient (background)
    renderWeather(ctx, camera, canvas, weather, time, delta);

    // 2. Draw terrain
    renderTerrainDirect(ctx, camera, canvas);

    // 3. Draw grid for reference (optional, can remove later)
    drawGrid(ctx, camera, canvas);

    // 4. Draw resource nodes
    renderResourceNodes(ctx, camera, canvas, resourceNodes);

    // 5. Draw buildings
    renderBuildings(ctx, camera, canvas, buildings);

    // 6. Draw critters
    for (const critter of entities.values()) {
      drawCritter(ctx, critter, camera, canvas);
    }

    // 7. Draw robot if exists
    const robot = getRobot();
    if (robot) {
      drawRobot(ctx, robot, camera, canvas);
    }

    // 8. Draw performance stats
    drawStats(ctx, stats, frameCountRef.current, camera);
  }, 60); // Target 60fps

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'block',
      }}
    />
  );
}

/**
 * Draw performance statistics
 */
function drawStats(
  ctx: CanvasRenderingContext2D,
  stats: { fps: number; delta: number; frames: number },
  frameCount: number,
  camera: Camera2D
) {
  ctx.fillStyle = '#00ff00';
  ctx.font = '16px monospace';
  ctx.textAlign = 'left';

  // FPS with color indication (green >55, yellow 30-55, red <30)
  const fpsColor = stats.fps >= 55 ? '#00ff00' : stats.fps >= 30 ? '#ffff00' : '#ff0000';
  ctx.fillStyle = fpsColor;
  ctx.fillText(`FPS: ${stats.fps}`, 10, 20);

  // Delta time in ms
  ctx.fillStyle = '#00ff00';
  ctx.fillText(`Delta: ${(stats.delta * 1000).toFixed(2)}ms`, 10, 40);

  // Frame count
  ctx.fillText(`Frame: ${frameCount}`, 10, 60);

  // Camera position
  ctx.fillText(`Camera: (${camera.x.toFixed(1)}, ${camera.z.toFixed(1)})`, 10, 80);
  ctx.fillText(`Zoom: ${camera.zoom.toFixed(1)}x`, 10, 100);
}

/**
 * Draw reference grid
 */
function drawGrid(
  ctx: CanvasRenderingContext2D,
  camera: { x: number; z: number; zoom: number },
  canvas: HTMLCanvasElement
) {
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1;

  const gridSize = 10; // Grid every 10 world units
  const startX = Math.floor((camera.x - canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
  const endX = Math.ceil((camera.x + canvas.width / 2 / camera.zoom) / gridSize) * gridSize;
  const startZ = Math.floor((camera.z - canvas.height / 2 / camera.zoom) / gridSize) * gridSize;
  const endZ = Math.ceil((camera.z + canvas.height / 2 / camera.zoom) / gridSize) * gridSize;

  // Vertical lines
  for (let x = startX; x <= endX; x += gridSize) {
    const [sx1, sy1] = worldToScreen(x, startZ, camera, canvas);
    const [sx2, sy2] = worldToScreen(x, endZ, camera, canvas);
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
  }

  // Horizontal lines
  for (let z = startZ; z <= endZ; z += gridSize) {
    const [sx1, sy1] = worldToScreen(startX, z, camera, canvas);
    const [sx2, sy2] = worldToScreen(endX, z, camera, canvas);
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
  }

  // Draw origin
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.lineWidth = 2;
  const [ox, oy] = worldToScreen(0, 0, camera, canvas);
  ctx.beginPath();
  ctx.moveTo(ox - 10, oy);
  ctx.lineTo(ox + 10, oy);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ox, oy - 10);
  ctx.lineTo(ox, oy + 10);
  ctx.stroke();
}

/**
 * Draw robot (cute style with 12-sided polygon and emotion-based colors)
 */
function drawRobot(
  ctx: CanvasRenderingContext2D,
  robot: any,
  camera: { x: number; z: number; zoom: number },
  canvas: HTMLCanvasElement
) {
  const [sx, sy] = worldToScreen(robot.position.x, robot.position.z, camera, canvas);
  const size = 30; // Base size in pixels

  // Apply bobbing animation (vertical offset)
  const bobOffset = robot.bobOffset || 0;
  const animatedY = sy + bobOffset * size;

  // Get emotion-based body color
  const baseColor = '#4a9eff'; // Default blue
  const bodyColor = robot.emotion ? emotionToColor(robot.emotion, baseColor) : baseColor;

  // State-based color modulation
  const stateColor = robot.state === 'DIALOGUE' ? '#00ffcc' : bodyColor;

  // 1. Shadow (ellipse at feet) - stays at ground level
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(sx, sy + size * 0.4, size * 0.8, size * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // 2. Body (12-sided polygon with emotion color)
  ctx.fillStyle = stateColor;
  ctx.beginPath();
  const sides = 12;
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + (robot.rotation || 0);
    const x = sx + Math.cos(angle) * size;
    const y = animatedY + Math.sin(angle) * size;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();

  // 3. Inner glow (gradient) - intensity based on energy emotion
  const energyIntensity = robot.emotion?.energy || 0.5;
  const gradient = ctx.createRadialGradient(sx, animatedY, 0, sx, animatedY, size);
  gradient.addColorStop(0, `rgba(255, 255, 255, ${0.3 + energyIntensity * 0.3})`);
  gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = (i / sides) * Math.PI * 2 + (robot.rotation || 0);
    const x = sx + Math.cos(angle) * size;
    const y = animatedY + Math.sin(angle) * size;
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  ctx.fill();

  // 4. Rotating ring (white outline) - rotation based on animation time
  const time = robot.animationTime || Date.now() / 1000;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, animatedY, size * 1.2, time, time + Math.PI * 1.5);
  ctx.stroke();

  // 5. LED eyes (two small circles) - color based on state
  const eyeColor = robot.state === 'IDLE' ? '#00ffcc' : '#ff00cc';
  const eyeOffset = size * 0.3;
  const eyeSize = size * 0.15;

  ctx.fillStyle = eyeColor;
  ctx.beginPath();
  ctx.arc(sx - eyeOffset, animatedY - eyeOffset, eyeSize, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(sx + eyeOffset, animatedY - eyeOffset, eyeSize, 0, Math.PI * 2);
  ctx.fill();

  // 6. Antenna (line + pulsing red sphere)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(sx, animatedY - size);
  ctx.lineTo(sx, animatedY - size * 1.5);
  ctx.stroke();

  // Pulsing antenna light
  const pulseIntensity = 0.8 + Math.sin(time * 3) * 0.2;
  ctx.fillStyle = `rgba(255, 51, 51, ${pulseIntensity})`;
  ctx.beginPath();
  ctx.arc(sx, animatedY - size * 1.5, size * 0.2, 0, Math.PI * 2);
  ctx.fill();

  // Add subtle glow to antenna tip
  const antennaGlow = ctx.createRadialGradient(sx, animatedY - size * 1.5, 0, sx, animatedY - size * 1.5, size * 0.4);
  antennaGlow.addColorStop(0, 'rgba(255, 51, 51, 0.4)');
  antennaGlow.addColorStop(1, 'rgba(255, 51, 51, 0)');
  ctx.fillStyle = antennaGlow;
  ctx.beginPath();
  ctx.arc(sx, animatedY - size * 1.5, size * 0.4, 0, Math.PI * 2);
  ctx.fill();

  // 7. Thought bubble (if exists)
  if (robot.currentThought) {
    ctx.fillStyle = 'rgba(200, 220, 255, 0.95)';
    ctx.strokeStyle = '#7799dd';
    ctx.lineWidth = 1.5;

    const bubbleY = animatedY - size * 2;
    const bubbleWidth = Math.min(200, robot.currentThought.length * 8);
    const bubbleHeight = 30;

    // Bubble background
    ctx.beginPath();
    ctx.roundRect(sx - bubbleWidth / 2, bubbleY - bubbleHeight / 2, bubbleWidth, bubbleHeight, 10);
    ctx.fill();
    ctx.stroke();

    // Thought text
    ctx.fillStyle = '#445577';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`💭 ${robot.currentThought.substring(0, 25)}...`, sx, bubbleY);
  }

  // Debug: show position and state
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(
    `(${robot.position.x.toFixed(1)}, ${robot.position.z.toFixed(1)}) [${robot.state || 'IDLE'}]`,
    sx,
    sy + size + 15
  );
}
