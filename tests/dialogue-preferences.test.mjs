import test from 'node:test';
import assert from 'node:assert/strict';
import { createDialoguePreferences, DEFAULT_DIALOGUE_PREFERENCES, DIALOGUE_PREFERENCES_KEY,
  validateDialoguePreferences } from '../game/dialogue-preferences.js';

const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
const saved = (override = {}) => ({ version: 1, ...DEFAULT_DIALOGUE_PREFERENCES, ...override });

test('preferences use one versioned native key and survive a fresh runtime independently of checkpoints', async () => {
  let record = null; const keys = [], writes = [];
  const storage = { async read(key) { keys.push(key); return structuredClone(record); },
    async write(key, value) { keys.push(key); record = structuredClone(value); writes.push(record); } };
  const first = createDialoguePreferences(storage); await first.ready;
  assert.equal(first.snapshot().subtitleLanguage, 'zh-CN');
  first.set('voiceEnabled', false); first.set('subtitlesEnabled', false); first.set('subtitleLanguage', 'en');
  await settle(); assert.equal(first.snapshot().pendingWrites, 0); first.dispose();
  const second = createDialoguePreferences(storage); await second.ready;
  assert.equal(second.snapshot().voiceEnabled, false); assert.equal(second.snapshot().subtitlesEnabled, false);
  assert.equal(second.snapshot().subtitleLanguage, 'en'); assert(keys.every(key => key === DIALOGUE_PREFERENCES_KEY));
  assert.deepEqual(writes.at(-1), saved({ voiceEnabled: false, subtitlesEnabled: false, subtitleLanguage: 'en' }));
  second.dispose();
});

test('late reads merge untouched saved fields but never overwrite settings the player already changed', async () => {
  const read = deferred(), writes = [];
  const preferences = createDialoguePreferences({ read() { return read.promise; }, async write(key, value) { writes.push(value); } });
  preferences.set('subtitleLanguage', 'en');
  assert.equal(preferences.snapshot().preferencesReady, false); assert.equal(preferences.snapshot().pendingWrites, 1);
  read.resolve(saved({ voiceEnabled: false, subtitlesEnabled: false, subtitleLanguage: 'zh-CN' }));
  await preferences.ready; await settle();
  assert.deepEqual(writes, [saved({ voiceEnabled: false, subtitlesEnabled: false, subtitleLanguage: 'en' })]);
  assert.equal(preferences.snapshot().subtitleLanguage, 'en');
  assert.equal(preferences.snapshot().voiceEnabled, false);
  preferences.dispose();
});

test('writes are serial and coalesce rapid input without a stale final preference snapshot', async () => {
  const gate = deferred(), writes = []; let activeWrites = 0, maxActive = 0;
  const preferences = createDialoguePreferences({ async read() { return null; },
    async write(key, value) { activeWrites++; maxActive = Math.max(maxActive, activeWrites); writes.push(value);
      if (writes.length === 1) await gate.promise; activeWrites--; } });
  await preferences.ready;
  preferences.set('voiceEnabled', false);
  preferences.set('subtitlesEnabled', false); preferences.set('subtitleLanguage', 'en'); preferences.set('voiceEnabled', true);
  assert.equal(preferences.snapshot().pendingWrites, 2); assert.equal(writes.length, 1);
  gate.resolve(); await settle();
  assert.equal(maxActive, 1); assert.equal(writes.length, 2); assert.equal(preferences.snapshot().pendingWrites, 0);
  assert.deepEqual(writes.at(-1), saved({ voiceEnabled: true, subtitlesEnabled: false, subtitleLanguage: 'en' }));
  preferences.dispose();
});

test('invalid/corrupt stored preferences fall back, and failed writes retry only after another explicit change', async () => {
  for (const record of [{ version: 2 }, saved({ voiceEnabled: 'false' }), saved({ subtitleLanguage: 'zh' })]) {
    const preferences = createDialoguePreferences({ async read() { return record; }, async write() {} });
    await preferences.ready;
    assert.match(preferences.snapshot().persistenceError, /Invalid saved/);
    assert.equal(preferences.snapshot().voiceEnabled, true); assert.equal(preferences.snapshot().subtitleLanguage, 'zh-CN');
    preferences.dispose();
  }
  let attempts = 0;
  const preferences = createDialoguePreferences({ async read() { return null; },
    async write() { attempts++; if (attempts === 1) throw Error('Quota exceeded'); } });
  await preferences.ready; preferences.set('subtitleLanguage', 'en'); await settle();
  assert.equal(attempts, 1); assert.equal(preferences.snapshot().pendingWrites, 0);
  assert.match(preferences.snapshot().persistenceError, /Quota/);
  await settle(); assert.equal(attempts, 1, 'failure does not start an infinite background retry');
  preferences.set('voiceEnabled', false); await settle();
  assert.equal(attempts, 2); assert.equal(preferences.snapshot().persistenceError, null);
  preferences.dispose();
});

test('dispose suppresses late read callbacks, new writes, and follow-up writes after an in-flight one', async () => {
  const read = deferred(), notifications = []; let writes = 0;
  const first = createDialoguePreferences({ read() { return read.promise; }, async write() { writes++; } },
    { onChange: value => notifications.push(value) });
  first.set('subtitleLanguage', 'en'); const before = notifications.length;
  first.dispose(); read.resolve(saved({ voiceEnabled: false })); await first.ready; await settle();
  first.set('voiceEnabled', false);
  assert.equal(notifications.length, before); assert.equal(writes, 0);
  const gate = deferred(), secondNotifications = [];
  const second = createDialoguePreferences({ async read() { return null; }, async write() { writes++; await gate.promise; } },
    { onChange: value => secondNotifications.push(value) });
  await second.ready; second.set('voiceEnabled', false); second.set('subtitleLanguage', 'en');
  const beforeDispose = secondNotifications.length; second.dispose(); gate.reject(Error('Storage session stopped'));
  await settle(); assert.equal(writes, 1); assert.equal(secondNotifications.length, beforeDispose);
});

test('unknown language and invalid values cannot corrupt a persisted preference document', async () => {
  const preferences = createDialoguePreferences({ async read() { return null; }, async write() {} }); await preferences.ready;
  assert.throws(() => preferences.set('subtitleLanguage', 'fr'), /Invalid/);
  assert.throws(() => preferences.set('voiceEnabled', 1), /Invalid/);
  assert.throws(() => preferences.set('unknown', false), /Invalid/);
  assert.equal(validateDialoguePreferences(saved()), true);
  assert.equal(validateDialoguePreferences(saved({ subtitlesEnabled: null })), false);
  assert.equal(preferences.snapshot().pendingWrites, 0); preferences.dispose();
});
