import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { shouldTriggerWeatherEvent, createWeatherEvent, applyWeatherDamage } from '../lib/environment';

/**
 * WeatherEventManager - 天候イベントの管理とダメージ適用
 * Phase 1: Environmental threats system
 */
export const WeatherEventManager = () => {
    const lastEventCheck = useRef(0);
    const eventCheckInterval = 60; // 60秒ごとにイベント発生をチェック

    useFrame((_, delta) => {
        const state = useStore.getState();
        const {
            currentWeatherEvent,
            weatherEventWarningShown,
            setWeatherEvent,
            setWeatherEventWarningShown,
            addActivityLog,
            incrementCatastrophesSurvived,
            updateRobotStatus,
            robotStatus,
            time,
            weather,
            temperature,
            day,
            season,
            buildings,
            entityPositions,
        } = state;

        const gameTime = time + day * 24; // ゲーム内の経過時間（時間単位）

        // 天候イベントのチェック（60秒ごと）
        lastEventCheck.current += delta;
        if (lastEventCheck.current >= eventCheckInterval) {
            lastEventCheck.current = 0;

            // 現在イベントがない場合、新しいイベントを発生させるかチェック
            if (!currentWeatherEvent) {
                const eventType = shouldTriggerWeatherEvent(weather, temperature, day, season);
                if (eventType) {
                    const event = createWeatherEvent(eventType, gameTime);
                    setWeatherEvent(event);

                    // 警告ログを追加
                    addActivityLog({
                        category: 'warning',
                        importance: 'critical',
                        entityId: 'system',
                        content: `⚠️ ${event.warning.message}`,
                    });
                }
            }
        }

        // 現在のイベントを処理
        if (currentWeatherEvent) {
            const eventElapsedTime = (gameTime - currentWeatherEvent.startTime) * 3600; // 秒単位に変換

            // 警告期間中
            if (eventElapsedTime < currentWeatherEvent.warning.timeBeforeStart) {
                if (!weatherEventWarningShown) {
                    setWeatherEventWarningShown(true);
                    // 警告は既にイベント開始時にログ記録済み
                }
            }
            // イベント発生中
            else if (eventElapsedTime < currentWeatherEvent.warning.timeBeforeStart + currentWeatherEvent.duration) {
                // イベント開始の通知（警告期間が終わった直後）
                if (weatherEventWarningShown && eventElapsedTime >= currentWeatherEvent.warning.timeBeforeStart && eventElapsedTime < currentWeatherEvent.warning.timeBeforeStart + delta) {
                    addActivityLog({
                        category: 'event',
                        importance: 'high',
                        entityId: 'system',
                        content: `🌪️ ${currentWeatherEvent.name}が発生しました！`,
                    });
                }

                // シェルター内にいるかチェック（簡易版：建物の範囲内にいるか）
                const robotPos = entityPositions['robot'];
                let inShelter = false;
                let shelterType: 'none' | 'tent' | 'wooden_shelter' | 'reinforced_shelter' = 'none';

                if (robotPos && buildings.length > 0) {
                    for (const building of buildings) {
                        if (!building.built) continue;
                        const dist = Math.sqrt(
                            (robotPos.x - building.position.x) ** 2 +
                            (robotPos.z - building.position.z) ** 2
                        );
                        if (dist < building.radius && building.effects.shelterProtection) {
                            inShelter = true;
                            shelterType = building.type as typeof shelterType;
                            break;
                        }
                    }
                }

                // ロボットにダメージを適用
                const damageResult = applyWeatherDamage(
                    currentWeatherEvent,
                    robotStatus,
                    { health: 100, hunger: 0, fatigue: 0, temperature: 20, isDying: false, starvationTimer: 0 }, // クリッターは後で実装
                    delta,
                    inShelter,
                    shelterType
                );

                updateRobotStatus(damageResult.robot);

                // TODO: クリッターにもダメージを適用
            }
            // イベント終了
            else {
                addActivityLog({
                    category: 'event',
                    importance: 'normal',
                    entityId: 'system',
                    content: `✅ ${currentWeatherEvent.name}が収まりました`,
                });
                incrementCatastrophesSurvived();
                setWeatherEvent(null);
            }
        }
    });

    return null; // このコンポーネントは何もレンダリングしない
};
