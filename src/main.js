/**
 * Endless River: a glass float carried down a river that never ends, under a
 * sky that turns from night to day and back. Everything is made as it is
 * drawn by madness-engine: the stage, the water and the sky (`ocean`), the
 * float (the engine's glass marble, blown up to a fishing float), the
 * controls, the splashes and the sound.
 *
 *     npm install && npm run dev
 *
 * `?sea=storm&sky=dusk` starts it in one of the presets (seas: glass, calm,
 * breeze, swell, storm; skies: dawn, noon, dusk, storm, night).
 */
import * as GFX from 'madness-engine/gfx';
import { createStage } from 'madness-engine/stage';
import { createOcean, mixSky, SEAS, SKIES } from 'madness-engine/ocean';
import { createEffects } from 'madness-engine/effects';
import { createInput } from 'madness-engine/input';
import { turn } from 'madness-engine/physics';
import { defineView, toGround } from 'madness-engine/view';
import { createRiver } from 'madness-engine/river';
import { createMarble } from 'madness-engine/heroes/marble';
import { createBuoys } from './buoys.js';
import { createFloat, stepFloat } from './float.js';
import { createPanel } from './panel.js';
import { createSound } from './sound.js';

const RADIUS = 1.1;
const STEP = 1 / 120;
let flowAngle = 0;
const params = new URLSearchParams(location.search);

// The time of day, as skies at hours between which the sky is mixed.
const DUSK_TO_NIGHT = mixSky(SKIES.dusk, SKIES.night, 0.55);
const MORNING = mixSky(SKIES.dawn, SKIES.noon, 0.6);
const DAY = [
  [0, SKIES.night], [4.8, SKIES.night], [6.3, SKIES.dawn], [8.6, MORNING], [12, SKIES.noon],
  [16, SKIES.noon], [18.6, SKIES.dusk], [19.7, DUSK_TO_NIGHT], [21, SKIES.night], [24, SKIES.night],
];
// How dark it is, for an overcast sky.
const DARK = [[0, 1], [5, 1], [7, 0], [18, 0], [20.5, 1], [24, 1]];
const NIGHT_STORM = mixSky(SKIES.storm, SKIES.night, 0.85);
const HOURS = { dawn: 6.3, noon: 12, dusk: 18.6, storm: 13, night: 23 };

const at = (table, hour) => {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < table.length - 2 && table[i + 1][0] <= h) i++;
  const [h0, a] = table[i], [h1, b] = table[i + 1];
  const f = (h - h0) / (h1 - h0);
  return typeof a === 'number' ? a + (b - a) * f : mixSky(a, b, f);
};

// What the sliders say, and the presets they start from.
const seaName = SEAS[params.get('sea')] ? params.get('sea') : 'calm';
const skyName = SKIES[params.get('sky')] ? params.get('sky') : 'dusk';
const state = {
  seaBase: SEAS[seaName],
  ...seaSliders(SEAS[seaName]),
  ...skySliders(skyName),
  exposure: 1,
  distance: 1,
  flow: false,
  current: 0.6,
  width: 28,
  murk: 0.5,
  snake: 0.4,
};

function seaSliders(sea) {
  return { height: sea.height, longest: sea.longest, choppy: sea.choppy, spread: sea.spread, wind: ((sea.wind * 180) / Math.PI + 360) % 360, foam: sea.foam };
}
function skySliders(name) {
  return { hour: HOURS[name], overcast: name === 'storm' ? 1 : 0, clouds: SKIES[name === 'storm' ? 'noon' : name].cloud.cover, haze: 1 };
}

/** The sea the sliders make: the preset's own waves, as high, as long and as choppy as the sliders say. */
function seaOf(s) {
  const base = s.seaBase;
  const ratio = base.swell ? base.swell[1] / base.height : 0;
  return {
    ...base,
    height: s.height, longest: s.longest, choppy: s.choppy, spread: s.spread, foam: s.foam,
    // The water runs down the river, wherever the bend at the float points it.
    wind: flowAngle,
    swell: base.swell ? [base.swell[0], s.height * ratio] : null,
  };
}

/** The sky the sliders make: the hour's sky, clouded over as far as they say. */
function skyOf(s) {
  let sky = at(DAY, s.hour);
  if (s.overcast > 0) {
    const grey = mixSky(SKIES.storm, NIGHT_STORM, at(DARK, s.hour));
    sky = mixSky(sky, { ...grey, sun: { ...grey.sun, at: sky.sun.at } }, s.overcast);
  }
  const muddy = { deep: '#1a1408', body: '#5a4a24', glow: '#8a7a3a' };
  const water = { ...sky.water };
  for (const k in muddy) water[k] = '#' + new GFX.Color(sky.water[k]).lerp(new GFX.Color(muddy[k]), s.murk).getHexString();
  return {
    ...sky,
    water,
    cloud: { ...sky.cloud, cover: s.clouds + (0.95 - s.clouds) * s.overcast },
    haze: sky.haze * s.haze,
  };
}

// ---------------------------------------------------------------- the stage

