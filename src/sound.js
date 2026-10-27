import { createAudio } from 'madness-engine/audio';

/**
 * The sea's sound, made as it plays from noise: a low wash that swells with
 * the waves, a hiss of spray when it blows hard, the slap of the water as
 * the float rides it, splashes as it comes down, and a knock on a buoy.
 */
export function createSound() {
  let wash = null, hiss = null, slap = null;
  const audio = createAudio({
    storageKey: 'endless-ocean.muted',
    glue: true,
    onWake(a) {
      wash = a.loop({ filters: [{ type: 'lowpass', freq: 380 }, { type: 'lowpass', freq: 900 }] });
      hiss = a.loop({ filters: [{ type: 'highpass', freq: 2400 }, { type: 'lowpass', freq: 7000 }] });
      slap = a.loop({ filters: [{ type: 'bandpass', freq: 700, q: 1.2 }] });
    },
  });
  for (const event of ['pointerdown', 'keydown']) addEventListener(event, () => audio.wake());

  return {
    audio,
    /**
     * Once a frame: `height` how big the sea is (tiles), `foam` how much it
     * breaks, `swing` how fast the water under the float rises or falls,
     * `speed` how fast the float goes, `wet` how much of it is in.
     */
    update({ height, foam, swing, speed, wet }) {
      const big = Math.min(1, height / 6);
      wash?.set({ gain: 0.12 + 0.35 * big + 0.12 * Math.min(1, Math.abs(swing) / 3), filter: 260 + 500 * big + 120 * Math.abs(swing), smooth: 0.3 });
      hiss?.set({ gain: 0.015 + 0.09 * foam * big, smooth: 0.4 });
      slap?.set({ gain: wet > 0 ? Math.min(0.14, speed * 0.02) : 0, filter: 500 + speed * 70, smooth: 0.08 });
    },
    splash(hard) {
      const k = Math.min(1, hard / 8);
      audio.burst({ length: 0.25 + 0.4 * k, type: 'lowpass', freq: 2200, sweep: 300, gain: 0.25 + 0.5 * k });
      audio.burst({ at: 0.03, length: 0.5 + 0.5 * k, type: 'highpass', freq: 3000, gain: 0.08 + 0.15 * k });
    },
    knock(hard) {
      const k = Math.min(1, hard / 6);
      audio.tone({ freq: 180, to: 120, length: 0.4, gain: 0.25 * k, type: 'triangle' });
      audio.burst({ length: 0.08, type: 'bandpass', freq: 900, gain: 0.3 * k });
    },
  };
}
