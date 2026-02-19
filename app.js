const STORAGE_KEY = "songapp:v1";

/** @typedef {{id:string,title:string,artist:string,album:string,coverUrl:string,audioUrl:string,durationSec:number|null,notes:string,createdAt:number}} Song */
/** @typedef {{songs:Song[], queueIds:string[], nowPlayingId:string|null, shuffle:boolean, repeat:"off"|"one"|"all"}} State */

const $ = (sel) => /** @type {HTMLElement} */ (document.querySelector(sel));

const els = {
  songList: $("#songList"),
  libraryMeta: $("#libraryMeta"),
  searchInput: /** @type {HTMLInputElement} */ ($("#searchInput")),
  sortSelect: /** @type {HTMLSelectElement} */ ($("#sortSelect")),
  orderSelect: /** @type {HTMLSelectElement} */ ($("#orderSelect")),

  addForm: /** @type {HTMLFormElement} */ ($("#addForm")),
  titleInput: /** @type {HTMLInputElement} */ ($("#titleInput")),
  artistInput: /** @type {HTMLInputElement} */ ($("#artistInput")),
  albumInput: /** @type {HTMLInputElement} */ ($("#albumInput")),
  coverInput: /** @type {HTMLInputElement} */ ($("#coverInput")),
  audioUrlInput: /** @type {HTMLInputElement} */ ($("#audioUrlInput")),
  audioFileInput: /** @type {HTMLInputElement} */ ($("#audioFileInput")),
  durationInput: /** @type {HTMLInputElement} */ ($("#durationInput")),
  notesInput: /** @type {HTMLInputElement} */ ($("#notesInput")),
  seedBtn: /** @type {HTMLButtonElement} */ ($("#seedBtn")),

  importBtn: /** @type {HTMLButtonElement} */ ($("#importBtn")),
  exportBtn: /** @type {HTMLButtonElement} */ ($("#exportBtn")),
  resetBtn: /** @type {HTMLButtonElement} */ ($("#resetBtn")),

  coverArt: $("#coverArt"),
  nowTitle: $("#nowTitle"),
  nowSub: $("#nowSub"),
  playerMeta: $("#playerMeta"),
  playBtn: /** @type {HTMLButtonElement} */ ($("#playBtn")),
  prevBtn: /** @type {HTMLButtonElement} */ ($("#prevBtn")),
  nextBtn: /** @type {HTMLButtonElement} */ ($("#nextBtn")),
  shuffleBtn: /** @type {HTMLButtonElement} */ ($("#shuffleBtn")),
  repeatBtn: /** @type {HTMLButtonElement} */ ($("#repeatBtn")),
  seek: /** @type {HTMLInputElement} */ ($("#seek")),
  timeNow: $("#timeNow"),
  timeDur: $("#timeDur"),
  volume: /** @type {HTMLInputElement} */ ($("#volume")),
  clearQueueBtn: /** @type {HTMLButtonElement} */ ($("#clearQueueBtn")),
  queue: $("#queue"),
  queueMeta: $("#queueMeta"),
  audio: /** @type {HTMLAudioElement} */ ($("#audio")),

  toast: $("#toast"),
};

/** @type {State} */
let state = loadState();

let toastTimer = /** @type {number|null} */ (null);
let userSeeking = false;
let tempObjectUrls = new Set();

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function safeStr(s) {
  return (s ?? "").toString().trim();
}

