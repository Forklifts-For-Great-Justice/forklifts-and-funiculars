/**
 * Procedural Web Audio API foley synthesizer — zero external audio assets needed.
 * Automatically unlocks on the first user gesture and respects mute/tab-blur state.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private winchOsc: OscillatorNode | null = null;
  private winchGain: GainNode | null = null;

  public isMuted(): boolean {
    return this.muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.muted && this.engineGain && this.winchGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.winchGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();

    // Continuous subtle electric forklift motor hum
    this.engineOsc = this.ctx.createOscillator();
    this.engineGain = this.ctx.createGain();
    this.engineOsc.type = 'triangle';
    this.engineOsc.frequency.value = 78;
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();

    // Continuous funicular cable winch hum
    this.winchOsc = this.ctx.createOscillator();
    this.winchGain = this.ctx.createGain();
    this.winchOsc.type = 'sawtooth';
    const winchFilter = this.ctx.createBiquadFilter();
    winchFilter.type = 'lowpass';
    winchFilter.frequency.value = 210;
    this.winchOsc.frequency.value = 62;
    this.winchGain.gain.value = 0;
    this.winchOsc.connect(winchFilter);
    winchFilter.connect(this.winchGain);
    this.winchGain.connect(this.ctx.destination);
    this.winchOsc.start();
  }

  public updateContinuous(speedNorm: number, liftActive: boolean, funicularMoving: boolean): void {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.winchOsc || !this.winchGain) return;
    const now = this.ctx.currentTime;
    if (this.muted || this.ctx.state !== 'running') {
      this.engineGain.gain.setTargetAtTime(0, now, 0.05);
      this.winchGain.gain.setTargetAtTime(0, now, 0.05);
      return;
    }

    const driveVol = Math.min(0.06, 0.008 + speedNorm * 0.045 + (liftActive ? 0.018 : 0));
    const driveFreq = 72 + speedNorm * 95 + (liftActive ? 55 : 0);
    this.engineOsc.frequency.setTargetAtTime(driveFreq, now, 0.06);
    this.engineGain.gain.setTargetAtTime(driveVol, now, 0.06);

    const winchVol = funicularMoving ? 0.055 : 0;
    this.winchOsc.frequency.setTargetAtTime(funicularMoving ? 68 : 50, now, 0.12);
    this.winchGain.gain.setTargetAtTime(winchVol, now, 0.12);
  }

  public playHorn(): void {
    this.playTone(460, 0.14, 'square', 0.09, 440);
    setTimeout(() => this.playTone(580, 0.16, 'square', 0.08, 570), 110);
  }

  public playBell(): void {
    this.playTone(880, 0.45, 'sine', 0.12, 875);
    this.playTone(1320, 0.35, 'triangle', 0.06, 1310);
  }

  public playClack(): void {
    this.playTone(180, 0.07, 'triangle', 0.12, 95);
  }

  public playLock(locked: boolean): void {
    this.playTone(locked ? 310 : 230, 0.09, 'sine', 0.1, locked ? 440 : 170);
  }

  public playOverload(): void {
    this.playTone(145, 0.22, 'sawtooth', 0.11, 130);
    setTimeout(() => this.playTone(125, 0.28, 'sawtooth', 0.11, 110), 210);
  }

  public playDeliver(): void {
    this.playTone(523.25, 0.18, 'triangle', 0.12);
    setTimeout(() => this.playTone(659.25, 0.2, 'triangle', 0.12), 110);
    setTimeout(() => this.playTone(783.99, 0.32, 'triangle', 0.12), 220);
  }

  public playBreak(): void {
    this.playTone(340, 0.12, 'sawtooth', 0.11, 110);
    setTimeout(() => this.playTone(210, 0.18, 'square', 0.09, 75), 70);
  }

  public playVictory(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, idx) => {
      setTimeout(() => this.playTone(n, 0.35, 'triangle', 0.12), idx * 115);
    });
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    endFreq?: number,
  ): void {
    if (this.muted) return;
    this.unlock();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (endFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), now + duration);
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }
}
