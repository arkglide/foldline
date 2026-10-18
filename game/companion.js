/** 栈雀: a shoulder-side folding maintenance terminal, never a physics actor.
 * Every world transform is derived from the current native camera pose. Only
 * tiny local articulation is smoothed, so a portal cannot leave a world-space
 * interpolation trail between two distant sides of the facility.
 */
const MOUNT = Object.freeze({ x: .39, y: -.28, z: .70 });
const RETRACTED_MOUNT = Object.freeze({ x: .40, y: -.34, z: -.12 });
const MODEL_SCALE = .82;
// Small articulation accents, not facial lip sync or generated audio analysis.
const DELIVERY = Object.freeze({
  curious: { yaw: -.08, roll: .035, nod: .028, pace: 7, wing: .08 },
  dry: { yaw: .025, roll: -.025, nod: .010, pace: 5, wing: .025 },
  surprised: { yaw: -.025, roll: .04, nod: .032, pace: 10, wing: .14 },
  warm: { yaw: -.035, roll: .015, nod: .020, pace: 6, wing: .05 },
  matterOfFact: { yaw: 0, roll: 0, nod: .014, pace: 7, wing: .03 },
});
const IDENTITY = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
function multiply(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function rotate(q, p) {
  const t = multiply(multiply(q, { ...p, w: 0 }), { x: -q.x, y: -q.y, z: -q.z, w: q.w });
  return { x: t.x, y: t.y, z: t.z };
}
function axis(axisName, angle) {
  return { x: 0, y: 0, z: 0, [axisName]: Math.sin(angle / 2), w: Math.cos(angle / 2) };
}
// Chamfered eight-sided extrusion: actual bevel normals, rather than a flat
// cube outline. Small service grooves/fasteners are merged into each moving
// part, retaining the reviewed 12 independent parts and five materials.
function boxGeometry(size) {
  const [x,y,z]=size.map(v=>v*MODEL_SCALE/2),b=Math.min(x,y,z)*.22;
  const ring=[[-x+b,-y],[x-b,-y],[x,-y+b],[x,y-b],[x-b,y],[-x+b,y],[-x,y-b],[-x,-y+b]];
  const positions=[],normals=[],indices=[],uvs=[];
  function face(points,n){const base=positions.length/3;for(const p of points){positions.push(...p);normals.push(...n);uvs.push((p[0]/x+1)/2,(p[1]/y+1)/2);}for(let j=1;j<points.length-1;j++)indices.push(base,base+j,base+j+1);}
  face(ring.map(([a,c])=>[a,c,z]),[0,0,1]);
  face([...ring].reverse().map(([a,c])=>[a,c,-z]),[0,0,-1]);
  for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length],dx=c[0]-a[0],dy=c[1]-a[1],l=Math.hypot(dx,dy);face([[a[0],a[1],-z],[c[0],c[1],-z],[c[0],c[1],z],[a[0],a[1],z]],[dy/l,-dx/l,0]);}
  return {positions,normals,indices,uvs};
}
function detailGeometry(size, details = []) {
  const result=boxGeometry(size);
  for(const [s,offset] of details){const g=boxGeometry(s),base=result.positions.length/3;
    for(let i=0;i<g.positions.length;i++)result.positions.push(g.positions[i]+offset[i%3]*MODEL_SCALE);
    result.normals.push(...g.normals);result.uvs.push(...g.uvs);result.indices.push(...g.indices.map(i=>i+base));}
  return result;
}

