import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveStatic } from '../scripts/serve.mjs';
import { InputDriver, cameraAngles } from './input-driver.mjs';

const output = fileURLToPath(new URL('../.generated/l01/', import.meta.url));
const evidence = new URL('../docs/evidence/m1-r1/', import.meta.url);
const buildMetadata = JSON.parse(await fs.readFile(new URL('../.generated/l01/foldline-build.json', import.meta.url), 'utf8'));
const dialogueData = JSON.parse(await fs.readFile(new URL('../game/data/l01-dialogue.json', import.meta.url), 'utf8'));
let server, browser, baseUrl;

test.before(async () => {
  await fs.access(new URL('../.generated/l01/index.html', import.meta.url));
  await fs.mkdir(evidence, { recursive: true });
  server = await serveStatic(output, 0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (process.platform === 'linux' ? '/usr/bin/chromium' : undefined),
    headless: true, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
});
test.after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function createPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
  return { page, errors };
}
async function startedFrame(page) {
  await page.waitForFunction(() => document.body.dataset.state === 'playing');
  const frame = page.frames().find(frame => frame.url().includes('runtime.html?boot='));
  assert.ok(frame);
  await frame.waitForFunction(() => globalThis.foldlineL01?.snapshot().ready);
  assert.equal(await frame.evaluate(() => scriptErrors), 0);
  return frame;
}
async function start(page) { await page.goto(baseUrl); await page.evaluate(() => ArkGlidePlayer.start()); return startedFrame(page); }
async function capture(page, name) {
  const frame = page.frames().find(frame => frame.url().includes('runtime.html?boot='));
  if (frame) await frame.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  await page.waitForTimeout(180);
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, evidence)) });
}
async function writeEvidence(name, data) { await fs.writeFile(new URL(name, evidence), JSON.stringify(data, null, 2) + '\n'); }
async function nativeStats(frame) {
  return frame.evaluate(() => ({ ...session.stats(), ...cameraRuntime.stats(), ...visualsRuntime.stats(),
    ...motionRuntime.stats(), ...signalsRuntime.stats(), ...interactionRuntime.stats(), ...triggersRuntime.stats(),
    ...savesRuntime.stats(), ...inputRuntime.stats(), ...portalRuntime.stats(), ...physicsRuntime.stats(), ...audioRuntime.stats() }));
}
const RESOURCE_KEYS = ['scripts', 'timers', 'subscriptions', 'listeners', 'nativeOwners', 'nativeTimers',
  'portals', 'portalSurfaces', 'portalTravelers', 'portalClones', 'runtimeCameras', 'cameraRigs', 'physicsBodies',
  'physicsCharacters', 'physicsSubscriptions', 'physicsTriggers', 'physicsGrabs', 'visualResources',
  'motionControllers', 'signalNodes', 'signalListeners', 'checkpointProviders', 'uiSubscriptions', 'inputCaptures',
  'audioVoices', 'audioBuffers', 'audioBuses', 'audioStreams', 'audioWorklets', 'audioTransitions', 'audioBlobURLs'];
