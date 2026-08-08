import './style.css';

type Playlist = {
  id: string;
  tracks: string[];
  background?: string;
  title: string;
};

type Track = {
  id: string;
  url: string;
  title: string;
  duration?: number;
  progress?: number;
};

type Soundboard = {
  id: string;
  sounds: string[];
  background?: string;
  title: string;
};

type Sound = {
  id: string;
  url: string;
  title: string;
  loop: boolean;
  volume: number;
  fadeIn: number;
  fadeOut: number;
};

type PlaylistPlayback = {
  playing: boolean;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: 'track' | 'playlist' | 'off' | string;
  track?: Track;
  playlist?: { id: string; title: string };
};

type SoundboardPlayback = {
  sounds: Array<Sound & { duration?: number; progress?: number }>;
};

type Scene = {
  id: string;
  name: string;
  playlistId: string;
  playlistVolume: number;
  soundIds: string[];
  note: string;
};

type AppState = {
  serverUrl: string;
  connected: boolean;
  loading: boolean;
  error: string;
  playlists: Playlist[];
  tracksById: Record<string, Track>;
  soundboards: Soundboard[];
  soundsById: Record<string, Sound>;
  playlistPlayback: PlaylistPlayback | null;
  soundboardPlayback: SoundboardPlayback | null;
  scenes: Scene[];
  activeTab: 'playlists' | 'soundboards' | 'scenes';
  sceneDraft: {
    name: string;
    playlistId: string;
    playlistVolume: number;
    soundIds: Set<string>;
    note: string;
  };
  toast: string;
};

const STORAGE_SERVER = 'tengu.serverUrl';
const STORAGE_SCENES = 'tengu.scenes';
const STORAGE_TAB = 'tengu.tab';
const DEFAULT_SERVER = 'http://127.0.0.1:3333/v1';

const state: AppState = {
  serverUrl: localStorage.getItem(STORAGE_SERVER) ?? DEFAULT_SERVER,
  connected: false,
  loading: false,
  error: '',
  playlists: [],
  tracksById: {},
  soundboards: [],
  soundsById: {},
  playlistPlayback: null,
  soundboardPlayback: null,
  scenes: loadScenes(),
  activeTab: (localStorage.getItem(STORAGE_TAB) as AppState['activeTab']) ?? 'playlists',
  sceneDraft: {
    name: '',
    playlistId: '',
    playlistVolume: 1,
    soundIds: new Set<string>(),
    note: '',
  },
  toast: '',
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

boot();

function boot() {
  setupGlobalHandlers();
  render();
  void connect();
}

function setupGlobalHandlers() {
  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  app.addEventListener('input', onInput);
  app.addEventListener('change', onChange);
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.toast = 'App instalável pronto.';
    render();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    });
  }
}

