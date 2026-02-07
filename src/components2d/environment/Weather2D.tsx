import type { WeatherType } from '../../lib/environment';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
}

const particles: Particle[] = [];
const MAX_PARTICLES = 200;

/**
 * Render weather effects (rain, snow, sun gradient)
 */
export function renderWeather(
  ctx: CanvasRenderingContext2D,
  _camera: { x: number; z: number; zoom: number },
  canvas: HTMLCanvasElement,
  weather: WeatherType,
  time: number,
  delta: number
) {
  // Sun gradient (background sky color)
  renderSkyGradient(ctx, canvas, weather, time);

  // Particle effects for rain/snow
  if (weather === 'rainy') {
    updateRainParticles(canvas, delta);
    renderRainParticles(ctx);
  } else if (weather === 'snowy') {
    updateSnowParticles(canvas, delta);
    renderSnowParticles(ctx);
  }
}

/**
 * Render sky gradient based on time of day and weather
 */
function renderSkyGradient(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  weather: WeatherType,
  time: number
) {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);

  // Time-based colors (day/night cycle)
  let topColor: string;
  let bottomColor: string;

  if (time >= 6 && time < 12) {
    // Morning
    topColor = '#87CEEB'; // Sky blue
    bottomColor = '#FFA07A'; // Light salmon
  } else if (time >= 12 && time < 18) {
    // Afternoon
    topColor = '#4A90E2'; // Bright blue
    bottomColor = '#87CEEB'; // Sky blue
  } else if (time >= 18 && time < 20) {
    // Evening
    topColor = '#FF6B6B'; // Sunset red
    bottomColor = '#FFD93D'; // Sunset yellow
  } else {
    // Night
    topColor = '#0B0B2B'; // Dark blue
    bottomColor = '#1a1a3e'; // Slightly lighter dark blue
  }

  // Adjust for weather
  if (weather === 'cloudy') {
    topColor = adjustColorBrightness(topColor, 0.7);
    bottomColor = adjustColorBrightness(bottomColor, 0.7);
  } else if (weather === 'rainy') {
    topColor = adjustColorBrightness(topColor, 0.5);
    bottomColor = adjustColorBrightness(bottomColor, 0.5);
  } else if (weather === 'snowy') {
    topColor = '#D3D3D3'; // Light gray
    bottomColor = '#E8E8E8'; // Very light gray
  }

  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Update rain particles
 */
function updateRainParticles(canvas: HTMLCanvasElement, delta: number) {
  // Spawn new particles
  while (particles.length < MAX_PARTICLES) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -10,
      vx: -20 + Math.random() * 10, // Wind effect
      vy: 400 + Math.random() * 100, // Fast falling
      size: 1 + Math.random() * 2,
      alpha: 0.3 + Math.random() * 0.4,
    });
  }

  // Update existing particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * delta;
    p.y += p.vy * delta;

    // Remove off-screen particles
    if (p.y > canvas.height + 10 || p.x < -10 || p.x > canvas.width + 10) {
      particles.splice(i, 1);
    }
  }
}

/**
 * Render rain particles
 */
function renderRainParticles(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = '#AAD5FF';
  ctx.lineWidth = 1;

  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.vx * 0.02, p.y + p.vy * 0.02);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

/**
 * Update snow particles
 */
function updateSnowParticles(canvas: HTMLCanvasElement, delta: number) {
  // Spawn new particles
  while (particles.length < MAX_PARTICLES * 0.5) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -10,
      vx: -10 + Math.random() * 20, // Gentle drift
      vy: 30 + Math.random() * 40, // Slow falling
      size: 2 + Math.random() * 3,
      alpha: 0.5 + Math.random() * 0.5,
    });
  }

  // Update existing particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * delta;
    p.y += p.vy * delta;

    // Gentle horizontal oscillation
    p.vx += Math.sin(Date.now() * 0.001 + i) * 5 * delta;

    // Remove off-screen particles
    if (p.y > canvas.height + 10 || p.x < -10 || p.x > canvas.width + 10) {
      particles.splice(i, 1);
    }
  }
}

/**
 * Render snow particles
 */
function renderSnowParticles(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = '#FFFFFF';

  for (const p of particles) {
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}

/**
 * Adjust color brightness (0-1 multiplier)
 */
function adjustColorBrightness(color: string, factor: number): string {
  // Simple RGB adjustment
  const hex = color.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  const newR = Math.floor(r * factor);
  const newG = Math.floor(g * factor);
  const newB = Math.floor(b * factor);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
