import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from '../.cache/arkglide/tests/helpers/foundations.mjs';
import { createCompanion } from '../game/companion.js';

// Use the pinned engine's native visual/lifecycle runtime and Babylon NullEngine.
// Camera inputs below test mount mathematics; browser traversal is tested apart.
test('栈雀 uses native visible parts without collision bodies or per-frame allocation', () => {
  const s = setup();
  try {
    const camera = { position: { x: 3, y: 1.6, z: 4 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    const companion = createCompanion({ visuals: s.v }, { getPose: () => camera });
    const first = companion.snapshot();
    assert.deepEqual(first.resources, { meshes: 12, materials: 5 });
    assert.equal(s.visuals.stats().visualResources, 17);
    assert.equal(s.physics.stats().physicsBodies, 0);
    assert.ok(first.parts.every(p => s.entities.sceneAPI.find(p.id)));
    const housing = s.entities.getObject('zanque:housing').getBoundingInfo().boundingBox;
    assert.ok(Math.abs(housing.maximum.x - housing.minimum.x - .23 * .82) < 1e-7,
      'housing geometry uses the browser-reviewed compact scale');
    for (let i = 0; i < 120; i++) companion.update(1 / 60, { speaking: true });
    assert.equal(companion.snapshot().mode, 'speaking');
    assert.notDeepEqual(companion.snapshot().parts, first.parts, 'articulated parts visibly change pose');
    assert.equal(s.visuals.stats().visualResources, 17);
    companion.update(1 / 60, { observing: true });
    assert.equal(companion.snapshot().mode, 'observing');
    const beforePause = companion.snapshot();
    for (let i = 0; i < 60; i++) companion.update(1 / 60, { paused: true });
    assert.equal(companion.snapshot().mode, 'paused');
    assert.deepEqual(companion.snapshot().parts, beforePause.parts, 'pause freezes articulation');
    assert.equal(s.physics.stats().physicsBodies, 0);
  } finally { s.done(); }
});

test('mapped camera anchors 栈雀 immediately, without a world interpolation trail', () => {
  const s = setup();
  try {
    let camera = { position: { x: 3, y: 1.6, z: 4 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    const companion = createCompanion({ visuals: s.v }, { getPose: () => camera });
    const initial = companion.snapshot();
    camera = { position: { x: 24, y: 4, z: 10 }, rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } };
    // Even an update before the traversal notification uses the new view pose.
    companion.update(0);
    assert.ok(Math.abs(companion.snapshot().worldPosition.x - 24.7) < 1e-10);
    companion.snap();
    const moved = companion.snapshot();
    assert.ok(Math.abs(moved.worldPosition.x - 24.7) < 1e-10);
    assert.ok(Math.abs(moved.worldPosition.y - 3.72) < 1e-10);
    assert.ok(Math.abs(moved.worldPosition.z - 9.61) < 1e-10);
    assert.ok(Math.abs(moved.mountDistance - initial.mountDistance) < 1e-10);
    assert.ok(moved.parts.every(p => Math.hypot(p.position.x - 24, p.position.y - 4, p.position.z - 10) < 1.15));
    assert.deepEqual(camera.position, { x: 24, y: 4, z: 10 }, 'module never changes player/view input');
    assert.equal(s.visuals.stats().visualResources, 17);
  } finally { s.done(); }
});

test('retry snap reuses parts; explicit disposal and native owner cleanup release all companion resources', () => {
  const s = setup();
  try {
    const camera = { position: { x: 3, y: 1.6, z: 4 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    const companion = createCompanion({ visuals: s.v }, { getPose: () => camera });
    const ids = companion.snapshot().parts.map(p => p.id);
    for (let i = 0; i < 5; i++) {
      companion.update(1 / 60, { speaking: true }); companion.snap();
      assert.deepEqual(companion.snapshot().parts.map(p => p.id), ids);
      assert.equal(s.visuals.stats().visualResources, 17);
    }
    companion.dispose(); companion.dispose();
    assert.deepEqual(companion.snapshot().resources, { meshes: 0, materials: 0 });
    assert.equal(s.visuals.stats().visualResources, 0);
    assert.ok(ids.every(id => !s.entities.sceneAPI.find(id)));
    const next = createCompanion({ visuals: s.v }, { getPose: () => camera });
    s.owner.abort();
    assert.deepEqual(next.snapshot().resources, { meshes: 0, materials: 0 });
    assert.equal(s.visuals.stats().visualResources, 0);
    assert.equal(s.physics.stats().physicsBodies, 0);
    assert.deepEqual(s.errors, []);
  } finally { s.done(); }
});

test('live-aperture shoulder fold retracts locally and stays folded across a mapped view', () => {
  const s = setup();
  try {
    let camera = { position: { x: 11, y: 1.6, z: 8.7 }, rotation: { x: 0, y: 0, z: 0, w: 1 } };
    const companion = createCompanion({ visuals: s.v }, { getPose: () => camera });
    const ids = companion.snapshot().parts.map(p => p.id);
    let previous = companion.snapshot().localOffset.z;
    for (let i = 0; i < 18; i++) {
      companion.update(1 / 60, { retracted: true, speaking: true });
      const current = companion.snapshot();
      assert.ok(current.localOffset.z < previous, 'fold withdraws toward shoulder without forward overshoot');
      previous = current.localOffset.z;
    }
    const folded = companion.snapshot();
    assert.equal(folded.retracted, true);
    assert.ok(folded.retraction > .99);
    assert.ok(folded.localOffset.z < -.11, 'housing is behind the first-person eye');
    camera = { position: { x: 23.9, y: 4, z: 10 }, rotation: { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 } };
    companion.snap();
    const mapped = companion.snapshot();
    assert.equal(mapped.retracted, true);
    assert.deepEqual(mapped.localOffset, { x: .40, y: -.34, z: -.12 });
    assert.ok(Math.abs(mapped.worldPosition.x - 24.02) < 1e-10);
    assert.ok(Math.abs(mapped.worldPosition.z - 10.4) < 1e-10);
    assert.ok(mapped.parts.every(p => Math.hypot(p.position.x - camera.position.x,
      p.position.y - camera.position.y, p.position.z - camera.position.z) < .8));
    companion.update(1 / 60, { retracted: false });
    assert.ok(companion.snapshot().localOffset.z > -.12 && companion.snapshot().localOffset.z < .70,
      'leaving the landing unfolds locally rather than jumping forward');
    for (let i = 0; i < 30; i++) companion.update(1 / 60, { retracted: false });
    assert.equal(companion.snapshot().retracted, false);
    assert.ok(companion.snapshot().localOffset.z > .69);
    assert.deepEqual(companion.snapshot().parts.map(p => p.id), ids);
    assert.equal(s.visuals.stats().visualResources, 17);
    assert.equal(s.physics.stats().physicsBodies, 0);
    companion.dispose();
    assert.equal(s.visuals.stats().visualResources, 0);
  } finally { s.done(); }
});
