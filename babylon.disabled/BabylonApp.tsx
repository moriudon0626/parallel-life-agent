import { Interface } from "../Interface";
import { BabylonScene } from "./BabylonScene";

export function BabylonApp() {
  return (
    <div className="relative w-full h-screen bg-gray-100 overflow-hidden" style={{ width: '100vw', height: '100vh' }}>
      {/* 3D Layer - Babylon.js */}
      <BabylonScene />

      {/* UI Layer - shared with R3F version */}
      <Interface />
    </div>
  );
}