function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function parseDurationToSec(text) {
  const t = safeStr(text);
  if (!t) return null;
  const m = t.match(/^(\d{1,3}):([0-5]\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function songLabel(song) {
  const a = song.artist ? song.artist : "Unknown artist";
  const b = song.album ? ` • ${song.album}` : "";
  return `${a}${b}`;
}

function initialBadge(song) {
  const t = safeStr(song.title);
  return (t[0] || "♪").toUpperCase();
}

function loadState() {
  /** @type {State} */
  const fallback = { songs: [], queueIds: [], nowPlayingId: null, shuffle: false, repeat: "off" };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = /** @type {State} */ (JSON.parse(raw));
    if (!parsed || !Array.isArray(parsed.songs)) return fallback;
    return {
      songs: parsed.songs.filter(Boolean),
      queueIds: Array.isArray(parsed.queueIds) ? parsed.queueIds.filter((x) => typeof x === "string") : [],
      nowPlayingId: typeof parsed.nowPlayingId === "string" ? parsed.nowPlayingId : null,
      shuffle: !!parsed.shuffle,
      repeat: parsed.repeat === "one" || parsed.repeat === "all" ? parsed.repeat : "off",
    };
  } catch {
    return fallback;
  }
}

function saveState() {
  const toSave = {
    ...state,
    songs: state.songs.map((s) => ({ ...s })), // copy for safety
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => els.toast.classList.remove("show"), 1600);
}

function getSong(id) {
  return state.songs.find((s) => s.id === id) || null;
}

function normalizeSong(s) {
  return {
    id: s.id || uid(),
    title: safeStr(s.title) || "Untitled",
    artist: safeStr(s.artist),
    album: safeStr(s.album),
    coverUrl: safeStr(s.coverUrl),
    audioUrl: safeStr(s.audioUrl),
    durationSec: typeof s.durationSec === "number" && Number.isFinite(s.durationSec) ? s.durationSec : null,
    notes: safeStr(s.notes),
    createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
  };
}

function addSong(song) {
  state.songs.unshift(normalizeSong(song));
  saveState();
}

function removeSong(id) {
  const idx = state.songs.findIndex((s) => s.id === id);
  if (idx >= 0) state.songs.splice(idx, 1);

  state.queueIds = state.queueIds.filter((q) => q !== id);
  if (state.nowPlayingId === id) {
    state.nowPlayingId = null;
    els.audio.pause();
    els.audio.removeAttribute("src");
    els.audio.load();
  }
  saveState();
}

function updateSong(id, patch) {
  const s = getSong(id);
  if (!s) return;
  Object.assign(s, normalizeSong({ ...s, ...patch, id: s.id, createdAt: s.createdAt }));
  saveState();
}

function enqueue(id, { playNow = false } = {}) {
  if (!getSong(id)) return;
  state.queueIds.push(id);
  if (playNow) {
    state.nowPlayingId = id;
    playById(id);
  }
  saveState();
}

function clearQueue() {
  state.queueIds = [];
  saveState();
}

function moveQueue(fromIdx, toIdx) {
  if (fromIdx === toIdx) return;
  if (fromIdx < 0 || fromIdx >= state.queueIds.length) return;
  if (toIdx < 0 || toIdx >= state.queueIds.length) return;
  const [x] = state.queueIds.splice(fromIdx, 1);
  state.queueIds.splice(toIdx, 0, x);
  saveState();
}

function removeFromQueue(idx) {
  if (idx < 0 || idx >= state.queueIds.length) return;
  const id = state.queueIds[idx];
  state.queueIds.splice(idx, 1);
  if (state.queueIds.length === 0 && state.repeat === "off") {
    // nothing
  }
  saveState();
  return id;
}

function setRepeat(mode) {
  state.repeat = mode;
  saveState();
}

function setShuffle(on) {
  state.shuffle = on;
  saveState();
}

function setNowPlaying(id) {
  state.nowPlayingId = id;
  saveState();
}

function filteredSongs() {
  const q = safeStr(els.searchInput.value).toLowerCase();
  let items = state.songs.slice();
  if (q) {
    items = items.filter((s) => {
      const hay = `${s.title} ${s.artist} ${s.album}`.toLowerCase();
      return hay.includes(q);
    });
  }

  const sort = els.sortSelect.value;
  const dir = els.orderSelect.value === "asc" ? 1 : -1;

  const keyFn = (s) => {
    switch (sort) {
      case "title":
        return (s.title || "").toLowerCase();
      case "artist":
        return (s.artist || "").toLowerCase();
      case "album":
        return (s.album || "").toLowerCase();
      case "duration":
        return s.durationSec ?? -1;
      case "recent":
      default:
        return s.createdAt ?? 0;
    }
  };

  items.sort((a, b) => {
    const ka = keyFn(a);
    const kb = keyFn(b);
    if (ka < kb) return -1 * dir;
    if (ka > kb) return 1 * dir;
    return 0;
  });
  return items;
}

function renderLibrary() {
  const items = filteredSongs();
  els.libraryMeta.textContent = `${state.songs.length} song${state.songs.length === 1 ? "" : "s"}`;

  els.songList.innerHTML = "";
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "row";
    empty.innerHTML = `
      <div class="badge">♪</div>
      <div>
        <div class="title">No songs yet</div>
        <div class="sub">Add a song URL (or pick a local file) to start.</div>
      </div>
      <div class="actions"></div>
    `;
    els.songList.appendChild(empty);
    return;
  }

  for (const song of items) {
    const row = document.createElement("div");
    row.className = "row";
    row.setAttribute("role", "listitem");

    const badge = document.createElement("div");
    badge.className = "badge";
    if (song.coverUrl) {
      badge.style.backgroundImage = `url("${song.coverUrl.replaceAll('"', "%22")}")`;
      badge.textContent = "";
    } else {
      badge.textContent = initialBadge(song);
    }

    const mid = document.createElement("div");
    const dur = song.durationSec != null ? ` • ${formatTime(song.durationSec)}` : "";
    mid.innerHTML = `
      <div class="title">${escapeHtml(song.title)}</div>
      <div class="sub">${escapeHtml(songLabel(song))}${dur}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "actions";

    const playNow = mkBtn("Play", "btn icon", () => {
      ensureQueued(song.id);
      playById(song.id);
    });
    playNow.title = "Play now";
    playNow.textContent = "▶";

    const queue = mkBtn("Queue", "btn", () => {
      enqueue(song.id);
      toast("Added to queue");
      renderAll();
    });

    const edit = mkBtn("Edit", "btn", () => openEdit(song.id));
    const del = mkBtn("Delete", "btn danger", () => {
      if (!confirm(`Delete "${song.title}"?`)) return;
      removeSong(song.id);
      toast("Deleted");
      renderAll();
    });

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = song.audioUrl ? "URL" : "Local";

    actions.append(playNow, queue, edit, del, pill);
    row.append(badge, mid, actions);
    els.songList.appendChild(row);
  }
}

function renderPlayer() {
  const now = state.nowPlayingId ? getSong(state.nowPlayingId) : null;
  const qCount = state.queueIds.length;
  els.playerMeta.textContent = now ? `Playing • ${qCount} in queue` : `${qCount} in queue`;

  if (!now) {
    els.nowTitle.textContent = "—";
    els.nowSub.textContent = "—";
    els.coverArt.style.backgroundImage = "";
    els.playBtn.textContent = "▶";
    els.timeNow.textContent = "0:00";
    els.timeDur.textContent = "0:00";
    els.seek.value = "0";
  } else {
    els.nowTitle.textContent = now.title || "Untitled";
    els.nowSub.textContent = songLabel(now);
    if (now.coverUrl) els.coverArt.style.backgroundImage = `url("${now.coverUrl.replaceAll('"', "%22")}")`;
    else els.coverArt.style.backgroundImage = "";
  }

  els.shuffleBtn.classList.toggle("on", !!state.shuffle);
  els.repeatBtn.textContent =
    state.repeat === "off" ? "Repeat: Off" : state.repeat === "one" ? "Repeat: One" : "Repeat: All";
}

function renderQueue() {
  els.queueMeta.textContent = `${state.queueIds.length} track${state.queueIds.length === 1 ? "" : "s"}`;
  els.queue.innerHTML = "";
  if (state.queueIds.length === 0) {
    const empty = document.createElement("div");
    empty.className = "qrow";
    empty.innerHTML = `
      <div class="qnum">—</div>
      <div>
        <div class="qtitle">Queue is empty</div>
        <div class="qsub">Add songs from your library.</div>
      </div>
      <div></div>
    `;
    els.queue.appendChild(empty);
    return;
  }

  state.queueIds.forEach((id, idx) => {
    const song = getSong(id);
    if (!song) return;

    const row = document.createElement("div");
    row.className = "qrow";
    if (id === state.nowPlayingId) row.classList.add("playing");

    const num = document.createElement("div");
    num.className = "qnum";
    num.textContent = String(idx + 1);

    const mid = document.createElement("div");
    mid.innerHTML = `
      <div class="qtitle">${escapeHtml(song.title)}</div>
      <div class="qsub">${escapeHtml(songLabel(song))}</div>
    `;
    mid.style.cursor = "pointer";
    mid.addEventListener("click", () => {
      playById(id);
    });

    const act = document.createElement("div");
    act.className = "actions";

    const up = mkBtn("Up", "btn icon", () => {
      moveQueue(idx, clamp(idx - 1, 0, state.queueIds.length - 1));
      renderAll();
    });
    up.textContent = "↑";
    up.title = "Move up";

    const dn = mkBtn("Down", "btn icon", () => {
      moveQueue(idx, clamp(idx + 1, 0, state.queueIds.length - 1));
      renderAll();
    });
    dn.textContent = "↓";
    dn.title = "Move down";

    const rm = mkBtn("Remove", "btn icon danger", () => {
      removeFromQueue(idx);
      renderAll();
    });
    rm.textContent = "✕";
    rm.title = "Remove from queue";

    act.append(up, dn, rm);
    row.append(num, mid, act);
    els.queue.appendChild(row);
  });
}

function renderAll() {
  renderLibrary();
  renderPlayer();
  renderQueue();
}

function ensureQueued(id) {
  if (!state.queueIds.includes(id)) enqueue(id);
  if (!state.nowPlayingId) setNowPlaying(id);
}

async function playById(id) {
  const song = getSong(id);
  if (!song) return;

  setNowPlaying(id);
  if (!state.queueIds.includes(id)) state.queueIds.push(id);

  const src = song.audioUrl;
  if (!src) {
    toast("This track has no audio URL (local files are temporary).");
    renderAll();
    return;
  }

  if (els.audio.src !== src) {
    els.audio.src = src;
  }

  try {
    await els.audio.play();
    els.playBtn.textContent = "⏸";
    toast("Playing");
  } catch {
    els.playBtn.textContent = "▶";
    toast("Could not start playback (browser blocked autoplay?)");
  }
  renderAll();
}

function pause() {
  els.audio.pause();
  els.playBtn.textContent = "▶";
}

async function togglePlay() {
  if (!state.nowPlayingId) {
    const first = state.queueIds[0] || state.songs[0]?.id;
    if (first) {
      ensureQueued(first);
      await playById(first);
    } else {
      toast("Add a song first");
    }
    return;
  }

  if (els.audio.paused) {
    try {
      await els.audio.play();
      els.playBtn.textContent = "⏸";
    } catch {
      toast("Playback blocked");
    }
  } else {
    pause();
  }
}

function nextTrack({ userAction = false } = {}) {
  const nowId = state.nowPlayingId;
  if (!nowId) return;

  if (state.repeat === "one" && !userAction) {
    els.audio.currentTime = 0;
    els.audio.play().catch(() => {});
    return;
  }

  const queue = state.queueIds.slice();
  const idx = queue.indexOf(nowId);

  const pickFromQueue = () => {
    if (queue.length === 0) return null;
    if (state.shuffle) {
      const pool = queue.filter((x) => x !== nowId);
      const choice = pool.length ? pool[Math.floor(Math.random() * pool.length)] : queue[0];
      return choice || null;
    }
    const next = queue[idx + 1];
    return next || null;
  };

  let nextId = pickFromQueue();
  if (!nextId && state.repeat === "all" && queue.length) nextId = queue[0];

  if (!nextId) {
    pause();
    toast("End of queue");
    return;
  }

  playById(nextId);
}

function prevTrack() {
  const nowId = state.nowPlayingId;
  if (!nowId) return;
  if (els.audio.currentTime > 3) {
    els.audio.currentTime = 0;
    return;
  }
  const queue = state.queueIds.slice();
  const idx = queue.indexOf(nowId);
  const prevId = idx > 0 ? queue[idx - 1] : null;
  if (!prevId) {
    toast("No previous track");
    return;
  }
  playById(prevId);
}

function openEdit(id) {
  const song = getSong(id);
  if (!song) return;

  const title = prompt("Title", song.title);
  if (title == null) return;
  const artist = prompt("Artist", song.artist || "");
  if (artist == null) return;
  const album = prompt("Album", song.album || "");
  if (album == null) return;
  const coverUrl = prompt("Cover URL (optional)", song.coverUrl || "");
  if (coverUrl == null) return;
  const audioUrl = prompt("Audio URL (leave blank to keep current)", song.audioUrl || "");
  if (audioUrl == null) return;
  const duration = prompt("Duration mm:ss (optional)", song.durationSec ? formatTime(song.durationSec) : "");
  if (duration == null) return;
  const notes = prompt("Notes (optional)", song.notes || "");
  if (notes == null) return;

  updateSong(id, {
    title,
    artist,
    album,
    coverUrl,
    audioUrl: audioUrl,
    durationSec: parseDurationToSec(duration),
    notes,
  });
  toast("Saved");
  renderAll();
}

function mkBtn(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function escapeHtml(s) {
  return safeStr(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function revokeTempUrls() {
  for (const u of tempObjectUrls) URL.revokeObjectURL(u);
  tempObjectUrls.clear();
}

function addFromForm(e) {
  e.preventDefault();

  const title = safeStr(els.titleInput.value);
  const artist = safeStr(els.artistInput.value);
  const album = safeStr(els.albumInput.value);
  const coverUrl = safeStr(els.coverInput.value);
  const audioUrlInput = safeStr(els.audioUrlInput.value);
  const durationSec = parseDurationToSec(els.durationInput.value);
  const notes = safeStr(els.notesInput.value);

  /** @type {File|null} */
  const file = els.audioFileInput.files && els.audioFileInput.files[0] ? els.audioFileInput.files[0] : null;

  if (!audioUrlInput && !file) {
    toast("Add an audio URL or pick a local file");
    return;
  }

  if (audioUrlInput && file) {
    toast("Choose either URL or local file (not both)");
    return;
  }

  if (audioUrlInput) {
    addSong({
      id: uid(),
      title: title || "Untitled",
      artist,
      album,
      coverUrl,
      audioUrl: audioUrlInput,
      durationSec,
      notes,
      createdAt: Date.now(),
    });
    toast("Added");
    els.addForm.reset();
    renderAll();
    return;
  }

  // Local file: create temporary object URL and add as a non-persisted entry
  if (file) {
    const objUrl = URL.createObjectURL(file);
    tempObjectUrls.add(objUrl);

    const tmp = normalizeSong({
      id: uid(),
      title: title || file.name.replace(/\.[^.]+$/, ""),
      artist,
      album,
      coverUrl,
      audioUrl: objUrl,
      durationSec,
      notes,
      createdAt: Date.now(),
    });

    state.songs.unshift(tmp);
    saveState();

    ensureQueued(tmp.id);
    playById(tmp.id);
    toast("Added (local file is temporary)");
    els.addForm.reset();
    renderAll();
  }
}

function addSeed() {
  const samples = [
    {
      title: "Sample Track",
      artist: "Edit me",
      album: "Your library",
      coverUrl: "",
      audioUrl: "https://www.kozco.com/tech/piano2-CoolEdit.mp3",
      durationSec: null,
      notes: "Replace the URL with your own track.",
    },
    {
      title: "Ambient Sample",
      artist: "Edit me",
      album: "",
      coverUrl: "",
      audioUrl: "https://www.kozco.com/tech/organfinale.mp3",
      durationSec: null,
      notes: "",
    },
  ];
  for (const s of samples) addSong({ ...s, id: uid(), createdAt: Date.now() });
  toast("Added sample songs");
  renderAll();
}

function cycleRepeat() {
  const next = state.repeat === "off" ? "all" : state.repeat === "all" ? "one" : "off";
  setRepeat(next);
  toast(`Repeat: ${next}`);
  renderPlayer();
}

function importLibrary() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json,.json";
  input.addEventListener("change", async () => {
    const file = input.files && input.files[0] ? input.files[0] : null;
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const songs = Array.isArray(parsed?.songs) ? parsed.songs : Array.isArray(parsed) ? parsed : [];
      if (!songs.length) {
        toast("No songs found in JSON");
        return;
      }
      const normalized = songs.map((s) => normalizeSong(s));

      // Merge by id
      const map = new Map(state.songs.map((s) => [s.id, s]));
      for (const s of normalized) map.set(s.id, s);
      state.songs = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      saveState();
      toast("Imported");
      renderAll();
    } catch {
      toast("Invalid JSON");
    }
  });
  input.click();
}

function exportLibrary() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    songs: state.songs.filter((s) => !!s.audioUrl && !s.audioUrl.startsWith("blob:")),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "song-app-library.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast("Exported JSON");
}

function resetAll() {
  if (!confirm("Clear your entire library and queue?")) return;
  revokeTempUrls();
  state = { songs: [], queueIds: [], nowPlayingId: null, shuffle: false, repeat: "off" };
  saveState();
  els.audio.pause();
  els.audio.removeAttribute("src");
  els.audio.load();
  toast("Reset");
  renderAll();
}

function bind() {
  els.addForm.addEventListener("submit", addFromForm);
  els.seedBtn.addEventListener("click", addSeed);
  els.importBtn.addEventListener("click", importLibrary);
  els.exportBtn.addEventListener("click", exportLibrary);
  els.resetBtn.addEventListener("click", resetAll);

  els.searchInput.addEventListener("input", renderLibrary);
  els.sortSelect.addEventListener("change", renderLibrary);
  els.orderSelect.addEventListener("change", renderLibrary);

  els.playBtn.addEventListener("click", togglePlay);
  els.nextBtn.addEventListener("click", () => nextTrack({ userAction: true }));
  els.prevBtn.addEventListener("click", prevTrack);
  els.shuffleBtn.addEventListener("click", () => {
    setShuffle(!state.shuffle);
    toast(state.shuffle ? "Shuffle on" : "Shuffle off");
    renderPlayer();
  });
  els.repeatBtn.addEventListener("click", cycleRepeat);
  els.clearQueueBtn.addEventListener("click", () => {
    clearQueue();
    toast("Queue cleared");
    renderAll();
  });

  els.volume.addEventListener("input", () => {
    els.audio.volume = clamp(Number(els.volume.value), 0, 1);
  });
  els.audio.volume = clamp(Number(els.volume.value), 0, 1);

  els.seek.addEventListener("input", () => {
    userSeeking = true;
    const dur = els.audio.duration;
    if (Number.isFinite(dur) && dur > 0) {
      const frac = Number(els.seek.value) / Number(els.seek.max);
      const t = frac * dur;
      els.timeNow.textContent = formatTime(t);
    }
  });
  els.seek.addEventListener("change", () => {
    const dur = els.audio.duration;
    if (Number.isFinite(dur) && dur > 0) {
      const frac = Number(els.seek.value) / Number(els.seek.max);
      els.audio.currentTime = clamp(frac * dur, 0, dur);
    }
    userSeeking = false;
  });

  els.audio.addEventListener("timeupdate", () => {
    if (userSeeking) return;
    const dur = els.audio.duration;
    const t = els.audio.currentTime;
    els.timeNow.textContent = formatTime(t);
    if (Number.isFinite(dur) && dur > 0) {
      const frac = clamp(t / dur, 0, 1);
      els.seek.value = String(Math.floor(frac * Number(els.seek.max)));
    } else {
      els.seek.value = "0";
    }
  });
  els.audio.addEventListener("durationchange", () => {
    els.timeDur.textContent = formatTime(els.audio.duration);
  });
  els.audio.addEventListener("play", () => {
    els.playBtn.textContent = "⏸";
  });
  els.audio.addEventListener("pause", () => {
    els.playBtn.textContent = "▶";
  });
  els.audio.addEventListener("ended", () => {
    nextTrack({ userAction: false });
  });
  els.audio.addEventListener("error", () => {
    toast("Audio failed to load");
  });

  window.addEventListener("beforeunload", () => revokeTempUrls());

  window.addEventListener("keydown", (e) => {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (inInput && e.code !== "Space") return;

    if (e.code === "Space") {
      e.preventDefault();
      togglePlay();
      return;
    }
    if (e.key.toLowerCase() === "k") nextTrack({ userAction: true });
    if (e.key.toLowerCase() === "j") prevTrack();
    if (e.key.toLowerCase() === "s") {
      setShuffle(!state.shuffle);
      toast(state.shuffle ? "Shuffle on" : "Shuffle off");
      renderPlayer();
    }
    if (e.key.toLowerCase() === "r") cycleRepeat();
  });
}

// Cleanup: if some songs were local blob URLs from a previous session, remove them
function dropStaleBlobSongs() {
  const before = state.songs.length;
  state.songs = state.songs.filter((s) => !(s.audioUrl || "").startsWith("blob:"));
  if (state.songs.length !== before) {
    // also sanitize queue/nowPlaying
    const ids = new Set(state.songs.map((s) => s.id));
    state.queueIds = state.queueIds.filter((id) => ids.has(id));
    if (state.nowPlayingId && !ids.has(state.nowPlayingId)) state.nowPlayingId = null;
    saveState();
  }
}

dropStaleBlobSongs();
bind();
renderAll();