function resources(stats) {
  for (const key of RESOURCE_KEYS) {
    assert.ok(Object.hasOwn(stats, key), `native telemetry exists: ${key}`);
    assert.ok(Number.isInteger(stats[key]) && stats[key] >= 0, `valid native resource: ${key}`);
  }
  return Object.fromEntries(RESOURCE_KEYS.map(key => [key, stats[key]]));
}
function checkCompanion(state) {
  const c = state.companion;
  assert.equal(c.collisionBodies, 0);
  assert.deepEqual(c.resources, { meshes: 12, materials: 5 });
  assert.ok(c.mountDistance > .35 && c.mountDistance < 1, 'attached device stays beside the current eye');
  assert.ok(Math.hypot(c.worldPosition.x - state.eyePosition.x, c.worldPosition.y - state.eyePosition.y,
    c.worldPosition.z - state.eyePosition.z) < 1.05, 'device does not interpolate across the facility');
  for (const part of c.parts) assert.ok(part.active);
}
function checkDialogue(state) {
  const d = state.dialogue;
  assert.equal(new Set(d.consumedEvents).size, d.consumedEvents.length);
  assert.equal(new Set(d.startedLines).size, d.startedLines.length);
  assert.equal(new Set(d.history.map(line => line.id)).size, d.history.length, 'a line is not replayed on repeated area entry');
  if (d.currentLine) {
    const line = dialogueData.lines.find(line => line.id === d.currentLine);
    assert.ok(line);
    assert.equal(d.currentSpeaker, line.character);
  } else assert.equal(d.currentSpeaker, null);
  assert.deepEqual(d.errors, []);
  assert.deepEqual(state.audioErrors, [], 'mechanical feedback has no playback errors');
}
async function subtitleProbe(frame) {
  const probe = await frame.evaluate(() => {
    const d = foldlineL01.snapshot().dialogue;
    const el = document.querySelector('[data-hud-id="dialogue"]');
    return { dialogue: d, text: el?.textContent, display: el && getComputedStyle(el).display };
  });
  if (probe.dialogue.currentLine) {
    const line = dialogueData.lines.find(line => line.id === probe.dialogue.currentLine);
    assert.equal(probe.text, `${dialogueData.characters[line.character].name}：${line.subtitle}`);
  } else assert.equal(probe.text, '');
  assert.equal(probe.display !== 'none', !!probe.dialogue.currentLine && probe.dialogue.subtitlesEnabled && !probe.dialogue.paused,
    'HUD visibility matches dialogue, subtitle option and pause state');
  return probe;
}
async function wheel(driver) {
  await driver.moveTo({ x: 12.1, z: 8 });
  await driver.aimAt({ x: 13.35, y: 1.12, z: 8 });
  await driver.waitFor(state => state.interactTarget === 'ShutterHandle', 'aim at side handwheel');
  const holding = driver.hold(['e'], 500);
  await driver.page.waitForTimeout(120);
  const duringWheelAudio = await nativeStats(driver.frame);
  const samples = await holding;
  const released = await driver.snapshot();
  assert.ok(released.shutterProgress > .05 && released.shutterProgress < .95, 'partial handwheel effort moves the real shutter');
  await driver.page.waitForTimeout(250);
  const heldByRatchet = await driver.snapshot();
  assert.ok(Math.abs(heldByRatchet.shutterProgress - released.shutterProgress) < .002, 'released handwheel holds its mechanical progress');
  samples.push(...await driver.hold(['e'], 1900));
  samples.audioDuringWheel = duringWheelAudio;
  samples.ratchet = { released, heldByRatchet };
  return samples;
}
async function solve(driver, { screenshots = false, explore = false, reverse = false, stairs = true, sample = async () => {} } = {}) {
  const page = driver.page;
  await driver.lockPointer();
  await driver.aimAt({ x: 24, y: 4.6, z: 13 });
  await driver.waitFor(state => state.dialogue.consumedEvents.includes('exit.seen'), 'actual upper-exit observation');
  if (screenshots) await capture(page, '01-o1-exit-and-companion');
  await sample('o1');
  await driver.moveTo({ x: 18.5, z: 1.7 });
  await driver.moveTo({ x: 22, z: 1.7 });
  await driver.aimAt({ x: 22, y: 1.4, z: 2.75 });
  await driver.waitFor(state => state.dialogue.consumedEvents.includes('route.blocked'), 'walk to blocked physical stair');
  const blockedSamples = await driver.hold(['w'], 650);
  assert.ok(blockedSamples.at(-1).position.z < 2.5);
  if (screenshots) await capture(page, '02-blocked-direct-stair');
  await driver.moveTo({ x: 22, z: 1.7 });
  await driver.moveTo({ x: 12.1, z: 1.7 });
  await driver.moveTo({ x: 12.1, z: 8 });
  await driver.aimAt({ x: 13.35, y: 1.12, z: 8 });
  if (screenshots) await capture(page, '03-side-handwheel-and-lines');
  const wheelSamples = await wheel(driver);
  await driver.waitFor(state => state.phase === 'active', 'native fixed portal pair activated by held handwheel');
  await sample('fold-ready');
  if (explore) {
    await driver.moveTo({ x: 12.7, z: 9.35 });
    await driver.interact({ x: 14.03, y: 1, z: 9.35 }, 'InspectionBlind');
    await driver.waitFor(state => state.blindProgress > .999, 'optional inspection blind physically opens');
    await driver.moveTo({ x: 16, z: 9.35 });
    await driver.moveTo({ x: 18, z: 9.35 });
    assert.ok((await driver.snapshot()).footPosition.y > .04, 'walked onto actual inspection threshold');
    await driver.aimAt({ x: 24, y: 4, z: 10 });
    if (screenshots) await capture(page, '04-inspection-slot-looks-through-equipment');
    await sample('inspection-slot');
    await driver.moveTo({ x: 12.7, z: 9.35 });
  }
  await driver.moveTo({ x: 11, z: 8.5 });
  await driver.aimAt({ x: 11, z: 11 });
  const portalTexture = await driver.frame.evaluate(async () => {
    const view = scene.getMeshByName('A1:view');
    const texture = view?.material?.getActiveTextures()[0];
    if (!texture) return null;
    const bytes = await texture.readPixels();
    const colors = new Set();
    for (let i = 0; i < bytes.length; i += 64) colors.add(`${bytes[i]},${bytes[i + 1]},${bytes[i + 2]}`);
    return { colors: colors.size, pixels: bytes.length / 4, size: texture.getSize() };
  });
  assert.ok(portalTexture?.colors > 12 && portalTexture.pixels > 10000, 'native portal render target contains actual varied scene geometry');
  if (screenshots) await capture(page, '05-a1-native-destination-view');
  await driver.moveTo({ x: 11, z: 9.05 }, { tolerance: .1 });
  await driver.waitFor(state => state.companion.retracted && state.companion.retraction > .9, 'companion retracts beside portal plane');
  if (screenshots) await capture(page, '06-companion-retracted-at-aperture');
  await sample('aperture-retracted');
  await driver.throughPortal({ x: 11, z: 11 }, { source: 'A1', destination: 'B1' });
  let state = await driver.snapshot();
  assert.ok(state.footPosition.y > 2.2 && state.footPosition.y < 2.6);
  assert.ok(cameraAngles(state.rotation).forward.x < -.7);
  checkCompanion(state);
  await sample('first-crossing');
  if (reverse) {
    await driver.moveTo({ x: 22.6, z: 10 });
    await driver.aimAt({ x: 24, z: 10 });
    if (screenshots) await capture(page, '07-b1-native-low-court-view');
    await driver.throughPortal({ x: 25, z: 10 }, { source: 'B1', destination: 'A1' });
    state = await driver.snapshot();
    assert.ok(Math.abs(state.footPosition.y) < .12);
    checkCompanion(state);
    await driver.moveTo({ x: 11, z: 8.5 });
    await driver.throughPortal({ x: 11, z: 11 }, { source: 'A1', destination: 'B1' });
    await sample('third-crossing');
  }
  await driver.moveTo({ x: 20.8, z: 12.2 });
  await driver.aimAt({ x: 9.5, y: 1.6, z: 3 });
  await driver.waitFor(state => state.mountObstruction === 'GalleryGuard' && state.companion.retracted &&
    state.companion.retraction > .95, 'native obstruction query folds shoulder device away from the real gallery rail');
  if (screenshots) await capture(page, '08-upper-gallery-return-view');
  await sample('upper-overlook');
  await driver.moveTo({ x: 22, z: 10 });
  await driver.interact({ x: 21, y: 3.45, z: 10 }, 'UpperLatch');
  await driver.waitFor(state => state.returnStairOpen && state.gateProgress > .999, 'upper mechanical latch opens return circuit');
  await driver.moveTo({ x: 22, z: 9.2 });
  await driver.aimAt({ x: 22, y: .8, z: 3 });
  if (screenshots) await capture(page, '09-released-physical-return-stair');
  const crossings = (await driver.snapshot()).portalEvents.length;
  if (stairs) {
    await driver.moveTo({ x: 22, z: 7.9 });
    await driver.moveTo({ x: 22, z: 2.9 });
    await driver.moveTo({ x: 22, z: 1.7 });
    state = await driver.snapshot();
    assert.ok(Math.abs(state.footPosition.y) < .15);
    assert.equal(state.portalEvents.length, crossings);
    await driver.waitFor(state => state.dialogue.consumedEvents.includes('court.returned'), 'actual lower court return event');
    await driver.aimAt({ x: 22, y: 3.7, z: 10 });
    if (screenshots) await capture(page, '10-return-circuit-from-lower-court');
    await sample('returned-to-court');
    await driver.moveTo({ x: 22, z: 7.9 });
    await driver.moveTo({ x: 22, z: 9.8 });
    state = await driver.snapshot();
    assert.ok(state.footPosition.y > 2.2 && state.footPosition.y < 2.6);
    assert.equal(state.portalEvents.length, crossings);
  }
  await driver.moveTo({ x: 22.8, z: 13 });
  await driver.moveTo({ x: 25.2, z: 13 });
  state = await driver.waitFor(state => state.completed, 'real upper exit completes L01');
  if (screenshots) state = await driver.waitFor(state => state.dialogue.history.some(line => line.id === 'C01-L01-ZQ-009'), 'terminal companion reply after facility broadcast', 20000);
  await driver.aimAt({ x: 22.2, y: 3.8, z: 12.3 });
  if (screenshots) await capture(page, '11-l01-exit-complete');
  await sample('completed');
  return { state, blockedSamples, wheelSamples, portalTexture };
}