function onClick(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const actionEl = target?.closest<HTMLElement>('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (!action) return;

  const id = actionEl.dataset.id;
  const sceneId = actionEl.dataset.sceneId;
  const soundId = actionEl.dataset.soundId;
  const value = actionEl.dataset.value;

  switch (action) {
    case 'set-tab':
      if (value === 'playlists' || value === 'soundboards' || value === 'scenes') {
        state.activeTab = value;
        localStorage.setItem(STORAGE_TAB, value);
        render();
      }
      break;
    case 'refresh':
      void connect();
      break;
    case 'playlist-play':
      if (id) runAction(playlistPlay(id));
      break;
    case 'playlist-pause':
      runAction(playlistPause());
      break;
    case 'playlist-next':
      runAction(playlistNext());
      break;
    case 'playlist-previous':
      runAction(playlistPrevious());
      break;
    case 'playlist-mute-toggle':
      runAction(playlistMuteToggle());
      break;
    case 'soundboard-play':
      if (id) runAction(soundboardPlay(id));
      break;
    case 'soundboard-stop':
      if (id) runAction(soundboardStop(id));
      break;
    case 'scene-activate':
      if (sceneId) runAction(runScene(sceneId));
      break;
    case 'scene-delete':
      if (sceneId) deleteScene(sceneId);
      break;
    case 'draft-sound-toggle':
      if (soundId) {
        if (state.sceneDraft.soundIds.has(soundId)) state.sceneDraft.soundIds.delete(soundId);
        else state.sceneDraft.soundIds.add(soundId);
        render();
      }
      break;
    case 'clear-scene-draft':
      state.sceneDraft = { name: '', playlistId: '', playlistVolume: 1, soundIds: new Set<string>(), note: '' };
      render();
      break;
  }
}

function onSubmit(event: SubmitEvent) {
  const form = event.target as HTMLFormElement | null;
  if (!form?.dataset.form) return;
  event.preventDefault();

  switch (form.dataset.form) {
    case 'server': {
      const data = new FormData(form);
      const raw = String(data.get('serverUrl') ?? '');
      const normalized = normalizeServerUrl(raw);
      if (!normalized) {
        state.toast = 'Informe um endereço válido.';
        render();
        return;
      }
      state.serverUrl = normalized;
      localStorage.setItem(STORAGE_SERVER, normalized);
      void connect();
      break;
    }
    case 'scene': {
      const data = new FormData(form);
      const name = String(data.get('name') ?? '').trim();
      const note = String(data.get('note') ?? '').trim();
      const playlistId = String(data.get('playlistId') ?? '').trim();
      const playlistVolume = clampNumber(Number(data.get('playlistVolume') ?? 1), 0, 1);
      const soundIds = Array.from(state.sceneDraft.soundIds);

      if (!name) {
        state.toast = 'Dê um nome para a cena.';
        render();
        return;
      }

      const scene: Scene = {
        id: crypto.randomUUID(),
        name,
        note,
        playlistId,
        playlistVolume,
        soundIds,
      };
      state.scenes = [scene, ...state.scenes];
      persistScenes();
      state.sceneDraft = { name: '', playlistId: '', playlistVolume: 1, soundIds: new Set<string>(), note: '' };
      state.toast = 'Cena criada.';
      render();
      break;
    }
  }
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!target?.dataset.field) return;

  switch (target.dataset.field) {
    case 'serverUrl':
      state.serverUrl = target.value;
      break;
    case 'playlistVolume':
      if (state.playlistPlayback) {
        state.playlistPlayback.volume = clampNumber(Number(target.value), 0, 1);
      }
      break;
    case 'sceneName':
      state.sceneDraft.name = target.value;
      break;
    case 'sceneNote':
      state.sceneDraft.note = target.value;
      break;
    case 'scenePlaylistId':
      state.sceneDraft.playlistId = target.value;
      break;
    case 'scenePlaylistVolume':
      state.sceneDraft.playlistVolume = clampNumber(Number(target.value), 0, 1);
      break;
  }
}

function onChange(event: Event) {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  if (!target?.dataset.field) return;

  if (target.dataset.field === 'sceneSound') {
    const id = target.value;
    if (target.checked) state.sceneDraft.soundIds.add(id);
    else state.sceneDraft.soundIds.delete(id);
    return;
  }

  if (target.dataset.field === 'playlistVolume') {
    const value = clampNumber(Number(target.value), 0, 1);
    if (state.playlistPlayback) state.playlistPlayback.volume = value;
    runAction(playlistSetVolume(value));
  }
}

function runAction<T>(promise: Promise<T>) {
  promise.catch((error) => {
    state.error = error instanceof Error ? error.message : 'Falha na ação.';
    state.toast = '';
    render(false);
  });
}

