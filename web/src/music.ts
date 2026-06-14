// Generative ambient — Eno-style layered loops of incommensurable length. Each layer
// swells one note from the pentatonic on its own prime-number period (11, 13, 17, …s),
// so the layers never realign and the harmony keeps shifting forever. Same scale as the
// chimes (sound.ts), so the two blend. No audio assets.
interface Layer { hz: number; period: number; pan: number; }

const LAYERS: Layer[] = [
  { hz: 196.0, period: 11, pan: -0.45 }, // G3
  { hz: 261.63, period: 13, pan: 0.3 },  // C4
  { hz: 329.63, period: 17, pan: -0.2 }, // E4
  { hz: 392.0, period: 19, pan: 0.4 },   // G4
  { hz: 440.0, period: 23, pan: -0.3 },  // A4
  { hz: 587.33, period: 29, pan: 0.2 },  // D5
];

const DRONE_HZ = 98.0; // G2
const ATTACK = 2.8;
const RELEASE = 5.5;
const NOTE_PEAK = 0.11;

function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export class Music {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layerTimers: ReturnType<typeof setTimeout>[] = [];
  private playing = false;

  setEnabled(on: boolean) {
    if (on) this.start();
    else this.stop();
  }

  private start() {
    if (!this.ctx) this.build();
    const ctx = this.ctx!;
    const master = this.master!;
    void ctx.resume();
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), t);
    master.gain.linearRampToValueAtTime(0.5, t + 8); // gentle, slow fade-in
    if (!this.playing) {
      this.playing = true;
      this.startLayers();
    }
  }

  private stop() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setValueAtTime(this.master.gain.value, t);
    this.master.gain.linearRampToValueAtTime(0.0001, t + 3);
    this.clearLayers();
    this.playing = false;
    const ctx = this.ctx;
    setTimeout(() => { if (!this.playing) void ctx.suspend(); }, 3500);
  }

  private build() {
    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.0001;
    this.master = master;

    // Soft tone-shaping low-pass, then a gentle limiter so stacked swells never peak hard.
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 1400;
    tone.Q.value = 0.3;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.02;
    comp.release.value = 0.4;
    master.connect(tone).connect(comp);

    const dry = ctx.createGain();
    dry.gain.value = 0.55;
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx, 5.0, 3.0);
    const wet = ctx.createGain();
    wet.gain.value = 0.65;
    comp.connect(dry).connect(ctx.destination);
    comp.connect(reverb).connect(wet).connect(ctx.destination);

    // faint foundation drone
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.045;
    droneGain.connect(master);
    for (const detune of [-3, 3]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = DRONE_HZ;
      o.detune.value = detune;
      o.connect(droneGain);
      o.start();
    }
  }

  private startLayers() {
    LAYERS.forEach((layer, i) => {
      const fire = () => {
        this.playNote(layer);
        this.layerTimers[i] = setTimeout(fire, layer.period * 1000);
      };
      // stagger the first hit somewhere inside the period so they don't all start together
      this.layerTimers[i] = setTimeout(fire, Math.random() * layer.period * 1000);
    });
  }

  private clearLayers() {
    this.layerTimers.forEach(clearTimeout);
    this.layerTimers = [];
  }

  private playNote(layer: Layer) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const env = ctx.createGain();
    env.gain.value = 0;
    const panner = ctx.createStereoPanner();
    panner.pan.value = layer.pan;
    env.connect(panner).connect(this.master!);

    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(NOTE_PEAK, t + ATTACK);
    env.gain.linearRampToValueAtTime(0, t + ATTACK + RELEASE);

    const oscs: OscillatorNode[] = [];
    for (const detune of [-4, 4]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = layer.hz;
      o.detune.value = detune;
      o.connect(env);
      o.start(t);
      o.stop(t + ATTACK + RELEASE + 0.2);
      oscs.push(o);
    }
    oscs[oscs.length - 1].onended = () => { env.disconnect(); panner.disconnect(); };
  }
}
