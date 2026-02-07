# Task #7 Implementation Draft

## Ready-to-Execute Code Changes

When tasks #4, #5, #6 are complete, apply these changes in order:

---

## Step 1: Add 2D Camera to Store

**File:** `src/store.ts`

**Find the camera target section** (around line 274):
```typescript
// Camera target (runtime, for fly-to-robot)
cameraTarget: { x: number; y: number; z: number } | null;
setCameraTarget: (target: { x: number; y: number; z: number } | null) => void;
```

**Add below it:**
```typescript
// Camera 2D target (runtime, for 2D mode locate)
camera2DTarget: { x: number; z: number; zoom: number } | null;
setCamera2DTarget: (target: { x: number; z: number; zoom: number } | null) => void;
```

**Find the implementation section** (around line 600):
```typescript
// Camera target (runtime)
cameraTarget: null,
setCameraTarget: (target) => set({ cameraTarget: target }),
```

**Add below it:**
```typescript
// Camera 2D target (runtime)
camera2DTarget: null,
setCamera2DTarget: (target) => set({ camera2DTarget: target }),
```

---

## Step 2: Update Canvas2D to Watch Store Camera

**File:** `src/components2d/Canvas2D.tsx`

**Add at top of Canvas2D function** (after existing hooks):
```typescript
const camera2DTarget = useStore((state) => state.camera2DTarget);
```

**Add before the useGameLoop call:**
```typescript
// Watch for camera target changes (from locate button)
useEffect(() => {
  if (camera2DTarget) {
    setCamera(camera2DTarget);
    // Clear target after applying
    useStore.getState().setCamera2DTarget(null);
  }
}, [camera2DTarget, setCamera]);
```

---

## Step 3: Update Interface to Use 2D Camera

**File:** `src/components/Interface.tsx`

**Find the locate robot button** (lines 723-734):
```typescript
<button
    onClick={() => {
        const pos = useStore.getState().entityPositions['robot'];
        if (pos) {
            useStore.getState().setCameraTarget({ x: pos.x, y: 2, z: pos.z });
        }
    }}
    className="p-3 bg-white/90 backdrop-blur-md rounded-full shadow-lg hover:bg-white transition-colors text-orange-500"
    title="ロボットを表示"
>
    <Locate size={22} />
</button>
```

**Replace with conditional handler:**
```typescript
<button
    onClick={() => {
        const pos = useStore.getState().entityPositions['robot'];
        if (pos) {
            // Check if running in 2D mode (App2D.tsx)
            // For now, use both targets - 3D will ignore 2D target and vice versa
            useStore.getState().setCameraTarget({ x: pos.x, y: 2, z: pos.z });
            useStore.getState().setCamera2DTarget({ x: pos.x, z: pos.z, zoom: 20 });
        }
    }}
    className="p-3 bg-white/90 backdrop-blur-md rounded-full shadow-lg hover:bg-white transition-colors text-orange-500"
    title="ロボットを表示"
>
    <Locate size={22} />
</button>
```

**Note:** This simple approach sets both targets. 3D mode (Experience.tsx) will use `cameraTarget`, 2D mode (Canvas2D.tsx) will use `camera2DTarget`. No conflicts since they're separate.

---

## Step 4: (Optional) Add Smooth Camera Transitions

**File:** `src/components2d/Canvas2D.tsx`

**Replace the camera watch effect with smooth lerp:**
```typescript
// Smooth camera transitions
const [smoothCamera, setSmoothCamera] = useState(camera);

useEffect(() => {
  if (camera2DTarget) {
    setSmoothCamera(camera2DTarget);
    useStore.getState().setCamera2DTarget(null);
  }
}, [camera2DTarget]);

// Lerp camera in game loop (add before render code)
useGameLoop((delta, stats) => {
  if (!ctx || !canvasRef.current) return;

  // Smooth camera interpolation
  if (smoothCamera && (
    Math.abs(camera.x - smoothCamera.x) > 0.01 ||
    Math.abs(camera.z - smoothCamera.z) > 0.01 ||
    Math.abs(camera.zoom - smoothCamera.zoom) > 0.01
  )) {
    setCamera({
      x: camera.x + (smoothCamera.x - camera.x) * delta * 5,
      z: camera.z + (smoothCamera.z - camera.z) * delta * 5,
      zoom: camera.zoom + (smoothCamera.zoom - camera.zoom) * delta * 5,
    });
  }

  // ... existing render code
}, 60);
```

---

## Alternative: Create Interface2D Wrapper (If Preferred)

**File:** `src/components2d/ui/Interface2D.tsx` (create new)

