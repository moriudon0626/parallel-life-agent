# Task #7 Prep Analysis: UI Components for 2D

## Status: PLANNING PHASE (Task blocked until #4, #5, #6 complete)

## Executive Summary

The Interface.tsx component is **95% reusable** for 2D with minimal adaptations needed. Most UI is state-driven and rendering-agnostic. Only 1 camera-related function needs modification.

## Current Interface.tsx Analysis

**File:** `src/components/Interface.tsx` (1079 lines)
**Dependencies:** React hooks, Zustand store, Lucide icons, LLM/speech libs

### Component Breakdown

#### ✅ **Fully Reusable Components** (No Changes Needed)

1. **Environment Status Panel** (lines 248-315)
   - Time, weather, temperature, season display
   - Pure state rendering
   - **Action:** Direct reuse

2. **Score Panel** (lines 317-415)
   - Real-time score, rank, progress
   - Score breakdown and recent changes
   - **Action:** Direct reuse

3. **Robot Status Panel** (lines 417-511)
   - Battery, durability, temperature
   - Status warnings
   - **Action:** Direct reuse

4. **Inventory Panel** (lines 513-548)
   - Item list display
   - **Action:** Direct reuse

5. **Thought Log Panel** (lines 550-622)
   - Robot + critter thoughts
   - Filterable by entity
   - **Action:** Direct reuse (currently hidden: `hidden` class on line 551)

6. **Activity Log Panel** (lines 624-719)
   - Event logging with categories
   - Filters and collapsible
   - **Action:** Direct reuse

7. **Settings Modal** (lines 744-983)
   - API keys, TTS, system prompts
   - **Action:** Direct reuse

8. **Chat Widget** (lines 985-1076)
   - User chat with robot
   - **Action:** Direct reuse

#### ⚠️ **Needs Adaptation** (1 location)

**Locate Robot Button** (lines 723-734)
```typescript
<button
    onClick={() => {
        const pos = useStore.getState().entityPositions['robot'];
        if (pos) {
            useStore.getState().setCameraTarget({ x: pos.x, y: 2, z: pos.z });
        }
    }}
    ...
>
```

**Issue:** `setCameraTarget` is 3D-specific (includes `y` coordinate)

**2D Solution:**
```typescript
<button
    onClick={() => {
        const pos = useStore.getState().entityPositions['robot'];
        if (pos) {
            // For 2D: Update camera in useCanvas2D's setCamera
            const { setCamera } = useCanvas2D(); // Need to expose globally or via store
            setCamera({ x: pos.x, z: pos.z, zoom: 20 });
        }
    }}
    ...
>
```

**Alternative:** Add `camera2D` to store for 2D mode
```typescript
// In store.ts
camera2D: { x: number; z: number; zoom: number } | null;
setCamera2D: (camera: Camera2D) => void;
```

## 3D-Specific Dependencies

### None in Interface.tsx
The Interface component is **100% independent** of:
- `@react-three/fiber` (no useFrame, useThree)
- `@react-three/drei`
- Three.js objects

All 3D interaction happens through the Zustand store, making it rendering-agnostic.

## Migration Strategy

### Option A: Single Interface Component (Recommended)
Create `components2d/Interface2D.tsx` that:
1. Imports and wraps `components/Interface.tsx`
2. Overrides only the "Locate Robot" button behavior
3. Reuses 100% of the UI layout/styling

**Pros:**
- Maximum code reuse
- Single source of truth for UI
- Easy maintenance

**Cons:**
- Slight complexity in override mechanism

### Option B: Fork Interface.tsx
Copy `Interface.tsx` → `Interface2D.tsx` and modify the camera handler.

**Pros:**
- Simpler, direct approach
- Full control

**Cons:**
- Code duplication
- Maintenance burden (changes need 2x updates)

### Recommendation: **Option A** with store-based camera

## Implementation Plan

### Phase 1: Store Enhancement
Add 2D camera to store (parallel with 3D camera):

```typescript
// src/store.ts
interface GameStore {
  // Existing 3D camera
  cameraTarget: { x: number; y: number; z: number } | null;
  setCameraTarget: (target: { x: number; y: number; z: number } | null) => void;

  // NEW: 2D camera target
  camera2DTarget: { x: number; z: number; zoom: number } | null;
  setCamera2DTarget: (target: { x: number; z: number; zoom: number } | null) => void;
}
```

### Phase 2: Canvas2D Integration
Update `Canvas2D.tsx` to watch store camera:

```typescript
// src/components2d/Canvas2D.tsx
const camera2DTarget = useStore((state) => state.camera2DTarget);

useEffect(() => {
  if (camera2DTarget) {
    setCamera(camera2DTarget);
    // Clear after applying (optional)
    useStore.getState().setCamera2DTarget(null);
  }
}, [camera2DTarget, setCamera]);
```

### Phase 3: Interface2D Wrapper
Create minimal wrapper:

