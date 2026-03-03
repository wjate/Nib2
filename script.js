// DOS Nibbles clone with levels, level editor, and persistent storage

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const grid = 20;

// State
// 16:14 aspect ratio (width:height)
let canvasHeight = Math.floor((window.innerHeight - 100) / 14) * 14;
let canvasWidth = Math.floor(canvasHeight * 16 / 14);
let columns = Math.floor(canvasWidth / grid);
let rows = Math.floor(canvasHeight / grid);

canvas.width = canvasWidth;
canvas.height = canvasHeight;

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
const editorClear = document.getElementById('editorClear');
const editorSave = document.getElementById('editorSave');
const editorCancel = document.getElementById('editorCancel');

// Level storage
let levels = loadLevels();

// ===== LEVEL STORAGE & MANAGEMENT =====
function loadLevels() {
    const raw = localStorage.getItem('nibblesLevels');
    if (raw) {
        return JSON.parse(raw);
    }
    // default level (empty)
    return [{ name: 'Level 1', walls: [] }];
}

function saveLevels() {
    localStorage.setItem('nibblesLevels', JSON.stringify(levels));
}

function getCurrentLevelWalls() {
    return levels[selectedLevelIdx]?.walls || [];
}

function setCurrentLevelWalls(wallArray) {
    if (!levels[selectedLevelIdx]) {
        levels[selectedLevelIdx] = { name: `Level ${selectedLevelIdx + 1}`, walls: [] };
    }
    levels[selectedLevelIdx].walls = wallArray;
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
}

