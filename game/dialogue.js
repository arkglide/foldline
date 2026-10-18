import { createDialoguePreferences } from './dialogue-preferences.js';

/** Single-voice, event-driven dialogue. English audio is independent of subtitle language. */
export function validateDialogue(data) {
  if (data?.version !== 2 || !data.characters || !Array.isArray(data.lines)) throw Error('Invalid dialogue data version');
  if (data.cooldown !== undefined && (!Number.isFinite(data.cooldown) || data.cooldown < 0 || data.cooldown > 10))
    throw Error('Invalid dialogue cooldown');
  const deliveries = new Set(['curious', 'dry', 'surprised', 'warm', 'matterOfFact']);
  for (const character of Object.values(data.characters)) {
    if (!character?.names || ['en', 'zh-CN'].some(language => typeof character.names[language] !== 'string' || !character.names[language].trim()) ||
      character.voice?.culture !== 'en-US') throw Error('Invalid bilingual dialogue character');
  }
  const ids = new Set(), audioIds = new Set();
  for (const line of data.lines) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(line?.id || '') || ids.has(line.id) ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(line.audioId || '') || audioIds.has(line.audioId)) throw Error('Dialogue IDs must be unique and filename-safe');
    ids.add(line.id); audioIds.add(line.audioId);
    if (!data.characters[line.character] || typeof line.voiceText !== 'string' || !line.voiceText.trim() ||
      ['en', 'zh-CN'].some(language => typeof line.subtitles?.[language] !== 'string' || !line.subtitles[language].trim()) ||
      line.voiceText !== line.subtitles.en ||
      typeof line.trigger !== 'string' || !line.trigger || typeof line.file !== 'string' ||
      !/^assets\/voice\/(?:l01|l02)\/[A-Za-z0-9_-]+\.wav$/.test(line.file)) throw Error(`Invalid dialogue line ${line.id}`);
    if (line.delivery !== undefined && !deliveries.has(line.delivery)) throw Error(`Invalid delivery in ${line.id}`);
    for (const [key, min, max] of [['duration', .1, 30], ['maxAge', .1, 120], ['priority', -1000, 1000]]) {
      if (!Number.isFinite(line[key]) || line[key] < min || line[key] > max) throw Error(`Invalid ${key} in ${line.id}`);
    }
    if (line.delay !== undefined && (!Number.isFinite(line.delay) || line.delay < 0 || line.delay >= line.maxAge))
      throw Error(`Invalid delay in ${line.id}`);
    if (line.cancelOn !== undefined && (!Array.isArray(line.cancelOn) || line.cancelOn.some(v => typeof v !== 'string')))
      throw Error(`Invalid cancelOn in ${line.id}`);
  }
  const byId = new Map(data.lines.map(line => [line.id, line]));
  for (const line of data.lines) {
    const seen = new Set([line.id]);
    let parent = line.after;
    while (parent !== undefined) {
      if (!byId.has(parent) || seen.has(parent)) throw Error(`Invalid after dependency in ${line.id}`);
      seen.add(parent); parent = byId.get(parent).after;
    }
  }
  return data;
}

