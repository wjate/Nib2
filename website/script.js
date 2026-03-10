// DOS Nibbles clone with levels, level editor, and persistent storage

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
// each 'dot' will be a few pixels wide; grid size is only used for
// rendering and internal location, snake movement is now more fluid.
const grid = 4;

// ===== Persistent global logger (chronological, color-coded, non-blocking) =====
const LOG_STORAGE_KEY = 'nibblesGlobalLogV1';
const LOG_MAX_ENTRIES = 1200;

function formatLogArg(arg) {
    if (arg instanceof Error) {
        const stack = arg.stack || '';
        return stack ? `${arg.name}: ${arg.message}\n${stack}` : `${arg.name}: ${arg.message}`;
    }
    if (typeof arg === 'string') return arg;
    try {
        return JSON.stringify(arg);
    } catch {
        return String(arg);
    }
}

function formatLogMessage(args) {
    return args.map(formatLogArg).join(' ');
}

function loadPersistentLog() {
    try {
        const raw = localStorage.getItem(LOG_STORAGE_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

function savePersistentLog(entries) {
    try {
        localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(entries.slice(-LOG_MAX_ENTRIES)));
    } catch {
        // If storage is full or blocked, keep runtime logging working.
    }
}

const globalLogState = {
    entries: loadPersistentLog(),
    hasFailure: false
};
globalLogState.hasFailure = globalLogState.entries.some((e) => e && e.level === 'bad');

function logAdd(level, message, meta) {
    const entry = {
        t: Date.now(),
        level: level === 'bad' ? 'bad' : level === 'warn' ? 'warn' : 'good',
        msg: String(message || ''),
        meta: meta && typeof meta === 'object' ? meta : null
    };
    globalLogState.entries.push(entry);
    if (globalLogState.entries.length > LOG_MAX_ENTRIES) {
        globalLogState.entries.splice(0, globalLogState.entries.length - LOG_MAX_ENTRIES);
    }
    if (entry.level === 'bad') globalLogState.hasFailure = true;
    savePersistentLog(globalLogState.entries);
    renderGlobalLogUi(entry);
    updateGlobalFailureUi();
}

function logGood(...args) {
    logAdd('good', formatLogMessage(args));
}
function logWarn(...args) {
    logAdd('warn', formatLogMessage(args));
}
function logBad(...args) {
    logAdd('bad', formatLogMessage(args));
}

function el(id) {
    return document.getElementById(id);
}

function ensureGlobalLogDom() {
    return {
        banner: el('globalFailureBanner'),
        bannerText: el('globalFailureText'),
        bannerOpenBtn: el('globalFailureOpenBtn'),
        toggleBtn: el('globalLogToggleBtn'),
        drawer: el('globalLogDrawer'),
        list: el('globalLogList'),
        meta: el('globalLogMeta'),
        copyBtn: el('globalLogCopyBtn'),
        clearBtn: el('globalLogClearBtn'),
        closeBtn: el('globalLogCloseBtn')
    };
}

function formatTimeShort(ts) {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
}

function renderLogEntryNode(entry) {
    const row = document.createElement('div');
    row.className = `log-entry ${entry.level}`;

    const time = document.createElement('div');
    time.className = 'log-time';
    time.textContent = formatTimeShort(entry.t);

    const lvl = document.createElement('div');
    lvl.className = 'log-level';
    lvl.textContent = entry.level === 'bad' ? 'BAD' : entry.level === 'warn' ? 'WARN' : 'GOOD';

    const msg = document.createElement('div');
    msg.className = 'log-msg';
    msg.textContent = entry.msg;

    row.appendChild(time);
    row.appendChild(lvl);
    row.appendChild(msg);
    return row;
}

function renderGlobalLogUi(addedEntry) {
    const dom = ensureGlobalLogDom();
    if (!dom.list || !dom.meta) return;

    dom.meta.textContent = `${globalLogState.entries.length} entr${globalLogState.entries.length === 1 ? 'y' : 'ies'}`;

    // Initial render: build the list once.
    if (!dom.list.dataset.rendered) {
        dom.list.textContent = '';
        globalLogState.entries.forEach((e) => dom.list.appendChild(renderLogEntryNode(e)));
        dom.list.dataset.rendered = '1';
        return;
    }

    // Incremental render.
    if (addedEntry) {
        dom.list.appendChild(renderLogEntryNode(addedEntry));
        // If user is at/near bottom, keep it pinned to bottom.
        const nearBottom = dom.list.scrollHeight - dom.list.scrollTop - dom.list.clientHeight < 120;
        if (nearBottom) dom.list.scrollTop = dom.list.scrollHeight;
    }
}

function updateGlobalFailureUi() {
    const dom = ensureGlobalLogDom();
    if (!dom.toggleBtn || !dom.banner) return;

    dom.toggleBtn.classList.toggle('has-errors', globalLogState.hasFailure);
    dom.banner.style.display = globalLogState.hasFailure ? 'flex' : 'none';
}

function openGlobalLogDrawer() {
    const dom = ensureGlobalLogDom();
    if (!dom.drawer) return;
    dom.drawer.style.display = 'flex';
    renderGlobalLogUi();
    // Best effort: focus the close button so keyboard users can exit.
    dom.closeBtn?.focus?.();
    logGood('Opened log drawer.');
}

function closeGlobalLogDrawer() {
    const dom = ensureGlobalLogDom();
    if (!dom.drawer) return;
    dom.drawer.style.display = 'none';
}

function clearGlobalLog() {
    globalLogState.entries = [];
    globalLogState.hasFailure = false;
    savePersistentLog(globalLogState.entries);

    const dom = ensureGlobalLogDom();
    if (dom.list) {
        dom.list.textContent = '';
        dom.list.dataset.rendered = '1';
    }
    if (dom.meta) dom.meta.textContent = '0 entries';
    updateGlobalFailureUi();
    // Don't call logGood() here (it would re-add an entry right after clearing).
}

function buildGlobalLogText() {
    const lines = [];
    for (const e of globalLogState.entries) {
        if (!e) continue;
        const iso = new Date(e.t).toISOString();
        const lvl = e.level === 'bad' ? 'BAD' : e.level === 'warn' ? 'WARN' : 'GOOD';
        lines.push(`[${iso}] ${lvl} ${String(e.msg || '')}`);
    }
    return lines.join('\n');
}

async function copyGlobalLogToClipboard() {
    const text = buildGlobalLogText();
    if (!text) {
        logWarn('Copy logs: nothing to copy.');
        return;
    }
    try {
        await navigator.clipboard.writeText(text);
        logGood(`Copied ${globalLogState.entries.length} log entr${globalLogState.entries.length === 1 ? 'y' : 'ies'} to clipboard.`);
        return;
    } catch {
        // Fallback for older browsers / non-secure contexts.
    }
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) {
            logGood(`Copied ${globalLogState.entries.length} log entr${globalLogState.entries.length === 1 ? 'y' : 'ies'} to clipboard.`);
        } else {
            logBad('Copy logs failed.');
        }
    } catch (err) {
        logBad('Copy logs failed:', err);
    }
}

function initGlobalLoggerUi() {
    const dom = ensureGlobalLogDom();
    if (!dom.toggleBtn || !dom.drawer || !dom.list) return;

    dom.toggleBtn.addEventListener('click', () => {
        if (dom.drawer.style.display === 'none' || !dom.drawer.style.display) openGlobalLogDrawer();
        else closeGlobalLogDrawer();
    });
    dom.closeBtn?.addEventListener('click', closeGlobalLogDrawer);
    dom.clearBtn?.addEventListener('click', clearGlobalLog);
    dom.copyBtn?.addEventListener('click', () => {
        copyGlobalLogToClipboard();
    });
    dom.bannerOpenBtn?.addEventListener('click', openGlobalLogDrawer);

    // Initial render + state.
    renderGlobalLogUi();
    updateGlobalFailureUi();
}

function installGlobalLogHooks() {
    // Capture console output chronologically, without breaking existing behavior.
    const original = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console)
    };
    console.log = (...args) => {
        try { logGood(...args); } catch {}
        original.log(...args);
    };
    console.warn = (...args) => {
        try { logWarn(...args); } catch {}
        original.warn(...args);
    };
    console.error = (...args) => {
        try { logBad(...args); } catch {}
        original.error(...args);
    };

    window.addEventListener('error', (ev) => {
        try {
            const msg = ev?.error ? formatLogArg(ev.error) : String(ev?.message || 'Unknown error');
            logBad(msg);
        } catch {}
    });
    window.addEventListener('unhandledrejection', (ev) => {
        try {
            const reason = ev?.reason;
            logBad('Unhandled rejection:', reason instanceof Error ? reason : formatLogArg(reason));
        } catch {}
    });

    logGood('Logger initialized.');
}

// fixed playing field dimensions in dots
const LOCAL_COLUMNS = 100;
const LOCAL_ROWS = 50;
const ONLINE_COLUMNS = 220;
const ONLINE_ROWS = 120;
let columns = LOCAL_COLUMNS;
let rows = LOCAL_ROWS;

// derived canvas pixel dimensions for the playable field
let canvasWidth = 0;
let canvasHeight = 0;
let actualGrid = 1;

const VIEWPORT_PADDING = 8;

function setArenaForMode(modeName) {
    if (modeName === 'online') {
        columns = ONLINE_COLUMNS;
        rows = ONLINE_ROWS;
    } else {
        columns = LOCAL_COLUMNS;
        rows = LOCAL_ROWS;
    }
}

function updateCanvasMetrics() {
    // Keep canvas fully inside the visible viewport, accounting for chrome bars.
    const appShellEl = document.getElementById('appShell');
    const infoEl = document.getElementById('info');
    const scoreboardEl = document.getElementById('scoreboardPanel');
    const menuBarEl = document.getElementById('menuBar');
    const menuHeight = appShellEl && appShellEl.style.display !== 'none' ? (menuBarEl?.offsetHeight || 0) : 0;
    const infoHeight = infoEl && infoEl.style.display !== 'none' ? infoEl.offsetHeight : 0;
    const scoreboardHeight = scoreboardEl ? scoreboardEl.offsetHeight : 0;

    const availableWidth = Math.max(40, window.innerWidth - VIEWPORT_PADDING * 2);
    const availableHeight = Math.max(
        40,
        window.innerHeight - menuHeight - infoHeight - scoreboardHeight - VIEWPORT_PADDING * 2
    );

    actualGrid = Math.max(1, Math.floor(Math.min(availableWidth / columns, availableHeight / rows)));
    canvasWidth = columns * actualGrid;
    canvasHeight = rows * actualGrid;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
}

updateCanvasMetrics();

// Init global logging UI/hooks as early as possible.
initGlobalLoggerUi();
installGlobalLogHooks();

let players = [];
let currentNumber = 1;
let level = 1;
let gameSpeed = 100; // ms per move (constant)
let speedMultiplier = 1; // user-adjustable delay factor
let intervalId;
let mode = 'single';
let numberPos;
let walls = []; // array of wall segments: {x, y}
let selectedLevelIdx = 0;
let isPaused = false;
let gameEdition = 'deluxe';
let classicState = 'idle'; // idle | waiting_start | running | waiting_respawn | game_over_prompt
let classicConfig = { players: 1, speed: 50, speedUp: true, monochrome: false };
let classicNeedsRespawn = false;
let onlineStatePollId = null;
let onlineInputPollId = null;
let lastOnlinePushAt = 0;
let isOnlineGuestView = false;
const MAX_DIRECTION_QUEUE = 6;
const SCOREBOARD_KEY = 'nibblesScoreboardV1';
let aiCount = 0;
let aiIntelligence = 'normal';
let deathResetsAllPlayers = true;
let manualLevelsOnly = false;
let godModeEnabled = false;

