import { useEffect, useRef } from 'react';

export interface GameLoopStats {
  fps: number;
  delta: number;
  frames: number;
}

/**
 * Custom hook for game loop using requestAnimationFrame
 * Provides stable delta time for consistent physics/animations
 * Target: 60fps with frame skip protection
 */
export function useGameLoop(
  callback: (delta: number, stats: GameLoopStats) => void,
  targetFPS: number = 60
) {
  const requestRef = useRef<number>();
  const previousTimeRef = useRef<number>();
  const callbackRef = useRef(callback);
  const statsRef = useRef<GameLoopStats>({ fps: 0, delta: 0, frames: 0 });
  const fpsCounterRef = useRef({ frames: 0, lastTime: 0 });

  const targetFrameTime = 1000 / targetFPS;

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const animate = (time: number) => {
      if (previousTimeRef.current !== undefined) {
        // Calculate delta in seconds (match Three.js clock)
        const delta = (time - previousTimeRef.current) / 1000;
        // Cap delta to prevent physics explosions on tab switch
        const cappedDelta = Math.min(delta, 0.1);

        // Update FPS counter
        fpsCounterRef.current.frames++;
        if (time - fpsCounterRef.current.lastTime >= 1000) {
          statsRef.current.fps = Math.round(
            (fpsCounterRef.current.frames * 1000) / (time - fpsCounterRef.current.lastTime)
          );
          fpsCounterRef.current.frames = 0;
          fpsCounterRef.current.lastTime = time;
        }

        statsRef.current.delta = cappedDelta;
        statsRef.current.frames++;

        callbackRef.current(cappedDelta, statsRef.current);
      } else {
        // First frame initialization
        fpsCounterRef.current.lastTime = time;
      }

      previousTimeRef.current = time;
      requestRef.current = requestAnimationFrame(animate);
    };

    requestRef.current = requestAnimationFrame(animate);

    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [targetFPS]); // Re-create loop if target FPS changes
}
