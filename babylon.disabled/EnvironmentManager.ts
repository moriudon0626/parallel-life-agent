import type { Scene } from "@babylonjs/core/scene";
import { useStore } from "../../store";
import type { CritterRegistryEntry } from "../../store";
import { createMemory } from "../../store";
import { applyEmotionEvent } from "../../lib/emotions";
import { regenerateResources } from "../../lib/resources";
import { mutateColor } from "../../lib/lifecycle";

type WeatherType = 'sunny' | 'rainy' | 'cloudy' | 'snowy';
type SeasonType = 'spring' | 'summer' | 'autumn' | 'winter';

const SEASON_WEATHER: Record<SeasonType, Record<WeatherType, number>> = {
  spring: { sunny: 0.45, cloudy: 0.25, rainy: 0.20, snowy: 0.10 },
  summer: { sunny: 0.55, cloudy: 0.25, rainy: 0.15, snowy: 0.05 },
  autumn: { sunny: 0.30, cloudy: 0.30, rainy: 0.25, snowy: 0.15 },
  winter: { sunny: 0.20, cloudy: 0.25, rainy: 0.15, snowy: 0.40 },
};

const SEASON_TEMP_MOD: Record<SeasonType, number> = {
  spring: 0, summer: 5, autumn: -2, winter: -8,
};

function getSeasonFromDay(day: number): SeasonType {
  const cycleDay = ((day - 1) % 20);
  if (cycleDay < 5) return 'spring';
  if (cycleDay < 10) return 'summer';
  if (cycleDay < 15) return 'autumn';
  return 'winter';
}

function pickSeasonWeather(season: SeasonType): WeatherType {
  const probs = SEASON_WEATHER[season];
  const rand = Math.random();
  let cumulative = 0;
  for (const [weather, prob] of Object.entries(probs) as [WeatherType, number][]) {
    cumulative += prob;
    if (rand < cumulative) return weather;
  }
  return 'sunny';
}

function getNextWeatherStep(current: WeatherType, target: WeatherType): WeatherType | null {
  if (current === target) return null;
  if (current === 'sunny') return 'cloudy';
  if (current === 'cloudy') {
    if (target === 'sunny') return 'sunny';
    return target;
  }
  if (current === 'rainy' || current === 'snowy') {
    if (target === current) return null;
    return 'cloudy';
  }
  return null;
}

function calculateTemperature(time: number, weather: WeatherType, season: SeasonType): number {
  const base = 14 + 8 * Math.sin(((time - 8) / 24) * Math.PI * 2);
  const weatherMod: Record<WeatherType, number> = { sunny: 3, cloudy: -1, rainy: -4, snowy: -10 };
  return Math.round((base + weatherMod[weather] + SEASON_TEMP_MOD[season]) * 10) / 10;
}

