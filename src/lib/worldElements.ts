export interface WorldElement {
    id: string;
    type: 'creature' | 'plant' | 'water' | 'landmark' | 'resource';
    name: string;
    description: string;
    position: { x: number; z: number };
    radius: number;
    timeCondition?: (time: number) => boolean;
}

// 夜間判定 (18時〜6時)
const isNight = (time: number) => time >= 18 || time < 6;

// 全世界要素の定義（レンダリング位置と一致させる）
export const WORLD_ELEMENTS: WorldElement[] = [
    // === 発光キノコクラスター ===
    { id: 'mushroom-1', type: 'plant', name: '光るキノコ', description: '地面に光るキノコが生えている', position: { x: -8, z: 12 }, radius: 3 },
    { id: 'mushroom-2', type: 'plant', name: '光るキノコ', description: '紫っぽいキノコが何本か生えている', position: { x: 15, z: -8 }, radius: 3 },
    { id: 'mushroom-3', type: 'plant', name: '光るキノコ', description: '岩の陰にキノコが生えている', position: { x: -18, z: -15 }, radius: 3 },
    { id: 'mushroom-4', type: 'plant', name: '光るキノコ', description: 'キノコが輪っかみたいに生えている', position: { x: 25, z: 20 }, radius: 3 },
    { id: 'mushroom-5', type: 'plant', name: '光るキノコ', description: '岩の上にキノコが生えている', position: { x: -30, z: 5 }, radius: 3 },

    // === 異星の花 ===
    { id: 'flower-cluster-1', type: 'plant', name: '変な花', description: 'ピンクと紫の花が咲いている', position: { x: 5, z: 10 }, radius: 4 },
    { id: 'flower-cluster-2', type: 'plant', name: '変な花', description: 'オレンジの花がいくつか咲いている', position: { x: -12, z: -5 }, radius: 4 },
    { id: 'flower-cluster-3', type: 'plant', name: '変な花', description: 'でかい花が一輪咲いている', position: { x: 20, z: 5 }, radius: 3 },

    // === 川 ===
    { id: 'river-main', type: 'water', name: '川', description: '近くに小さな川が流れている', position: { x: -5, z: -5 }, radius: 8 },

    // === 蝶（日中）===
    { id: 'butterflies-1', type: 'creature', name: '蝶', description: '蝶が何匹か飛んでいる', position: { x: 5, z: 10 }, radius: 6, timeCondition: (t) => t >= 6 && t < 18 },

    // === 蛍（夜間）===
    { id: 'fireflies-1', type: 'creature', name: '蛍', description: '蛍が光りながら飛んでいる', position: { x: -8, z: 12 }, radius: 8, timeCondition: isNight },
    { id: 'fireflies-2', type: 'creature', name: '蛍', description: '川の上を蛍が飛んでいる', position: { x: -5, z: -5 }, radius: 6, timeCondition: isNight },

    // === 池の魚 ===
    { id: 'fish-pond-1', type: 'creature', name: '魚', description: '池に魚がいる', position: { x: 10, z: 15 }, radius: 5 },
    { id: 'fish-pond-2', type: 'creature', name: '魚', description: '池で魚が泳いでいる', position: { x: -20, z: -10 }, radius: 6 },

    // === 既存のランドマーク ===
    { id: 'crystal-1', type: 'landmark', name: 'クリスタル', description: '大きい結晶が突き出ている', position: { x: -5, z: -5 }, radius: 3 },
    { id: 'crystal-2', type: 'landmark', name: 'クリスタル', description: '小さいクリスタルがある', position: { x: 5, z: 5 }, radius: 3 },
    { id: 'monolith-1', type: 'landmark', name: 'モノリス', description: '黒い石柱が立っている', position: { x: -3, z: 6 }, radius: 3 },
    { id: 'datatower-1', type: 'landmark', name: 'データタワー', description: 'データタワーがある', position: { x: 8, z: -8 }, radius: 4 },

    // === リソースノード ===
    { id: 'res-ore-1', type: 'resource', name: '鉱石', description: '光る鉱石が地面に露出している', position: { x: -25, z: 15 }, radius: 3 },
    { id: 'res-ore-2', type: 'resource', name: '鉱石', description: '鉄色の鉱石がある', position: { x: 20, z: -20 }, radius: 3 },
    { id: 'res-ore-3', type: 'resource', name: '鉱石', description: '結晶っぽい鉱石がある', position: { x: 30, z: 10 }, radius: 3 },
    { id: 'res-energy-1', type: 'resource', name: 'エネルギーノード', description: '光るエネルギーの柱がある', position: { x: 8, z: -8 }, radius: 3 },
    { id: 'res-energy-2', type: 'resource', name: 'エネルギーノード', description: 'エネルギーが湧き出ている', position: { x: -5, z: -5 }, radius: 3 },

    // === 野生動物 ===
    { id: 'wild-deer', type: 'creature', name: '鹿', description: '鹿が歩いている', position: { x: -18, z: 18 }, radius: 10 },
    { id: 'wild-bird', type: 'creature', name: '鳥', description: '鳥が空を飛んでいる', position: { x: 5, z: 12 }, radius: 15 },
    { id: 'wild-rabbit', type: 'creature', name: 'うさぎ', description: 'うさぎがぴょんぴょん跳ねている', position: { x: 10, z: 5 }, radius: 8 },
];

// 指定位置から範囲内の要素を返す（時間条件も考慮）
export function getNearbyElements(x: number, z: number, range: number, time: number): WorldElement[] {
    return WORLD_ELEMENTS.filter(elem => {
        const dx = elem.position.x - x;
        const dz = elem.position.z - z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > range + elem.radius) return false;
        if (elem.timeCondition && !elem.timeCondition(time)) return false;
        return true;
    });
}

// LLMプロンプト用の観察テキストを生成（最大2つ、ランダムに選ぶ）
export function elementsToObservationContext(elements: WorldElement[]): string {
    if (elements.length === 0) return '';
    // Shuffle and pick up to 2 to avoid repetition
    const shuffled = [...elements].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 2);
    return picked.map(e => e.description).join('。');
}

// 近くの要素から会話テーマを動的に生成
export function generateThemeFromElements(elements: WorldElement[]): string {
    if (elements.length === 0) {
        // 何もなければ汎用テーマからランダム
        const fallbacks = ['天気のこと', '最近見たもの', '周りの様子', 'おなかの空き具合', '今日の過ごし方'];
        return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }

    // ランダムに1つだけ選ぶ（同じ話題ばかりにならないように）
    const elem = elements[Math.floor(Math.random() * elements.length)];
    switch (elem.type) {
        case 'creature':
            return `近くの${elem.name}のこと`;
        case 'plant':
            return `そこに生えてる${elem.name}のこと`;
        case 'water':
            return `${elem.name}のこと`;
        case 'landmark':
            return `${elem.name}のこと`;
        case 'resource':
            return `${elem.name}のこと`;
    }
}

// envContextを構築する統合関数
export function buildEnvContext(
    time: number,
    weather: string,
    entityX: number,
    entityZ: number
): string {
    const base = `時刻: ${Math.floor(time)}時, 天気: ${weather}`;
    const nearby = getNearbyElements(entityX, entityZ, 12, time);
    if (nearby.length === 0) return base;
    const observations = elementsToObservationContext(nearby);
    return `${base}。周囲: ${observations}`;
}
