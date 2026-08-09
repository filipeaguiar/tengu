import './style.css';

type Playlist = { id: string; tracks: string[]; title: string };
type Track = { id: string; url: string; title: string };
type Soundboard = { id: string; sounds: string[]; title: string };
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
  track?: Track;
  playlist?: { id: string; title: string };
};
type SoundboardPlayback = { sounds: Array<Sound & { duration?: number; progress?: number }> };
type SceneCard = { type: 'track' | 'sound'; id: string };
type View = 'connection' | 'scene' | 'settings';

type State = {
  serverUrl: string;
  connected: boolean;
  connecting: boolean;
  error: string;
  view: View;
  pickerOpen: boolean;
  volumeOpen: boolean;
  tracks: Track[];
  playlists: Playlist[];
  sounds: Sound[];
  soundboards: Soundboard[];
  playlistPlayback: PlaylistPlayback | null;
  soundboardPlayback: SoundboardPlayback | null;
  sceneCards: SceneCard[];
  toast: string;
};

const STORAGE_SERVER = 'tengu.serverUrl';
const STORAGE_CARDS = 'tengu.sceneCards';
const DEFAULT_SERVER = 'https://steamdeck-1.taile7381b.ts.net/v1';

const state: State = {
  serverUrl: localStorage.getItem(STORAGE_SERVER) ?? DEFAULT_SERVER,
  connected: false,
  connecting: false,
  error: '',
  view: 'connection',
  pickerOpen: false,
  volumeOpen: false,
  tracks: [],
  playlists: [],
  sounds: [],
  soundboards: [],
  playlistPlayback: null,
  soundboardPlayback: null,
  sceneCards: loadCards(),
  toast: '',
};

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root not found');

let toastTimer: number | undefined;
let playbackTimer: number | undefined;

try {
  setup();
  render();
} catch (error) {
  renderFatalError(error);
}

function setup() {
  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  app.addEventListener('input', onInput);
  app.addEventListener('change', onChange);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
    });
  }
}

function onClick(event: MouseEvent) {
  const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  const id = target.dataset.id;
  const type = target.dataset.type as SceneCard['type'] | undefined;

  switch (action) {
    case 'open-settings':
      state.view = 'settings';
      closePanels();
      render();
      break;
    case 'close-settings':
      state.view = state.connected ? 'scene' : 'connection';
      render();
      break;
    case 'disconnect':
      disconnect();
      break;
    case 'open-picker':
      state.pickerOpen = true;
      state.volumeOpen = false;
      render(false);
      break;
    case 'close-picker':
      state.pickerOpen = false;
      render(false);
      break;
    case 'toggle-picker-card':
      if (id && type) toggleSceneCard({ id, type });
      break;
    case 'remove-card':
      if (id && type) removeSceneCard({ id, type });
      break;
    case 'toggle-track':
      if (id) runAction(toggleTrack(id));
      break;
    case 'toggle-sound':
      if (id) runAction(toggleSound(id));
      break;
    case 'toggle-volume':
      state.volumeOpen = !state.volumeOpen;
      state.pickerOpen = false;
      render(false);
      break;
    case 'close-volume':
      state.volumeOpen = false;
      render(false);
      break;
    case 'toggle-mute':
      runAction(toggleMute());
      break;
  }
}

function onSubmit(event: SubmitEvent) {
  const form = event.target as HTMLFormElement | null;
  if (form?.dataset.form !== 'connection') return;
  event.preventDefault();

  const data = new FormData(form);
  const serverUrl = normalizeServerUrl(String(data.get('serverUrl') ?? ''));
  if (!serverUrl) {
    state.error = 'Informe o endereço do servidor.';
    render(false);
    return;
  }

  state.serverUrl = serverUrl;
  localStorage.setItem(STORAGE_SERVER, serverUrl);
  void connect();
}

