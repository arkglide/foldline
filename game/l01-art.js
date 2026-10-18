import artData from "./data/l01-art.js";

// L01 visual-only material sharing. Native owners release all overlays/textures
// on stop; no renderer-private objects, colliders or puzzle state are touched.
export function createL01Art({ visuals, scene }) {
  const handles = [];
  try {
    for (const [style, ids] of Object.entries(artData.groups)) {
      const options = { color: artData.palette[style] };
      if (style === "gate") {
        const texture = visuals.createTexture({ assetId: "l01-gate" });
        handles.push(texture);
        options.texture = texture;
        options.color = "#ffffff";
      }
      const material = visuals.createMaterial(options);
      handles.push(material);
      for (const id of ids) {
        const entity = scene.find(id);
        if (!entity) throw Error(`L01 art target absent: ${id}`);
        material.apply(entity);
      }
    }
  } catch (error) {
    for (const h of handles.reverse()) h.destroy();
    throw error;
  }
  let alive = true;
  return {
    dispose() {
      if (!alive) return;
      alive = false;
      for (const h of [...handles].reverse()) h.destroy();
    },
  };
}
