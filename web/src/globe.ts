import Globe from 'globe.gl';
import * as THREE from 'three';
import { colorFor, radiusFor, hslColor } from './visuals';
import { sunDirection } from './sun';
import { angularDistanceDeg } from './geo';
import { createSpace } from './space';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pulse } from './types';
import type { Quality } from './quality';

interface RingDatum { lat: number; lng: number; maxR: number; color: (t: number) => string; }
interface Marker { sprite: THREE.Sprite; pulse: Pulse; born: number; dead: number | null; size: number; }
interface Arc { line: THREE.Line; born: number; life: number; }

/** lat/lng → 3D point at radius r, matching three-globe's coordinate convention. */
function latLngToVec3(lat: number, lng: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * Math.PI / 180;
  const theta = (90 - lng) * Math.PI / 180;
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  ).multiplyScalar(r);
}

export interface GlobeHandle {
  addPulse: (p: Pulse, quiet?: boolean) => void;
  setFollow: (on: boolean) => void;
}

const DAY_NIGHT_VERT = `
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DAY_NIGHT_FRAG = `
  uniform sampler2D dayTexture;
  uniform sampler2D nightTexture;
  uniform vec3 sunDirection;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    float intensity = dot(normalize(vWorldNormal), normalize(sunDirection));
    float blend = smoothstep(-0.15, 0.18, intensity);
    vec3 day = texture2D(dayTexture, vUv).rgb;
    vec3 night = texture2D(nightTexture, vUv).rgb * 1.5;
    gl_FragColor = vec4(mix(night, day, blend), 1.0);
  }
