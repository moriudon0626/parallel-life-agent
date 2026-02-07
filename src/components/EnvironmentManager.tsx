import { useFrame } from "@react-three/fiber";
import { useStore } from "../store";
import { createMemory } from "../store";
import { useEffect, useRef } from "react";
import { applyEmotionEvent } from "../lib/emotions";
import { regenerateResources } from "../lib/resources";
import { mutateColor } from "../lib/lifecycle";
import type { CritterRegistryEntry } from "../store";
import { shouldTriggerWeatherEvent, createWeatherEvent, isWeatherEventActive, getWeatherWarning } from "../lib/environment";

type WeatherType = 'sunny' | 'rainy' | 'cloudy' | 'snowy';
type SeasonType = 'spring' | 'summer' | 'autumn' | 'winter';

// Season weather probabilities
const SEASON_WEATHER: Record<SeasonType, Record<WeatherType, number>> = {
    spring: { sunny: 0.45, cloudy: 0.25, rainy: 0.20, snowy: 0.10 },
    summer: { sunny: 0.55, cloudy: 0.25, rainy: 0.15, snowy: 0.05 },
    autumn: { sunny: 0.30, cloudy: 0.30, rainy: 0.25, snowy: 0.15 },
    winter: { sunny: 0.20, cloudy: 0.25, rainy: 0.15, snowy: 0.40 },
};

