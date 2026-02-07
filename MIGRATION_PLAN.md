# Parallel Life Agent: Babylon.js 移行計画書

## 1. 概要

### 1.1 現行スタック
| 技術 | バージョン |
|------|-----------|
| React | 19.2.0 |
| Three.js | 0.182.0 |
| React Three Fiber (R3F) | 9.5.0 |
| @react-three/rapier (Rapier) | 2.2.0 |
| @react-three/drei | 10.7.7 |
| @react-three/postprocessing | 3.0.4 |
| Zustand | 5.0.11 |
| Vite | 7.2.4 |
| TypeScript | 5.9.3 |

### 1.2 移行先スタック
| 技術 | 用途 |
|------|------|
| @babylonjs/core | 3Dレンダリングエンジン |
| @babylonjs/havok | 物理エンジン（Havok WASM） |
| @babylonjs/addons | Navigation Plugin V2（Recast NavMesh） |
| react-babylonjs | React 宣言的バインディング |
| Zustand 5 | 状態管理（変更なし） |
| Vite 7 | ビルドツール（変更なし） |
| React 19 + TypeScript 5.9 | 変更なし |

### 1.3 react-babylonjs を選ぶ理由
- Reactylon（もう一つの選択肢）より **コミュニティが大きい**（GitHub 885 vs 221 stars）
- **Zustand との統合パターン**が公式 Storybook で文書化されている（tunnel パターン）
- Zustand はモジュールレベルのシングルトンなので、React reconciler 境界を跨いでも動作する
- R3F と同じ reconciler アーキテクチャなので、既存の開発経験が活きる

### 1.4 プロジェクト規模
| 区分 | ファイル数 | 行数 | 移行作業 |
|------|-----------|------|---------|
| そのまま再利用 | 15 | 4,704 | なし |
| 軽微な修正 | 6 | 1,170 | フレームワーク非依存の微調整 |
| 書き直し | 13 | 4,044 | R3F/Rapier → Babylon.js/Havok |
| **合計** | **39** | **9,918** | **約 69% 再利用可能** |

---

## 2. ファイル分類一覧

### 2.1 そのまま再利用（変更不要）- 15ファイル / 4,704 LOC

| ファイル | 行数 | 内容 |
|---------|------|------|
| `store.ts` | 836 | Zustand ストア（全ゲーム状態） |
| `Interface.tsx` | 923 | UI全体（チャット、設定、スコア等） |
| `ErrorBoundary.tsx` | 65 | エラーハンドリング |
| `lib/emotions.ts` | 211 | 感情システム |
| `lib/needs.ts` | 151 | 欲求システム |
| `lib/lifecycle.ts` | 144 | ライフサイクル（誕生〜死） |
| `lib/activities.ts` | 151 | 行動選択ロジック |
| `lib/relationships.ts` | 45 | 関係性・親密度 |
| `lib/scoring.ts` | 401 | スコアリング・実績 |
| `lib/survival.ts` | 391 | サバイバルステータス |
| `lib/resources.ts` | 160 | リソースノード管理 |
| `lib/terrain.ts` | 35 | 地形高さ計算（純粋数学） |
| `lib/noise.ts` | 109 | Simplex ノイズ（純粋数学） |
| `lib/biomes.ts` | 64 | バイオームシステム |
| `lib/worldElements.ts` | 118 | 環境要素の近接検索 |

### 2.2 軽微な修正 - 6ファイル / 1,170 LOC

| ファイル | 行数 | 修正内容 |
|---------|------|---------|
| `lib/llm.ts` | 309 | 変更なし（外部API連携） |
| `lib/speech.ts` | 346 | 変更なし（TTS連携） |
| `lib/ambientAudio.ts` | 286 | 変更なし（Howler.js） |
| `lib/environment.ts` | 377 | エフェクト部分のみ Babylon API へ |
| `lib/building.ts` | 326 | メッシュ生成部分のみ MeshBuilder へ |
| `AmbientSounds.tsx` | 53 | `useFrame` → `registerBeforeRender` |

### 2.3 書き直し - 13ファイル / 4,044 LOC

