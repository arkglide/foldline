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
  box('CentralEquipment', [17, .95, 6.25], [5.8, 1.9, 3.9], dark);
  box('NorthEquipment', [17, .95, 12.1], [5.8, 1.9, 3.2], dark);
  for (let x = 14.3; x <= 19.8; x += 1.1)
    for (const [z, length] of [[6.25, 3.85], [12.1, 3.15]])
      box(`EquipmentRib${x.toFixed(1)}_${z}`, [x, 1.97, z], [.07, .14, length], metal, { collision: false });
  box('CentralEndFace', [17, .95, 4.25], [5.8, 1.9, .12], '#556568');
  box('A1Host', [11, 1.6, 10.15], [4, 3.6, .3], '#a2b7b2');
  box('A1FlankLeft', [8.4, 1.6, 10.15], [1.2, 3.6, .3], wall);
  box('A1FlankRight', [13.6, 1.6, 10.15], [1.2, 3.6, .3], wall);
  box('A1CabinetCrown', [11, 3.8, 10.1], [4.2, .8, .55], dark);
  box('Shutter', [11, 1.45, 9.78], [2.5, 2.9, .16], '#72746b', { motion: 'kinematic' });
  // The mechanical handwheel is discovered beside the pipe, not a front-facing button.
  box('HandlePost', [13.35, .44, 8], [.25, .88, .28], dark);
  const wheel = box('ShutterHandle', [13.35, 1.12, 8], [.68, .16, .68], amber);
  wheel.primitive = 'torus'; wheel.rotation.z = Math.PI / 2;
  box('WheelHub', [13.23, 1.12, 8], [.17, .18, .18], '#fbebbb', { collision: false });
  box('WheelSpokeA', [13.21, 1.12, 8], [.08, .54, .08], dark, { collision: false });
  box('WheelSpokeB', [13.21, 1.12, 8], [.08, .08, .54], dark, { collision: false });
  box('WheelRod', [13.45, 1.65, 9.05], [.10, .10, 2.1], amber, { collision: false });
  // An optional blind opens a real cross-section through the pump skid.
  box('InspectionBlind', [14.03, 1.0, 9.35], [.16, 1.8, 1.9], '#829a98', { motion: 'kinematic' });
  box('BlindGrip', [13.89, 1.02, 9.35], [.16, .26, .48], amber, { collision: false });
  box('InspectionThreshold', [16.9, .06, 9.35], [5.8, .12, 1.85], '#829a98');
  box('InspectionRoofRail', [17, 2.13, 8.45], [5.8, .12, .10], dark, { collision: false });
  box('InspectionRoofRailNorth', [17, 2.13, 10.25], [5.8, .12, .10], dark, { collision: false });
  box('InspectionGauge', [15.2, 1.1, 10.37], [.7, .7, .14], dark, { collision: false });
  box('GaugeNeedle', [15.2, 1.1, 10.25], [.05, .52, .07], amber, { collision: false });
  box('NotchPipe', [17.4, .32, 10.2], [5.1, .15, .15], '#c6ae76');
  // Two continuous service conduits connect locked stairs and handwheel.
  for (const [index, offset] of [[0, 0], [1, .2]]) {
    box(`ConduitSouth${index}`, [17.55, .13, 2.35 + offset], [8.4, .14, .14], index ? metal : amber, { collision: false });
    box(`ConduitWest${index}`, [13.35 + offset, .13, 5.15], [.14, .14, 5.6], index ? metal : amber, { collision: false });
    box(`ConduitRise${index}`, [13.35 + offset, .61, 7.95], [.12, 1.0, .12], index ? metal : amber, { collision: false });
  }

  box('UpperFloor', [22.125, 2.25, 11.1], [3.75, .3, 6.2], structural);
  box('GalleryGuard', [20.1, 3.6, 11.1], [.24, .20, 6.2], metal);
  box('GalleryKick', [20.1, 2.53, 11.1], [.24, .26, 6.2], metal);
  for (let z = 8.2; z < 14.2; z += 1.05)
    box(`GalleryPost${z.toFixed(2)}`, [20.1, 3.06, z], [.24, 1.3, .10], metal);
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
  box('UpperLatch', [21, 3.45, 10], [.25, .68, .24], amber);
  box('LatchStem', [21.22, 3.45, 10], [.36, .12, .12], '#fbebbb', { collision: false });
  box('ReturnCable', [21, 4.4, 6.5], [.07, .07, 7.2], amber, { collision: false });
  box('CableRise', [21, 3.9, 10], [.07, 1.0, .07], metal, { collision: false });
  box('ExitCable', [22.5, 4.4, 10], [3.0, .07, .07], amber, { collision: false });
  box('ExitCableTurn', [23.96, 4.4, 11.5], [.07, .07, 3], amber, { collision: false });
  box('ReturnCounterweight', [23.5, 4.6, 3.0], [.55, 1, .35], dark, { collision: false });

  // Exit is visible before it can be reached. Opening it never loads another unit.
  box('ExitDoor', [24.12, 3.8, 13], [.22, 2.8, 1.9], '#797d71', { motion: 'kinematic' });
  box('ExitRackRailA', [23.95, 3.8, 12.18], [.09, 2.6, .09], metal, { collision: false });
  box('ExitRackRailB', [23.95, 3.8, 13.82], [.09, 2.6, .09], metal, { collision: false });
  box('ExitRackBraceA', [23.93, 3.0, 13], [.12, .12, 1.75], amber, { collision: false });
  box('ExitRackBraceB', [23.93, 4.5, 13], [.12, .12, 1.75], amber, { collision: false });
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
  box('HandleGuide', [12.9, .012, 7.9], [1, .02, .08], amber, { collision: false });
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
    scene: { nodes }, scripts: {
      'l01.js': await fs.readFile(new URL('./l01.js', import.meta.url), 'utf8'),
      'dialogue.js': await fs.readFile(new URL('./dialogue.js', import.meta.url), 'utf8'),
      'dialogue-preferences.js': await fs.readFile(new URL('./dialogue-preferences.js', import.meta.url), 'utf8'),
      'companion.js': await fs.readFile(new URL('./companion.js', import.meta.url), 'utf8'),
      'data/l01-dialogue.js': `export default ${await fs.readFile(new URL('./data/l01-dialogue.json', import.meta.url), 'utf8')};`,
    },
    activeFileId: 'l01.js', modelRefs: [],
    settings: { gravity: { x: 0, y: -9.8, z: 0 }, backgroundColor: '#47575b',
      ambientIntensity: .85, ambientColor: '#ffffff', fpsCap: 60, fixedTimeStep: 1 / 60,
      maxSubSteps: 8, timeScale: 1,
      build: { title: '折径 · 侧向通行 / M1-R2', protectCode: false, showLogs: false } },
    content: { materials: {}, textures: [], prefabs: {}, prefabInstances: {}, audio: [],
      physics: { groups: [{ name: 'Default', mask: 1 }], debug: false },
      mixer: { buses: [{ id: 'Master', name: 'Master', parentId: null, volume: 1, mute: false },
        { id: 'CompanionVoice', name: '栈雀', parentId: 'Master', volume: .9, mute: false },
        { id: 'BroadcastVoice', name: '衡务广播', parentId: 'Master', volume: .75, mute: false },
        { id: 'mechanical', name: '机械反馈', parentId: 'Master', volume: .35, mute: false }],
        snapshots: [], ducking: [], maxVoices: 8 }, animationControllers: {}, retargetProfiles: {},
      gameplay: { captureInput: true,
        actions: [['moveX', ['KeyD'], ['KeyA']], ['moveZ', ['KeyW'], ['KeyS']],
          ['jump', ['Space'], []], ['interact', ['KeyE'], []], ['retry', ['KeyR'], []],
          ['voice', ['KeyV'], []], ['subtitles', ['KeyB'], []], ['language', ['KeyL'], []]]
          .map(([name, positive, negative]) => ({ name, positive, negative })),
        hud: [
          label('title', '折径 / FOLDLINE     01 · 侧向通行', 3, 3, { fontSize: 19 }),
          label('objective', '抵达高处的出口', 3, 8),
          label('dialogue', '', 50, 82, { anchorX: .5, width: 82, height: 8, fontSize: 18 }),
          label('audioStatus', '', 3, 17, { fontSize: 12, color: '#c5cec9' }),
          label('dialogueSettings', '', 50, 66, { anchorX: .5, width: 86, height: 6, fontSize: 16 }),
          label('prompt', '', 50, 78, { anchorX: .5, width: 70, height: 6, fontSize: 18 }),
          label('notice', '', 50, 72, { anchorX: .5, width: 75, height: 5, fontSize: 14 }),
          label('crosshair', '·', 50, 50, { anchorX: .5, anchorY: .5, fontSize: 34, background: 'transparent' }),
          label('pauseTitle', '侧向通行', 50, 39, { anchorX: .5, fontSize: 34, width: 50, height: 9 }),
          label('pauseHint', '点击画面开始 / 继续 · R 重试\nV 英语语音 · B 字幕开关 · L 字幕语言', 50, 51,
            { anchorX: .5, width: 82, height: 12, fontSize: 18 }),
        ] } },
  };
}
