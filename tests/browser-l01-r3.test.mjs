import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serveStatic } from '../scripts/serve.mjs';
import { InputDriver, cameraAngles } from './input-driver.mjs';

const output = fileURLToPath(new URL('../.generated/l01/', import.meta.url));
const evidence = new URL(process.env.FOLDLINE_EVIDENCE_DIR || '../docs/evidence/m1-r3/', import.meta.url);
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
  await frame.waitForFunction(() => globalThis.foldlineL01?.snapshot().ready && foldlineL01.snapshot().dialogue.preferencesReady);
  assert.equal(await frame.evaluate(() => scriptErrors), 0);
  const art=await frame.evaluate(()=>{
    const root=scene.getTransformNodeByName('L01IndustrialDress');
    const parts=root?.getChildMeshes().filter(m=>m.getTotalVertices()>0)||[];
    const concrete=scene.getMeshByName('salt-worn concrete');
    const steel=scene.getMeshByName('service steel');
    const companion=scene.meshes.find(m=>m.metadata?.arkglideId==='zanque:housing'||m.name==='栈雀 · housing');
    return {parts:parts.map(m=>m.name),bounds:concrete&&{min:concrete.getBoundingInfo().boundingBox.minimumWorld.asArray(),max:concrete.getBoundingInfo().boundingBox.maximumWorld.asArray()},
      textures:steel?.material?.getActiveTextures().map(t=>({size:t.getSize(),ready:t.isReady()})),
      companionTextured:companion?.material?.getActiveTextures().length===1&&companion.material.getActiveTextures().every(t=>t.isReady()),
      filter:document.getElementById('renderCanvas').style.filter};
  });
  assert.equal(art.parts.length,8,'all real glTF art batches imported');
  assert.ok(art.bounds.min[0]>7.9&&art.bounds.max[0]<24.1,'imported art shares the real courtyard coordinates');
  assert.equal(art.textures.length,2,'actual source metal colour and normal both decoded');
  assert.ok(art.textures.every(t=>t.ready&&t.size.width===512&&t.size.height===512));
  assert.ok(art.companionTextured);
  assert.equal(art.filter,'saturate(0.94) contrast(1.025)');

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
    ...savesRuntime.stats(), ...storageRuntime.stats(), ...inputRuntime.stats(), ...portalRuntime.stats(), ...physicsRuntime.stats(), ...audioRuntime.stats() }));
}
const RESOURCE_KEYS = ['scripts', 'timers', 'subscriptions', 'listeners', 'nativeOwners', 'nativeTimers',
  'portals', 'portalSurfaces', 'portalTravelers', 'portalClones', 'runtimeCameras', 'cameraRigs', 'physicsBodies',
  'physicsCharacters', 'physicsSubscriptions', 'physicsTriggers', 'physicsGrabs', 'visualResources',
  'motionControllers', 'signalNodes', 'signalListeners', 'checkpointProviders', 'storageRequests', 'uiSubscriptions', 'inputCaptures',
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
  assert.deepEqual(c.resources, { meshes: 12, materials: 5, textures: 1 });
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
    const settings = document.querySelector('[data-hud-id="dialogueSettings"]');
    return { dialogue: d, text: el?.textContent, display: el && getComputedStyle(el).display,
      settingsDisplay: settings && getComputedStyle(settings).display };
  });
  const d = probe.dialogue;
  if (!d.paused) assert.equal(probe.settingsDisplay, 'none', 'full settings are hidden during active play');
  assert.ok(['zh-CN', 'en'].includes(d.subtitleLanguage));
  if (d.currentLine) {
    const line = dialogueData.lines.find(line => line.id === d.currentLine);
    assert.equal(d.currentText, line.subtitles[d.subtitleLanguage]);
    assert.ok(probe.text.includes(d.currentText), 'HUD contains selected localized subtitle');
    assert.ok(probe.text.includes(d.localizedSpeaker), 'HUD contains localized character name');
    if (d.subtitleLanguage === 'en') assert.match(d.localizedSpeaker, /^[A-Za-z -]+$/, 'English subtitle has English character name');
    else assert.equal(d.localizedSpeaker, d.currentSpeaker === 'zhanque' ? '栈雀' : '衡务');
  } else assert.equal(probe.text, '');
  assert.equal(probe.display !== 'none', !!d.currentLine && d.subtitlesEnabled && !d.paused,
    'HUD visibility follows current line, independent subtitle option and pause state');
  return probe;
}
async function settledPreferences(driver) {
  const s = await driver.waitFor(s => s.dialogue.preferencesReady && s.dialogue.pendingWrites === 0, 'persisted dialogue preferences');
  assert.equal(s.dialogue.persistenceError, null);
  assert.equal((await nativeStats(driver.frame)).storageRequests, 0, 'native storage request completes after preference persistence');
  return s;
}
function preferences(s) {
  return { voiceEnabled: s.dialogue.voiceEnabled, subtitlesEnabled: s.dialogue.subtitlesEnabled,
    subtitleLanguage: s.dialogue.subtitleLanguage };
}
async function wheel(driver) {
  await driver.moveTo({ x: 12.1, z: 8 });
  await driver.aimAt({ x: 13.35, y: 1.12, z: 8 });
  await driver.waitFor(state => state.interactTarget === 'ShutterHandle', 'aim at side handwheel');
  // Observe the whole real hold interval. A fixed wall-clock sample after
  // calling hold() can precede its asynchronous pointer-lock/key-down, or miss
  // this short WAV under a busy software renderer. Read-only native telemetry
  // proves playback without changing the input timing or any gameplay state.
  const audioSamples = [], samples = [];
  await driver.lockPointer();
  await driver.keyDown('e');
  const deadline=Date.now()+15000;
  while(Date.now()<deadline) {
    audioSamples.push(await nativeStats(driver.frame));
    const state=await driver.snapshot(); samples.push(state);
    if(state.shutterProgress>=.28)break;
    await driver.page.waitForTimeout(25);
  }
  await driver.keyUp('e');
  await driver.consumedFrame();await driver.consumedFrame();
  const duringWheelAudio = audioSamples.reduce((max, value) => value.audioVoices > max.audioVoices ? value : max, audioSamples[0]);
  const released = await driver.snapshot();
  assert.ok(released.shutterProgress > .05 && released.shutterProgress < .95, 'partial handwheel effort moves the real shutter');
  await driver.page.waitForTimeout(250);
  const heldByRatchet = await driver.snapshot();
  assert.ok(Math.abs(heldByRatchet.shutterProgress - released.shutterProgress) < .002, 'released handwheel holds its mechanical progress');
  await driver.keyDown('e');
  await driver.waitFor(s=>s.phase==='active','held handwheel reaches true open stop',25000);
  await driver.keyUp('e');await driver.consumedFrame();
  samples.push(await driver.snapshot());
  samples.audioDuringWheel = duringWheelAudio;
  samples.audioObservations = audioSamples;
  samples.ratchet = { released, heldByRatchet };
  return samples;
}
async function solve(driver, { screenshots = false, explore = false, reverse = false, stairs = true, sample = async () => {} } = {}) {
  const page = driver.page;
  await driver.lockPointer();
  await driver.aimAt({ x: 24, y: 4.6, z: 13 });
  await driver.waitFor(state => state.dialogue.consumedEvents.includes('exit.seen'), 'actual upper-exit observation');
  await sample('o1');
  if (screenshots) await capture(page, '01-o1-exit');
  await driver.moveTo({ x: 18.5, z: 1.7 });
  await driver.moveTo({ x: 22, z: 1.7 });
  await driver.aimAt({ x: 22, y: 1.4, z: 2.75 });
  await driver.waitFor(state => state.dialogue.consumedEvents.includes('route.blocked'), 'walk to blocked physical stair');
  if (screenshots) await capture(page, '02-blocked-stair');
  const blockedSamples = await driver.hold(['w'], 650);
  assert.ok(blockedSamples.at(-1).position.z < 2.5);
  await driver.moveTo({ x: 22, z: 1.7 });
  await driver.moveTo({ x: 12.1, z: 1.7 });
  await driver.moveTo({ x: 12.1, z: 8 });
  await driver.aimAt({ x: 13.35, y: 1.12, z: 8 });
  if (screenshots) await capture(page, '03-service-wheel');
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
    await sample('inspection-slot');
    if (screenshots) await capture(page, '04-inspection-slot');
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
  await driver.moveTo({ x: 11, z: 9.05 }, { tolerance: .35 });
  await driver.waitFor(state => state.companion.retracted && state.companion.retraction > .9, 'companion retracts beside portal plane');
  await driver.aimAt({ x: 11, z: 11 });
  await sample('aperture-retracted');
  if (screenshots) await capture(page, '05-a1-live');
  await driver.throughPortal({ x: 11, z: 11 }, { source: 'A1', destination: 'B1' });
  let state = await driver.snapshot();
  assert.ok(state.footPosition.y > 2.2 && state.footPosition.y < 2.6);
  assert.ok(cameraAngles(state.rotation).forward.x < -.7);
  checkCompanion(state);
  await sample('first-crossing');
  if (screenshots) { await driver.aimAt({x:24,y:4,z:10}); await capture(page, '06-b1-reverse-view'); }
  if (reverse) {
    await driver.moveTo({ x: 22.6, z: 10 });
    await driver.aimAt({ x: 24, z: 10 });
    await driver.throughPortal({ x: 25, z: 10 }, { source: 'B1', destination: 'A1' });
    state = await driver.snapshot();
    assert.ok(Math.abs(state.footPosition.y) < .12);
    checkCompanion(state);
    await driver.moveTo({ x: 11, z: 8.5 });
    await driver.throughPortal({ x: 11, z: 11 }, { source: 'A1', destination: 'B1' });
    await sample('third-crossing');
  }
  await driver.moveTo({ x: 20.8, z: 12.2 });
  await driver.aimAt({ x: 11, y: 3.8, z: 10.1 });
  await driver.waitFor(state => state.dialogue.consumedEvents.includes('upper.lookback'), 'actual sustained upper-gallery lookback');
  if (screenshots) await capture(page, '07-upper-lookback');
  await driver.aimAt({ x: 9.5, y: 1.6, z: 3 });
  await driver.waitFor(state => state.mountObstruction === 'GalleryGuard' && state.companion.retracted &&
    state.companion.retraction > .95, 'native obstruction query folds shoulder device away from the real gallery rail');
  await sample('upper-overlook');
  await driver.moveTo({ x: 22, z: 10 });
  await driver.interact({ x: 21, y: 3.45, z: 10 }, 'UpperLatch');
  await driver.waitFor(state => state.returnStairOpen && state.gateProgress > .999, 'upper mechanical latch opens return circuit');
  await driver.moveTo({ x: 22, z: 9.2 });
  await driver.aimAt({ x: 22, y: .8, z: 3 });
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
    await sample('returned-to-court');
    if (screenshots) await capture(page, '09-physical-stair');
    await driver.moveTo({ x: 22, z: 7.9 });
    await driver.moveTo({ x: 22, z: 9.8 });
    state = await driver.snapshot();
    assert.ok(state.footPosition.y > 2.2 && state.footPosition.y < 2.6);
    assert.equal(state.portalEvents.length, crossings);
  }
  await driver.moveTo({ x: 22.8, z: 13 });
  await driver.moveTo({ x: 25.2, z: 13 });
  state = await driver.waitFor(state => state.completed, 'real upper exit completes L01');
  if (screenshots) state = await driver.waitFor(state => state.dialogue.history.some(line => line.id === 'C01-L01-ZQ-009'), 'terminal companion reply after facility broadcast', 25000);
  await driver.aimAt({ x: 22.2, y: 3.8, z: 12.3 });
  if (screenshots) await capture(page, '08-completed-circuit');
  await sample('completed');
  return { state, blockedSamples, wheelSamples, portalTexture };
}


