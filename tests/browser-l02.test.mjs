import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveStatic } from "../scripts/serve.mjs";
import { InputDriver } from "./input-driver.mjs";
const evidence = new URL("../docs/evidence/m2/", import.meta.url);
let server, browser, url;
const resources = [
  "scripts",
  "timers",
  "subscriptions",
  "listeners",
  "nativeOwners",
  "nativeTimers",
  "portals",
  "portalSurfaces",
  "portalTravelers",
  "portalClones",
  "runtimeCameras",
  "cameraRigs",
  "physicsBodies",
  "physicsCharacters",
  "physicsSubscriptions",
  "physicsTriggers",
  "physicsGrabs",
  "visualResources",
  "motionControllers",
  "signalNodes",
  "signalListeners",
  "checkpointProviders",
  "storageRequests",
  "uiSubscriptions",
  "inputCaptures",
  "audioVoices",
  "audioBuffers",
  "audioBuses",
  "audioStreams",
  "audioWorklets",
  "audioTransitions",
  "audioBlobURLs",
];
test.before(async () => {
  server = await serveStatic(
    fileURLToPath(new URL("../.generated/l02/", import.meta.url)),
    0,
  );
  url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
      (process.platform === "linux" ? "/usr/bin/chromium" : undefined),
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  await fs.mkdir(evidence, { recursive: true });
});
test.after(async () => {
  await browser?.close();
  if (server) await new Promise((r) => server.close(r));
});
async function frameFor(page) {
  await page.waitForFunction(() => document.body.dataset.state === "playing");
  const frame = page
    .frames()
    .find((f) => f.url().includes("runtime.html?boot="));
  await frame.waitForFunction(
    () =>
      globalThis.foldlineL02?.snapshot().ready &&
      foldlineL02.snapshot().dialogue.preferencesReady,
  );
  return frame;
}
async function boot(page) {
  await page.goto(url);
  await page.evaluate(() => ArkGlidePlayer.start());
  return frameFor(page);
}
async function shot(page, name) {
  await page.waitForTimeout(250);
  await page.screenshot({
    path: fileURLToPath(new URL(name + ".png", evidence)),
  });
}
async function stats(f) {
  return f.evaluate(() => ({
    ...session.stats(),
    ...cameraRuntime.stats(),
    ...visualsRuntime.stats(),
    ...motionRuntime.stats(),
    ...signalsRuntime.stats(),
    ...interactionRuntime.stats(),
    ...triggersRuntime.stats(),
    ...savesRuntime.stats(),
    ...storageRuntime.stats(),
    ...inputRuntime.stats(),
    ...portalRuntime.stats(),
    ...physicsRuntime.stats(),
    ...audioRuntime.stats(),
  }));
}
async function audit(d) {
  const s = await d.snapshot();
  assert.equal(s.error, "");
  assert.deepEqual(s.audioErrors, []);
  assert.deepEqual(s.dialogue.errors, []);
  assert.equal(
    new Set(s.dialogue.startedLines).size,
    s.dialogue.startedLines.length,
  );
  assert.equal(s.companion.collisionBodies, 0);
  assert.deepEqual(s.companion.resources, {
    meshes: 12,
    materials: 5,
    textures: 1,
  });
  assert.ok(s.companion.mountDistance < 1.05);
  return s;
}
async function atFold(d) {
  await d.moveTo({ x: 30.6, z: 14 });
  await d.moveTo({ x: 28, z: 13.8 });
  await d.aimAt({ x: 28, y: 3.55, z: 18 });
  await d.waitFor(
    (s) => s.interactTarget === "Coupler",
    "native through-fold pick",
  );
}
async function borrow(d) {
  await atFold(d);
  assert.deepEqual((await d.snapshot()).pickPath, ["A2"]);
  await d.press("e");
  await d.waitFor(
    (s) => s.flags.borrowed && s.crate.position.z < 15.6,
    "actual B2→A2 crate crossing",
    25000,
  );
  const s = await audit(d);
  assert.ok(s.holding);
  assert.ok(
    s.portalEvents.some(
      (e) =>
        e.entity === "Coupler" && e.source === "B2" && e.destination === "A2",
    ),
  );
  assert.equal(s.portalEvents.filter((e) => e.entity === "Player").length, 0);
}
async function dock(d, { probeHeld = false } = {}) {
  await d.moveTo({ x: 25.5, z: 14 });
  await d.moveTo({ x: 25.5, z: 18.7 });
  await d.moveTo({ x: 27, z: 18.5 });
  await d.aimAt({ x: 27, y: 3.4, z: 20 });
  await d.waitFor(
    (s) =>
      s.holding &&
      Math.abs(s.crate.position.x - 27) < 0.43 &&
      Math.abs(s.crate.position.z - 20) < 0.53 &&
      Math.hypot(s.crate.velocity.x, s.crate.velocity.y, s.crate.velocity.z) <
        0.35,
    "held coupler is actually above the receiving deck",
    18000,
  );
  if (probeHeld) {
    const s = await d.snapshot();
    assert.ok(s.holding);
    assert.equal(s.flags.busCommissioned, false);
    assert.equal(s.gateProgress, 0);
  }
  await d.press("e");
  await d.waitFor(
    (s) => s.flags.busCommissioned,
    "release, settle and latch",
    20000,
  );
  await d.waitFor((s) => s.gateProgress > 0.999, "real exit motion");
}
async function finish(d) {
  await d.moveTo({ x: 28.7, z: 23 });
  await d.moveTo({ x: 28.7, z: 25 });
  await d.waitFor((s) => s.completed, "physically through exit");
}
async function sample(f) {
  const before = await f.evaluate(() => ({
    at: performance.now(),
    frame: time.frameCount,
  }));
  await f.waitForTimeout(4000);
  return f.evaluate((before) => {
    const meshes = scene.meshes.filter((m) => m.getTotalVertices() > 0);
    return {
      fps:
        ((time.frameCount - before.frame) * 1000) /
        (performance.now() - before.at),
      meshes: meshes.length,
      triangles: meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0),
      materials: scene.materials.length,
      usedMaterials: new Set(meshes.map((m) => m.material)).size,
      textures: scene.textures.length,
      lights: scene.lights.length,
      resourceTimingDecodedBytes: performance
        .getEntriesByType("resource")
        .reduce((s, e) => s + e.decodedBodySize, 0),
    };
  }, before);
}