function onInput(event: Event) {
  const input = event.target as HTMLInputElement | null;
  if (!input) return;
  if (input.dataset.field === 'server-url') state.serverUrl = input.value;
  if (input.dataset.field === 'master-volume' && state.playlistPlayback) {
    state.playlistPlayback.volume = clamp(Number(input.value), 0, 1);
    updateVolumeLabel(input.value);
  }
}

function onChange(event: Event) {
  const input = event.target as HTMLInputElement | null;
  if (input?.dataset.field !== 'master-volume') return;
  runAction(setMasterVolume(clamp(Number(input.value), 0, 1)));
}

async function connect() {
  state.connecting = true;
  state.error = '';
  render(false);

  try {
    const [playlistData, soundboardData, playlistPlayback, soundboardPlayback] = await Promise.all([
      apiGet<{ playlists: Playlist[]; tracks: Track[] }>('/playlist'),
      apiGet<{ soundboards: Soundboard[]; sounds: Sound[] }>('/soundboard'),
      apiGet<PlaylistPlayback>('/playlist/playback'),
      apiGet<SoundboardPlayback>('/soundboard/playback'),
    ]);

    state.playlists = playlistData.playlists ?? [];
    state.tracks = playlistData.tracks ?? [];
    state.soundboards = soundboardData.soundboards ?? [];
    state.sounds = soundboardData.sounds ?? [];
    state.playlistPlayback = playlistPlayback;
    state.soundboardPlayback = soundboardPlayback;
    state.connected = true;
    state.view = 'scene';
    state.error = '';
    startPlaybackPolling();
    showToast('Conectado ao Kenku');
  } catch (error) {
    state.connected = false;
    state.view = 'connection';
    state.error = error instanceof Error ? error.message : 'Não foi possível conectar.';
  } finally {
    state.connecting = false;
    render(false);
  }
}

function disconnect() {
  state.connected = false;
  state.view = 'connection';
  state.error = '';
  closePanels();
  stopPlaybackPolling();
  render();
}

function startPlaybackPolling() {
  stopPlaybackPolling();
  playbackTimer = window.setInterval(() => void refreshPlayback(), 2000);
}

function stopPlaybackPolling() {
  if (playbackTimer) window.clearInterval(playbackTimer);
  playbackTimer = undefined;
}

async function refreshPlayback() {
  if (!state.connected || state.connecting) return;
  try {
    const [playlistPlayback, soundboardPlayback] = await Promise.all([
      apiGet<PlaylistPlayback>('/playlist/playback'),
      apiGet<SoundboardPlayback>('/soundboard/playback'),
    ]);
    state.playlistPlayback = playlistPlayback;
    state.soundboardPlayback = soundboardPlayback;
    render(false);
  } catch {
    state.connected = false;
    state.view = 'connection';
    state.error = 'A conexão com o Kenku foi perdida.';
    stopPlaybackPolling();
    render(false);
  }
}

async function toggleTrack(id: string) {
  const active = state.playlistPlayback?.track?.id === id;
  const playing = Boolean(state.playlistPlayback?.playing);

  if (active && playing) {
    await apiRequest('/playlist/playback/pause', { method: 'PUT' });
  } else if (active) {
    await apiRequest('/playlist/playback/play', { method: 'PUT' });
  } else {
    await apiRequest('/playlist/play', { method: 'PUT', body: JSON.stringify({ id }) });
  }
  await refreshPlayback();
}

async function toggleSound(id: string) {
  const active = state.soundboardPlayback?.sounds.some((sound) => sound.id === id) ?? false;
  await apiRequest(active ? '/soundboard/stop' : '/soundboard/play', {
    method: 'PUT',
    body: JSON.stringify({ id }),
  });
  await refreshPlayback();
}

async function setMasterVolume(volume: number) {
  await apiRequest('/playlist/playback/volume', {
    method: 'PUT',
    body: JSON.stringify({ volume }),
  });
  await refreshPlayback();
}

async function toggleMute() {
  const mute = !(state.playlistPlayback?.muted ?? false);
  await apiRequest('/playlist/playback/mute', {
    method: 'PUT',
    body: JSON.stringify({ mute }),
  });
  await refreshPlayback();
}