```typescript
// src/components2d/ui/Interface2D.tsx
import { Interface as BaseInterface } from '../../components/Interface';
import { useStore } from '../../store';

export const Interface2D = () => {
  // Override locate button handler
  const handleLocateRobot = () => {
    const pos = useStore.getState().entityPositions['robot'];
    if (pos) {
      useStore.getState().setCamera2DTarget({
        x: pos.x,
        z: pos.z,
        zoom: 20
      });
    }
  };

  // Could use React context or prop injection
  // For now, simplest is to just use Interface as-is
  // and handle camera in Canvas2D via store
  return <BaseInterface />;
};
```

**Even Simpler:** Just use `<Interface />` directly in App2D.tsx and handle camera target in Canvas2D by checking if `cameraTarget` exists and mapping to 2D coordinates.

### Phase 4: Minimap (Future Enhancement)

**Not in scope for initial Task #7**, but worth planning:

```typescript
// src/components2d/ui/Minimap2D.tsx
export function Minimap2D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const entities = useStore((state) => state.entityPositions);
  const camera = /* get from Canvas2D */;

  useGameLoop((delta) => {
    if (!canvasRef.current) return;
    const ctx = canvasRef.current.getContext('2d');

    // Draw minimap (top-down view)
    // - Terrain overview
    // - Entity markers
    // - Camera viewport indicator
  });

  return <canvas ref={canvasRef} className="..." />;
}
```

## File Structure

```
src/
├── components/
│   └── Interface.tsx          # Shared UI (reused in both 3D & 2D)
├── components2d/
│   ├── Canvas2D.tsx           # Main 2D renderer (already done)
│   └── ui/
│       ├── Interface2D.tsx    # 2D-specific wrapper (minimal)
│       └── Minimap2D.tsx      # Future: 2D minimap
└── store.ts                   # Add camera2DTarget
```

## Complexity Estimates

| Task | Complexity | Time Est | Notes |
|------|-----------|----------|-------|
| Add camera2DTarget to store | Low | 5 min | Simple state addition |
| Update Canvas2D camera watching | Low | 10 min | useEffect hook |
| Create Interface2D wrapper | Very Low | 5 min | Or skip entirely |
| Test locate button | Low | 10 min | Manual testing |
| **Total** | **Low** | **30 min** | **Minimal work needed** |

## Testing Checklist

- [ ] All panels render correctly in 2D
- [ ] Collapsible panels work
- [ ] Settings modal opens/closes
- [ ] Chat widget works
- [ ] Locate robot button centers camera on robot
- [ ] Camera smooth transition (optional enhancement)
- [ ] All icons display properly
- [ ] No console errors
- [ ] Performance: No FPS drop with UI open

## Breaking Changes

**None.** The migration is backward-compatible:
- 3D mode continues using `cameraTarget`
- 2D mode uses new `camera2DTarget`
- Both can coexist in store

## Dependencies to Add

**None.** All required packages already installed:
- React (hooks)
- Zustand (store)
- Lucide-react (icons)
- clsx (conditional classes)
- Tailwind CSS (styling)

## Potential Issues & Solutions

### Issue 1: useCanvas2D hook scope
**Problem:** `useCanvas2D` returns `setCamera`, but only available in Canvas2D component

**Solution:** Use store-based camera target (Phase 2) instead of direct hook call

### Issue 2: Camera transitions
**Problem:** Instant camera jumps feel jarring

**Solution:** Add smooth lerp in Canvas2D:
```typescript
const [targetCamera, setTargetCamera] = useState<Camera2D | null>(null);

useGameLoop((delta) => {
  if (targetCamera) {
    // Lerp camera to target
    camera.x += (targetCamera.x - camera.x) * delta * 5;
    camera.z += (targetCamera.z - camera.z) * delta * 5;
    camera.zoom += (targetCamera.zoom - camera.zoom) * delta * 5;

    if (Math.abs(camera.x - targetCamera.x) < 0.1) {
      setTargetCamera(null); // Reached target
    }
  }
});
```

### Issue 3: Position references
**Problem:** Some UI might reference 3D positions (x, y, z)

**Solution:** Already handled - `entityPositions` in store stores all 3 coords, we just ignore `y` in 2D

## Conclusion

Task #7 is **VERY LOW COMPLEXITY**. The Interface.tsx component is already designed to be rendering-agnostic and only requires:

1. **One store addition** (`camera2DTarget`)
2. **One useEffect** in Canvas2D to watch camera target
3. **Zero changes** to Interface.tsx itself

Estimated total work: **30 minutes** when tasks #4, #5, #6 are complete.

## Next Steps (When Unblocked)

1. ✅ Review this analysis with team lead
2. Wait for tasks #4, #5, #6 completion
3. Implement store camera2DTarget
4. Update Canvas2D camera watching
5. Test locate robot button
6. (Optional) Add camera lerp smoothing
7. (Future) Implement Minimap2D

---

**Prepared by:** foundation-engineer
**Date:** 2026-02-07
**Status:** Ready for execution when dependencies complete