const ONLINE_PUSH_INTERVAL_MS = 120;
const ONLINE_POLL_INTERVAL_MS = 140;
const ONLINE_INPUT_POLL_INTERVAL_MS = 90;

const onlineSession = {
    mode: 'none', // none | host | peer
    roomCode: '',
    token: '',
    playerId: '',
    playerName: '',
    maxPlayers: 5,
    started: false,
    players: []
};

// UI Elements
const settingsDiv = document.getElementById('settings');
const infoDiv = document.getElementById('info');
const levelDisplay = document.getElementById('levelDisplay');
const scoreDisplay = document.getElementById('scoreDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const pauseDisplay = document.getElementById('pauseDisplay');
const endBtn = document.getElementById('endBtn');
const pauseBtn = document.getElementById('pauseBtn');
const levelSelect = document.getElementById('levelSelect');
const levelEditorDiv = document.getElementById('levelEditor');
const levelEditorBtn = document.getElementById('levelEditorBtn');
const resetBtn = document.getElementById('resetBtn');
const editorCanvas = document.getElementById('editorCanvas');
const editorCtx = editorCanvas.getContext('2d');
const editorTool = document.getElementById('editorTool');
const editorCommit = document.getElementById('editorCommit');
const editorClear = document.getElementById('editorClear');
const editorSave = document.getElementById('editorSave');
const editorCancel = document.getElementById('editorCancel');
const editorCoordDisplay = document.getElementById('editorCoordDisplay');
const dotXInput = document.getElementById('dotXInput');
const dotYInput = document.getElementById('dotYInput');
const addDotBtn = document.getElementById('addDotBtn');
const levelVisibilitySelect = document.getElementById('levelVisibility');
const adminUsernameInput = document.getElementById('adminUsername');
const adminPasswordInput = document.getElementById('adminPassword');
const adminLoginBtn = document.getElementById('adminLoginBtn');
const adminLogoutBtn = document.getElementById('adminLogoutBtn');
const adminLoginForm = document.getElementById('adminLoginForm');
const adminStatusBar = document.getElementById('adminStatusBar');
const adminStatusText = document.getElementById('adminStatusText');
const adminTopStatus = document.getElementById('adminTopStatus');
const editorAccessHint = document.getElementById('editorAccessHint');
const welcomeScreen = document.getElementById('welcomeScreen');
const appShell = document.getElementById('appShell');
const startDeluxeBtn = document.getElementById('startDeluxeBtn');
const startClassicBtn = document.getElementById('startClassicBtn');
const brandLabel = document.querySelector('#menuBar .brand');
const welcomeImageFallback = document.getElementById('welcomeImage');
const backToChooserBtn = document.getElementById('backToChooserBtn');
const p1Label = document.getElementById('p1label');
const p2Label = document.getElementById('p2label');
const classicSetupDiv = document.getElementById('classicSetup');
const classicQuestion = document.getElementById('classicQuestion');
const classicAnswerInput = document.getElementById('classicAnswerInput');
const onlinePanel = document.getElementById('onlinePanel');
const roomCodeInput = document.getElementById('roomCodeInput');
const onlineStatus = document.getElementById('onlineStatus');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const aiCountSelect = document.getElementById('aiCount');
const aiIntelligenceSelect = document.getElementById('aiIntelligence');
const onlineMaxPlayersSelect = document.getElementById('onlineMaxPlayers');
const deathResetAllToggle = document.getElementById('deathResetAllToggle');
const hudScoreboard = document.getElementById('hudScoreboard');
const clearScoresBtn = document.getElementById('clearScoresBtn');
const scoreboardList = document.getElementById('scoreboardList');
const adminCredentialPanel = document.getElementById('adminCredentialPanel');
const newAdminUsernameInput = document.getElementById('newAdminUsername');
const newAdminPasswordInput = document.getElementById('newAdminPassword');
const saveAdminCredentialsBtn = document.getElementById('saveAdminCredentialsBtn');
const adminHackPanel = document.getElementById('adminHackPanel');
const hackGodModeBtn = document.getElementById('hackGodModeBtn');
const hackAddLifeBtn = document.getElementById('hackAddLifeBtn');
const hackAddScoreBtn = document.getElementById('hackAddScoreBtn');
const hackNextLevelBtn = document.getElementById('hackNextLevelBtn');
const inGameHackBar = document.getElementById('inGameHackBar');
const hackGodModeBtnGame = document.getElementById('hackGodModeBtnGame');
const hackAddLifeBtnGame = document.getElementById('hackAddLifeBtnGame');
const hackAddScoreBtnGame = document.getElementById('hackAddScoreBtnGame');
const hackNextLevelBtnGame = document.getElementById('hackNextLevelBtnGame');

// Level storage
let levels = loadLevels();
let isAdminLoggedIn = localStorage.getItem('nibblesAdminSession') === '1';

const DEFAULT_ADMIN_CREDENTIALS = {
    username: 'admin',
    password: 'admin'
};
let adminCredentials = loadAdminCredentials();

let scoreboardEntries = loadScoreboard();

// ===== LEVEL STORAGE & MANAGEMENT =====
function loadLevels() {
    const raw = localStorage.getItem('nibblesLevels');
    if (!raw) {
        return [{
            name: 'Level 1',
            walls: [],
            starts: [],
            visibility: 'public',
            owner: 'system'
        }];
    }
    try {
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr) || arr.length === 0) {
            throw new Error('Invalid level data');
        }
        return arr.map((lv, idx) => normalizeLevel(lv, idx));
    } catch (err) {
        console.warn('Failed to parse levels, using default level.', err);
        return [{
            name: 'Level 1',
            walls: [],
            starts: [],
            visibility: 'public',
            owner: 'system'
        }];
    }
}

function normalizeLevel(levelData, idx) {
    const safeWalls = Array.isArray(levelData?.walls) ? levelData.walls : [];
    const safeStarts = Array.isArray(levelData?.starts) ? levelData.starts : [];
    const safeVisibility = levelData?.visibility === 'admin' ? 'admin' : 'public';
    const safeName = levelData?.name || `Level ${idx + 1}`;
    return {
        name: safeName,
        walls: safeWalls,
        starts: safeStarts,
        visibility: safeVisibility,
        owner: levelData?.owner || 'admin'
    };
}

function saveLevels() {
    localStorage.setItem('nibblesLevels', JSON.stringify(levels));
}

function loadAdminCredentials() {
    const raw = localStorage.getItem('nibblesAdminCredentials');
    if (!raw) return {...DEFAULT_ADMIN_CREDENTIALS};
    try {
        const parsed = JSON.parse(raw);
        const username = String(parsed?.username || '').trim() || DEFAULT_ADMIN_CREDENTIALS.username;
        const password = String(parsed?.password || '');
        return {
            username,
            password: password || DEFAULT_ADMIN_CREDENTIALS.password
        };
    } catch (err) {
        console.warn('Failed to parse admin credentials, using defaults.', err);
        return {...DEFAULT_ADMIN_CREDENTIALS};
    }
}

function saveAdminCredentials(username, password) {
    adminCredentials = {username, password};
    localStorage.setItem('nibblesAdminCredentials', JSON.stringify(adminCredentials));
}

function loadScoreboard() {
    const raw = localStorage.getItem(SCOREBOARD_KEY);
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        console.warn('Failed to parse scoreboard data.', err);
        return [];
    }
}

function saveScoreboard() {
    localStorage.setItem(SCOREBOARD_KEY, JSON.stringify(scoreboardEntries));
}

function renderScoreboard() {
    // Scoreboard UI is optional; never allow it to crash the app.
    if (hudScoreboard) {
        const latest = scoreboardEntries && scoreboardEntries.length ? scoreboardEntries[0] : null;
        hudScoreboard.textContent = latest ? `Last: ${latest.summary}` : '';
    }
    if (!scoreboardList) return;

    scoreboardList.innerHTML = '';
    if (!scoreboardEntries.length) {
        const li = document.createElement('li');
        li.textContent = 'No scores yet.';
        scoreboardList.appendChild(li);
        return;
    }
    scoreboardEntries.forEach((entry) => {
        const li = document.createElement('li');
        li.textContent = `${entry.when} | ${entry.edition}/${entry.mode} | ${entry.summary}`;
        scoreboardList.appendChild(li);
    });
}

function addGameToScoreboard() {
    if (!players.length) return;
    if (isOnlineGuestView) return;
    const ranking = [...players].sort((a, b) => b.score - a.score);
    const summary = ranking.map((p) => `${p.name} ${p.score}`).join(' | ');
    scoreboardEntries.unshift({
        when: new Date().toLocaleString(),
        edition: gameEdition,
        mode: mode === 'double' ? '2p' : (mode === 'single' ? '1p' : mode),
        summary
    });
    if (scoreboardEntries.length > 30) {
        scoreboardEntries.length = 30;
    }
    saveScoreboard();
    renderScoreboard();
}

function getCurrentLevelWalls() {
    return levels[selectedLevelIdx]?.walls || [];
}

function isLevelVisibleToCurrentUser(levelObj) {
    if (!levelObj) return false;
    return levelObj.visibility !== 'admin' || isAdminLoggedIn;
}

function populateLevelSelect() {
    const previousSelection = Number(levelSelect.value);
    levelSelect.innerHTML = '';
    levels.forEach((lv, idx) => {
        if (!isLevelVisibleToCurrentUser(lv)) return;
        const opt = document.createElement('option');
        opt.value = idx;
        const suffix = lv.visibility === 'admin' ? ' (Admin)' : '';
        opt.textContent = `${lv.name || `Level ${idx + 1}`}${suffix}`;
        levelSelect.appendChild(opt);
    });
    if (levelSelect.options.length === 0) {
        // Ensure non-admin users still have at least one playable public level.
        levels.unshift({
            name: 'Level 1',
            walls: [],
            starts: [],
            visibility: 'public',
            owner: 'system'
        });
        saveLevels();
        const fallback = document.createElement('option');
        fallback.value = '0';
        fallback.textContent = 'Level 1';
        levelSelect.appendChild(fallback);
    }
    const hasPreviousVisible = Array.from(levelSelect.options).some(o => Number(o.value) === previousSelection);
    if (hasPreviousVisible) {
        levelSelect.value = String(previousSelection);
    } else {
        levelSelect.selectedIndex = 0;
    }
    selectedLevelIdx = Number(levelSelect.value);
}

// ensure the levels array is long enough to include the given index
function ensureLevelIndex(idx) {
    while (levels.length <= idx) {
        levels.push({
            name: `Level ${levels.length + 1}`,
            walls: [],
            starts: [],
            visibility: 'public',
            owner: 'admin'
        });
    }
}

// ask user for a 1-based level number (1+); returns 0-based index or null if cancelled
function promptForLevelIndex() {
    while (true) {
        const raw = prompt('Enter level number (1+) to save or overwrite:', Math.max(1, selectedLevelIdx + 1));
        if (raw === null) return null;
        const num = parseInt(raw, 10);
        if (!isNaN(num) && num >= 1) {
            return num - 1;
        }
        alert('Please enter a valid integer 1 or greater.');
    }
}

