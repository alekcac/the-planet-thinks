// G major pentatonic, high to low: bigger edits ring lower
const SCALE = [1046.5, 880, 784, 659.25, 587.33, 523.25, 440, 392];

export function pitchFor(sizeDelta: number): number {
  const idx = Math.min(SCALE.length - 1, Math.floor(Math.log2(Math.abs(sizeDelta) + 1) / 1.5));
  return SCALE[idx];
}

export class Chimes {
  private ctx: AudioContext | null = null;
  private enabled = false;

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
}