const host = document.getElementById('game');
const { createView } = defineView({ home: { pitch: 0.3 }, limits: { pitch: [0.04, 1.3], zoom: [0.35, 4] } });
const stage = await createStage(host, {
  view: createView(),
  lens: { distance: 14, fov: 42 },
  ui: [document.getElementById('hud')],
  // Nothing here stands on anything to shade: the water takes no shadows.
  shadows: false,
  label: 'endless-river',
});
const { scene, camera, view } = stage;

const ocean = createOcean(GFX, { sea: seaOf(state), sky: skyOf(state), roomEvery: 1.5 });
scene.add(ocean.group);
ocean.dress(stage);

// Face downstream to begin with.
view.yaw = view.aim.yaw = -Math.PI / 2;

// The float: the engine's glass marble, the size of a fishing float.
const ball = createFloat(RADIUS);
const { marble, spin } = createMarble(GFX, { radius: RADIUS });
scene.add(marble);
const q = [0, 0, 0, 1], spinRate = [0, 0, 0];
ball.y = ocean.sea.sample(0, 0).height;

const buoys = createBuoys(GFX, scene);

// The river: a current downstream between two banks, winding as far as `snake` says.
const river = createRiver(GFX, scene, state);

const effects = createEffects(GFX, scene, { ground: ocean.sea });
const drop = new GFX.SphereGeometry(0.09, 6, 4);
const dropMaterial = new GFX.MeshBasicMaterial({ name: 'spray', color: new GFX.Color('#e8f4f6'), transparent: true, opacity: 0.85 });
const sound = createSound();

const input = createInput(host, {
  anchor() {
    const v = new GFX.Vector3(ball.x, ball.y, ball.z).project(camera);
    const r = host.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  },
});

// ---------------------------------------------------------------- the panel

const panel = createPanel(document.getElementById('panel'), [
  {
    title: 'Sea',
    presets: Object.keys(SEAS).map((name) => [name, () => {
      state.seaBase = SEAS[name];
      Object.assign(state, seaSliders(SEAS[name]));
      panel.set(seaSliders(SEAS[name]));
      ocean.setSea(seaOf(state), 5);
    }]),
    sliders: [
      { key: 'height', label: 'Wave height', min: 0, max: 6, step: 0.01, value: state.height, show: (v) => `${v.toFixed(2)} m` },
      { key: 'longest', label: 'Wavelength', min: 20, max: 240, step: 1, value: state.longest, show: (v) => `${v.toFixed(0)} m` },
      { key: 'choppy', label: 'Choppiness', min: 0, max: 0.95, step: 0.01, value: state.choppy },
      { key: 'spread', label: 'Crests (long ↔ confused)', min: 0.05, max: 1.4, step: 0.01, value: state.spread },
      { key: 'foam', label: 'Whitecaps', min: 0, max: 1, step: 0.01, value: state.foam },
    ],
  },
  {
    title: 'Sky',
    presets: Object.keys(SKIES).map((name) => [name, () => {
      Object.assign(state, skySliders(name));
      panel.set(skySliders(name));
      ocean.setSky(skyOf(state), 5);
    }]),
    sliders: [
      { key: 'hour', label: 'Time of day', min: 0, max: 24, step: 0.05, value: state.hour, show: clock },
      { key: 'overcast', label: 'Overcast', min: 0, max: 1, step: 0.01, value: state.overcast },
      { key: 'clouds', label: 'Clouds', min: 0, max: 1, step: 0.01, value: state.clouds },
      { key: 'haze', label: 'Haze', min: 0.2, max: 4, step: 0.01, value: state.haze, show: (v) => `×${v.toFixed(1)}` },
      { key: 'exposure', label: 'Exposure', min: 0.4, max: 2, step: 0.01, value: state.exposure, show: (v) => `×${v.toFixed(2)}` },
    ],
    toggles: [{ key: 'flow', label: 'Let the day go by', value: state.flow }],
  },
  {
    title: 'River',
    sliders: [
      { key: 'current', label: 'Current', min: 0, max: 3, step: 0.01, value: state.current },
      { key: 'width', label: 'Width', min: 6, max: 80, step: 1, value: state.width, show: (v) => `${v.toFixed(0)} m` },
      { key: 'snake', label: 'Snakiness', min: 0, max: 1, step: 0.01, value: state.snake },
      { key: 'murk', label: 'Murkiness', min: 0, max: 1, step: 0.01, value: state.murk },
    ],
  },
  {
    title: 'View',
    sliders: [{ key: 'distance', label: 'Camera distance', min: 0.35, max: 4, step: 0.01, value: state.distance, show: (v) => `×${v.toFixed(2)}` }],
  },
], (key, value) => {
  state[key] = value;
  if (key in river) river[key] = value;
  if (['height', 'longest', 'choppy', 'spread', 'wind', 'foam'].includes(key)) ocean.setSea(seaOf(state), 0.5);
  else if (['hour', 'overcast', 'clouds', 'haze', 'murk'].includes(key)) ocean.setSky(skyOf(state), 0.25);
  else if (key === 'exposure') ocean.exposure = value;
  else if (key === 'distance') view.aim.zoom = value;
});
panel.choose('Sea', seaName);
panel.choose('Sky', skyName);
// Folded away to begin with on a phone, where it would cover the sea.
if (params.get('panel') === 'closed' || matchMedia('(max-width: 640px)').matches) {
  document.getElementById('panel').classList.add('closed');
  document.querySelector('.panel-head').setAttribute('aria-expanded', 'false');
}