function updateAdminUi() {
    adminUsernameInput.placeholder = `Username (${adminCredentials.username})`;
    adminPasswordInput.placeholder = 'Password';
    if (isAdminLoggedIn) {
        adminLoginForm.style.display = 'none';
        adminStatusBar.style.display = 'flex';
        adminCredentialPanel.style.display = 'block';
        adminStatusText.textContent = `Logged in as ${adminCredentials.username}`;
        adminTopStatus.textContent = 'Admin: On';
        levelEditorBtn.disabled = false;
        levelEditorBtn.style.display = gameEdition === 'classic' ? 'none' : '';
        resetBtn.style.display = gameEdition === 'classic' ? 'none' : '';
        adminHackPanel.style.display = gameEdition === 'classic' ? 'none' : '';
        editorAccessHint.textContent = 'Admin access enabled. You can open the level builder.';
    } else {
        adminLoginForm.style.display = 'flex';
        adminStatusBar.style.display = 'none';
        adminCredentialPanel.style.display = 'none';
        adminTopStatus.textContent = 'Admin: Off';
        levelEditorBtn.disabled = true;
        levelEditorBtn.style.display = 'none';
        resetBtn.style.display = 'none';
        adminHackPanel.style.display = 'none';
        editorAccessHint.textContent = 'Level builder is admin-only. Log in from the top menu bar.';
    }
    populateLevelSelect();
    updateInGameHackUi();
}

function applyEditionUi() {
    const classic = gameEdition === 'classic';
    levelEditorBtn.style.display = classic || !isAdminLoggedIn ? 'none' : '';
    resetBtn.style.display = classic || !isAdminLoggedIn ? 'none' : '';
    adminHackPanel.style.display = classic || !isAdminLoggedIn ? 'none' : '';
    p1Label.style.display = classic ? 'none' : '';
    p2Label.style.display = classic ? 'none' : '';
    aiCountSelect.parentElement.style.display = classic ? 'none' : '';
    editorAccessHint.style.display = classic ? 'none' : '';
    onlinePanel.style.display = classic || modeSelect.value !== 'online' ? 'none' : 'block';
    if (modeSelect.parentElement) {
        modeSelect.parentElement.style.display = classic ? 'none' : '';
    }
    endBtn.style.display = classic ? 'none' : '';
    if (classic) {
        modeSelect.value = classicConfig.players === 2 ? 'double' : 'single';
        modeSelect.dispatchEvent(new Event('change'));
    }
    updateInGameHackUi();
}

const classicQuestions = [
    { key: 'players', prompt: 'Number of players (1 or 2):', validate: (v) => v === '1' || v === '2' },
    { key: 'speed', prompt: 'Speed (1-100):', validate: (v) => {
        const n = parseInt(v, 10);
        return !isNaN(n) && n >= 1 && n <= 100;
    }},
    { key: 'speedUp', prompt: 'Speed up as levels increase? (y/n):', validate: (v) => ['y', 'n'].includes(v.toLowerCase()) },
    { key: 'monochrome', prompt: 'Monochrome or color? (m/c):', validate: (v) => ['m', 'c'].includes(v.toLowerCase()) }
];
let classicQuestionIndex = 0;
let classicTranscript = [];
let currentClassicPrompt = '';

function getClassicPalette() {
    if (classicConfig.monochrome) {
        return {
            bg: '#000000',
            border: '#8c8c8c',
            walls: '#7a7a7a',
            hud: '#d6d6d6',
            numberBg: '#000000',
            numberText: '#ffffff',
            p1: '#f5f5f5',
            p2: '#b3b3b3'
        };
    }
    return {
        bg: '#000000',
        border: '#aaaaaa',
        walls: '#1e6cff',
        hud: '#ffff55',
        numberBg: '#000000',
        numberText: '#00ff00',
        p1: '#00ffff',
        p2: '#ff55ff'
    };
}

function renderClassicTerminal() {
    const lines = [...classicTranscript];
    if (currentClassicPrompt) lines.push(currentClassicPrompt);
    classicQuestion.textContent = lines.join('\n');
    classicQuestion.scrollTop = classicQuestion.scrollHeight;
}

function showClassicQuestion() {
    const q = classicQuestions[classicQuestionIndex];
    currentClassicPrompt = q.prompt;
    renderClassicTerminal();
    classicAnswerInput.value = '';
    classicAnswerInput.focus();
}

function startClassicPromptFlow() {
    classicQuestionIndex = 0;
    classicTranscript = [];
    currentClassicPrompt = '';
    classicSetupDiv.style.display = 'flex';
    showClassicQuestion();
}

function finishClassicSetup() {
    classicSetupDiv.style.display = 'none';
    document.body.classList.toggle('classic-color-edition', !classicConfig.monochrome);
    mode = classicConfig.players === 2 ? 'double' : 'single';
    modeSelect.value = mode;
    modeSelect.dispatchEvent(new Event('change'));
    document.getElementById('speed').value = String(classicConfig.speed);
    speedMultiplier = (101 - classicConfig.speed) / 50;
    selectedLevelIdx = parseInt(levelSelect.value, 10);
    walls = JSON.parse(JSON.stringify(getCurrentLevelWalls()));
    initPlayersLocal('sammy', 'jake');
    level = 1;
    currentNumber = 1;
    numberPos = randomNumberPosition();
    isPaused = false;
    settingsDiv.style.display = 'none';
    canvas.style.display = 'block';
    infoDiv.style.display = 'none';
    classicState = 'waiting_start';
    updateCanvasMetrics();
    updateInfo();
    draw();
    clearInterval(intervalId);
    intervalId = setInterval(update, gameSpeed * speedMultiplier);
}

function handleClassicAnswer() {
    const raw = classicAnswerInput.value.trim();
    const q = classicQuestions[classicQuestionIndex];
    if (!q.validate(raw)) {
        classicTranscript.push(`${currentClassicPrompt} ${raw}`);
        classicTranscript.push('Invalid input. Try again.');
        renderClassicTerminal();
        return;
    }
    classicTranscript.push(`${currentClassicPrompt} ${raw}`);
    if (q.key === 'players') classicConfig.players = parseInt(raw, 10);
    if (q.key === 'speed') classicConfig.speed = parseInt(raw, 10);
    if (q.key === 'speedUp') classicConfig.speedUp = raw.toLowerCase() === 'y';
    if (q.key === 'monochrome') classicConfig.monochrome = raw.toLowerCase() === 'm';

    classicQuestionIndex += 1;
    if (classicQuestionIndex >= classicQuestions.length) {
        finishClassicSetup();
        return;
    }
    showClassicQuestion();
}

function isOnlineModeSelected() {
    return modeSelect.value === 'online';
}

function updateOnlineButtons() {
    const joined = Boolean(onlineSession.roomCode && onlineSession.token);
    createRoomBtn.disabled = joined;
    joinRoomBtn.disabled = joined;
    leaveRoomBtn.disabled = !joined;
    onlineMaxPlayersSelect.disabled = joined;
    deathResetAllToggle.disabled = joined;
}

function setOnlineStatus(message) {
    onlineStatus.textContent = message;
}

function updateInGameHackUi() {
    const visible = isAdminLoggedIn && gameEdition !== 'classic' && canvas.style.display !== 'none';
    inGameHackBar.style.display = visible ? 'inline-flex' : 'none';
}

function stopOnlinePolling() {
    if (onlineStatePollId) {
        clearInterval(onlineStatePollId);
        onlineStatePollId = null;
    }
    if (onlineInputPollId) {
        clearInterval(onlineInputPollId);
        onlineInputPollId = null;
    }
}

async function onlineApi(body, method = 'POST') {
    const options = {
        method,
        headers: {'Content-Type': 'application/json'}
    };
    if (method !== 'GET') {
        options.body = JSON.stringify(body);
    }
    const response = await fetch('/api/multiplayer', options);
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json.ok) {
        throw new Error(json.error || `Network error (${response.status})`);
    }
    return json;
}

function resetOnlineSession(clearUiCode = true) {
    stopOnlinePolling();
    onlineSession.mode = 'none';
    onlineSession.roomCode = '';
    onlineSession.token = '';
    onlineSession.playerId = '';
    onlineSession.playerName = '';
    onlineSession.players = [];
    onlineSession.started = false;
    deathResetsAllPlayers = true;
    deathResetAllToggle.checked = true;
    isOnlineGuestView = false;
    if (clearUiCode) roomCodeInput.value = '';
    updateOnlineButtons();
}

async function refreshOnlineRoomStatus() {
    if (!onlineSession.roomCode || !onlineSession.token) return null;
    try {
        const status = await onlineApi({
            action: 'status',
            roomCode: onlineSession.roomCode,
            token: onlineSession.token
        });
        onlineSession.players = Array.isArray(status.players) ? status.players : [];
        onlineSession.maxPlayers = Number(status.maxPlayers || onlineSession.maxPlayers || 5);
        onlineSession.started = status.started === true;
        deathResetsAllPlayers = status.deathResetsAll !== false;
        deathResetAllToggle.checked = deathResetsAllPlayers;
        return status;
    } catch (err) {
        setOnlineStatus(`Room sync failed: ${err.message}`);
        return null;
    }
}

async function createOnlineRoom() {
    try {
        const playerName = (document.getElementById('p1name').value || 'Host').trim();
        const maxPlayers = Math.max(2, Math.min(5, Number(onlineMaxPlayersSelect.value || 5)));
        const deathResetAll = Boolean(deathResetAllToggle.checked);
        const result = await onlineApi({action: 'create', playerName, maxPlayers, deathResetAll});
        onlineSession.mode = 'host';
        onlineSession.roomCode = result.roomCode;
        onlineSession.token = result.token;
        onlineSession.playerId = result.playerId;
        onlineSession.playerName = playerName;
        onlineSession.players = result.players || [];
        onlineSession.maxPlayers = maxPlayers;
        onlineSession.started = false;
        deathResetsAllPlayers = deathResetAll;
        deathResetAllToggle.checked = deathResetsAllPlayers;
        roomCodeInput.value = result.roomCode;
        updateOnlineButtons();
        setOnlineStatus(`Room ${result.roomCode} created. Share code (${onlineSession.players.length}/${maxPlayers} players).`);
    } catch (err) {
        setOnlineStatus(`Create failed: ${err.message}`);
    }
}

async function joinOnlineRoom() {
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (!roomCode) {
        setOnlineStatus('Enter a room code first.');
        return;
    }
    try {
        const playerName = (document.getElementById('p1name').value || 'Player').trim();
        const result = await onlineApi({action: 'join', roomCode, playerName});
        onlineSession.mode = 'peer';
        onlineSession.roomCode = roomCode;
        onlineSession.token = result.token;
        onlineSession.playerId = result.playerId;
        onlineSession.playerName = playerName;
        onlineSession.players = result.players || [];
        onlineSession.maxPlayers = Number(result.maxPlayers || 5);
        deathResetsAllPlayers = result.deathResetsAll !== false;
        deathResetAllToggle.checked = deathResetsAllPlayers;
        onlineSession.started = result.started === true;
        roomCodeInput.value = roomCode;
        updateOnlineButtons();
        setOnlineStatus(`Joined room ${roomCode}. (${onlineSession.players.length}/${onlineSession.maxPlayers})`);
    } catch (err) {
        setOnlineStatus(`Join failed: ${err.message}`);
    }
}

