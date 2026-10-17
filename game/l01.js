/** C01-L01 only. Native ArkGlide script; no gameplay teleport or camera cuts. */
export default function ({ entity, scene, physics, cameras, portals, input, events, ui, time, motion, saves, visuals }) {
  const required = id => { const e = scene.find(id); if (!e) throw Error(`L01 missing ${id}`); return e; };
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  const quality = { depth: 2, scale: 1, recursiveScale: .75, samples: 1, maxViews: 6 };
  const yaw = Math.atan2(14.5, 10), pitch = -.10;
  const initialRotation = { x: Math.sin(pitch / 2) * Math.cos(yaw / 2),
    y: Math.cos(pitch / 2) * Math.sin(yaw / 2), z: -Math.sin(pitch / 2) * Math.sin(yaw / 2),
    w: Math.cos(pitch / 2) * Math.cos(yaw / 2) };
  let rig, controller, a, b, shutter, gate, exit, initialSnapshot;
  let handleMaterial, latchMaterial, exitMaterial;
  let ready = false, alive = true, retrying = false, startingControl = false, retryCount = 0, paused = true, error = '';
  let interactTarget = '', portalEvents = [], blockedEvents = [];
  let flags = { handleRequested: false, portalsActive: false, latchRequested: false,
    returnStairOpen: false, completed: false };
  const textCache = new Map();
  function text(id, value) {
    if (id === 'prompt') ui.get(id)?.setVisible(!!value && !paused);
    if (id === 'notice') ui.get(id)?.setVisible(!!value);
    if (textCache.get(id) === value) return;
    textCache.set(id, value); ui.get(id)?.setText(value);
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
    text('objective', flags.completed ? '侧向通行 · 灰盒操作链完成' : '抵达高处的出口');
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
    input.releasePointerLock(); controller.clearInput(); time.timeScale = 0;
    try {
      // The only reset of player position is native checkpoint restoration.
      // This restores the start, not a solved location or a scripted traversal.
      await saves.restore(initialSnapshot);
      if (!alive) return;
      portals.setQuality(quality); // release inactive render-target pool on retry
      controller.clearInput(); rig.setRotation(initialRotation); rig.update();
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
    text('notice', '侧向检修接驳已启用。');
    refreshFeedback();
  }
  function chooseInteraction() {
    const ray = rig.camera.ray(.5, .5, 1.8);
    const trace = portals.raycast(ray.origin, ray.direction, { ignore: [entity], sensors: false, maxHops: 1 });
    if (trace.truncated || !trace.hit) return '';
    const id = trace.hit.entity.id;
    return ['ShutterHandle', 'UpperLatch', 'StairGate', 'ExitDoor'].includes(id) ? id : '';
  }
  function interact() {
    if (interactTarget === 'ShutterHandle') {
      if (!flags.handleRequested) {
        flags.handleRequested = true; shutter.setTarget(1);
        text('notice', '遮板正在收起。');
      }
    } else if (interactTarget === 'UpperLatch') {
      if (!flags.latchRequested) {
        flags.latchRequested = true; gate.setTarget(1); exit.setTarget(1);
        text('notice', '梯闩已释放，返回通路正在开启。');
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
      exitProgress: exit.getState().progress, completed: flags.completed, retryCount, paused });
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
        width: 2.2, height: 2.8, shape: 'rectangle', color: '#dfc17e', enabled: false });
      b = portals.create({ id: 'B1', position: { x: 24, y: 3.8, z: 10 },
        width: 2.2, height: 2.8, shape: 'rectangle', color: '#acdfd0', enabled: false });
      portals.watch(entity, { keepUpright: true });
      portals.setQuality(quality);
      shutter = motion.create(required('Shutter'), { to: { position: { x: 11, y: 5.45, z: 9.78 },
        rotation: identity }, duration: 1.1, easing: 'smoothstep' });
      gate = motion.create(required('StairGate'), { to: { position: { x: 22.125, y: 4.6, z: 2.75 },
        rotation: identity }, duration: 1.0, easing: 'smoothstep' });
      exit = motion.create(required('ExitDoor'), { to: { position: { x: 24.12, y: 7, z: 13 },
        rotation: identity }, duration: 1.0, easing: 'smoothstep' });
      handleMaterial = visuals.createMaterial({ color: '#e3bd71' }); handleMaterial.apply(required('ShutterHandle'));
      latchMaterial = visuals.createMaterial({ color: '#e3bd71' }); latchMaterial.apply(required('UpperLatch'));
      exitMaterial = visuals.createMaterial({ color: '#c6d1c2', emissive: '#596d58' }); exitMaterial.apply(required('ExitCrown'));
      saves.register('foldline.l01', { version: 1,
        capture: () => ({ flags: { ...flags }, shutter: shutter.getState(), gate: gate.getState(), exit: exit.getState() }),
        validate: value => value && typeof value.flags?.completed === 'boolean' && !!value.shutter && !!value.gate && !!value.exit,
        restore(value) {
          flags = { ...value.flags }; shutter.restore(value.shutter); gate.restore(value.gate); exit.restore(value.exit);
          refreshFeedback();
        },
      });
      portals.onTraverse(event => {
        if (event.entity !== entity) return;
        portalEvents.push({ source: event.source.id, destination: event.destination.id,
          position: { ...event.position }, velocity: { ...event.velocity } });
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
          const granted = await input.requestPointerLock();
          startingControl = false;
          if (alive && !granted) {
            time.timeScale = 0;
            text('notice', '鼠标锁定未获允许。请再次点击，或检查浏览器权限。');
          }
        }
      });
      input.onPointerLockChange(locked => {
        if (!alive) return;
        paused = !locked; controller.clearInput();
        time.timeScale = locked && !retrying ? 1 : 0;
        showPause(!locked);
      });
      // Native action input is intentionally disabled at timeScale=0. This
      // owner-tracked menu shortcut keeps retry available on the pause screen.
      events.listen(window, 'keydown', event => {
        if (paused && ready && !retrying && !event.repeat && event.code === 'KeyR' && document.hasFocus()) {
          event.preventDefault(); retry();
        }
      });
      initialSnapshot = saves.capture();
      refreshFeedback(); rig.update();
      text('prompt', ''); text('notice', '');
      globalThis.foldlineL01 = Object.freeze({ snapshot });
      ready = true; time.timeScale = 0; showPause(true);
    },
    onFixedUpdate() {
      if (!ready || paused || retrying || error) { controller.clearInput(); return; }
      controller.move(rig.direction(input.getAction('moveX'), input.getAction('moveZ')));
      if (input.wasActionPressed('jump')) controller.jump();
      if (flags.handleRequested && !flags.portalsActive && shutter.getState().progress >= .999) {
        try { activateNativePair(); } catch (cause) { fail(cause); }
      }
      if (flags.latchRequested && !flags.returnStairOpen && gate.getState().progress >= .999 && exit.getState().progress >= .999) {
        flags.returnStairOpen = true; refreshFeedback(); text('notice', '实体返回楼梯已开放。');
      }
      const p = physics.getState(entity).position;
      if (flags.returnStairOpen && !flags.completed && p.x > 24.4 && p.x < 25.7 &&
        p.z > 12.15 && p.z < 13.85 && p.y > 3.15 && p.y < 3.7) {
        flags.completed = true; refreshFeedback();
        text('notice', 'L01 操作链完成。可继续检查空间，或按 R 重试。');
      }
      if (p.y < -5) retry();
    },
    onUpdate() {
      if (!ready || error) return;
      if (input.wasActionPressed('retry')) { retry(); return; }
      if (paused || retrying || !input.isPointerLocked()) return;
      const delta = input.getMouseDelta(); rig.look(delta.x, delta.y); rig.update();
      interactTarget = chooseInteraction();
      const prompts = { ShutterHandle: flags.handleRequested ? '检修接驳已启用' : 'E · 收起检修遮板',
        UpperLatch: flags.returnStairOpen ? '返回梯已开放' : 'E · 释放返回梯闩',
        StairGate: '返回梯闩在上侧', ExitDoor: '出口联锁 · 上侧梯闩' };
      text('prompt', prompts[interactTarget] || '');
      if (input.wasActionPressed('interact')) interact();
    },
    onDestroy() {
      alive = false; ready = false;
      delete globalThis.foldlineL01;
      // Native owner cleanup releases surfaces, portals, rig, motions, providers,
      // material overlays and all events.listen/onPointerLock subscriptions.
    },
  };
}