| ファイル | 行数 | 書き直し対象 | 再利用可能なロジック |
|---------|------|-------------|-------------------|
| `Robot.tsx` | 736 | 物理制御・レンダリング | AI思考・感情・欲求ループ（~400行） |
| `Critter.tsx` | 876 | 物理制御・レンダリング | ライフサイクル・対話ロジック（~500行） |
| `WildAnimal.tsx` | 645 | 物理制御・レンダリング | 捕食/逃走AI（~350行） |
| `World.tsx` | 256 | 地形・ライティング全体 | 高さ計算ロジック |
| `Experience.tsx` | 142 | シーン構成全体 | なし |
| `App.tsx` | 26 | Canvas → Engine/Scene | なし |
| `WeatherEffects.tsx` | 180 | パーティクルシステム | パーティクル配置ロジック |
| `PostProcessing.tsx` | 29 | ポストプロセッシング | なし |
| `EnvironmentObjects.tsx` | 127 | 静的オブジェクト | 配置座標 |
| `Vegetation.tsx` | 202 | 植物レンダリング | シード乱数配置ロジック |
| `Plants.tsx` | 280 | キノコ・花レンダリング | クラスター生成ロジック |
| `Water.tsx` / `River.tsx` | 169 | 水面・川レンダリング | 波形計算 |
| `Creatures.tsx` | 306 | 蝶・蛍・魚 | アニメーションパラメータ |
| `ResourceNodes.tsx` | 124 | リソースノード表示 | なし |

---

## 3. フェーズ別移行計画

### フェーズ 0: 準備（1日）

**目的**: 新しい Babylon.js プロジェクト骨格を作り、既存の再利用可能コードをコピーする

#### 0-1. プロジェクトセットアップ
```bash
# 新しいブランチで作業
git checkout -b feature/babylon-migration

# Babylon.js 関連パッケージをインストール
npm install @babylonjs/core @babylonjs/havok @babylonjs/addons @babylonjs/loaders
npm install react-babylonjs

# R3F 関連パッケージを削除（最終フェーズで実行）
# npm uninstall @react-three/fiber @react-three/drei @react-three/rapier @react-three/postprocessing three
```

#### 0-2. Vite 設定の更新
```typescript
// vite.config.ts に追加
optimizeDeps: {
  exclude: ['@babylonjs/havok']  // WASM のプリバンドル防止
}
```

#### 0-3. ファイル構成の変更
```
src/
├── components/
│   ├── babylon/          # ← 新規: Babylon.js 3Dコンポーネント
│   │   ├── BabylonScene.tsx    # Experience.tsx の後継
│   │   ├── Terrain.tsx         # World.tsx の後継
│   │   ├── RobotAgent.tsx      # Robot.tsx の後継
│   │   ├── CritterAgent.tsx    # Critter.tsx の後継
│   │   └── ...
│   ├── Interface.tsx     # そのまま
│   └── ErrorBoundary.tsx # そのまま
├── lib/                  # そのまま（全ファイル再利用）
├── store.ts              # そのまま
├── App.tsx               # 書き直し（Canvas → Engine/Scene）
└── main.tsx              # そのまま
```

#### 0-4. 完了条件
- [ ] Babylon.js パッケージがインストールされている
- [ ] 空の Babylon.js シーンが表示される（黒い画面 + カメラ操作可能）
- [ ] 既存の `lib/` ファイルがそのまま import できる
- [ ] Zustand ストアが Babylon シーン内から読み書きできる

---

### フェーズ 1: 基盤構築 — シーン・地形・物理（2〜3日）

**目的**: 地形が表示され、物理エンジンで球体が地面に落ちて正しく衝突する状態を作る

#### 1-1. App.tsx の書き直し
```tsx
// 旧: R3F Canvas
<Canvas camera={{ position: [0, 15, 25], fov: 60 }}>
  <Suspense><Experience /></Suspense>
</Canvas>

// 新: react-babylonjs Engine/Scene
<Engine antialias adaptToDeviceRatio canvasId="babylon-canvas">
  <Scene enablePhysics={[new Vector3(0, -1.62, 0), havokPlugin]}>
    <BabylonScene />
  </Scene>
</Engine>
```

#### 1-2. カメラ設定
- `OrbitControls` → `ArcRotateCamera`
- ズーム制限（min: 3, max: 80）を `lowerRadiusLimit` / `upperRadiusLimit` で設定
- 極角制限を `lowerBetaLimit` / `upperBetaLimit` で設定

