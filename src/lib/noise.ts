// 2D Simplex Noise + FBM for terrain generation
// Adapted from Stefan Gustavson's simplex noise implementation

// Permutation table
const perm = new Uint8Array(512);
const grad3: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

// Initialize with a seed
function initPermutation(seed: number = 42) {
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  // Fisher-Yates shuffle with seeded random
  let s = seed;
  for (let i = 255; i > 0; i--) {
    s = (s * 16807 + 0) % 2147483647;
    const j = s % (i + 1);
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
}

initPermutation(42);

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

function dot2(g: [number, number], x: number, y: number): number {
  return g[0] * x + g[1] * y;
}

export function noise2D(x: number, y: number): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t;
  const Y0 = j - t;
  const x0 = x - X0;
  const y0 = y - Y0;

  let i1: number, j1: number;
  if (x0 > y0) { i1 = 1; j1 = 0; }
  else { i1 = 0; j1 = 1; }

  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;

  const ii = i & 255;
  const jj = j & 255;

  let n0 = 0, n1 = 0, n2 = 0;

  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    t0 *= t0;
    const gi0 = perm[ii + perm[jj]] % 8;
    n0 = t0 * t0 * dot2(grad3[gi0], x0, y0);
  }

  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    t1 *= t1;
    const gi1 = perm[ii + i1 + perm[jj + j1]] % 8;
    n1 = t1 * t1 * dot2(grad3[gi1], x1, y1);
  }

  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    t2 *= t2;
    const gi2 = perm[ii + 1 + perm[jj + 1]] % 8;
    n2 = t2 * t2 * dot2(grad3[gi2], x2, y2);
  }

  // Scale to [-1, 1]
  return 70.0 * (n0 + n1 + n2);
}

export function fbm(
  x: number,
  y: number,
  octaves: number = 6,
  lacunarity: number = 2.0,
  gain: number = 0.5
): number {
  let value = 0;
  let amplitude = 1.0;
  let frequency = 1.0;
  let maxAmplitude = 0;

  for (let i = 0; i < octaves; i++) {
    value += noise2D(x * frequency, y * frequency) * amplitude;
    maxAmplitude += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return value / maxAmplitude; // Normalize to [-1, 1]
}

// Smooth step for terrain flattening
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