test('M1-R3: live bilingual subtitles, input-only native portals and event-linked character responses',
  { timeout: 450000 }, async () => {
    const { page, errors } = await createPage();
    let driver;
    const observations = [];
    try {
      const frame = await start(page);
      driver = new InputDriver(page, frame);
      assert.deepEqual(preferences(await settledPreferences(driver)),
        { voiceEnabled: true, subtitlesEnabled: true, subtitleLanguage: 'zh-CN' }, 'fresh browser defaults to Simplified Chinese subtitles');
      await driver.lockPointer();
      await driver.waitFor(s => s.dialogue.currentLine === 'C01-L01-ZQ-001' && s.dialogue.elapsed > .4, 'active entry line');
      const chinese = await subtitleProbe(frame);
      await capture(page, '10-active-chinese-subtitle');
      const beforeSwitch = await driver.snapshot();
      const audioBeforeSwitch = resources(await nativeStats(frame));
      await driver.press('l');
      const switched = await driver.waitFor(s => s.dialogue.subtitleLanguage === 'en', 'actual L key switches active line');
      assert.equal(switched.dialogue.currentLine, beforeSwitch.dialogue.currentLine, 'language choice does not change active line');
      assert.ok(switched.dialogue.elapsed >= beforeSwitch.dialogue.elapsed, 'language switch does not reset elapsed duration');
      assert.deepEqual(switched.dialogue.startedLines, beforeSwitch.dialogue.startedLines);
      assert.deepEqual(switched.dialogue.history, beforeSwitch.dialogue.history, 'language switch does not start/replay voice');
      assert.equal(switched.dialogue.currentMode, beforeSwitch.dialogue.currentMode);
      assert.equal((await nativeStats(frame)).audioVoices, audioBeforeSwitch.audioVoices, 'language switching does not add a native audio voice');
      const english = await subtitleProbe(frame);
      assert.notEqual(english.dialogue.currentText, chinese.dialogue.currentText);
      await capture(page, '11-same-line-english-subtitle');
      await driver.press('l');
      await driver.waitFor(s => s.dialogue.subtitleLanguage === 'zh-CN', 'L key returns to Chinese');
      await settledPreferences(driver);
      const result = await solve(driver, { screenshots: true, explore: true, reverse: true,
        sample: async label => { const state = await driver.snapshot(); checkCompanion(state); checkDialogue(state);
          observations.push({ label, state, subtitle: await subtitleProbe(frame) }); } });
      const state = result.state;
      assert.ok(result.wheelSamples.audioDuringWheel.audioVoices > 0, 'mechanical handwheel audio uses real native WebAudio voice');
      assert.ok(result.wheelSamples.audioDuringWheel.audioBuffers >= 4, 'four real mechanical WAV files are decoded');
      assert.deepEqual(state.portalEvents.map(({ source, destination }) => [source, destination]),
        [['A1', 'B1'], ['B1', 'A1'], ['A1', 'B1']]);
      for (const event of ['court.enter', 'exit.seen', 'route.blocked', 'fold.ready', 'fold.crossed', 'upper.lookback',
        'return.open', 'court.returned', 'level.complete', 'maintenance.observed'])
        assert.ok(state.dialogue.consumedEvents.includes(event), `event caused by actual player action: ${event}`);
      assert.equal(state.dialogue.consumedEvents.filter(v => v === 'fold.crossed').length, 1, 'repeated portal crossing does not re-emit first-crossing dialogue');
      assert.equal(state.dialogue.availableAudio.length, buildMetadata.voice.generated.length);
      assert.equal(state.dialogue.missingAudio.length, buildMetadata.voice.missing.length);
      if (buildMetadata.voice.generated.length === 0) {
        assert.equal(state.dialogue.availableAudio.length, 0);
        assert.ok(state.dialogue.history.every(v => v.mode === 'subtitle'), 'missing offline English assets use truthful subtitle fallback');
      }
      const stats = await nativeStats(frame);
      assert.ok(stats.portalTraversals >= 3);
      assert.equal(await frame.evaluate(() => scriptErrors), 0);
  const art=await frame.evaluate(()=>{
    const root=scene.getTransformNodeByName('L01IndustrialDress');
    const parts=root?.getChildMeshes().filter(m=>m.getTotalVertices()>0)||[];
    const concrete=scene.getMeshByName('salt-worn concrete');
    const steel=scene.getMeshByName('service steel');
    const companion=scene.meshes.find(m=>m.metadata?.arkglideId==='zanque:housing'||m.name==='栈雀 · housing');
    return {parts:parts.map(m=>m.name),bounds:concrete&&{min:concrete.getBoundingInfo().boundingBox.minimumWorld.asArray(),max:concrete.getBoundingInfo().boundingBox.maximumWorld.asArray()},
      textures:steel?.material?.getActiveTextures().map(t=>({size:t.getSize(),ready:t.isReady()})),
      companionTextured:companion?.material?.getActiveTextures().length===1&&companion.material.getActiveTextures().every(t=>t.isReady()),
      filter:document.getElementById('renderCanvas').style.filter};
  });
  assert.equal(art.parts.length,8,'all real glTF art batches imported');
  assert.ok(art.bounds.min[0]>7.9&&art.bounds.max[0]<24.1,'imported art shares the real courtyard coordinates');
  assert.equal(art.textures.length,2,'actual source metal colour and normal both decoded');
  assert.ok(art.textures.every(t=>t.ready&&t.size.width===512&&t.size.height===512));
  assert.ok(art.companionTextured);
  assert.equal(art.filter,'saturate(0.94) contrast(1.025)');

      assert.deepEqual(errors, []);
      await writeEvidence('input-route.json', { kind: 'automated actual keyboard/relative pointer input; not human blind playtesting or English voice audition',
        audio: { preparedVoiceAssets: buildMetadata.voice, note: 'Mechanical SFX are not English dialogue recordings. Real missing WAV duration/timbre cannot be browser-validated.' },
        activeLanguageSwitch: { chinese, english, beforeSwitch, switched, audioBeforeSwitch },
        mechanicalAudioDuringWheel: result.wheelSamples.audioDuringWheel, mechanicalAudioObservations: result.wheelSamples.audioObservations, handwheelRatchet: result.wheelSamples.ratchet,
        inputs: driver.log, observations, ...result, nativeStats: stats });
      await fs.rm(new URL('failure-route.png', evidence), { force: true });
    } catch (error) {
      await capture(page, 'failure-route').catch(() => {});
      console.error('M1-R3 route diagnostics', { errors, snapshot: await driver?.snapshot().catch(() => null), inputs: driver?.log });
      throw error;
    } finally { await driver?.releaseKeys().catch(() => {}); await page.close(); }
  });