function render(scrollTop = true) {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Kenku FM Remote</p>
          <h1>Tengu</h1>
          <p class="muted">PWA instalável para playlists, soundboards e cenas locais.</p>
        </div>
        <div class="status ${state.connected ? 'ok' : 'warn'}">
          <span class="dot"></span>
          ${state.connected ? 'Conectado' : 'Desconectado'}
        </div>
      </header>

      <section class="card">
        <form data-form="server" class="server-form">
          <label>
            Endereço do servidor Kenku
            <input data-field="serverUrl" name="serverUrl" value="${escapeHtml(state.serverUrl)}" placeholder="http://192.168.1.10:3333/v1" />
          </label>
          <div class="row">
            <button type="submit">Salvar e conectar</button>
            <button type="button" data-action="refresh">Atualizar</button>
          </div>
        </form>
        <p class="hint">Use o endereço completo com <code>/v1</code>. Em GitHub Pages, o servidor precisa aceitar HTTPS ou um proxy seguro.</p>
      </section>

      <section class="card compact">
        <div class="summary-grid">
          <div><strong>Playlists</strong><span>${state.playlists.length}</span></div>
          <div><strong>Soundboards</strong><span>${state.soundboards.length}</span></div>
          <div><strong>Cenas</strong><span>${state.scenes.length}</span></div>
        </div>
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ''}
        ${state.toast ? `<p class="toast">${escapeHtml(state.toast)}</p>` : ''}
      </section>

      <section class="card">
        <div class="tabs">
          ${tabButton('playlists', 'Playlists')}
          ${tabButton('soundboards', 'Soundboards')}
          ${tabButton('scenes', 'Cenas')}
        </div>
      </section>

      ${renderPlaylistPlayback()}
      ${state.activeTab === 'playlists' ? renderPlaylists() : ''}
      ${state.activeTab === 'soundboards' ? renderSoundboards() : ''}
      ${state.activeTab === 'scenes' ? renderScenes() : ''}
    </div>
  `;

  if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function tabButton(value: AppState['activeTab'], label: string) {
  const active = state.activeTab === value;
  return `<button type="button" class="tab ${active ? 'active' : ''}" data-action="set-tab" data-value="${value}">${label}</button>`;
}

function renderPlaylistPlayback() {
  const pb = state.playlistPlayback;
  if (!pb) {
    return `<section class="card"><p class="muted">Nenhum estado de reprodução carregado.</p></section>`;
  }
  return `
    <section class="card">
      <div class="section-head">
        <div>
          <p class="eyebrow">Reprodução atual</p>
          <h2>${pb.track?.title ? escapeHtml(pb.track.title) : 'Sem faixa'}</h2>
          <p class="muted">${pb.playlist?.title ? escapeHtml(pb.playlist.title) : 'Nenhuma playlist ativa'}</p>
        </div>
        <div class="pill">${pb.playing ? 'tocando' : 'pausado'}</div>
      </div>
      <div class="controls">
        <button type="button" data-action="playlist-play">Play</button>
        <button type="button" data-action="playlist-pause">Pause</button>
        <button type="button" data-action="playlist-previous">◀</button>
        <button type="button" data-action="playlist-next">▶</button>
        <button type="button" data-action="playlist-mute-toggle">${pb.muted ? 'Unmute' : 'Mute'}</button>
      </div>
      <label>
        Volume da playlist
        <input data-field="playlistVolume" type="range" min="0" max="1" step="0.01" value="${pb.volume.toFixed(2)}" />
      </label>
      <div class="meta-grid">
        <div><strong>Shuffle</strong><span>${pb.shuffle ? 'on' : 'off'}</span></div>
        <div><strong>Repeat</strong><span>${escapeHtml(pb.repeat)}</span></div>
      </div>
    </section>
  `;
}

function renderPlaylists() {
  return `
    <section class="grid">
      ${state.playlists.map((playlist) => `
        <article class="card item-card">
          <div>
            <h3>${escapeHtml(playlist.title)}</h3>
            <p class="muted">${playlist.tracks.length} faixas · ${escapeHtml(playlist.id)}</p>
          </div>
          <div class="row wrap">
            <button type="button" data-action="playlist-play" data-id="${playlist.id}">Play</button>
          </div>
          <details>
            <summary>Faixas</summary>
            <ul>${playlist.tracks.map((trackId) => `<li>${escapeHtml(state.tracksById[trackId]?.title ?? trackId)}</li>`).join('')}</ul>
          </details>
        </article>
      `).join('')}
    </section>
  `;
}

function renderSoundboards() {
  return `
    <section class="stack">
      ${state.soundboards.map((soundboard) => `
        <article class="card">
          <div class="section-head">
            <div>
              <h3>${escapeHtml(soundboard.title)}</h3>
              <p class="muted">${soundboard.sounds.length} sons · ${escapeHtml(soundboard.id)}</p>
            </div>
            <button type="button" data-action="soundboard-play" data-id="${soundboard.id}">Play board</button>
          </div>
          <div class="sound-list">
            ${soundboard.sounds.map((soundId) => {
              const sound = state.soundsById[soundId];
              if (!sound) return `<div class="sound-row"><span>${escapeHtml(soundId)}</span></div>`;
              return `
                <div class="sound-row">
                  <div>
                    <strong>${escapeHtml(sound.title)}</strong>
                    <p class="muted">volume salvo: ${(sound.volume * 100).toFixed(0)}%</p>
                  </div>
                  <div class="row wrap">
                    <button type="button" data-action="soundboard-play" data-id="${sound.id}">Play</button>
                    <button type="button" data-action="soundboard-stop" data-id="${sound.id}">Stop</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </article>
      `).join('')}
    </section>
  `;
}

function renderScenes() {
  const allSounds = Object.values(state.soundsById);
  return `
    <section class="stack">
      <article class="card">
        <div class="section-head">
          <div>
            <p class="eyebrow">Criar cena</p>
            <h2>Preset local</h2>
          </div>
          <button type="button" data-action="clear-scene-draft">Limpar</button>
        </div>
        <form data-form="scene" class="scene-form">
          <label>
            Nome
            <input data-field="sceneName" name="name" value="${escapeHtml(state.sceneDraft.name)}" placeholder="Cena de combate" />
          </label>
          <label>
            Playlist
            <select data-field="scenePlaylistId" name="playlistId">
              <option value="">Nenhuma</option>
              ${state.playlists.map((playlist) => `<option value="${playlist.id}" ${state.sceneDraft.playlistId === playlist.id ? 'selected' : ''}>${escapeHtml(playlist.title)}</option>`).join('')}
            </select>
          </label>
          <label>
            Volume da playlist
            <input data-field="scenePlaylistVolume" name="playlistVolume" type="range" min="0" max="1" step="0.01" value="${state.sceneDraft.playlistVolume}" />
          </label>
          <label>
            Observação
            <textarea data-field="sceneNote" name="note" rows="2" placeholder="O que essa cena faz?">${escapeHtml(state.sceneDraft.note)}</textarea>
          </label>
          <div>
            <p class="eyebrow">Soundboards e sons</p>
            <div class="sound-grid">
              ${allSounds.map((sound) => `
                <label class="check-card">
                  <input data-field="sceneSound" type="checkbox" value="${sound.id}" ${state.sceneDraft.soundIds.has(sound.id) ? 'checked' : ''} />
                  <span>
                    <strong>${escapeHtml(sound.title)}</strong>
                    <small>${(sound.volume * 100).toFixed(0)}% · ${escapeHtml(sound.id)}</small>
                  </span>
                </label>
              `).join('')}
            </div>
          </div>
          <button type="submit">Salvar cena</button>
        </form>
      </article>

      <section class="grid">
        ${state.scenes.map((scene) => `
          <article class="card item-card">
            <div>
              <h3>${escapeHtml(scene.name)}</h3>
              <p class="muted">${escapeHtml(scene.note || 'Sem observações')}</p>
            </div>
            <div class="meta-grid">
              <div><strong>Playlist</strong><span>${escapeHtml(scene.playlistId || 'nenhuma')}</span></div>
              <div><strong>Volume</strong><span>${(scene.playlistVolume * 100).toFixed(0)}%</span></div>
              <div><strong>Sons</strong><span>${scene.soundIds.length}</span></div>
            </div>
            <div class="row wrap">
              <button type="button" data-action="scene-activate" data-scene-id="${scene.id}">Ativar</button>
              <button type="button" data-action="scene-delete" data-scene-id="${scene.id}">Excluir</button>
            </div>
          </article>
        `).join('')}
      </section>
    </section>
  `;
}

async function connect() {
  state.loading = true;
  state.error = '';
  render(false);
  try {
    const [playlist, soundboard, playback, soundPlayback] = await Promise.all([
      apiGet<{ playlists: Playlist[]; tracks: Track[] }>(`/playlist`),
      apiGet<{ soundboards: Soundboard[]; sounds: Sound[] }>(`/soundboard`),
      apiGet<PlaylistPlayback>(`/playlist/playback`),
      apiGet<SoundboardPlayback>(`/soundboard/playback`),
    ]);

    state.playlists = playlist.playlists ?? [];
    state.tracksById = Object.fromEntries((playlist.tracks ?? []).map((track) => [track.id, track]));
    state.soundboards = soundboard.soundboards ?? [];
    state.soundsById = Object.fromEntries((soundboard.sounds ?? []).map((sound) => [sound.id, sound]));
    state.playlistPlayback = playback;
    state.soundboardPlayback = soundPlayback;
    state.connected = true;
    state.toast = 'Dados atualizados.';
  } catch (error) {
    state.connected = false;
    state.error = error instanceof Error ? error.message : 'Falha ao conectar.';
  } finally {
    state.loading = false;
    render(false);
  }
}

async function playlistPlay(id: string) {
  await apiRequest('/playlist/play', { method: 'PUT', body: JSON.stringify({ id }) });
  state.toast = 'Playlist reproduzida.';
  await connect();
}

async function playlistPause() {
  await apiRequest('/playlist/playback/pause', { method: 'PUT' });
  state.toast = 'Pause enviado.';
  await connect();
}

async function playlistNext() {
  await apiRequest('/playlist/playback/next', { method: 'POST' });
  state.toast = 'Próxima faixa.';
  await connect();
}

async function playlistPrevious() {
  await apiRequest('/playlist/playback/previous', { method: 'POST' });
  state.toast = 'Faixa anterior.';
  await connect();
}

async function playlistMuteToggle() {
  const muted = !(state.playlistPlayback?.muted ?? false);
  await apiRequest('/playlist/playback/mute', { method: 'PUT', body: JSON.stringify({ mute: muted }) });
  state.toast = muted ? 'Playlist mutada.' : 'Playlist desmutada.';
  await connect();
}

async function playlistSetVolume(volume: number) {
  await apiRequest('/playlist/playback/volume', { method: 'PUT', body: JSON.stringify({ volume }) });
  await connect();
}

async function soundboardPlay(id: string) {
  await apiRequest('/soundboard/play', { method: 'PUT', body: JSON.stringify({ id }) });
  state.toast = 'Sons reproduzidos.';
  await connect();
}

async function soundboardStop(id: string) {
  await apiRequest('/soundboard/stop', { method: 'PUT', body: JSON.stringify({ id }) });
  state.toast = 'Sons parados.';
  await connect();
}

async function runScene(sceneId: string) {
  const scene = state.scenes.find((item) => item.id === sceneId);
  if (!scene) return;

  if (scene.playlistId) {
    await apiRequest('/playlist/play', { method: 'PUT', body: JSON.stringify({ id: scene.playlistId }) });
    if (scene.playlistVolume !== undefined) {
      await apiRequest('/playlist/playback/volume', { method: 'PUT', body: JSON.stringify({ volume: scene.playlistVolume }) });
    }
  }

  for (const soundId of scene.soundIds) {
    await apiRequest('/soundboard/play', { method: 'PUT', body: JSON.stringify({ id: soundId }) });
  }

  state.toast = `Cena “${scene.name}” ativada.`;
  await connect();
}

function deleteScene(sceneId: string) {
  state.scenes = state.scenes.filter((scene) => scene.id !== sceneId);
  persistScenes();
  state.toast = 'Cena removida.';
  render();
}

async function apiGet<T>(path: string): Promise<T> {
  const response = await apiRequest(path, { method: 'GET' });
  return response as T;
}

async function apiRequest(path: string, init: RequestInit = {}) {
  const url = `${state.serverUrl.replace(/\/$/, '')}${path}`;
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} em ${path}`);
  }

  const type = response.headers.get('content-type') ?? '';
  if (type.includes('application/json')) return response.json();
  return undefined;
}

function normalizeServerUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '').replace(/\/?v1$/, '/v1');
}

function clampNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function loadScenes(): Scene[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_SCENES) ?? '[]') as Scene[];
  } catch {
    return [];
  }
}

function persistScenes() {
  localStorage.setItem(STORAGE_SCENES, JSON.stringify(state.scenes));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
