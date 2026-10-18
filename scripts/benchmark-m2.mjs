// Comparable local software-renderer samples, never a gameplay mutation.
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { serveStatic } from "./serve.mjs";
import { InputDriver } from "../tests/input-driver.mjs";
const browser = await chromium.launch({
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
const results = [];
try {
  for (const level of ["l01", "l02"]) {
    const directory = path.resolve(".generated", level),
      server = await serveStatic(directory, 0),
      page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    let bytes = 0,
      requests = 0;
    const errors = [];
    page.on("response", (r) => {
      requests++;
      bytes += Number(r.headers()["content-length"] || 0);
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/favicon.ico", (r) => r.fulfill({ status: 204 }));
    try {
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      await page.evaluate(() => ArkGlidePlayer.start());
      await page.waitForFunction(
        () => document.body.dataset.state === "playing",
      );
      const f = page
        .frames()
        .find((f) => f.url().includes("runtime.html?boot="));
      const name = level === "l01" ? "foldlineL01" : "foldlineL02";
      await f.waitForFunction((n) => globalThis[n]?.snapshot().ready, name);
      const d = new InputDriver(page, f, { stateName: name });
      await d.lockPointer();
      async function sample(condition) {
        await page.waitForTimeout(1500);
        const before = await f.evaluate(() => ({
          frame: time.frameCount,
          at: performance.now(),
        }));
        await page.waitForTimeout(6000);
        const data = await f.evaluate((b) => {
          const meshes = scene.meshes.filter((m) => m.getTotalVertices() > 0),
            visible = meshes.filter((m) => m.isVisible && m.isEnabled());
          return {
            fps:
              ((time.frameCount - b.frame) * 1000) / (performance.now() - b.at),
            allocatedMeshes: meshes.length,
            visibleMeshes: visible.length,
            allocatedTriangles: meshes.reduce(
              (n, m) => n + m.getTotalIndices() / 3,
              0,
            ),
            visibleTriangles: visible.reduce(
              (n, m) => n + m.getTotalIndices() / 3,
              0,
            ),
            allocatedMaterials: scene.materials.length,
            visibleMaterials: new Set(visible.map((m) => m.material)).size,
            textures: scene.textures.length,
            lights: scene.lights.length,
            physics: physicsRuntime.stats(),
            visuals: visualsRuntime.stats(),
            portals: portalRuntime.stats(),
          };
        }, before);
        results.push({
          level,
          condition,
          ...data,
          httpBodyBytes: bytes,
          httpRequests: requests,
          errors: [...errors],
        });
      }
      await sample("entry");
      if (level === "l02") {
        await d.moveTo({ x: 30.6, z: 14 });
        await d.moveTo({ x: 28, z: 13.8 });
        await d.aimAt({ x: 28, y: 3.55, z: 18 });
        await d.waitFor(
          (s) => s.interactTarget === "Coupler",
          "visible through fold",
        );
        await sample("near-aperture");
      }
    } finally {
      await page.close();
      await new Promise((r) => server.close(r));
    }
  }
} finally {
  await browser.close();
}
async function size(dir) {
  let files = 0,
    bytes = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const s = await size(p);
      files += s.files;
      bytes += s.bytes;
    } else {
      files++;
      bytes += (await fs.stat(p)).size;
    }
  }
  return { files, bytes };
}
const buildSizes = Object.fromEntries(
  await Promise.all(
    ["l01", "l02"].map(async (l) => [l, await size(".generated/" + l)]),
  ),
);
await fs.writeFile(
  "docs/evidence/m2/performance.json",
  JSON.stringify(
    {
      method:
        "Sequential 1280x800 DPR1 Chromium ANGLE SwiftShader; 1.5s warm-up + 6s frame-count window; same engine and filters. Different spaces, not a same-scene speedup claim. HTTP body bytes from served response lengths; opaque iframe ResourceTiming is not used.",
      buildSizes,
      results,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    results.map(({ level, condition, fps, httpBodyBytes }) => ({
      level,
      condition,
      fps,
      httpBodyBytes,
    })),
    null,
    2,
  ),
);
