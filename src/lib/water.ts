import * as THREE from 'three';
import { CHUNK, RENDER, WATER_LEVEL } from './worldConstants.js';

export interface WaterSystem {
    mesh: THREE.Mesh;
    uniforms: { uTime: { value: number } };
}

export function createWater(): WaterSystem {
    const uniforms = { uTime: { value: 0 } };

    const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: `
            uniform float uTime;
            varying vec2 vUv;
            varying float vWave;
            void main() {
                vUv = uv;
                vec3 pos = position;
                float wave = sin(pos.x * 0.25 + uTime * 1.4) * 0.18
                           + cos(pos.z * 0.22 + uTime * 1.1) * 0.18
                           + sin((pos.x + pos.z) * 0.15 + uTime * 0.9) * 0.10;
                pos.y += wave;
                vWave = wave;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            varying vec2 vUv;
            varying float vWave;
            void main() {
                float foam = smoothstep(0.28, 0.38, vWave);
                vec3 deep    = vec3(0.04, 0.22, 0.48);
                vec3 shallow = vec3(0.10, 0.52, 0.78);
                vec3 foamCol = vec3(0.85, 0.93, 1.00);
                float t = sin(vUv.x * 18.0 + uTime * 1.8) * 0.5 + 0.5;
                vec3 col = mix(deep, shallow, t * 0.4 + 0.3);
                col = mix(col, foamCol, foam * 0.6);
                float alpha = 0.78 - foam * 0.15;
                gl_FragColor = vec4(col, alpha);
            }
        `,
    });

    const size = RENDER * CHUNK * 2 + CHUNK;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 40, 40), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = WATER_LEVEL;

    return { mesh, uniforms };
}
