import * as THREE from 'three';

// Depth and slow life around the globe: a drifting starfield and the occasional meteor.
// createSpace() adds them to the scene and returns an update() to call once per frame.
const STAR_RADIUS = 1200;

interface Meteor { line: THREE.Line; dir: THREE.Vector3; born: number; life: number; }

export interface SpaceLayer { update: () => void; }

export function createSpace(scene: THREE.Scene, loader: THREE.TextureLoader): SpaceLayer {
  // starfield: a big sphere with the night-sky texture on the inside
  const starTex = loader.load('/stars.png');
  starTex.colorSpace = THREE.SRGBColorSpace;
  const stars = new THREE.Mesh(
    new THREE.SphereGeometry(STAR_RADIUS, 48, 32),
    new THREE.MeshBasicMaterial({ map: starTex, side: THREE.BackSide, depthWrite: false }),
  );
  scene.add(stars);

  // A sparse layer of individually twinkling stars in front of the static texture —
  // each has its own phase and rate, so the sky feels alive rather than printed.
  const TWINKLE_COUNT = 420;
  const pos = new Float32Array(TWINKLE_COUNT * 3);
  const phase = new Float32Array(TWINKLE_COUNT);
  const mag = new Float32Array(TWINKLE_COUNT);
  const v = new THREE.Vector3();
  for (let i = 0; i < TWINKLE_COUNT; i++) {
    v.randomDirection().multiplyScalar(650 + Math.random() * 450);
    pos.set([v.x, v.y, v.z], i * 3);
    phase[i] = Math.random() * Math.PI * 2;
    mag[i] = Math.random();
  }
  const twinkleGeom = new THREE.BufferGeometry();
  twinkleGeom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  twinkleGeom.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  twinkleGeom.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  const twinkleMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `
      attribute float phase;
      attribute float mag;
      uniform float time;
      varying float vA;
      void main() {
        vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(time * (0.6 + mag * 1.6) + phase));
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (1.4 + mag * 2.4) * (420.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.05, d) * vA;
        gl_FragColor = vec4(0.82, 0.88, 1.0, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const twinkles = new THREE.Points(twinkleGeom, twinkleMat);
  scene.add(twinkles);

  // meteors: short additive streaks that shoot across the starfield now and then
  const meteorMat = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    opacity: 0,
  });
  const meteors: Meteor[] = [];
  let nextMeteor = Date.now() + 8000 + Math.random() * 12000;

  function spawnMeteor() {
    const start = new THREE.Vector3().randomDirection().multiplyScalar(620);
    const dir = new THREE.Vector3().randomDirection().multiplyScalar(40);
    const tail = start.clone().sub(dir);
    const geom = new THREE.BufferGeometry().setFromPoints([start, tail]);
    const line = new THREE.Line(geom, meteorMat.clone());
    scene.add(line);
    meteors.push({ line, dir, born: Date.now(), life: 1100 });
  }

  function update() {
    stars.rotation.y += 0.00002;
    stars.rotation.x += 0.000004; // a second, slower axis so the drift never reads as a loop
    twinkles.rotation.y -= 0.000008; // counter-drift for parallax depth
    twinkleMat.uniforms.time.value = performance.now() / 1000;

    const now = Date.now();
    if (now >= nextMeteor) {
      spawnMeteor();
      nextMeteor = now + 14000 + Math.random() * 26000;
    }
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      const k = (now - m.born) / m.life;
      if (k >= 1) {
        scene.remove(m.line);
        m.line.geometry.dispose();
        (m.line.material as THREE.Material).dispose();
        meteors.splice(i, 1);
        continue;
      }
      m.line.position.addScaledVector(m.dir, 0.016);
      (m.line.material as THREE.LineBasicMaterial).opacity = Math.sin(k * Math.PI) * 0.9;
    }
  }

  return { update };
}
