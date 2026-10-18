/** Single-voice, event-driven dialogue. Assets are offline files, never browser TTS. */
export function validateDialogue(data) {
  if (data?.version !== 1 || !data.characters || !Array.isArray(data.lines)) throw Error('Invalid dialogue data version');
  const ids = new Set(), audioIds = new Set();
  for (const line of data.lines) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(line?.id || '') || ids.has(line.id) ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(line.audioId || '') || audioIds.has(line.audioId)) throw Error('Dialogue IDs must be unique and filename-safe');
    ids.add(line.id); audioIds.add(line.audioId);
    if (!data.characters[line.character]?.name || typeof line.subtitle !== 'string' || !line.subtitle.trim() ||
      typeof line.trigger !== 'string' || !line.trigger || typeof line.file !== 'string' ||
      !/^assets\/voice\/l01\/[A-Za-z0-9_-]+\.wav$/.test(line.file)) throw Error(`Invalid dialogue line ${line.id}`);
    for (const [key, min, max] of [['duration', .1, 30], ['maxAge', .1, 120], ['priority', -1000, 1000]]) {
      if (!Number.isFinite(line[key]) || line[key] < min || line[key] > max) throw Error(`Invalid ${key} in ${line.id}`);
    }
    if (line.delay !== undefined && (!Number.isFinite(line.delay) || line.delay < 0 || line.delay >= line.maxAge))
      throw Error(`Invalid delay in ${line.id}`);
    if (line.cancelOn !== undefined && (!Array.isArray(line.cancelOn) || line.cancelOn.some(v => typeof v !== 'string')))
      throw Error(`Invalid cancelOn in ${line.id}`);
  }
  return data;
}