export function createEnvironmentManager(scene: Scene) {
  let elapsed = 0;
  let weatherStepTimer = 0;
  let lastTempUpdate = 0;
  let lastResourceRegen = 0;
  let lastEmotionBroadcast = 0;
  let lastCritterSpawnCheck = 0;
  let targetWeather: WeatherType = useStore.getState().weather as WeatherType;

  // Weather target change interval (90s)
  const weatherInterval = setInterval(() => {
    const store = useStore.getState();
    targetWeather = pickSeasonWeather(store.season as SeasonType);
  }, 90000);

  scene.registerBeforeRender(() => {
    const dt = scene.getEngine().getDeltaTime() / 1000; // seconds
    elapsed += dt;

    const store = useStore.getState();

    // Time progression (3x speed: ~8 min per day)
    const timeIncrement = (dt / 60) * 3;
    let nextTime = store.time + timeIncrement;

    if (nextTime >= 24) {
      nextTime -= 24;
      const newDay = store.day + 1;
      store.setDay(newDay);
      const newSeason = getSeasonFromDay(newDay);
      if (newSeason !== store.season) {
        store.setSeason(newSeason);
      }
      targetWeather = pickSeasonWeather(newSeason);
    }
    store.setTime(nextTime);

    // Weather transitions (every 30s)
    if (elapsed - weatherStepTimer > 30.0) {
      weatherStepTimer = elapsed;
      const nextStep = getNextWeatherStep(store.weather as WeatherType, targetWeather);
      if (nextStep) {
        store.setWeather(nextStep);
      }
    }

    // Temperature update (every 2s)
    if (elapsed - lastTempUpdate > 2.0) {
      lastTempUpdate = elapsed;
      const temp = calculateTemperature(store.time, store.weather as WeatherType, store.season as SeasonType);
      store.setTemperature(temp);
    }

    // Resource regeneration (every 2s)
    if (elapsed - lastResourceRegen > 2.0) {
      lastResourceRegen = elapsed;
      const updated = regenerateResources(store.resourceNodes, 2.0);
      const changed = updated.some((r: { capacity: number }, i: number) => r.capacity !== store.resourceNodes[i].capacity);
      if (changed) {
        useStore.setState({ resourceNodes: updated });
      }
    }

    // Emotion broadcast (every 5s)
    if (elapsed - lastEmotionBroadcast > 5.0) {
      lastEmotionBroadcast = elapsed;
      const currentTime = store.time;
      const currentWeather = store.weather;
      const emotions = store.entityEmotions;

      Object.keys(emotions).forEach(id => {
        let emotion = emotions[id];
        if (!emotion) return;

        if (currentWeather === 'rainy') emotion = applyEmotionEvent(emotion, 'weather_rain', 0.3);
        else if (currentWeather === 'snowy') emotion = applyEmotionEvent(emotion, 'weather_snow', 0.3);
        else if (currentWeather === 'sunny') emotion = applyEmotionEvent(emotion, 'weather_sunny', 0.3);

        if (currentTime < 5 || currentTime > 21) {
          emotion = applyEmotionEvent(emotion, 'night_time', 0.3);
        } else if (currentTime >= 5 && currentTime < 7) {
          emotion = applyEmotionEvent(emotion, 'dawn', 0.3);
        }

        store.updateEntityEmotion(id, emotion);
      });
    }

    // Critter spawning from minerals (every 30s)
    if (elapsed - lastCritterSpawnCheck > 30.0) {
      lastCritterSpawnCheck = elapsed;
      const aliveCount = store.critterRegistry.filter((c: CritterRegistryEntry) => c.isAlive).length;

      if (aliveCount < 3) {
        const validOres = store.resourceNodes.filter(
          (r: { type: string; capacity: number }) => r.type === 'mineral_ore' && r.capacity > 0.3
        );
        if (validOres.length > 0) {
          const ore = validOres[Math.floor(Math.random() * validOres.length)];
          const totalCritters = store.critterRegistry.length;
          const newId = `Critter-${String.fromCharCode(65 + totalCritters)}`;
          const baseColors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#f97316'];
          const baseColor = baseColors[Math.floor(Math.random() * baseColors.length)];
          const color = mutateColor(baseColor);
          const spawnPos: [number, number, number] = [
            ore.position.x + (Math.random() - 0.5) * 4,
            0.5,
            ore.position.z + (Math.random() - 0.5) * 4,
          ];
          const entry: CritterRegistryEntry = {
            id: newId, name: newId, color, spawnPosition: spawnPos, isAlive: true, generation: 0,
          };
          store.addCritter(entry);
          store.updateResourceNode(ore.id, { capacity: ore.capacity - 0.3 });
          store.addRobotMemory(createMemory(
            `鉱石の近くで新しいクリッター(${newId})が自然発生した`,
            'event', [newId, 'environment'], 0.6
          ));
        }
      }
    }
  });

  return {
    dispose: () => {
      clearInterval(weatherInterval);
    }
  };
}