test('M1-R1: input-only exploration, native two-way portals, companion and return circuit',
  { timeout: 240000 }, async () => {
    const { page, errors } = await createPage();
    let driver;
    const observations = [];
    try {
      const frame = await start(page);
      driver = new InputDriver(page, frame);
      const result = await solve(driver, { screenshots: true, explore: true, reverse: true,
        sample: async label => { const state = await driver.snapshot(); checkCompanion(state); checkDialogue(state); observations.push({ label, state, subtitle: await subtitleProbe(frame) }); } });
      const state = result.state;
      assert.ok(result.wheelSamples.audioDuringWheel.audioVoices > 0, 'holding the handwheel produces a real native WebAudio voice');
      assert.ok(result.wheelSamples.audioDuringWheel.audioBuffers >= 4, 'four mechanical WAV assets are decoded by the native runtime');
      assert.deepEqual(state.portalEvents.map(({ source, destination }) => [source, destination]),
        [['A1', 'B1'], ['B1', 'A1'], ['A1', 'B1']]);
      for (const event of ['court.enter', 'exit.seen', 'route.blocked', 'fold.ready', 'fold.crossed', 'return.open', 'court.returned', 'level.complete', 'maintenance.observed'])
        assert.ok(state.dialogue.consumedEvents.includes(event), `event consumed by real gameplay: ${event}`);
      assert.equal(state.dialogue.availableAudio.length, buildMetadata.voice.generated.length, 'dialogue availability matches prepared offline voice assets');
      assert.equal(state.dialogue.missingAudio.length, buildMetadata.voice.missing.length);
      const stats = await nativeStats(frame);
      assert.ok(stats.portalTraversals >= 3);
      assert.equal(await frame.evaluate(() => scriptErrors), 0);
      assert.deepEqual(errors, []);
      await writeEvidence('input-route.json', { kind: 'automated real keyboard and relative mouse technical validation; not human blind playtesting',
        audio: { voices: buildMetadata.voice, mechanical: 'four generated mechanical WAV files; voice assets are offline files, not browser TTS' },
        mechanicalAudioDuringWheel: result.wheelSamples.audioDuringWheel,
        handwheelRatchet: result.wheelSamples.ratchet,
        inputs: driver.log, observations, ...result, nativeStats: stats });
      await fs.rm(new URL('failure-route.png', evidence), { force: true });
    } catch (error) {
      await capture(page, 'failure-route').catch(() => {});
      console.error('M1-R1 route diagnostics', { errors, snapshot: await driver?.snapshot().catch(() => null), inputs: driver?.log });
      throw error;
    } finally { await driver?.releaseKeys().catch(() => {}); await page.close(); }
  });