test(
  "L02 actual input: isolated object, body blockage, native turn through fold, released latch and physical exit",
  { timeout: 240000 },
  async (t) => {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/favicon.ico", (r) => r.fulfill({ status: 204 }));
    t.after(() => page.close());
    let d;
    try {
      const f = await boot(page);
      d = new InputDriver(page, f, { stateName: "foldlineL02" });
      await d.lockPointer();
      await shot(page, "01-entry");
      const entryStats = await stats(f),
        entryPerformance = await sample(f);
      const ui = await f.evaluate(() => ({
        stage: !!document.querySelector('[data-hud-id="stage"]'),
        controls: !!document.querySelector('[data-hud-id="controls"]'),
      }));
      assert.deepEqual(ui, { stage: false, controls: false });
      // Observe from the southern oblique window; the other side of B2 is no longer hiding the target.
      await d.moveTo({ x: 30.9, z: 15.5 });
      await d.aimAt({ x: 37, y: 3.55, z: 19 });
      await d.waitFor(
        (s) => s.rayHit === "ObservationGlass",
        "solid observation glass",
      );
      await d.press("e");
      assert.equal((await d.snapshot()).holding, false);
      assert.equal((await d.snapshot()).flags.borrowed, false);
      await shot(page, "02-glass");
      await atFold(d);
      await shot(page, "03-aperture");
      // Walk/jump at the real aperture; the body cannot be shrunk to the parcel's size.
      await d.aimAt({ x: 28, z: 17 });
      await d.hold(["w"], 2200);
      await d.hold(["w", "Space"], 1600);
      let s = await d.snapshot();
      assert.ok(s.position.z < 16);
      assert.equal(
        s.portalEvents.filter((e) => e.entity === "Player").length,
        0,
      );
      await d.moveTo({ x: 28, z: 13.8 });
      await d.aimAt({ x: 28, y: 3.55, z: 16 });
      await borrow(d);
      await shot(page, "04-borrow");
      await dock(d, { probeHeld: true });
      await shot(page, "05-dock");
      // Removing a latched coupler must not trap the player behind a reclosed gate.
      await d.aimAt({ x: 27, y: 3.1, z: 20 });
      await d.waitFor(
        (s) => s.interactTarget === "Coupler",
        "reacquire latched coupler",
      );
      await d.press("e");
      assert.ok((await d.snapshot()).holding);
      await d.aimAt({ x: 29, y: 3.4, z: 18.6 });
      await d.press("e");
      assert.equal((await d.snapshot()).holding, false);
      assert.ok((await d.snapshot()).flags.busCommissioned);
      await finish(d);
      await d.aimAt({ x: 27, y: 3.3, z: 20 });
      await shot(page, "06-exit");
      s = await audit(d);
      assert.equal(s.completed, true);
      assert.ok(s.flags.isolationCommanded);
      assert.ok(
        s.blockedEvents.every(
          (e) => e.entity !== "Coupler" || typeof e.reason === "string",
        ),
      );
      const finalStats = await stats(f);
      assert.equal(finalStats.physicsGrabs, 0);
      assert.equal(finalStats.physicsBodies, entryStats.physicsBodies);
      assert.equal(finalStats.visualResources, entryStats.visualResources);
      assert.equal(finalStats.listeners, entryStats.listeners);
      assert.deepEqual(errors, []);
      await fs.writeFile(
        new URL("route.json", evidence),
        JSON.stringify(
          {
            method:
              "Browser keyboard/relative pointer input; read-only snapshots; not human blind testing",
            input: d.log,
            entryStats,
            finalStats,
            entryPerformance,
            final: s,
            errors,
          },
          null,
          2,
        ) + "\n",
      );
    } catch (e) {
      await shot(page, "failure-route");
      throw e;
    }
  },
);

