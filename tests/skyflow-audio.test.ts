import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine, type Sfx } from '../src/audio/AudioEngine';

// Captures scheduling at the Web Audio boundary. These checks do not establish
// browser unlock behavior, speaker output or subjective loudness.
class Param {
  value = 0;
  values: number[] = [];
  setValueAtTime(value: number): void { this.values.push(value); this.value = value; }
  setTargetAtTime(value: number): void { this.value = value; }
  linearRampToValueAtTime(value: number): void { this.values.push(value); this.value = value; }
  exponentialRampToValueAtTime(value: number): void { this.values.push(value); this.value = value; }
}

class Node {
  gain = new Param(); frequency = new Param(); detune = new Param(); Q = new Param();
  threshold = new Param(); ratio = new Param(); attack = new Param(); release = new Param();
  type = '';
  buffer: unknown;
  startTime = -1;
  stopTime = -1;
  targets: unknown[] = [];
  connect(target: unknown): void { this.targets.push(target); }
  start(time: number): void { this.startTime = time; }
  stop(time: number): void { this.stopTime = time; }
}

class AudioBoundary {
  currentTime = 0;
  sampleRate = 1000;
  state = 'running';
  destination = new Node();
  sources: Node[] = [];
  createGain(): Node { return new Node(); }
  createDynamicsCompressor(): Node { return new Node(); }
  createConvolver(): Node { return new Node(); }
  createBiquadFilter(): Node { return new Node(); }
  createOscillator(): Node { const node = new Node(); this.sources.push(node); return node; }
  createBufferSource(): Node { const node = new Node(); this.sources.push(node); return node; }
  createBuffer(channels: number, length: number): { getChannelData: (channel: number) => Float32Array } {
    const data = Array.from({ length: channels }, () => new Float32Array(length));
    return { getChannelData: (channel) => data[channel] };
  }
  async suspend(): Promise<void> { this.state = 'suspended'; }
  async resume(): Promise<void> { this.state = 'running'; }
  async close(): Promise<void> { this.state = 'closed'; }
}

async function ready(): Promise<{ audio: AudioEngine; ctx: AudioBoundary }> {
  vi.stubGlobal('window', { AudioContext: AudioBoundary, setInterval: () => 1 });
  const audio = new AudioEngine();
  await audio.unlock();
  return { audio, ctx: audio.ctx as unknown as AudioBoundary };
}

afterEach(() => vi.unstubAllGlobals());

describe('Skyflow sound scheduling', () => {
  it.each(['curl', 'uncurl', 'pumpGood', 'pumpPerfect', 'rollLand', 'rollJump', 'rollBrake'] satisfies Sfx[])(
    '%s schedules a finite, quiet one-shot instead of a continuous roll loop', async (name) => {
      const { audio, ctx } = await ready();
      audio.play(name);
      expect(ctx.sources.length).toBeGreaterThan(0);
      for (const node of ctx.sources) {
        expect(node.startTime).toBeGreaterThanOrEqual(ctx.currentTime);
        expect(node.stopTime).toBeGreaterThan(node.startTime);
        expect(node.stopTime - ctx.currentTime).toBeLessThan(1);
        expect(node.targets.length).toBeGreaterThan(0);
      }
      audio.dispose();
    },
  );

  it('perfect pumping has a distinct rising accent, and repeated events are rate-limited', async () => {
    const { audio, ctx } = await ready();
    audio.play('pumpGood');
    const good = ctx.sources[0].frequency.values;
    const count = ctx.sources.length;
    audio.play('pumpGood');
    expect(ctx.sources.length).toBe(count);
    audio.play('pumpPerfect');
    const perfect = ctx.sources[count].frequency.values;
    expect(perfect.at(-1)!).toBeGreaterThan(good.at(-1)!);
    const now = ctx.sources.length;
    ctx.currentTime += 0.13;
    audio.play('pumpPerfect');
    expect(ctx.sources.length).toBeGreaterThan(now);
    audio.dispose();
  });

  it('mute, zero SFX volume and pause create no sound sources; resuming permits a fresh cue', async () => {
    const { audio, ctx } = await ready();
    audio.setMuted(true); audio.play('pumpPerfect');
    expect(ctx.sources.length).toBe(0);
    audio.setMuted(false); audio.sfxVolume = 0; audio.play('pumpPerfect');
    expect(ctx.sources.length).toBe(0);
    audio.sfxVolume = 1; audio.pause(); audio.play('pumpPerfect');
    expect(ctx.sources.length).toBe(0);
    audio.resume(); await Promise.resolve(); audio.play('pumpPerfect');
    expect(ctx.sources.length).toBeGreaterThan(0);
    audio.dispose();
  });

  it('does not require audio support or an unlocked context for gameplay events', async () => {
    const audio = new AudioEngine();
    audio.play('curl'); audio.play('pumpPerfect');
    vi.stubGlobal('window', {});
    await audio.unlock();
    expect(audio.status).toBe('unsupported');
    expect(() => audio.play('rollLand')).not.toThrow();
  });
});
