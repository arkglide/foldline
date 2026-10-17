import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveStatic } from '../scripts/serve.mjs';
import { InputDriver, cameraAngles } from './input-driver.mjs';

const output = fileURLToPath(new URL('../.generated/l01/', import.meta.url));
const evidence = new URL('../docs/evidence/m1-l01/', import.meta.url);
let server;
let browser;
let baseUrl;

test.before(async () => {
  await fs.access(new URL('../.generated/l01/index.html', import.meta.url));
  await fs.mkdir(evidence, { recursive: true });
  server = await serveStatic(output, 0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',
    headless: true,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
});

test.after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function start(page) {
  await page.goto(baseUrl);
  await page.evaluate(() => ArkGlidePlayer.start());
  return await startedFrame(page);
}

async function startedFrame(page) {
  await page.waitForFunction(() => document.body.dataset.state === 'playing');
  const frame = page.frames().find(frame => frame.url().includes('runtime.html?boot='));
  assert.ok(frame, 'native ArkGlide runtime iframe exists');
  await frame.waitForFunction(() => globalThis.foldlineL01?.snapshot().ready);
  assert.equal(await frame.evaluate(() => scriptErrors), 0);
  return frame;
}

async function createPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  return { page, errors };
}

async function capture(page, name) {
  const frame = page.frames().find(frame => frame.url().includes('runtime.html?boot='));
  if (frame) await frame.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    await new Promise(resolve => requestAnimationFrame(resolve));
  });
  await page.waitForTimeout(180);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, evidence)) });
}

async function nativeStats(frame) {
  return frame.evaluate(() => ({
    ...session.stats(),
    ...cameraRuntime.stats(),
    ...visualsRuntime.stats(),
    ...motionRuntime.stats(),
    ...signalsRuntime.stats(),
    ...interactionRuntime.stats(),
    ...triggersRuntime.stats(),
    ...savesRuntime.stats(),
    ...inputRuntime.stats(),
    ...portalRuntime.stats(),
    ...physicsRuntime.stats(),
  }));
}

const RESOURCE_KEYS = ['scripts', 'timers', 'subscriptions', 'listeners', 'nativeOwners', 'nativeTimers',
  'portals', 'portalSurfaces', 'portalTravelers', 'portalClones', 'runtimeCameras', 'cameraRigs',
  'physicsBodies', 'physicsCharacters', 'physicsSubscriptions', 'physicsTriggers', 'physicsGrabs',
  'visualResources', 'motionControllers', 'signalNodes', 'signalListeners', 'checkpointProviders',
  'uiSubscriptions', 'inputCaptures'];

function resourceCounts(stats) {
  for (const key of RESOURCE_KEYS) {
    assert.ok(Object.hasOwn(stats, key), `required native resource telemetry exists: ${key}`);
    assert.ok(Number.isInteger(stats[key]) && stats[key] >= 0, `valid resource count: ${key}`);
  }
  return Object.fromEntries(RESOURCE_KEYS.map(key => [key, stats[key]]));
}

