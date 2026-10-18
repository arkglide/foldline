import fs from "node:fs/promises";
import { Geometry, glb } from "./geometry.mjs";
const root = new URL("../../assets/art/l01/", import.meta.url);
// glTF baseColorFactor is linear; palette tokens are authored as sRGB.
const rgb = (hex) =>
  hex.match(/[a-f\d]{2}/gi).map((c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
export const PALETTE = {
  concrete: "#a7b5b1",
  wall: "#849a98",
  dark: "#263e42",
  metal: "#748b89",
  amber: "#c8a35f",
  signal: "#afd4bf",
  shell: "#476c6b",
  ceramic: "#c3c5ad",
  black: "#1b3034",
};
// All authoring coordinates remain in the accepted L01 world. New decoration
// is nonphysical. The original 74 native bodies are the collision contract.
export async function dressL01(project) {
  const groups = [],
    materials = [],
    images = [];
  function mat(name, color, roughness = 0.8, metallic = 0.12, extra = {}) {
    const index = materials.length;
    materials.push({
      name,
      pbrMetallicRoughness: {
        baseColorFactor: [...rgb(color), 1],
        roughnessFactor: roughness,
        metallicFactor: metallic,
        ...extra,
      },
    });
    const g = new Geometry();
    groups.push({ name, g, material: index });
    return g;
  }
  async function image(name, mime = "image/jpeg") {
    const index = images.length;
    images.push({ name, mime, data: await fs.readFile(new URL(name, root)) });
    return index;
  }
  const concreteColor = await image("concrete023-color.jpg");
  const metalColor = await image("metal032-color.jpg"),
    metalNormal = await image("metal032-normal-gl.jpg");
  const signs = await image("signage.png", "image/png");
  const concrete = mat("salt-worn concrete", "#879b98", 0.94, 0, {
    baseColorTexture: { index: concreteColor },
  });
  const brushed = mat("service steel", "#879e9b", 0.6, 0.22, {
    baseColorTexture: { index: metalColor },
  });
  materials.at(-1).normalTexture = { index: metalNormal, scale: 0.28 };
  const dark = mat("folded graphite frame", PALETTE.dark, 0.78, 0.12);
  const shell = mat("damp resistant teal enamel", PALETTE.shell, 0.78, 0.08);
  const amber = mat("muted brass / safety paint", PALETTE.amber, 0.78, 0.1);
  const ceramic = mat("patched ceramic / salt bloom", PALETTE.ceramic, 0.96, 0);
  const glow = mat("worklight diffuser", "#ccd5b9", 0.7, 0);
  materials.at(-1).emissiveFactor = [0.38, 0.43, 0.32];
  const sign = mat("maintenance typography", "#ffffff", 1, 0, {
    baseColorTexture: { index: signs },
  });
  materials.at(-1).emissiveFactor = [0.13, 0.16, 0.15];
  function panel(g, p, size, axis = "z", uv = null) {
    const [x, y, z] = p,
      [w, h] = size,
      sideX = axis === "x" || axis === "east";
    const points =
      axis === "z"
        ? [
            [x - w / 2, y - h / 2, z],
            [x + w / 2, y - h / 2, z],
            [x + w / 2, y + h / 2, z],
            [x - w / 2, y + h / 2, z],
          ]
        : sideX
          ? [
              [x, y - h / 2, z + w / 2],
              [x, y - h / 2, z - w / 2],
              [x, y + h / 2, z - w / 2],
              [x, y + h / 2, z + w / 2],
            ]
          : [
              [x - w / 2, y, z + h / 2],
              [x + w / 2, y, z + h / 2],
              [x + w / 2, y, z - h / 2],
              [x - w / 2, y, z - h / 2],
            ];
    g.quad(
      points,
      axis === "z"
        ? [0, 0, -1]
        : axis === "x"
          ? [-1, 0, 0]
          : axis === "east"
            ? [1, 0, 0]
            : [0, 1, 0],
      uv || [
        [0, 0],
        [w / 2, 0],
        [w / 2, h / 2],
        [0, h / 2],
      ],
    );
    // Surface panels are visible from their inside-facing side only.
    const start = g.indices.length - 6;
    for (
      let i = start;
      axis !== "y" && axis !== "east" && i < g.indices.length;
      i += 3
    )
      [g.indices[i + 1], g.indices[i + 2]] = [
        g.indices[i + 2],
        g.indices[i + 1],
      ];
  }
  // Correctly scaled planar UVs avoid stretched box textures on long floors.
  for (let x = 8; x < 24; x += 1)
    for (let z = 0; z < 14.4; z += 1.2)
      panel(concrete, [x + 0.5, 0.006, z + 0.6], [1, 1.2], "y", [
        [x / 2, (z + 1.2) / 2],
        [(x + 1) / 2, (z + 1.2) / 2],
        [(x + 1) / 2, z / 2],
        [x / 2, z / 2],
      ]);
  panel(concrete, [16, 3.6, 14.385], [16, 7.2]);
  panel(concrete, [23.987, 4.5, 4.1], [8.2, 5.4], "x");
  // West wall has opposite normal; use double-sided only for this shared skin.
  panel(concrete, [8.012, 3.6, 7.1], [14.4, 7.2], "x");
  materials[0].doubleSided = true;
  panel(concrete, [22.12, 2.407, 11.1], [3.74, 6.16], "y");
  materials[1].doubleSided = true;
  // Steel frame and a service roof with filtered light strips; no clutter in the exit sightline.
  for (const z of [1.1, 7.0, 13.9]) {
    dark.box([16, 6.95, z], [16, 0.24, 0.22]);
    brushed.box([16, 7.08, z], [16, 0.06, 0.36]);
    for (const x of [8.23, 23.78]) {
      dark.box([x, 3.45, z], [0.22, 6.9, 0.24]);
      brushed.box([x, 1.25, z], [0.32, 0.12, 0.36]);
    }
  }
  for (const x of [8.6, 11.2, 19.9, 23.4])
    dark.box([x, 7.25, 7.1], [0.16, 0.18, 14.5]);
  // High strips suggest filtered daylight, not a pure-white laboratory ceiling.
  dark.box([16, 7.38, 7.1], [16.4, 0.12, 14.7]);
  for (const z of [2, 7, 12]) {
    glow.box([15.4, 7.29, z], [5.5, 0.03, 0.55]);
    brushed.box([15.4, 7.25, z - 0.35], [5.8, 0.1, 0.08]);
    brushed.box([15.4, 7.25, z + 0.35], [5.8, 0.1, 0.08]);
  }
  // Expansion joints, drains and modest salt tide marks at wall/floor edges.
  for (const x of [10, 13, 16, 19, 22])
    dark.box([x, 0.013, 7.1], [0.022, 0.012, 14.25]);
  for (const z of [2, 5, 8, 11, 14])
    dark.box([16, 0.014, z], [15.9, 0.012, 0.024]);
  for (const x of [8.35, 23.65]) {
    dark.box([x, 0.02, 7.1], [0.18, 0.025, 14.1]);
    for (let z = 0.25; z < 14.2; z += 0.32)
      brushed.box([x, 0.036, z], [0.18, 0.018, 0.035]);
  }
  for (const z of [14.32, 0.01]) {
    shell.box([16, 0.45, z], [16, 0.9, 0.06]);
    brushed.box([16, 0.94, z], [16, 0.04, 0.08]);
  }
  // Pump skids are modular service machinery, with flush access cassettes,
  // flange collars, expansion joints and a low silhouette preserving O1.
  for (const [z, depth] of [
    [6.25, 3.9],
    [12.1, 3.2],
  ]) {
    brushed.box([17, 0.12, z], [5.95, 0.24, depth + 0.15]);
    for (let x = 14.55; x < 19.7; x += 1.05) {
      shell.box([x, 1.1, z - depth / 2 - 0.13], [0.94, 1.45, 0.05]);
      brushed.box([x, 1.84, z - depth / 2 - 0.17], [0.94, 0.05, 0.06]);
      for (const dx of [-0.35, 0.35])
        for (const y of [0.53, 1.65])
          brushed.pipe(
            [x + dx, y, z - depth / 2 - 0.16],
            [x + dx, y, z - depth / 2 - 0.18],
            0.035,
            6,
          );
      for (let n = 0; n < 5; n++)
        dark.box(
          [x, 1.05 + n * 0.105, z - depth / 2 - 0.18],
          [0.65, 0.025, 0.035],
        );
    }
    for (const x of [14.7, 18.9]) {
      brushed.pipe(
        [x, 1.98, z - depth * 0.32],
        [x, 1.98, z + depth * 0.32],
        0.19,
      );
      for (const dz of [-depth * 0.28, depth * 0.28]) {
        dark.pipe([x, 1.98, z + dz - 0.04], [x, 1.98, z + dz + 0.04], 0.25);
        amber.pipe([x, 1.98, z + dz + 0.041], [x, 1.98, z + dz + 0.065], 0.22);
      }
    }
    // The entry sees the western end of both skids; give that actual visible
    // face layered cassettes, louvre gaps and readable fasteners as well.
    shell.box([14.055, 1.05, z], [0.065, 1.62, depth - 0.16]);
    brushed.box([14.006, 0.25, z], [0.045, 0.1, depth - 0.12]);
    brushed.box([14.006, 1.84, z], [0.045, 0.08, depth - 0.12]);
    for (let dz = -depth / 2 + 0.32; dz < depth / 2; dz += 0.62) {
      dark.box([14.006, 1.03, z + dz], [0.035, 1.32, 0.035]);
      for (const y of [0.55, 1.56])
        brushed.pipe(
          [13.98, y, z + dz + 0.16],
          [13.95, y, z + dz + 0.16],
          0.035,
          8,
        );
    }
    for (let n = 0; n < 6; n++)
      dark.box([13.997, 0.72 + n * 0.12, z - 0.75], [0.03, 0.035, 0.78]);
    signPanel([13.985, 1.48, z + 0.5], [1.25, 0.32], "x", [0.5, 0.5, 1, 0.7]);
    // Repairs have a different paint epoch, but do not create false handles.
    ceramic.box([18.95, 1.22, z - depth / 2 - 0.185], [0.55, 0.62, 0.025]);
    signPanel(
      [17.2, 1.5, z - depth / 2 - 0.205],
      [1.7, 0.42],
      "z",
      [0.5, 0.5, 1, 0.7],
    );
  }
  // West service panel: a mechanical assembly around, never over, the wheel.
  brushed.box([13.67, 1.04, 8.02], [0.18, 1.8, 0.85]);
  dark.pipe([13.45, 0.45, 8], [13.45, 1.6, 8], 0.1);
  amber.pipe([13.5, 1.55, 8], [13.5, 1.55, 9.65], 0.065);
  for (const z of [8.35, 8.75, 9.15, 9.55])
    brushed.box([13.51, 1.55, z], [0.25, 0.2, 0.065]);
  // Calibration ribs stay wholly outside the native 2.2 x 2.8 aperture.
  function anchor(x, y, z, axis, uv) {
    const pos = (u, v, d) =>
      axis === "z" ? [x + u, y + v, z + d] : [x + d, y + v, z + u];
    const size = (u, v, d) => (axis === "z" ? [u, v, d] : [d, v, u]);
    for (const u of [-1.25, 1.25]) {
      dark.box(pos(u, 0, 0), size(0.19, 3.15, 0.22));
      brushed.box(pos(u, 0, -0.13), size(0.07, 3.05, 0.06));
      for (let v = -1.2; v < 1.4; v += 0.3)
        amber.box(pos(u, v, -0.17), size(0.12, 0.025, 0.025));
    }
    dark.box(pos(0, 1.55, 0), size(2.7, 0.24, 0.24));
    brushed.box(pos(0, -1.4, -0.08), size(2.65, 0.025, 0.28));
    for (const u of [-1.5, 1.5])
      for (const v of [-1.05, 1.05]) {
        shell.box(pos(u, v, 0.04), size(0.28, 0.3, 0.18));
        amber.box(pos(u, v, -0.065), size(0.18, 0.025, 0.025));
      }
    signPanel(pos(0, 1.57, -0.14), [1.55, 0.27], axis, uv);
  }
  anchor(11, 1.4, 9.7, "z", [0, 0.25, 0.5, 0.46]);
  anchor(23.88, 3.8, 10, "x", [0.5, 0.25, 1, 0.46]);
  signPanel([13.12, 3.8, 10.1], [0.48, 0.36], "east", [0, 0.25, 0.14, 0.46]);
  for (let x = 9.15; x < 13; x += 0.3)
    dark.box([x, 3.78, 9.805], [0.16, 0.24, 0.025]);
  // Stair guides/counterweight tower make the existing lifting gate credible.
  for (const x of [20.2, 24]) {
    dark.box([x, 2.65, 2.78], [0.14, 5.3, 0.44]);
    brushed.box([x, 2.65, 2.5], [0.06, 5.3, 0.065]);
  }
  dark.box([23.5, 3.0, 3.04], [0.82, 5.6, 0.09]);
  for (const x of [23.14, 23.86]) brushed.box([x, 3.0, 2.77], [0.06, 5.6, 0.1]);
  brushed.pipe([21, 4.4, 2.75], [23.6, 4.4, 2.75], 0.11);
  for (const x of [21, 23.5]) {
    dark.pipe([x, 4.4, 2.65], [x, 4.4, 2.93], 0.25);
    amber.pipe([x, 4.4, 2.62], [x, 4.4, 2.66], 0.18);
  }
  brushed.pipe([19.92, 1.5, 3.2], [19.92, 3.74, 8], 0.045, 8);
  // Additional rail infill only below the existing top rail, leaving lookback open.
  brushed.box([20.08, 3.0, 11.1], [0.06, 0.035, 6.1]);
  for (let z = 8.5; z < 14; z += 0.35)
    dark.box([20.08, 2.74, z], [0.035, 0.36, 0.035]);
  // Wall service trays and grounded repairs, peripheral to the puzzle route.
  for (const y of [4.8, 5.05]) {
    dark.pipe([8.25, y, 0.2], [8.25, y, 14], 0.1);
    brushed.pipe([8.25, y, 10.6], [12.7, y, 10.6], 0.1);
  }
  for (const z of [1, 4, 7, 10, 13])
    brushed.box([8.3, 4.9, z], [0.28, 0.65, 0.1]);
  for (const z of [2.0, 12.7]) {
    dark.box([8.12, 2.1, z], [0.12, 1.35, 0.68]);
    ceramic.box([8.2, 2.1, z], [0.04, 1.1, 0.52]);
  }
  // Light fixtures are a small number of emissive diffusers, no bloom particles.
  for (const [x, y, z, axis] of [
    [13.1, 2.45, 7.8, "z"],
    [23.72, 5.55, 13, "x"],
    [11, 4.38, 10, "z"],
    [22.3, 6.5, 10, "z"],
  ]) {
    const s = axis === "x" ? [0.22, 0.16, 1.5] : [1.5, 0.16, 0.22];
    dark.box([x, y, z], s);
    glow.box(
      [x, y - 0.05, z - 0.02],
      s.map((v, i) => (i === 1 ? 0.06 : v * 0.86)),
    );
  }
  // Printed identifiers repeat architectural landmarks from low and high views.
  function signPanel(p, s, axis, rect) {
    const [u0, v0, u1, v1] = rect;
    panel(sign, p, s, axis, [
      [u0, v1],
      [u1, v1],
      [u1, v0],
      [u0, v0],
    ]);
  }
  signPanel([16.5, 5.2, 14.3], [5.4, 0.64], "z", [0, 0, 1, 0.235]);
  signPanel([22.1, 4.45, 2.48], [2.2, 0.45], "z", [0, 0.5, 0.5, 0.7]);
  signPanel([23.7, 5.04, 13], [1.65, 0.36], "x", [0.5, 0.75, 1, 0.97]);
  signPanel([13.79, 2.35, 9.35], [1.5, 0.45], "x", [0, 0.75, 0.5, 0.97]);

  // Bake old purely decorative boxes into the shared art mesh. Required moving
  // aliases, ray targets and all native colliders retain their original IDs.
  const keep = new Set([
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
  ]);
  project.scene.nodes = project.scene.nodes.filter((n) => {
    if (n.type !== "mesh" || n.physics || keep.has(n.id)) return true;
    const g =
      n.color === "#e3bd71" ? amber : n.color === "#a8e0cf" ? glow : brushed;
    g.box(
      [n.transform.x, n.transform.y, n.transform.z],
      [n.scale.x, n.scale.y, n.scale.z],
    );
    return false;
  });
  const defs = {};
  for (const [id, color] of Object.entries(PALETTE))
    defs[id] = {
      id,
      name: id,
      baseColor: color,
      emissiveColor: "#000000",
      metallic: id === "metal" ? 0.18 : 0,
      roughness: 0.85,
      alpha: 1,
      doubleSided: false,
      uvScale: { u: 1, v: 1 },
    };
  const gateData = await fs.readFile(new URL("gate.png", root));
  defs.gate = {
    ...defs.shell,
    id: "gate",
    name: "Existing isolated gate",
    albedoTextureId: "l01-gate",
    baseColor: "#ffffff",
  };
  for (const n of project.scene.nodes)
    if (n.type === "mesh") {
      n.materialId = /Boundary|East|Pier|Lintel|Wall|Vestibule/.test(n.id)
        ? "wall"
        : /Floor|Stair\d/.test(n.id)
          ? "concrete"
          : /Host|Blind/.test(n.id)
            ? "shell"
            : /Equipment|Crown|Header|Post|Shutter/.test(n.id)
              ? "dark"
              : /Handle|Latch|Spoke|Cable/.test(n.id)
                ? "amber"
                : "metal";
      if (n.id === "StairGate") n.materialId = "gate";
      // Plain white doors lose the maintenance identity; warm ceramic keeps the
      // original observation ray/door body visible under the worklight.
      if (n.id === "ExitDoor") n.materialId = "ceramic";
    }
  project.scene.nodes.push({
    id: "L01IndustrialDress",
    name: "L01 coastal industrial fabric",
    type: "model",
    modelUrl: "l01-industrial.glb",
    transform: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    scripts: [],
  });
  const materialGroups = {};
  for (const n of project.scene.nodes)
    if (n.type === "mesh") {
      const style = n.materialId;
      (materialGroups[style] ??= []).push(n.id);
      n.color = defs[style].baseColor;
      delete n.materialId;
    }
  project.scripts["l01-art.js"] = await fs.readFile(
    new URL("../l01-art.js", import.meta.url),
    "utf8",
  );
  project.scripts["data/l01-art.js"] =
    "export default " +
    JSON.stringify({
      palette: { ...PALETTE, gate: "#ffffff" },
      groups: materialGroups,
    }) +
    ";";
  project.content.materials = {};
  project.content.textures = [
    {
      id: "l01-gate",
      name: "Original isolated gate stencil",
      mime: "image/png",
      byteLength: gateData.length,
    },
    {
      id: "zanque-service-metal",
      name: "ambientCG Metal032 / compact terminal",
      mime: "image/jpeg",
      byteLength: images[metalColor].data.length,
    },
  ];
  project.modelRefs = [
    { assetId: "L01IndustrialDress", fileName: "l01-industrial.glb" },
  ];
  project.name = "折径 / 侧向通行 · L01视觉样板";
  project.settings.build.title = "折径 · 侧向通行 / M1-R3";
  project.settings.ambientIntensity = 0.58;
  project.settings.ambientColor = "#b9ccc8";
  project.settings.backgroundColor = "#243a40";
  const lights = project.scene.nodes.filter((n) => n.type === "light");
  lights[0].transform = { x: 13.1, y: 3.2, z: 7.5 };
  lights[0].intensity = 0.3;
  lights[0].color = "#efc98e";
  lights[1].transform = { x: 22.2, y: 5.8, z: 12 };
  lights[1].intensity = 0.33;
  lights[1].color = "#b8d9d1";

  project.content.gameplay.hud.find((h) => h.id === "stage").text =
    "C01-L01 · M1-R3 · 视觉样板待审";
  // Bake restrained local light and contact darkening into static vertex
  // colours. This is an authored lighting approximation, not GI or dynamic
  // shadows. Only the small brushed-steel batch keeps live PBR/normal shading.
  for (const group of groups) {
    if (group.g === brushed) continue;
    materials[group.material].extensions = { KHR_materials_unlit: {} };
    group.g.colors = [];
    for (let i = 0; i < group.g.positions.length; i += 3) {
      const [x, y, z] = group.g.positions.slice(i, i + 3),
        [nx, ny, nz] = group.g.normals.slice(i, i + 3);
      const key = Math.max(0, ny * 0.65 - nx * 0.3 - nz * 0.25);
      const warm =
        0.55 *
        Math.exp(-((x - 13.1) ** 2 + (y - 2.4) ** 2 + (z - 7.8) ** 2) / 8);
      const cool =
        0.45 * Math.exp(-((x - 23.7) ** 2 + (y - 5) ** 2 + (z - 13) ** 2) / 13);
      const edge = Math.min(x - 8, 24 - x, z, 14.4 - z);
      const contact =
        y < 0.2 ? 0.75 + 0.25 * Math.min(1, Math.max(0, edge)) : 1;
      const skidDistance = Math.min(
        Math.hypot(
          Math.max(14.1 - x, 0, x - 19.9),
          Math.max(4.3 - z, 0, z - 8.2),
        ),
        Math.hypot(
          Math.max(14.1 - x, 0, x - 19.9),
          Math.max(10.5 - z, 0, z - 13.7),
        ),
      );
      const footShade =
        y < 0.2 ? 0.62 + 0.38 * Math.min(1, skidDistance / 0.85) : 1;
      const base = (0.48 + key * 0.35) * contact * footShade;
      group.g.colors.push(
        Math.min(1, base + warm * 0.7 + cool * 0.35),
        Math.min(1, base + warm * 0.52 + cool * 0.5),
        Math.min(1, base + warm * 0.3 + cool * 0.55),
        1,
      );
    }
  }
  return {
    project,
    models: new Map([["L01IndustrialDress", glb(groups, materials, images)]]),
    textures: new Map([
      ["l01-gate", gateData],
      ["zanque-service-metal", images[metalColor].data],
    ]),
    metrics: {
      artBatches: groups.length,
      artTriangles: groups.reduce((s, g) => s + g.g.indices.length / 3, 0),
      embeddedImages: images.length,
    },
  };
}
