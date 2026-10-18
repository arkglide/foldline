import { createDialogue } from './dialogue.js';
import { createCompanion } from './companion.js';
import dialogueData from './data/l01-dialogue.js';

/** C01-L01 only. Native ArkGlide script; no gameplay teleport or camera cuts. */
export default function (ctx) {
  const { entity, scene, physics, cameras, portals, input, events, ui, time, motion, saves, visuals, audio } = ctx;
  const required = id => { const e = scene.find(id); if (!e) throw Error(`L01 missing ${id}`); return e; };
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  const quality = { depth: 2, scale: 1, recursiveScale: .75, samples: 1, maxViews: 6 };
  const yaw = Math.atan2(14.5, 10), pitch = -.10;
  const initialRotation = { x: Math.sin(pitch / 2) * Math.cos(yaw / 2),
    y: Math.cos(pitch / 2) * Math.sin(yaw / 2), z: -Math.sin(pitch / 2) * Math.sin(yaw / 2),
    w: Math.cos(pitch / 2) * Math.cos(yaw / 2) };
  let rig, controller, a, b, shutter, gate, exit, blind, initialSnapshot, companion, dialogue;
  let noticeAge = 0, observationTime = 0, upperLookTime = 0, holdingWheel = false;
  let mountObstruction = '', companionEntities = [];
  const feedback = [], audioErrors = [];
  let handleMaterial, latchMaterial, exitMaterial;
  let ready = false, alive = true, retrying = false, startingControl = false, retryCount = 0, paused = true, error = '';
  let interactTarget = '', portalEvents = [], blockedEvents = [];
  let flags = { handleRequested: false, portalsActive: false, latchRequested: false,
    returnStairOpen: false, completed: false, blindRequested: false, entered: false,
    exitSeen: false, blockedSeen: false, crossed: false, returned: false, blindObserved: false, lookedBack: false };
  const textCache = new Map();
  function text(id, value) {
    if (id === 'notice') noticeAge = 0;
    if (id === 'prompt') ui.get(id)?.setVisible(!!value && !paused);
    if (id === 'notice') ui.get(id)?.setVisible(!!value);
    if (textCache.get(id) === value) return;
    textCache.set(id, value); ui.get(id)?.setText(value);
  }
  function sound(id) {
    try {
      if (!audio.list().includes(id)) return;
      const voice = audio.play(id, { bus: 'mechanical', priority: 5, volume: .65 });
      feedback.push(voice);
      if (feedback.length > 12) feedback.shift()?.stop();
    } catch (cause) { audioIssue(id, cause); }
  }
  function audioIssue(id, cause) {
    audioErrors.push({ id, message: String(cause?.message || cause) });
    if (audioErrors.length > 8) audioErrors.shift();
  }
  function stopFeedback() { for (const voice of feedback.splice(0)) voice.stop(); }
  function mountedObstruction() {
    const pose = rig.camera.getPose(), q = pose.rotation;
    // Test the intended deployed shoulder mount, never the retracted position,
    // so a nearby wall cannot cause fold/unfold oscillation. No player forces.
    const v = { x: .39, y: -.28, z: .70 };
    const t = { x: 2 * (q.y * v.z - q.z * v.y), y: 2 * (q.z * v.x - q.x * v.z),
      z: 2 * (q.x * v.y - q.y * v.x) };
    const direction = { x: 1.16 * (v.x + q.w * t.x + q.y * t.z - q.z * t.y),
      y: 1.16 * (v.y + q.w * t.y + q.z * t.x - q.x * t.z),
      z: 1.16 * (v.z + q.w * t.z + q.x * t.y - q.y * t.x) };
    return physics.raycast(pose.position, direction, { ignore: [entity, ...companionEntities], sensors: false })?.entity.id || '';
  }
  function optionsKey(code) {
    const options = dialogue.snapshot();
    if (code === 'KeyV') dialogue.setVoiceEnabled(!options.voiceEnabled);
    if (code === 'KeyB') dialogue.setSubtitlesEnabled(!options.subtitlesEnabled);
    if (code === 'KeyL') dialogue.setSubtitleLanguage(options.subtitleLanguage === 'en' ? 'zh-CN' : 'en');
    const value = dialogue.snapshot();
    const english = value.subtitleLanguage === 'en';
    text('notice', code === 'KeyL' ? (english ? 'Subtitles: English · L to switch' : '字幕：简体中文 · L 切换') :
      code === 'KeyV' ? (english ? `English voice: ${value.voiceEnabled ? 'On' : 'Off'} · V` :
        `英语语音${value.voiceEnabled ? '已开启' : '已关闭'} · V 切换`) :
      (english ? `Subtitles: ${value.subtitlesEnabled ? 'On' : 'Off'} · B` :
        `字幕${value.subtitlesEnabled ? '已开启' : '已关闭'} · B 切换`));
    settingsHint(value);
  }
  function settingsHint(value) {
    text('pauseHint', value.subtitleLanguage === 'en' ?
      'Click to start / resume · R Retry\nV English voice · B Subtitles · L Language' :
      '点击画面开始 / 继续 · R 重试\nV 英语语音 · B 字幕开关 · L 字幕语言');
  }
  function showPause(value) {
    ui.get('pauseTitle')?.setVisible(value);
    ui.get('pauseHint')?.setVisible(value);
    ui.get('crosshair')?.setVisible(!value);
    if (value) ui.get('prompt')?.setVisible(false);
  }
  function refreshFeedback() {
    handleMaterial.update({ color: flags.portalsActive ? '#a8e0cf' : '#e3bd71', emissive: '#192b26' });
    latchMaterial.update({ color: flags.returnStairOpen ? '#a8e0cf' : '#e3bd71', emissive: '#192b26' });
    exitMaterial.update({ color: flags.returnStairOpen ? '#caf7dc' : '#c6d1c2', emissive: '#596d58' });
    text('objective', flags.completed ? '巡检回路已恢复' : '抵达高处的出口');
  }
  function fail(cause) {
    error = String(cause?.message || cause);
    paused = true; time.timeScale = 0; input.releasePointerLock();
    text('notice', `运行失败：${error}。请重新加载，保留此错误。`);
    console.error('Foldline L01:', cause);
  }
  async function retry() {
    if (!ready || retrying || !alive) return;
    retrying = true; ready = false;
    stopFeedback(); dialogue.update(0, { paused: true });
    input.releasePointerLock(); controller.clearInput(); time.timeScale = 0;
    try {
      // The only reset of player position is native checkpoint restoration.
      // This restores the start, not a solved location or a scripted traversal.
      await saves.restore(initialSnapshot);
      if (!alive) return;
      portals.setQuality(quality); // release inactive render-target pool on retry
      controller.clearInput(); rig.setRotation(initialRotation); rig.update();
      companion.update(0, { paused: true, retracted: false }); companion.snap();
      holdingWheel = false; observationTime = 0; upperLookTime = 0; mountObstruction = ''; audioErrors.length = 0;
      portalEvents = []; blockedEvents = []; retryCount++; error = '';
      paused = true; time.timeScale = 0;
      text('notice', '已回到本关安全入口。点击继续。');
      showPause(true); ready = true;
    } catch (cause) { if (alive) fail(cause); }
    finally { retrying = false; }
  }
  function activateNativePair() {
    const source = a.place({ x: 11, y: 1.4, z: 7 }, { x: 0, y: 0, z: 6 }, { throughPortals: false });
    const destination = b.place({ x: 21.8, y: 3.8, z: 10 }, { x: 5, y: 0, z: 0 }, { throughPortals: false });
    if (!source.placed || !destination.placed)
      throw Error(`Fixed portal installation rejected: A1=${source.reason || source.placed}, B1=${destination.reason || destination.placed}`);
    a.link(b); a.setEnabled(true); b.setEnabled(true);
    flags.portalsActive = true;
    sound('mechanism-connect'); dialogue.emit('fold.ready');
    text('notice', '侧向检修接驳已启用。');
    refreshFeedback();
  }
  function chooseInteraction() {
    const ray = rig.camera.ray(.5, .5, 1.8);
    const trace = portals.raycast(ray.origin, ray.direction, { ignore: [entity], sensors: false, maxHops: 1 });
    if (trace.truncated || !trace.hit) return '';
    const hitId = trace.hit.entity.id;
    const id = ({ WheelHub: 'ShutterHandle', WheelSpokeA: 'ShutterHandle', WheelSpokeB: 'ShutterHandle',
      BlindGrip: 'InspectionBlind', LatchStem: 'UpperLatch' })[hitId] || hitId;
    return ['ShutterHandle', 'UpperLatch', 'StairGate', 'ExitDoor', 'InspectionBlind'].includes(id) ? id : '';
  }
  function interact() {
    if (interactTarget === 'ShutterHandle') {
      if (!flags.handleRequested) {
        flags.handleRequested = true; shutter.setTarget(1);
        sound('mechanism-turn');
        text('notice', '按住 E 转动手轮，松手时机械棘爪保持位置。');
      }
    } else if (interactTarget === 'UpperLatch') {
      if (!flags.latchRequested) {
        flags.latchRequested = true; gate.setTarget(1); exit.setTarget(1);
        sound('mechanism-return');
        text('notice', '配重正在拉起返梯隔离门与出口检修架。');
      }
    } else if (interactTarget === 'InspectionBlind') {
      if (!flags.blindRequested) {
        flags.blindRequested = true; blind.setTarget(1);
        sound('mechanism-inspect');
        text('notice', '检视百叶已松开。槽道通向同一座设备的另一面。');
      }
    } else if (interactTarget === 'StairGate') text('notice', '返回梯闩在上侧。');
    else if (interactTarget === 'ExitDoor') text('notice', '先释放上侧的返回梯闩。');
  }
  function snapshot() {
    const state = physics.getState(entity), camera = rig.camera.getPose();
    return structuredClone({ ready, error, phase: flags.completed ? 'complete' :
      flags.returnStairOpen ? 'return-open' : flags.portalsActive ? 'active' : 'locked',
      position: state.position, footPosition: { ...state.position, y: state.position.y - .9 },
      eyePosition: camera.position, rotation: camera.rotation, velocity: state.velocity,
      interactTarget, portalEvents, blockedEvents, returnStairOpen: flags.returnStairOpen,
      shutterProgress: shutter.getState().progress, gateProgress: gate.getState().progress,
      exitProgress: exit.getState().progress, blindProgress: blind.getState().progress,
      holdingWheel, companion: companion.snapshot(), mountObstruction, dialogue: dialogue.snapshot(), audioErrors,
      completed: flags.completed, retryCount, paused });
  }
  return {
    onStart() {
      controller = physics.character(entity);
      rig = cameras.createRig({ id: 'l01-first-person', target: entity, mode: 'firstPerson',
        rotation: initialRotation, eyeOffset: { x: 0, y: .7, z: 0 }, fov: 75,
        near: .02, far: 100, sensitivity: .002, uprightSpeed: 4 });
      portals.addSurface(required('A1Host'), { faces: ['-z'], margin: .02 });
      portals.addSurface(required('B1Host'), { faces: ['-x'], margin: .02 });
      a = portals.create({ id: 'A1', position: { x: 11, y: 1.4, z: 10 },
        rotation: { x: 0, y: 1, z: 0, w: 0 },
        width: 2.2, height: 2.8, shape: 'rectangle', color: '#dfc17e', enabled: false });
      b = portals.create({ id: 'B1', position: { x: 24, y: 3.8, z: 10 },
        rotation: { x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
        width: 2.2, height: 2.8, shape: 'rectangle', color: '#acdfd0', enabled: false });
      portals.watch(entity, { keepUpright: true });
      portals.setQuality(quality);
      shutter = motion.create(required('Shutter'), { to: { position: { x: 11, y: 5.45, z: 9.78 },
        rotation: identity }, duration: 1.1, easing: 'smoothstep' });
      gate = motion.create(required('StairGate'), { to: { position: { x: 22.125, y: 4.6, z: 2.75 },
        rotation: identity }, duration: 1.0, easing: 'smoothstep' });
      exit = motion.create(required('ExitDoor'), { to: { position: { x: 24.12, y: 7, z: 13 },
        rotation: identity }, duration: 1.0, easing: 'smoothstep' });
      blind = motion.create(required('InspectionBlind'), { to: { position: { x: 14.03, y: 3.1, z: 9.35 },
        rotation: identity }, duration: .7, easing: 'smoothstep' });
      shutter.setPaused(true);
      companion = createCompanion(ctx, { getPose: () => rig.camera.getPose() });
      companionEntities = companion.snapshot().parts.map(part => required(part.id));
      dialogue = createDialogue(ctx, dialogueData);
      handleMaterial = visuals.createMaterial({ color: '#e3bd71' }); handleMaterial.apply(required('ShutterHandle'));
      latchMaterial = visuals.createMaterial({ color: '#e3bd71' }); latchMaterial.apply(required('UpperLatch'));
      exitMaterial = visuals.createMaterial({ color: '#c6d1c2', emissive: '#596d58' }); exitMaterial.apply(required('ExitCrown'));
      saves.register('foldline.l01', { version: 2,
        capture: () => ({ flags: { ...flags }, shutter: shutter.getState(), gate: gate.getState(), exit: exit.getState(),
          blind: blind.getState(), dialogue: dialogue.capture() }),
        validate: value => value && typeof value.flags?.completed === 'boolean' && !!value.shutter && !!value.gate &&
          !!value.exit && !!value.blind && value.dialogue?.version === 1,
        restore(value) {
          flags = { ...value.flags }; shutter.restore(value.shutter); gate.restore(value.gate); exit.restore(value.exit);
          blind.restore(value.blind); dialogue.restore(value.dialogue); stopFeedback();
          refreshFeedback();
        },
      });
      portals.onTraverse(event => {
        if (event.entity !== entity) return;
        portalEvents.push({ source: event.source.id, destination: event.destination.id,
          position: { ...event.position }, velocity: { ...event.velocity } });
        if (!flags.crossed && event.source.id === 'A1') { flags.crossed = true; dialogue.emit('fold.crossed'); }
        // The physical player/camera warp is wholly native; only the attached
        // device's local articulation is snapped, never the player pose.
        companion.snap();
        if (portalEvents.length > 128) portalEvents.shift();
      });
      portals.onBlocked(event => {
        blockedEvents.push({ reason: event.reason });
        if (blockedEvents.length > 64) blockedEvents.shift();
        text('notice', '通路边缘受阻，请调整站位。');
      });
      const canvas = document.getElementById('renderCanvas');
      events.listen(canvas, 'pointerdown', async () => {
        if (!input.isPointerLocked() && ready && !retrying && !startingControl) {
          startingControl = true;
          // The native input service rejects pointer lock while simulation is
          // paused. Resume its next render frame before requesting the lock;
          // this remains within the initiating user gesture's activation.
          time.timeScale = 1;
          await new Promise(resolve => requestAnimationFrame(resolve));
          if (!alive) return;
          let granted = false;
          try {
            granted = await input.requestPointerLock();
            if (granted && alive) { try { await audio.unlock(); } catch (cause) { audioIssue('unlock', cause); } }
          } finally { startingControl = false; }
          if (alive && !granted) {
            time.timeScale = 0;
            text('notice', '鼠标锁定未获允许。请再次点击，或检查浏览器权限。');
          }
        }
      });
      input.onPointerLockChange(locked => {
        if (!alive) return;
        paused = !locked; controller.clearInput();
        dialogue.update(0, { paused: !locked });
        for (const voice of feedback) {
          if (!voice.playing) continue;
          try { if (locked) voice.resume(); else voice.pause(); } catch (cause) { audioIssue('pause', cause); }
        }
        time.timeScale = locked && !retrying ? 1 : 0;
        showPause(!locked);
      });
      // Native action input is intentionally disabled at timeScale=0. This
      // owner-tracked menu shortcut keeps retry available on the pause screen.
      events.listen(window, 'keydown', event => {
        if (paused && ready && !event.repeat && document.hasFocus() && ['KeyV', 'KeyB', 'KeyL'].includes(event.code)) {
          event.preventDefault(); optionsKey(event.code);
        }
        if (paused && ready && !retrying && !event.repeat && event.code === 'KeyR' && document.hasFocus()) {
          event.preventDefault(); retry();
        }
      });
      initialSnapshot = saves.capture();
      refreshFeedback(); rig.update();
      settingsHint(dialogue.snapshot());
      text('prompt', ''); text('notice', '');
      globalThis.foldlineL01 = Object.freeze({ snapshot });
      ready = true; time.timeScale = 0; showPause(true);
    },
    onFixedUpdate() {
      if (!ready || paused || retrying || error) { controller.clearInput(); return; }
      if (!flags.entered) { flags.entered = true; dialogue.emit('court.enter'); }
      controller.move(rig.direction(input.getAction('moveX'), input.getAction('moveZ')));
      if (input.wasActionPressed('jump')) controller.jump();
      if (flags.handleRequested && !flags.portalsActive && shutter.getState().progress >= .999) {
        try { activateNativePair(); } catch (cause) { fail(cause); }
      }
      if (flags.blindRequested && !flags.blindObserved && blind.getState().progress >= .999) {
        flags.blindObserved = true; dialogue.emit('maintenance.observed');
      }
      if (flags.latchRequested && !flags.returnStairOpen && gate.getState().progress >= .999 && exit.getState().progress >= .999) {
        flags.returnStairOpen = true; refreshFeedback(); text('notice', '实体返回楼梯已开放。');
        dialogue.emit('return.open');
      }
      const p = physics.getState(entity).position;
      if (flags.returnStairOpen && !flags.returned && p.y < 1.2 && p.x > 20.5 && p.z < 3.1) {
        flags.returned = true; dialogue.emit('court.returned');
      }
      if (flags.returnStairOpen && !flags.completed && p.x > 24.4 && p.x < 25.7 &&
        p.z > 12.15 && p.z < 13.85 && p.y > 3.15 && p.y < 3.7) {
        flags.completed = true; refreshFeedback();
        dialogue.emit('level.complete');
        text('notice', '出口已通。可以沿返梯继续探索，或按 R 重试本关。');
      }
      if (p.y < -5) retry();
    },
    onUpdate() {
      if (!ready || error) return;
      dialogue.update(time.deltaTime, { paused: paused || retrying });
      const dialogueState = dialogue.snapshot();
      settingsHint(dialogueState);
      const p = physics.getState(entity).position;
      const nearFold = flags.portalsActive && ((Math.abs(p.z - 10) < 1.35 && Math.abs(p.x - 11) < 1.65 && p.y < 2) ||
        (Math.abs(p.x - 24) < 1.35 && Math.abs(p.z - 10) < 1.65 && p.y > 2.5));
      const companionState = { paused,
        speaking: dialogueState.currentSpeaker === 'zhanque' && (dialogueState.audioPlaying || dialogueState.subtitlesEnabled),
        delivery: dialogueState.currentDelivery,
        observing: observationTime > 0 || upperLookTime > 0 || !!interactTarget, retracted: nearFold };
      if (paused || retrying) {
        holdingWheel = false; shutter.setPaused(true); companion.update(0, companionState);
      }
      if (input.wasActionPressed('retry')) { retry(); return; }
      if (paused || retrying || !input.isPointerLocked()) return;
      const delta = input.getMouseDelta(); rig.look(delta.x, delta.y); rig.update();
      mountObstruction = mountedObstruction();
      companionState.retracted = nearFold || !!mountObstruction;
      companion.update(time.deltaTime, companionState);
      if (input.wasActionPressed('voice')) optionsKey('KeyV');
      if (input.wasActionPressed('subtitles')) optionsKey('KeyB');
      if (input.wasActionPressed('language')) optionsKey('KeyL');
      interactTarget = chooseInteraction();
      holdingWheel = !flags.portalsActive && interactTarget === 'ShutterHandle' && input.isActionDown('interact');
      shutter.setPaused(!holdingWheel || flags.portalsActive);
      if (holdingWheel && !flags.handleRequested) interact();
      const progress = shutter.getState().progress;
      required('WheelSpokeA').rotation.x = progress * Math.PI * 4;
      required('WheelSpokeB').rotation.x = progress * Math.PI * 4;
      required('BlindGrip').position.y = 1.02 + blind.getState().progress * 2.1;
      required('GaugeNeedle').rotation.z = progress * -1.2;
      required('ReturnCounterweight').position.y = 4.6 - gate.getState().progress * 2.6;
      required('LatchStem').rotation.x = -gate.getState().progress;
      for (const [id, y] of [['ExitRackRailA', 3.8], ['ExitRackRailB', 3.8], ['ExitRackBraceA', 3.0], ['ExitRackBraceB', 4.5]])
        required(id).position.y = y + exit.getState().progress * 3.2;
      const prompts = { ShutterHandle: flags.portalsActive ? '侧向接驳已接通' : `按住 E · 转动遮板手轮 ${Math.round(progress * 100)}%`,
        UpperLatch: flags.returnStairOpen ? '实体回路已开放' : 'E · 拉下检修架配重闩',
        InspectionBlind: flags.blindRequested ? '检视槽已打开' : 'E · 推开检视百叶（可选）',
        StairGate: '返回梯闩在上侧', ExitDoor: '出口联锁 · 上侧梯闩' };
      text('prompt', prompts[interactTarget] || '');
      if (input.wasActionPressed('interact')) interact();
      noticeAge += time.deltaTime;
      if (noticeAge > 3.4) text('notice', '');
      const eye = rig.camera.getPose().position;
      if (!flags.exitSeen && !flags.crossed && p.y < 2) {
        const ray = rig.camera.ray(.5, .5, 1).direction;
        const target = { x: 24.12 - eye.x, y: 4.6 - eye.y, z: 13 - eye.z };
        const length = Math.hypot(target.x, target.y, target.z);
        const aligned = (ray.x * target.x + ray.y * target.y + ray.z * target.z) / length > .93;
        const hit = aligned ? physics.raycast(eye, target, { ignore: [entity], sensors: false }) : null;
        const visible = hit?.entity.id === 'ExitDoor';
        observationTime = aligned && visible ? observationTime + time.deltaTime : 0;
        if (observationTime > .6) { flags.exitSeen = true; observationTime = 0; dialogue.emit('exit.seen'); }
      }
      // Optional recognition of the actual starting-side cabinet from the
      // upper overlook. Occlusion and deliberate sustained gaze matter; merely
      // entering an area does not count as looking back or gate progression.
      if (flags.crossed && !flags.lookedBack) {
        const atOverlook = p.y > 3.1 && p.x < 21.6 && p.z > 11.1;
        const target = { x: 11 - eye.x, y: 3.8 - eye.y, z: 10.1 - eye.z };
        const direction = rig.camera.ray(.5, .5, 1).direction;
        const length = Math.hypot(target.x, target.y, target.z);
        const aligned = atOverlook && (direction.x * target.x + direction.y * target.y + direction.z * target.z) / length > .965;
        const hit = aligned ? physics.raycast(eye, target, { ignore: [entity], sensors: false }) : null;
        upperLookTime = hit?.entity.id === 'A1CabinetCrown' ? upperLookTime + time.deltaTime : 0;
        if (upperLookTime > .8) { flags.lookedBack = true; upperLookTime = 0; dialogue.emit('upper.lookback'); }
      }
      if (!flags.blockedSeen && !flags.returnStairOpen && p.x > 20.0 && p.z < 3.1 && p.y < 1.2) {
        flags.blockedSeen = true; dialogue.emit('route.blocked');
      }
    },
    onDestroy() {
      alive = false; ready = false;
      stopFeedback(); dialogue?.dispose(); companion?.dispose();
      delete globalThis.foldlineL01;
      // Native owner cleanup releases surfaces, portals, rig, motions, providers,
      // material overlays and all events.listen/onPointerLock subscriptions.
    },
  };
}