async function leaveOnlineRoom() {
    if (!onlineSession.roomCode || !onlineSession.token) {
        resetOnlineSession();
        setOnlineStatus('Disconnected from room.');
        return;
    }
    try {
        await onlineApi({
            action: 'leave',
            roomCode: onlineSession.roomCode,
            token: onlineSession.token
        });
    } catch (err) {
        console.warn('Leave room failed:', err);
    }
    resetOnlineSession();
    setOnlineStatus('Disconnected from room.');
}

function convertKeyToDirection(key, controls) {
    if (key === controls.left) return {dx: -grid, dy: 0};
    if (key === controls.right) return {dx: grid, dy: 0};
    if (key === controls.up) return {dx: 0, dy: -grid};
    if (key === controls.down) return {dx: 0, dy: grid};
    return null;
}

async function sendOnlinePeerInput(direction) {
    if (onlineSession.mode !== 'peer' || !onlineSession.token) return;
    try {
        await onlineApi({
            action: 'input',
            roomCode: onlineSession.roomCode,
            token: onlineSession.token,
            direction
        });
    } catch (err) {
        setOnlineStatus(`Input sync failed: ${err.message}`);
    }
}

function buildOnlineSnapshot() {
    return {
        level,
        currentNumber,
        numberPos,
        walls,
        players,
        gameEdition,
        selectedLevelIdx,
        mode,
        deathResetsAllPlayers
    };
}

function applyOnlineSnapshot(snapshot) {
    if (!snapshot) return;
    setArenaForMode('online');
    level = snapshot.level;
    currentNumber = snapshot.currentNumber;
    numberPos = snapshot.numberPos;
    walls = snapshot.walls || [];
    players = snapshot.players || [];
    mode = snapshot.mode || 'online';
    deathResetsAllPlayers = snapshot.deathResetsAllPlayers !== false;
    draw();
}

async function pushOnlineState(force = false) {
    if (onlineSession.mode !== 'host' || !onlineSession.token) return;
    const now = Date.now();
    if (!force && now - lastOnlinePushAt < ONLINE_PUSH_INTERVAL_MS) return;
    lastOnlinePushAt = now;
    try {
        await onlineApi({
            action: 'state',
            roomCode: onlineSession.roomCode,
            token: onlineSession.token,
            started: true,
            state: buildOnlineSnapshot()
        });
    } catch (err) {
        setOnlineStatus(`State sync failed: ${err.message}`);
    }
}

async function hostConsumeGuestInputs() {
    if (onlineSession.mode !== 'host' || !onlineSession.token) return;
    try {
        const result = await onlineApi({
            action: 'consumeInputs',
            roomCode: onlineSession.roomCode,
            token: onlineSession.token
        });
        const inputsByPlayer = result.inputsByPlayer || {};
        players.forEach((player) => {
            if (!player.remoteId || player.remoteId === onlineSession.playerId || player.isAi) return;
            const arr = Array.isArray(inputsByPlayer[player.remoteId]) ? inputsByPlayer[player.remoteId] : [];
            if (!arr.length) return;
            const latest = arr[arr.length - 1];
            const nextDx = Number(latest.dx);
            const nextDy = Number(latest.dy);
            if (
                Number.isFinite(nextDx) &&
                Number.isFinite(nextDy) &&
                !(nextDx === -player.dx && nextDy === -player.dy)
            ) {
                const queue = player.directionQueue || (player.directionQueue = []);
                const last = queue.length ? queue[queue.length - 1] : {dx: player.dx, dy: player.dy};
                if (!(last.dx === nextDx && last.dy === nextDy)) {
                    queue.push({dx: nextDx, dy: nextDy});
                    if (queue.length > MAX_DIRECTION_QUEUE) {
                        queue.splice(0, queue.length - MAX_DIRECTION_QUEUE);
                    }
                }
            }
        });
    } catch (err) {
        setOnlineStatus(`Player input polling failed: ${err.message}`);
    }
}

function startHostInputPolling() {
    if (onlineInputPollId) clearInterval(onlineInputPollId);
    onlineInputPollId = setInterval(() => {
        hostConsumeGuestInputs();
    }, ONLINE_INPUT_POLL_INTERVAL_MS);
}

function startGuestStatePolling() {
    if (onlineStatePollId) clearInterval(onlineStatePollId);
    onlineStatePollId = setInterval(async () => {
        if (!onlineSession.roomCode || !onlineSession.token) return;
        try {
            const q = new URLSearchParams({
                action: 'fetch',
                roomCode: onlineSession.roomCode,
                token: onlineSession.token
            });
            const response = await fetch(`/api/multiplayer?${q.toString()}`);
            const result = await response.json().catch(() => ({}));
            if (!response.ok || !result.ok) {
                throw new Error(result.error || `Fetch failed (${response.status})`);
            }
            onlineSession.started = result.started === true;
            onlineSession.players = result.players || onlineSession.players;
            onlineSession.maxPlayers = Number(result.maxPlayers || onlineSession.maxPlayers || 5);
            deathResetsAllPlayers = result.deathResetsAll !== false;
            deathResetAllToggle.checked = deathResetsAllPlayers;
            if (!onlineSession.started) {
                setOnlineStatus(`Room ${onlineSession.roomCode} connected. Waiting for host to start.`);
                return;
            }
            if (result.state) {
                if (canvas.style.display === 'none') {
                    settingsDiv.style.display = 'none';
                    canvas.style.display = 'block';
                    infoDiv.style.display = 'none';
                    setArenaForMode('online');
                    updateCanvasMetrics();
                }
                isOnlineGuestView = true;
                setOnlineStatus(`Room ${onlineSession.roomCode} live.`);
                applyOnlineSnapshot(result.state);
            }
        } catch (err) {
            setOnlineStatus(`State polling failed: ${err.message}`);
        }
    }, ONLINE_POLL_INTERVAL_MS);
}

function returnToChooser() {
    clearInterval(intervalId);
    stopOnlinePolling();
    isPaused = false;
    updatePauseButtonLabel();
    classicState = 'idle';
    gameEdition = 'deluxe';
    setArenaForMode('single');
    document.body.classList.remove('classic-edition');
    document.body.classList.remove('classic-color-edition');
    if (onlineSession.mode !== 'none') {
        leaveOnlineRoom();
    } else {
        resetOnlineSession();
    }
    if (brandLabel) brandLabel.textContent = 'Nibbles Deluxe';
    settingsDiv.style.display = 'block';
    levelEditorDiv.style.display = 'none';
    classicSetupDiv.style.display = 'none';
    canvas.style.display = 'none';
    infoDiv.style.display = 'none';
    updateInGameHackUi();
    appShell.style.display = 'none';
    welcomeScreen.style.display = 'flex';
}

function attemptAdminLogin() {
    const username = adminUsernameInput.value.trim().toLowerCase();
    const password = adminPasswordInput.value;
    if (username === adminCredentials.username.toLowerCase() && password === adminCredentials.password) {
        isAdminLoggedIn = true;
        localStorage.setItem('nibblesAdminSession', '1');
        adminPasswordInput.value = '';
        updateAdminUi();
        applyEditionUi();
        return;
    }
    alert('Invalid admin username or password.');
}

function saveAdminCredentialsFromUi() {
    if (!isAdminLoggedIn) {
        alert('Log in as admin first.');
        return;
    }
    const username = newAdminUsernameInput.value.trim();
    const password = newAdminPasswordInput.value;
    if (!username || !password) {
        alert('Enter both username and password.');
        return;
    }
    saveAdminCredentials(username, password);
    adminUsernameInput.placeholder = `Username (${username})`;
    adminPasswordInput.placeholder = 'Password';
    newAdminPasswordInput.value = '';
    updateAdminUi();
    alert('Admin credentials updated.');
}

// ask for a player's start position/direction
function promptForStartInfo(playerNum) {
    // start positions are chosen on the game grid (columns x rows)
    while (true) {
        const colRaw = prompt(`Player ${playerNum} start column (1-${columns}):`, '1');
        if (colRaw === null) return null;
        const rowRaw = prompt(`Player ${playerNum} start row (1-${rows}):`, '1');
        if (rowRaw === null) return null;
        const dirRaw = prompt(`Player ${playerNum} start direction (up/down/left/right):`, playerNum === 1 ? 'right' : 'left');
        if (dirRaw === null) return null;
        const col = parseInt(colRaw, 10);
        const row = parseInt(rowRaw, 10);
        const dir = dirRaw.toLowerCase();
        if (
            !isNaN(col) && col >= 1 && col <= columns &&
            !isNaN(row) && row >= 1 && row <= rows &&
            ['up', 'down', 'left', 'right'].includes(dir)
        ) {
            const x = (col - 1) * grid;
            const y = (row - 1) * grid;
            let dx = 0, dy = 0;
            if (dir === 'up') dy = -grid;
            else if (dir === 'down') dy = grid;
            else if (dir === 'left') dx = -grid;
            else if (dir === 'right') dx = grid;
            return {x, y, dx, dy};
        }
        alert('Invalid coordinates or direction, please try again.');
    }
}

// warn if the given start position is within 10 grid steps of any wall in its
// movement direction.
function warnIfNearWall(start) {
    if (!start) return;
    for (let i = 1; i <= 10; i++) {
        // each step is one grid unit in the direction
        const checkX = start.x + start.dx * i;
        const checkY = start.y + start.dy * i;
        if (editorWalls.find(w => w.x === checkX && w.y === checkY)) {
            alert('Warning: a player start is within 10 dots of a wall in the chosen direction!');
            break;
        }
    }
}

function getDefaultSpawn(idx) {
    const edgePadding = 3;
    const perimeter = [
        {x: edgePadding, y: edgePadding, dx: grid, dy: 0},
        {x: columns - edgePadding, y: rows - edgePadding, dx: -grid, dy: 0},
        {x: edgePadding, y: rows - edgePadding, dx: grid, dy: 0},
        {x: columns - edgePadding, y: edgePadding, dx: -grid, dy: 0},
        {x: Math.floor(columns / 2), y: edgePadding, dx: 0, dy: grid},
        {x: Math.floor(columns / 2), y: rows - edgePadding, dx: 0, dy: -grid},
        {x: edgePadding, y: Math.floor(rows / 2), dx: grid, dy: 0},
        {x: columns - edgePadding, y: Math.floor(rows / 2), dx: -grid, dy: 0}
    ];
    const base = perimeter[idx % perimeter.length];
    return {
        x: base.x * grid,
        y: base.y * grid,
        dx: base.dx,
        dy: base.dy
    };
}

function makePlayer(name, idx, startInfo, opts = {}) {
    // allow specifying a custom start (x,y,dx,dy) from level data
    const start = startInfo || {};
    const fallback = getDefaultSpawn(idx);
    const defaultX = fallback.x;
    const defaultY = fallback.y;
    const defaultDx = fallback.dx;
    const defaultDy = fallback.dy;
    // Start with 3 segments so the snake is visible
    const body = [{x: start.x ?? defaultX, y: start.y ?? defaultY}];
    for (let i = 1; i < 3; i++) {
        body.push({x: (start.x ?? defaultX) - i * (start.dx ?? defaultDx), y: (start.y ?? defaultY) - i * (start.dy ?? defaultDy)});
    }
    return {
        name,
        color: gameEdition === 'classic'
            ? (idx === 0 ? getClassicPalette().p1 : getClassicPalette().p2)
            : (idx === 0 ? '#ff0' : '#faa'),
        body: body,
        dx: start.dx ?? defaultDx,
        dy: start.dy ?? defaultDy,
        directionQueue: [],
        lives: 5,
        score: 0,
        remoteId: opts.remoteId || '',
        isAi: Boolean(opts.isAi),
        targetLength: 3, // desired body length in segments (start visible)
        // player one uses the arrows, player two uses WASD
        controls: idx === 0
            ? {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}
            : {up: 'w', down: 's', left: 'a', right: 'd'}
    };
}

