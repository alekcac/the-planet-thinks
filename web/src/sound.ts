// G major pentatonic, high to low: bigger edits ring lower
const SCALE = [1046.5, 880, 784, 659.25, 587.33, 523.25, 440, 392];

export function pitchFor(sizeDelta: number): number {
  const idx = Math.min(SCALE.length - 1, Math.floor(Math.log2(Math.abs(sizeDelta) + 1) / 1.5));
  return SCALE[idx];
}

/** A perfect fifth above the note an edit of this size would ring. */
export function newArticleInterval(sizeDelta: number): [number, number] {
  const root = pitchFor(sizeDelta);
  return [root, root * 1.5];
}

export class Chimes {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private noise: AudioBuffer | null = null;

  setEnabled(on: boolean) {
    this.enabled = on;
    if (on && !this.ctx) this.ctx = new AudioContext();
  }

  play(sizeDelta: number) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = pitchFor(sizeDelta);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 1.3);
  }

  /**
   * A new article is not just another edit — someone made a thing that did not exist.
   * Two notes a fifth apart, rising, over the usual chime.
   */
  playNewArticle(sizeDelta: number) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    newArticleInterval(sizeDelta).forEach((freq, i) => {
      const at = t + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.055, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + 1.5);
    });
  }

  /**
   * A camera shutter for a photo landing on the globe: two short bursts of filtered
   * noise, mirror up and mirror down. Synthesised rather than sampled — the site
   * ships no audio files, and a 40 ms click is cheaper to make than to download.
   */
  playShutter() {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 0.08);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    const t = ctx.currentTime;
    [0, 0.045].forEach((offset, i) => {
      const at = t + offset;
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = i === 0 ? 2600 : 1900; // the second click sits lower
      band.Q.value = 1.1;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(i === 0 ? 0.09 : 0.06, at + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
      src.connect(band).connect(gain).connect(ctx.destination);
      src.start(at);
      src.stop(at + 0.08);
    });
  }
}
