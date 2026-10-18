import test from "node:test";
import assert from "node:assert/strict";
import { l02Project } from "../game/l02-project.mjs";
import { validateDialogue } from "../game/dialogue.js";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

test("L02 packages one native dynamic coupler, real partition and bounded art; no adjacent scenes or persistent tutorial HUD", async () => {
  const art = await l02Project(),
    p = art.project,
    nodes = p.scene.nodes;
  assert.deepEqual(
    nodes.filter((n) => n.physics?.motion === "dynamic").map((n) => n.id),
    ["Coupler"],
  );
  assert.equal(
    nodes.find((n) => n.id === "ObservationGlass").physics.sensor,
    false,
  );
  assert.equal(nodes.find((n) => n.id === "Coupler").physics.mass, 8);
  assert.ok(!p.scripts["l01.js"]);
  assert.ok(!p.scripts["data/l01-dialogue.js"]);
  assert.deepEqual(
    nodes.filter((n) => n.scripts.length).map((n) => n.scripts),
    [["l02.js"]],
  );
  assert.equal(p.projectId, "foldline-c01-l01-m1");
  assert.ok(
    !p.content.gameplay.hud.some((h) => ["stage", "controls"].includes(h.id)),
  );
  const raw = art.models.get("L02IndustrialDress"),
    gltf = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)));
  assert.equal(gltf.meshes.length, 8);
  assert.ok(art.metrics.artTriangles < 1800);
  assert.ok(raw.length < 550000);
  assert.ok(gltf.images.every((i) => i.bufferView !== undefined && !i.uri));
  assert.ok(
    gltf.accessors
      .filter((a) => a.type === "VEC3")
      .every(
        (a) => a.min.every(Number.isFinite) && a.max.every(Number.isFinite),
      ),
  );
  const data = JSON.parse(
    await fs.readFile(
      new URL("../game/data/l02-dialogue.json", import.meta.url),
    ),
  );
  validateDialogue(data);
  assert.equal(data.lines.length, 7);
  assert.ok(
    data.lines.every(
      (l) =>
        l.id.startsWith("C01-L02-") && l.file.startsWith("assets/voice/l02/"),
    ),
  );
});

test("L02 material reuse and original signage match the documented source checksums", async () => {
  const manifest = JSON.parse(
    await fs.readFile(
      new URL("../assets/art/l02/manifest.json", import.meta.url),
    ),
  );
  for (const asset of manifest.files) {
    const raw = await fs.readFile(
      new URL("../assets/art/l02/" + asset.file, import.meta.url),
    );
    assert.equal(raw.length, asset.bytes);
    assert.equal(createHash("sha256").update(raw).digest("hex"), asset.sha256);
    assert.ok(asset.source && asset.author && asset.license);
  }
});
