import { Canvas2D } from './components2d/Canvas2D';
import { Interface } from './components/Interface';

function App2D() {
  return (
    <div
      className="relative w-full h-screen bg-gray-100 overflow-hidden"
      style={{ width: '100vw', height: '100vh' }}
    >
      {/* 2D Canvas Layer */}
      <Canvas2D />

      {/* UI Layer (reuse existing Interface) */}
      <Interface />
    </div>
  );
}

export default App2D;
