import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "../../store";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3, Color4 } from "@babylonjs/core/Maths/math";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";
import "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import "@babylonjs/core/Lights/pointLight";
import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { createTerrain } from "./Terrain";
import { createLighting } from "./Lighting";
import { createEnvironmentManager } from "./EnvironmentManager";
import { createRobot } from "./Robot";
import { createVegetation } from "./Vegetation";
import { createEnvironmentObjects } from "./EnvironmentObjects";
import { createCritters } from "./Critters";
import { createWildAnimals } from "./WildAnimals";
import { createCreatures } from "./Creatures";
import { createWeatherAndWater } from "./WeatherAndWater";

let havokPluginPromise: Promise<HavokPlugin> | null = null;
function getHavokPlugin(): Promise<HavokPlugin> {
  if (!havokPluginPromise) {
    havokPluginPromise = HavokPhysics({
      locateFile: () => "/HavokPhysics.wasm",
    }).then((instance) => new HavokPlugin(true, instance));
  }
  return havokPluginPromise;
}

export function BabylonScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    (async () => {
      try {
        // 1. Init engine
        const engine = new Engine(canvas, true, {
          adaptToDeviceRatio: true,
          powerPreference: "high-performance",
        });
        engineRef.current = engine;

        // 2. Create scene
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.05, 0.05, 0.15, 1);

        // 3. Init Havok physics
        const havokPlugin = await getHavokPlugin();
        if (disposed) return;
        scene.enablePhysics(new Vector3(0, -1.62, 0), havokPlugin);

        // 4. Camera
        const camera = new ArcRotateCamera(
          "camera",
          -Math.PI / 2,
          Math.PI / 3,
          25,
          Vector3.Zero(),
          scene
        );
        camera.lowerRadiusLimit = 3;
        camera.upperRadiusLimit = 80;
        camera.lowerBetaLimit = 0.1;
        camera.upperBetaLimit = Math.PI / 2 - 0.05;
        camera.attachControl(canvas, true);

        // 5. Lighting + fog (dynamic, reads store)
        const lighting = createLighting(scene);

        // 6. Terrain + heightfield physics
        createTerrain(scene);

        // 7. Environment Manager (time/weather/seasons)
        const envManager = createEnvironmentManager(scene);

        // 8. Robot agent
        const robot = createRobot(scene);

        // 9. Vegetation (trees, grass, mushrooms)
        createVegetation(scene);

        // 10. Environment objects (crystals, mountains, towers)
        createEnvironmentObjects(scene);

        // 11. Critters (AI-driven creatures)
        const critters = createCritters(scene);

        // 12. Wild Animals (deer, rabbits, birds, wolves)
        const wildAnimals = createWildAnimals(scene);

        // 13. Ambient Creatures (butterflies, fireflies, pond fish)
        const creatures = createCreatures(scene);

        // 14. Weather effects + Water (rain, snow, dust, ponds)
        const weatherAndWater = createWeatherAndWater(scene);

        // Add robot to shadow generator
        if (lighting.shadowGen && robot.rootNode) {
          robot.rootNode.getChildMeshes().forEach(mesh => {
            lighting.shadowGen.addShadowCaster(mesh);
          });
        }

        // 14. Render loop
        engine.runRenderLoop(() => {
          scene.render();
        });

        // 15. Handle resize
        const onResize = () => engine.resize();
        window.addEventListener("resize", onResize);

        if (!disposed) setStatus("ready");

        // Cleanup
        return () => {
          window.removeEventListener("resize", onResize);
          weatherAndWater.dispose();
          creatures.dispose();
          wildAnimals.dispose();
          critters.dispose();
          envManager.dispose();
          robot.dispose();
          scene.dispose();
          engine.dispose();
        };
      } catch (err) {
        console.error("Babylon.js init failed:", err);
        if (!disposed) {
          setErrorMsg(String(err));
          setStatus("error");
        }
      }
    })();

    return () => {
      disposed = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  if (status === "error") {
    return (
      <div className="w-full h-full flex items-center justify-center bg-black text-red-400 text-lg">
        Babylon.js Error: {errorMsg}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black text-white text-lg z-10">
          Loading Babylon.js + Havok Physics...
        </div>
      )}
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
      {status === "ready" && <DevPanel />}
    </div>
  );
}

// ─── Dev Panel (small button, top center) ────────────────────────────────────

const WEATHER_OPTIONS = ["sunny", "cloudy", "rainy", "snowy"] as const;
const TIME_PRESETS = [
  { label: "朝 6:00", value: 6 },
  { label: "昼 12:00", value: 12 },
  { label: "夕 18:00", value: 18 },
  { label: "夜 22:00", value: 22 },
];

function DevPanel() {
  const time = useStore((s) => s.time);
  const weather = useStore((s) => s.weather);
  const day = useStore((s) => s.day);
  const season = useStore((s) => s.season);
  const [open, setOpen] = useState(false);

  const setTime = useCallback((v: number) => {
    useStore.getState().setTime(v);
  }, []);

  const setWeather = useCallback((w: string) => {
    useStore.getState().setWeather(w as "sunny" | "rainy" | "cloudy" | "snowy");
  }, []);

  const hours = Math.floor(time);
  const minutes = Math.floor((time % 1) * 60);
  const timeStr = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

  return (
    <>
      {/* Small toggle button at top center */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        style={{
          position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
          zIndex: 60,
          background: open ? "rgba(68,136,255,0.9)" : "rgba(0,0,0,0.5)",
          color: "#fff", border: "1px solid rgba(255,255,255,0.2)",
          borderRadius: 16, padding: "3px 12px", cursor: "pointer",
          fontSize: 10, fontFamily: "monospace", fontWeight: "bold",
          backdropFilter: "blur(4px)",
        }}
      >
        DEV {timeStr}
      </button>

      {/* Expanded panel */}
      {open && (
        <div
          style={{
            position: "absolute", top: 36, left: "50%", transform: "translateX(-50%)",
            zIndex: 60,
            background: "rgba(0,0,0,0.85)", color: "#fff", borderRadius: 12,
            padding: 14, fontSize: 12, minWidth: 260, fontFamily: "monospace",
            border: "1px solid #555", backdropFilter: "blur(8px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          {/* Info */}
          <div style={{ marginBottom: 8, color: "#aaa", fontSize: 11 }}>
            Day {day} / {season} / {timeStr} / {weather}
          </div>

          {/* Time slider */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", marginBottom: 2 }}>Time: {timeStr}</label>
            <input
              type="range"
              min={0}
              max={24}
              step={0.1}
              value={time}
              onChange={(e) => setTime(Number(e.target.value))}
              style={{ width: "100%" }}
            />
          </div>

          {/* Time presets */}
          <div style={{ display: "flex", gap: 4, marginBottom: 8, flexWrap: "wrap" }}>
            {TIME_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => setTime(p.value)}
                style={{
                  background: Math.abs(time - p.value) < 1 ? "#4488ff" : "#333",
                  color: "#fff", border: "1px solid #555", borderRadius: 4,
                  padding: "2px 8px", cursor: "pointer", fontSize: 11,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Weather */}
          <div>
            <label style={{ display: "block", marginBottom: 2 }}>Weather:</label>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {WEATHER_OPTIONS.map((w) => (
                <button
                  key={w}
                  onClick={() => setWeather(w)}
                  style={{
                    background: weather === w ? "#4488ff" : "#333",
                    color: "#fff", border: "1px solid #555", borderRadius: 4,
                    padding: "2px 8px", cursor: "pointer", fontSize: 11,
                  }}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
