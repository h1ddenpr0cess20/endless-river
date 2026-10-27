/**
 * Buoys, moored all over the sea: the ocean has no end, so they are worked
 * out from where you are. The sea is cut into squares, and a square has a
 * buoy in it, or not, by a hash of where it is; the few squares round you
 * get one of a handful of models to ride their water. They bob, lean with
 * the waves, and blink, and you bounce off them. Against them you can see
 * how big the waves are.
 */

const CELL = 70;
const NEAR = 2;              // squares out each way
const POOL = 14;
const HEIGHT = 3.2;          // tiles, from the waterline to the light

const hash = (x, z) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export function createBuoys(GFX, scene) {
  const paint = (hex, rough = 0.5) => new GFX.MeshStandardMaterial({ color: new GFX.Color(hex), roughness: rough });
  const red = paint('#c8262a', 0.45), white = paint('#ecebe4', 0.5), iron = paint('#2a2c30', 0.7), green = paint('#1f8a4c', 0.45);
  const lamps = { red: new GFX.Color('#ff3a2a'), green: new GFX.Color('#38ff7a'), off: new GFX.Color('#2a1010') };

  const buoys = Array.from({ length: POOL }, () => {
    const group = new GFX.Group();
    const tilt = new GFX.Group();
    const body = new GFX.Mesh(new GFX.CylinderGeometry(0.75, 1.0, 1.6, 20), red);
    body.position.y = 0.2;
    const band = new GFX.Mesh(new GFX.CylinderGeometry(0.77, 0.86, 0.35, 20), white);
    band.position.y = 0.55;
    const cage = new GFX.Mesh(new GFX.CylinderGeometry(0.08, 0.08, 1.8, 6), iron);
    cage.position.y = 1.9;
    const top = new GFX.Mesh(new GFX.ConeGeometry(0.42, 0.7, 4), red);
    top.position.y = 2.6;
    const lamp = new GFX.Mesh(new GFX.SphereGeometry(0.2, 12, 8), new GFX.MeshBasicMaterial({ color: lamps.red.clone() }));
    lamp.position.y = HEIGHT;
    for (const m of [body, band, cage, top]) m.castShadow = true;
    tilt.add(body, band, cage, top, lamp);
    group.add(tilt);
    group.visible = false;
    scene.add(group);
    return { group, tilt, body, top, lamp, cell: null, x: 0, z: 0, phase: 0, green: false, lean: [0, 0] };
  });

  const up = new GFX.Vector3(0, 1, 0), n = new GFX.Vector3(), q = new GFX.Quaternion();

  return {
    list: buoys,
    /** Places the buoys round (x, z) on `sea` at time `t`, and pushes `ball` off any it touches. */
    update(sea, x, z, t, dt, ball) {
      const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
      const want = new Map();
      for (let i = -NEAR; i <= NEAR; i++) {
        for (let j = -NEAR; j <= NEAR; j++) {
          const gx = cx + i, gz = cz + j;
          if (hash(gx, gz) < 0.45) want.set(`${gx},${gz}`, [gx, gz]);
        }
      }
      // Keep the ones still near, free the rest, and give the free ones to the new squares.
      for (const b of buoys) if (b.cell && !want.has(b.cell)) b.cell = null;
      for (const b of buoys) if (b.cell) want.delete(b.cell);
      for (const [key, [gx, gz]] of want) {
        const b = buoys.find((o) => !o.cell);
        if (!b) break;
        b.cell = key;
        b.x = (gx + 0.2 + 0.6 * hash(gx + 11, gz - 7)) * CELL;
        b.z = (gz + 0.2 + 0.6 * hash(gx - 5, gz + 13)) * CELL;
        b.phase = hash(gx * 3, gz * 5) * 4;
        b.green = hash(gx + 1, gz + 1) < 0.5;
        b.body.material = b.top.material = b.green ? green : red;
      }
      for (const b of buoys) {
        b.group.visible = Boolean(b.cell);
        if (!b.cell) continue;
        const s = sea.sample(b.x, b.z);
        b.group.position.set(b.x, s.height - 0.35, b.z);
        // Lean with the water, a little behind it, as something moored and heavy does.
        const k = 1 - Math.exp(-3 * dt);
        b.lean[0] += (s.normal[0] - b.lean[0]) * k;
        b.lean[1] += (s.normal[2] - b.lean[1]) * k;
        n.set(b.lean[0] * 0.8, 1, b.lean[1] * 0.8).normalize();
        q.setFromUnitVectors(up, n);
        b.tilt.quaternion.copy(q);
        const on = (t + b.phase) % 4 < (b.green ? 0.5 : 0.25) || (!b.green && (t + b.phase) % 4 > 0.6 && (t + b.phase) % 4 < 0.85);
        b.lamp.material.color.copy(on ? (b.green ? lamps.green : lamps.red) : lamps.off);

        // The ball bounces off its body.
        const dx = ball.x - b.x, dz = ball.z - b.z;
        const d = Math.hypot(dx, dz), reach = ball.r + 0.95;
        if (d < reach && d > 1e-4 && ball.y < s.height + HEIGHT) {
          const ux = dx / d, uz = dz / d;
          ball.x = b.x + ux * reach;
          ball.z = b.z + uz * reach;
          const into = ball.vx * ux + ball.vz * uz;
          if (into < 0) {
            ball.vx -= 1.6 * into * ux;
            ball.vz -= 1.6 * into * uz;
            b.knock = -into;
          }
        }
      }
    },
  };
}
