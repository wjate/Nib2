// DOS Nibbles clone with levels, level editor, and persistent storage

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
// each 'dot' will be a few pixels wide; grid size is only used for
// rendering and internal location, snake movement is now more fluid.
const grid = 4;

// fixed playing field dimensions in dots (wider than tall as requested)
const columns = 100;
const rows = 50;

// derived canvas pixel dimensions for the playable field
let canvasWidth = 0;
let canvasHeight = 0;
let actualGrid = 1;

function updateCanvasMetrics() {
    // Keep a consistent logical field (columns x rows) and scale to viewport.
    actualGrid = Math.max(1, Math.floor(Math.min(window.innerWidth / columns, window.innerHeight / rows)));
    canvasWidth = columns * actualGrid;
    canvasHeight = rows * actualGrid;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
}

updateCanvasMetrics();

let players = [];
let currentNumber = 1;
let level = 1;
let gameSpeed = 100; // ms per move (constant)
let speedMultiplier = 1; // user-adjustable delay factor
let intervalId;
let mode = 'double';
let numberPos;
let walls = []; // array of wall segments: {x, y}
let selectedLevelIdx = 0;

// UI Elements
const settingsDiv = document.getElementById('settings');
const infoDiv = document.getElementById('info');
const levelDisplay = document.getElementById('levelDisplay');
const scoreDisplay = document.getElementById('scoreDisplay');
const livesDisplay = document.getElementById('livesDisplay');
const levelSelect = document.getElementById('levelSelect');
const levelEditorDiv = document.getElementById('levelEditor');
const levelEditorBtn = document.getElementById('levelEditorBtn');
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

// Level storage
let levels = loadLevels();

// ===== LEVEL STORAGE & MANAGEMENT =====
function loadLevels() {
    const raw = localStorage.getItem('nibblesLevels');
    if (raw) {
        // always start with only the default level; drop extras
        let arr = JSON.parse(raw);
        if (!Array.isArray(arr) || arr.length === 0) {
            arr = [{ name: 'Level 1', walls: [], starts: [] }];
        } else {
            arr = [arr[0]]; // keep just the first entry
        }
        // persist the trimmed list back to storage
        localStorage.setItem('nibblesLevels', JSON.stringify(arr));
        return arr;
    }
    // default level (empty)
    return [{ name: 'Level 1', walls: [], starts: [] }];
}

function saveLevels() {
    localStorage.setItem('nibblesLevels', JSON.stringify(levels));
}

function getCurrentLevelWalls() {
    return levels[selectedLevelIdx]?.walls || [];
    if (!levels[selectedLevelIdx]) {
        levels[selectedLevelIdx] = { name: levelName || `Level ${selectedLevelIdx + 1}`, walls: [], starts: [] };
    } else if (levelName) {
        levels[selectedLevelIdx].name = levelName;
    }
    levels[selectedLevelIdx].walls = wallArray;
    if (starts) {
        levels[selectedLevelIdx].starts = starts;
    }
    saveLevels();
}

function populateLevelSelect() {
    levelSelect.innerHTML = '';
    levels.forEach((lv, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = lv.name || `Level ${idx + 1}`;
        levelSelect.appendChild(opt);
    });
    // only show 'New Level' option if there are existing levels
    if (levels.length > 0) {
        const newOpt = document.createElement('option');
        newOpt.value = levels.length;
        newOpt.textContent = '(New Level)';
        levelSelect.appendChild(newOpt);
    }
}

// ensure the levels array is long enough to include the given index
function ensureLevelIndex(idx) {
    while (levels.length <= idx) {
        levels.push({ name: `Level ${levels.length + 1}`, walls: [], starts: [] });
    }
}