export function createCompanion({ visuals }, { getPose }) {
  if (typeof getPose !== 'function') throw TypeError('栈雀 requires a native camera pose reader.');
  const parts = [], materials = [], textures = [];
  let disposed = false, phase = 0, mode = 'idle', paused = false, snapCount = 0;
  let local = { ...MOUNT }, worldPosition = null, lastEye = null, lampState = '';
  let speech = 0, observation = 0, retracted = false, retraction = 0, delivery = 'matterOfFact';
  const material = options => { const handle = visuals.createMaterial(options); materials.push(handle); return handle; };
  let lights;
  try {
    const serviceTexture = visuals.createTexture({ assetId: 'zanque-service-metal' }); textures.push(serviceTexture);
    const shell = material({ color: '#8fa49a', texture: serviceTexture, doubleSided: true });
    const dark = material({ color: '#243b3b', doubleSided: true });
    const folded = material({ color: '#b8a77b', texture: serviceTexture, doubleSided: true });
    const hinge = material({ color: '#a6b9af', texture: serviceTexture, doubleSided: true });
    lights = material({ color: '#b6e4d4', emissive: '#295d51', unlit: true, doubleSided: true });
    function part(name, size, offset, surface, wing = 0, details = []) {
      const handle = visuals.createMesh(detailGeometry(size, details), { id: `zanque:${name}`, name: `栈雀 · ${name}`, material: surface });
      parts.push({ name, handle, offset: { x: offset[0] * MODEL_SCALE,
        y: offset[1] * MODEL_SCALE, z: offset[2] * MODEL_SCALE }, wing, position: null });
    }
    // Flat layered housing and a paired rectangular status display. No sphere
    // or single circular lens; folded side tools establish its industrial role.
    part('housing', [.23, .14, .14], [0, 0, 0], shell);
    part('display-bezel', [.184, .082, .018], [0, .005, -.078], dark, 0,
      Array.from({length:6},(_,i)=>[[.004,.036,.006],[-.065+i*.026,-.007,-.014]]));
    part('status-left', [.048, .016, .012], [-.041, .012, -.091], lights);
    part('status-right', [.048, .016, .012], [.041, .012, -.091], lights);
    part('folded-top', [.165, .030, .10], [0, .085, .006], folded, 0,
      [[ [.06,.004,.038],[-.043,.017,-.01] ],[ [.015,.004,.038],[.048,.017,-.01] ]]);
    part('hinge-left', [.032, .048, .04], [-.114, -.012, .015], hinge, 0, [[[.012,.024,.007],[0,0,-.024]]]);
    part('hinge-right', [.032, .048, .04], [.114, -.012, .015], hinge, 0, [[[.012,.024,.007],[0,0,-.024]]]);
    part('wing-left', [.09, .035, .19], [-.162, -.012, .005], folded, -1,
      [[[.008,.010,.14],[-.024,.021,0]],[[.008,.010,.14],[.024,.021,0]]]);
    part('wing-right', [.09, .035, .19], [.162, -.012, .005], folded, 1,
      [[[.008,.010,.14],[-.024,.021,0]],[[.008,.010,.14],[.024,.021,0]]]);
    part('mount-brace', [.17, .028, .17], [0, -.084, .015], dark);
    part('tool-left', [.027, .065, .026], [-.054, -.12, -.015], hinge);
    part('tool-right', [.027, .065, .026], [.015, -.12, -.015], hinge);
  } catch (error) {
    for (const { handle } of parts.reverse()) handle.destroy();
    for (const handle of materials.reverse()) handle.destroy();
    for (const handle of textures.reverse()) handle.destroy();
    throw error;
  }

  function draw() {
    if (disposed) return;
    const pose = getPose();
    lastEye = { ...pose.position };
    worldPosition = add(pose.position, rotate(pose.rotation, local));
    const accent = DELIVERY[delivery];
    const tilt = multiply(axis('y', -.10 - observation * .14 + accent.yaw * speech),
      multiply(axis('x', -.08 + Math.sin(phase * accent.pace) * speech * accent.nod),
        axis('z', .03 + accent.roll * speech)));
    const rotation = multiply(pose.rotation, tilt);
    for (const part of parts) {
      const offset = { ...part.offset };
      let joint = IDENTITY;
      if (part.wing) {
        const openAngle = .22 + observation * .24 + speech * (accent.wing + .02 * Math.sin(phase * 12));
        const angle = part.wing * (openAngle * (1 - retraction) + Math.PI * .48 * retraction);
        joint = axis('z', angle);
        // Fold around a fixed housing hinge, rather than orbiting a wing.
        const hingePoint = { x: part.wing * .114 * MODEL_SCALE,
          y: -.012 * MODEL_SCALE, z: .015 * MODEL_SCALE };
        const relative = { x: offset.x - hingePoint.x, y: offset.y - hingePoint.y, z: offset.z - hingePoint.z };
        Object.assign(offset, add(hingePoint, rotate(joint, relative)));
      }
      part.position = add(worldPosition, rotate(rotation, offset));
      part.handle.setPose({ position: part.position, rotation: multiply(rotation, joint) });
    }
    const level = Math.round(108 + speech * (60 + 20 * Math.sin(phase * 15)) + observation * 18);
    const glow = `#${Math.round(level * .42).toString(16).padStart(2, '0')}${level.toString(16).padStart(2, '0')}${Math.round(level * .85).toString(16).padStart(2, '0')}`;
    if (glow !== lampState) { lights.update({ emissive: glow }); lampState = glow; }
  }
  function update(dt = 0, state = {}) {
    if (disposed) return;
    paused = !!state.paused;
    retracted = !!state.retracted;
    if (!paused) {
      const step = Number.isFinite(dt) ? Math.min(.1, Math.max(0, dt)) : 0;
      phase += step;
      delivery = Object.hasOwn(DELIVERY, state.delivery) ? state.delivery : 'matterOfFact';
      mode = state.speaking ? 'speaking' : state.observing ? 'observing' : 'idle';
      const gain = 1 - Math.exp(-12 * step);
      speech += ((mode === 'speaking' ? 1 : 0) - speech) * gain;
      observation += ((mode === 'observing' ? 1 : 0) - observation) * gain;
      // The level requests a shoulder fold before approaching a live aperture.
      // A visual is not a native portal traveller; withdrawing behind the eye
      // keeps its housing on the camera's side until the native view maps.
      // This remains local articulation and never alters the player/portal.
      const mountGain = 1 - Math.exp(-(retracted ? 20 : 12) * step);
      retraction += ((retracted ? 1 : 0) - retraction) * mountGain;
      const target = retracted ? RETRACTED_MOUNT : {
        x: MOUNT.x, y: MOUNT.y + Math.sin(phase * 1.7) * .004,
        z: MOUNT.z + observation * .008,
      };
      local = { x: local.x + (target.x - local.x) * mountGain,
        y: local.y + (target.y - local.y) * mountGain,
        z: local.z + (target.z - local.z) * mountGain };
    }
    draw();
  }
  function snap() {
    if (disposed) return;
    local = { ...(retracted ? RETRACTED_MOUNT : MOUNT) };
    retraction = retracted ? 1 : 0; snapCount++; draw();
  }
  function snapshot() {
    return {
      disposed, mode: paused ? 'paused' : mode, animationMode: mode, delivery, snapCount, retracted, retraction,
      worldPosition: worldPosition && { ...worldPosition }, localOffset: { ...local },
      mountDistance: worldPosition && lastEye ? Math.hypot(worldPosition.x - lastEye.x,
        worldPosition.y - lastEye.y, worldPosition.z - lastEye.z) : null,
      collisionBodies: 0,
      resources: { meshes: parts.filter(p => p.handle.active).length,
        materials: materials.filter(m => m.active).length, textures: textures.filter(t => t.active).length },
      parts: parts.map(p => ({ id: p.handle.entity.id, position: p.position && { ...p.position }, active: p.handle.active })),
    };
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const { handle } of [...parts].reverse()) handle.destroy();
    for (const handle of [...materials].reverse()) handle.destroy();
    for (const handle of [...textures].reverse()) handle.destroy();
  }
  try { snap(); } catch (error) { dispose(); throw error; }
  return Object.freeze({ update, snap, snapshot, dispose });
}