test(
  "L02 repeated pickup/drop, two solves, pause/retry while held, reload and native owner cleanup",
  { timeout: 300000 },
  async (t) => {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      }),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/favicon.ico", (r) => r.fulfill({ status: 204 }));
    t.after(() => page.close());
    const cycles = [];
    try {
      let f = await boot(page),
        d = new InputDriver(page, f, { stateName: "foldlineL02" });
      await d.lockPointer();
      const baseline = await stats(f);
      // Mute speech and subtitles: neither is required to operate or finish.
      await d.press("v");
      await d.press("b");
      await borrow(d);
      for (let i = 0; i < 3; i++) {
        await d.press("e");
        await d.waitFor((s) => !s.holding, "release");
        await d.frame.waitForTimeout(700);
        const c = (await d.snapshot()).crate.position;
        await d.aimAt(c);
        await d.waitFor(
          (s) => s.interactTarget === "Coupler",
          "drop can be retrieved",
        );
        await d.press("e");
        await d.waitFor((s) => s.holding, "repeated grab");
      }
      await f.evaluate(() => document.exitPointerLock());
      await d.waitFor((s) => s.paused, "pause");
      const before = await d.snapshot();
      await f.waitForTimeout(700);
      const after = await d.snapshot();
      assert.deepEqual(after.crate.position, before.crate.position);
      assert.equal((await stats(f)).physicsGrabs, 1);
      await d.lockPointer();
      await dock(d);
      await finish(d);
      cycles.push(await audit(d));
      await d.press("r");
      await d.waitFor(
        (s) => s.retryCount === 1 && s.ready && s.paused,
        "checkpoint retry",
      );
      assert.equal((await stats(f)).physicsGrabs, 0);
      assert.equal((await d.snapshot()).flags.busCommissioned, false);
      assert.equal((await d.snapshot()).dialogue.voiceEnabled, false);
      await d.lockPointer();
      await borrow(d);
      // Retry with an active spring must release it before native body restore.
      await d.press("r");
      await d.waitFor((s) => s.retryCount === 2 && s.ready, "held retry");
      assert.equal((await stats(f)).physicsGrabs, 0);
      assert.ok(Math.abs((await d.snapshot()).crate.position.x - 37) < 0.01);
      await d.lockPointer();
      await borrow(d);
      await dock(d);
      await finish(d);
      cycles.push(await audit(d));
      const repeated = await stats(f);
      for (const key of [
        "physicsBodies",
        "physicsCharacters",
        "visualResources",
        "listeners",
        "subscriptions",
        "portalTravelers",
        "checkpointProviders",
      ])
        assert.equal(repeated[key], baseline[key], key);
      await page.evaluate(() => ArkGlidePlayer.stop());
      await page.waitForFunction(
        () => document.body.dataset.state === "stopped",
      );
      const stopped = await page.evaluate(() => ArkGlidePlayer.stats);
      for (const key of resources)
        assert.equal(stopped[key], 0, `stop releases ${key}`);
      assert.ok(f.isDetached());
      await page.evaluate(() => ArkGlidePlayer.start());
      f = await frameFor(page);
      d = new InputDriver(page, f, { stateName: "foldlineL02" });
      assert.equal((await d.snapshot()).dialogue.voiceEnabled, false);
      await d.lockPointer();
      await borrow(d);
      assert.equal((await stats(f)).physicsGrabs, 1);
      await page.evaluate(() => ArkGlidePlayer.stop());
      await page.waitForFunction(
        () => document.body.dataset.state === "stopped",
      );
      const heldStop = await page.evaluate(() => ArkGlidePlayer.stats);
      for (const key of resources)
        assert.equal(heldStop[key], 0, `held stop ${key}`);
      await page.reload();
      await page.evaluate(() => ArkGlidePlayer.start());
      f = await frameFor(page);
      d = new InputDriver(page, f, { stateName: "foldlineL02" });
      assert.equal((await d.snapshot()).dialogue.voiceEnabled, false);
      assert.equal((await d.snapshot()).flags.borrowed, false);
      assert.equal((await stats(f)).physicsGrabs, 0);
      await page.evaluate(() => ArkGlidePlayer.stop());
      await page.waitForFunction(
        () => document.body.dataset.state === "stopped",
      );
      const reloadStop = await page.evaluate(() => ArkGlidePlayer.stats);
      for (const key of resources)
        assert.equal(reloadStop[key], 0, `reload stop ${key}`);
      assert.deepEqual(errors, []);
      await fs.writeFile(
        new URL("lifecycle.json", evidence),
        JSON.stringify(
          { cycles, baseline, repeated, stopped, heldStop, reloadStop, errors },
          null,
          2,
        ) + "\n",
      );
    } catch (e) {
      await shot(page, "failure-lifecycle");
      throw e;
    }
  },
);

