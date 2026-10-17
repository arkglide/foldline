import assert from 'node:assert/strict';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const wrapAngle = value => Math.atan2(Math.sin(value), Math.cos(value));

export function cameraAngles(rotation) {
  const { x, y, z, w } = rotation;
  const forward = {
    x: 2 * (x * z + w * y),
    y: 2 * (y * z - w * x),
    z: 1 - 2 * (x * x + y * y),
  };
  return {
    yaw: Math.atan2(forward.x, forward.z),
    pitch: Math.atan2(forward.y, Math.hypot(forward.x, forward.z)),
    forward,
  };
}

/**
 * Browser input only. snapshot() is read-only; this driver never obtains a
 * physics body, camera rig, portal, save provider, or mutable game handle.
 * A relative PointerEvent follows the same input-to-rig path as the official
 * ArkGlide portal browser test, avoiding CDP pointer-lock recenter cancellation.
 */
export class InputDriver {
  constructor(page, frame, { sensitivity = 0.002 } = {}) {
    this.page = page;
    this.frame = frame;
    this.sensitivity = sensitivity;
    this.log = [];
    this.keys = new Set();
  }

  async snapshot() {
    return this.frame.evaluate(() => foldlineL01.snapshot());
  }

  async waitFor(predicate, label, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    let state;
    while (Date.now() < deadline) {
      state = await this.snapshot();
      if (predicate(state)) return state;
      await sleep(60);
    }
    throw Error(`${label}: timed out; snapshot=${JSON.stringify(state)}`);
  }

  async lockPointer() {
    const canvas = this.frame.locator('#renderCanvas');
    let clicked = false;
    if (!(await this.frame.evaluate(() => !!document.pointerLockElement))) {
      await canvas.click({ position: { x: 400, y: 300 } });
      clicked = true;
    }
    await this.frame.waitForFunction(() => document.hasFocus() &&
      document.pointerLockElement === document.getElementById('renderCanvas'));
    if (clicked) {
      await this.frame.evaluate(async () => {
        await new Promise(resolve => requestAnimationFrame(resolve));
        await new Promise(resolve => requestAnimationFrame(resolve));
      });
    }
    this.log.push({ action: 'pointer-lock' });
  }

  async relativeLook(movementX, movementY) {
    const beforeFrame = await this.frame.evaluate(({ movementX, movementY }) => {
      const before = time.frameCount;
      document.getElementById('renderCanvas').dispatchEvent(new PointerEvent('pointermove', {
        movementX, movementY, bubbles: true,
      }));
      return before;
    }, { movementX, movementY });
    // RAF also fires when the runtime frame pacer skips simulation. Wait for
    // the native session's read-only frame counter instead, so every mouse
    // correction is consumed before calculating the next camera correction.
    await this.frame.waitForFunction(before => time.frameCount > before, beforeFrame,
      { timeout: 5000 });
  }