export function createDialogue(ctx, data, { onSpeaker = () => {} } = {}) {
  validateDialogue(data);
  const available = new Set(ctx.audio.list());
  const eventNames = new Set(data.lines.map(line => line.trigger));
  const lineIds = new Set(data.lines.map(line => line.id));
  const byEvent = new Map([...eventNames].map(event => [event, data.lines.filter(line => line.trigger === event)]));
  let disposed = false, clock = 0, sequence = 0, cooldown = 0, paused = true;
  let voiceEnabled = true, subtitlesEnabled = true, active = null, queue = [];
  let consumed = new Set(), started = new Set(), history = [], errors = [], expired = 0, cancelled = 0;
  const uiCache = new Map();
  function hud(id, value, visible = !!value) {
    const handle = ctx.ui.get(id);
    if (uiCache.get(id) !== value) { handle?.setText(value); uiCache.set(id, value); }
    handle?.setVisible(visible);
  }
  function status() {
    const count = data.lines.filter(line => available.has(line.audioId)).length;
    const assetStatus = count === data.lines.length ? `语音素材 ${count}/${data.lines.length}` :
      `语音待 Windows 生成 ${count}/${data.lines.length}`;
    hud('audioStatus', `${assetStatus} · 语音${voiceEnabled ? '开' : '关'} · 字幕${subtitlesEnabled ? '开' : '关'}${errors.length ? ' · 音频失败，使用字幕' : ''}`, paused);
  }
  function subtitle() {
    const line = active?.line;
    hud('dialogue', line ? `${data.characters[line.character].name}：${line.subtitle}` : '',
      !!line && subtitlesEnabled && !paused);
  }
  function stopVoice() {
    active?.voice?.stop();
    if (active) active.voice = null;
  }
  function endLine() {
    if (!active) return;
    stopVoice(); active = null; onSpeaker(null, null); cooldown = data.cooldown ?? .65; subtitle();
  }
  function failAudio(line, cause) {
    errors.push({ id: line.id, message: String(cause?.message || cause) });
    if (errors.length > 16) errors.shift();
    status();
  }
  function startLine(entry) {
    const { line } = entry, character = data.characters[line.character];
    active = { line, elapsed: 0, voice: null, mode: 'subtitle' };
    started.add(line.id);
    if (voiceEnabled && available.has(line.audioId)) {
      try {
        const voice = ctx.audio.play(line.audioId, { bus: character.bus,
          volume: character.volume ?? 1, rate: character.rate ?? 1,
          priority: line.priority, spatial: false, loop: false, stream: false, preservePitch: false });
        if (!voice.playing) throw Error(`Voice rejected: ${voice.reason || 'not playing'}`);
        active.voice = voice; active.mode = 'audio';
      } catch (error) { failAudio(line, error); }
    }
    history.push({ id: line.id, event: line.trigger, clock, mode: active.mode });
    if (history.length > 64) history.shift();
    onSpeaker(line.character, line); subtitle();
  }
  function setPaused(value) {
    if (value === paused) return;
    paused = value;
    if (active?.voice?.playing) {
      try { paused ? active.voice.pause() : active.voice.resume(); }
      catch (error) { failAudio(active.line, error); stopVoice(); active.mode = 'subtitle'; }
    }
    onSpeaker(paused ? null : active?.line.character ?? null, paused ? null : active?.line ?? null);
    subtitle(); status();
  }
  function emit(event) {
    if (disposed || !eventNames.has(event) || consumed.has(event)) return false;
    consumed.add(event);
    const before = queue.length;
    queue = queue.filter(entry => !entry.line.cancelOn?.includes(event));
    cancelled += before - queue.length;
    for (const line of byEvent.get(event)) queue.push({ line, at: clock, sequence: sequence++ });
    return true;
  }
  function update(dt, state = {}) {
    if (disposed) return;
    setPaused(!!state.paused);
    if (paused) return;
    dt = Number.isFinite(dt) && dt >= 0 ? dt : 0;
    clock += dt;
    const before = queue.length;
    queue = queue.filter(entry => clock - entry.at <= entry.line.maxAge);
    expired += before - queue.length;
    if (active) {
      active.elapsed += dt;
      if (active.voice ? !active.voice.playing : active.elapsed >= active.line.duration) endLine();
    } else cooldown = Math.max(0, cooldown - dt);
    if (!active && cooldown <= 0) {
      const eligible = queue.filter(entry => clock >= entry.at + (entry.line.delay || 0));
      eligible.sort((a, b) => b.line.priority - a.line.priority || a.sequence - b.sequence);
      if (eligible[0]) { queue.splice(queue.indexOf(eligible[0]), 1); startLine(eligible[0]); }
    }
  }
  function capture() {
    // Checkpoints store event consumption, never live WebAudio handles or a queued conversation.
    return { version: 1, consumedEvents: [...consumed], startedLines: [...started] };
  }
  function restore(state) {
    if (disposed) return;
    if (state?.version !== 1 || !Array.isArray(state.consumedEvents) || !Array.isArray(state.startedLines) ||
      state.consumedEvents.some(v => !eventNames.has(v)) || state.startedLines.some(v => !lineIds.has(v)))
      throw Error('Invalid dialogue checkpoint');
    stopVoice(); active = null; queue = []; onSpeaker(null, null);
    consumed = new Set(state.consumedEvents); started = new Set(state.startedLines);
    clock = 0; cooldown = 0; sequence = 0; paused = true; history = []; expired = 0; cancelled = 0;
    subtitle(); status();
  }
  function reset() { restore({ version: 1, consumedEvents: [], startedLines: [] }); }
  function setVoiceEnabled(value) {
    if (disposed) return;
    voiceEnabled = !!value;
    if (!voiceEnabled && active?.voice) { stopVoice(); active.mode = 'subtitle'; }
    status();
  }
  function setSubtitlesEnabled(value) { if (!disposed) { subtitlesEnabled = !!value; subtitle(); status(); } }
  function snapshot() {
    return structuredClone({ ...capture(), paused, voiceEnabled, subtitlesEnabled,
      currentLine: active?.line.id ?? null, currentSpeaker: active?.line.character ?? null,
      currentMode: active?.mode ?? null, elapsed: active?.elapsed ?? 0,
      audioPlaying: !!active?.voice?.playing, queue: queue.map(entry => entry.line.id),
      availableAudio: data.lines.filter(line => available.has(line.audioId)).map(line => line.id),
      missingAudio: data.lines.filter(line => !available.has(line.audioId)).map(line => line.id),
      history, errors, expired, cancelled, disposed });
  }
  function dispose() {
    if (disposed) return;
    stopVoice(); active = null; queue = []; disposed = true; onSpeaker(null, null);
    hud('dialogue', '', false); hud('audioStatus', '', false);
  }
  status(); subtitle();
  return Object.freeze({ emit, update, setVoiceEnabled, setSubtitlesEnabled, capture, restore, reset, snapshot, dispose });
}
