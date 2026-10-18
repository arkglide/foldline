import { createDialogue } from "./dialogue.js";
import { createCompanion } from "./companion.js";
import dialogueData from "./data/l02-dialogue.js";
import crateGeometry from "./data/l02-crate.js";
import artData from "./data/l02-art.js";

/** C01-L02. All movement, picking paths, spring forces and crossings are native. */
export default function (ctx) {
  const {
    entity,
    scene,
    physics,
    cameras,
    portals,
    interaction,
    input,
    events,
    ui,
    time,
    motion,
    saves,
    visuals,
    audio,
  } = ctx;
  const required = (id) => {
    const e = scene.find(id);
    if (!e) throw Error(`L02 missing ${id}`);
    return e;
  };
  const identity = { x: 0, y: 0, z: 0, w: 1 },
    yaw = Math.atan2(7, 4),
    pitch = 0.055;
  const initialRotation = {
    x: Math.sin(pitch / 2) * Math.cos(yaw / 2),
    y: Math.cos(pitch / 2) * Math.sin(yaw / 2),
    z: -Math.sin(pitch / 2) * Math.sin(yaw / 2),
    w: Math.cos(pitch / 2) * Math.cos(yaw / 2),
  };
  const quality = {
    depth: 2,
    scale: 1,
    recursiveScale: 0.75,
    samples: 1,
    maxViews: 6,
  };
  let rig,
    controller,
    a,
    b,
    door,
    crate,
    grab,
    companion,
    dialogue,
    initialSnapshot,
    restoreGrade;
  let ready = false,
    alive = true,
    paused = true,
    retrying = false,
    starting = false,
    error = "",
    retryCount = 0,
    stableTime = 0,
    noticeAge = 0;
  let companionEntities = [],
    interactTarget = "",
    pickPath = [],
    rayHit = "",
    observing = 0,
    foldObserving = 0;
  let flags = {
    entered: false,
    glassSeen: false,
    foldSeen: false,
    borrowed: false,
    busCommissioned: false,
    isolationCommanded: false,
    completed: false,
  };
  const portalEvents = [],
    blockedEvents = [],
    feedback = [],
    audioErrors = [],
    artHandles = [],
    styleHandles = {},
    textCache = new Map();
  function text(id, value) {
    if (id === "notice") noticeAge = 0;
    if (id === "prompt") ui.get(id)?.setVisible(!!value && !paused);
    if (id === "notice") ui.get(id)?.setVisible(!!value);
    if (textCache.get(id) !== value) {
      textCache.set(id, value);
      ui.get(id)?.setText(value);
    }
  }
  function sound(id) {
    try {
      if (!audio.list().includes(id)) return;
      feedback.push(
        audio.play(id, { bus: "mechanical", priority: 5, volume: 0.65 }),
      );
      if (feedback.length > 8) feedback.shift().stop();
    } catch (e) {
      audioErrors.push(String(e));
    }
  }
  function stopFeedback() {
    for (const h of feedback.splice(0)) h.stop();
  }
  function release() {
    grab?.release();
    grab = null;
  }
  function settings() {
    const s = dialogue.snapshot(),
      en = s.subtitleLanguage === "en";
    text(
      "pauseHint",
      en
        ? "Click to resume · WASD Move · Mouse Look\nE Take / Release · Space Jump · R Retry · Esc Pause\nV English voice · B Subtitles · L Language"
        : "点击开始 / 继续 · WASD移动 · 鼠标观察\nE拿取 / 松手 · 空格跳跃 · R重试 · Esc暂停\nV英语语音 · B字幕 · L语言",
    );
  }
  function options(code) {
    const s = dialogue.snapshot();
    if (code === "KeyV") dialogue.setVoiceEnabled(!s.voiceEnabled);
    if (code === "KeyB") dialogue.setSubtitlesEnabled(!s.subtitlesEnabled);
    if (code === "KeyL")
      dialogue.setSubtitleLanguage(
        s.subtitleLanguage === "en" ? "zh-CN" : "en",
      );
    settings();
  }
  function showPause(value) {
    for (const id of ["pauseTitle", "pauseHint"]) ui.get(id)?.setVisible(value);
    ui.get("crosshair")?.setVisible(!value);
    if (value) ui.get("prompt")?.setVisible(false);
  }
  function refresh() {
    text(
      "objective",
      flags.completed
        ? "检修接驳已恢复"
        : flags.busCommissioned
          ? "通路已开放"
          : flags.borrowed
            ? "恢复检修接驳供电"
            : "恢复检修接驳供电",
    );
    styleHandles.lamp?.update({
      color: flags.busCommissioned ? "#afd4bf" : "#c8a35f",
      emissive: flags.busCommissioned ? "#4c7666" : "#292719",
    });
    required("DockPawl").rotation.x = flags.busCommissioned ? -0.8 : 0;
  }
  function fail(e) {
    error = String(e?.message || e);
    paused = true;
    time.timeScale = 0;
    input.releasePointerLock();
    text("notice", `运行失败：${error}`);
    console.error("Foldline L02", e);
  }
  async function retry() {
    if (!ready || retrying || !alive) return;
    retrying = true;
    ready = false;
    release();
    stopFeedback();
    dialogue.update(0, { paused: true });
    input.releasePointerLock();
    controller.clearInput();
    time.timeScale = 0;
    try {
      await saves.restore(initialSnapshot);
      if (!alive) return;
      portals.setQuality(quality);
      rig.setRotation(initialRotation);
      rig.update();
      companion.snap();
      stableTime = 0;
      observing = 0;
      foldObserving = 0;
      portalEvents.length = 0;
      blockedEvents.length = 0;
      audioErrors.length = 0;
      interactTarget = "";
      retryCount++;
      error = "";
      paused = true;
      ready = true;
      text("notice", "已恢复本关安全检查点。点击继续。");
      showPause(true);
    } catch (e) {
      if (alive) fail(e);
    } finally {
      retrying = false;
    }
  }
  function choose() {
    const ray = rig.camera.ray(0.5, 0.5, 5.5),
      trace = portals.raycast(ray.origin, ray.direction, {
        ignore: [entity],
        sensors: false,
        maxHops: 2,
      });
    pickPath = [...trace.path];
    rayHit = trace.hit?.entity.id || "";
    if (trace.truncated) return "";
    if (rayHit === "Coupler") return "Coupler";
    if (rayHit === "ObservationGlass") return "Glass";
    return "";
  }
  function interact() {
    if (grab?.active) {
      release();
      sound("mechanism-inspect");
      return;
    }
    if (interactTarget === "Coupler") {
      grab = interaction.grab(crate, {
        holder: entity,
        path: pickPath,
        maxDistance: 5.5,
        stiffness: 500,
        damping: 95,
        maxForce: 1800,
      });
      const ray = rig.camera.ray(0.5, 0.5, 1);
      grab.setRay(ray.origin, ray.direction, 1.5);
      sound("mechanism-inspect");
    } else if (interactTarget === "Glass") {
      sound("mechanism-inspect");
      if (!flags.glassSeen) {
        flags.glassSeen = true;
        dialogue.emit("glass.observed");
      }
    }
  }
  function obstructedMount() {
    const pose = rig.camera.getPose(),
      q = pose.rotation,
      v = { x: 0.39, y: -0.28, z: 0.7 };
    const t = {
      x: 2 * (q.y * v.z - q.z * v.y),
      y: 2 * (q.z * v.x - q.x * v.z),
      z: 2 * (q.x * v.y - q.y * v.x),
    };
    const direction = {
      x: 1.16 * (v.x + q.w * t.x + q.y * t.z - q.z * t.y),
      y: 1.16 * (v.y + q.w * t.y + q.z * t.x - q.x * t.z),
      z: 1.16 * (v.z + q.w * t.z + q.x * t.y - q.y * t.x),
    };
    return !!physics.raycast(pose.position, direction, {
      ignore: [entity, ...companionEntities],
      sensors: false,
    });
  }
  function snapshot() {
    const state = physics.getState(entity),
      c = physics.getState(crate),
      camera = rig.camera.getPose();
    return structuredClone({
      ready,
      error,
      paused,
      retryCount,
      position: state.position,
      footPosition: { ...state.position, y: state.position.y - 0.9 },
      eyePosition: camera.position,
      rotation: camera.rotation,
      velocity: state.velocity,
      interactTarget,
      pickPath,
      rayHit,
      holding: !!grab?.active,
      crate: {
        position: c.position,
        rotation: c.rotation,
        velocity: c.velocity,
      },
      stableTime,
      gateProgress: door.getState().progress,
      flags,
      completed: flags.completed,
      phase: flags.completed
        ? "complete"
        : flags.busCommissioned
          ? "powered"
          : flags.borrowed
            ? "borrowed"
            : "isolated",
      portalEvents,
      blockedEvents,
      companion: companion.snapshot(),
      dialogue: dialogue.snapshot(),
      audioErrors,
    });
  }
  return {
    onStart() {
      for (const [style, ids] of Object.entries(artData.groups)) {
        const h = visuals.createMaterial({
          color: artData.palette[style],
          ...(style === "glass" ? { alpha: 0.15, doubleSided: true } : {}),
        });
        artHandles.push(h);
        for (const id of ids) h.apply(required(id));
      }
      const lamp = visuals.createMaterial({
        color: "#c8a35f",
        emissive: "#292719",
      });
      artHandles.push(lamp);
      styleHandles.lamp = lamp;
      lamp.apply(required("DockLamp"));
      lamp.apply(required("RelayLamp"));
      crate = required("Coupler");
      const trimMaterial = visuals.createMaterial({ color: "#263e42" });
      artHandles.push(trimMaterial);
      artHandles.push(
        visuals.createMesh(crateGeometry, {
          id: "coupler:trim",
          name: "Coupler handle and armour",
          parent: crate,
          material: trimMaterial,
        }),
      );
      controller = physics.character(entity);
      rig = cameras.createRig({
        id: "l02-first-person",
        target: entity,
        mode: "firstPerson",
        rotation: initialRotation,
        eyeOffset: { x: 0, y: 0.7, z: 0 },
        fov: 75,
        near: 0.02,
        far: 100,
        sensitivity: 0.002,
        uprightSpeed: 4,
      });
      portals.addSurface(required("A2Host"), { faces: ["-z"], margin: 0.02 });
      portals.addSurface(required("B2Host"), { faces: ["+x"], margin: 0.02 });
      a = portals.create({
        id: "A2",
        position: { x: 28, y: 3.55, z: 16 },
        rotation: { x: 0, y: 1, z: 0, w: 0 },
        width: 0.8,
        height: 0.9,
        shape: "rectangle",
        color: "#dfc17e",
        enabled: false,
      });
      b = portals.create({
        id: "B2",
        position: { x: 35, y: 3.55, z: 19 },
        rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
        width: 0.8,
        height: 0.9,
        shape: "rectangle",
        color: "#acdfd0",
        enabled: false,
      });
      const ap = a.place(
        { x: 28, y: 3.55, z: 14 },
        { x: 0, y: 0, z: 4 },
        { throughPortals: false },
      );
      const bp = b.place(
        { x: 35.6, y: 3.55, z: 19 },
        { x: -2, y: 0, z: 0 },
        { throughPortals: false },
      );
      if (!ap.placed || !bp.placed)
        throw Error(
          `L02 fixed installation: ${ap.reason || ap.placed}/${bp.reason || bp.placed}`,
        );
      a.link(b);
      a.setEnabled(true);
      b.setEnabled(true);
      portals.watch(entity, { keepUpright: true });
      portals.watch(crate);
      portals.setQuality(quality);
      door = motion.create(required("ExitDoor"), {
        to: { position: { x: 28.7, y: 7, z: 24.15 }, rotation: identity },
        duration: 1.2,
        easing: "smoothstep",
      });
      companion = createCompanion(ctx, { getPose: () => rig.camera.getPose() });
      companionEntities = companion.snapshot().parts.map((p) => p.id);
      dialogue = createDialogue(ctx, dialogueData);
      portals.onTraverse((e) => {
        portalEvents.push({
          entity: e.entity.id,
          source: e.source.id,
          destination: e.destination.id,
          position: e.position,
          velocity: e.velocity,
        });
        if (portalEvents.length > 64) portalEvents.shift();
        if (e.entity === crate && e.source.id === "B2" && !flags.borrowed) {
          flags.borrowed = true;
          dialogue.emit("crate.borrowed");
          sound("mechanism-connect");
          refresh();
        }
        if (e.entity === entity) companion.snap();
      });
      portals.onBlocked((e) => {
        if (blockedEvents.length >= 32) blockedEvents.shift();
        blockedEvents.push({ entity: e.entity?.id, reason: e.reason });
      });
      saves.register("foldline.l02", {
        version: 1,
        capture: () => ({
          flags: { ...flags },
          door: door.getState(),
          dialogue: dialogue.capture(),
        }),
        validate: (v) =>
          v &&
          typeof v.flags?.busCommissioned === "boolean" &&
          !!v.door &&
          v.dialogue?.version === 1,
        restore(v) {
          release();
          flags = { ...v.flags };
          door.restore(v.door);
          dialogue.restore(v.dialogue);
          stableTime = 0;
          refresh();
        },
      });
      const canvas = document.getElementById("renderCanvas"),
        old = canvas.style.filter;
      canvas.style.filter = "saturate(0.94) contrast(1.025)";
      restoreGrade = () => {
        canvas.style.filter = old;
      };
      events.listen(canvas, "pointerdown", async () => {
        if (input.isPointerLocked() || !ready || retrying || starting) return;
        starting = true;
        time.timeScale = 1;
        await new Promise(requestAnimationFrame);
        if (!alive) return;
        try {
          if (await input.requestPointerLock()) await audio.unlock();
          else time.timeScale = 0;
        } catch (e) {
          audioErrors.push(String(e));
        } finally {
          starting = false;
        }
      });
      input.onPointerLockChange((locked) => {
        if (!alive) return;
        paused = !locked;
        controller.clearInput();
        dialogue.update(0, { paused });
        time.timeScale = locked && !retrying ? 1 : 0;
        for (const h of feedback) {
          try {
            if (h.playing) {
              if (locked) h.resume();
              else h.pause();
            }
          } catch {}
        }
        showPause(paused);
      });
      events.listen(window, "keydown", (e) => {
        if (!paused || !ready || e.repeat || !document.hasFocus()) return;
        if (["KeyV", "KeyB", "KeyL"].includes(e.code)) {
          e.preventDefault();
          options(e.code);
        }
        if (e.code === "KeyR") {
          e.preventDefault();
          retry();
        }
      });
      initialSnapshot = saves.capture();
      rig.update();
      refresh();
      settings();
      text("prompt", "");
      text("notice", "");
      ready = true;
      time.timeScale = 0;
      showPause(true);
      globalThis.foldlineL02 = Object.freeze({ snapshot });
    },
    onFixedUpdate() {
      if (!ready || paused || retrying || error) {
        controller.clearInput();
        return;
      }
      if (!flags.entered) {
        flags.entered = true;
        dialogue.emit("bay.enter");
      }
      controller.move(
        rig.direction(input.getAction("moveX"), input.getAction("moveZ")),
      );
      if (input.wasActionPressed("jump")) controller.jump();
      const c = physics.getState(crate),
        p = c.position;
      const settled =
        !grab?.active &&
        Math.abs(p.x - 27) < 0.45 &&
        Math.abs(p.z - 20) < 0.55 &&
        p.y > 2.95 &&
        p.y < 3.18 &&
        Math.hypot(c.velocity.x, c.velocity.y, c.velocity.z) < 0.18;
      stableTime = settled ? stableTime + time.fixedDeltaTime : 0;
      if (!flags.busCommissioned && stableTime >= 0.3) {
        flags.busCommissioned = true;
        flags.isolationCommanded = true;
        door.setTarget(1);
        sound("mechanism-return");
        dialogue.emit("dock.latched");
        refresh();
      }
      const player = physics.getState(entity).position;
      if (
        !flags.completed &&
        flags.busCommissioned &&
        door.getState().progress >= 0.999 &&
        player.z > 24.45 &&
        player.z < 25.9 &&
        player.x > 27.2 &&
        player.x < 30.2
      ) {
        flags.completed = true;
        dialogue.emit("level.complete");
        refresh();
        text("notice", "本关结束。可以回看或按R重试。");
      }
      if (player.y < 0) retry();
    },
    onUpdate() {
      if (!ready || error) return;
      dialogue.update(time.deltaTime, { paused: paused || retrying });
      settings();
      const d = dialogue.snapshot();
      const companionState = {
        paused,
        speaking:
          d.currentSpeaker === "zhanque" &&
          (d.audioPlaying || d.subtitlesEnabled),
        delivery: d.currentDelivery,
        observing: observing > 0 || foldObserving > 0 || !!interactTarget,
        retracted: !!grab?.active || interactTarget === "Coupler",
      };
      if (input.wasActionPressed("retry")) {
        retry();
        return;
      }
      if (paused || retrying || !input.isPointerLocked()) {
        companion.update(0, companionState);
        return;
      }
      const delta = input.getMouseDelta();
      rig.look(delta.x, delta.y);
      rig.update();
      for (const [action, code] of [
        ["voice", "KeyV"],
        ["subtitles", "KeyB"],
        ["language", "KeyL"],
      ])
        if (input.wasActionPressed(action)) options(code);
      interactTarget = choose();
      const eye = rig.camera.getPose().position;
      // No automatic camera direction or zone-as-gaze. The glass/crate or fold
      // must actually be under the player's reticle for these optional remarks.
      observing =
        rayHit === "ObservationGlass" && !flags.glassSeen
          ? observing + time.deltaTime
          : 0;
      if (observing > 0.7) {
        flags.glassSeen = true;
        dialogue.emit("glass.observed");
        observing = 0;
      }
      foldObserving =
        pickPath.includes("A2") && !flags.foldSeen
          ? foldObserving + time.deltaTime
          : 0;
      if (foldObserving > 0.6) {
        flags.foldSeen = true;
        dialogue.emit("fold.observed");
        foldObserving = 0;
      }
      if (grab?.active) {
        const ray = rig.camera.ray(0.5, 0.5, 1);
        grab.setRay(ray.origin, ray.direction, 1.5);
      } else if (grab) release();
      if (input.wasActionPressed("interact")) interact();
      text(
        "prompt",
        grab?.active
          ? "E · 松手"
          : interactTarget === "Coupler"
            ? "E · 拿取接驳匣"
            : interactTarget === "Glass"
              ? "隔离观察窗"
              : "",
      );
      companionState.retracted =
        !!grab?.active ||
        (Math.abs(eye.x - 28) < 1 && Math.abs(eye.z - 16) < 1.6) ||
        obstructedMount();
      companion.update(time.deltaTime, companionState);
      noticeAge += time.deltaTime;
      if (noticeAge > 3.4) text("notice", "");
    },
    onDestroy() {
      alive = false;
      ready = false;
      release();
      stopFeedback();
      dialogue?.dispose();
      companion?.dispose();
      for (const h of artHandles.reverse()) h.destroy();
      restoreGrade?.();
      delete globalThis.foldlineL02;
    },
  };
}