function makePlayer(name, idx) {
    const startX = idx === 0 ? 2 * grid : (columns - 3) * grid;
    const startY = idx === 0 ? 2 * grid : (rows - 3) * grid;
    return {
        name,
        color: idx === 0 ? '#ff0' : '#faa',
        body: [{x: startX, y: startY}],
        dx: idx === 0 ? grid : -grid,
        dy: 0,
        lives: 5,
        score: 0,
        controls: idx === 0
            ? {up: 'w', down: 's', left: 'a', right: 'd'}
            : {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight'}
    };
}

function initPlayers(p1name, p2name) {
    players = [makePlayer(p1name, 0)];
    if (mode === 'double') {
        players.push(makePlayer(p2name, 1));
    }
}

function randomNumberPosition() {
    let position;
    let attempts = 0;
    while (attempts < 100) {
        position = {
            x: Math.floor(Math.random() * columns) * grid,
            y: Math.floor(Math.random() * rows) * grid
        };
        let bad = false;
        // check collision with snakes
        players.forEach(p => {
            p.body.forEach(seg => {
                if (seg.x === position.x && seg.y === position.y) bad = true;
            });
        });
        // check collision with walls
        walls.forEach(wall => {
            if (wall.x === position.x && wall.y === position.y) bad = true;
        });
        if (!bad) return position;
        attempts++;
    }
    return {x: grid * 10, y: grid * 10}; // fallback
}

function draw() {
    ctx.fillStyle = '#afe';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#f00';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    // draw walls
    ctx.fillStyle = '#000';
    walls.forEach(wall => {
        ctx.fillRect(wall.x, wall.y, grid, grid);
    });

    // number tile
    ctx.fillStyle = '#fff';
    ctx.fillRect(numberPos.x, numberPos.y, grid, grid);
    ctx.fillStyle = '#000';
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(currentNumber, numberPos.x + grid/2, numberPos.y + grid/2);

    // players
    players.forEach(p => {
        ctx.fillStyle = p.color;
        p.body.forEach(seg => ctx.fillRect(seg.x, seg.y, grid, grid));
    });
}

function update() {
    let collisionOccurred = false;
    players.forEach(p => {
        if (collisionOccurred) return;
        const head = {x: p.body[0].x + p.dx, y: p.body[0].y + p.dy};

        // wall collision
        if (head.x < 0 || head.x >= canvas.width || head.y < 0 || head.y >= canvas.height) {
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

        // eat number
        if (head.x === numberPos.x && head.y === numberPos.y) {
            p.score += currentNumber * 100;
            // grow snake by currentNumber * 2 segments
            const growthAmount = currentNumber * 2;
            for (let g = 0; g < growthAmount; g++) {
                p.body.push({...p.body[p.body.length - 1]});
            }
            currentNumber++;
            if (currentNumber > 9) {
                nextLevel();
            } else {
                numberPos = randomNumberPosition();
            }
        } else {
            p.body.pop();
        }

        p.body.unshift(head);
    });
    draw();
    updateInfo();
    checkGameOver();
}

function die(player) {
    player.lives -= 1;
    player.score -= 1000;
    const idx = players.indexOf(player);
    const startX = idx === 0 ? 2*grid : (columns-3)*grid;
    const startY = idx === 0 ? 2*grid : (rows-3)*grid;
    player.body = [{x: startX, y: startY}];
    player.dx = idx === 0 ? grid : -grid;
    player.dy = 0;
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
        if (key === p.controls.left && p.dx === 0) {
            p.dx = -grid; p.dy = 0;
        } else if (key === p.controls.right && p.dx === 0) {
            p.dx = grid; p.dy = 0;
        } else if (key === p.controls.up && p.dy === 0) {
            p.dx = 0; p.dy = -grid;
        } else if (key === p.controls.down && p.dy === 0) {
            p.dx = 0; p.dy = grid;
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
    clearInterval(intervalId);
    intervalId = setInterval(update, gameSpeed * speedMultiplier);
}

document.getElementById('startBtn').addEventListener('click', start);

function checkGameOver() {
    if (mode === 'single') {
        if (players[0].lives <= 0) gameOver();
    } else {
        if (players.every(p=>p.lives<=0)) gameOver();
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

function initEditor() {
    editorCanvas.width = Math.min(80 * 20, window.innerWidth - 40);
    editorCanvas.height = editorCanvas.width;
    editorWalls = JSON.parse(JSON.stringify(getCurrentLevelWalls()));
    editorTool_points = [];
    drawEditor();
}

function drawEditor() {
    const w = editorCanvas.width;
    const h = editorCanvas.height;
    const editorGrid = w / 30; // 30x30 grid for editor
    
    editorCtx.fillStyle = '#fff';
    editorCtx.fillRect(0, 0, w, h);
    editorCtx.strokeStyle = '#ccc';
    editorCtx.lineWidth = 0.5;
    for (let i = 0; i <= 30; i++) {
        editorCtx.beginPath();
        editorCtx.moveTo(i * editorGrid, 0);
        editorCtx.lineTo(i * editorGrid, h);
        editorCtx.stroke();
        editorCtx.beginPath();
        editorCtx.moveTo(0, i * editorGrid);
        editorCtx.lineTo(w, i * editorGrid);
        editorCtx.stroke();
    }

    // draw walls
    editorCtx.fillStyle = '#000';
    editorWalls.forEach(wall => {
        const px = (wall.x / grid) * editorGrid;
        const py = (wall.y / grid) * editorGrid;
        editorCtx.fillRect(px, py, editorGrid - 1, editorGrid - 1);
    });

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

editorCanvas.addEventListener('mousemove', (e) => {
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const editorGrid = editorCanvas.width / 30;
    const gridCol = Math.floor(x / editorGrid);
    const gridRow = Math.floor(y / editorGrid);
    editorMouseGridPos = {col: gridCol, row: gridRow};
    // redraw with preview
    redrawEditorWithPreview();
});

editorCanvas.addEventListener('mouseleave', () => {
    editorMouseGridPos = null;
    drawEditor();
});

function redrawEditorWithPreview() {
    drawEditor(); // draw base
    if (!editorMouseGridPos) return;
    
    const w = editorCanvas.width;
    const editorGrid = w / 30;
    const px = editorMouseGridPos.col * editorGrid;
    const py = editorMouseGridPos.row * editorGrid;
    
    // draw transparent grey preview square
    editorCtx.fillStyle = 'rgba(100, 100, 100, 0.4)';
    editorCtx.fillRect(px, py, editorGrid - 1, editorGrid - 1);
}

editorCanvas.addEventListener('click', (e) => {
    const rect = editorCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const editorGrid = editorCanvas.width / 30;
    const gridCol = Math.floor(x / editorGrid);
    const gridRow = Math.floor(y / editorGrid);
    const gridX = gridCol * grid;
    const gridY = gridRow * grid;

    const tool = editorTool.value;
    if (tool === 'dot') {
        const idx = editorWalls.findIndex(w => w.x === gridX && w.y === gridY);
        if (idx >= 0) {
            editorWalls.splice(idx, 1);
        } else {
            editorWalls.push({x: gridX, y: gridY});
        }
        drawEditor();
    } else if (tool === 'line') {
        editorTool_points.push({x: gridX, y: gridY});
        if (editorTool_points.length === 2) {
            // draw line
            const p1 = editorTool_points[0];
            const p2 = editorTool_points[1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const steps = Math.max(Math.abs(dx), Math.abs(dy)) / grid;
            for (let i = 0; i <= steps; i++) {
                const px = p1.x + (dx / steps) * i;
                const py = p1.y + (dy / steps) * i;
                const rounded = {x: Math.round(px / grid) * grid, y: Math.round(py / grid) * grid};
                const idx = editorWalls.findIndex(w => w.x === rounded.x && w.y === rounded.y);
                if (idx < 0) editorWalls.push(rounded);
            }
            editorTool_points = [];
            drawEditor();
        } else {
            redrawEditorWithPreview();
        }
    } else if (tool === 'curve') {
        editorTool_points.push({x: gridX, y: gridY});
        if (editorTool_points.length >= 3) {
            // catmull-rom interpolation
            const pts = editorTool_points;
            for (let i = 0; i < pts.length - 1; i++) {
                const p0 = pts[Math.max(0, i - 1)];
                const p1 = pts[i];
                const p2 = pts[i + 1];
                const p3 = pts[Math.min(pts.length - 1, i + 2)];
                
                for (let t = 0; t <= 1; t += 0.1) {
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
                    const rounded = {x: Math.round(x / grid) * grid, y: Math.round(y / grid) * grid};
                    const idx = editorWalls.findIndex(w => w.x === rounded.x && w.y === rounded.y);
                    if (idx < 0) editorWalls.push(rounded);
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
    drawEditor();
});

editorTool.addEventListener('change', () => {
    editorTool_points = [];
    drawEditor();
});

editorClear.addEventListener('click', () => {
    editorWalls = [];
    editorTool_points = [];
    drawEditor();
});

editorSave.addEventListener('click', () => {
    setCurrentLevelWalls(editorWalls);
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

// Handle window resize
window.addEventListener('resize', () => {
    canvasHeight = Math.floor((window.innerHeight - 100) / 14) * 14;
    canvasWidth = Math.floor(canvasHeight * 16 / 14);
    columns = Math.floor(canvasWidth / grid);
    rows = Math.floor(canvasHeight / grid);
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
});
