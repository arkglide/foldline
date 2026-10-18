import test from "node:test";
import assert from "node:assert/strict";
import { l01Project } from "../game/project.mjs";
import { dressL01 } from "../game/art/l01-visuals.mjs";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

test("L01 art preserves every accepted native collider, player and moving interaction target", async () => {
  const original = await l01Project(),
    before = structuredClone(original);
  const { project } = await dressL01(original);
  const bodies = (p) =>
    p.scene.nodes
      .filter((n) => n.physics || n.character)
      .map(({ id, physics, character, transform, rotation, scale }) => ({
        id,
        physics,
        character,
        transform,
        rotation,
        scale,
      }));
  assert.deepEqual(bodies(project), bodies(before));
  assert.equal(project.projectId, before.projectId);
  assert.equal(project.scene.nodes.filter((n) => n.physics).length, 74);
  for (const id of [
    "WheelHub",
    "WheelSpokeA",
    "WheelSpokeB",
    "BlindGrip",
    "GaugeNeedle",
    "LatchStem",
    "ReturnCounterweight",
    "ExitRackRailA",
    "ExitRackRailB",
    "ExitRackBraceA",
    "ExitRackBraceB",
    "ExitCrown",
    "A1CabinetCrown",
  ])
    assert.ok(
      project.scene.nodes.some((n) => n.id === id),
      `stable native alias/visual target ${id}`,
    );
  assert.equal(project.scene.nodes.filter((n) => n.type === "model").length, 1);
});

test("L01 art packs a bounded self-contained glTF without adding runtime network dependencies", async () => {
  const art = await dressL01(await l01Project()),
    raw = art.models.get("L01IndustrialDress");
  const json = JSON.parse(raw.subarray(20, 20 + raw.readUInt32LE(12)));
  assert.equal(json.asset.version, "2.0");
  assert.ok(raw.length < 900000);
  assert.equal(json.meshes.length, 8);
  assert.ok(art.metrics.artTriangles < 8000);
  assert.equal(json.images.length, 4);
  assert.ok(json.images.every((i) => Number.isInteger(i.bufferView) && !i.uri));
  assert.ok(json.buffers.every((b) => !b.uri));
  assert.ok(
    json.accessors
      .filter((a) => a.type === "VEC3")
      .every(
        (a) => a.min.every(Number.isFinite) && a.max.every(Number.isFinite),
      ),
  );
  // Reflect X before the native glTF import conversion, rather than reposition
  // the player's world or applying a negative-scale scene physics workaround.
  assert.ok(json.accessors[0].max[0] <= -8);
});

test("downloaded art and authored signage match their recorded provenance checksums", async () => {
  const manifest = JSON.parse(
    await fs.readFile(
      new URL("../assets/art/l01/manifest.json", import.meta.url),
    ),
  );
  for (const asset of manifest.files) {
    const raw = await fs.readFile(
      new URL("../assets/art/l01/" + asset.file, import.meta.url),
    );
    assert.equal(
      createHash("sha256").update(raw).digest("hex"),
      asset.sha256,
      asset.file,
    );
    assert.equal(raw.length, asset.bytes);
    assert.ok(asset.author && asset.license && asset.source);
  }
});