```typescript
import { Interface } from '../../components/Interface';

/**
 * 2D-specific wrapper for Interface component.
 * Currently just re-exports the base Interface since camera
 * handling is done via store (both 3D and 2D targets set).
 *
 * This wrapper exists for future 2D-specific customizations.
 */
export const Interface2D = Interface;

// Future: Could override specific behaviors here
// export const Interface2D = () => {
//   return <Interface locateHandler={customLocateHandler} />;
// };
```

**Then in App2D.tsx, change:**
```typescript
import { Interface } from './components/Interface';
```
**To:**
```typescript
import { Interface2D as Interface } from './components2d/ui/Interface2D';
```

---

## Testing Script

After implementing, test these scenarios:

### Test 1: Basic UI Display
```
1. Open http://localhost:5185
2. Verify all panels render:
   - Environment (top-left)
   - Score (top-right)
   - Robot Status (left-side)
   - Inventory (left-side)
   - Activity Log (bottom-left)
   - Settings button (top-right)
   - Chat button (bottom-right)
3. All panels should look identical to 3D mode
```

### Test 2: Panel Interactions
```
1. Click each panel's minimize button
2. Verify it collapses
3. Click again to expand
4. All panels should collapse/expand smoothly
```

### Test 3: Locate Robot Button
```
1. Wait for robot to move away from center
2. Click locate button (compass icon, top-right)
3. Verify camera centers on robot
4. (If smooth transitions enabled) Camera should smoothly pan, not jump
```

### Test 4: Settings Modal
```
1. Click settings gear icon
2. Modal should appear centered
3. Change API provider (OpenAI <-> Anthropic)
4. Change TTS provider
5. Close modal
6. Settings should persist
```

### Test 5: Chat Widget
```
1. Click chat bubble icon (bottom-right)
2. Chat window opens
3. Type message (requires API key)
4. Verify message appears
5. Close chat
```

### Test 6: Activity Log Filters
```
1. Expand activity log panel
2. Click filter buttons (all, thought, event, etc.)
3. Verify log filters correctly
4. Should match 3D mode behavior
```

### Test 7: Performance
```
1. Open all panels
2. Check FPS counter
3. Should stay at 60 FPS
4. No performance degradation
```

---

## Rollback Plan

If issues occur, rollback is simple:

**Rollback Step 1:** Remove camera2DTarget from store
```bash
# Revert store.ts changes
git diff src/store.ts
git checkout src/store.ts
```

**Rollback Step 2:** Remove Camera2D watch effect
```bash
# Revert Canvas2D.tsx changes
git diff src/components2d/Canvas2D.tsx
git checkout src/components2d/Canvas2D.tsx
```

**Rollback Step 3:** Revert Interface.tsx button
```bash
git checkout src/components/Interface.tsx
```

---

## Estimated Timeline

| Task | Time | Notes |
|------|------|-------|
| Add camera2DTarget to store | 5 min | Copy-paste + TypeScript types |
| Update Canvas2D watch effect | 10 min | Simple useEffect |
| Update Interface locate button | 5 min | One onClick change |
| Test basic UI display | 5 min | Visual check |
| Test panel interactions | 5 min | Click each panel |
| Test locate button | 5 min | Verify camera moves |
| Test settings/chat | 5 min | Quick check |
| **Total (Basic)** | **40 min** | **Without smooth camera** |
| Add smooth camera lerp | +15 min | Optional enhancement |
| **Total (Enhanced)** | **55 min** | **With smooth camera** |

---

## Checklist

Before marking Task #7 complete, verify:

- [ ] TypeScript compilation clean (`npx tsc --noEmit`)
- [ ] No console errors in browser
- [ ] All UI panels render correctly
- [ ] Locate robot button centers camera
- [ ] Settings modal works
- [ ] Chat widget works
- [ ] Activity log filters work
- [ ] 60 FPS maintained with UI open
- [ ] No visual differences from 3D UI
- [ ] Store types are correct
- [ ] Code follows project conventions
- [ ] Git commit with clear message

---

## Success Criteria

✅ **Task #7 Complete When:**
1. All Interface panels display in 2D mode
2. Locate robot button correctly centers camera
3. All interactive elements work (settings, chat, logs)
4. Performance maintained (60 FPS)
5. No regressions in 3D mode
6. TypeScript compilation clean
7. Code committed and pushed

---

**Status:** Draft ready for execution
**Dependencies:** Tasks #4, #5, #6 must be complete
**Risk:** Very Low (minimal changes, high reusability)
**Complexity:** Low (30-55 minutes work)
