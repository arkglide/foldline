/** Player preferences are native project storage, never checkpoint progression. */
export const DIALOGUE_PREFERENCES_KEY = 'dialogue-preferences:v1';
export const DEFAULT_DIALOGUE_PREFERENCES = Object.freeze({
  voiceEnabled: true, subtitlesEnabled: true, subtitleLanguage: 'zh-CN',
});
const keys = Object.keys(DEFAULT_DIALOGUE_PREFERENCES);

export function validateDialoguePreferences(value) {
  return value?.version === 1 && typeof value.voiceEnabled === 'boolean' &&
    typeof value.subtitlesEnabled === 'boolean' && ['en', 'zh-CN'].includes(value.subtitleLanguage);
}

export function createDialoguePreferences(storage, { onChange = () => {} } = {}) {
  let value = { ...DEFAULT_DIALOGUE_PREFERENCES };
  let disposed = false, preferencesReady = false, dirty = false, writing = false;
  let persistenceError = null;
  const touched = new Set();
  const supported = typeof storage?.read === 'function' && typeof storage?.write === 'function';
  function notify() { if (!disposed) onChange({ ...value }); }
  function fail(error) {
    if (!disposed) persistenceError = String(error?.message || error).slice(0, 240);
  }
  async function flush() {
    if (disposed || !preferencesReady || writing || !dirty || !supported) return;
    writing = true;
    try {
      while (dirty && !disposed) {
        dirty = false;
        const snapshot = { version: 1, ...value };
        try {
          await storage.write(DIALOGUE_PREFERENCES_KEY, snapshot);
          if (!disposed) persistenceError = null;
        } catch (error) { fail(error); }
      }
    } finally { writing = false; notify(); }
  }
  const ready = (async () => {
    try {
      if (!supported) throw Error('Native settings storage unavailable');
      const stored = await storage.read(DIALOGUE_PREFERENCES_KEY);
      if (disposed) return;
      if (stored !== null && !validateDialoguePreferences(stored)) throw Error('Invalid saved dialogue preferences');
      if (stored) for (const key of keys) if (!touched.has(key)) value[key] = stored[key];
    } catch (error) { fail(error); }
    if (disposed) return;
    preferencesReady = true;
    notify();
    // A setting changed during read is written only after untouched saved fields merge.
    void flush();
  })();
  function set(key, next) {
    if (disposed) return;
    if (!keys.includes(key) || (key === 'subtitleLanguage' ? !['en', 'zh-CN'].includes(next) : typeof next !== 'boolean'))
      throw Error('Invalid dialogue preference');
    touched.add(key);
    value[key] = next;
    dirty = true;
    notify();
    void flush();
  }
  function snapshot() {
    return { ...value, preferencesReady, pendingWrites: (writing ? 1 : 0) + (dirty && supported ? 1 : 0), persistenceError };
  }
  function dispose() { disposed = true; dirty = false; }
  return Object.freeze({ ready, set, snapshot, dispose });
}
