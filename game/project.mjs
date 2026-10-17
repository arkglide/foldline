import fs from 'node:fs/promises';

// All geometry belongs to C01-L01. The shallow exit vestibule is a test boundary,
// not a placeholder for L02. Coordinates are metres; character origin is its centre.
export async function l01Project() {
  const nodes = [];
  function box(id, p, size, color, { motion = 'static', collision = true } = {}) {
    const n = { id, name: id, type: 'mesh', primitive: 'box',
      transform: { x: p[0], y: p[1], z: p[2] }, rotation: { x: 0, y: 0, z: 0 },
      scale: { x: size[0], y: size[1], z: size[2] }, visible: true, scripts: [], color };
    if (collision) n.physics = { motion, shape: 'box', size: { x: 1, y: 1, z: 1 },
      mass: 10, friction: 0.7, restitution: 0, sensor: false, lockRotation: false };
    nodes.push(n); return n;
  }
  const structural = '#a7aba8', wall = '#707c7e', dark = '#364347', metal = '#8e9e9e';
  const amber = '#e3bd71', signal = '#a8e0cf';
  box('CourtFloor', [16, -.2, 7.1], [16.6, .4, 15], structural);
  box('WestBoundary', [7.8, 3.5, 7.1], [.4, 7.4, 15], wall);
  box('SouthBoundary', [16, 3.5, -.35], [16.6, 7.4, .4], wall);
  box('NorthBoundary', [16, 3.5, 14.6], [16.6, 7.4, .4], wall);
  // East wall is split around the genuine portal host and the visible upper exit.
  box('EastSouth', [24.15, 3.5, 3.9], [.3, 7.4, 8.4], wall);
  box('EastLower', [24.15, 1.0, 11.25], [.3, 2.4, 6.3], wall);
  box('B1Host', [24.15, 4.1, 10], [.3, 3.8, 3.8], '#a2b7b2');
  box('B1WallAbove', [24.15, 6.5, 10], [.3, 1, 3.8], wall);
  box('ExitPier', [24.15, 4.4, 11.95], [.3, 4, .1], wall);
  box('ExitLintel', [24.15, 6.1, 13], [.3, 1.8, 2], wall);
  box('ExitNorthPier', [24.15, 4.5, 14.3], [.3, 5, .6], wall);

  // Low equipment leaves the upper exit crown visible from O1.
  box('CentralEquipment', [17, .95, 9], [5.8, 1.9, 9.4], dark);
  for (let x = 14.3; x <= 19.8; x += 1.1)
    box(`EquipmentRib${x.toFixed(1)}`, [x, 1.97, 9], [.07, .14, 9.35], metal, { collision: false });
  box('CentralEndFace', [17, .95, 4.25], [5.8, 1.9, .12], '#556568');
  box('A1Host', [11, 1.6, 10.15], [4, 3.6, .3], '#a2b7b2');
  box('A1FlankLeft', [8.4, 1.6, 10.15], [1.2, 3.6, .3], wall);
  box('A1FlankRight', [13.6, 1.6, 10.15], [1.2, 3.6, .3], wall);
  box('A1CabinetCrown', [11, 3.8, 10.1], [4.2, .8, .55], dark);
  box('Shutter', [11, 1.45, 9.78], [2.5, 2.9, .16], '#72746b', { motion: 'kinematic' });
  box('HandlePost', [10.4, .48, 8], [.34, .96, .34], dark);
  box('ShutterHandle', [10.4, 1.1, 8], [.48, .4, .34], amber);
  box('HandleStem', [10.4, 1.1, 7.78], [.08, .3, .12], '#fbebbb', { collision: false });

  box('UpperFloor', [22.125, 2.25, 11.1], [3.75, .3, 6.2], structural);
  box('GalleryGuard', [20.1, 3.05, 11.1], [.3, 1.3, 6.2], metal);
  // Fifteen 16cm risers; solid cheek panels prevent jumping onto the middle steps.
  for (let i = 0; i < 15; i++) {
    const rise = (i + 1) * .16, z = 3.2 + (i + .5) * .32;
    box(`Stair${i + 1}`, [22.125, rise / 2, z], [3.75, rise, .32], '#aeb6b3');
    box(`StairCheek${i + 1}`, [20.1, (rise + 1.35) / 2, z], [.3, rise + 1.35, .32], metal);
    box(`StairNosing${i + 1}`, [22.125, rise + .007, z - .125], [3.7, .014, .035], amber, { collision: false });
  }
  box('StairCheekFoot', [20.1, .7, 2.8], [.3, 1.4, .8], metal);
  box('StairGate', [22.125, 1.4, 2.75], [3.75, 2.8, .22], '#9b8b69', { motion: 'kinematic' });
  box('GateHeader', [22.125, 4.4, 2.75], [3.95, .3, .45], dark);
  box('LatchPost', [21, 2.85, 10], [.32, .9, .32], dark);
  box('UpperLatch', [21, 3.45, 10], [.46, .4, .36], amber);
  box('LatchStem', [21.29, 3.45, 10], [.14, .3, .08], '#fbebbb', { collision: false });

  // Exit is visible before it can be reached. Opening it never loads another unit.
  box('ExitDoor', [24.12, 3.8, 13], [.22, 2.8, 1.9], '#797d71', { motion: 'kinematic' });
  box('ExitSignBacking', [23.86, 5.25, 13], [.1, .72, 2.2], dark, { collision: false });
  box('ExitCrown', [23.74, 5.48, 13], [.12, .12, 1.74], signal, { collision: false });
  box('ExitCrownSideA', [23.74, 5.23, 12.18], [.12, .5, .1], signal, { collision: false });
  box('ExitCrownSideB', [23.74, 5.23, 13.82], [.12, .5, .1], signal, { collision: false });
  box('ExitMarkLeft', [23.86, 4.55, 12.32], [.1, .55, .1], signal, { collision: false });
  box('ExitMarkRight', [23.86, 4.55, 13.68], [.1, .55, .1], signal, { collision: false });
  box('VestibuleFloor', [24.9, 2.25, 13], [1.8, .3, 2], structural);
  box('VestibuleBack', [25.9, 3.8, 13], [.25, 2.8, 2.3], wall);
  box('VestibuleNorth', [24.9, 3.8, 14.15], [1.8, 2.8, .3], wall);
  box('VestibuleSouth', [24.9, 3.8, 11.85], [1.8, 2.8, .3], wall);
  box('VestibuleRoof', [24.9, 5.3, 13], [1.8, .2, 2.3], dark);
  // Thin guide strips are visual paint, never invisible collision helpers.
  box('HandleGuide', [10.4, .012, 5.1], [.09, .02, 4], amber, { collision: false });
  box('ReturnGuide', [22.125, .012, 1.35], [.1, .02, 2.2], amber, { collision: false });
  box('UpperGuide', [22.1, 2.412, 13], [3.6, .02, .08], signal, { collision: false });
  nodes.push({ id: 'Player', name: 'Player', type: 'empty',
    transform: { x: 9.5, y: .92, z: 3 }, rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 }, visible: true, scripts: ['l01.js'],
    character: { radius: .3, height: 1.8, mass: 70, stepHeight: .25, maxSlope: 45,
      speed: 4, jumpSpeed: 4, movementMode: 'inertial', groundAcceleration: 40,
      airAcceleration: 6, groundFriction: 10 } });
  for (const [id, x, y, z] of [['CourtLight', 12, 5, 5], ['GalleryLight', 22, 6, 11]])
    nodes.push({ id, name: id, type: 'light', lightType: 'point', intensity: .18, color: '#ffffff',
      transform: { x, y, z }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
      visible: true, scripts: [] });
  const label = (id, text, x, y, extra = {}) => ({ id, kind: 'text', text, x, y,
    fontSize: 16, color: '#eef1e9', background: '#172427', ...extra });
  return {
    version: '0.6', name: '折径 / 侧向通行 · M1灰盒', projectId: 'foldline-c01-l01-m1',
    scene: { nodes }, scripts: { 'l01.js': await fs.readFile(new URL('./l01.js', import.meta.url), 'utf8') },
    activeFileId: 'l01.js', modelRefs: [],
    settings: { gravity: { x: 0, y: -9.8, z: 0 }, backgroundColor: '#47575b',
      ambientIntensity: .85, ambientColor: '#ffffff', fpsCap: 60, fixedTimeStep: 1 / 60,
      maxSubSteps: 8, timeScale: 1,
      build: { title: '折径 · 侧向通行 / M1 灰盒', protectCode: false, showLogs: false } },
    content: { materials: {}, textures: [], prefabs: {}, prefabInstances: {}, audio: [],
      physics: { groups: [{ name: 'Default', mask: 1 }], debug: false },
      mixer: { buses: [{ id: 'Master', name: 'Master', parentId: null, volume: 1, mute: false }],
        snapshots: [], ducking: [], maxVoices: 8 }, animationControllers: {}, retargetProfiles: {},
      gameplay: { captureInput: true,
        actions: [['moveX', ['KeyD'], ['KeyA']], ['moveZ', ['KeyW'], ['KeyS']],
          ['jump', ['Space'], []], ['interact', ['KeyE'], []], ['retry', ['KeyR'], []]]
          .map(([name, positive, negative]) => ({ name, positive, negative })),
        hud: [
          label('title', '折径 / FOLDLINE     01 · 侧向通行', 3, 3, { fontSize: 19 }),
          label('objective', '抵达高处的出口', 3, 8),
          label('stage', 'C01-L01  ·  灰盒测试入口', 3, 12, { fontSize: 13, color: '#c5cec9' }),
          label('controls', 'WASD 移动   鼠标观察   E 操作   空格跳跃   R 重试   Esc 暂停', 3, 94, { fontSize: 14 }),
          label('prompt', '', 50, 78, { anchorX: .5, width: 70, height: 6, fontSize: 18 }),
          label('notice', '', 50, 86, { anchorX: .5, width: 75, height: 5 }),
          label('crosshair', '·', 50, 50, { anchorX: .5, anchorY: .5, fontSize: 34, background: 'transparent' }),
          label('pauseTitle', '侧向通行', 50, 39, { anchorX: .5, fontSize: 34, width: 50, height: 9 }),
          label('pauseHint', '点击画面开始 / 继续 · R 重试\n观察空间，找到通往上层的路径。', 50, 51,
            { anchorX: .5, width: 65, height: 12, fontSize: 19 }),
        ] } },
  };
}