#### 1-3. 地形の実装
```
HeightfieldCollider (Rapier) → PhysicsShapeHeightField (Havok)
```

- `MeshBuilder.CreateGround` で視覚メッシュを作成（200x200, 128x128セグメント）
- 頂点位置を既存の `getTerrainHeight()` で設定
- 頂点カラーを既存の高さベースロジックで塗り分け
- `PhysicsShapeHeightField` で物理コライダーを作成
- `PhysicsBody` (STATIC) を地形メッシュに紐付け

#### 1-4. 物理テスト用の球体
- `MeshBuilder.CreateSphere` でテスト球体を作成
- `PhysicsAggregate` (SPHERE, mass: 1) を追加
- `setContinuousCollisionDetection(true)` を有効化
- 球体が地形に正しく着地し、めり込まないことを確認

#### 1-5. ライティング
- `DirectionalLight` + シャドウジェネレーター（2048x2048）
- `HemisphericLight` で環境光
- 動的な昼夜サイクル（既存ロジック再利用、`registerBeforeRender` で更新）

#### 1-6. 完了条件
- [ ] 地形が正しく表示される（頂点カラー付き）
- [ ] テスト球体が地形上に正しく落下・静止する
- [ ] カメラ操作（回転・ズーム）が動作する
- [ ] 昼夜サイクルでライティングが変化する
- [ ] Havok 物理で **めり込みが発生しない**

---

### フェーズ 2: ロボットエージェント（2〜3日）

**目的**: ロボットが地形上を移動し、AI思考ループが動作する

#### 2-1. ロボットの物理ボディ
```
RigidBody + Ball Collider (Rapier) → PhysicsAggregate (SPHERE, Havok)
```

- `PhysicsMotionType.DYNAMIC` で動的ボディを作成
- `setContinuousCollisionDetection(true)` を有効化
- 重力: Moon gravity (-1.62) はシーン全体で設定済み

#### 2-2. 移動制御
```
setLinvel() (Rapier) → body.setLinearVelocity() (Havok)
setRotation() (Rapier) → mesh.rotationQuaternion (Babylon)
setLinearDamping() (Rapier) → body.setLinearDamping() (Havok)
```

#### 2-3. 近接検知（センサーコライダー）
```
CylinderCollider + onIntersectionEnter (Rapier)
  → PhysicsBody トリガー or メッシュ交差判定 (Babylon)
```

選択肢:
- **A. PhysicsBody のトリガー**: `body.setCollisionCallbackEnabled(true)` + `observable`
- **B. 距離ベース判定**: 毎フレーム他エンティティとの距離を計算（現行もほぼこの方式）
- **推奨: B**（シンプルで十分、現行の挙動に近い）

#### 2-4. AI思考ループの接続
- 既存の感情・欲求・活動選択ロジックをそのまま import
- `registerBeforeRender` 内で `useFrame` 相当の更新ループを実行
- LLM 呼び出し（思考生成）はそのまま動作

#### 2-5. ロボットのビジュアル
- Body: `MeshBuilder.CreatePolyhedron`（正十二面体）
- Head: `MeshBuilder.CreateBox`（浮遊するディスプレイ）
- Ring: `MeshBuilder.CreateTorus`
- マテリアル: `PBRMaterial` (metallic: 0.5, roughness: 0.3)

#### 2-6. 吹き出し（セリフ・思考）
- `Html` (drei) → HTML overlay（DOM要素をキャンバス上に配置）
- Babylon.js の `GUI.TextBlock` or 既存の React DOM overlay で実装
- **推奨**: 既存の React DOM overlay 方式を維持（Interface.tsx と統合しやすい）

#### 2-7. 完了条件
- [ ] ロボットが地形上を移動する（めり込まない）
- [ ] AI思考ループが動作し、活動を選択する
- [ ] 感情・欲求が時間経過で変化する
- [ ] セリフ・思考の吹き出しが表示される
- [ ] カメラがロボットを追従する

---

### フェーズ 3: クリッター＋野生動物（3〜4日）

**目的**: クリッターと野生動物が地形上で活動し、ロボットと対話できる