function initPlayersLocal(p1name, p2name) {
    // if level has explicit start info use it, otherwise fallback
    const starts = levels[selectedLevelIdx]?.starts || [];
    players = [makePlayer(p1name, 0, starts[0])];
    if (mode === 'double') {
        players.push(makePlayer(p2name, 1, starts[1]));
    }
    const requestedAi = Math.max(0, Math.min(4, Number(aiCountSelect.value || 0)));
    const remaining = Math.max(0, 5 - players.length);
    const aiToAdd = Math.min(requestedAi, remaining);
    for (let i = 0; i < aiToAdd; i++) {
        players.push(makePlayer(`BOT-${i + 1}`, players.length, null, {isAi: true}));
    }
}

function initPlayersOnlineFromRoom() {
    const roomPlayers = Array.isArray(onlineSession.players) ? onlineSession.players : [];
    players = roomPlayers.map((rp, idx) => makePlayer(
        rp.name || `P${idx + 1}`,
        idx,
        null,
        {remoteId: rp.id, isAi: false}
    ));
    aiCount = Math.max(0, Math.min(4, Number(aiCountSelect.value || 0)));
    const remaining = Math.max(0, 5 - players.length);
    const aiToAdd = Math.min(aiCount, remaining);
    for (let i = 0; i < aiToAdd; i++) {
        players.push(makePlayer(`BOT-${i + 1}`, players.length, null, {isAi: true}));
    }
}

function randomNumberPosition() {
    let position;
    let attempts = 0;
    while (attempts < 100) {
        position = {
            x: Math.floor(Math.random() * columns) * grid,
            // keep one cell below available because the number tile is 2 cells tall
            y: Math.floor(Math.random() * Math.max(1, rows - 1)) * grid
        };
        let bad = false;
        // check collision with snakes
        players.forEach(p => {
            p.body.forEach(seg => {
                if (
                    (seg.x === position.x && seg.y === position.y) ||
                    (seg.x === position.x && seg.y === position.y + grid)
                ) {
                    bad = true;
                }
            });
        });
        // check collision with walls
        walls.forEach(wall => {
            if (
                (wall.x === position.x && wall.y === position.y) ||
                (wall.x === position.x && wall.y === position.y + grid)
            ) {
                bad = true;
            }
        });
        if (!bad) return position;
        attempts++;
    }
    return {x: grid * 10, y: grid * 10}; // fallback
}

function cellBlocked(x, y, sourcePlayer = null) {
    const maxX = columns * grid;
    const maxY = rows * grid;
    if (x < 0 || x >= maxX || y < 0 || y >= maxY) return true;
    if (walls.some((w) => w.x === x && w.y === y)) return true;
    for (const player of players) {
        if (player === sourcePlayer && player.body.length > 0) {
            for (let i = 0; i < player.body.length - 1; i++) {
                const seg = player.body[i];
                if (seg.x === x && seg.y === y) return true;
            }
            continue;
        }
        for (const seg of player.body) {
            if (seg.x === x && seg.y === y) return true;
        }
    }
    return false;
}

function queueDirection(player, dx, dy) {
    const queue = player.directionQueue || (player.directionQueue = []);
    const base = queue.length ? queue[queue.length - 1] : {dx: player.dx, dy: player.dy};
    if (dx === -base.dx && dy === -base.dy) return;
    if (dx === base.dx && dy === base.dy) return;
    queue.push({dx, dy});
    if (queue.length > MAX_DIRECTION_QUEUE) {
        queue.splice(0, queue.length - MAX_DIRECTION_QUEUE);
    }
}

function chooseAiDirection(player) {
    if (!player || !player.isAi || player.lives <= 0 || !player.body.length) return;
    const head = player.body[0];
    const options = [
        {dx: grid, dy: 0},
        {dx: -grid, dy: 0},
        {dx: 0, dy: grid},
        {dx: 0, dy: -grid}
    ];
    options.sort((a, b) => {
        const ax = head.x + a.dx;
        const ay = head.y + a.dy;
        const bx = head.x + b.dx;
        const by = head.y + b.dy;
        const ad = Math.abs(ax - numberPos.x) + Math.abs(ay - numberPos.y);
        const bd = Math.abs(bx - numberPos.x) + Math.abs(by - numberPos.y);
        return ad - bd;
    });
    for (const option of options) {
        if (option.dx === -player.dx && option.dy === -player.dy) continue;
        const nx = head.x + option.dx;
        const ny = head.y + option.dy;
        if (!cellBlocked(nx, ny, player)) {
            queueDirection(player, option.dx, option.dy);
            return;
        }
    }
}