function clock(h) {
  const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- the loop

const hudDrift = document.getElementById('drift');
const toCamera = new GFX.Vector3();
let accumulator = 0, time = 0, last = null, skyClock = 0, lift = null;

stage.renderer.setAnimationLoop((now) => {
  const dt = last === null ? 0 : Math.min(0.1, (now - last) / 1000);
  last = now;
  time += dt;

  for (const p of input.take()) {
    if (p === 'mute') sound.audio.toggleMute();
    if (p === 'home') view.reset();
  }
  const look = input.view(dt);
  view.turn(look.turn, look.tilt);
  view.zoomBy(look.zoom);
  view.step(dt);

  if (state.flow) {
    // A day in four minutes.
    state.hour = (state.hour + dt * 0.1) % 24;
    skyClock -= dt;
    if (skyClock <= 0) {
      skyClock = 0.2;
      ocean.setSky(skyOf(state), 0.2);
      panel.set({ hour: state.hour });
    }
  }

  // The float, in fixed steps.
  const push = toGround(input.stick(), view.yaw);
  {
    const a = river.flow(ball.x);
    if (Math.abs(a - flowAngle) > 0.05) {
      flowAngle = a;
      ocean.setSea(seaOf(state), 1);
    }
    const [cx, cz] = river.push(ball.x);
    push[0] += cx;
    push[1] += cz;
  }
  accumulator = Math.min(accumulator + dt, STEP * 12);
  while (accumulator >= STEP) {
    accumulator -= STEP;
    const hard = stepFloat(ball, ocean.sea, push, STEP, ocean.sea.wind, 0.15 + 0.25 * state.foam);
    if (hard > 2.5) {
      sound.splash(hard);
      effects.burst({
        at: [ball.x, ball.water, ball.z], count: Math.round(10 + 6 * Math.min(6, hard)), mesh: () => new GFX.Mesh(drop, dropMaterial),
        speed: 1.5 + hard * 0.35, up: 2 + hard * 0.5, carry: [ball.vx * 0.5, ball.vz * 0.5], life: 0.9, spin: 0, bounce: 0, floaty: 1, scale: [0.6, 1.4],
      });
    }
  }
  // The banks turn the float back into the stream.
  river.keep(ball);
  river.place(ball.x);
  buoys.update(ocean.sea, ball.x, ball.z, time, dt, ball);
  for (const b of buoys.list) {
    if (b.knock) {
      sound.knock(b.knock);
      b.knock = 0;
    }
  }
  marble.position.set(ball.x, ball.y, ball.z);
  // Turning as it goes, as a ball does on the water.
  spinRate[0] = ball.vz / ball.r;
  spinRate[2] = -ball.vx / ball.r;
  turn(q, spinRate, dt);
  spin.quaternion.set(...q);

  ocean.update(dt);
  effects.update(dt);

  // The camera after the float, further back the bigger the sea, and never under the water.
  const k = 1 - Math.exp(-4 * dt);
  stage.target.x += (ball.x - stage.target.x) * k;
  stage.target.y += (ball.y + 0.8 - stage.target.y) * k;
  stage.target.z += (ball.z - stage.target.z) * k;
  stage.look();
  toCamera.subVectors(camera.position, stage.target).multiplyScalar(1 + 0.14 * state.height);
  camera.position.copy(stage.target).add(toCamera);
  // High enough to see the float over the water between: wherever a crest
  // would come between, the camera rises over it, quickly, and settles back slowly.
  const T = stage.target, C = camera.position;
  let need = Math.max(ocean.sea.sample(C.x, C.z).height + 1.6, T.y + 2 + 0.5 * state.height);
  for (const f of [0.25, 0.5, 0.75]) {
    const crest = ocean.sea.sample(T.x + (C.x - T.x) * f, T.z + (C.z - T.z) * f).height + 0.8;
    need = Math.max(need, T.y + (crest - T.y) / f);
  }
  lift = lift === null ? need : lift + (need - lift) * (1 - Math.exp(-(need > lift ? 6 : 1.5) * dt));
  C.y = Math.max(C.y, lift);
  camera.lookAt(stage.target);
  camera.updateMatrixWorld();
  stage.render();

  sound.update({
    height: state.height, foam: state.foam, swing: ocean.sea.sample(ball.x, ball.z).rise,
    speed: Math.hypot(ball.vx, ball.vz), wet: ball.wet,
  });
  hudDrift.textContent = `${ball.x.toFixed(0)} m downstream`;
});

/** For the console, and for a test to drive. */
globalThis.endless = { ocean, stage, ball, state, panel };
