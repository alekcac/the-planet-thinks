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