function draw() {
    const isClassic = gameEdition === 'classic';
    const classicPalette = getClassicPalette();
    const topOffset = isClassic ? actualGrid : 0;
    const arenaHeight = isClassic ? Math.max(1, canvas.height - topOffset) : canvas.height;

    ctx.fillStyle = isClassic ? classicPalette.bg : '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = isClassic ? classicPalette.border : '#f00';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, topOffset, canvas.width, arenaHeight);

    if (isClassic) {
        const p1 = players[0];
        const p2 = players[1];
        ctx.fillStyle = classicPalette.hud;
        ctx.font = `${Math.max(10, Math.floor(actualGrid * 0.8))}px "Courier New", monospace`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillText(`PTS ${p1 ? p1.score : 0}`, 6, topOffset / 2);
        if (p2) {
            const rightText = `PTS ${p2.score}`;
            const tw = ctx.measureText(rightText).width;
            ctx.fillText(rightText, canvas.width - tw - 6, topOffset / 2);
        }
        ctx.textAlign = 'center';
        ctx.fillText(`LEVEL ${level}`, canvas.width / 2, topOffset / 2);
        ctx.textAlign = 'left';
        ctx.fillStyle = classicPalette.hud;
        if (p1) ctx.fillText(p1.name, 8, topOffset + Math.max(8, actualGrid / 2));
        if (p2) {
            const nW = ctx.measureText(p2.name).width;
            ctx.fillText(p2.name, canvas.width - nW - 8, topOffset + Math.max(8, actualGrid / 2));
        }
    }

    // draw walls
    ctx.fillStyle = isClassic ? classicPalette.walls : '#000';
    walls.forEach(wall => {
        const wx = wall.x / grid * actualGrid;
        const wy = wall.y / grid * actualGrid + topOffset;
        ctx.fillRect(wx, wy, actualGrid, actualGrid);
    });

    // number tile (2 cells tall)
    const nx = (numberPos.x / grid) * actualGrid;
    const ny = (numberPos.y / grid) * actualGrid + topOffset;
    ctx.fillStyle = isClassic ? classicPalette.numberBg : '#fff';
    ctx.fillRect(nx, ny, actualGrid, actualGrid * 2);
    ctx.fillStyle = isClassic ? classicPalette.numberText : '#000';
    ctx.font = Math.floor(actualGrid * 1.5) + (isClassic ? 'px "Courier New", monospace' : 'px sans-serif');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentNumber, nx + actualGrid / 2, ny + actualGrid);

    players.forEach(p => {
        if (isClassic) {
            p.body.forEach(seg => {
                const sx = seg.x / grid * actualGrid;
                const sy = seg.y / grid * actualGrid + topOffset;
                ctx.fillStyle = p.color;
                ctx.fillRect(sx, sy, actualGrid, actualGrid);
            });
            return;
        }

        // Deluxe: rounded snakes
        ctx.strokeStyle = p.color;
        ctx.lineWidth = actualGrid;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        p.body.forEach((seg, i) => {
            const cx = seg.x / grid * actualGrid + actualGrid / 2;
            const cy = seg.y / grid * actualGrid + actualGrid / 2 + topOffset;
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
    });

    if (isClassic && classicState !== 'running') {
        ctx.fillStyle = classicPalette.hud;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `${Math.max(12, Math.floor(actualGrid * 1.2))}px "Courier New", monospace`;
        let msg = 'PRESS SPACE TO START';
        if (classicState === 'waiting_respawn') msg = 'PRESS SPACE TO CONTINUE';
        if (classicState === 'game_over_prompt') msg = 'GAME OVER - START OVER OR QUIT? (Y/N)';
        ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
    }
}

function update() {
    if (isOnlineGuestView && onlineSession.mode === 'peer') {
        draw();
        return;
    }
    if (gameEdition === 'classic' && classicState !== 'running') {
        draw();
        updateInfo();
        return;
    }

    let collisionOccurred = false;
    players.forEach(p => {
        if (collisionOccurred) return;
        if (p.lives <= 0 || !p.body.length) return;
        if (p.isAi) {
            chooseAiDirection(p);
        }

        // Apply one buffered direction per tick so fast inputs are not dropped.
        if (Array.isArray(p.directionQueue) && p.directionQueue.length > 0) {
            while (p.directionQueue.length > 0) {
                const next = p.directionQueue.shift();
                const nextDx = next.dx;
                const nextDy = next.dy;
                if (nextDx === -p.dx && nextDy === -p.dy) {
                    continue;
                }
                p.dx = nextDx;
                p.dy = nextDy;
                break;
            }
        }

        const head = {x: p.body[0].x + p.dx, y: p.body[0].y + p.dy};

    // wall collision
    const maxX = columns * grid;
    const maxY = rows * grid;

    if (head.x < 0 || head.x >= maxX || head.y < 0 || head.y >= maxY) {
        die(p);
        collisionOccurred = true;
        return;
    }

        // wall obstacle collision
        walls.forEach(wall => {
            if (wall.x === head.x && wall.y === head.y) {
                die(p);
                collisionOccurred = true;
            }
        });
        if (collisionOccurred) return;

        // self collision
        for (let i = 0; i < p.body.length; i++) {
            if (p.body[i].x === head.x && p.body[i].y === head.y) {
                die(p);
                collisionOccurred = true;
                return;
            }
        }

        // other player collision
        players.forEach(other => {
            if (other !== p) {
                other.body.forEach(seg => {
                    if (seg.x === head.x && seg.y === head.y) {
                        die(p);
                        collisionOccurred = true;
                    }
                });
            }
        });
        if (collisionOccurred) return;

        // eat number (number tile is 2 cells tall)
        if ((head.x === numberPos.x && head.y === numberPos.y) || 
            (head.x === numberPos.x && head.y === numberPos.y + grid)) {
            p.score += currentNumber * 100;
            const growthAmount = currentNumber * 2;
            p.targetLength += growthAmount;
            currentNumber++;
            if (currentNumber > 9) {
                if (manualLevelsOnly) {
                    currentNumber = 1;
                    numberPos = randomNumberPosition();
                } else {
                    nextLevel();
                }
            } else {
                numberPos = randomNumberPosition();
            }
        }

        p.body.unshift(head);
        // trim tail to maintain target length
        while (p.body.length > p.targetLength) {
            p.body.pop();
        }
    });
    draw();
    updateInfo();
    if (isOnlineModeSelected() && onlineSession.mode === 'host') {
        pushOnlineState();
    }
    checkGameOver();
}

function respawnPlayer(player, idx) {
    const starts = levels[selectedLevelIdx]?.starts || [];
    const fallback = getDefaultSpawn(idx);
    const startX = starts[idx]?.x ?? fallback.x;
    const startY = starts[idx]?.y ?? fallback.y;
    const startDx = starts[idx]?.dx ?? fallback.dx;
    const startDy = starts[idx]?.dy ?? fallback.dy;
    const body = [{x: startX, y: startY}];
    for (let i = 1; i < 3; i++) {
        body.push({x: startX - i * startDx, y: startY - i * startDy});
    }
    player.body = body;
    player.dx = startDx;
    player.dy = startDy;
    player.directionQueue = [];
    player.targetLength = 3;
}

function die(player) {
    if (godModeEnabled && isAdminLoggedIn && !player.isAi) {
        return;
    }
    player.lives -= 1;
    player.score = Math.max(0, player.score - 1000);
    player.lives = Math.max(0, player.lives);

    const multiplayerMatch = players.length > 1;
    if (multiplayerMatch && deathResetsAllPlayers) {
        players.forEach((p, idx) => {
            if (p.lives > 0) respawnPlayer(p, idx);
            else p.body = [];
        });
        numberPos = randomNumberPosition();
    } else {
        const idx = players.indexOf(player);
        if (player.lives > 0) {
            respawnPlayer(player, idx);
        } else {
            player.body = [];
            player.directionQueue = [];
        }
    }

    if (gameEdition === 'classic') {
        classicState = 'waiting_respawn';
        classicNeedsRespawn = true;
    }
}

function nextLevel() {
    if (manualLevelsOnly) {
        currentNumber = 1;
        numberPos = randomNumberPosition();
        return;
    }
    level++;
    currentNumber = 1;
    // speedMultiplier increases with level unless classic speed-up is disabled.
    if (gameEdition === 'classic') {
        if (classicConfig.speedUp) {
            speedMultiplier = Math.max(0.2, 1 - (level - 1) * 0.1);
        }
    } else {
        speedMultiplier = Math.max(0.2, 1 - (level - 1) * 0.1);
    }
    clearInterval(intervalId);
    intervalId = setInterval(update, gameSpeed * speedMultiplier);
    numberPos = randomNumberPosition();
}

function updateInfo() {
    if (gameEdition === 'classic') {
        levelDisplay.textContent = '';
        scoreDisplay.textContent = '';
        livesDisplay.textContent = '';
        pauseDisplay.style.display = 'none';
        return;
    }
    levelDisplay.textContent = `Level: ${level}`;
    let scoreText = players.map(p => `${p.name}: ${p.score}`).join(' | ');
    let livesText = players.map(p => `${p.name} lives: ${p.lives}`).join(' | ');
    scoreDisplay.textContent = scoreText;
    livesDisplay.textContent = livesText;
    pauseDisplay.style.display = isPaused ? 'inline' : 'none';
}

function updatePauseButtonLabel() {
    pauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
}

function togglePause() {
    if (gameEdition === 'classic') return;
    if (canvas.style.display === 'none') return;
    if (levelEditorDiv.style.display !== 'none') return;
    if (isOnlineGuestView) return;

    isPaused = !isPaused;
    if (isPaused) {
        clearInterval(intervalId);
    } else {
        clearInterval(intervalId);
        intervalId = setInterval(update, gameSpeed * speedMultiplier);
    }
    updatePauseButtonLabel();
    updateInfo();
}

function changeDirection(event) {
    if (gameEdition === 'classic' && classicState !== 'running') return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (isOnlineGuestView && onlineSession.mode === 'peer') {
        const controls = {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'};
        const fallbackControls = {up: 'w', down: 's', left: 'a', right: 'd'};
        const direction = convertKeyToDirection(key, controls) || convertKeyToDirection(key, fallbackControls);
        if (direction) {
            event.preventDefault();
            sendOnlinePeerInput(direction);
        }
        return;
    }

    const controllingPlayers = (isOnlineModeSelected() && onlineSession.mode === 'host')
        ? players.filter((p) => p.remoteId === onlineSession.playerId)
        : players.filter((p) => !p.isAi);
    controllingPlayers.forEach(p => {
        let nextDx = null;
        let nextDy = null;
        if (key === p.controls.left) {
            nextDx = -grid; nextDy = 0;
        } else if (key === p.controls.right) {
            nextDx = grid; nextDy = 0;
        } else if (key === p.controls.up) {
            nextDx = 0; nextDy = -grid;
        } else if (key === p.controls.down) {
            nextDx = 0; nextDy = grid;
        }

        if (nextDx === null) return;
        queueDirection(p, nextDx, nextDy);
    });
}

document.addEventListener('keydown', changeDirection);
document.getElementById('endBtn').addEventListener('click', gameOver);

const modeSelect = document.getElementById('mode');
modeSelect.addEventListener('change', () => {
    const p2field = document.getElementById('p2label');
    const modeValue = modeSelect.value;
    if (modeValue === 'double') {
        p2field.style.display = '';
    } else {
        p2field.style.display = 'none';
    }
    onlinePanel.style.display = modeValue === 'online' && gameEdition !== 'classic' ? 'block' : 'none';
    aiCountSelect.parentElement.style.display = gameEdition === 'classic' ? 'none' : '';
    if (modeValue !== 'online' && onlineSession.mode !== 'none') {
        leaveOnlineRoom();
        setOnlineStatus('Online room closed. Local mode selected.');
    }
});
modeSelect.dispatchEvent(new Event('change'));

async function start() {
    if (gameEdition === 'classic') return;
    classicState = 'idle';
    mode = document.getElementById('mode').value;
    deathResetsAllPlayers = Boolean(deathResetAllToggle.checked);
    aiCount = Math.max(0, Math.min(4, Number(aiCountSelect.value || 0)));

    if (mode === 'online') {
        if (onlineSession.mode === 'none' || !onlineSession.roomCode || !onlineSession.token) {
            setOnlineStatus('Create or join a room first.');
            return;
        }

        setArenaForMode('online');
        walls = []; // Slither-like: open arena
        const speedInput = parseInt(document.getElementById('speed').value, 10);
        speedMultiplier = (101 - speedInput) / 50;
        level = 1;
        currentNumber = 1;
        manualLevelsOnly = true;
        isPaused = false;
        updatePauseButtonLabel();
        settingsDiv.style.display = 'none';
        canvas.style.display = 'block';
        infoDiv.style.display = 'none';
        updateInGameHackUi();
        updateCanvasMetrics();

        if (onlineSession.mode === 'host') {
            const status = await refreshOnlineRoomStatus();
            if (!status) return;
            mode = 'online';
            initPlayersOnlineFromRoom();
            numberPos = randomNumberPosition();
            isOnlineGuestView = false;
            clearInterval(intervalId);
            intervalId = setInterval(update, gameSpeed * speedMultiplier);
            startHostInputPolling();
            pushOnlineState(true);
            setOnlineStatus(`Hosting room ${onlineSession.roomCode}.`);
            return;
        }

        // Guest mode: render host snapshots only.
        players = [];
        isOnlineGuestView = true;
        clearInterval(intervalId);
        startGuestStatePolling();
        setOnlineStatus(`Connected to ${onlineSession.roomCode}. Waiting for host state...`);
        return;
    }

    resetOnlineSession();
    manualLevelsOnly = false;
    setArenaForMode(mode);
    deathResetsAllPlayers = mode === 'double';
    selectedLevelIdx = parseInt(levelSelect.value, 10);
    if (!isLevelVisibleToCurrentUser(levels[selectedLevelIdx])) {
        alert('You do not have access to this level.');
        populateLevelSelect();
        return;
    }
    walls = JSON.parse(JSON.stringify(getCurrentLevelWalls())); // deep copy
    const p1 = document.getElementById('p1name').value || 'Player1';
    const p2 = document.getElementById('p2name').value || 'Player2';
    const speedInput = parseInt(document.getElementById('speed').value, 10);
    // map 1-100 to speedMultiplier (1=fast, 100=slow)
    speedMultiplier = (101 - speedInput) / 50;
    initPlayersLocal(p1, p2);
    level = 1;
    currentNumber = 1;
    numberPos = randomNumberPosition();
    isPaused = false;
    updatePauseButtonLabel();
    settingsDiv.style.display = 'none';
    canvas.style.display = 'block';
    infoDiv.style.display = 'block';
    updateInGameHackUi();
    updateCanvasMetrics();
    updateInfo();
    draw();
    clearInterval(intervalId);
    intervalId = setInterval(update, gameSpeed * speedMultiplier);
}

document.getElementById('startBtn').addEventListener('click', start);
createRoomBtn.addEventListener('click', createOnlineRoom);
joinRoomBtn.addEventListener('click', joinOnlineRoom);
leaveRoomBtn.addEventListener('click', leaveOnlineRoom);
pauseBtn.addEventListener('click', togglePause);

function resetLevels() {
    if (confirm('Reset all levels to default? This cannot be undone.')) {
        levels = [{
            name: 'Level 1',
            walls: [],
            starts: [],
            visibility: 'public',
            owner: 'system'
        }];
        saveLevels();
        populateLevelSelect();
        levelSelect.value = 0;
        selectedLevelIdx = 0;
    }
}

document.getElementById('resetBtn').addEventListener('click', resetLevels);

function checkGameOver() {
    if (!players.length) return;
    if (players.length === 1) {
        if (players[0].lives <= 0) gameOver();
        return;
    }
    const alive = players.filter((p) => p.lives > 0);
    if (alive.length <= 1) {
        gameOver();
    }
}

function gameOver() {
    clearInterval(intervalId);
    stopOnlinePolling();
    isPaused = false;
    updatePauseButtonLabel();
    addGameToScoreboard();
    if (gameEdition === 'classic') {
        classicState = 'game_over_prompt';
        draw();
        return;
    }
    if (isOnlineModeSelected() && onlineSession.mode === 'host') {
        pushOnlineState(true);
    }
    settingsDiv.style.display='block';
    canvas.style.display='none';
    infoDiv.style.display='none';
    updateInGameHackUi();
    isOnlineGuestView = false;
    updateCanvasMetrics();
}

adminLoginBtn.addEventListener('click', attemptAdminLogin);

adminLogoutBtn.addEventListener('click', () => {
    isAdminLoggedIn = false;
    localStorage.removeItem('nibblesAdminSession');
    updateAdminUi();
    applyEditionUi();
});

adminPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        attemptAdminLogin();
    }
});

adminUsernameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        attemptAdminLogin();
    }
});

saveAdminCredentialsBtn.addEventListener('click', saveAdminCredentialsFromUi);

function runHackToggleGodMode() {
    if (!isAdminLoggedIn) return;
    godModeEnabled = !godModeEnabled;
    setOnlineStatus(`God mode: ${godModeEnabled ? 'ON' : 'OFF'}`);
}

function runHackAddLife() {
    if (!isAdminLoggedIn) return;
    players.forEach((p) => {
        p.lives += 1;
    });
    updateInfo();
}

function runHackAddScore() {
    if (!isAdminLoggedIn || !players[0]) return;
    players[0].score += 1000;
    updateInfo();
}

function runHackNextLevel() {
    if (!isAdminLoggedIn) return;
    const prevManual = manualLevelsOnly;
    manualLevelsOnly = false;
    nextLevel();
    manualLevelsOnly = prevManual;
}

