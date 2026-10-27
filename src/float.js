/**
 * Something round afloat on the sea: held up by as much of it as is under
 * the water, dragged along with the water it is in, sliding down the faces
 * of the waves (which is how you surf them), and thrown clear of a crest
 * that rises fast enough under it. Units are tiles and seconds.
 */

export const GRAVITY = 9.8;

/** How it floats: half under at rest, and how hard the water and the paddling hold it. */
const BUOYANCY = 2.1;     // times its weight when all of it is under
const SINK_DRAG = 3.2;    // how quickly the water brings it to the water's own rise and fall
const SURF = 0.9;         // how much of the wave face's slope it slides down
const PADDLE = 7;         // tiles a second squared, all in the water
const WATER_DRAG = 1.1;   // across the water, a second
const AIR_DRAG = 0.05;

export function createFloat(radius, x = 0, z = 0) {
  return { r: radius, x, y: 0, z, vx: 0, vy: 0, vz: 0, wet: 0, landed: 0 };
}

/**
 * One step of `dt` seconds on `sea` (madness-engine/ocean's running sea),
 * pushed by `push` ([x, z], up to 1 each way), with the wind's way
 * `wind` (radians) and how hard it blows `breeze` (tiles a second squared).
 * Returns how hard it hit the water if it came down onto it this step.
 */
export function stepFloat(f, sea, push, dt, wind = 0, breeze = 0) {
  const s = sea.sample(f.x, f.z);
  const depth = s.height - (f.y - f.r);
  const wet = Math.min(1, Math.max(0, depth / (2 * f.r)));
  let splash = 0;
  if (wet > 0 && f.wet === 0 && f.vy < -1.5) splash = -f.vy;

  // Up: its weight, what holds it up, and the water's own rise and fall.
  f.vy += (-GRAVITY + BUOYANCY * GRAVITY * wet) * dt;
  f.vy += (s.rise - f.vy) * Math.min(1, SINK_DRAG * wet * dt);
  // Across: down the face of the wave, the paddling, the wind, and the water's drag.
  const [nx, , nz] = s.normal;
  const along = wet > 0 ? 1 : 0;
  f.vx += (nx * GRAVITY * SURF * along + push[0] * PADDLE * wet + Math.cos(wind) * breeze * wet) * dt;
  f.vz += (nz * GRAVITY * SURF * along + push[1] * PADDLE * wet + Math.sin(wind) * breeze * wet) * dt;
  const drag = Math.exp(-(WATER_DRAG * wet + AIR_DRAG) * dt);
  f.vx *= drag;
  f.vz *= drag;

  f.x += f.vx * dt;
  f.y += f.vy * dt;
  f.z += f.vz * dt;
  // Never deep under: the sea gives it back.
  const floor = s.height - f.r * 1.6;
  if (f.y < floor) {
    f.y = floor;
    f.vy = Math.max(f.vy, s.rise);
  }
  f.wet = wet;
  f.normal = s.normal;
  f.water = s.height;
  return splash;
}
