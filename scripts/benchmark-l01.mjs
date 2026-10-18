import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { serveStatic } from "./serve.mjs";
import { InputDriver } from "../tests/input-driver.mjs";

// Compare prepared official static packages, one browser at a time. This tool
// only reads native telemetry and sends real keyboard/relative-pointer input.
const root = fileURLToPath(new URL("../", import.meta.url));
const [
  directory = path.join(root, ".generated/l01"),
  label = "r3",
  output = path.join(root, "docs/evidence/m1-r3/performance-r3.json"),
] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(label)) throw Error("Use a simple benchmark label.");
const evidence = path.dirname(path.resolve(output));
await fs.mkdir(evidence, { recursive: true });
const metadata = JSON.parse(
  await fs.readFile(path.join(directory, "foldline-build.json"), "utf8"),
);
const server = await serveStatic(directory, 0);
let browser;
const results = [];
try {
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
  for (let iteration = 0; iteration < 2; iteration++) {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 800 },
      }),
      errors = [];
    let loadedBytes = 0, loadedRequests = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    page.on("response", (r) => {
      loadedRequests++;
      loadedBytes += Number(r.headers()["content-length"] || 0);
    });
    await page.route("**/favicon.ico", (r) => r.fulfill({ status: 204 }));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(() => ArkGlidePlayer.start());
      await page.waitForFunction(
        () => document.body.dataset.state === "playing",
      );
      const frame = page
        .frames()
        .find((f) => f.url().includes("runtime.html?boot="));
      await frame.waitForFunction(
        () => globalThis.foldlineL01?.snapshot().ready,
      );
      const driver = new InputDriver(page, frame);
      await driver.lockPointer();
      async function sample(condition) {
        await page.waitForTimeout(2000);
        const before = await frame.evaluate(() => ({
          frame: time.frameCount,
          at: performance.now(),
        }));
        await page.waitForTimeout(6000);
        const data = await frame.evaluate(() => {
          const gl = engine.getRenderingCanvas().getContext("webgl2"),
            debug = gl.getExtension("WEBGL_debug_renderer_info");
          return {
            frame: time.frameCount,
            at: performance.now(),
            frameMs,
            renderMs,
            pose: foldlineL01.snapshot(),
            meshes: scene.meshes.length,
            materials: scene.materials.length,
            usedMaterials: new Set(
              scene.meshes.map((m) => m.material).filter(Boolean),
            ).size,
            textures: scene.textures.length,
            lights: scene.lights.length,
            triangles:
              scene.meshes.reduce((n, m) => n + m.getTotalIndices(), 0) / 3,
            physics: physicsRuntime.stats(),
            portals: portalRuntime.stats(),
            visuals: visualsRuntime.stats(),
            renderer: debug
              ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL)
              : gl.getParameter(gl.RENDERER),
            filter: document.getElementById("renderCanvas").style.filter,
          };
        });
        data.fps = ((data.frame - before.frame) * 1000) / (data.at - before.at);
        results.push({
          label,
          iteration,
          condition,
          loadedBytes,
          loadedRequests,
          errors: [...errors],
          ...data,
        });
        await page.screenshot({
          path: path.join(evidence, `${label}-${condition}-${iteration}.png`),
        });
      }
      await sample("entry");
      await driver.moveTo({ x: 12.1, z: 8 });
      await driver.aimAt({ x: 13.35, y: 1.12, z: 8 });
      await driver.waitFor(
        (s) => s.interactTarget === "ShutterHandle",
        "wheel",
      );
      await driver.keyDown("e");
      await driver.waitFor((s) => s.phase === "active", "pair", 25000);
      await driver.keyUp("e");
      await driver.moveTo({ x: 11, z: 8.5 });
      await driver.aimAt({ x: 11, z: 11 });
      await sample("portal");
      results.at(-1).inputLog = driver.log;
      if (errors.length) throw Error(errors.join("\n"));
    } finally {
      await page.close();
    }
  }
} finally {
  const version = browser?.version();
  await browser?.close();
  await new Promise((r) => server.close(r));
  await fs.writeFile(
    output,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        build: metadata,
        environment: {
          platform: process.platform,
          node: process.version,
          chromium: version,
          cpu: os.cpus()[0]?.model,
          reportedCpus: os.cpus().length,
          viewport: "1280x800 DPR1",
          concurrentBrowsers: 1,
        },
        method: {
          warmupMs: 2000,
          sampleMs: 6000,
          iterations: 2,
          frameRate: "Native frameCount delta / elapsed wall time",
          nativeDurations:
            "Submission/CPU durations, not GPU completion; do not invert to infer FPS",
          pose: "Real keyboard/pointer inputs, A1 positioning tolerance 0.32m. Actual body/camera poses retained.",
          limit:
            "Short software-rendered cloud samples, not Windows hardware or human playtesting",
        },
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
console.log(
  results.map(({ condition, fps, meshes, materials, loadedBytes }) => ({
    label,
    condition,
    fps,
    meshes,
    materials,
    loadedBytes,
  })),
);