hackGodModeBtn.addEventListener('click', runHackToggleGodMode);
hackAddLifeBtn.addEventListener('click', runHackAddLife);
hackAddScoreBtn.addEventListener('click', runHackAddScore);
hackNextLevelBtn.addEventListener('click', runHackNextLevel);
hackGodModeBtnGame.addEventListener('click', runHackToggleGodMode);
hackAddLifeBtnGame.addEventListener('click', runHackAddLife);
hackAddScoreBtnGame.addEventListener('click', runHackAddScore);
hackNextLevelBtnGame.addEventListener('click', runHackNextLevel);

// ===== LEVEL EDITOR =====
let editorWalls = [];
let editorTool_currentTool = 'dot';
let editorTool_points = [];
let editorStarts = [null, null];
let settingStart = null; // used when user is interactively placing a start

function initEditor() {
    if (!isAdminLoggedIn) {
        alert('Only admin can access the level builder.');
        levelEditorDiv.style.display = 'none';
        settingsDiv.style.display = 'block';
        return;
    }
    // set editor canvas to match actual game field dimensions
    editorCanvas.width = columns * grid;
    editorCanvas.height = rows * grid;
    // load the selected level's walls and starts
    editorWalls = JSON.parse(JSON.stringify(getCurrentLevelWalls()));
    editorStarts = JSON.parse(JSON.stringify(levels[selectedLevelIdx]?.starts || [null, null]));
    // enable all editing controls
    editorTool.disabled = false;
    editorCommit.disabled = false;
    editorClear.disabled = false;
    document.getElementById('setStart1').disabled = false;
    document.getElementById('setStart2').disabled = false;
    // update hint
    const hint = document.getElementById('editorHint');
    hint.textContent = 'Select a tool or start button, then click on the grid to place walls or starting positions. Right-click or press ESC to cancel current action.';
    editorTool_points = [];
    editorCoordDisplay.textContent = 'X: -, Y: -';
    dotXInput.value = '';
    dotYInput.value = '';
    dotXInput.min = 1;
    dotXInput.max = columns;
    dotYInput.min = 1;
    dotYInput.max = rows;
    levelVisibilitySelect.value = levels[selectedLevelIdx]?.visibility === 'admin' ? 'admin' : 'public';
    updateEditorCommitState();
    drawEditor();
}

function drawEditor() {
    const w = editorCanvas.width;
    const h = editorCanvas.height;
    const editorGrid = w / columns;  // exact logical grid
    
    editorCtx.fillStyle = '#fff';
    editorCtx.fillRect(0, 0, w, h);
    
    // draw grid
    editorCtx.strokeStyle = '#ddd';
    editorCtx.lineWidth = 1;
    for (let i = 0; i <= columns; i++) {
        const x = i * editorGrid;
        if (x <= w) {
            editorCtx.beginPath();
            editorCtx.moveTo(x, 0);
            editorCtx.lineTo(x, h);
            editorCtx.stroke();
        }
    }
    for (let i = 0; i <= rows; i++) {
        const y = i * editorGrid;
        if (y <= h) {
            editorCtx.beginPath();
            editorCtx.moveTo(0, y);
            editorCtx.lineTo(w, y);
            editorCtx.stroke();
        }
    }

    // draw coordinate labels every 5 cells on top and left edges
    editorCtx.fillStyle = '#2563eb';
    editorCtx.font = `bold ${Math.max(9, Math.floor(editorGrid * 0.6))}px Arial`;
    editorCtx.textAlign = 'center';
    editorCtx.textBaseline = 'top';
    for (let col = 0; col < columns; col += 5) {
        const x = col * editorGrid + editorGrid / 2;
        editorCtx.fillText(String(col + 1), x, 2);
    }
    editorCtx.textAlign = 'left';
    editorCtx.textBaseline = 'middle';
    for (let row = 0; row < rows; row += 5) {
        const y = row * editorGrid + editorGrid / 2;
        editorCtx.fillText(String(row + 1), 2, y);
    }

    // draw walls
    editorCtx.fillStyle = '#000';
    editorWalls.forEach(wall => {
        const px = (wall.x / grid) * editorGrid;
        const py = (wall.y / grid) * editorGrid;
        editorCtx.fillRect(px, py, editorGrid - 1, editorGrid - 1);
    });

    // draw start positions with directional arrows
    const starts = editorStarts;
    if (starts) {
        starts.forEach((st, idx) => {
            if (!st) return;
            const cx = (st.x / grid) * editorGrid + editorGrid / 2;
            const cy = (st.y / grid) * editorGrid + editorGrid / 2;
            const color = idx === 0 ? '#ff0' : '#faa';
            
            // draw circle background
            editorCtx.fillStyle = color;
            editorCtx.beginPath();
            editorCtx.arc(cx, cy, editorGrid / 3, 0, 2 * Math.PI);
            editorCtx.fill();
            
            // draw a larger directional arrow (more prominent for P1/P2 starts)
            let ux = 0, uy = 0;
            if (st.dx > 0) ux = 1;
            else if (st.dx < 0) ux = -1;
            else if (st.dy > 0) uy = 1;
            else if (st.dy < 0) uy = -1;
            const px = -uy;
            const py = ux;
            const shaftBack = editorGrid * 0.14;
            const shaftFront = editorGrid * 0.36;
            const headLen = editorGrid * 0.26;
            const bodyHalf = editorGrid * 0.10;
            const headHalf = editorGrid * 0.20;
            const bx = cx - ux * shaftBack;
            const by = cy - uy * shaftBack;
            const tx = cx + ux * shaftFront;
            const ty = cy + uy * shaftFront;
            const tipX = tx + ux * headLen;
            const tipY = ty + uy * headLen;

            editorCtx.fillStyle = '#000';
            editorCtx.beginPath();
            editorCtx.moveTo(bx + px * bodyHalf, by + py * bodyHalf);
            editorCtx.lineTo(tx + px * bodyHalf, ty + py * bodyHalf);
            editorCtx.lineTo(tx + px * headHalf, ty + py * headHalf);
            editorCtx.lineTo(tipX, tipY);
            editorCtx.lineTo(tx - px * headHalf, ty - py * headHalf);
            editorCtx.lineTo(tx - px * bodyHalf, ty - py * bodyHalf);
            editorCtx.lineTo(bx - px * bodyHalf, by - py * bodyHalf);
            editorCtx.closePath();
            editorCtx.fill();
            
            // draw player number
            editorCtx.fillStyle = '#000';
            editorCtx.font = 'bold ' + Math.floor(editorGrid / 2) + 'px Arial';
            editorCtx.textAlign = 'center';
            editorCtx.textBaseline = 'middle';
            editorCtx.fillText(idx + 1, cx, cy);
        });
    }

    // if user is currently placing a start (preview)
    if (settingStart && editorTool_points.length > 0) {
        const pos = editorTool_points[0];
        const px = (pos.x / grid) * editorGrid + editorGrid/2;
        const py = (pos.y / grid) * editorGrid + editorGrid/2;
        editorCtx.strokeStyle = '#0f0';
        editorCtx.lineWidth = 2;
        editorCtx.beginPath();
        editorCtx.moveTo(px - 8, py);
        editorCtx.lineTo(px + 8, py);
        editorCtx.moveTo(px, py - 8);
        editorCtx.lineTo(px, py + 8);
        editorCtx.stroke();
    }

    // draw current tool points
    editorCtx.fillStyle = '#f00';
    editorTool_points.forEach(pt => {
        const px = (pt.x / grid) * editorGrid;
        const py = (pt.y / grid) * editorGrid;
        editorCtx.beginPath();
        editorCtx.arc(px + editorGrid/2, py + editorGrid/2, 4, 0, Math.PI * 2);
        editorCtx.fill();
    });
}

let editorMouseGridPos = null;

function updateEditorCoordDisplay(gridCol, gridRow) {
    if (gridCol === null || gridRow === null) {
        editorCoordDisplay.textContent = 'X: -, Y: -';
        return;
    }
    editorCoordDisplay.textContent = `X: ${gridCol + 1}, Y: ${gridRow + 1}`;
}

function updateEditorCommitState() {
    const tool = editorTool.value;
    const isCommitTool = tool === 'line' || tool === 'curve';
    if (!isCommitTool) {
        editorCommit.style.display = 'none';
        editorCommit.disabled = true;
        return;
    }
    editorCommit.style.display = 'inline-block';
    if (tool === 'line') {
        editorCommit.disabled = editorTool_points.length < 2;
    } else {
        editorCommit.disabled = editorTool_points.length < 3;
    }
}

function getLineCells(points) {
    const cells = [];
    if (points.length < 2) return cells;
    for (let seg = 0; seg < points.length - 1; seg++) {
        const p1 = points[seg];
        const p2 = points[seg + 1];
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy)) / grid;
        if (steps === 0) {
            cells.push({x: p1.x, y: p1.y});
            continue;
        }
        for (let i = 0; i <= steps; i++) {
            const px = p1.x + (dx / steps) * i;
            const py = p1.y + (dy / steps) * i;
            cells.push({
                x: Math.round(px / grid) * grid,
                y: Math.round(py / grid) * grid
            });
        }
    }
    return cells;
}

