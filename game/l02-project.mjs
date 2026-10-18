import fs from "node:fs/promises";
import { l01Project } from "./project.mjs";
import { Geometry, glb } from "./art/geometry.mjs";

/** One independently bootable L02. Shared input/HUD/mixer contract only; no L01 scene is exported. */
export async function l02Project() {
  const project = await l01Project(),
    nodes = [],
    batches = new Map();
  const palette = {
    concrete: "#9aada7",
    wall: "#6c8888",
    dark: "#263e42",
    steel: "#798e8c",
    amber: "#c8a35f",
    glow: "#afd4bf",
    ceramic: "#c3c5ad",
  };
  const groups = Object.keys(palette).map((style, material) => {
    const g = new Geometry();
    batches.set(style, g);
    return { name: style, material, g };
  });
  const identity = { x: 0, y: 0, z: 0 };
  function box(
    id,
    p,
    s,
    style = "steel",
    {
      collision = true,
      motion = "static",
      dynamic = false,
      glass = false,
    } = {},
  ) {
    const n = {
      id,
      name: id,
      type: "mesh",
      primitive: "box",
      transform: { x: p[0], y: p[1], z: p[2] },
      rotation: { ...identity },
      scale: { x: s[0], y: s[1], z: s[2] },
      visible: true,
      scripts: [],
      color: palette[style],
    };
    if (collision)
      n.physics = {
        motion,
        shape: "box",
        size: { x: 1, y: 1, z: 1 },
        mass: 8,
        friction: 0.65,
        restitution: 0,
        sensor: false,
        lockRotation: false,
      };
    if (dynamic || glass) {
      n.l02style = glass ? "glass" : style;
      nodes.push(n);
    } else {
      batches.get(style).box(p, s);
      if (collision) {
        n.visible = false;
        nodes.push(n);
      }
    }
    return n;
  }
  box("WorkFloor", [28, 2.2, 16.6], [8.4, 0.4, 15.6], "concrete");
  box("PartsFloor", [36, 2.2, 19], [8, 0.4, 10], "concrete");
  box("WestWall", [23.8, 4.6, 16.5], [0.4, 4.8, 16], "wall");
  box("SouthWall", [28, 4.6, 8.8], [8.4, 4.8, 0.4], "wall");
  box("EastWall", [40.2, 4.6, 19], [0.4, 4.8, 10.4], "wall");
  box("PartsSouthWall", [36, 4.6, 13.8], [8, 4.8, 0.4], "wall");
  box("Roof", [32, 7, 16.5], [16.8, 0.4, 15.8], "dark");
  box("NorthWallLeft", [25.4, 4.6, 24.2], [3.2, 4.8, 0.4], "wall");
  box("NorthWallRight", [35.4, 4.6, 24.2], [10, 4.8, 0.4], "wall");
  box("ExitLintel", [28.7, 6, 24.2], [3.4, 2, 0.4], "wall");
  box("ExitDoor", [28.7, 3.8, 24.15], [3, 2.8, 0.22], "ceramic", {
    motion: "kinematic",
    dynamic: true,
  });
  box("ExitFloor", [28.7, 2.2, 25.1], [3.4, 0.4, 1.8], "concrete");
  box("ExitStop", [28.7, 4.1, 26], [3.4, 3.4, 0.3], "wall");
  for (const x of [27, 30.4])
    box("ExitCheek" + x, [x, 4.1, 25.1], [0.2, 3.4, 1.8], "wall");
  box("ExitRoof", [28.7, 5.9, 25.1], [3.4, 0.2, 2], "dark");
  // Continuous partition with an actual solid observation pane. Upper/lower
  // panels and mullions make its physical role readable, not an invisible wall.
  box("PartitionLower", [32, 2.88, 19], [0.22, 0.96, 10], "dark");
  box("PartitionUpper", [32, 6.1, 19], [0.22, 1.8, 10], "wall");
  box("PartitionSouth", [32, 4.3, 14.9], [0.22, 2, 1.8], "wall");
  box("PartitionNorth", [32, 4.3, 22.65], [0.22, 2, 2.7], "wall");
  box("ObservationGlass", [32, 4.25, 18.55], [0.12, 1.8, 5.5], "steel", {
    glass: true,
  });
  for (const z of [15.8, 21.3])
    box("WindowJamb" + z, [31.86, 4.25, z], [0.26, 2.1, 0.09], "steel");
  for (const y of [3.35, 4.7, 5.2])
    box("WindowStripe" + y, [31.82, y, 18.55], [0.05, 0.04, 5.5], "ceramic", {
      collision: false,
    });
  // Two service cabinets, not open man-sized passages. Faces are native portal surfaces.
  box("A2Host", [28, 3.7, 16.15], [3.2, 2.6, 0.3], "wall", { dynamic: true });
  box("B2Host", [34.85, 3.55, 19], [0.3, 1.5, 1.1], "wall", { dynamic: true });
  for (const id of ["A2", "B2"]) {
    const a = id === "A2";
    for (const side of [-1, 1]) {
      box(
        id + "Vertical" + side,
        a ? [28 + side * 0.49, 3.55, 15.94] : [35.06, 3.55, 19 + side * 0.49],
        a ? [0.12, 1.12, 0.12] : [0.12, 1.12, 0.12],
        "amber",
        { collision: false },
      );
      box(
        id + "Horizontal" + side,
        a ? [28, 3.55 + side * 0.55, 15.94] : [35.06, 3.55 + side * 0.55, 19],
        a ? [1.12, 0.12, 0.12] : [0.12, 0.12, 1.12],
        "steel",
        { collision: false },
      );
    }
  }
  box("A2CatchTray", [28, 3.03, 15.5], [1.25, 0.12, 1.0], "steel");
  box("PartsTray", [37.05, 3.27, 19], [2, 0.2, 1.45], "steel");
  for (const z of [18.23, 19.77])
    box("PartsTrayLip" + z, [37.1, 3.46, z], [2, 0.18, 0.1], "dark");
  for (const x of [36.3, 37.8])
    box("PartsTrayLeg" + x, [x, 2.8, 19], [0.12, 0.85, 1.4], "dark");
  box("Coupler", [37, 3.55, 19], [0.48, 0.36, 0.55], "amber", {
    motion: "dynamic",
    dynamic: true,
  });
  // Low drop-catching floor in the isolated bay leaves every dropped object in
  // reach of the fold. A broad backstop prevents throwing it behind shelving.
  box("PartsBackstop", [38.25, 3.55, 19], [0.18, 2.3, 3], "dark");
  box("DockPedestal", [27, 2.59, 20], [1.3, 0.38, 1.6], "dark");
  box("DockDeck", [27, 2.82, 20], [1.3, 0.08, 1.6], "steel");
  for (const x of [26.32, 27.68])
    box("DockCheek" + x, [x, 2.98, 20], [0.08, 0.25, 1.6], "amber");
  box("DockPawl", [27, 2.95, 20.55], [0.45, 0.18, 0.15], "amber", {
    collision: false,
    dynamic: true,
  });
  box("DockLamp", [26.42, 3.13, 20], [0.1, 0.12, 0.65], "amber", {
    collision: false,
    dynamic: true,
  });
  for (const x of [26.5, 27.5])
    box("DockJaw" + x, [x, 3, 20.45], [0.09, 0.3, 0.25], "steel", {
      collision: false,
    });
  // Mother bus physically runs from latch through a local relay to the exit.
  for (const [p, s] of [
    [
      [24.2, 3, 20],
      [0.09, 0.09, 7.5],
    ],
    [
      [25.55, 2.47, 20],
      [2.7, 0.08, 0.08],
    ],
    [
      [26.1, 5.5, 23.8],
      [3.8, 0.1, 0.1],
    ],
    [
      [24.2, 4.2, 23.8],
      [0.1, 2.6, 0.1],
    ],
  ])
    box("Bus" + nodes.length, p, s, "amber", { collision: false });
  box("IsolationRelay", [24.15, 4.2, 22], [0.2, 1.2, 1], "dark");
  box("RelayLamp", [24.02, 4.3, 22], [0.06, 0.18, 0.45], "amber", {
    collision: false,
    dynamic: true,
  });
  // Functional surrounding details, bounded to seven static art batches.
  for (const z of [10, 14, 18, 22]) {
    box("WestRib" + z, [24.06, 4.6, z], [0.18, 4.4, 0.2], "dark", {
      collision: false,
    });
    box("RoofBeam" + z, [28, 6.65, z], [8, 0.25, 0.22], "steel", {
      collision: false,
    });
  }
  for (const x of [33, 34, 35, 36, 37, 38, 39])
    box("StockRib" + x, [x, 2.45, 22.7], [0.06, 0.08, 2], "steel", {
      collision: false,
    });
  for (const y of [5.7, 5.95])
    batches.get("steel").pipe([24.2, y, 9.2], [24.2, y, 23.7], 0.065, 8);
  for (const z of [10.7, 22.5]) {
    box("LightHousing" + z, [28, 6.5, z], [2.4, 0.18, 0.34], "dark", {
      collision: false,
    });
    box("LightDiffuser" + z, [28, 6.38, z], [2.2, 0.05, 0.24], "glow", {
      collision: false,
    });
  }
  // Genuine glazed high-side light well: recessed reveal, diffuser, mullions.
  box("ClerestoryReveal", [39.8, 6.1, 19], [0.35, 1.15, 6.5], "dark", {
    collision: false,
  });
  box("DaylightGlass", [39.6, 6.1, 19], [0.05, 0.95, 6], "glow", {
    collision: false,
  });
  for (const z of [16.4, 17.7, 19, 20.3, 21.6])
    box("DaylightMullion" + z, [39.5, 6.1, z], [0.12, 1.05, 0.09], "steel", {
      collision: false,
    });
  box("ExitCrown", [28.7, 5.35, 23.92], [2.7, 0.12, 0.12], "glow", {
    collision: false,
  });
  // Paint and stamped components reinforce the shared docking geometry.
  for (const z of [19.62, 20.38])
    box("DockContact" + z, [27, 2.866, z], [0.75, 0.012, 0.055], "amber", {
      collision: false,
    });
  for (let i = 0; i < 5; i++)
    box(
      "TrayScale" + i,
      [27.58 + i * 0.2, 3.097, 15.05],
      [0.06, 0.012, 0.18],
      "amber",
      { collision: false },
    );
  for (const [id, x, y, z, color, intensity] of [
    ["WorkLight", 28, 5.9, 13, "#e6c99d", 0.35],
    ["StockLight", 37, 5, 19, "#d6cfb1", 0.32],
    ["WellFill", 38, 6, 19, "#a9cbd5", 0.26],
  ])
    nodes.push({
      id,
      name: id,
      type: "light",
      lightType: "point",
      color,
      intensity,
      transform: { x, y, z },
      rotation: { ...identity },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      scripts: [],
    });
  nodes.push({
    id: "Player",
    name: "Player",
    type: "empty",
    transform: { x: 30, y: 3.32, z: 15 },
    rotation: { ...identity },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    scripts: ["l02.js"],
    character: {
      radius: 0.3,
      height: 1.8,
      mass: 70,
      stepHeight: 0.25,
      maxSlope: 45,
      speed: 3.5,
      jumpSpeed: 4,
      movementMode: "inertial",
      groundAcceleration: 40,
      airAcceleration: 6,
      groundFriction: 10,
    },
  });
  // Panel joints, low service ducts and stocking sockets stay visual-only.
  for (const z of [10, 12, 14, 16, 18, 20, 22, 24]) {
    box("PanelSeam" + z, [24.012, 4.7, z], [0.025, 3.8, 0.025], "dark", {
      collision: false,
    });
    box("SaltFoot" + z, [24.025, 2.67, z], [0.035, 0.24, 1.55], "ceramic", {
      collision: false,
    });
  }
  for (const x of [33.2, 34.8, 36.4, 38]) {
    box("StockSocket" + x, [x, 2.55, 22.6], [1.2, 0.12, 0.75], "dark", {
      collision: false,
    });
    box("StockStrip" + x, [x, 2.62, 22.22], [0.8, 0.012, 0.05], "amber", {
      collision: false,
    });
  }
  for (const z of [17.5, 20.5]) {
    box("BayFrame" + z, [39.7, 4.3, z], [0.25, 3.8, 0.22], "dark", {
      collision: false,
    });
    box("BayFoot" + z, [39.55, 2.6, z], [0.55, 0.4, 0.7], "steel", {
      collision: false,
    });
  }
  const crateTrim = new Geometry();
  for (const x of [-0.43, 0.43]) crateTrim.box([x, 0, 0], [0.1, 1.02, 1.02]);
  for (const x of [-0.27, 0.27])
    crateTrim.box([x, 0.59, 0], [0.07, 0.18, 0.12]);
  crateTrim.box([0, 0.69, 0], [0.6, 0.07, 0.12]);
  crateTrim.box([0, 0, -0.507], [0.42, 0.36, 0.025]);
  project.scripts["data/l02-crate.js"] =
    "export default " +
    JSON.stringify({
      positions: crateTrim.positions,
      normals: crateTrim.normals,
      indices: crateTrim.indices,
      uvs: crateTrim.uvs,
    }) +
    ";";
  const metal = await fs.readFile(
    new URL("../assets/art/l01/metal032-color.jpg", import.meta.url),
  );
  const concrete = await fs.readFile(
    new URL("../assets/art/l01/concrete023-color.jpg", import.meta.url),
  );
  const linear = (c) => {
    const v = parseInt(c, 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const materials = Object.entries(palette).map(([name, color], i) => ({
    name,
    extensions: { KHR_materials_unlit: {} },
    pbrMetallicRoughness: {
      baseColorFactor: [...color.slice(1).match(/../g).map(linear), 1],
      metallicFactor: 0,
      roughnessFactor: 0.9,
      ...(i === 0 || i === 1
        ? { baseColorTexture: { index: 0 } }
        : i === 3
          ? { baseColorTexture: { index: 1 } }
          : {}),
    },
  }));
  const signData = await fs.readFile(
    new URL("../assets/art/l02/signage.png", import.meta.url),
  );
  const signs = new Geometry();
  function sign(p, w, h, row, axis = "z") {
    const [x, y, z] = p,
      points =
        axis === "z"
          ? [
              [x - w / 2, y - h / 2, z],
              [x - w / 2, y + h / 2, z],
              [x + w / 2, y + h / 2, z],
              [x + w / 2, y - h / 2, z],
            ]
          : [
              [x, y - h / 2, z + w / 2],
              [x, y + h / 2, z + w / 2],
              [x, y + h / 2, z - w / 2],
              [x, y - h / 2, z - w / 2],
            ];
    if (axis === "east")
      for (const point of points) point[2] = 2 * z - point[2];
    signs.quad(
      points,
      axis === "z" ? [0, 0, -1] : axis === "east" ? [1, 0, 0] : [-1, 0, 0],
      [
        [0, (row + 1) / 4],
        [0, row / 4],
        [1, row / 4],
        [1, (row + 1) / 4],
      ],
    );
  }
  sign([28, 6.1, 24], 4.6, 0.575, 0);
  sign([28, 4.73, 15.975], 2.6, 0.325, 1);
  sign([24.03, 3.9, 20], 2.25, 0.282, 2, "east");
  sign([31.8, 5.5, 18.55], 3.2, 0.4, 3, "x");
  materials.push({
    name: "L02 original maintenance lettering",
    extensions: { KHR_materials_unlit: {} },
    doubleSided: true,
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 2 },
      metallicFactor: 0,
      roughnessFactor: 1,
    },
  });
  groups.push({
    name: "maintenance lettering",
    g: signs,
    material: materials.length - 1,
  });
  for (const { g } of groups) {
    g.colors = [];
    for (let i = 0; i < g.positions.length; i += 3) {
      const [x, y, z] = g.positions.slice(i, i + 3),
        [nx, ny, nz] = g.normals.slice(i, i + 3);
      const key = 0.62 + Math.max(0, ny * 0.2 - nx * 0.12 - nz * 0.12);
      const warm = 0.22 * Math.exp(-((x - 28) ** 2 + (z - 13) ** 2) / 28),
        cool = 0.22 * Math.exp(-((x - 38) ** 2 + (y - 6) ** 2) / 25);
      g.colors.push(
        Math.min(1, key + warm),
        Math.min(1, key + warm * 0.7 + cool * 0.6),
        Math.min(1, key + cool),
        1,
      );
      if (g !== signs) {
        g.uvs[(i / 3) * 2] *= 2;
        g.uvs[(i / 3) * 2 + 1] *= 2;
      }
    }
  }
  nodes.push({
    id: "L02IndustrialDress",
    name: "L02 coastal service bay",
    type: "model",
    modelUrl: "l02-industrial.glb",
    transform: { ...identity },
    rotation: { ...identity },
    scale: { x: 1, y: 1, z: 1 },
    visible: true,
    scripts: [],
  });
  const materialGroups = {};
  for (const n of nodes)
    if (n.l02style) {
      (materialGroups[n.l02style] ??= []).push(n.id);
      delete n.l02style;
    }
  project.scene.nodes = nodes;
  project.name = "折径 / 隔栏借物";
  project.activeFileId = "l02.js";
  delete project.scripts["l01.js"];
  delete project.scripts["data/l01-dialogue.js"];
  for (const file of ["l02.js"])
    project.scripts[file] = await fs.readFile(
      new URL("./" + file, import.meta.url),
      "utf8",
    );
  project.scripts["data/l02-dialogue.js"] =
    "export default " +
    (await fs.readFile(
      new URL("./data/l02-dialogue.json", import.meta.url),
      "utf8",
    )) +
    ";";
  project.scripts["data/l02-art.js"] =
    "export default " +
    JSON.stringify({
      palette: { ...palette, glass: "#b1d5d1" },
      groups: materialGroups,
    }) +
    ";";
  project.modelRefs = [
    { assetId: "L02IndustrialDress", fileName: "l02-industrial.glb" },
  ];
  project.content.textures = [
    {
      id: "zanque-service-metal",
      name: "ambientCG Metal032 / CC0",
      mime: "image/jpeg",
      byteLength: metal.length,
    },
  ];
  project.settings.backgroundColor = "#243a40";
  project.settings.ambientIntensity = 0.65;
  project.settings.ambientColor = "#b9ccc8";
  project.settings.build.title = "折径 · 隔栏借物";
  const hud = project.content.gameplay.hud;
  hud.find((h) => h.id === "title").text = "折径 / FOLDLINE     02 · 隔栏借物";
  hud.find((h) => h.id === "objective").text = "恢复检修接驳供电";
  hud.find((h) => h.id === "pauseTitle").text = "隔栏借物";
  return {
    project,
    models: new Map([
      [
        "L02IndustrialDress",
        glb(groups, materials, [
          { name: "Concrete023 / CC0", mime: "image/jpeg", data: concrete },
          { name: "Metal032 / CC0", mime: "image/jpeg", data: metal },
          {
            name: "Original L02 lettering / MIT",
            mime: "image/png",
            data: signData,
          },
        ]),
      ],
    ]),
    textures: new Map([["zanque-service-metal", metal]]),
    metrics: {
      artBatches: groups.length,
      artTriangles: groups.reduce((s, { g }) => s + g.indices.length / 3, 0),
      embeddedImages: 3,
    },
  };
}