#### 3-1. クリッター
- Robot と同じ物理ボディパターン（`PhysicsAggregate` + SPHERE）
- 既存のライフサイクル・繁殖・死亡ロジックをそのまま接続
- 対話システム（LLM呼び出し）はそのまま動作
- ビジュアル: `MeshBuilder.CreatePolyhedron`（正二十面体）+ 目（小球体）

#### 3-2. 野生動物
- 鹿・鳥・兎・狼の各モデルを MeshBuilder で構築
- 鳥: `gravityFactor = 0` で飛行（Havok の `body.setGravityFactor(0)`）
- 兎: `applyImpulse()` でジャンプ（Havok の `body.applyImpulse()`）
- 捕食/逃走AI: 既存ロジックをそのまま接続

#### 3-3. NavMesh の導入（新機能）
```typescript
// Navigation Plugin V2
const navigationPlugin = await ADDONS.CreateNavigationPluginAsync();
navigationPlugin.createNavMesh([terrainMesh], {
  cs: 0.2, ch: 0.2,
  walkableSlopeAngle: 35,
  walkableHeight: 1,
  walkableRadius: 0.5
});

// Crowd エージェント
const crowd = navigationPlugin.createCrowd(50, 0.5, scene);
```

- クリッターと野生動物を crowd エージェントとして登録
- 山を迂回し、崖を避ける賢い移動が可能に
- **これにより、現在の「直進して山にめり込む」問題が根本解決される**

#### 3-4. 完了条件
- [ ] クリッターが地形上を移動し、対話できる
- [ ] ライフサイクル（誕生・成長・繁殖・死亡）が動作する
- [ ] 野生動物が適切に行動する（飛行・ジャンプ・捕食）
- [ ] NavMesh でエージェントが障害物を回避して移動する

---

### フェーズ 4: 環境・エフェクト（2〜3日）

**目的**: 空・天候・植物・水面など環境要素を移行する

#### 4-1. 空・星
- `Sky` (drei) → Babylon.js の `SkyMaterial` or カスタムスカイボックス
- `Stars` (drei) → `SolidParticleSystem` で星を配置
- 太陽位置の計算ロジックは既存のものを再利用

#### 4-2. フォグ
- Three.js の `<fog>` → `scene.fogMode` + `scene.fogStart` / `scene.fogEnd`
- 天候ベースの動的フォグロジックはそのまま再利用

#### 4-3. 天候パーティクル
- 雨・雪・蛍・塵 → Babylon.js の `ParticleSystem`
- `ParticleSystem` は Three.js の `Points` より高機能:
  - 自動ライフタイム管理
  - 重力・風の影響
  - カラーグラデーション
  - サイズ変化
- 手動の頂点位置更新が不要になる

#### 4-4. 植物・キノコ・花
- 既存のシード乱数配置ロジックを再利用
- ジオメトリ: `MeshBuilder.CreateCylinder`, `CreateSphere` 等
- `Float` (drei) → `registerBeforeRender` で `position.y` を sin() で上下
- `Sparkles` (drei) → `ParticleSystem` で代替
- **インスタンシング**: 同一メッシュを `mesh.createInstance()` で複製（描画コール大幅削減）

#### 4-5. 水面・川
- `Water.tsx` → Babylon.js の `WaterMaterial`（組み込み機能）
  - 反射・屈折・波形が自動で付く
- `River.tsx` → `MeshBuilder.CreateRibbon` + `WaterMaterial`

#### 4-6. 静的オブジェクト（クリスタル・モノリス・タワー・山）
- MeshBuilder で同等のジオメトリを構築
- PBRMaterial でマテリアル設定

#### 4-7. 完了条件
- [ ] 昼夜サイクルで空の色が変化する
- [ ] 天候エフェクト（雨・雪）が表示される
- [ ] 植物・キノコ・花が配置されている
- [ ] 水面に反射・波形がある
- [ ] フォグが天候に応じて変化する

---

### フェーズ 5: グラフィック強化＋ポストプロセッシング（1〜2日）

**目的**: Babylon.js の強みを活かしてグラフィック品質を向上させる

#### 5-1. PBR マテリアル
- 全マテリアルを `MeshStandardMaterial` → `PBRMaterial` に
- 環境マップ（`.env` or `.hdr`）を設定
- ロボット: metallic: 0.7, roughness: 0.2（金属的な質感）
- 地形: metallic: 0.0, roughness: 0.8（自然な質感）