test('L01: actual keyboard/mouse solve, native two-way portals and physical return stairs',
  { timeout: 180000, concurrency: false }, async () => {
    const { page, errors } = await createPage();
    let frame;
    let driver;
    try {
      frame = await start(page);
      driver = new InputDriver(page, frame);
      await driver.lockPointer();
      const initial = await driver.snapshot();
      assert.equal(initial.phase, 'locked');
      assert.equal(initial.portalEvents.length, 0);
      assert.ok(Math.abs(initial.footPosition.y) < 0.1);
      await capture(page, '01-o1-visible-upper-exit');

      await driver.moveTo({ x: 10.4, z: 6.8 });
      await driver.interact({ x: 10.4, y: 1.1, z: 8 });
      await driver.waitFor(state => state.phase === 'active' && state.shutterProgress > 0.99,
        'shutter opens after the physical handle interaction');
      await driver.moveTo({ x: 11, z: 8.5 });
      await driver.aimAt({ x: 11, z: 10.5 });
      await capture(page, '02-a1-active-native-view');
      const activePortalStats = await nativeStats(frame);
      assert.ok(activePortalStats.portalRenderedViews > 0, 'A1 contains an actual native rendered destination view');
      await driver.moveTo({ x: 11, z: 9.05 }, { tolerance: 0.13 });
      await driver.moveTo({ x: 11, z: 8.7 }, { tolerance: 0.13 });
      await driver.moveTo({ x: 10.4, z: 8.7 }, { tolerance: 0.13 });
      assert.equal((await driver.snapshot()).portalEvents.length, 0,
        'approaching, withdrawing and moving sideways do not spuriously teleport the player');
      await driver.moveTo({ x: 11, z: 8.5 }, { tolerance: 0.15 });

      await driver.throughPortal({ x: 11, z: 11 }, { source: 'A1', destination: 'B1' });
      let state = await driver.snapshot();
      assert.ok(state.footPosition.y > 2.2 && state.footPosition.y < 2.6, 'native exit has safe upper footing');
      assert.ok(Math.abs(state.eyePosition.y - state.position.y - 0.7) < 0.08, 'eye remains attached to the player capsule');
      assert.ok(cameraAngles(state.rotation).forward.x < -0.7, 'A1 → B1 rotates first-person view toward the west landing');
      await driver.moveTo({ x: 22.6, z: 10 });
      await driver.moveTo({ x: 20.8, z: 12.2 });
      await driver.aimAt({ x: 9.5, y: 1.6, z: 3 });
      await capture(page, '09-upper-gallery-looking-back-to-o1');
      await driver.moveTo({ x: 22.6, z: 10 });
      await driver.aimAt({ x: 24, z: 10 });
      await capture(page, '03-b1-looking-back-to-low-court');

      await driver.throughPortal({ x: 25, z: 10 }, { source: 'B1', destination: 'A1' });
      state = await driver.snapshot();
      assert.ok(Math.abs(state.footPosition.y) < 0.12, 'reverse crossing returns to the low floor');
      assert.ok(cameraAngles(state.rotation).forward.z < -0.7, 'B1 → A1 rotates view toward the low landing');
      await driver.moveTo({ x: 11, z: 8.5 });
      await driver.throughPortal({ x: 11, z: 11 }, { source: 'A1', destination: 'B1' });

      await driver.moveTo({ x: 22, z: 10 });
      await driver.interact({ x: 21, y: 3.45, z: 10 });
      await driver.waitFor(state => state.returnStairOpen && state.gateProgress > 0.99,
        'upper latch releases the physical return-stair gate');
      await driver.moveTo({ x: 22, z: 9.2 });
      await driver.aimAt({ x: 22, y: 0.8, z: 3 });
      await capture(page, '04-upper-latch-and-return-stair');

      const crossingsBeforeStairs = (await driver.snapshot()).portalEvents.length;
      await driver.moveTo({ x: 22, z: 7.9 });
      await driver.moveTo({ x: 22, z: 2.9 });
      await driver.moveTo({ x: 22, z: 1.7 });
      state = await driver.snapshot();
      assert.ok(Math.abs(state.footPosition.y) < 0.15, 'walked down the real stair to the low court');
      assert.equal(state.portalEvents.length, crossingsBeforeStairs, 'stair descent does not invoke portal traversal');
      await driver.aimAt({ x: 22, y: 3.7, z: 10 });
      await capture(page, '05-return-stair-from-lower-floor');
      await driver.moveTo({ x: 22, z: 7.9 });
      await driver.moveTo({ x: 22, z: 9.8 });
      state = await driver.snapshot();
      assert.ok(state.footPosition.y > 2.2 && state.footPosition.y < 2.6, 'walked up the same physical stair');
      assert.equal(state.portalEvents.length, crossingsBeforeStairs, 'stair ascent does not invoke portal traversal');

      await driver.moveTo({ x: 22.8, z: 13 });
      await driver.moveTo({ x: 25.2, z: 13 });
      state = await driver.waitFor(state => state.completed && state.phase === 'complete',
        'entry into the real upper exit completes L01');
      await driver.aimAt({ x: 22.2, y: 3.8, z: 12.3 });
      await capture(page, '06-l01-completed-at-upper-exit');
      assert.equal(state.returnStairOpen, true);
      assert.deepEqual(state.portalEvents.map(({ source, destination }) => [source, destination]),
        [['A1', 'B1'], ['B1', 'A1'], ['A1', 'B1']]);
      const stats = await nativeStats(frame);
      assert.ok(stats.portalTraversals >= 3, 'native runtime records the three real crossings');
      assert.equal(await frame.evaluate(() => scriptErrors), 0);
      assert.deepEqual(errors, []);
      await driver.press('r');
      const completionRetry = await driver.waitFor(state => state.ready && state.phase === 'locked' &&
        state.retryCount === 1, 'R restores the initial state after completing L01');
      assert.equal(completionRetry.completed, false);
      assert.equal(completionRetry.returnStairOpen, false);
      assert.equal(completionRetry.portalEvents.length, 0);
      assert.ok(Math.hypot(completionRetry.position.x - 9.5, completionRetry.position.z - 3) < 0.15);
      await fs.writeFile(new URL('input-route.json', evidence), JSON.stringify({
        kind: 'automated browser input technical validation; not human blind playtesting',
        inputs: driver.log, activePortalStats, finalSnapshot: state, nativeStats: stats, completionRetry,
      }, null, 2) + '\n');
      await fs.rm(new URL('failure-route.png', evidence), { force: true });
    } catch (error) {
      await capture(page, 'failure-route').catch(() => {});
      console.error('L01 input-route diagnostics:', {
        errors,
        snapshot: await driver?.snapshot().catch(() => null),
        inputLog: driver?.log,
      });
      throw error;
    } finally {
      await driver?.releaseKeys().catch(() => {});
      await page.close();
    }
  });