// ask user for a 1-based level number (2+); returns 0-based index or null if cancelled
function promptForLevelIndex() {
    while (true) {
        const raw = prompt('Enter level number (2+):', Math.max(2, selectedLevelIdx + 1));
        if (raw === null) return null;
        const num = parseInt(raw, 10);
        if (!isNaN(num) && num >= 2) {
            return num - 1;
        }
        alert('Please enter a valid integer 2 or greater.');
    }
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

function makePlayer(name, idx, startInfo) {
    // allow specifying a custom start (x,y,dx,dy) from level data
    const start = startInfo || {};
    const defaultX = idx === 0 ? 2 * grid : (columns - 3) * grid;
    const defaultY = idx === 0 ? 2 * grid : (rows - 3) * grid;
    const defaultDx = idx === 0 ? grid : -grid;
    const defaultDy = 0;
    // Start with 3 segments so the snake is visible
    const body = [{x: start.x ?? defaultX, y: start.y ?? defaultY}];
    for (let i = 1; i < 3; i++) {
        body.push({x: (start.x ?? defaultX) - i * (start.dx ?? defaultDx), y: (start.y ?? defaultY) - i * (start.dy ?? defaultDy)});
    }
    return {
        name,
        color: idx === 0 ? '#ff0' : '#faa',
        body: body,
        dx: start.dx ?? defaultDx,
        dy: start.dy ?? defaultDy,
        queuedDirection: null,
        lives: 5,
        score: 0,
        targetLength: 3, // desired body length in segments (start visible)
        // player one uses the arrows, player two uses WASD
        controls: idx === 0
            ? {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}
            : {up: 'w', down: 's', left: 'a', right: 'd'}
    };
}

function initPlayers(p1name, p2name) {
    // if level has explicit start info use it, otherwise fallback
    const starts = levels[selectedLevelIdx]?.starts || [];
    players = [makePlayer(p1name, 0, starts[0])];
    if (mode === 'double') {
        players.push(makePlayer(p2name, 1, starts[1]));
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

function draw() {
    ctx.fillStyle = '#fff'; // white playing field
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#f00';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // draw walls
    ctx.fillStyle = '#000';
    walls.forEach(wall => {
        const wx = wall.x / grid * actualGrid;
        const wy = wall.y / grid * actualGrid;
        ctx.fillRect(wx, wy, actualGrid, actualGrid);
    });

    // number tile (2 cells tall)
    const nx = (numberPos.x / grid) * actualGrid;
    const ny = (numberPos.y / grid) * actualGrid;
    ctx.fillStyle = '#fff';
    ctx.fillRect(nx, ny, actualGrid, actualGrid * 2);
    ctx.fillStyle = '#000';
    ctx.font = Math.floor(actualGrid * 1.5) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentNumber, nx + actualGrid / 2, ny + actualGrid);

    // players (draw as rounded polyline rather than individual squares)
    players.forEach(p => {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = actualGrid;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.beginPath();
        p.body.forEach((seg, i) => {
            const cx = seg.x / grid * actualGrid + actualGrid / 2;
            const cy = seg.y / grid * actualGrid + actualGrid / 2;
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
    });
}

function update() {
    let collisionOccurred = false;
    players.forEach(p => {
        if (collisionOccurred) return;

        // Apply at most one queued turn per tick to avoid instant double-turn self collisions.
        if (p.queuedDirection) {
            const nextDx = p.queuedDirection.dx;
            const nextDy = p.queuedDirection.dy;
            if (!(nextDx === -p.dx && nextDy === -p.dy)) {
                p.dx = nextDx;
                p.dy = nextDy;
            }
            p.queuedDirection = null;
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
                nextLevel();
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
    checkGameOver();
}

function die(player) {
    player.lives -= 1;
    player.score -= 1000;
    if (player.score < 0) player.score = 0; // allow negative but show as 0
    if (player.lives < 0) player.lives = 0; // clamp at 0
    
    if (mode === 'double') {
        // In multiplayer, reset level for both players
        players.forEach(p => {
            const idx = players.indexOf(p);
            const starts = levels[selectedLevelIdx]?.starts || [];
            let startX, startY, startDx, startDy;
            if (starts[idx]) {
                startX = starts[idx].x;
                startY = starts[idx].y;
                startDx = starts[idx].dx;
                startDy = starts[idx].dy;
            } else {
                startX = idx === 0 ? 2*grid : (columns-3)*grid;
                startY = idx === 0 ? 2*grid : (rows-3)*grid;
                startDx = idx === 0 ? grid : -grid;
                startDy = 0;
            }
            const body = [{x: startX, y: startY}];
            for (let i = 1; i < 3; i++) {
                body.push({x: startX - i * startDx, y: startY - i * startDy});
            }
            p.body = body;
            p.dx = startDx;
            p.dy = startDy;
            p.queuedDirection = null;
            p.targetLength = 3;
        });
        // Reset food position
        numberPos = randomNumberPosition();
    } else {
        // In single player, just reset this player
        const idx = players.indexOf(player);
        const starts = levels[selectedLevelIdx]?.starts || [];
        let startX, startY, startDx, startDy;
        if (starts[idx]) {
            startX = starts[idx].x;
            startY = starts[idx].y;
            startDx = starts[idx].dx;
            startDy = starts[idx].dy;
        } else {
            startX = idx === 0 ? 2*grid : (columns-3)*grid;
            startY = idx === 0 ? 2*grid : (rows-3)*grid;
            startDx = idx === 0 ? grid : -grid;
            startDy = 0;
        }
        const body = [{x: startX, y: startY}];
        for (let i = 1; i < 3; i++) {
            body.push({x: startX - i * startDx, y: startY - i * startDy});
        }
        player.body = body;
        player.dx = startDx;
        player.dy = startDy;
        player.queuedDirection = null;
        player.targetLength = 3;
    }
}

function nextLevel() {
    level++;
    currentNumber = 1;
    // speedMultiplier increases with level, but gameSpeed stays constant
    speedMultiplier = Math.max(0.2, 1 - (level - 1) * 0.1);
    clearInterval(intervalId);
    intervalId = setInterval(update, gameSpeed * speedMultiplier);
    numberPos = randomNumberPosition();
}

function updateInfo() {
    levelDisplay.textContent = `Level: ${level}`;
    let scoreText = players.map(p => `${p.name}: ${p.score}`).join(' | ');
    let livesText = players.map(p => `${p.name} lives: ${p.lives}`).join(' | ');
    scoreDisplay.textContent = scoreText;
    livesDisplay.textContent = livesText;
}

function changeDirection(event) {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    players.forEach(p => {
        if (p.queuedDirection) return;

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
        if (nextDx === -p.dx && nextDy === -p.dy) return;

        if (!(nextDx === p.dx && nextDy === p.dy)) {
            p.queuedDirection = {dx: nextDx, dy: nextDy};
        }
    });
}

document.addEventListener('keydown', changeDirection);
document.getElementById('endBtn').addEventListener('click', gameOver);

const modeSelect = document.getElementById('mode');
modeSelect.addEventListener('change', () => {
    const p2field = document.getElementById('p2name').parentElement;
    if (modeSelect.value === 'single') {
        p2field.style.display = 'none';
    } else {
        p2field.style.display = '';
    }
});
modeSelect.dispatchEvent(new Event('change'));

function start() {
    mode = document.getElementById('mode').value;
    selectedLevelIdx = parseInt(levelSelect.value);
    walls = JSON.parse(JSON.stringify(getCurrentLevelWalls())); // deep copy
    const p1 = document.getElementById('p1name').value || 'Player1';
    const p2 = document.getElementById('p2name').value || 'Player2';
    const speedInput = parseInt(document.getElementById('speed').value, 10);
    // map 1-100 to speedMultiplier (1=fast, 100=slow)
    speedMultiplier = (101 - speedInput) / 50;
    initPlayers(p1, p2);
    level = 1;
    currentNumber = 1;
    numberPos = randomNumberPosition();
    settingsDiv.style.display = 'none';
    canvas.style.display = 'block';
    infoDiv.style.display = 'block';
    updateInfo();
    draw();
    clearInterval(intervalId);
    intervalId = setInterval(update, gameSpeed * speedMultiplier);
}

document.getElementById('startBtn').addEventListener('click', start);

function resetLevels() {
    if (confirm('Reset all levels to default? This cannot be undone.')) {
        levels = [{ name: 'Level 1', walls: [], starts: [] }];
        saveLevels();
        populateLevelSelect();
        levelSelect.value = 0;
        selectedLevelIdx = 0;
    }
}

document.getElementById('resetBtn').addEventListener('click', resetLevels);

function checkGameOver() {
    if (mode === 'single') {
        if (players[0].lives === 0) gameOver();
    } else {
        if (players.some(p => p.lives === 0)) gameOver();
    }
}

function gameOver() {
    clearInterval(intervalId);
    settingsDiv.style.display='block';
    canvas.style.display='none';
    infoDiv.style.display='none';
}

// ===== LEVEL EDITOR =====
let editorWalls = [];
let editorTool_currentTool = 'dot';
let editorTool_points = [];
let editorStarts = [null, null];
let settingStart = null; // used when user is interactively placing a start

function initEditor() {
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
    // choose which level number to save as (may be new)
    const idx = promptForLevelIndex();
    if (idx === null) return; // user cancelled
    ensureLevelIndex(idx);

    // Use existing level name or generate default
    const levelName = levels[idx]?.name || `Level ${idx + 1}`;

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
    if (e.key === 'Escape' && levelEditorDiv.style.display !== 'none') {
        editorTool_points = [];
        drawEditor();
    }
});

levelEditorBtn.addEventListener('click', () => {
    selectedLevelIdx = parseInt(levelSelect.value);
    settingsDiv.style.display = 'none';
    levelEditorDiv.style.display = 'flex';
    setTimeout(() => initEditor(), 10);
});

// Initialize
populateLevelSelect();
levelSelect.value = selectedLevelIdx;

// Handle window resize
window.addEventListener('resize', () => {
    updateCanvasMetrics();
    if (canvas.style.display !== 'none') {
        draw();
    }
});