function getCurveCells(points) {
    const cells = [];
    if (points.length < 3) return cells;
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        for (let t = 0; t <= 1; t += 0.05) {
            const t2 = t * t;
            const t3 = t2 * t;
            const x = 0.5 * (
                2 * p1.x + (-p0.x + p2.x) * t +
                (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
            );
            const y = 0.5 * (
                2 * p1.y + (-p0.y + p2.y) * t +
                (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
            );
            cells.push({
                x: Math.round(x / grid) * grid,
                y: Math.round(y / grid) * grid
            });
        }
    }
    return cells;
}

function addWallCells(cells) {
    cells.forEach(c => {
        if (!editorWalls.find(w => w.x === c.x && w.y === c.y)) {
            editorWalls.push({x: c.x, y: c.y});
        }
    });
}

editorCanvas.addEventListener('mousemove', (e) => {
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Use rendered dimensions for pointer-to-cell mapping so preview stays under cursor.
    const cellWidth = rect.width / columns;
    const cellHeight = rect.height / rows;
    const gridCol = Math.floor(x / cellWidth);
    const gridRow = Math.floor(y / cellHeight);
    if (gridCol < 0 || gridCol >= columns || gridRow < 0 || gridRow >= rows) {
        editorMouseGridPos = null;
        updateEditorCoordDisplay(null, null);
    } else {
        editorMouseGridPos = {col: gridCol, row: gridRow};
        updateEditorCoordDisplay(gridCol, gridRow);
    }
    // redraw with preview
    redrawEditorWithPreview();
});

editorCanvas.addEventListener('mouseleave', () => {
    editorMouseGridPos = null;
    updateEditorCoordDisplay(null, null);
    drawEditor();
});

function redrawEditorWithPreview() {
    drawEditor(); // draw base
    if (!editorMouseGridPos) return;
    
    const w = editorCanvas.width;
    const editorGrid = w / columns;
    const px = editorMouseGridPos.col * editorGrid;
    const py = editorMouseGridPos.row * editorGrid;
    
    // draw transparent grey preview square
    editorCtx.fillStyle = 'rgba(100, 100, 100, 0.4)';
    editorCtx.fillRect(px, py, editorGrid - 1, editorGrid - 1);
    
    // For line and curve tools, show a shadow of the walls that commit will place.
    const tool = editorTool.value;
    if (tool === 'line' || tool === 'curve') {
        const tempPoint = {x: editorMouseGridPos.col * grid, y: editorMouseGridPos.row * grid};
        const previewPoints = editorTool_points.concat([tempPoint]);
        const previewCells = tool === 'line' ? getLineCells(previewPoints) : getCurveCells(previewPoints);
        editorCtx.fillStyle = 'rgba(0, 0, 0, 0.28)';
        previewCells.forEach(c => {
            const cx = (c.x / grid) * editorGrid;
            const cy = (c.y / grid) * editorGrid;
            editorCtx.fillRect(cx, cy, editorGrid - 1, editorGrid - 1);
        });
    }
}

// Apply walls for line tool (called when commit is clicked)
function applyLineWalls() {
    if (editorTool_points.length >= 2) {
        addWallCells(getLineCells(editorTool_points));
        editorTool_points = [];
        updateEditorCommitState();
        drawEditor();
    }
}

// Apply walls for curve tool (called when commit is clicked)
function applyCurveWalls() {
    if (editorTool_points.length >= 3) {
        addWallCells(getCurveCells(editorTool_points));
        editorTool_points = [];
        updateEditorCommitState();
        drawEditor();
    }
}

editorCanvas.addEventListener('click', (e) => {
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate grid position based on rendered canvas size
    const renderedWidth = rect.width;
    const renderedHeight = rect.height;
    const cellWidth = renderedWidth / columns;
    const cellHeight = renderedHeight / rows;
    
    const gridCol = Math.floor(x / cellWidth);
    const gridRow = Math.floor(y / cellHeight);
    
    // Ensure we're within valid grid bounds (columns x rows)
    if (gridCol < 0 || gridCol >= columns || gridRow < 0 || gridRow >= rows) {
        return;
    }
    
    const gridX = gridCol * grid;
    const gridY = gridRow * grid;

    const tool = editorTool.value;
    // if we're setting a start, handle that first
    if (settingStart) {
        editorTool_points = [{x: gridX, y: gridY}];
        const dir = prompt('Enter initial direction (up/down/left/right):', 'right');
        if (dir !== null) {
            let dx = 0, dy = 0;
            if (dir === 'up') dy = -grid;
            else if (dir === 'down') dy = grid;
            else if (dir === 'left') dx = -grid;
            else if (dir === 'right') dx = grid;
            editorStarts[settingStart.player - 1] = {x: gridX, y: gridY, dx, dy};
        }
        settingStart = null;
        editorTool_points = [];
        drawEditor();
        return;
    }
    if (tool === 'dot') {
        const idx = editorWalls.findIndex(w => w.x === gridX && w.y === gridY);
        if (idx >= 0) {
            editorWalls.splice(idx, 1);
        } else {
            editorWalls.push({x: gridX, y: gridY});
        }
        drawEditor();
    } else if (tool === 'line') {
        const last = editorTool_points[editorTool_points.length - 1];
        if (!last || last.x !== gridX || last.y !== gridY) {
            editorTool_points.push({x: gridX, y: gridY});
        }
        updateEditorCommitState();
        redrawEditorWithPreview();
    } else if (tool === 'erase') {
        // Erase in a 3x3 area for easier bulk removal
        const eraseRadius = 1;
        for (let dx = -eraseRadius; dx <= eraseRadius; dx++) {
            for (let dy = -eraseRadius; dy <= eraseRadius; dy++) {
                const eraseX = gridX + dx * grid;
                const eraseY = gridY + dy * grid;
                const idx = editorWalls.findIndex(w => w.x === eraseX && w.y === eraseY);
                if (idx >= 0) {
                    editorWalls.splice(idx, 1);
                }
            }
        }
        drawEditor();
    } else if (tool === 'curve') {
        const last = editorTool_points[editorTool_points.length - 1];
        if (!last || last.x !== gridX || last.y !== gridY) {
            editorTool_points.push({x: gridX, y: gridY});
        }
        updateEditorCommitState();
        redrawEditorWithPreview();
    } else if (tool === 'circle') {
        editorTool_points.push({x: gridX, y: gridY});
        if (editorTool_points.length === 2) {
            const c = editorTool_points[0];
            const p = editorTool_points[1];
            const dx = p.x - c.x;
            const dy = p.y - c.y;
            const radius = Math.sqrt(dx*dx + dy*dy);
            const steps = Math.ceil(2 * Math.PI * radius / grid);
            for (let i = 0; i < steps; i++) {
                const theta = (i / steps) * 2 * Math.PI;
                const wx = Math.round((c.x + Math.cos(theta) * radius) / grid) * grid;
                const wy = Math.round((c.y + Math.sin(theta) * radius) / grid) * grid;
                if (!editorWalls.find(w => w.x === wx && w.y === wy)) {
                    editorWalls.push({x: wx, y: wy});
                }
            }
            editorTool_points = [];
            drawEditor();
        } else {
            redrawEditorWithPreview();
        }
    }
});

editorCanvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    editorTool_points = [];
    updateEditorCommitState();
    drawEditor();
});

editorTool.addEventListener('change', () => {
    editorTool_points = [];
    updateEditorCommitState();
    drawEditor();
});

editorClear.addEventListener('click', () => {
    editorWalls = [];
    editorTool_points = [];
    editorStarts = [null, null];
    updateEditorCommitState();
    drawEditor();
});

editorCommit.addEventListener('click', () => {
    const tool = editorTool.value;
    if (tool === 'line') {
        applyLineWalls();
    } else if (tool === 'curve') {
        applyCurveWalls();
    }
});

// start placement buttons
document.getElementById('setStart1').addEventListener('click', () => {
    settingStart = {player: 1};
    editorTool_points = [];
    updateEditorCommitState();
    drawEditor();
});
document.getElementById('setStart2').addEventListener('click', () => {
    settingStart = {player: 2};
    editorTool_points = [];
    updateEditorCommitState();
    drawEditor();
});

addDotBtn.addEventListener('click', () => {
    const x = parseInt(dotXInput.value, 10);
    const y = parseInt(dotYInput.value, 10);
    if (isNaN(x) || isNaN(y) || x < 1 || x > columns || y < 1 || y > rows) {
        alert(`Enter valid coordinates: X 1-${columns}, Y 1-${rows}.`);
        return;
    }
    const wall = {x: (x - 1) * grid, y: (y - 1) * grid};
    if (!editorWalls.find(w => w.x === wall.x && w.y === wall.y)) {
        editorWalls.push(wall);
    }
    drawEditor();
});

editorSave.addEventListener('click', () => {
    if (!isAdminLoggedIn) {
        alert('Only admin can save levels.');
        return;
    }
    // choose which level number to save as (may be new)
    const idx = promptForLevelIndex();
    if (idx === null) return; // user cancelled
    ensureLevelIndex(idx);

    // Use existing level name or generate default
    const previousName = levels[idx]?.name || `Level ${idx + 1}`;
    const levelNameInput = prompt('Level name:', previousName);
    if (levelNameInput === null) return;
    const levelName = levelNameInput.trim() || previousName;
    const visibility = levelVisibilitySelect.value === 'admin' ? 'admin' : 'public';

    // ask for player start info, but use any interactive values already set
    let start1 = editorStarts[0];
    if (!start1) {
        start1 = promptForStartInfo(1);
        if (start1 === null) return;
    }
    warnIfNearWall(start1);
    let start2 = editorStarts[1];
    if (!start2) {
        start2 = promptForStartInfo(2);
        if (start2 === null) return;
    }
    warnIfNearWall(start2);

    // save everything into the chosen slot
    levels[idx].name = levelName;
    levels[idx].walls = JSON.parse(JSON.stringify(editorWalls));
    levels[idx].starts = [start1, start2];
    levels[idx].visibility = visibility;
    levels[idx].owner = 'admin';
    saveLevels();

    // switch selection to the level just saved, and refresh the dropdown
    selectedLevelIdx = idx;
    populateLevelSelect();
    levelSelect.value = idx;

    levelEditorDiv.style.display = 'none';
    settingsDiv.style.display = 'block';
});

editorCancel.addEventListener('click', () => {
    levelEditorDiv.style.display = 'none';
    settingsDiv.style.display = 'block';
});

document.addEventListener('keydown', (e) => {
    if (gameEdition === 'classic') {
        const key = e.key.toLowerCase();
        if (key === ' ' && (classicState === 'waiting_start' || classicState === 'waiting_respawn')) {
            e.preventDefault();
            classicState = 'running';
            classicNeedsRespawn = false;
            draw();
            return;
        }
        if (classicState === 'game_over_prompt' && (key === 'y' || key === 'n')) {
            e.preventDefault();
            if (key === 'y') {
                finishClassicSetup();
            } else {
                returnToChooser();
            }
            return;
        }
    }
    if (e.key.toLowerCase() === 'p') {
        e.preventDefault();
        togglePause();
        return;
    }
    if (e.key === 'Escape' && levelEditorDiv.style.display !== 'none') {
        editorTool_points = [];
        drawEditor();
    }
});

levelEditorBtn.addEventListener('click', () => {
    if (!isAdminLoggedIn) {
        alert('Please log in as admin to open the level builder.');
        return;
    }
    selectedLevelIdx = parseInt(levelSelect.value, 10);
    settingsDiv.style.display = 'none';
    levelEditorDiv.style.display = 'flex';
    setTimeout(() => initEditor(), 10);
});

clearScoresBtn.addEventListener('click', () => {
    scoreboardEntries = [];
    saveScoreboard();
    renderScoreboard();
});

// Initialize
populateLevelSelect();
levelSelect.value = String(selectedLevelIdx);
deathResetAllToggle.checked = true;
updateAdminUi();
updateOnlineButtons();
updatePauseButtonLabel();
renderScoreboard();
setOnlineStatus('Mode is local until you create or join a room.');
welcomeScreen.style.display = 'flex';
appShell.style.display = 'none';

function startFromWelcome(edition) {
    logGood('Welcome selection:', edition);
    gameEdition = edition;
    const classic = edition === 'classic';
    document.body.classList.toggle('classic-edition', classic);
    document.body.classList.toggle('classic-color-edition', false);
    if (brandLabel) {
        brandLabel.textContent = classic ? 'Nibbles Classic' : 'Nibbles Deluxe';
    }
    modeSelect.value = classic ? 'double' : 'single';
    modeSelect.dispatchEvent(new Event('change'));
    applyEditionUi();
    welcomeScreen.style.display = 'none';
    appShell.style.display = 'flex';
    if (classic) {
        settingsDiv.style.display = 'none';
        updateInGameHackUi();
        startClassicPromptFlow();
    } else {
        settingsDiv.style.display = 'block';
        canvas.style.display = 'none';
        infoDiv.style.display = 'none';
        updateInGameHackUi();
        updateCanvasMetrics();
    }
}

// Allow a simple inline HTML fallback handler to start the app, and make
// debugging obvious if script initialization fails.
window.NIBBLES_START = startFromWelcome;

if (startDeluxeBtn && startClassicBtn) {
    startDeluxeBtn.addEventListener('click', () => startFromWelcome('deluxe'));
    startClassicBtn.addEventListener('click', () => startFromWelcome('classic'));
} else if (welcomeImageFallback) {
    // Backward compatibility if older welcome markup is still present.
    welcomeImageFallback.addEventListener('click', () => startFromWelcome('deluxe'));
}

classicAnswerInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleClassicAnswer();
    }
});

backToChooserBtn.addEventListener('click', () => {
    returnToChooser();
});

// Handle window resize
window.addEventListener('resize', () => {
    updateCanvasMetrics();
    if (canvas.style.display !== 'none') {
        draw();
    }
});