test('M1-R3: independent settings persist through pause/retry/re-entry/reload with clean native resources',
  { timeout: 600000 }, async () => {
    const { page, errors } = await createPage();
    let driver;
    const inputSessions = [];
    try {
      let frame = await start(page);
      driver = new InputDriver(page, frame);
      inputSessions.push(driver.log);
      const baseline = resources(await nativeStats(frame));
      assert.equal(baseline.audioVoices, 0);
      await driver.lockPointer();
      await driver.waitFor(s => s.dialogue.currentLine !== null && s.dialogue.elapsed > .2, 'entry dialogue is active');
      // First show the subtitle option leaves the independent voice option on.
      // Without actual voice WAVs, this is a settings test, not an audition.
      await driver.press('b');
      let state = await driver.snapshot();
      assert.equal(state.dialogue.subtitlesEnabled, false);
      assert.equal(state.dialogue.voiceEnabled, true);
      assert.equal((await subtitleProbe(frame)).display, 'none');
      await driver.press('b');
      await driver.press('v');
      state = await driver.snapshot();
      assert.equal(state.dialogue.voiceEnabled, false);
      assert.equal(state.dialogue.subtitlesEnabled, true, 'muting voice keeps subtitle option on');
      if (state.dialogue.currentLine) assert.notEqual((await subtitleProbe(frame)).display, 'none');
      await frame.evaluate(() => document.exitPointerLock());
      await driver.waitFor(s => s.paused && s.dialogue.paused, 'standard pointer-lock exit opens menu');
      const pausedBefore = await driver.snapshot();
      await page.waitForTimeout(240);
      const pausedAfter = await driver.snapshot();
      assert.equal(pausedAfter.dialogue.elapsed, pausedBefore.dialogue.elapsed);
      assert.deepEqual(pausedAfter.companion.worldPosition, pausedBefore.companion.worldPosition);
      assert.equal(pausedAfter.companion.mode, 'paused');
      await driver.pressInCanvas('l');
      await driver.pressInCanvas('b');
      const selected = await settledPreferences(driver);
      const expected = { voiceEnabled: false, subtitlesEnabled: false, subtitleLanguage: 'en' };
      assert.deepEqual(preferences(selected), expected, 'menu L/B work independently while paused');
      await driver.pressInCanvas('r');
      const retry1 = await driver.waitFor(s => s.ready && s.retryCount === 1 && s.phase === 'locked', 'paused-menu native checkpoint retry');
      assert.deepEqual(preferences(await settledPreferences(driver)), expected);
      assert.equal(retry1.dialogue.currentLine, null);
      assert.deepEqual(retry1.dialogue.consumedEvents, []);
      const afterRetry1 = resources(await nativeStats(frame));
      for (const key of RESOURCE_KEYS.filter(v => v !== 'audioBuffers'))
        assert.equal(afterRetry1[key], baseline[key], `checkpoint retry keeps one scene: ${key}`);
      await driver.lockPointer();
      await driver.press('b');
      const mutedCaption = await driver.waitFor(s => s.dialogue.currentLine !== null, 'muted voice still presents event dialogue');
      assert.equal(mutedCaption.dialogue.voiceEnabled, false);
      assert.equal(mutedCaption.dialogue.subtitlesEnabled, true);
      const mutedEnglish = await subtitleProbe(frame);
      assert.notEqual(mutedEnglish.display, 'none');
      assert.equal(mutedEnglish.dialogue.subtitleLanguage, 'en');
      await driver.press('b');
      await settledPreferences(driver);
      const result = await solve(driver, { explore: false, reverse: false, stairs: true });
      assert.equal(result.state.completed, true, 'dialogue and subtitles can both be disabled while actual puzzle remains completable');
      assert.equal(result.state.blindProgress, 0, 'optional inspection remains optional');
      checkDialogue(result.state);
      assert.deepEqual(preferences(result.state), expected);
      await driver.press('r');
      const retry2 = await driver.waitFor(s => s.ready && s.retryCount === 2 && s.phase === 'locked', 'completed checkpoint retry');
      assert.deepEqual(preferences(await settledPreferences(driver)), expected);
      assert.deepEqual(retry2.dialogue.consumedEvents, []);
      assert.deepEqual(retry2.dialogue.startedLines, []);
      assert.deepEqual(resources(await nativeStats(frame)), afterRetry1, 'completed run/retry does not grow resources or native buffer cache');
      await page.evaluate(() => ArkGlidePlayer.pause());
      await frame.waitForFunction(() => !running);
      const outerTime = await frame.evaluate(() => time.totalTime);
      await page.waitForTimeout(180);
      assert.equal(await frame.evaluate(() => time.totalTime), outerTime);
      await page.evaluate(() => ArkGlidePlayer.pause());
      await frame.waitForFunction(() => running);
      const stopped = [], restarted = [];
      for (let count = 0; count < 3; count++) {
        await driver.releaseKeys();
        await page.evaluate(() => ArkGlidePlayer.stop());
        await page.waitForFunction(() => document.body.dataset.state === 'stopped');
        const stats = await page.evaluate(() => ArkGlidePlayer.stats);
        for (const [key, value] of Object.entries(resources(stats))) assert.equal(value, 0, `native stop releases ${key}`);
        assert.equal(stats.portalViews, 0);
        // The official standalone player removes the runtime iframe after its
        // native stop acknowledgement. Inspect the surviving host, not a dead
        // frame. Re-entry below checks a newly bounded set of art resources.
        const visualStop={runtimeFrames:page.frames().filter(f=>f.url().includes('runtime.html?boot=')).length,previousFrameDetached:frame.isDetached()};
        assert.deepEqual(visualStop,{runtimeFrames:0,previousFrameDetached:true});
        stopped.push({...stats,visualStop});
        if (count < 2) {
          await page.evaluate(() => ArkGlidePlayer.start());
          frame = await startedFrame(page);
          driver = new InputDriver(page, frame);
          inputSessions.push(driver.log);
          const reentered = await settledPreferences(driver);
          assert.deepEqual(preferences(reentered), expected, 'native re-entry reads saved language/voice/subtitle choices');
          assert.deepEqual(reentered.dialogue.consumedEvents, [], 'new level instance starts a clean event history');
          assert.deepEqual(resources(await nativeStats(frame)), baseline, 'native re-entry recreates one scene and bounded resources');
          restarted.push(reentered);
        }
      }
      await page.reload();
      await page.evaluate(() => ArkGlidePlayer.start());
      frame = await startedFrame(page);
      driver = new InputDriver(page, frame);
      inputSessions.push(driver.log);
      const reloaded = await settledPreferences(driver);
      assert.deepEqual(preferences(reloaded), expected, 'same-origin real page reload retains native saved preferences');
      assert.equal(reloaded.phase, 'locked');
      assert.equal(reloaded.completed, false);
      assert.deepEqual(resources(await nativeStats(frame)), baseline);
      await page.evaluate(() => ArkGlidePlayer.stop());
      await page.waitForFunction(() => document.body.dataset.state === 'stopped');
      assert.deepEqual(errors, []);
      await writeEvidence('lifecycle-results.json', { kind: 'automated actual input/lifecycle validation; no physical Escape or human audition claim',
        inputSessions, baseline, pausedBefore, pausedAfter, selected, retry1, afterRetry1, mutedEnglish,
        completed: result.state, retry2, expectedPersistedPreferences: expected, stopped, restarted, reloaded,
        pauseMethod: 'standard document.exitPointerLock + real canvas key input, separately native ArkGlidePlayer.pause',
        voiceLimit: 'With missing English WAV files, voice/subtitle independence and persistence are verified as settings; actual voice timbre/duration requires generated files and listening.' });
      await fs.rm(new URL('failure-lifecycle.png', evidence), { force: true });
    } catch (error) {
      await capture(page, 'failure-lifecycle').catch(() => {});
      console.error('M1-R3 lifecycle diagnostics', { errors, snapshot: await driver?.snapshot().catch(() => null), inputs: driver?.log });
      throw error;
    } finally { await driver?.releaseKeys().catch(() => {}); await page.close(); }
  });
