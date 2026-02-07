import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// River flowing diagonally across the terrain
// Control points define the curve path
const RIVER_POINTS = [
    new THREE.Vector3(-30, -1.2, -30),
    new THREE.Vector3(-20, -1.15, -18),
    new THREE.Vector3(-10, -1.1, -10),
    new THREE.Vector3(-2, -1.05, 0),
    new THREE.Vector3(5, -1.0, 8),
    new THREE.Vector3(15, -0.95, 18),
    new THREE.Vector3(25, -0.9, 25),
];

const RIVER_WIDTH = 3.5;
const SEGMENTS_PER_SECTION = 8;

export const River = () => {
    const meshRef = useRef<THREE.Mesh>(null!);

    // Build a curved river geometry from control points
    const geometry = useMemo(() => {
        const curve = new THREE.CatmullRomCurve3(RIVER_POINTS);
        const totalSegments = (RIVER_POINTS.length - 1) * SEGMENTS_PER_SECTION;
        const points = curve.getPoints(totalSegments);

        const vertices: number[] = [];
        const uvs: number[] = [];
        const indices: number[] = [];

        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            // Get tangent for perpendicular direction
            const t = i / (points.length - 1);
            const tangent = curve.getTangent(t);
            // Perpendicular in XZ plane
            const perp = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

            // Left and right bank positions
            const halfWidth = RIVER_WIDTH / 2;
            const left = p.clone().add(perp.clone().multiplyScalar(halfWidth));
            const right = p.clone().sub(perp.clone().multiplyScalar(halfWidth));

            vertices.push(left.x, left.y, left.z);
            vertices.push(right.x, right.y, right.z);

            const u = t * 8; // Repeat UV along length for flow texture
            uvs.push(0, u);
            uvs.push(1, u);
        }

        // Create triangles
        for (let i = 0; i < points.length - 1; i++) {
            const a = i * 2;
            const b = i * 2 + 1;
            const c = (i + 1) * 2;
            const d = (i + 1) * 2 + 1;
            indices.push(a, c, b);
            indices.push(b, c, d);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        // Store original positions for wave animation
        const origPositions = new Float32Array(vertices);
        geo.userData.origPositions = origPositions;

        return geo;
    }, []);

    // Animate: vertex displacement waves + UV offset for flow
    useFrame((state) => {
        if (!meshRef.current) return;
        const t = state.clock.getElapsedTime();

        const geo = meshRef.current.geometry;
        const pos = geo.attributes.position;
        const orig = geo.userData.origPositions as Float32Array;
        const uv = geo.attributes.uv;

        // Vertex displacement for gentle waves
        for (let i = 0; i < pos.count; i++) {
            const ox = orig[i * 3];
            const oy = orig[i * 3 + 1];
            const oz = orig[i * 3 + 2];

            const wave = Math.sin(ox * 0.5 + t * 1.2) * 0.04
                + Math.cos(oz * 0.4 + t * 0.9) * 0.03;
            pos.setY(i, oy + wave);
        }
        pos.needsUpdate = true;

        // UV offset for flow direction feel
        for (let i = 0; i < uv.count; i++) {
            const baseV = (Math.floor(i / 2) / ((pos.count / 2) - 1)) * 8;
            uv.setY(i, baseV + t * 0.3); // Scroll UVs along the river
        }
        uv.needsUpdate = true;
    });

    return (
        <mesh ref={meshRef} geometry={geometry}>
            <meshStandardMaterial
                color="#2288aa"
                transparent
                opacity={0.6}
                metalness={0.85}
                roughness={0.1}
                emissive="#114466"
                emissiveIntensity={0.05}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
};
