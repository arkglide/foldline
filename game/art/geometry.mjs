// Original Foldline asset authoring helpers. Produces ordinary glTF 2.0;
// no engine source or renderer objects are embedded in the game.
export class Geometry {
  positions = [];
  normals = [];
  uvs = [];
  indices = [];
  quad(
    points,
    normal,
    uv = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ],
  ) {
    const base = this.positions.length / 3;
    for (let i = 0; i < 4; i++) {
      this.positions.push(...points[i]);
      this.normals.push(...normal);
      this.uvs.push(...uv[i]);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  box(p, s) {
    const [x, y, z] = p,
      [a, b, c] = s.map((v) => v / 2);
    this.quad(
      [
        [x - a, y - b, z + c],
        [x + a, y - b, z + c],
        [x + a, y + b, z + c],
        [x - a, y + b, z + c],
      ],
      [0, 0, 1],
    );
    this.quad(
      [
        [x + a, y - b, z - c],
        [x - a, y - b, z - c],
        [x - a, y + b, z - c],
        [x + a, y + b, z - c],
      ],
      [0, 0, -1],
    );
    this.quad(
      [
        [x + a, y - b, z + c],
        [x + a, y - b, z - c],
        [x + a, y + b, z - c],
        [x + a, y + b, z + c],
      ],
      [1, 0, 0],
    );
    this.quad(
      [
        [x - a, y - b, z - c],
        [x - a, y - b, z + c],
        [x - a, y + b, z + c],
        [x - a, y + b, z - c],
      ],
      [-1, 0, 0],
    );
    this.quad(
      [
        [x - a, y + b, z + c],
        [x + a, y + b, z + c],
        [x + a, y + b, z - c],
        [x - a, y + b, z - c],
      ],
      [0, 1, 0],
    );
    this.quad(
      [
        [x - a, y - b, z - c],
        [x + a, y - b, z - c],
        [x + a, y - b, z + c],
        [x - a, y - b, z + c],
      ],
      [0, -1, 0],
    );
  }
  pipe(a, b, r, sides = 12) {
    const d = b.map((v, i) => v - a[i]),
      len = Math.hypot(...d),
      n = d.map((v) => v / len);
    const cross = (u, v) => [
      u[1] * v[2] - u[2] * v[1],
      u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0],
    ];
    let u = cross(n, Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
    const ul = Math.hypot(...u);
    u = u.map((v) => v / ul);
    const v = cross(n, u);
    const radial = (t) =>
      u.map((c, i) => r * (c * Math.cos(t) + v[i] * Math.sin(t)));
    for (let i = 0; i < sides; i++) {
      const q = radial((i * 2 * Math.PI) / sides),
        w = radial(((i + 1) * 2 * Math.PI) / sides),
        normal = radial(((i + 0.5) * 2 * Math.PI) / sides).map((c) => c / r);
      // Winding is outward; caps are deliberately omitted for joined service pipes.
      this.quad(
        [
          a.map((c, j) => c + w[j]),
          a.map((c, j) => c + q[j]),
          b.map((c, j) => c + q[j]),
          b.map((c, j) => c + w[j]),
        ],
        normal,
      );
    }
  }
}
export function glb(groups, materials, images = []) {
  const chunks = [],
    views = [],
    accessors = [];
  let length = 0;
  function bytes(raw, target) {
    const data = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
    const i = views.length;
    views.push({
      buffer: 0,
      byteOffset: length,
      byteLength: data.length,
      ...(target ? { target } : {}),
    });
    chunks.push(data);
    length += data.length;
    const pad = (4 - (length % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      length += pad;
    }
    return i;
  }
  function accessor(values, size, type) {
    const raw =
      type === 5125 ? new Uint32Array(values) : new Float32Array(values);
    const a = {
      bufferView: bytes(raw, type === 5125 ? 34963 : 34962),
      componentType: type,
      count: values.length / size,
      type: { 1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4" }[size],
    };
    if (size === 3) {
      a.min = [Infinity, Infinity, Infinity];
      a.max = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < values.length; i++) {
        a.min[i % 3] = Math.min(a.min[i % 3], values[i]);
        a.max[i % 3] = Math.max(a.max[i % 3], values[i]);
      }
    }
    accessors.push(a);
    return accessors.length - 1;
  }
  // glTF is right-handed. Babylon's documented default LH import reflects X
  // (root rotation Y=pi, scale Z=-1). Reflect data/winding at authoring time
  // so imported scenery aligns with the existing native metre coordinates.
  groups = groups.map((item) => {
    const g = {
      ...item.g,
      positions: item.g.positions.map((v, i) => (i % 3 === 0 ? -v : v)),
      normals: item.g.normals.map((v, i) => (i % 3 === 0 ? -v : v)),
      indices: [...item.g.indices],
    };
    for (let i = 0; i < g.indices.length; i += 3)
      [g.indices[i + 1], g.indices[i + 2]] = [
        g.indices[i + 2],
        g.indices[i + 1],
      ];
    return { ...item, g };
  });
  const meshes = groups.map(({ name, g, material }) => ({
    name,
    primitives: [
      {
        attributes: {
          POSITION: accessor(g.positions, 3, 5126),
          NORMAL: accessor(g.normals, 3, 5126),
          TEXCOORD_0: accessor(g.uvs, 2, 5126),
          ...(g.colors ? { COLOR_0: accessor(g.colors, 4, 5126) } : {}),
        },
        indices: accessor(g.indices, 1, 5125),
        material,
      },
    ],
  }));
  const json = {
    extensionsUsed: ["KHR_materials_unlit"],
    asset: {
      version: "2.0",
      generator: "Foldline L01 original industrial asset authoring",
    },
    scene: 0,
    scenes: [{ nodes: meshes.map((_, i) => i) }],
    nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })),
    meshes,
    materials,
    accessors,
    bufferViews: views,
    buffers: [{ byteLength: 0 }],
  };
  if (images.length) {
    json.images = images.map((i) => ({
      name: i.name,
      bufferView: bytes(i.data),
      mimeType: i.mime,
    }));
    json.samplers = [
      { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
    ];
    json.textures = images.map((_, i) => ({ sampler: 0, source: i }));
  }
  json.buffers[0].byteLength = length;
  let head = Buffer.from(JSON.stringify(json));
  head = Buffer.concat([head, Buffer.alloc((4 - (head.length % 4)) % 4, 32)]);
  const bin = Buffer.concat(chunks),
    result = Buffer.alloc(12 + 8 + head.length + 8 + bin.length);
  result.writeUInt32LE(0x46546c67, 0);
  result.writeUInt32LE(2, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(head.length, 12);
  result.writeUInt32LE(0x4e4f534a, 16);
  head.copy(result, 20);
  result.writeUInt32LE(bin.length, 20 + head.length);
  result.writeUInt32LE(0x004e4942, 24 + head.length);
  bin.copy(result, 28 + head.length);
  return result;
}