function toggleSceneCard(card: SceneCard) {
  if (hasCard(card)) removeSceneCard(card);
  else {
    state.sceneCards = [...state.sceneCards, card];
    persistCards();
    render(false);
  }
}

function removeSceneCard(card: SceneCard) {
  state.sceneCards = state.sceneCards.filter((item) => item.id !== card.id || item.type !== card.type);
  persistCards();
  render(false);
}

function hasCard(card: SceneCard) {
  return state.sceneCards.some((item) => item.id === card.id && item.type === card.type);
}

function render(scrollTop = true) {
  app.innerHTML = `
    <div class="app-shell">
      ${renderHeader()}
      <main class="main-content ${state.connected && state.view === 'scene' ? 'with-dock' : ''}">
        ${state.view === 'connection' ? renderConnection() : ''}
        ${state.view === 'settings' ? renderSettings() : ''}
        ${state.view === 'scene' ? renderScene() : ''}
      </main>
      ${state.connected && state.view === 'scene' ? renderVolumeDock() : ''}
      ${state.pickerOpen ? renderPicker() : ''}
      ${state.volumeOpen ? renderVolumeSheet() : ''}
      ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ''}
    </div>
  `;
  if (scrollTop) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderHeader() {
  const status = state.connecting ? 'connecting' : state.connected ? 'connected' : 'disconnected';
  return `
    <header class="app-header">
      <div class="brand">
        <span class="connection-dot ${status}" title="${statusLabel(status)}"></span>
        <strong>Tengu</strong>
      </div>
      ${state.connected && state.view !== 'settings'
        ? `<button class="icon-button" type="button" data-action="open-settings" aria-label="Configurações">${iconSettings()}</button>`
        : state.view === 'settings'
          ? `<button class="icon-button" type="button" data-action="close-settings" aria-label="Voltar">${iconBack()}</button>`
          : ''}
    </header>
  `;
}

function renderConnection() {
  return `
    <section class="connection-screen">
      <div class="connection-hero">
        <div class="logo-mark">${iconMusic()}</div>
        <p class="eyebrow">Kenku FM Remote</p>
        <h1>Conecte ao Kenku</h1>
        <p>Informe o endereço do servidor para começar.</p>
      </div>
      <form class="connection-form" data-form="connection">
        <label for="server-url">Endereço do servidor</label>
        <input id="server-url" data-field="server-url" name="serverUrl" inputmode="url" autocomplete="url" value="${escapeHtml(state.serverUrl)}" placeholder="https://steamdeck.ts.net/v1" />
        ${state.error ? `<p class="form-error">${escapeHtml(state.error)}</p>` : ''}
        <button class="primary-button" type="submit" ${state.connecting ? 'disabled' : ''}>
          ${state.connecting ? '<span class="button-spinner"></span> Conectando...' : 'Conectar'}
        </button>
      </form>
    </section>
  `;
}

function renderSettings() {
  return `
    <section class="page">
      <p class="eyebrow">Configurações</p>
      <h1>Conexão</h1>
      <div class="settings-card">
        <span class="connection-dot connected"></span>
        <div><strong>Kenku conectado</strong><p>${escapeHtml(state.serverUrl)}</p></div>
      </div>
      <button class="secondary-button danger" type="button" data-action="disconnect">Trocar servidor</button>
    </section>
  `;
}

function renderScene() {
  const cards = state.sceneCards.map(renderSceneCard).join('');
  return `
    <section class="page scene-page">
      <div class="page-heading">
        <div><p class="eyebrow">Controle ao vivo</p><h1>Cena</h1></div>
        <button class="add-button" type="button" data-action="open-picker">${iconPlus()} Adicionar</button>
      </div>
      ${cards
        ? `<div class="scene-grid">${cards}</div>`
        : `<div class="empty-state"><div>${iconGrid()}</div><h2>Sua cena está vazia</h2><p>Adicione músicas e sons para montar seu painel.</p><button class="primary-button" type="button" data-action="open-picker">${iconPlus()} Adicionar cards</button></div>`}
    </section>
  `;
}

function renderSceneCard(card: SceneCard) {
  const item = card.type === 'track'
    ? state.tracks.find((track) => track.id === card.id)
    : state.sounds.find((sound) => sound.id === card.id);
  if (!item) return '';

  const active = card.type === 'track'
    ? state.playlistPlayback?.track?.id === card.id && state.playlistPlayback.playing
    : state.soundboardPlayback?.sounds.some((sound) => sound.id === card.id);
  const paused = card.type === 'track' && state.playlistPlayback?.track?.id === card.id && !state.playlistPlayback.playing;

  return `
    <article class="media-card ${active ? 'active' : ''} ${paused ? 'paused' : ''}">
      <button class="remove-button" type="button" data-action="remove-card" data-type="${card.type}" data-id="${card.id}" aria-label="Remover card">×</button>
      <button class="media-toggle" type="button" data-action="${card.type === 'track' ? 'toggle-track' : 'toggle-sound'}" data-id="${card.id}">
        <span class="media-icon ${card.type}">${card.type === 'track' ? iconMusic() : iconWave()}</span>
        <span class="media-copy"><strong>${escapeHtml(item.title)}</strong><small>${card.type === 'track' ? 'Música' : 'Soundboard'}</small></span>
        <span class="play-state">${active ? iconPause() : iconPlay()}</span>
      </button>
    </article>
  `;
}

function renderPicker() {
  const tracks = state.tracks.map((track) => renderPickerItem('track', track.id, track.title)).join('');
  const sounds = state.sounds.map((sound) => renderPickerItem('sound', sound.id, sound.title)).join('');
  return `
    <div class="overlay" data-action="close-picker"></div>
    <section class="bottom-sheet picker-sheet" aria-modal="true">
      <div class="sheet-handle"></div>
      <div class="sheet-heading"><div><p class="eyebrow">Editar cena</p><h2>Adicionar cards</h2></div><button class="icon-button" data-action="close-picker" aria-label="Fechar">×</button></div>
      <h3>Músicas</h3>
      <div class="picker-list">${tracks || '<p class="muted">Nenhuma música encontrada.</p>'}</div>
      <h3>Sons</h3>
      <div class="picker-list">${sounds || '<p class="muted">Nenhum som encontrado.</p>'}</div>
    </section>
  `;
}

function renderPickerItem(type: SceneCard['type'], id: string, title: string) {
  const selected = hasCard({ type, id });
  return `
    <button class="picker-item ${selected ? 'selected' : ''}" type="button" data-action="toggle-picker-card" data-type="${type}" data-id="${id}">
      <span class="media-icon ${type}">${type === 'track' ? iconMusic() : iconWave()}</span>
      <span>${escapeHtml(title)}</span>
      <span class="picker-check">${selected ? '✓' : '+'}</span>
    </button>
  `;
}

function renderVolumeDock() {
  const volume = Math.round((state.playlistPlayback?.volume ?? 1) * 100);
  return `
    <nav class="volume-dock">
      <button type="button" data-action="toggle-volume">
        ${iconVolume()} <span>Volume geral</span><strong>${volume}%</strong>
      </button>
    </nav>
  `;
}

function renderVolumeSheet() {
  const playback = state.playlistPlayback;
  const volume = playback?.volume ?? 1;
  return `
    <div class="overlay" data-action="close-volume"></div>
    <section class="bottom-sheet volume-sheet" aria-modal="true">
      <div class="sheet-handle"></div>
      <div class="sheet-heading"><div><p class="eyebrow">Player</p><h2>Volume geral</h2></div><button class="icon-button" data-action="close-volume" aria-label="Fechar">×</button></div>
      <div class="volume-value" id="volume-value">${Math.round(volume * 100)}%</div>
      <div class="volume-control">
        <button class="icon-button" type="button" data-action="toggle-mute" aria-label="${playback?.muted ? 'Ativar som' : 'Silenciar'}">${playback?.muted ? iconMuted() : iconVolume()}</button>
        <input data-field="master-volume" type="range" min="0" max="1" step="0.01" value="${volume}" />
      </div>
      <p class="volume-note">Controla o volume do player de playlists. A API do Kenku não oferece volume mestre para o soundboard.</p>
    </section>
  `;
}

function updateVolumeLabel(value: string) {
  const label = document.querySelector('#volume-value');
  if (label) label.textContent = `${Math.round(Number(value) * 100)}%`;
}

function runAction(promise: Promise<void>) {
  promise.catch((error) => {
    showToast(error instanceof Error ? error.message : 'Não foi possível executar a ação.');
  });
}

async function apiGet<T>(path: string): Promise<T> {
  return await apiRequest(path, { method: 'GET' }) as T;
}

async function apiRequest(path: string, init: RequestInit = {}) {
  const url = `${state.serverUrl.replace(/\/$/, '')}${path}`;
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');

  try {
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) throw new Error(`O servidor respondeu HTTP ${response.status}.`);
    if ((response.headers.get('content-type') ?? '').includes('application/json')) return response.json();
    return undefined;
  } catch (error) {
    if (error instanceof TypeError) throw new Error('Servidor inacessível ou conexão HTTPS inválida.');
    throw error;
  }
}

function normalizeServerUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/$/, '').replace(/\/?v1$/, '/v1');
}

function closePanels() {
  state.pickerOpen = false;
  state.volumeOpen = false;
}

function showToast(message: string) {
  state.toast = message;
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.toast = '';
    render(false);
  }, 2500);
  render(false);
}

function loadCards(): SceneCard[] {
  try {
    const cards = JSON.parse(localStorage.getItem(STORAGE_CARDS) ?? '[]') as SceneCard[];
    return cards.filter((card) => (card.type === 'track' || card.type === 'sound') && card.id);
  } catch {
    return [];
  }
}

function persistCards() {
  localStorage.setItem(STORAGE_CARDS, JSON.stringify(state.sceneCards));
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function statusLabel(status: string) {
  if (status === 'connecting') return 'Conectando';
  if (status === 'connected') return 'Conectado';
  return 'Desconectado';
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderFatalError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Erro desconhecido';
  app.innerHTML = `
    <main class="fatal-screen">
      <div>
        <span class="connection-dot disconnected"></span>
        <h1>Não foi possível abrir o Tengu</h1>
        <p>${escapeHtml(message)}</p>
        <button class="primary-button" type="button" onclick="location.reload()">Tentar novamente</button>
      </div>
    </main>
  `;
}

const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
function iconSettings() { return svg('<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3V9.6h.09A1.7 1.7 0 0 0 4.6 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.5 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.12.38.34.72.6 1 .3.27.68.4 1.1.4h.09v4h-.09A1.7 1.7 0 0 0 19.4 15Z"/>'); }
function iconBack() { return svg('<path d="m15 18-6-6 6-6"/>'); }
function iconPlus() { return svg('<path d="M12 5v14M5 12h14"/>'); }
function iconPlay() { return svg('<path class="fill" d="m8 5 11 7-11 7V5Z"/>'); }
function iconPause() { return svg('<path class="fill" d="M7 5h4v14H7zM14 5h4v14h-4z"/>'); }
function iconMusic() { return svg('<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>'); }
function iconWave() { return svg('<path d="M4 12v2M8 8v8M12 5v14M16 8v8M20 11v2"/>'); }
function iconGrid() { return svg('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><path d="M17.5 14v7M14 17.5h7"/>'); }
function iconVolume() { return svg('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12"/>'); }
function iconMuted() { return svg('<path d="M11 5 6 9H3v6h3l5 4V5ZM16 10l5 5M21 10l-5 5"/>'); }