test('L01: R retries, native pause/resume and stop/start leave no duplicate resources',
  { timeout: 180000, concurrency: false }, async () => {
    const { page, errors } = await createPage();
    let driver;
    try {
      let frame = await start(page);
      driver = new InputDriver(page, frame);
      await driver.lockPointer();
      const baseline = resourceCounts(await nativeStats(frame));
      const retries = [];
      let warmedViewCount;
      for (let attempt = 1; attempt <= 3; attempt++) {
        await driver.moveTo({ x: 10.4, z: 6.8 });
        await driver.interact({ x: 10.4, y: 1.1, z: 8 });
        await driver.waitFor(state => state.phase === 'active' && state.shutterProgress > 0.99,
          'shutter ready before retry');
        await driver.press('r');
        const state = await driver.waitFor(state => state.ready && state.phase === 'locked' && state.retryCount === attempt,
          `R restores retry ${attempt}`);
        assert.equal(state.completed, false);
        assert.equal(state.returnStairOpen, false);
        assert.equal(state.portalEvents.length, 0);
        assert.ok(Math.hypot(state.position.x - 9.5, state.position.z - 3) < 0.15);
        assert.deepEqual(resourceCounts(await nativeStats(frame)), baseline, 'R does not duplicate native resources');
        const retryStats = await nativeStats(frame);
        if (warmedViewCount === undefined) warmedViewCount = retryStats.portalViews;
        assert.equal(retryStats.portalViews, warmedViewCount, 'native render-view cache does not grow across repeated retries');
        retries.push({ retryCount: state.retryCount, resources: resourceCounts(retryStats), portalViews: retryStats.portalViews });
        await driver.lockPointer();
      }

      // Headless CDP Escape does not consistently invoke Chromium's own
      // pointer-lock escape action. Exercise the standard browser lock-exit
      // lifecycle, which keeps the native script session active, then send R
      // through its real owner-tracked keyboard listener. Hardware Esc remains
      // a human verification item. This API does not change puzzle/body state.
      driver.log.push({ action: 'browser-exit-pointer-lock', hardwareEscapeVerified: false });
      await frame.evaluate(() => document.exitPointerLock());
      await frame.waitForFunction(() => running && document.pointerLockElement === null && foldlineL01.snapshot().paused);
      await driver.pressInCanvas('r');
      const pausedRetry = await driver.waitFor(state => state.phase === 'locked' && state.retryCount === 4,
        'R while paused restores the initial state through the owned key listener');
      assert.equal(pausedRetry.portalEvents.length, 0);
      assert.equal(pausedRetry.completed, false);
      assert.deepEqual(resourceCounts(await nativeStats(frame)), baseline, 'paused R does not duplicate listeners or resources');
      await driver.lockPointer();

      // Outer-player suspension intentionally deactivates the entire script
      // session, so its semantics are tested separately from the game's menu.
      await page.evaluate(() => ArkGlidePlayer.pause());
      await frame.waitForFunction(() => !running && document.pointerLockElement === null);
      const frozenTime = await frame.evaluate(() => time.totalTime);
      await page.waitForTimeout(180);
      assert.equal(await frame.evaluate(() => time.totalTime), frozenTime, 'pause freezes simulation');
      await page.evaluate(() => ArkGlidePlayer.pause());
      await frame.waitForFunction(() => running);
      await driver.lockPointer();
      await driver.moveTo({ x: 10.4, z: 5 });
      assert.ok((await driver.snapshot()).position.z > 4.6, 'movement works after resuming');

      const stopped = [];
      for (let restart = 0; restart < 3; restart++) {
        await driver.releaseKeys();
        await page.evaluate(() => ArkGlidePlayer.stop());
        await page.waitForFunction(() => document.body.dataset.state === 'stopped');
        const stats = await page.evaluate(() => ArkGlidePlayer.stats);
        const resources = resourceCounts(stats);
        for (const [key, count] of Object.entries(resources)) assert.equal(count, 0, `stop releases ${key}`);
        assert.ok(Object.hasOwn(stats, 'portalViews'), 'stop reports native render-view cache count');
        assert.equal(stats.portalViews, 0, 'stop releases portal render-view cache');
        stopped.push(stats);
        if (restart < 2) {
          await page.evaluate(() => ArkGlidePlayer.start());
          frame = await startedFrame(page);
          driver = new InputDriver(page, frame);
          await driver.lockPointer();
          assert.equal((await driver.snapshot()).phase, 'locked');
          assert.deepEqual(resourceCounts(await nativeStats(frame)), baseline, 'start recreates exactly the initial resources');
        }
      }
      await page.reload();
      await page.evaluate(() => ArkGlidePlayer.start());
      frame = await startedFrame(page);
      driver = new InputDriver(page, frame);
      const reloaded = await driver.snapshot();
      assert.equal(reloaded.phase, 'locked');
      assert.equal(reloaded.portalEvents.length, 0);
      assert.equal(reloaded.completed, false);
      assert.deepEqual(resourceCounts(await nativeStats(frame)), baseline, 'real page reload starts one clean initial scene');
      await page.evaluate(() => ArkGlidePlayer.stop());
      await page.waitForFunction(() => document.body.dataset.state === 'stopped');
      assert.deepEqual(errors, []);
      await fs.writeFile(new URL('lifecycle-results.json', evidence), JSON.stringify({
        kind: 'automated browser input and native lifecycle technical validation',
        baseline, retries, pausedRetry,
        pausedRetryMethod: 'Standard browser document.exitPointerLock(), then actual canvas keyboard R; hardware Escape is unverified.',
        stopped, reloaded,
      }, null, 2) + '\n');
    } catch (error) {
      console.error('L01 lifecycle diagnostics:', { errors, snapshot: await driver?.snapshot().catch(() => null),
        runtime: await driver?.frame.evaluate(() => ({ focused: document.hasFocus(),
          activeElement: document.activeElement?.tagName, running, timeScale: time.timeScale,
          pointerLocked: !!document.pointerLockElement })).catch(() => null) });
      throw error;
    } finally {
      await driver?.releaseKeys().catch(() => {});
      await page.close();
    }
  });