  async aimAt(target, { tolerance = 0.035 } = {}) {
    for (let attempt = 0; attempt < 26; attempt++) {
      const state = await this.snapshot();
      const eye = state.eyePosition;
      const dx = target.x - eye.x;
      const dz = target.z - eye.z;
      const dy = (target.y ?? eye.y) - eye.y;
      const current = cameraAngles(state.rotation);
      const yaw = wrapAngle(Math.atan2(dx, dz) - current.yaw);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz)) - current.pitch;
      if (Math.abs(yaw) < tolerance && Math.abs(pitch) < tolerance) return;
      await this.relativeLook(
        Math.max(-500, Math.min(500, yaw / this.sensitivity * 0.65)),
        Math.max(-350, Math.min(350, -pitch / this.sensitivity * 0.65)),
      );
    }
    throw Error(`Could not aim at ${JSON.stringify(target)}; ${JSON.stringify(await this.snapshot())}`);
  }

  async keyDown(key) {
    if (this.keys.has(key)) return;
    await this.page.keyboard.down(key);
    this.keys.add(key);
  }

  async keyUp(key) {
    if (!this.keys.has(key)) return;
    await this.page.keyboard.up(key);
    this.keys.delete(key);
  }

  async releaseKeys() {
    for (const key of [...this.keys]) await this.keyUp(key);
  }

  async press(key) {
    this.log.push({ action: 'press', key });
    await this.keyDown(key);
    await sleep(100);
    await this.keyUp(key);
    await sleep(100);
  }

  async pressInCanvas(key) {
    this.log.push({ action: 'press', key, target: 'renderCanvas' });
    // Playwright's locator press uses actual keyboard input after focusing the
    // canvas, matching the official native browser tests. It does not click the
    // paused game (a click would resume and request pointer lock).
    await this.frame.locator('#renderCanvas').press(key, { delay: 100 });
    await sleep(100);
  }

  async hold(keys, durationMs) {
    await this.lockPointer();
    this.log.push({ action: 'hold', keys, durationMs });
    const samples = [];
    try {
      for (const key of keys) await this.keyDown(key);
      const deadline = Date.now() + durationMs;
      while (Date.now() < deadline) {
        samples.push(await this.snapshot());
        await sleep(70);
      }
    } finally {
      for (const key of [...keys].reverse()) await this.keyUp(key);
    }
    await sleep(200);
    samples.push(await this.snapshot());
    return samples;
  }

  async moveTo(target, { tolerance = 0.32, timeoutMs = 25000 } = {}) {
    await this.lockPointer();
    const deadline = Date.now() + timeoutMs;
    const start = await this.snapshot();
    this.log.push({ action: 'walk', from: start.footPosition, target });
    let bestDistance = Infinity;
    let lastProgress = Date.now();
    try {
      while (Date.now() < deadline) {
        const state = await this.snapshot();
        const distance = Math.hypot(target.x - state.position.x, target.z - state.position.z);
        if (distance < tolerance) {
          await this.keyUp('w');
          await sleep(150);
          return await this.snapshot();
        }
        if (distance < bestDistance - 0.06) {
          bestDistance = distance;
          lastProgress = Date.now();
        }
        if (Date.now() - lastProgress > 5500) {
          throw Error(`Walk stalled before ${JSON.stringify(target)}; ${JSON.stringify(state)}`);
        }
        const heading = cameraAngles(state.rotation);
        const yawError = wrapAngle(Math.atan2(target.x - state.position.x,
          target.z - state.position.z) - heading.yaw);
        if (Math.abs(yawError) > 0.06 || Math.abs(heading.pitch) > 0.06) {
          await this.keyUp('w');
          await this.aimAt(target);
        }
        await this.keyDown('w');
        await sleep(Math.min(160, Math.max(40, distance * 100)));
      }
      throw Error(`Walk timed out before ${JSON.stringify(target)}; ${JSON.stringify(await this.snapshot())}`);
    } finally {
      await this.keyUp('w');
    }
  }

  async interact(target, expectedTarget) {
    await this.aimAt(target);
    if (expectedTarget) {
      await this.waitFor(state => state.interactTarget === expectedTarget,
        `aim at ${expectedTarget}`, 5000);
    }
    this.log.push({ action: 'interact', target, expectedTarget });
    await this.press('e');
  }

  async throughPortal(aim, { source, destination, timeoutMs = 18000 } = {}) {
    await this.aimAt(aim);
    const before = await this.snapshot();
    const count = before.portalEvents.length;
    this.log.push({ action: 'walk-through-portal', source, destination, before: before.position });
    try {
      await this.keyDown('w');
      const state = await this.waitFor(state => state.portalEvents.length > count,
        `${source} → ${destination} crossing`, timeoutMs);
      const event = state.portalEvents[count];
      if (source) assert.equal(event.source, source);
      if (destination) assert.equal(event.destination, destination);
      return state;
    } finally {
      await this.keyUp('w');
      await sleep(180);
    }
  }
}