#### 5-2. DefaultRenderingPipeline
```typescript
const pipeline = new DefaultRenderingPipeline("default", true, scene, [camera]);
pipeline.bloomEnabled = true;
pipeline.bloomThreshold = 0.8;
pipeline.bloomWeight = 0.3;
pipeline.fxaaEnabled = true;
pipeline.imageProcessing.toneMappingEnabled = true;
pipeline.imageProcessing.contrast = 1.2;
pipeline.imageProcessing.exposure = 1.0;
```

#### 5-3. SSAO（任意）
- 負荷が高いため、設定画面でON/OFF切替可能にする
- `SSAO2RenderingPipeline` で実装

#### 5-4. シャドウの改善
- `ShadowGenerator` のフィルタリング（PCF or PCSS）
- カスケードシャドウマップ（`CascadedShadowGenerator`）で広範囲のシャドウ

#### 5-5. 完了条件
- [ ] PBR マテリアルが全オブジェクトに適用されている
- [ ] Bloom エフェクトが発光オブジェクトに効いている
- [ ] トーンマッピングで自然な色調になっている
- [ ] シャドウが滑らかに表示される

---

### フェーズ 6: 統合テスト＋最適化＋旧コード削除（2〜3日）

**目的**: 全機能の動作確認、パフォーマンス最適化、旧パッケージの削除

#### 6-1. 機能テスト項目
- [ ] ロボットの移動・AI思考・対話
- [ ] クリッターのライフサイクル全体（誕生→成長→繁殖→老化→死亡）
- [ ] クリッター同士の対話
- [ ] 野生動物の行動（捕食・逃走・飛行）
- [ ] 天候変化と視覚エフェクト
- [ ] 昼夜サイクル
- [ ] リソースノードの収集
- [ ] 建築システム
- [ ] スコアリング・実績
- [ ] 設定画面（APIキー、TTS等）
- [ ] localStorage への状態永続化

#### 6-2. パフォーマンス最適化
```typescript
// 静的メッシュのフリーズ
staticMesh.freezeWorldMatrix();
staticMesh.doNotSyncBoundingInfo = true;
staticMaterial.freeze();

// インスタンシング（植物等の繰り返しオブジェクト）
const instance = originalMesh.createInstance("tree_" + i);

// 不要な処理の無効化
scene.autoClear = false;
scene.skipPointerMovePicking = true;
```

#### 6-3. 旧パッケージの削除
```bash
npm uninstall three @react-three/fiber @react-three/drei @react-three/rapier @react-three/postprocessing postprocessing @dimforge/rapier3d-compat
```

#### 6-4. 旧コンポーネントの削除
- `src/components/` 直下の旧 R3F コンポーネントを削除
- `src/components/babylon/` の内容を `src/components/` に移動

#### 6-5. 完了条件
- [ ] 全機能が旧バージョンと同等に動作する
- [ ] 60fps が維持される（通常シーン）
- [ ] R3F/Three.js 関連パッケージが完全に削除されている
- [ ] ビルドが成功し、エラー・警告がない

---

## 4. 主要 API 対応表

### 4-1. フレームワーク基本

| R3F / Three.js | Babylon.js | 備考 |
|----------------|-----------|------|
| `<Canvas>` | `<Engine>` + `<Scene>` | react-babylonjs |
| `useFrame((state, delta) => {})` | `scene.registerBeforeRender(() => {})` | |
| `useThree()` | `useScene()`, `useEngine()` | react-babylonjs hooks |
| `<OrbitControls>` | `<arcRotateCamera>` | 組み込み |
| `<Suspense>` | そのまま使用可能 | |

### 4-2. ジオメトリ

| R3F | Babylon.js |
|-----|-----------|
| `<mesh><sphereGeometry />` | `MeshBuilder.CreateSphere()` |
| `<mesh><boxGeometry />` | `MeshBuilder.CreateBox()` |
| `<mesh><cylinderGeometry />` | `MeshBuilder.CreateCylinder()` |
| `<mesh><planeGeometry />` | `MeshBuilder.CreateGround()` |
| `<mesh><torusGeometry />` | `MeshBuilder.CreateTorus()` |
| `<mesh><dodecahedronGeometry />` | `MeshBuilder.CreatePolyhedron({type:2})` |
| `<mesh><icosahedronGeometry />` | `MeshBuilder.CreatePolyhedron({type:3})` |