`;

/** A soft round glow (white core → transparent), tinted per-sprite via material.color. */
function makeGlowTexture(): THREE.Texture {
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.22, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function easeOutCubic(k: number): number {
  return 1 - Math.pow(1 - k, 3);
}

const DEFAULT_ALTITUDE = 2.4; // camera distance the tour always settles back to

export function createGlobe(el: HTMLElement, q: Quality, onPick: (p: Pulse) => void): GlobeHandle {
  const loader = new THREE.TextureLoader();
  const dayTexture = loader.load('/earth-day.jpg');
  const nightTexture = loader.load('/earth-night.jpg');
  dayTexture.colorSpace = THREE.SRGBColorSpace;
  nightTexture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      dayTexture: { value: dayTexture },
      nightTexture: { value: nightTexture },
      sunDirection: { value: sunDirection(new Date()) },
    },
    vertexShader: DAY_NIGHT_VERT,
    fragmentShader: DAY_NIGHT_FRAG,
  });

  const globe = new Globe(el)
    .backgroundColor('#01020a')
    .globeMaterial(material)
    .showAtmosphere(true)
    .atmosphereColor('#3a6fff')
    .atmosphereAltitude(0.18)
    .pointOfView({ lat: 25, lng: 0, altitude: DEFAULT_ALTITUDE })
    .ringsData([])
    .ringMaxRadius((d: object) => (d as RingDatum).maxR)
    .ringPropagationSpeed(2.2)
    .ringRepeatPeriod(1800)
    .ringColor((d: object) => (d as RingDatum).color);

  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatioCap));

  // Push the far plane out so the surrounding starfield sphere isn't clipped.
  const camera = globe.camera() as THREE.PerspectiveCamera;
  camera.far = 100_000;
  camera.updateProjectionMatrix();

  // Starfield, clouds, and meteors around the globe.
  const space = createSpace(globe.scene(), loader);

  // Bloom: let the markers, atmosphere, and city lights glow softly. A high threshold
  // keeps the midtone day side from washing out — only bright pixels bloom.
  const composer = globe.postProcessingComposer();
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(el.clientWidth, el.clientHeight),
    0.5,   // strength
    0.4,   // radius
    0.85,  // threshold — only the brightest pixels (markers, lights, rim) bloom
  );
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Keep the day/night terminator current as real time advances.
  setInterval(() => { material.uniforms.sunDirection.value = sunDirection(new Date()); }, 60_000);

  const fit = () => globe.width(el.clientWidth).height(el.clientHeight);
  fit();
  window.addEventListener('resize', fit);

  // Shared interaction state, read by both the animation loop and the tour.
  let follow = true;
  let interacting = false;
  let lastInteraction = 0;
  let flying = false;
  const RESUME_AFTER_MS = 5000; // how long manual control suspends the tour and idle drift
  const controls = globe.controls();
  controls.autoRotate = false;
  controls.autoRotateSpeed = 0.18; // a barely-there idle drift so the globe is never static
  // Clamp zoom so the planet stays a sensible size and the camera never leaves the starfield.
  controls.minDistance = 130;
  controls.maxDistance = 500;
  controls.addEventListener('start', () => { interacting = true; });
  controls.addEventListener('end', () => { interacting = false; lastInteraction = Date.now(); });

  // ---- glowing markers: soft sprites that pop in and accumulate up to a cap ----
  const glowTexture = makeGlowTexture();
  const markerGroup = new THREE.Group();
  globe.scene().add(markerGroup);
  const markers: Marker[] = [];
  const POP_MS = 450;   // grow-in time
  const FADE_MS = 700;  // fade-out time once evicted

  // Great-circle arcs traced as the tour glides from one edit to the next.
  const arcGroup = new THREE.Group();
  globe.scene().add(arcGroup);
  const arcs: Arc[] = [];

  function addArc(fromLat: number, fromLng: number, toLat: number, toLng: number, lifeMs: number) {
    const a = latLngToVec3(fromLat, fromLng, 1);
    const b = latLngToVec3(toLat, toLng, 1);
    const angle = a.angleTo(b);
    if (angle < 0.01) return;
    const sin = Math.sin(angle);
    const lift = 6 + angle * 7; // arc higher for longer jumps
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 48; i++) {
      const t = i / 48;
      const wa = Math.sin((1 - t) * angle) / sin;
      const wb = Math.sin(t * angle) / sin;
      const v = a.clone().multiplyScalar(wa).add(b.clone().multiplyScalar(wb));
      v.multiplyScalar(100.5 + Math.sin(t * Math.PI) * lift);
      pts.push(v);
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({
        color: 0x9fc4ff,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0,
      }),
    );
    arcGroup.add(line);
    arcs.push({ line, born: Date.now(), life: lifeMs });
  }

  function sizeFor(sizeDelta: number): number {
    return 2.2 + Math.min(3.6, Math.log2(Math.abs(sizeDelta) + 1) * 0.5);
  }

  function addMarker(p: Pulse) {
    const mat = new THREE.SpriteMaterial({
      map: glowTexture,
      color: new THREE.Color(hslColor(p.lang, p.editor_type)),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(mat);
    const { x, y, z } = globe.getCoords(p.lat, p.lon, 0.01);
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(0.001);
    markerGroup.add(sprite);
    markers.push({ sprite, pulse: p, born: Date.now(), dead: null, size: sizeFor(p.size_delta) });

    const alive = markers.filter(m => m.dead === null);
    if (alive.length > q.maxPoints) alive[0].dead = Date.now(); // oldest fades out
  }

  function animate() {
    space.update();
    // Slow idle drift between hops, paused while flying or under manual control.
    controls.autoRotate = follow && !interacting && !flying && Date.now() - lastInteraction > RESUME_AFTER_MS;
    const t = Date.now();
    for (let i = markers.length - 1; i >= 0; i--) {
      const m = markers[i];
      const mat = m.sprite.material as THREE.SpriteMaterial;
      if (m.dead === null) {
        const k = Math.min(1, (t - m.born) / POP_MS);
        const overshoot = 1 + Math.sin(k * Math.PI) * 0.22;
        m.sprite.scale.setScalar(m.size * easeOutCubic(k) * overshoot);
        mat.opacity = 0.95 * Math.min(1, k * 1.4);
      } else {
        const f = (t - m.dead) / FADE_MS;
        if (f >= 1) {
          markerGroup.remove(m.sprite);
          mat.dispose();
          markers.splice(i, 1);
          continue;
        }
        mat.opacity = 0.95 * (1 - f);
        m.sprite.scale.setScalar(m.size * (1 - 0.2 * f));
      }
    }
    for (let i = arcs.length - 1; i >= 0; i--) {
      const arc = arcs[i];
      const k = (t - arc.born) / arc.life;
      const mat = arc.line.material as THREE.LineBasicMaterial;
      if (k >= 1) {
        arcGroup.remove(arc.line);
        arc.line.geometry.dispose();
        mat.dispose();
        arcs.splice(i, 1);
        continue;
      }
      mat.opacity = Math.sin(k * Math.PI) * 0.5; // ease the trail in, then out
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // Click a glow → open its card (the tour also opens cards automatically).
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  globe.renderer().domElement.addEventListener('click', e => {
    const rect = globe.renderer().domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, globe.camera());
    const hit = raycaster.intersectObjects(markerGroup.children, false)[0];
    if (hit) {
      const m = markers.find(mm => mm.sprite === hit.object);
      if (m) onPick(m.pulse);
    }
  });

  // ---- cinematic tour: dwell on one pulse, then ease to the next, yield to the user ----
  // Rather than chasing every pulse (which causes jittery back-and-forth), we linger on a
  // target for DWELL_MS while buffering newcomers, then glide once to a single chosen next.
  // The glide runs at a constant angular speed, so near and far targets feel equally calm
  // (a fixed-duration glide would race across long jumps and crawl over short ones).
  const ANGULAR_SPEED = 30;     // degrees per second — calm, constant rotation rate
  const ALTITUDE_SPEED = 0.7;   // altitude units per second — keep zoom changes gentle
  const MIN_FLY_MS = 800;       // floor so tiny hops don't feel abrupt
  const MAX_FLY_MS = 9000;      // ceiling for half-globe jumps
  const DWELL_MS = 5000;        // time spent resting on a target before moving on
  const IDLE_POLL_MS = 1000;    // re-check cadence while waiting for a pulse / the user
  const CANDIDATE_CAP = 80;

  // Pulses seen since the last hop; the tour picks one of these to visit next.
  const candidates: Pulse[] = [];
  let lastFocus: { lat: number; lon: number } | null = null;
  let tourTimer: ReturnType<typeof setTimeout>;

  function chooseNext(): Pulse | null {
    if (!candidates.length) return null;
    const next = candidates[candidates.length - 1]; // freshest signal in the window
    candidates.length = 0;                           // drop the rest; we commit to one
    return next;
  }

  function runTour() {
    const paused = !follow || interacting || Date.now() - lastInteraction < RESUME_AFTER_MS;
    if (paused) { tourTimer = setTimeout(runTour, IDLE_POLL_MS); return; }

    const next = chooseNext();
    if (!next) { tourTimer = setTimeout(runTour, IDLE_POLL_MS); return; }

    const pov = globe.pointOfView();
    const arc = angularDistanceDeg(pov.lat, pov.lng, next.lat, next.lon);
    // Duration covers whichever takes longer — the rotation or the zoom-back — so a big
    // zoom change isn't crammed into a short hop (which felt abrupt).
    const arcMs = (arc / ANGULAR_SPEED) * 1000;
    const altMs = (Math.abs(pov.altitude - DEFAULT_ALTITUDE) / ALTITUDE_SPEED) * 1000;
    const flyMs = Math.min(MAX_FLY_MS, Math.max(MIN_FLY_MS, arcMs, altMs));
    if (lastFocus) addArc(lastFocus.lat, lastFocus.lon, next.lat, next.lon, flyMs + 2500);
    lastFocus = { lat: next.lat, lon: next.lon };
    flying = true; // suspend idle drift so it doesn't fight the glide
    globe.pointOfView({ lat: next.lat, lng: next.lon, altitude: DEFAULT_ALTITUDE }, flyMs);
    // Once we arrive, open the edit's card as if it were clicked.
    setTimeout(() => { flying = false; if (follow && !interacting) onPick(next); }, flyMs);

    tourTimer = setTimeout(runTour, flyMs + DWELL_MS);
  }
  tourTimer = setTimeout(runTour, DWELL_MS);

  const rings: RingDatum[] = [];

  function addPulse(p: Pulse, quiet = false) {
    addMarker(p);

    if (quiet) return;

    if (rings.length < q.maxRings) {
      const ring: RingDatum = {
        lat: p.lat,
        lng: p.lon,
        maxR: radiusFor(p.size_delta),
        color: t => colorFor(p.lang, p.editor_type, 1 - t),
      };
      rings.push(ring);
      globe.ringsData([...rings]);
      setTimeout(() => {
        const i = rings.indexOf(ring);
        if (i >= 0) { rings.splice(i, 1); globe.ringsData([...rings]); }
      }, 1800);
    }

    candidates.push(p);
    if (candidates.length > CANDIDATE_CAP) candidates.shift();
  }

  return {
    addPulse,
    setFollow: (on: boolean) => {
      follow = on;
      if (!on) { clearTimeout(tourTimer); tourTimer = setTimeout(runTour, IDLE_POLL_MS); }
    },
  };
}