export function createDialogue(ctx, data, { onSpeaker = () => {} } = {}) {
  validateDialogue(data);
  const available = new Set(ctx.audio.list());
  const eventNames = new Set(data.lines.flatMap(line => [line.trigger, ...(line.cancelOn ?? [])]));
  const lineIds = new Set(data.lines.map(line => line.id));
  const byEvent = new Map([...eventNames].map(event => [event, data.lines.filter(line => line.trigger === event)]));
  let disposed = false, clock = 0, sequence = 0, cooldown = 0, paused = true;
  let voiceEnabled = true, subtitlesEnabled = true, subtitleLanguage = 'zh-CN', active = null, queue = [];
  let preferences = null;
  let consumed = new Set(), started = new Set(), history = [], errors = [], expired = 0, cancelled = 0;
  const uiCache = new Map();
  function hud(id, value, visible = !!value) {
    if (disposed) return;
    const handle = ctx.ui.get(id);
    if (uiCache.get(id) !== value) { handle?.setText(value); uiCache.set(id, value); }
    handle?.setVisible(visible);
  }
  function status() {
    const count = data.lines.filter(line => available.has(line.audioId)).length;
    const english = subtitleLanguage === 'en', countText = `${count}/${data.lines.length}`;
    const assetStatus = count === data.lines.length ? (english ? `English voice assets ${countText}` : `英文语音素材 ${countText}`) :
      (english ? `English voices awaiting Windows ${countText}` : `英文语音待 Windows 生成 ${countText}`);
    const failed = errors.length ? (english ? ' · Audio unavailable' : ' · 音频失败') : '';
    const persistence = preferences?.snapshot().persistenceError ? (english ? ' · Settings not saved' : ' · 设置未保存') : '';
    hud('audioStatus', assetStatus + failed + persistence, paused);
    hud('dialogueSettings', english ?
      `V Voice: ${voiceEnabled ? 'On' : 'Off'} · B Subtitles: ${subtitlesEnabled ? 'On' : 'Off'} · L Language: English` :
      `V 语音：${voiceEnabled ? '开' : '关'} · B 字幕：${subtitlesEnabled ? '开' : '关'} · L 字幕：中文`, paused);
  }
  function subtitle() {
    const line = active?.line;
    const speaker = line ? data.characters[line.character].names[subtitleLanguage] : '';
    hud('dialogue', line ? `${speaker}${subtitleLanguage === 'en' ? ': ' : '：'}${line.subtitles[subtitleLanguage]}` : '',
      !!line && subtitlesEnabled && !paused);
  }
  function stopVoice() {
    try { active?.voice?.stop(); }
    catch (error) { if (active) failAudio(active.line, error); }
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
    for (const line of byEvent.get(event)) {
      if (line.cancelOn?.some(cancelEvent => consumed.has(cancelEvent))) { cancelled++; continue; }
      queue.push({ line, at: clock, sequence: sequence++ });
    }
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
      const eligible = queue.filter(entry => clock >= entry.at + (entry.line.delay || 0) &&
        (!entry.line.after || started.has(entry.line.after)));
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
  function applyPreferences(value) {
    if (disposed) return;
    voiceEnabled = value.voiceEnabled; subtitlesEnabled = value.subtitlesEnabled; subtitleLanguage = value.subtitleLanguage;
    if (!voiceEnabled && active?.voice) { stopVoice(); active.mode = 'subtitle'; }
    subtitle(); status();
  }
  function setVoiceEnabled(value) { if (!disposed) preferences.set('voiceEnabled', !!value); }
  function setSubtitlesEnabled(value) { if (!disposed) preferences.set('subtitlesEnabled', !!value); }
  function setSubtitleLanguage(value) { if (!disposed) preferences.set('subtitleLanguage', value); }
  function snapshot() {
    return structuredClone({ ...capture(), ...preferences.snapshot(), paused, voiceEnabled, subtitlesEnabled, subtitleLanguage,
      currentLine: active?.line.id ?? null, currentSpeaker: active?.line.character ?? null,
      currentDelivery: active?.line.delivery ?? null,
      currentText: active?.line.subtitles[subtitleLanguage] ?? null,
      localizedSpeaker: active ? data.characters[active.line.character].names[subtitleLanguage] : null,
      currentMode: active?.mode ?? null, elapsed: active?.elapsed ?? 0,
      audioPlaying: !!active?.voice?.playing, queue: queue.map(entry => entry.line.id),
      availableAudio: data.lines.filter(line => available.has(line.audioId)).map(line => line.id),
      missingAudio: data.lines.filter(line => !available.has(line.audioId)).map(line => line.id),
      history, errors, expired, cancelled, disposed });
  }
  function dispose() {
    if (disposed) return;
    stopVoice(); active = null; queue = []; preferences.dispose(); onSpeaker(null, null);
    hud('dialogue', '', false); hud('audioStatus', '', false); hud('dialogueSettings', '', false);
    disposed = true;
  }
  preferences = createDialoguePreferences(ctx.storage, { onChange: applyPreferences });
  status(); subtitle();
  return Object.freeze({ ready: preferences.ready, emit, update, setVoiceEnabled, setSubtitlesEnabled,
    setSubtitleLanguage, capture, restore, reset, snapshot, dispose });
}