test(
  "L02 object can be returned through the same narrow link and borrowed again without body crossing",
  { timeout: 120000 },
  async (t) => {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });
    t.after(() => page.close());
    await page.route("**/favicon.ico", (r) => r.fulfill({ status: 204 }));
    const f = await boot(page),
      d = new InputDriver(page, f, { stateName: "foldlineL02" });
    try {
      await d.lockPointer();
      await borrow(d);
      await d.aimAt({ x: 28, z: 17 });
      await d.hold(["w"], 2200);
      await d.aimAt({ x: 28, y: 3.55, z: 16 });
      await d.waitFor(
        (s) =>
          s.portalEvents.some(
            (e) =>
              e.entity === "Coupler" &&
              e.source === "A2" &&
              e.destination === "B2",
          ),
        "return held object along A2→B2",
        20000,
      );
      await d.moveTo({ x: 28, z: 13.8 });
      await d.aimAt({ x: 28, y: 3.55, z: 18 });
      await d.waitFor(
        (s) =>
          s.portalEvents.filter(
            (e) => e.entity === "Coupler" && e.source === "B2",
          ).length === 2,
        "borrow again through preserved native route",
        20000,
      );
      const s = await audit(d);
      assert.equal(
        s.portalEvents.filter((e) => e.entity === "Player").length,
        0,
      );
      assert.ok(s.holding);
      assert.equal((await stats(f)).physicsGrabs, 1);
      await fs.writeFile(
        new URL("reverse-object.json", evidence),
        JSON.stringify({ input: d.log, state: s }, null, 2) + "\n",
      );
    } catch (e) {
      await shot(page, "failure-reverse");
      throw e;
    }
  },
);