async function performanceSample(frame, label) {
  const before = await frame.evaluate(() => ({ frame: time.frameCount, now: performance.now() }));
  await new Promise(resolve => setTimeout(resolve, 1600));
  const after = await frame.evaluate(() => ({ frame: time.frameCount, now: performance.now() }));
  return { label, seconds: (after.now - before.now) / 1000, frames: after.frame - before.frame,
    sampledFramesPerSecond: (after.frame - before.frame) * 1000 / (after.now - before.now),
    note: 'Headless Chromium SwiftShader sample in this cloud host; not a hardware target or human comfort measurement.' };
}

test('M1-R1: repeated solves, dialogue options, menu pause, retry and clean reload/stop',
  { timeout: 300000 }, async () => {
    const { page, errors } = await createPage();
    let driver;
    const inputLogs = [];
    try {
      let frame = await start(page);
      driver = new InputDriver(page, frame);
      inputLogs.push(driver.log);
      // Read the cold scene before pointer lock can start an actual local TTS
      // entry line. Restart/reload assertions use the same paused initial state.
      const baseline = resources(await nativeStats(frame));
      assert.equal(baseline.audioVoices, 0);
      await driver.lockPointer();
      const fps = [await performanceSample(frame, 'initial-court-companion')];
      const first = await solve(driver, { stairs: true });
      checkDialogue(first.state);
      await driver.press('r');
      const retry1 = await driver.waitFor(state => state.ready && state.retryCount === 1 && state.phase === 'locked', 'first completed retry');
      assert.equal(retry1.dialogue.currentLine, null);
      assert.equal(retry1.dialogue.consumedEvents.length, 0);
      assert.equal(retry1.completed, false);
      assert.equal(retry1.blindProgress, 0);
      assert.equal(retry1.companion.collisionBodies, 0);
      const afterRetry1 = resources(await nativeStats(frame));
      assert.equal(afterRetry1.audioVoices, 0, 'retry stops mechanical/dialogue audio');
      for (const key of RESOURCE_KEYS.filter(key => key !== 'audioBuffers'))
        assert.equal(afterRetry1[key], baseline[key], `first retry preserves one scene: ${key}`);
      // Audio buffers are a native bounded asset cache. Its warmed size, not
      // its cold size, must stay constant through repeated completed runs.
      await driver.pressInCanvas('v');
      await driver.pressInCanvas('b');
      let state = await driver.snapshot();
      assert.equal(state.dialogue.voiceEnabled, false);
      assert.equal(state.dialogue.subtitlesEnabled, false);
      const second = await solve(driver, { stairs: true });
      assert.equal(second.state.completed, true, 'dialogue can be disabled and ignored without blocking mechanics');
      assert.equal(second.state.dialogue.voiceEnabled, false);
      assert.equal(second.state.dialogue.subtitlesEnabled, false);
      checkDialogue(second.state);
      await driver.press('r');
      const retry2 = await driver.waitFor(state => state.ready && state.retryCount === 2 && state.phase === 'locked', 'second completed retry');
      assert.equal(retry2.dialogue.consumedEvents.length, 0);
      assert.equal(retry2.dialogue.currentLine, null);
      assert.equal(retry2.dialogue.voiceEnabled, false, 'voice choice persists through checkpoint retry');
      assert.equal(retry2.dialogue.subtitlesEnabled, false);
      assert.deepEqual(resources(await nativeStats(frame)), afterRetry1, 'second complete run adds no resources or audio cache entries');
      await driver.lockPointer();
      await driver.press('v');
      await driver.press('b');
      state = await driver.snapshot();
      assert.equal(state.dialogue.voiceEnabled, true);
      assert.equal(state.dialogue.subtitlesEnabled, true);
      await driver.waitFor(state => state.dialogue.currentLine !== null, 'entry dialogue after fresh retry');
      await frame.evaluate(() => document.exitPointerLock());
      await driver.waitFor(state => state.paused && state.dialogue.paused, 'in-game menu pauses dialogue and companion');
      const paused = await driver.snapshot();
      const pausedSubtitle = await subtitleProbe(frame);
      await page.waitForTimeout(220);
      const pausedAfter = await driver.snapshot();
      assert.equal(pausedAfter.dialogue.elapsed, paused.dialogue.elapsed);
      assert.deepEqual(pausedAfter.companion.worldPosition, paused.companion.worldPosition);
      assert.equal(pausedAfter.companion.mode, 'paused');
      await driver.pressInCanvas('v');
      await driver.pressInCanvas('b');
      const pausedOptions = await driver.snapshot();
      const disabledSubtitle = await subtitleProbe(frame);
      assert.equal(pausedOptions.dialogue.voiceEnabled, false);
      assert.equal(pausedOptions.dialogue.subtitlesEnabled, false);
      await driver.pressInCanvas('r');
      const pausedRetry = await driver.waitFor(state => state.ready && state.retryCount === 3, 'menu R checkpoint restore');
      assert.equal(pausedRetry.dialogue.currentLine, null);
      assert.equal(pausedRetry.dialogue.consumedEvents.length, 0);
      assert.deepEqual(resources(await nativeStats(frame)), afterRetry1);
      await driver.lockPointer();
      fps.push(await performanceSample(frame, 'after-two-complete-runs-and-three-retries'));
      await page.evaluate(() => ArkGlidePlayer.pause());
      await frame.waitForFunction(() => !running && document.pointerLockElement === null);
      const outerPause = await driver.snapshot();
      const frozen = await frame.evaluate(() => time.totalTime);
      await page.waitForTimeout(220);
      assert.equal(await frame.evaluate(() => time.totalTime), frozen);
      await page.evaluate(() => ArkGlidePlayer.pause());
      await frame.waitForFunction(() => running);
      await driver.lockPointer();
      await driver.moveTo({ x: 10.5, z: 4.5 });
      const stopped = [];
      for (let restart = 0; restart < 3; restart++) {
        await driver.releaseKeys();
        await page.evaluate(() => ArkGlidePlayer.stop());
        await page.waitForFunction(() => document.body.dataset.state === 'stopped');
        const stats = await page.evaluate(() => ArkGlidePlayer.stats);
        for (const [key, count] of Object.entries(resources(stats))) assert.equal(count, 0, `native stop releases ${key}`);
        assert.equal(stats.portalViews, 0);
        stopped.push(stats);
        if (restart < 2) {
          await page.evaluate(() => ArkGlidePlayer.start());
          frame = await startedFrame(page);
          driver = new InputDriver(page, frame);
          inputLogs.push(driver.log);
          assert.deepEqual(resources(await nativeStats(frame)), baseline, 'restart recreates one cold scene including 17 companion visuals');
          assert.equal((await driver.snapshot()).dialogue.currentLine, null);
        }
      }
      await page.reload();
      await page.evaluate(() => ArkGlidePlayer.start());
      frame = await startedFrame(page);
      driver = new InputDriver(page, frame);
      inputLogs.push(driver.log);
      const reloaded = await driver.snapshot();
      assert.equal(reloaded.completed, false);
      assert.equal(reloaded.phase, 'locked');
      assert.equal(reloaded.dialogue.consumedEvents.length, 0);
      assert.deepEqual(resources(await nativeStats(frame)), baseline);
      await page.evaluate(() => ArkGlidePlayer.stop());
      await page.waitForFunction(() => document.body.dataset.state === 'stopped');
      assert.deepEqual(errors, []);
      await writeEvidence('lifecycle-results.json', { kind: 'automated browser inputs; no human blind playtest or hardware Escape claim',
        inputSessions: inputLogs.map((inputs, session) => ({ session, inputs })), baseline, first: first.state, retry1, afterRetry1, second: second.state, retry2,
        paused, pausedAfter, pausedSubtitle, pausedOptions, disabledSubtitle, pausedRetry, outerPause, stopped, reloaded, fps,
        pauseMethod: 'standard document.exitPointerLock then actual canvas key input, separately native outer ArkGlidePlayer.pause' });
      await fs.rm(new URL('failure-lifecycle.png', evidence), { force: true });
    } catch (error) {
      await capture(page, 'failure-lifecycle').catch(() => {});
      console.error('M1-R1 lifecycle diagnostics', { errors, snapshot: await driver?.snapshot().catch(() => null), inputs: driver?.log });
      throw error;
    } finally { await driver?.releaseKeys().catch(() => {}); await page.close(); }
  });
