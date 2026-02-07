import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { updateConstructionProgress } from '../lib/building';

/**
 * BuildingManager - 建設進捗の管理とログ記録
 * Phase 1: Building system
 */
export const BuildingManager = () => {
    useFrame((_, delta) => {
        const state = useStore.getState();
        const { buildings, updateBuilding, addActivityLog, addTimelineEvent } = state;

        // 建設中の建物を更新
        for (const building of buildings) {
            if (!building.built && building.constructionProgress > 0) {
                const updated = updateConstructionProgress(building, delta, 1); // workerCount = 1 (robot only)

                // 進捗が変わった場合のみ更新
                if (updated.constructionProgress !== building.constructionProgress) {
                    updateBuilding(building.id, {
                        constructionProgress: updated.constructionProgress,
                        built: updated.built,
                    });

                    // 建設完了時の処理
                    if (updated.built && !building.built) {
                        // ログ記録
                        addActivityLog({
                            category: 'build',
                            importance: 'high',
                            entityId: 'robot',
                            content: `🏗️ ${building.name}の建設が完了しました！`,
                        });

                        // タイムラインに記録
                        addTimelineEvent({
                            type: 'build',
                            description: `${building.name}を建設`,
                            importance: 0.8,
                        });
                    }
                }
            }
        }
    });

    return null; // このコンポーネントは何もレンダリングしない
};
