import { Canvas } from "@react-three/fiber";
import { Experience } from "./components/Experience";
import { Interface } from "./components/Interface";
import { Suspense } from "react";

function App() {
  return (
    <div className="relative w-full h-screen bg-gray-100 overflow-hidden" style={{ width: '100vw', height: '100vh' }}>
      {/* 3D Layer */}
      <Canvas
        shadows
        camera={{ position: [0, 5, 10], fov: 45 }}
        className="block touch-none"
      >
        <Suspense fallback={null}>
          <Experience />
        </Suspense>
      </Canvas>

      {/* UI Layer */}
      <Interface />
    </div>
  );
}

export default App;