// Season temperature modifiers
const SEASON_TEMP_MOD: Record<SeasonType, number> = {
    spring: 0,
    summer: 5,
    autumn: -2,
    winter: -8,
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

// 天気遷移の順序を定義: 必ず曇りを経由する
function getNextWeatherStep(current: WeatherType, target: WeatherType): WeatherType | null {
    if (current === target) return null;
    // sunny <-> cloudy <-> rainy/snowy
    if (current === 'sunny') return 'cloudy';
    if (current === 'cloudy') {
        if (target === 'sunny') return 'sunny';
        return target; // rainy or snowy
    }
    // rainy/snowy -> must go through cloudy first
    if (current === 'rainy' || current === 'snowy') {
        if (target === current) return null;
        return 'cloudy';
    }
    return null;
}

// 気温の計算: 時刻 + 天気 + 季節で決定
function calculateTemperature(time: number, weather: WeatherType, season: SeasonType): number {
    // 時刻ベースの基本気温 (14時にピーク22°C, 2時に最低6°C)
    const base = 14 + 8 * Math.sin(((time - 8) / 24) * Math.PI * 2);

    // 天気による補正
    const weatherModifier: Record<WeatherType, number> = {
        sunny: 3,
        cloudy: -1,
        rainy: -4,
        snowy: -10,
    };

    return Math.round((base + weatherModifier[weather] + SEASON_TEMP_MOD[season]) * 10) / 10;
}

export const EnvironmentManager = () => {
    const time = useStore((state) => state.time);
    const weather = useStore((state) => state.weather);
    const setTime = useStore((state) => state.setTime);
    const setDay = useStore((state) => state.setDay);
    const setSeason = useStore((state) => state.setSeason);
    const setWeather = useStore((state) => state.setWeather);
    const setTemperature = useStore((state) => state.setTemperature);
    const lastEmotionBroadcast = useRef(0);
    const lastResourceRegen = useRef(0);
    const lastCritterSpawnCheck = useRef(0);
    const lastWeatherEventCheck = useRef(0);
    const lastWeatherWarningCheck = useRef(0);

    // 天気遷移用のref
    const targetWeather = useRef<WeatherType>(weather);
    const weatherStepTimer = useRef(0);
    const lastTempUpdate = useRef(0);
    const prevTime = useRef(time);

    // 時間の更新 (3倍速: 約8分で1日)
    useFrame((state, delta) => {
        const t = state.clock.getElapsedTime();
        const timeIncrement = (delta / 60) * 3;
        let nextTime = time + timeIncrement;

        // Day wrap detection
        if (nextTime >= 24) {
            nextTime -= 24;
            const store = useStore.getState();
            const newDay = store.day + 1;
            setDay(newDay);
            const newSeason = getSeasonFromDay(newDay);
            if (newSeason !== store.season) {
                setSeason(newSeason);
            }
            // Pick new target weather based on season at start of each day
            targetWeather.current = pickSeasonWeather(newSeason);
        }
        prevTime.current = nextTime;
        setTime(nextTime);

        // 天気の段階的遷移 (30秒ごとに1ステップ進む)
        if (t - weatherStepTimer.current > 30.0) {
            weatherStepTimer.current = t;
            const currentWeather = useStore.getState().weather;
            const nextStep = getNextWeatherStep(currentWeather, targetWeather.current);
            if (nextStep) {
                setWeather(nextStep);
            }
        }

        // 気温の更新 (2秒ごと)
        if (t - lastTempUpdate.current > 2.0) {
            lastTempUpdate.current = t;
            const store = useStore.getState();
            const temp = calculateTemperature(store.time, store.weather, store.season);
            setTemperature(temp);
        }

        // === WEATHER EVENT SYSTEM ===
        // Check for new weather events (every 60 seconds)
        if (t - lastWeatherEventCheck.current > 60.0) {
            lastWeatherEventCheck.current = t;
            const store = useStore.getState();

            // Only trigger new event if no current event is active
            if (!store.currentWeatherEvent || !isWeatherEventActive(store.currentWeatherEvent, store.time * 3600 + store.day * 86400)) {
                const eventType = shouldTriggerWeatherEvent(
                    store.weather,
                    store.temperature,
                    store.day,
                    store.season
                );

                if (eventType) {
                    const gameTime = store.time * 3600 + store.day * 86400;
                    const event = createWeatherEvent(eventType, gameTime);
                    store.setWeatherEvent(event);
                    store.setWeatherEventWarningShown(false);

                    console.log('[Weather Event] New event triggered:', event.name, 'Duration:', event.duration, 's');
                }
            }
        }

        // Check for weather event warnings (every 5 seconds)
        if (t - lastWeatherWarningCheck.current > 5.0) {
            lastWeatherWarningCheck.current = t;
            const store = useStore.getState();
            const currentEvent = store.currentWeatherEvent;

            if (currentEvent && !store.weatherEventWarningShown) {
                const gameTime = store.time * 3600 + store.day * 86400;
                const warning = getWeatherWarning(currentEvent, gameTime);

                if (warning) {
                    store.addActivityLog({
                        category: 'warning',
                        importance: 'critical',
                        entityId: 'system',
                        content: warning,
                    });
                    store.setWeatherEventWarningShown(true);
                    console.log('[Weather Warning]', warning);
                }
            }

            // Check if event has ended
            if (currentEvent) {
                const gameTime = store.time * 3600 + store.day * 86400;
                if (!isWeatherEventActive(currentEvent, gameTime)) {
                    // Event ended
                    store.addActivityLog({
                        category: 'event',
                        importance: 'normal',
                        entityId: 'system',
                        content: `✅ ${currentEvent.name}が終息しました`,
                    });
                    store.setWeatherEvent(null);
                    store.setWeatherEventWarningShown(false);
                    console.log('[Weather Event] Event ended:', currentEvent.name);
                }
            }
        }

        // Resource regeneration (every 2 seconds)
        if (t - lastResourceRegen.current > 2.0) {
            lastResourceRegen.current = t;
            const store = useStore.getState();
            const updated = regenerateResources(store.resourceNodes, 2.0);
            // Only update if any changed
            const changed = updated.some((r, i) => r.capacity !== store.resourceNodes[i].capacity);
            if (changed) {
                useStore.setState({ resourceNodes: updated });
            }
        }

        // 環境感情ブロードキャスト (5秒ごと)
        if (t - lastEmotionBroadcast.current > 5.0) {
            lastEmotionBroadcast.current = t;
            const store = useStore.getState();
            const currentTime = store.time;
            const currentWeather = store.weather;
            const emotions = store.entityEmotions;
            const entities = Object.keys(emotions);

            entities.forEach(id => {
                let emotion = emotions[id];
                if (!emotion) return;

                // Weather effects (low intensity)
                if (currentWeather === 'rainy') emotion = applyEmotionEvent(emotion, 'weather_rain', 0.3);
                else if (currentWeather === 'snowy') emotion = applyEmotionEvent(emotion, 'weather_snow', 0.3);
                else if (currentWeather === 'sunny') emotion = applyEmotionEvent(emotion, 'weather_sunny', 0.3);

                // Time effects
                if (currentTime < 5 || currentTime > 21) {
                    emotion = applyEmotionEvent(emotion, 'night_time', 0.3);
                } else if (currentTime >= 5 && currentTime < 7) {
                    emotion = applyEmotionEvent(emotion, 'dawn', 0.3);
                }

                store.updateEntityEmotion(id, emotion);
            });
        }

        // Critter spawning from minerals (every 30 seconds)
        if (t - lastCritterSpawnCheck.current > 30.0) {
            lastCritterSpawnCheck.current = t;
            const store = useStore.getState();
            const aliveCount = store.critterRegistry.filter(c => c.isAlive).length;

            if (aliveCount < 3) {
                // Find mineral ores with enough capacity
                const validOres = store.resourceNodes.filter(
                    r => r.type === 'mineral_ore' && r.capacity > 0.3
                );
                if (validOres.length > 0) {
                    const ore = validOres[Math.floor(Math.random() * validOres.length)];
                    const totalCritters = store.critterRegistry.length;
                    const newId = `Critter-${String.fromCharCode(65 + totalCritters)}`;

                    // Random color mutation from base colors
                    const baseColors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a78bfa', '#f97316'];
                    const baseColor = baseColors[Math.floor(Math.random() * baseColors.length)];
                    const color = mutateColor(baseColor);

                    const spawnPos: [number, number, number] = [
                        ore.position.x + (Math.random() - 0.5) * 4,
                        0.5,
                        ore.position.z + (Math.random() - 0.5) * 4,
                    ];

                    const entry: CritterRegistryEntry = {
                        id: newId,
                        name: newId,
                        color,
                        spawnPosition: spawnPos,
                        isAlive: true,
                        generation: 0,
                    };

                    store.addCritter(entry);

                    // Consume ore capacity
                    store.updateResourceNode(ore.id, { capacity: ore.capacity - 0.3 });

                    // Add memory event
                    store.addRobotMemory(createMemory(
                        `鉱石の近くで新しいクリッター(${newId})が自然発生した`,
                        'event',
                        [newId, 'environment'],
                        0.6
                    ));
                }
            }
        }
    });

    // 目標天気の定期変更 (90秒ごとにターゲットを選ぶ、実際の遷移は段階的)
    useEffect(() => {
        const interval = setInterval(() => {
            const store = useStore.getState();
            targetWeather.current = pickSeasonWeather(store.season);
        }, 90000);

        return () => clearInterval(interval);
    }, []);

    return null;
};