### 4-3. マテリアル

| R3F / Three.js | Babylon.js |
|----------------|-----------|
| `meshStandardMaterial` | `PBRMaterial` |
| `meshPhysicalMaterial` | `PBRMaterial`（機能が包含される） |
| `pointsMaterial` | `ParticleSystem` |
| emissive / emissiveIntensity | `material.emissiveColor` + `material.emissiveIntensity` |
| vertexColors: true | `material.useVertexColors = true` (Babylon `VertexData`) |

### 4-4. 物理

| Rapier (@react-three/rapier) | Havok (@babylonjs/havok) |
|------------------------------|-------------------------|
| `<Physics gravity={[0,-1.62,0]}>` | `scene.enablePhysics(new Vector3(0,-1.62,0), havokPlugin)` |
| `<RigidBody type="fixed">` | `PhysicsMotionType.STATIC` |
| `<RigidBody type="dynamic">` | `PhysicsMotionType.DYNAMIC` |
| `<HeightfieldCollider>` | `PhysicsShapeHeightField` |
| `colliders="ball"` | `PhysicsShapeType.SPHERE` |
| `ref.current.translation()` | `body.getObjectCenterWorld()` or `mesh.position` |
| `ref.current.setLinvel()` | `body.setLinearVelocity()` |
| `ref.current.setRotation()` | `mesh.rotationQuaternion = ...` |
| `ref.current.applyImpulse()` | `body.applyImpulse()` |
| `ref.current.setLinearDamping()` | `body.setLinearDamping()` |
| `ccd={true}` | `body.setContinuousCollisionDetection(true)` |
| `onIntersectionEnter` | `body.setCollisionCallbackEnabled(true)` + observable |
| `gravityScale={0}` | `body.setGravityFactor(0)` |

### 4-5. drei → Babylon.js 組み込み機能

| drei コンポーネント | Babylon.js 代替 |
|--------------------|----------------|
| `<Sky>` | `SkyMaterial` |
| `<Stars>` | `SolidParticleSystem` or カスタムメッシュ |
| `<Float>` | `registerBeforeRender` + sin() アニメーション |
| `<Sparkles>` | `ParticleSystem` |
| `<ContactShadows>` | `ShadowGenerator` |
| `<Html>` | React DOM overlay（キャンバス上に配置） |

---

## 5. リスクと対策

| リスク | 影響度 | 対策 |
|--------|--------|------|
| react-babylonjs のメンテナ不足 | 中 | 最悪の場合、命令的 API に直接切替可能（Babylon.js 本体は活発） |
| Havok WASM の Vite 互換性 | 低 | `optimizeDeps.exclude` で対処。既知の解決策あり |
| HeightField 物理の精度 | 低 | Havok は Rapier より成熟。`PhysicsShapeGroundMesh` も代替候補 |
| パフォーマンス劣化（バンドルサイズ増） | 中 | Tree-shaking で必要モジュールのみ import。gzip 後は 500KB 程度 |
| 移行中の機能退行 | 高 | フェーズ毎に完了条件を確認。旧コードは最終フェーズまで残す |

---

## 6. スケジュール概要

| フェーズ | 内容 | 所要日数 |
|---------|------|---------|
| 0 | 準備（セットアップ・ファイル構成） | 1日 |
| 1 | 基盤（シーン・地形・物理） | 2〜3日 |
| 2 | ロボットエージェント | 2〜3日 |
| 3 | クリッター＋野生動物＋NavMesh | 3〜4日 |
| 4 | 環境・エフェクト | 2〜3日 |
| 5 | グラフィック強化 | 1〜2日 |
| 6 | 統合テスト＋最適化＋旧コード削除 | 2〜3日 |
| **合計** | | **13〜19日** |

---

## 7. 移行の進め方（並行開発）

移行中も旧バージョンは動作し続ける:

1. `src/components/babylon/` に新コンポーネントを作成
2. `App.tsx` に **切替フラグ** を設置:
   ```tsx
   const USE_BABYLON = true; // false で旧R3F版に戻せる
   ```
3. フェーズ毎に動作確認し、問題があれば旧版に戻せる
4. 全フェーズ完了後、旧コードを削除