test('L01: locked stairs, jump barriers and portal edges resist input-only shortcuts',
  { timeout: 180000, concurrency: false }, async () => {
    const { page, errors } = await createPage();
    let driver;
    try {
      const frame = await start(page);
      driver = new InputDriver(page, frame);
      await driver.lockPointer();
      await driver.moveTo({ x: 18.5, z: 1.7 });
      await driver.moveTo({ x: 22, z: 1.7 });
      await driver.aimAt({ x: 22, z: 5 });
      const gateSamples = await driver.hold(['w'], 1300);
      let state = await driver.snapshot();
      assert.ok(state.position.z < 2.5, 'locked low gate physically blocks walking onto the stair');
      assert.equal(state.returnStairOpen, false);
      assert.equal(state.phase, 'locked');
      await capture(page, '07-locked-return-gate-from-low-court');

      await driver.moveTo({ x: 22, z: 1.7 });
      await driver.moveTo({ x: 19.4, z: 1.7 });
      await driver.moveTo({ x: 19.4, z: 3.7 });
      await driver.aimAt({ x: 22, z: 3.7 });
      const cheekSamples = await driver.hold(['w', 'Space'], 1400);
      state = await driver.snapshot();
      assert.ok(state.position.x < 19.9, 'west stair cheek resists a real jump from the low side');
      assert.ok(Math.max(...cheekSamples.map(state => state.footPosition.y)) < 1.1);
      assert.equal(state.returnStairOpen, false);
      await driver.moveTo({ x: 18.5, z: 3.7 });
      await driver.aimAt({ x: 18.5, z: 6 });
      const equipmentSamples = await driver.hold(['w', 'Space'], 1400);
      state = await driver.snapshot();
      assert.ok(state.position.z < 4.3, 'central equipment face blocks a running jump');
      assert.ok(Math.max(...equipmentSamples.map(state => state.footPosition.y)) < 1.1);

      await driver.moveTo({ x: 18.5, z: 3.3 });
      await driver.moveTo({ x: 10.4, z: 3.3 });
      await driver.moveTo({ x: 10.4, z: 6.8 });
      await driver.interact({ x: 10.4, y: 1.1, z: 8 });
      await driver.waitFor(state => state.phase === 'active' && state.shutterProgress > 0.99,
        'activate portals for the edge approach test');
      await driver.moveTo({ x: 9.6, z: 7 });
      await driver.moveTo({ x: 9.6, z: 9 });
      await driver.aimAt({ x: 9.6, z: 12 });
      const edgeSamples = await driver.hold(['w'], 1100);
      state = await driver.snapshot();
      assert.equal(state.portalEvents.length, 0, 'walking outside A1 aperture does not trigger a crossing');
      assert.ok(state.position.z < 10, 'A1 host collision blocks the outer edge approach');
      assert.ok(Math.abs(state.footPosition.y) < 0.12);
      await capture(page, '08-a1-outer-edge-remains-solid');
      await driver.moveTo({ x: 9.6, z: 8.8 });
      await driver.moveTo({ x: 11, z: 8.8 });
      await driver.aimAt({ x: 11, z: 10.5 });
      const portalTexture = await frame.evaluate(async () => {
        const view = scene.getMeshByName('A1:view');
        const texture = view?.material.getActiveTextures()[0];
        if (!texture) return { colors: 0, pixels: 0 };
        const pixels = await texture.readPixels();
        const colors = new Set();
        for (let index = 0; index < pixels.length; index += 64) {
          colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
        }
        return { colors: colors.size, pixels: pixels.length / 4, size: texture.getSize() };
      });
      assert.ok(portalTexture.colors > 12, 'native A1 render texture contains varied scene geometry');
      assert.ok(portalTexture.pixels > 10000, 'native A1 render texture is populated');
      await driver.throughPortal({ x: 11, z: 11 }, { source: 'A1', destination: 'B1' });
      state = await driver.snapshot();
      assert.ok(state.footPosition.y > 2.2, 'the same player can cross safely after moving back to the aperture center');
      assert.equal(await frame.evaluate(() => scriptErrors), 0);
      assert.deepEqual(errors, []);
      await fs.writeFile(new URL('boundary-results.json', evidence), JSON.stringify({
        kind: 'automated browser input technical validation; finite sampled checks, not exhaustive collision proof',
        inputs: driver.log, gateSamples, cheekSamples, equipmentSamples, edgeSamples, portalTexture,
        finalSnapshot: state,
      }, null, 2) + '\n');
      await fs.rm(new URL('failure-boundaries.png', evidence), { force: true });
    } catch (error) {
      await capture(page, 'failure-boundaries').catch(() => {});
      console.error('L01 boundary diagnostics:', { errors, snapshot: await driver?.snapshot().catch(() => null), inputLog: driver?.log });
      throw error;
    } finally {
      await driver?.releaseKeys().catch(() => {});
      await page.close();
    }
  });
