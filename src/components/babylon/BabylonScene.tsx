import { useEffect, useRef, useState } from "react";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3, Color4 } from "@babylonjs/core/Maths/math";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Materials/standardMaterial";
import "@babylonjs/core/Shaders/default.vertex";
import "@babylonjs/core/Shaders/default.fragment";
import "@babylonjs/core/Lights/hemisphericLight";
import "@babylonjs/core/Lights/directionalLight";
import "@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent";
import HavokPhysics from "@babylonjs/havok";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { createTerrain, createPhysicsTestSphere } from "./Terrain";
import { createLighting } from "./Lighting";

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
        createLighting(scene);

        // 6. Terrain + heightfield physics
        createTerrain(scene);

        // 7. Test sphere with physics
        createPhysicsTestSphere(scene);

        // 8. Render loop
        engine.runRenderLoop(() => {
          scene.render();
        });

        // 9. Handle resize
        const onResize = () => engine.resize();
        window.addEventListener("resize", onResize);

        if (!disposed) setStatus("ready");

        // Cleanup
        return () => {
          window.removeEventListener("resize", onResize);
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
    </div>
  );
}
